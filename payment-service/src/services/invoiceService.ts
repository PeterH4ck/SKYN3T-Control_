import { Payment } from '../models/Payment';
import { InvoiceData, PaymentItem } from '../types/gateway.types';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { js2xml, xml2js } from 'xml-js';
import axios from 'axios';
import forge from 'node-forge';
import fs from 'fs/promises';
import path from 'path';

/**
 * Servicio de Facturación Electrónica para Chile (SII)
 * Genera documentos tributarios electrónicos (DTE)
 */
export class InvoiceService {
  private rutEmisor: string;
  private razonSocial: string;
  private giroEmisor: string;
  private actividadEconomica: number;
  private direccionOrigen: string;
  private comunaOrigen: string;
  private certificatePath: string;
  private certificatePassword: string;
  private environment: 'certificacion' | 'produccion';
  private folios: Map<number, { desde: number; hasta: number; actual: number }>;

  constructor() {
    // Configuración del emisor (comunidad/empresa)
    this.rutEmisor = process.env.SII_RUT_EMISOR || '';
    this.razonSocial = process.env.SII_RAZON_SOCIAL || '';
    this.giroEmisor = process.env.SII_GIRO || 'ADMINISTRACION DE CONDOMINIOS';
    this.actividadEconomica = parseInt(process.env.SII_ACTIVIDAD || '702000');
    this.direccionOrigen = process.env.SII_DIRECCION || '';
    this.comunaOrigen = process.env.SII_COMUNA || '';
    
    // Certificado digital
    this.certificatePath = process.env.SII_CERT_PATH || '';
    this.certificatePassword = process.env.SII_CERT_PASSWORD || '';
    
    // Ambiente
    this.environment = (process.env.SII_ENVIRONMENT as 'certificacion' | 'produccion') || 'certificacion';
    
    // Folios disponibles por tipo de documento
    this.folios = new Map();
    this.initializeFolios();

    logger.info('[InvoiceService] Servicio inicializado', {
      rutEmisor: this.rutEmisor,
      environment: this.environment
    });
  }

  /**
   * Generar factura electrónica
   */
  async generateInvoice(data: {
    paymentId: string;
    customerId: string;
    customerRut: string;
    customerName: string;
    customerAddress: string;
    customerEmail: string;
    items: PaymentItem[];
    communityId: string;
    unitId?: string;
    paymentDate: Date;
    metadata?: any;
  }): Promise<{
    invoiceId: string;
    invoiceNumber: number;
    documentType: number;
    pdfUrl: string;
    xmlUrl: string;
    tedCode: string;
    siiTrackId?: string;
  }> {
    try {
      logger.info('[InvoiceService] Generando factura electrónica', {
        paymentId: data.paymentId,
        customerRut: data.customerRut
      });

      // 1. Obtener folio para factura
      const tipoDocumento = 33; // Factura Electrónica
      const folio = await this.getNextFolio(tipoDocumento);

      // 2. Calcular totales
      const totals = this.calculateTotals(data.items);

      // 3. Generar estructura del DTE
      const dte = this.buildDTE({
        tipoDocumento,
        folio,
        fechaEmision: data.paymentDate,
        receptor: {
          rut: data.customerRut,
          razonSocial: data.customerName,
          direccion: data.customerAddress,
          comuna: data.customerAddress.split(',').pop()?.trim() || 'SANTIAGO'
        },
        items: data.items,
        totals,
        referencias: [{
          tipoDocumento: 801, // Orden de compra
          folio: data.paymentId,
          fecha: data.paymentDate
        }]
      });

      // 4. Firmar el DTE
      const dteSigned = await this.signDTE(dte);

      // 5. Generar TED (Timbre Electrónico)
      const ted = this.generateTED(dteSigned);

      // 6. Generar PDF
      const pdfPath = await this.generatePDF({
        dte: dteSigned,
        ted,
        folio,
        customerEmail: data.customerEmail
      });

      // 7. Generar XML para envío
      const xmlPath = await this.generateXML(dteSigned);

      // 8. Enviar al SII (si está en producción)
      let siiTrackId: string | undefined;
      if (this.environment === 'produccion') {
        siiTrackId = await this.sendToSII(dteSigned);
      }

      // 9. Guardar registro en base de datos
      const invoiceId = uuidv4();
      await this.saveInvoiceRecord({
        invoiceId,
        paymentId: data.paymentId,
        communityId: data.communityId,
        customerId: data.customerId,
        invoiceNumber: folio,
        documentType: tipoDocumento,
        amount: totals.total,
        tax: totals.iva,
        pdfPath,
        xmlPath,
        ted: ted.barcode,
        siiTrackId,
        status: siiTrackId ? 'sent' : 'generated',
        metadata: {
          ...data.metadata,
          unitId: data.unitId,
          environment: this.environment
        }
      });

      logger.info('[InvoiceService] Factura generada exitosamente', {
        invoiceId,
        folio,
        siiTrackId
      });

      return {
        invoiceId,
        invoiceNumber: folio,
        documentType: tipoDocumento,
        pdfUrl: `/api/v1/invoices/${invoiceId}/pdf`,
        xmlUrl: `/api/v1/invoices/${invoiceId}/xml`,
        tedCode: ted.barcode,
        siiTrackId
      };
    } catch (error: any) {
      logger.error('[InvoiceService] Error generando factura', {
        error: error.message,
        paymentId: data.paymentId
      });
      throw error;
    }
  }

  /**
   * Generar nota de crédito electrónica
   */
  async generateCreditNote(data: {
    originalInvoiceId: string;
    reason: string;
    items: PaymentItem[];
    customerId: string;
    customerRut: string;
    customerName: string;
    customerAddress: string;
    customerEmail: string;
    metadata?: any;
  }): Promise<{
    creditNoteId: string;
    creditNoteNumber: number;
    documentType: number;
    pdfUrl: string;
    xmlUrl: string;
    tedCode: string;
    siiTrackId?: string;
  }> {
    try {
      logger.info('[InvoiceService] Generando nota de crédito', {
        originalInvoiceId: data.originalInvoiceId,
        reason: data.reason
      });

      // 1. Obtener factura original
      const originalInvoice = await this.getInvoiceById(data.originalInvoiceId);
      if (!originalInvoice) {
        throw new AppError('Factura original no encontrada', 404);
      }

      // 2. Obtener folio para nota de crédito
      const tipoDocumento = 61; // Nota de Crédito Electrónica
      const folio = await this.getNextFolio(tipoDocumento);

      // 3. Calcular totales
      const totals = this.calculateTotals(data.items);

      // 4. Generar DTE con referencia a factura original
      const dte = this.buildDTE({
        tipoDocumento,
        folio,
        fechaEmision: new Date(),
        receptor: {
          rut: data.customerRut,
          razonSocial: data.customerName,
          direccion: data.customerAddress,
          comuna: data.customerAddress.split(',').pop()?.trim() || 'SANTIAGO'
        },
        items: data.items,
        totals,
        referencias: [{
          tipoDocumento: originalInvoice.documentType,
          folio: originalInvoice.invoiceNumber,
          fecha: originalInvoice.createdAt,
          razon: data.reason,
          codRef: 1 // Anula documento de referencia
        }]
      });

      // 5. Firmar y procesar igual que factura
      const dteSigned = await this.signDTE(dte);
      const ted = this.generateTED(dteSigned);
      const pdfPath = await this.generatePDF({
        dte: dteSigned,
        ted,
        folio,
        customerEmail: data.customerEmail,
        documentTitle: 'NOTA DE CRÉDITO ELECTRÓNICA'
      });
      const xmlPath = await this.generateXML(dteSigned);

      // 6. Enviar al SII si corresponde
      let siiTrackId: string | undefined;
      if (this.environment === 'produccion') {
        siiTrackId = await this.sendToSII(dteSigned);
      }

      // 7. Guardar registro
      const creditNoteId = uuidv4();
      await this.saveInvoiceRecord({
        invoiceId: creditNoteId,
        paymentId: originalInvoice.paymentId,
        communityId: originalInvoice.communityId,
        customerId: data.customerId,
        invoiceNumber: folio,
        documentType: tipoDocumento,
        amount: -totals.total, // Negativo por ser crédito
        tax: -totals.iva,
        pdfPath,
        xmlPath,
        ted: ted.barcode,
        siiTrackId,
        status: siiTrackId ? 'sent' : 'generated',
        metadata: {
          ...data.metadata,
          originalInvoiceId: data.originalInvoiceId,
          creditReason: data.reason,
          environment: this.environment
        }
      });

      logger.info('[InvoiceService] Nota de crédito generada', {
        creditNoteId,
        folio,
        originalInvoiceId: data.originalInvoiceId
      });

      return {
        creditNoteId,
        creditNoteNumber: folio,
        documentType: tipoDocumento,
        pdfUrl: `/api/v1/invoices/${creditNoteId}/pdf`,
        xmlUrl: `/api/v1/invoices/${creditNoteId}/xml`,
        tedCode: ted.barcode,
        siiTrackId
      };
    } catch (error: any) {
      logger.error('[InvoiceService] Error generando nota de crédito', {
        error: error.message,
        originalInvoiceId: data.originalInvoiceId
      });
      throw error;
    }
  }

  /**
   * Construir estructura del DTE
   */
  private buildDTE(data: {
    tipoDocumento: number;
    folio: number;
    fechaEmision: Date;
    receptor: {
      rut: string;
      razonSocial: string;
      direccion: string;
      comuna: string;
    };
    items: PaymentItem[];
    totals: {
      neto: number;
      iva: number;
      total: number;
    };
    referencias?: Array<{
      tipoDocumento: number;
      folio: string | number;
      fecha: Date;
      razon?: string;
      codRef?: number;
    }>;
  }): any {
    const dte = {
      DTE: {
        _attributes: {
          xmlns: 'http://www.sii.cl/SiiDte',
          version: '1.0'
        },
        Documento: {
          _attributes: {
            ID: `DOC${data.folio}`
          },
          Encabezado: {
            IdDoc: {
              TipoDTE: data.tipoDocumento,
              Folio: data.folio,
              FchEmis: this.formatDate(data.fechaEmision),
              TpoTranCompra: 1,
              TpoTranVenta: 1,
              FmaPago: 1
            },
            Emisor: {
              RUTEmisor: this.rutEmisor,
              RznSoc: this.razonSocial,
              GiroEmis: this.giroEmisor,
              Acteco: this.actividadEconomica,
              DirOrigen: this.direccionOrigen,
              CmnaOrigen: this.comunaOrigen
            },
            Receptor: {
              RUTRecep: data.receptor.rut,
              RznSocRecep: data.receptor.razonSocial.substring(0, 100),
              DirRecep: data.receptor.direccion.substring(0, 70),
              CmnaRecep: data.receptor.comuna.substring(0, 20)
            },
            Totales: {
              MntNeto: data.totals.neto,
              TasaIVA: 19,
              IVA: data.totals.iva,
              MntTotal: data.totals.total
            }
          },
          Detalle: data.items.map((item, index) => ({
            NroLinDet: index + 1,
            NmbItem: item.name.substring(0, 80),
            DscItem: item.description?.substring(0, 1000),
            QtyItem: item.quantity,
            UnmdItem: 'UN',
            PrcItem: Math.round(item.unitPrice / 1.19), // Precio neto
            MontoItem: Math.round(item.totalPrice / 1.19) // Monto neto
          }))
        }
      }
    };

    // Agregar referencias si existen
    if (data.referencias && data.referencias.length > 0) {
      dte.DTE.Documento.Referencia = data.referencias.map((ref, index) => ({
        NroLinRef: index + 1,
        TpoDocRef: ref.tipoDocumento,
        FolioRef: ref.folio.toString(),
        FchRef: this.formatDate(ref.fecha),
        RazonRef: ref.razon?.substring(0, 90),
        CodRef: ref.codRef
      }));
    }

    return dte;
  }

  /**
   * Firmar DTE con certificado digital
   */
  private async signDTE(dte: any): Promise<any> {
    try {
      // Leer certificado
      const certBuffer = await fs.readFile(this.certificatePath);
      const p12Asn1 = forge.asn1.fromDer(certBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, this.certificatePassword);

      // Extraer clave privada y certificado
      const bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag = bags[forge.pki.oids.pkcs8ShroudedKeyBag]![0];
      const privateKey = keyBag.key;

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = certBags[forge.pki.oids.certBag]![0];
      const certificate = certBag.cert;

      if (!privateKey || !certificate) {
        throw new Error('No se pudo extraer la clave privada o certificado');
      }

      // Convertir DTE a XML
      const dteXml = js2xml(dte, { compact: true, spaces: 2 });

      // Crear firma digital
      const md = forge.md.sha1.create();
      md.update(dteXml, 'utf8');
      const signature = privateKey.sign(md);

      // Agregar firma al DTE
      const signedDTE = {
        ...dte,
        DTE: {
          ...dte.DTE,
          Signature: {
            _attributes: {
              xmlns: 'http://www.w3.org/2000/09/xmldsig#'
            },
            SignedInfo: {
              CanonicalizationMethod: {
                _attributes: {
                  Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
                }
              },
              SignatureMethod: {
                _attributes: {
                  Algorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
                }
              },
              Reference: {
                _attributes: {
                  URI: `#DOC${dte.DTE.Documento._attributes.ID}`
                },
                DigestMethod: {
                  _attributes: {
                    Algorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
                  }
                },
                DigestValue: forge.util.encode64(md.digest().bytes())
              }
            },
            SignatureValue: forge.util.encode64(signature),
            KeyInfo: {
              X509Data: {
                X509Certificate: forge.util.encode64(
                  forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).bytes()
                )
              }
            }
          }
        }
      };

      return signedDTE;
    } catch (error: any) {
      logger.error('[InvoiceService] Error firmando DTE', {
        error: error.message
      });
      throw new AppError('Error firmando documento tributario', 500);
    }
  }

  /**
   * Generar Timbre Electrónico (TED)
   */
  private generateTED(dte: any): { xml: string; barcode: string } {
    const documento = dte.DTE.Documento;
    const ted = {
      TED: {
        _attributes: {
          version: '1.0'
        },
        DD: {
          RE: this.rutEmisor,
          TD: documento.Encabezado.IdDoc.TipoDTE,
          F: documento.Encabezado.IdDoc.Folio,
          FE: documento.Encabezado.IdDoc.FchEmis,
          RR: documento.Encabezado.Receptor.RUTRecep,
          RSR: documento.Encabezado.Receptor.RznSocRecep.substring(0, 40),
          MNT: documento.Encabezado.Totales.MntTotal,
          IT1: documento.Detalle[0].NmbItem.substring(0, 40),
          CAF: {
            _attributes: {
              version: '1.0'
            },
            DA: {
              RE: this.rutEmisor,
              RS: this.razonSocial.substring(0, 40),
              TD: documento.Encabezado.IdDoc.TipoDTE,
              RNG: {
                D: this.folios.get(documento.Encabezado.IdDoc.TipoDTE)?.desde,
                H: this.folios.get(documento.Encabezado.IdDoc.TipoDTE)?.hasta
              },
              FA: this.formatDate(new Date()),
              RSAPK: {
                M: 'MOCK_MODULUS', // En producción viene del CAF del SII
                E: 'AQAB'
              },
              IDK: 100
            }
          },
          TSTED: new Date().toISOString()
        }
      }
    };

    const tedXml = js2xml(ted, { compact: true });
    
    // Generar código de barras PDF417
    const barcodeData = `${ted.TED.DD.RE}|${ted.TED.DD.TD}|${ted.TED.DD.F}|${ted.TED.DD.RR}|${ted.TED.DD.MNT}|${ted.TED.DD.FE}`;
    
    return {
      xml: tedXml,
      barcode: Buffer.from(barcodeData).toString('base64')
    };
  }

  /**
   * Generar PDF del documento
   */
  private async generatePDF(data: {
    dte: any;
    ted: { xml: string; barcode: string };
    folio: number;
    customerEmail: string;
    documentTitle?: string;
  }): Promise<string> {
    try {
      // Por simplicidad, guardamos una versión HTML
      // En producción se usaría una librería como puppeteer o wkhtmltopdf
      
      const html = this.generateHTMLInvoice(data);
      const fileName = `${data.documentTitle?.replace(/\s+/g, '_') || 'FACTURA'}_${data.folio}.html`;
      const filePath = path.join(process.env.INVOICES_PATH || './invoices', fileName);
      
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, html);

      // Enviar por email si está configurado
      if (data.customerEmail) {
        // Aquí se integraría con el servicio de email
        logger.info('[InvoiceService] PDF listo para enviar por email', {
          email: data.customerEmail,
          fileName
        });
      }

      return filePath;
    } catch (error: any) {
      logger.error('[InvoiceService] Error generando PDF', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generar HTML de la factura
   */
  private generateHTMLInvoice(data: any): string {
    const doc = data.dte.DTE.Documento;
    const title = data.documentTitle || 'FACTURA ELECTRÓNICA';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title} N° ${data.folio}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { border: 2px solid red; padding: 10px; text-align: center; }
    .emisor { margin: 20px 0; }
    .receptor { margin: 20px 0; background: #f0f0f0; padding: 10px; }
    .items { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .items th, .items td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .totales { text-align: right; margin: 20px 0; }
    .ted { border: 1px solid #000; padding: 10px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h2>${this.razonSocial}</h2>
    <p>RUT: ${this.rutEmisor}</p>
    <h3>${title}</h3>
    <h3>N° ${data.folio}</h3>
  </div>

  <div class="emisor">
    <p><strong>Giro:</strong> ${this.giroEmisor}</p>
    <p><strong>Dirección:</strong> ${this.direccionOrigen}, ${this.comunaOrigen}</p>
    <p><strong>Fecha:</strong> ${doc.Encabezado.IdDoc.FchEmis}</p>
  </div>

  <div class="receptor">
    <h4>DATOS DEL RECEPTOR</h4>
    <p><strong>Razón Social:</strong> ${doc.Encabezado.Receptor.RznSocRecep}</p>
    <p><strong>RUT:</strong> ${doc.Encabezado.Receptor.RUTRecep}</p>
    <p><strong>Dirección:</strong> ${doc.Encabezado.Receptor.DirRecep}</p>
    <p><strong>Comuna:</strong> ${doc.Encabezado.Receptor.CmnaRecep}</p>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Cantidad</th>
        <th>Descripción</th>
        <th>P. Unitario</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${doc.Detalle.map((item: any) => `
        <tr>
          <td>${item.QtyItem}</td>
          <td>${item.NmbItem}</td>
          <td>$${this.formatNumber(item.PrcItem)}</td>
          <td>$${this.formatNumber(item.MontoItem)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totales">
    <p><strong>Neto:</strong> $${this.formatNumber(doc.Encabezado.Totales.MntNeto)}</p>
    <p><strong>IVA (19%):</strong> $${this.formatNumber(doc.Encabezado.Totales.IVA)}</p>
    <h3><strong>TOTAL:</strong> $${this.formatNumber(doc.Encabezado.Totales.MntTotal)}</h3>
  </div>

  <div class="ted">
    <h4>Timbre Electrónico</h4>
    <p style="font-size: 10px;">
      Resolución Nro. 80 del 22-08-2014<br>
      Verifique documento en www.sii.cl
    </p>
    <div style="text-align: center;">
      <img src="data:image/png;base64,${data.ted.barcode}" alt="Código de barras" />
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generar archivo XML
   */
  private async generateXML(dte: any): Promise<string> {
    try {
      const xml = js2xml(dte, { 
        compact: true, 
        spaces: 2,
        declaration: { encoding: 'ISO-8859-1' }
      });

      const fileName = `DTE_${dte.DTE.Documento.Encabezado.IdDoc.TipoDTE}_${dte.DTE.Documento.Encabezado.IdDoc.Folio}.xml`;
      const filePath = path.join(process.env.INVOICES_PATH || './invoices', 'xml', fileName);
      
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, xml);

      return filePath;
    } catch (error: any) {
      logger.error('[InvoiceService] Error generando XML', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enviar DTE al SII
   */
  private async sendToSII(dte: any): Promise<string> {
    try {
      const url = this.environment === 'produccion'
        ? 'https://palena.sii.cl/cgi_dte/UPL/DTEUpload'
        : 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload';

      // Obtener token de autenticación
      const token = await this.getSIIToken();

      // Crear envío
      const envio = {
        SetDTE: {
          _attributes: {
            xmlns: 'http://www.sii.cl/SiiDte',
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            version: '1.0'
          },
          Caratula: {
            _attributes: {
              version: '1.0'
            },
            RutEmisor: this.rutEmisor,
            RutEnvia: this.rutEmisor, // En producción sería el RUT del representante
            RutReceptor: dte.DTE.Documento.Encabezado.Receptor.RUTRecep,
            FchResol: '2014-08-22',
            NroResol: 80,
            TmstFirmaEnv: new Date().toISOString(),
            SubTotDTE: {
              TpoDTE: dte.DTE.Documento.Encabezado.IdDoc.TipoDTE,
              NroDTE: 1
            }
          },
          DTE: dte.DTE
        }
      };

      const envioXml = js2xml(envio, { compact: true });

      // Enviar al SII
      const response = await axios.post(url, envioXml, {
        headers: {
          'Content-Type': 'text/xml',
          'Accept': 'application/xml',
          'Cookie': `TOKEN=${token}`
        }
      });

      // Parsear respuesta
      const responseData = xml2js(response.data, { compact: true });
      const trackId = responseData.RECEPCIONDTE?.TRACKID?._text;

      if (!trackId) {
        throw new Error('No se recibió TrackID del SII');
      }

      logger.info('[InvoiceService] DTE enviado al SII', {
        trackId,
        environment: this.environment
      });

      return trackId;
    } catch (error: any) {
      logger.error('[InvoiceService] Error enviando al SII', {
        error: error.message,
        response: error.response?.data
      });
      throw new AppError('Error enviando documento al SII', 500);
    }
  }

  /**
   * Obtener token del SII
   */
  private async getSIIToken(): Promise<string> {
    // En producción, esto requiere autenticación con certificado
    // Por ahora retornamos un token mock
    return 'MOCK_TOKEN_' + Date.now();
  }

  /**
   * Inicializar folios disponibles
   */
  private initializeFolios(): void {
    // En producción, estos folios se obtienen del SII
    // mediante archivos CAF (Código de Autorización de Folios)
    
    this.folios.set(33, { // Factura Electrónica
      desde: parseInt(process.env.SII_FOLIO_FACTURA_DESDE || '1000'),
      hasta: parseInt(process.env.SII_FOLIO_FACTURA_HASTA || '2000'),
      actual: parseInt(process.env.SII_FOLIO_FACTURA_ACTUAL || '1000')
    });

    this.folios.set(61, { // Nota de Crédito
      desde: parseInt(process.env.SII_FOLIO_NC_DESDE || '2001'),
      hasta: parseInt(process.env.SII_FOLIO_NC_HASTA || '3000'),
      actual: parseInt(process.env.SII_FOLIO_NC_ACTUAL || '2001')
    });

    this.folios.set(39, { // Boleta Electrónica
      desde: parseInt(process.env.SII_FOLIO_BOLETA_DESDE || '3001'),
      hasta: parseInt(process.env.SII_FOLIO_BOLETA_HASTA || '4000'),
      actual: parseInt(process.env.SII_FOLIO_BOLETA_ACTUAL || '3001')
    });
  }

  /**
   * Obtener siguiente folio disponible
   */
  private async getNextFolio(tipoDocumento: number): Promise<number> {
    const folioInfo = this.folios.get(tipoDocumento);
    
    if (!folioInfo) {
      throw new AppError(`No hay folios configurados para tipo ${tipoDocumento}`, 500);
    }

    if (folioInfo.actual > folioInfo.hasta) {
      throw new AppError(`Folios agotados para tipo ${tipoDocumento}`, 500);
    }

    const folio = folioInfo.actual;
    folioInfo.actual++;
    
    // En producción, se persistiría este cambio
    this.folios.set(tipoDocumento, folioInfo);

    return folio;
  }

  /**
   * Calcular totales con IVA
   */
  private calculateTotals(items: PaymentItem[]): {
    neto: number;
    iva: number;
    total: number;
  } {
    const total = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const neto = Math.round(total / 1.19);
    const iva = total - neto;

    return { neto, iva, total };
  }

  /**
   * Formatear fecha para SII
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formatear número con separadores de miles
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('es-CL');
  }

  /**
   * Guardar registro de factura en BD
   */
  private async saveInvoiceRecord(data: any): Promise<void> {
    await Payment.create({
      id: data.invoiceId,
      community_id: data.communityId,
      user_id: data.customerId,
      amount: data.amount,
      currency: 'CLP',
      status: data.status,
      payment_type: 'invoice',
      gateway_provider: 'sii',
      gateway_transaction_id: data.siiTrackId || data.invoiceNumber.toString(),
      description: `${data.documentType === 33 ? 'Factura' : 'Nota de Crédito'} N° ${data.invoiceNumber}`,
      metadata: {
        ...data.metadata,
        invoiceNumber: data.invoiceNumber,
        documentType: data.documentType,
        pdfPath: data.pdfPath,
        xmlPath: data.xmlPath,
        ted: data.ted,
        tax: data.tax
      },
      processed_at: new Date()
    });
  }

  /**
   * Obtener factura por ID
   */
  private async getInvoiceById(invoiceId: string): Promise<any> {
    return await Payment.findByPk(invoiceId);
  }

  /**
   * Consultar estado de envío en SII
   */
  async checkSIIStatus(trackId: string): Promise<{
    estado: string;
    estadoDetalle: string;
    aceptados: number;
    rechazados: number;
    reparos: number;
  }> {
    try {
      const url = this.environment === 'produccion'
        ? 'https://palena.sii.cl/cgi_dte/UPL/DTEUpload'
        : 'https://maullin.sii.cl/cgi_dte/UPL/DTEUpload';

      const token = await this.getSIIToken();

      const consulta = `
        <CONSULTAESTADODTE>
          <TRACKID>${trackId}</TRACKID>
        </CONSULTAESTADODTE>
      `;

      const response = await axios.post(url, consulta, {
        headers: {
          'Content-Type': 'text/xml',
          'Cookie': `TOKEN=${token}`
        }
      });

      const result = xml2js(response.data, { compact: true });

      return {
        estado: result.CONSULTAESTADODTERESPONSE?.ESTADO?._text || 'DESCONOCIDO',
        estadoDetalle: result.CONSULTAESTADODTERESPONSE?.ESTADODETALLE?._text || '',
        aceptados: parseInt(result.CONSULTAESTADODTERESPONSE?.ACEPTADOS?._text || '0'),
        rechazados: parseInt(result.CONSULTAESTADODTERESPONSE?.RECHAZADOS?._text || '0'),
        reparos: parseInt(result.CONSULTAESTADODTERESPONSE?.REPAROS?._text || '0')
      };
    } catch (error: any) {
      logger.error('[InvoiceService] Error consultando estado SII', {
        error: error.message,
        trackId
      });
      throw error;
    }
  }

  /**
   * Obtener métricas de facturación
   */
  async getInvoiceMetrics(communityId?: string, period?: { from: Date; to: Date }): Promise<{
    totalInvoices: number;
    totalAmount: number;
    totalTax: number;
    averageInvoiceAmount: number;
    invoicesByType: { [key: number]: number };
    invoicesByStatus: { [key: string]: number };
  }> {
    try {
      const where: any = {
        payment_type: 'invoice'
      };

      if (communityId) {
        where.community_id = communityId;
      }

      if (period) {
        where.created_at = {
          [Op.between]: [period.from, period.to]
        };
      }

      const invoices = await Payment.findAll({ where });

      const metrics = {
        totalInvoices: invoices.length,
        totalAmount: 0,
        totalTax: 0,
        averageInvoiceAmount: 0,
        invoicesByType: {} as { [key: number]: number },
        invoicesByStatus: {} as { [key: string]: number }
      };

      invoices.forEach(invoice => {
        metrics.totalAmount += Math.abs(invoice.amount);
        metrics.totalTax += Math.abs(invoice.metadata.tax || 0);

        const docType = invoice.metadata.documentType;
        if (docType) {
          metrics.invoicesByType[docType] = (metrics.invoicesByType[docType] || 0) + 1;
        }

        metrics.invoicesByStatus[invoice.status] = 
          (metrics.invoicesByStatus[invoice.status] || 0) + 1;
      });

      metrics.averageInvoiceAmount = metrics.totalInvoices > 0
        ? metrics.totalAmount / metrics.totalInvoices
        : 0;

      return metrics;
    } catch (error: any) {
      logger.error('[InvoiceService] Error obteniendo métricas', {
        error: error.message,
        communityId
      });
      throw error;
    }
  }
}