#!/bin/bash

# Configurable Database Initialization Script for Meeshy
# This script initializes either MongoDB or PostgreSQL based on environment variables

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Function to initialize MongoDB
init_mongodb() {
    print_header "Initializing MongoDB"
    
    # First, initialize replica set
    if [ -f "/docker-entrypoint-initdb.d/init-mongodb-replica.sh" ]; then
        print_status "Running MongoDB replica set initialization..."
        bash /docker-entrypoint-initdb.d/init-mongodb-replica.sh
    else
        print_warning "MongoDB replica set initialization script not found, using fallback method"
        
        # Wait for MongoDB to be ready
        print_status "Waiting for MongoDB to be ready..."
        until mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
            sleep 1
        done
        
        print_status "MongoDB is ready, initializing replica set..."
        
        # Initialize replica set manually
        mongosh --eval "
            try {
                rs.initiate({
                    _id: 'rs0',
                    members: [
                        { _id: 0, host: 'meeshy-dev-database:27017' }
                    ]
                });
                print('✅ Replica set rs0 initialized successfully');
            } catch (e) {
                if (e.message.includes('already initialized')) {
                    print('⚠️  Replica set already initialized');
                } else {
                    print('❌ Error initializing replica set: ' + e.message);
                }
            }
        "
        
        # Wait for replica set to be ready
        print_status "Waiting for replica set to be ready..."
        sleep 5
        
        # Execute MongoDB initialization script
        if [ -f "/docker-entrypoint-initdb.d/init-mongo.js" ]; then
            mongosh --file /docker-entrypoint-initdb.d/init-mongo.js
            print_status "MongoDB initialization completed successfully"
        else
            print_warning "MongoDB initialization script not found"
        fi
    fi
}

# Function to initialize PostgreSQL
init_postgresql() {
    print_header "Initializing PostgreSQL"
    
    # Wait for PostgreSQL to be ready
    print_status "Waiting for PostgreSQL to be ready..."
    until pg_isready -U meeshy -d meeshy >/dev/null 2>&1; do
        sleep 1
    done
    
    print_status "PostgreSQL is ready, initializing database..."
    
    # Execute PostgreSQL initialization script
    if [ -f "/docker-entrypoint-initdb.d/init-postgresql.sql" ]; then
        psql -U meeshy -d meeshy -f /docker-entrypoint-initdb.d/init-postgresql.sql
        print_status "PostgreSQL initialization completed successfully"
    else
        print_warning "PostgreSQL initialization script not found"
    fi
}

# Main initialization logic
main() {
    print_header "Meeshy Database Initialization"
    
    # Determine database type from environment
    DATABASE_TYPE=${DATABASE_TYPE:-MONGODB}
    print_status "Database Type: $DATABASE_TYPE"
    
    case "$DATABASE_TYPE" in
        MONGODB)
            init_mongodb
            ;;
        POSTGRESQL)
            init_postgresql
            ;;
        *)
            print_error "Unknown database type: $DATABASE_TYPE"
            print_error "Supported types: MONGODB, POSTGRESQL"
            exit 1
            ;;
    esac
    
    print_status "Database initialization completed successfully!"
}

# Run main function
main "$@"
