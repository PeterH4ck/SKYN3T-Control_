import { Request, Response, NextFunction } from 'express';
import { providerService } from '../services/providerService';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { BankAccountValidation, BankTransferRequest, Currency } from '../types/bank.types';

export const bankController = {
  // Validate bank account
  validateBankAccount: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validation: BankAccountValidation = req.body;
      const bankCode = validation.bankCode || 'banco_estado'; // Default to Banco Estado

      const provider = providerService.getProvider(bankCode);

      if (!('validateBankAccount' in provider)) {
        throw new AppError('Bank does not support account validation', 400);
      }

      const isValid = await provider.validateBankAccount(validation);

      res.json({
        success: true,
        data: {
          valid: isValid,
          bankCode,
          accountNumber: validation.accountNumber.substring(0, 4) + '****',
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get payment methods for a bank
  getPaymentMethods: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { bank = 'all' } = req.query;

      if (bank === 'all') {
        // Get methods for all banks
        const banks = ['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank'];
        const allMethods: Record<string, any[]> = {};

        for (const bankCode of banks) {
          try {
            const provider = providerService.getProvider(bankCode);
            if ('getPaymentMethods' in provider) {
              allMethods[bankCode] = await provider.getPaymentMethods();
            }
          } catch (error) {
            logger.error(`Error getting payment methods for ${bankCode}:`, error);
            allMethods[bankCode] = [];
          }
        }

        res.json({
          success: true,
          data: allMethods,
        });
      } else {
        // Get methods for specific bank
        const provider = providerService.getProvider(bank as string);

        if (!('getPaymentMethods' in provider)) {
          throw new AppError('Provider does not support payment methods query', 400);
        }

        const methods = await provider.getPaymentMethods();

        res.json({
          success: true,
          data: {
            bank,
            methods,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // Initiate bank transfer
  initiateBankTransfer: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const transferRequest: BankTransferRequest = {
        ...req.body,
        currency: req.body.currency || Currency.CLP,
        metadata: {
          ...req.body.metadata,
          initiatedBy: userId,
          initiatedAt: new Date().toISOString(),
        },
      };

      // For now, bank transfers are not directly supported
      // This would typically create a payment with type BANK_TRANSFER
      throw new AppError(
        'Direct bank transfers are not yet implemented. Please use regular payment flow.',
        501,
        'NOT_IMPLEMENTED'
      );
    } catch (error) {
      next(error);
    }
  },

  // Get bank information
  getBankInfo: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { bankCode } = req.params;

      const bankInfo = {
        banco_estado: {
          code: 'banco_estado',
          name: 'Banco Estado',
          fullName: 'Banco del Estado de Chile',
          swift: 'BECHCLRM',
          website: 'https://www.bancoestado.cl',
          supportPhone: '600 200 7000',
          features: ['transfers', 'webpay', 'account_validation'],
        },
        santander: {
          code: 'santander',
          name: 'Santander',
          fullName: 'Banco Santander Chile',
          swift: 'BSCHCLRM',
          website: 'https://www.santander.cl',
          supportPhone: '600 320 3000',
          features: ['transfers', 'webpay', 'account_validation', 'open_banking'],
        },
        bci: {
          code: 'bci',
          name: 'BCI',
          fullName: 'Banco de Crédito e Inversiones',
          swift: 'CREDCLRM',
          website: 'https://www.bci.cl',
          supportPhone: '600 628 1000',
          features: ['transfers', 'webpay', 'transbank'],
        },
        banco_chile: {
          code: 'banco_chile',
          name: 'Banco de Chile',
          fullName: 'Banco de Chile',
          swift: 'BCHICLRM',
          website: 'https://www.bancochile.cl',
          supportPhone: '600 637 3737',
          features: ['transfers', 'webpay', 'account_validation'],
        },
        scotiabank: {
          code: 'scotiabank',
          name: 'Scotiabank',
          fullName: 'Scotiabank Chile',
          swift: 'SCBLCLRM',
          website: 'https://www.scotiabank.cl',
          supportPhone: '600 692 2000',
          features: ['transfers', 'webpay'],
        },
      };

      const info = bankInfo[bankCode as keyof typeof bankInfo];
      
      if (!info) {
        throw AppError.notFound('Bank');
      }

      res.json({
        success: true,
        data: info,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get supported banks
  getSupportedBanks: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const banks = [
        {
          code: 'banco_estado',
          name: 'Banco Estado',
          available: providerService.isProviderAvailable('banco_estado'),
        },
        {
          code: 'santander',
          name: 'Santander',
          available: providerService.isProviderAvailable('santander'),
        },
        {
          code: 'bci',
          name: 'BCI',
          available: providerService.isProviderAvailable('bci'),
        },
        {
          code: 'banco_chile',
          name: 'Banco de Chile',
          available: providerService.isProviderAvailable('banco_chile'),
        },
        {
          code: 'scotiabank',
          name: 'Scotiabank',
          available: providerService.isProviderAvailable('scotiabank'),
        },
      ];

      res.json({
        success: true,
        data: banks,
      });
    } catch (error) {
      next(error);
    }
  },
};