-- PostgreSQL Initialization Script for Meeshy
-- This script is executed when PostgreSQL starts for the first time

-- Create the meeshy database if it doesn't exist
SELECT 'CREATE DATABASE meeshy' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'meeshy')\gexec

-- Connect to the meeshy database
\c meeshy;

-- Create the main user for the application
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'meeshy') THEN
        CREATE ROLE meeshy WITH LOGIN PASSWORD 'MeeshyPassword123';
    END IF;
END
$$;

-- Grant privileges to the meeshy user
GRANT ALL PRIVILEGES ON DATABASE meeshy TO meeshy;
GRANT ALL PRIVILEGES ON SCHEMA public TO meeshy;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO meeshy;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO meeshy;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO meeshy;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO meeshy;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO meeshy;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO meeshy;

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create initial tables structure (will be managed by Prisma)
-- This is just a basic structure, Prisma will handle the full schema

-- Create a simple users table for initial setup
CREATE TABLE IF NOT EXISTS "User" (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    username VARCHAR(255) UNIQUE NOT NULL,
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255),
    "isOnline" BOOLEAN DEFAULT false,
    "lastSeen" TIMESTAMP,
    "lastActiveAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "systemLanguage" VARCHAR(10) DEFAULT 'fr',
    "regionalLanguage" VARCHAR(10) DEFAULT 'fr',
    "autoTranslateEnabled" BOOLEAN DEFAULT true,
    "translateToSystemLanguage" BOOLEAN DEFAULT true,
    "translateToRegionalLanguage" BOOLEAN DEFAULT false,
    "useCustomDestination" BOOLEAN DEFAULT false,
    role VARCHAR(50) DEFAULT 'USER',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User" (username);
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User" (email);
CREATE INDEX IF NOT EXISTS "User_isOnline_idx" ON "User" ("isOnline");
CREATE INDEX IF NOT EXISTS "User_lastActiveAt_idx" ON "User" ("lastActiveAt");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User" ("createdAt");

-- Create default admin user
INSERT INTO "User" (
    username, "firstName", "lastName", email, password, "displayName", 
    role, "isActive", "systemLanguage", "regionalLanguage"
) VALUES (
    'admin', 'Admin', 'User', 'admin@meeshy.me', 
    crypt('admin123', gen_salt('bf')), 'Administrator',
    'ADMIN', true, 'fr', 'fr'
) ON CONFLICT (username) DO NOTHING;

-- Create BigBoss user
INSERT INTO "User" (
    username, "firstName", "lastName", email, password, "displayName", 
    role, "isActive", "systemLanguage", "regionalLanguage"
) VALUES (
    'bigboss', 'Big', 'Boss', 'bigboss@meeshy.me', 
    crypt('bigboss123', gen_salt('bf')), 'Big Boss',
    'BIGBOSS', true, 'fr', 'fr'
) ON CONFLICT (username) DO NOTHING;

-- Grant all privileges on the User table to meeshy user
GRANT ALL PRIVILEGES ON "User" TO meeshy;
GRANT USAGE, SELECT ON SEQUENCE "User_id_seq" TO meeshy;

-- Print completion message
DO $$
BEGIN
    RAISE NOTICE '🎉 Meeshy PostgreSQL database initialization completed!';
    RAISE NOTICE '📊 Database statistics:';
    RAISE NOTICE '- Tables created: %', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public');
    RAISE NOTICE '- Users created: %', (SELECT COUNT(*) FROM "User");
    RAISE NOTICE '';
    RAISE NOTICE '🔐 Default users:';
    RAISE NOTICE '- Admin: admin@meeshy.me / admin123';
    RAISE NOTICE '- BigBoss: bigboss@meeshy.me / bigboss123';
    RAISE NOTICE '- PostgreSQL: meeshy / MeeshyPassword123';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Ready for Prisma client connections!';
END
$$;
