-- Migration: Create payment service tables
-- Version: 001
-- Date: 2024-01-15
-- Description: Initial schema for payment service

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE payment_status AS ENUM (
    'pending',
    'processing',
    'authorized',
    'completed',
    'failed',
    'cancelled',
    'refunded',
    'partially_refunded',
    'disputed',
    'expired'
);

CREATE TYPE payment_type AS ENUM (
    'one_time',
    'recurring',
    'recurring_charge',
    'split_distribution',
    'refund',
    'invoice'
);

CREATE TYPE subscription_status AS ENUM (
    'active',
    'paused',
    'cancelled',
    'pending_cancellation',
    'past_due',
    'trialing',
    'unpaid'
);

CREATE TYPE invoice_status AS ENUM (
    'draft',
    'generated',
    'sent',
    'paid',
    'overdue',
    'cancelled',
    'error'
);

-- Main payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'CLP',
    status payment_status NOT NULL DEFAULT 'pending',
    payment_type payment_type NOT NULL DEFAULT 'one_time',
    gateway_provider VARCHAR(50) NOT NULL,
    gateway_transaction_id VARCHAR(255) UNIQUE,
    payment_method VARCHAR(50),
    description TEXT,
    error_code VARCHAR(50),
    error_message TEXT,
    refunded_amount DECIMAL(10, 2) DEFAULT 0 CHECK (refunded_amount >= 0),
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for payments
CREATE INDEX idx_payments_community_id ON payments(community_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_gateway_provider ON payments(gateway_provider);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_metadata ON payments USING gin(metadata);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id VARCHAR(255) UNIQUE NOT NULL,
    community_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    unit_id VARCHAR(50),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'CLP',
    status subscription_status NOT NULL DEFAULT 'active',
    gateway_provider VARCHAR(50) NOT NULL,
    gateway_subscription_id VARCHAR(255) UNIQUE,
    payment_method VARCHAR(50),
    interval VARCHAR(20) NOT NULL CHECK (interval IN ('monthly', 'quarterly', 'yearly')),
    interval_count INTEGER NOT NULL DEFAULT 1,
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    next_payment_date TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancel_reason TEXT,
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for subscriptions
CREATE INDEX idx_subscriptions_community_id ON subscriptions(community_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions(next_payment_date);

-- Split payments table
CREATE TABLE IF NOT EXISTS split_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_payment_id UUID NOT NULL REFERENCES payments(id),
    recipient_id VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    percentage DECIMAL(5, 2),
    status payment_status NOT NULL DEFAULT 'pending_distribution',
    distribution_method VARCHAR(50),
    distributed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for split payments
CREATE INDEX idx_split_payments_parent ON split_payments(parent_payment_id);
CREATE INDEX idx_split_payments_recipient ON split_payments(recipient_id);
CREATE INDEX idx_split_payments_status ON split_payments(status);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id),
    community_id VARCHAR(50) NOT NULL,
    customer_id VARCHAR(50) NOT NULL,
    invoice_number INTEGER NOT NULL,
    document_type INTEGER NOT NULL,
    customer_rut VARCHAR(20) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_address TEXT NOT NULL,
    customer_email VARCHAR(255),
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    pdf_path TEXT,
    xml_path TEXT,
    ted_code TEXT,
    sii_track_id VARCHAR(100),
    sii_status VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    issued_at TIMESTAMP,
    due_date DATE,
    paid_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for invoices
CREATE INDEX idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX idx_invoices_community_id ON invoices(community_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Webhook events table for auditing
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    headers JSONB,
    processed BOOLEAN DEFAULT FALSE,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Create indexes for webhook events
CREATE INDEX idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at DESC);

-- Payment methods table (for saved cards, bank accounts, etc)
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(50) NOT NULL,
    community_id VARCHAR(50) NOT NULL,
    gateway_provider VARCHAR(50) NOT NULL,
    gateway_method_id VARCHAR(255) UNIQUE,
    type VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    details JSONB DEFAULT '{}',
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create indexes for payment methods
CREATE INDEX idx_payment_methods_user ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_community ON payment_methods(community_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(is_default) WHERE deleted_at IS NULL;

-- Bank accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id VARCHAR(50) NOT NULL,
    bank_code VARCHAR(50) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    account_holder_name VARCHAR(255) NOT NULL,
    account_holder_rut VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, bank_code, account_number)
);

-- Create indexes for bank accounts
CREATE INDEX idx_bank_accounts_community ON bank_accounts(community_id);
CREATE INDEX idx_bank_accounts_bank ON bank_accounts(bank_code);
CREATE INDEX idx_bank_accounts_active ON bank_accounts(is_active);

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'CLP',
    status payment_status NOT NULL DEFAULT 'pending',
    gateway_refund_id VARCHAR(255) UNIQUE,
    reason TEXT,
    requested_by VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for refunds
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_status ON refunds(status);

-- Payment logs table for audit trail
CREATE TABLE IF NOT EXISTS payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id),
    action VARCHAR(50) NOT NULL,
    old_status payment_status,
    new_status payment_status,
    user_id VARCHAR(50),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for payment logs
CREATE INDEX idx_payment_logs_payment_id ON payment_logs(payment_id);
CREATE INDEX idx_payment_logs_action ON payment_logs(action);
CREATE INDEX idx_payment_logs_created ON payment_logs(created_at DESC);

-- Metrics table for aggregated data
CREATE TABLE IF NOT EXISTS payment_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    total_amount DECIMAL(12, 2) DEFAULT 0,
    total_transactions INTEGER DEFAULT 0,
    successful_transactions INTEGER DEFAULT 0,
    failed_transactions INTEGER DEFAULT 0,
    refunded_amount DECIMAL(12, 2) DEFAULT 0,
    refund_count INTEGER DEFAULT 0,
    average_transaction_amount DECIMAL(10, 2),
    metrics_by_provider JSONB DEFAULT '{}',
    metrics_by_type JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, date)
);

-- Create indexes for metrics
CREATE INDEX idx_payment_metrics_community ON payment_metrics(community_id);
CREATE INDEX idx_payment_metrics_date ON payment_metrics(date DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_split_payments_updated_at BEFORE UPDATE ON split_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_metrics_updated_at BEFORE UPDATE ON payment_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log payment status changes
CREATE OR REPLACE FUNCTION log_payment_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO payment_logs (payment_id, action, old_status, new_status, details)
        VALUES (NEW.id, 'status_change', OLD.status, NEW.status, 
                jsonb_build_object('changed_at', CURRENT_TIMESTAMP));
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for payment status logging
CREATE TRIGGER log_payment_status_changes AFTER UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION log_payment_status_change();

-- Function to update payment metrics
CREATE OR REPLACE FUNCTION update_payment_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update metrics for completed payments
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO payment_metrics (community_id, date, total_amount, total_transactions, successful_transactions)
        VALUES (NEW.community_id, DATE(NEW.processed_at), NEW.amount, 1, 1)
        ON CONFLICT (community_id, date) 
        DO UPDATE SET 
            total_amount = payment_metrics.total_amount + NEW.amount,
            total_transactions = payment_metrics.total_transactions + 1,
            successful_transactions = payment_metrics.successful_transactions + 1,
            average_transaction_amount = (payment_metrics.total_amount + NEW.amount) / (payment_metrics.total_transactions + 1);
    
    -- Update metrics for failed payments
    ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
        INSERT INTO payment_metrics (community_id, date, failed_transactions, total_transactions)
        VALUES (NEW.community_id, DATE(CURRENT_TIMESTAMP), 1, 1)
        ON CONFLICT (community_id, date) 
        DO UPDATE SET 
            failed_transactions = payment_metrics.failed_transactions + 1,
            total_transactions = payment_metrics.total_transactions + 1;
    
    -- Update metrics for refunds
    ELSIF NEW.status IN ('refunded', 'partially_refunded') AND OLD.status NOT IN ('refunded', 'partially_refunded') THEN
        INSERT INTO payment_metrics (community_id, date, refunded_amount, refund_count)
        VALUES (NEW.community_id, DATE(CURRENT_TIMESTAMP), NEW.refunded_amount, 1)
        ON CONFLICT (community_id, date) 
        DO UPDATE SET 
            refunded_amount = payment_metrics.refunded_amount + NEW.refunded_amount,
            refund_count = payment_metrics.refund_count + 1;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for metrics update
CREATE TRIGGER update_payment_metrics_trigger AFTER UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_payment_metrics();

-- Grant permissions (adjust based on your users)
GRANT ALL ON ALL TABLES IN SCHEMA public TO payment_service_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO payment_service_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO payment_service_user;

-- Add comments for documentation
COMMENT ON TABLE payments IS 'Main table for all payment transactions';
COMMENT ON TABLE subscriptions IS 'Recurring payment subscriptions';
COMMENT ON TABLE split_payments IS 'Split payment distributions';
COMMENT ON TABLE invoices IS 'Electronic invoices (DTE) for payments';
COMMENT ON TABLE webhook_events IS 'Audit log for incoming webhooks';
COMMENT ON TABLE payment_methods IS 'Saved payment methods for users';
COMMENT ON TABLE bank_accounts IS 'Bank accounts for communities';
COMMENT ON TABLE refunds IS 'Payment refunds';
COMMENT ON TABLE payment_logs IS 'Audit trail for payment changes';
COMMENT ON TABLE payment_metrics IS 'Aggregated metrics for reporting';