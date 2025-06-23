import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import handlebars from 'handlebars';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: any[];
  cc?: string | string[];
  bcc?: string | string[];
}

interface TemplateData {
  [key: string]: any;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();

  constructor() {
    // Configurar transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Cargar plantillas
    this.loadTemplates();
  }

  /**
   * Cargar plantillas de email
   */
  private async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, '../../templates/emails');
      const files = await fs.readdir(templatesDir);

      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          
          this.templates.set(templateName, handlebars.compile(templateContent));
        }
      }

      logger.info(`Loaded ${this.templates.size} email templates`);
    } catch (error) {
      logger.error('Error loading email templates:', error);
    }
  }

  /**
   * Enviar email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const mailOptions = {
        from: `${process.env.SMTP_FROM_NAME || 'SKYN3T'} <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
        cc: options.cc,
        bcc: options.bcc
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject
      });

      return true;
    } catch (error) {
      logger.error('Error sending email:', error);
      return false;
    }
  }

  /**
   * Enviar email usando plantilla
   */
  async sendTemplateEmail(
    to: string | string[],
    templateName: string,
    data: TemplateData,
    subject?: string
  ): Promise<boolean> {
    try {
      const template = this.templates.get(templateName);
      
      if (!template) {
        logger.error(`Email template not found: ${templateName}`);
        return false;
      }

      // Datos base para todas las plantillas
      const baseData = {
        appName: 'SKYN3T',
        appUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
        year: new Date().getFullYear(),
        supportEmail: process.env.SUPPORT_EMAIL || 'support@skyn3t.com',
        ...data
      };

      const html = template(baseData);

      return this.sendEmail({
        to,
        subject: subject || this.getDefaultSubject(templateName),
        html
      });

    } catch (error) {
      logger.error('Error sending template email:', error);
      return false;
    }
  }

  /**
   * Obtener asunto por defecto según plantilla
   */
  private getDefaultSubject(templateName: string): string {
    const subjects: Record<string, string> = {
      welcome: 'Bienvenido a SKYN3T',
      passwordReset: 'Restablecer contraseña - SKYN3T',
      passwordChanged: 'Tu contraseña ha sido cambiada',
      invitation: 'Has recibido una invitación',
      accessGranted: 'Acceso autorizado',
      accessDenied: 'Acceso denegado',
      paymentReminder: 'Recordatorio de pago',
      paymentConfirmation: 'Confirmación de pago',
      maintenanceAlert: 'Alerta de mantenimiento',
      securityAlert: 'Alerta de seguridad'
    };

    return subjects[templateName] || 'Notificación de SKYN3T';
  }

  /**
   * Emails específicos del sistema
   */

  async sendWelcomeEmail(
    email: string,
    fullName: string,
    username: string,
    tempPassword: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'welcome', {
      fullName,
      username,
      tempPassword,
      loginUrl: `${process.env.FRONTEND_URL}/login`
    });
  }

  async sendPasswordResetEmail(
    email: string,
    fullName: string,
    resetUrl: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'passwordReset', {
      fullName,
      resetUrl,
      expiresIn: '1 hora'
    });
  }

  async sendPasswordResetByAdmin(
    email: string,
    fullName: string,
    tempPassword: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'passwordChanged', {
      fullName,
      tempPassword,
      adminReset: true,
      loginUrl: `${process.env.FRONTEND_URL}/login`
    });
  }

  async sendInvitationEmail(
    email: string,
    guestName: string,
    hostName: string,
    communityName: string,
    invitationUrl: string,
    validUntil: Date
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'invitation', {
      guestName,
      hostName,
      communityName,
      invitationUrl,
      validUntil: validUntil.toLocaleString('es-CL'),
      instructions: 'Haz clic en el siguiente enlace para completar tu registro'
    });
  }

  async sendAccessNotification(
    email: string,
    fullName: string,
    accessType: 'granted' | 'denied',
    location: string,
    timestamp: Date,
    reason?: string
  ): Promise<boolean> {
    const template = accessType === 'granted' ? 'accessGranted' : 'accessDenied';
    
    return this.sendTemplateEmail(email, template, {
      fullName,
      location,
      timestamp: timestamp.toLocaleString('es-CL'),
      reason
    });
  }

  async sendPaymentReminder(
    email: string,
    fullName: string,
    amount: number,
    dueDate: Date,
    paymentUrl: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'paymentReminder', {
      fullName,
      amount: amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }),
      dueDate: dueDate.toLocaleDateString('es-CL'),
      paymentUrl,
      daysUntilDue: Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    });
  }

  async sendPaymentConfirmation(
    email: string,
    fullName: string,
    amount: number,
    paymentDate: Date,
    transactionId: string,
    receiptUrl?: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'paymentConfirmation', {
      fullName,
      amount: amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' }),
      paymentDate: paymentDate.toLocaleString('es-CL'),
      transactionId,
      receiptUrl
    });
  }

  async sendMaintenanceAlert(
    emails: string[],
    maintenanceType: string,
    scheduledDate: Date,
    duration: string,
    affectedServices: string[]
  ): Promise<boolean> {
    return this.sendTemplateEmail(emails, 'maintenanceAlert', {
      maintenanceType,
      scheduledDate: scheduledDate.toLocaleString('es-CL'),
      duration,
      affectedServices: affectedServices.join(', ')
    });
  }

  async sendSecurityAlert(
    email: string,
    fullName: string,
    alertType: string,
    description: string,
    timestamp: Date,
    actionRequired?: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(email, 'securityAlert', {
      fullName,
      alertType,
      description,
      timestamp: timestamp.toLocaleString('es-CL'),
      actionRequired
    });
  }

  /**
   * Enviar email masivo con plantilla
   */
  async sendBulkTemplateEmail(
    recipients: Array<{ email: string; data: TemplateData }>,
    templateName: string,
    subject?: string
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // Procesar en lotes para evitar sobrecarga
    const batchSize = 10;
    
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const promises = batch.map(recipient =>
        this.sendTemplateEmail(
          recipient.email,
          templateName,
          recipient.data,
          subject
        )
      );

      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          sent++;
        } else {
          failed++;
        }
      });

      // Pequeña pausa entre lotes
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`Bulk email completed: ${sent} sent, ${failed} failed`);
    
    return { sent, failed };
  }

  /**
   * Verificar configuración de email
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }
}

// Instancia singleton
export const emailService = new EmailService();