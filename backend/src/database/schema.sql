-- SKYN3T Access Control System - Database Schema
-- PostgreSQL 15+ con extensiones

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Tipos ENUM
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE device_type AS ENUM ('lpr', 'rfid', 'biometric', 'qr', 'mobile', 'controller');
CREATE TYPE device_status AS ENUM ('online', 'offline', 'maintenance', 'error');
CREATE TYPE access_method AS ENUM ('qr', 'rfid', 'fingerprint', 'facial', 'lpr', 'app', 'manual');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
CREATE TYPE notification_type AS ENUM ('email', 'sms', 'push', 'whatsapp', 'in_app');

-- ===========================================
-- TABLAS DEL SISTEMA PRINCIPAL
-- ===========================================

-- Países soportados
CREATE TABLE countries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(2) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    timezone VARCHAR(50) NOT NULL,
    locale VARCHAR(10) NOT NULL,
    phone_prefix VARCHAR(5) NOT NULL,
    plate_format JSONB,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Usuarios del sistema
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    country_id UUID REFERENCES countries(id),
    status user_status DEFAULT 'active',
    avatar_url VARCHAR(500),
    last_login TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    email_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Roles del sistema
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL, -- 1-11 según jerarquía
    is_system BOOLEAN DEFAULT false,
    is_community BOOLEAN DEFAULT false,
    parent_role_id UUID REFERENCES roles(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Permisos del sistema
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    risk_level risk_level DEFAULT 'low',
    ui_elements JSONB DEFAULT '[]',
    api_endpoints JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Relación usuarios-roles
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    community_id UUID, -- NULL para roles del sistema
    assigned_by UUID REFERENCES users(id),
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id, community_id)
);

-- Relación roles-permisos
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- Permisos específicos de usuario
CREATE TABLE user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    community_id UUID,
    granted BOOLEAN DEFAULT true,
    granted_by UUID REFERENCES users(id),
    reason TEXT,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, permission_id, community_id)
);

-- Features del sistema
CREATE TABLE features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    monthly_price DECIMAL(10, 2) DEFAULT 0,
    required_permissions JSONB DEFAULT '[]',
    ui_modules JSONB DEFAULT '[]',
    api_modules JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sesiones de usuario
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    refresh_token_hash VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    refresh_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Auditoría
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- TABLAS PARA GESTIÓN DE COMUNIDADES
-- ===========================================

-- Comunidades (edificios, condominios, etc.)
CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'building', 'condominium', 'office', etc.
    country_id UUID NOT NULL REFERENCES countries(id),
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50) NOT NULL,
    contact_name VARCHAR(200),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    logo_url VARCHAR(500),
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    subscription_plan_id UUID,
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Features habilitadas por comunidad
CREATE TABLE community_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    feature_id UUID NOT NULL REFERENCES features(id),
    enabled BOOLEAN DEFAULT true,
    enabled_by UUID REFERENCES users(id),
    custom_settings JSONB DEFAULT '{}',
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, feature_id)
);

-- Edificios de la comunidad
CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    floors_count INTEGER DEFAULT 1,
    units_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, code)
);

-- Pisos
CREATE TABLE floors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    name VARCHAR(100),
    units_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, floor_number)
);

-- Unidades (departamentos, oficinas)
CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    building_id UUID NOT NULL REFERENCES buildings(id),
    unit_number VARCHAR(20) NOT NULL,
    type VARCHAR(50) DEFAULT 'residential', -- 'residential', 'commercial', 'office'
    area_m2 DECIMAL(10, 2),
    bedrooms INTEGER,
    bathrooms INTEGER,
    parking_spaces INTEGER DEFAULT 0,
    owner_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(building_id, unit_number)
);

-- Miembros de la comunidad
CREATE TABLE community_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id),
    member_type VARCHAR(50) NOT NULL, -- 'owner', 'tenant', 'family', 'staff', 'visitor'
    relationship VARCHAR(100),
    authorized_by UUID REFERENCES users(id),
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, user_id)
);

-- ===========================================
-- TABLAS PARA CONTROL DE ACCESO Y HARDWARE
-- ===========================================

-- Dispositivos IoT
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type device_type NOT NULL,
    status device_status DEFAULT 'offline',
    model VARCHAR(100),
    manufacturer VARCHAR(100),
    serial_number VARCHAR(100),
    firmware_version VARCHAR(50),
    ip_address INET,
    mac_address MACADDR,
    location TEXT,
    building_id UUID REFERENCES buildings(id),
    floor_id UUID REFERENCES floors(id),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    configuration JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, code)
);

-- Puntos de acceso
CREATE TABLE access_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'main_entrance', 'garage', 'pedestrian', etc.
    location TEXT,
    building_id UUID REFERENCES buildings(id),
    floor_id UUID REFERENCES floors(id),
    entry_device_id UUID REFERENCES devices(id),
    exit_device_id UUID REFERENCES devices(id),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, code)
);

-- Vehículos registrados
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id),
    license_plate VARCHAR(20) NOT NULL,
    brand VARCHAR(50),
    model VARCHAR(50),
    color VARCHAR(30),
    year INTEGER,
    type VARCHAR(30), -- 'car', 'motorcycle', 'truck', etc.
    photo_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, license_plate)
);

-- Logs de acceso
CREATE TABLE access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id),
    access_point_id UUID REFERENCES access_points(id),
    user_id UUID REFERENCES users(id),
    vehicle_id UUID REFERENCES vehicles(id),
    access_method access_method NOT NULL,
    direction VARCHAR(10) NOT NULL, -- 'entry' or 'exit'
    authorized BOOLEAN NOT NULL,
    authorized_by UUID REFERENCES users(id),
    denial_reason TEXT,
    photo_url VARCHAR(500),
    temperature DECIMAL(3, 1), -- Para control COVID
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Invitaciones
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES users(id),
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(20),
    guest_document VARCHAR(50),
    purpose TEXT,
    access_code VARCHAR(20) UNIQUE,
    qr_code_url VARCHAR(500),
    access_methods JSONB DEFAULT '["qr"]',
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    vehicle_info JSONB,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- TABLAS PARA SISTEMA FINANCIERO
-- ===========================================

-- Cuentas bancarias
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(30) NOT NULL,
    currency VARCHAR(3) DEFAULT 'CLP',
    balance DECIMAL(15, 2) DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Gastos comunes
CREATE TABLE common_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    generation_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'draft',
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, period_year, period_month)
);

-- Detalle de gastos por unidad
CREATE TABLE unit_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    common_expense_id UUID NOT NULL REFERENCES common_expenses(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES units(id),
    amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) DEFAULT 0,
    status payment_status DEFAULT 'pending',
    payment_date TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(50),
    transaction_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(common_expense_id, unit_id)
);

-- Transacciones de pago
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID NOT NULL REFERENCES communities(id),
    user_id UUID NOT NULL REFERENCES users(id),
    unit_expense_id UUID REFERENCES unit_expenses(id),
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'CLP',
    status payment_status DEFAULT 'pending',
    payment_method VARCHAR(50) NOT NULL,
    gateway VARCHAR(50),
    gateway_transaction_id VARCHAR(200),
    gateway_response JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- TABLAS PARA NOTIFICACIONES Y COMUNICACIONES
-- ===========================================

-- Plantillas de notificación
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type notification_type NOT NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(COALESCE(community_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
);

-- Notificaciones enviadas
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id),
    user_id UUID REFERENCES users(id),
    template_id UUID REFERENCES notification_templates(id),
    type notification_type NOT NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- ÍNDICES
-- ===========================================

-- Índices para búsquedas frecuentes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_user_expires ON user_sessions(user_id, expires_at);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action, created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_access_logs_community_date ON access_logs(community_id, created_at);
CREATE INDEX idx_access_logs_user ON access_logs(user_id, created_at);
CREATE INDEX idx_devices_community_status ON devices(community_id, status);
CREATE INDEX idx_community_members_user ON community_members(user_id);
CREATE INDEX idx_invitations_code ON invitations(access_code);
CREATE INDEX idx_vehicles_plate ON vehicles(license_plate);

-- Índices para búsqueda de texto
CREATE INDEX idx_users_name_search ON users USING gin(
    (first_name || ' ' || last_name) gin_trgm_ops
);
CREATE INDEX idx_communities_name_search ON communities USING gin(name gin_trgm_ops);

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger a todas las tablas con updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE TRIGGER update_%I_updated_at 
            BEFORE UPDATE ON %I 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column()',
            t, t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- DATOS INICIALES
-- ===========================================

-- Insertar país Chile
INSERT INTO countries (code, name, currency_code, timezone, locale, phone_prefix, plate_format) VALUES
('CL', 'Chile', 'CLP', 'America/Santiago', 'es-CL', '+56', 
 '{"car": "^[A-Z]{2}[A-Z]{2}[0-9]{2}$", "motorcycle": "^[A-Z]{2}[0-9]{3}$"}');

-- Insertar roles del sistema (11 niveles)
INSERT INTO roles (code, name, level, is_system) VALUES
('SUPER_ADMIN', 'Super Administrador', 1, true),
('SYSTEM_ADMIN', 'Administrador del Sistema', 2, true),
('FINANCIAL_ADMIN', 'Administrador Financiero', 3, true),
('HARDWARE_ADMIN', 'Administrador de Hardware', 4, true),
('SECURITY_ADMIN', 'Administrador de Seguridad', 5, true),
('AUDIT_ADMIN', 'Administrador de Auditoría', 6, true),
('OPERATIONS_MANAGER', 'Gerente de Operaciones', 7, true),
('COMMUNITY_MANAGER', 'Gestor de Comunidades', 8, true),
('SUPPORT_SUPERVISOR', 'Supervisor de Soporte', 9, true),
('SUPPORT_AGENT', 'Agente de Soporte', 10, true),
('REPORT_VIEWER', 'Visualizador de Reportes', 11, true);

-- Insertar roles de comunidad (11 niveles)
INSERT INTO roles (code, name, level, is_community) VALUES
('COMMUNITY_ADMIN', 'Administrador de Comunidad', 1, true),
('BOARD_PRESIDENT', 'Presidente del Directorio', 2, true),
('TREASURER', 'Tesorero', 3, true),
('BOARD_MEMBER', 'Miembro del Directorio', 4, true),
('SECURITY_CHIEF', 'Jefe de Seguridad', 5, true),
('SECURITY_GUARD', 'Guardia de Seguridad', 6, true),
('MAINTENANCE_CHIEF', 'Jefe de Mantenimiento', 7, true),
('STAFF', 'Personal General', 8, true),
('OWNER', 'Propietario', 9, true),
('TENANT', 'Inquilino', 10, true),
('AUTHORIZED_PERSON', 'Persona Autorizada', 11, true);

-- Insertar features básicas
INSERT INTO features (code, name, category, monthly_price) VALUES
('ACCESS_CONTROL', 'Control de Accesos', 'core', 0),
('FINANCIAL_MODULE', 'Módulo Financiero', 'premium', 50),
('TRANSPARENCY_PORTAL', 'Portal de Transparencia', 'premium', 30),
('INVITATION_SYSTEM', 'Sistema de Invitaciones', 'standard', 20),
('FACIAL_RECOGNITION', 'Reconocimiento Facial', 'premium', 100),
('ADVANCED_REPORTS', 'Reportes Avanzados', 'premium', 40);

-- Usuario administrador por defecto (contraseña: admin)
INSERT INTO users (username, email, password_hash, first_name, last_name, status) VALUES
('admin', 'admin@skyn3t.com', '$2a$10$YourHashedPasswordHere', 'Admin', 'System', 'active');

-- Comunidad de demostración
INSERT INTO communities (code, name, type, country_id, address, city, timezone) VALUES
('DEMO001', 'Torres del Sol', 'condominium', 
 (SELECT id FROM countries WHERE code = 'CL'),
 'Av. Providencia 1234', 'Santiago', 'America/Santiago');