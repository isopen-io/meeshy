-- Initialisation de la base de données PostgreSQL pour Meeshy
-- Ce script est exécuté au démarrage du conteneur PostgreSQL

-- Créer la base de données si elle n'existe pas
SELECT 'CREATE DATABASE meeshy'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'meeshy')\gexec

-- Se connecter à la base de données
\c meeshy;

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Configuration
SET timezone = 'UTC';

-- Les tables seront créées par Prisma lors du démarrage du service Fastify
