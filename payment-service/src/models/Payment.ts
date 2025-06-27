import { 
  Model, 
  DataTypes, 
  Optional, 
  Association, 
  HasManyGetAssociationsMixin,
  HasManyCreateAssociationMixin 
} from 'sequelize';
import sequelize from '../config/database';
import { PaymentStatus, PaymentMethod, Currency } from '../types/bank.types';

// Payment attributes interface
export interface PaymentAttributes {
  id: string;
  transactionId: string;
  bankTransactionId?: string;
  communityId: string;
  userId: string;
  provider: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  description: string;
  paymentMethod?: PaymentMethod;
  customerEmail: string;
  customerName: string;
  customerRut?: string;
  customerPhone?: string;
  metadata?: Record<string, any>;
  authorizationCode?: string;
  redirectUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  processedAt?: Date;
  failedAt?: Date;
  refundedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Creation attributes (optional fields for creation)
export interface PaymentCreationAttributes 
  extends Optional<PaymentAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

// Payment model class
export class Payment 
  extends Model<PaymentAttributes, PaymentCreationAttributes> 
  implements PaymentAttributes {
  
  public id!: string;
  public transactionId!: string;
  public bankTransactionId?: string;
  public communityId!: string;
  public userId!: string;
  public provider!: string;
  public status!: PaymentStatus;
  public amount!: number;
  public currency!: Currency;
  public description!: string;
  public paymentMethod?: PaymentMethod;
  public customerEmail!: string;
  public customerName!: string;
  public customerRut?: string;
  public customerPhone?: string;
  public metadata?: Record<string, any>;
  public authorizationCode?: string;
  public redirectUrl?: string;
  public errorCode?: string;
  public errorMessage?: string;
  public processedAt?: Date;
  public failedAt?: Date;
  public refundedAt?: Date;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly refunds?: Refund[];

  // Association helpers
  public getRefunds!: HasManyGetAssociationsMixin<Refund>;
  public createRefund!: HasManyCreateAssociationMixin<Refund>;

  public static associations: {
    refunds: Association<Payment, Refund>;
  };
}

// Initialize the model
Payment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'transaction_id',
    },
    bankTransactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'bank_transaction_id',
    },
    communityId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'community_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['banco_estado', 'santander', 'bci', 'banco_chile', 'scotiabank', 
                'paypal', 'mercadopago', 'stripe']],
      },
    },
    status: {
      type: DataTypes.ENUM(...Object.values(PaymentStatus)),
      allowNull: false,
      defaultValue: PaymentStatus.PENDING,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    currency: {
      type: DataTypes.ENUM(...Object.values(Currency)),
      allowNull: false,
      defaultValue: Currency.CLP,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.ENUM(...Object.values(PaymentMethod)),
      allowNull: true,
      field: 'payment_method',
    },
    customerEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
      field: 'customer_email',
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'customer_name',
    },
    customerRut: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'customer_rut',
    },
    customerPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'customer_phone',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    authorizationCode: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'authorization_code',
    },
    redirectUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'redirect_url',
    },
    errorCode: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'error_code',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'failed_at',
    },
    refundedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'refunded_at',
    },
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['transaction_id'] },
      { fields: ['bank_transaction_id'] },
      { fields: ['community_id'] },
      { fields: ['user_id'] },
      { fields: ['provider'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['community_id', 'status'] },
      { fields: ['user_id', 'status'] },
    ],
  }
);

// Refund model
export interface RefundAttributes {
  id: string;
  paymentId: string;
  refundTransactionId: string;
  bankRefundId?: string;
  amount: number;
  currency: Currency;
  reason: string;
  status: PaymentStatus;
  metadata?: Record<string, any>;
  processedAt?: Date;
  failedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RefundCreationAttributes 
  extends Optional<RefundAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class Refund 
  extends Model<RefundAttributes, RefundCreationAttributes> 
  implements RefundAttributes {
  
  public id!: string;
  public paymentId!: string;
  public refundTransactionId!: string;
  public bankRefundId?: string;
  public amount!: number;
  public currency!: Currency;
  public reason!: string;
  public status!: PaymentStatus;
  public metadata?: Record<string, any>;
  public processedAt?: Date;
  public failedAt?: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  // Associations
  public readonly payment?: Payment;
}

// Initialize Refund model
Refund.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    paymentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'payment_id',
      references: {
        model: Payment,
        key: 'id',
      },
    },
    refundTransactionId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'refund_transaction_id',
    },
    bankRefundId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'bank_refund_id',
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    currency: {
      type: DataTypes.ENUM(...Object.values(Currency)),
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(PaymentStatus)),
      allowNull: false,
      defaultValue: PaymentStatus.PENDING,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
    failedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'failed_at',
    },
  },
  {
    sequelize,
    modelName: 'Refund',
    tableName: 'refunds',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['payment_id'] },
      { fields: ['refund_transaction_id'] },
      { fields: ['bank_refund_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

// Define associations
Payment.hasMany(Refund, {
  foreignKey: 'payment_id',
  as: 'refunds',
});

Refund.belongsTo(Payment, {
  foreignKey: 'payment_id',
  as: 'payment',
});

export default Payment;