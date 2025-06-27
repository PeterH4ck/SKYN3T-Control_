import { BankAdapter, PaymentGateway } from '../types/bank.types';
import { BancoEstadoAdapter } from '../banks/bancoEstado.adapter';
import { SantanderAdapter } from '../banks/santander.adapter';
import { PayPalGateway } from '../gateways/paypal.gateway';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

type PaymentProvider = BankAdapter | PaymentGateway;

class ProviderService {
  private providers: Map<string, PaymentProvider> = new Map();
  private initialized: boolean = false;

  // Initialize all payment providers
  async initializePaymentProviders(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('Initializing payment providers...');

      // Initialize Chilean bank adapters
      await this.initializeBankAdapters();

      // Initialize international gateways
      await this.initializeGateways();

      // Run health checks
      await this.healthCheckAll();

      this.initialized = true;
      logger.info('Payment providers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize payment providers:', error);
      throw error;
    }
  }

  private async initializeBankAdapters(): Promise<void> {
    // Banco Estado
    try {
      const bancoEstado = new BancoEstadoAdapter();
      this.providers.set('banco_estado', bancoEstado);
      logger.info('Banco Estado adapter initialized');
    } catch (error) {
      logger.error('Failed to initialize Banco Estado:', error);
    }

    // Santander
    try {
      const santander = new SantanderAdapter();
      this.providers.set('santander', santander);
      logger.info('Santander adapter initialized');
    } catch (error) {
      logger.error('Failed to initialize Santander:', error);
    }

    // TODO: Initialize other bank adapters
    // - BCI
    // - Banco de Chile
    // - Scotiabank
  }

  private async initializeGateways(): Promise<void> {
    // PayPal
    try {
      const paypal = new PayPalGateway();
      this.providers.set('paypal', paypal);
      logger.info('PayPal gateway initialized');
    } catch (error) {
      logger.error('Failed to initialize PayPal:', error);
    }

    // TODO: Initialize other gateways
    // - MercadoPago
    // - Stripe
  }

  // Get provider by name
  getProvider(name: string): PaymentProvider {
    const provider = this.providers.get(name);
    
    if (!provider) {
      throw new AppError(
        `Payment provider '${name}' not found or not initialized`,
        400,
        'INVALID_PROVIDER'
      );
    }

    return provider;
  }

  // Check if provider is available
  isProviderAvailable(name: string): boolean {
    return this.providers.has(name);
  }

  // Get list of available providers
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // Get provider info
  async getProviderInfo(name: string): Promise<any> {
    const cacheKey = `provider:info:${name}`;
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const provider = this.getProvider(name);
    
    const info = {
      name,
      available: true,
      type: this.isBank(name) ? 'bank' : 'gateway',
      supportedCurrencies: this.getSupportedCurrencies(name),
      supportedMethods: await this.getProviderMethods(name),
      features: this.getProviderFeatures(name),
    };

    // Cache for 1 hour
    await cache.set(cacheKey, info, 3600);

    return info;
  }

  // Get all providers info
  async getAllProvidersInfo(): Promise<any[]> {
    const providers = this.getAvailableProviders();
    return Promise.all(providers.map(name => this.getProviderInfo(name)));
  }

  // Health check for specific provider
  async healthCheck(name: string): Promise<boolean> {
    try {
      const provider = this.getProvider(name);
      
      if ('healthCheck' in provider) {
        return await provider.healthCheck();
      }
      
      // If no health check method, assume healthy
      return true;
    } catch (error) {
      logger.error(`Health check failed for ${name}:`, error);
      return false;
    }
  }

  // Health check all providers
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers) {
      results[name] = await this.healthCheck(name);
    }

    // Cache health status
    await cache.set('providers:health', results, 60); // 1 minute

    return results;
  }

  // Get provider payment methods
  private async getProviderMethods(name: string): Promise<string[]> {
    try {
      const provider = this.getProvider(name);
      
      if ('getPaymentMethods' in provider) {
        const methods = await provider.getPaymentMethods();
        return methods.map((m: any) => m.code || m.name || m);
      }

      // Default methods based on provider type
      return this.getDefaultMethods(name);
    } catch (error) {
      logger.error(`Failed to get payment methods for ${name}:`, error);
      return this.getDefaultMethods(name);
    }
  }

  // Check if provider is a bank
  private isBank(name: string): boolean {
    const banks = [
      'banco_estado',
      'santander',
      'bci',
      'banco_chile',
      'scotiabank'
    ];
    return banks.includes(name);
  }

  // Get supported currencies for provider
  private getSupportedCurrencies(name: string): string[] {
    if (this.isBank(name)) {
      return ['CLP']; // Chilean banks only support CLP
    }

    // International gateways
    switch (name) {
      case 'paypal':
        return ['USD', 'EUR', 'CLP', 'MXN', 'BRL', 'ARS'];
      case 'mercadopago':
        return ['CLP', 'ARS', 'BRL', 'MXN', 'UYU', 'PEN', 'COP'];
      case 'stripe':
        return ['USD', 'EUR', 'CLP', 'MXN', 'BRL', 'ARS', 'PEN'];
      default:
        return ['CLP'];
    }
  }

  // Get default payment methods
  private getDefaultMethods(name: string): string[] {
    if (this.isBank(name)) {
      return ['BANK_TRANSFER', 'WEBPAY'];
    }

    switch (name) {
      case 'paypal':
        return ['PAYPAL', 'CREDIT_CARD', 'DEBIT_CARD'];
      case 'mercadopago':
        return ['MERCADOPAGO', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER'];
      case 'stripe':
        return ['CREDIT_CARD', 'DEBIT_CARD'];
      default:
        return ['CREDIT_CARD', 'DEBIT_CARD'];
    }
  }

  // Get provider features
  private getProviderFeatures(name: string): string[] {
    const features = ['payments'];

    // All providers support refunds
    features.push('refunds');

    // Bank-specific features
    if (this.isBank(name)) {
      features.push('bank_transfer', 'account_validation');
    }

    // Gateway-specific features
    switch (name) {
      case 'paypal':
        features.push('recurring', 'subscriptions', 'instant_payment');
        break;
      case 'mercadopago':
        features.push('installments', 'qr_code', 'cash_payment');
        break;
      case 'stripe':
        features.push('recurring', 'subscriptions', 'saved_cards', '3d_secure');
        break;
    }

    return features;
  }

  // Validate provider configuration
  async validateProviderConfig(name: string): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    try {
      const provider = this.getProvider(name);
      
      // Test health check
      const healthy = await this.healthCheck(name);
      if (!healthy) {
        errors.push('Provider health check failed');
      }

      // Test basic operations if healthy
      if (healthy && 'getPaymentMethods' in provider) {
        try {
          await provider.getPaymentMethods();
        } catch (error) {
          errors.push('Failed to fetch payment methods');
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Provider initialization failed: ${(error as Error).message}`],
      };
    }
  }

  // Get provider statistics
  async getProviderStats(name: string): Promise<any> {
    // This would typically query from database
    // For now, return mock stats
    return {
      provider: name,
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      totalAmount: 0,
      averageAmount: 0,
      lastTransaction: null,
      uptime: 100,
    };
  }
}

export const providerService = new ProviderService();

// Export initialization function
export const initializePaymentProviders = () => providerService.initializePaymentProviders();