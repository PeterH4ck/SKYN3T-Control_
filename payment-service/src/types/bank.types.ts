// Bank adapter interfaces and types

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  UNKNOWN = 'UNKNOWN'
}

export enum PaymentMethod {
  DEBIT_CARD = 'DEBIT_CARD',
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  WEBPAY = 'WEBPAY',
  SERVIPAG = 'SERVIPAG',
  MULTICAJA = 'MULTICAJA',
  PAYPAL = 'PAYPAL',
  MERCADOPAGO = 'MERCADOPAGO',
  STRIPE = 'STRIPE'
}

export enum Currency {
  CLP = 'CLP',
  USD = 'USD',
  EUR = 'EUR'
}

export enum BankAccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  VISTA = 'VISTA',
  CORRIENTE = 'CORRIENTE'
}

export interface PaymentRequest {
  transactionId: string;
  amount: number;
  currency: Currency;
  description: string;
  customerEmail: string;
  customerName: string;
  customerRut?: string; // Chilean RUT
  customerPhone?: string;
  callbackUrl: string;
  successUrl?: string;
  failureUrl?: string;
  paymentMethod?: PaymentMethod;
  installments?: number;
  metadata?: Record<string, any>;
}

export interface PaymentResponse {
  transactionId: string;
  bankTransactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  authorizationCode?: string;
  redirectUrl?: string;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface RefundRequest {
  originalTransactionId: string;
  refundTransactionId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, any>;
}

export interface RefundResponse {
  refundTransactionId: string;
  bankRefundId: string;
  originalTransactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface TransactionQuery {
  transactionId?: string;
  bankTransactionId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface TransactionResponse {
  transactionId: string;
  bankTransactionId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  authorizationCode?: string;
  paymentMethod?: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, any>;
  refunds?: RefundResponse[];
  rawResponse?: any;
}

export interface BankAccountValidation {
  accountNumber: string;
  accountType: BankAccountType;
  bankCode?: string;
  rut: string;
  name: string;
}

export interface BankTransferRequest {
  fromAccount?: string;
  toAccount: string;
  toBankCode: string;
  amount: number;
  currency: Currency;
  description: string;
  recipientName: string;
  recipientRut: string;
  recipientEmail?: string;
  metadata?: Record<string, any>;
}

export interface BankTransferResponse {
  transferId: string;
  bankTransferId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  timestamp: Date;
  rawResponse?: any;
}

export interface WebhookPayload {
  event: string;
  transactionId: string;
  bankTransactionId: string;
  status: string;
  amount: number;
  currency: string;
  timestamp: string;
  signature: string;
  metadata?: Record<string, any>;
}

export interface BankAdapter {
  // Payment operations
  processPayment(request: PaymentRequest): Promise<PaymentResponse>;
  confirmPayment(transactionId: string): Promise<PaymentResponse>;
  cancelPayment(transactionId: string): Promise<PaymentResponse>;
  
  // Refund operations
  refundPayment(request: RefundRequest): Promise<RefundResponse>;
  
  // Query operations
  getTransaction(query: TransactionQuery): Promise<TransactionResponse>;
  
  // Validation operations
  validateBankAccount(account: BankAccountValidation): Promise<boolean>;
  
  // Utility operations
  getPaymentMethods(): Promise<any[]>;
  healthCheck(): Promise<boolean>;
}

export interface PaymentGateway {
  // Payment operations
  createPayment(request: PaymentRequest): Promise<PaymentResponse>;
  capturePayment(transactionId: string, amount?: number): Promise<PaymentResponse>;
  cancelPayment(transactionId: string): Promise<PaymentResponse>;
  
  // Refund operations
  refundPayment(request: RefundRequest): Promise<RefundResponse>;
  
  // Query operations
  getPayment(transactionId: string): Promise<TransactionResponse>;
  listPayments(query: TransactionQuery): Promise<TransactionResponse[]>;
  
  // Webhook operations
  validateWebhook(payload: any, signature: string): boolean;
  processWebhook(payload: WebhookPayload): Promise<void>;
  
  // Utility operations
  healthCheck(): Promise<boolean>;
}

// Common error types
export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class BankConnectionError extends PaymentError {
  constructor(message: string, bankName: string, details?: any) {
    super(message, 'BANK_CONNECTION_ERROR', 503, details);
    this.name = 'BankConnectionError';
  }
}

export class InvalidPaymentError extends PaymentError {
  constructor(message: string, details?: any) {
    super(message, 'INVALID_PAYMENT', 400, details);
    this.name = 'InvalidPaymentError';
  }
}

export class PaymentDeclinedError extends PaymentError {
  constructor(message: string, reason: string, details?: any) {
    super(message, 'PAYMENT_DECLINED', 402, { reason, ...details });
    this.name = 'PaymentDeclinedError';
  }
}