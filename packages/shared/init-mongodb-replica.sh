#!/bin/bash

# MongoDB Replica Set Initialization Script for Meeshy
# This script automatically initializes MongoDB replica set configuration

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

# Function to wait for MongoDB to be ready
wait_for_mongodb() {
    print_status "Waiting for MongoDB to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
            print_status "MongoDB is ready!"
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts - MongoDB not ready yet, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "MongoDB failed to start within expected time"
    return 1
}

# Function to check if replica set is already initialized
check_replica_set_status() {
    print_status "Checking replica set status..."
    
    if mongosh --eval "rs.status()" >/dev/null 2>&1; then
        print_status "Replica set is already initialized"
        return 0
    else
        print_status "Replica set is not initialized"
        return 1
    fi
}

# Function to initialize replica set
init_replica_set() {
    print_header "Initializing MongoDB Replica Set"
    
    # Wait for MongoDB to be ready
    wait_for_mongodb
    
    # Check if replica set is already initialized
    if check_replica_set_status; then
        print_status "Replica set already initialized, skipping..."
        return 0
    fi
    
    print_status "Initializing replica set rs0..."
    
    # Initialize replica set
    mongosh --eval "
        try {
            rs.initiate({
                _id: 'rs0',
                members: [
                    { _id: 0, host: 'localhost:27017' }
                ]
            });
            print('✅ Replica set rs0 initialized successfully');
        } catch (e) {
            if (e.message.includes('already initialized')) {
                print('⚠️  Replica set already initialized');
            } else {
                print('❌ Error initializing replica set: ' + e.message);
                throw e;
            }
        }
    "
    
    # Wait for replica set to be ready
    print_status "Waiting for replica set to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if mongosh --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then
            print_status "Replica set is ready!"
            break
        fi
        
        print_status "Attempt $attempt/$max_attempts - Replica set not ready yet, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_error "Replica set failed to initialize within expected time"
        return 1
    fi
    
    # Display replica set status
    print_status "Replica set status:"
    mongosh --eval "rs.status()" --quiet
    
    print_status "✅ MongoDB replica set initialization completed successfully!"
    return 0
}

# Function to run database initialization
run_database_init() {
    print_header "Running Database Initialization"
    
    # Wait for replica set to be ready
    wait_for_mongodb
    
    # Run the main initialization script
    if [ -f "/docker-entrypoint-initdb.d/init-mongo.js" ]; then
        print_status "Running MongoDB initialization script..."
        mongosh --file /docker-entrypoint-initdb.d/init-mongo.js
        print_status "✅ Database initialization completed successfully"
    else
        print_warning "MongoDB initialization script not found at /docker-entrypoint-initdb.d/init-mongo.js"
    fi
}

# Main function
main() {
    print_header "Meeshy MongoDB Replica Set Initialization"
    
    # Initialize replica set
    if init_replica_set; then
        print_status "Replica set initialization successful"
    else
        print_error "Replica set initialization failed"
        exit 1
    fi
    
    # Run database initialization
    run_database_init
    
    print_status "🎉 MongoDB setup completed successfully!"
    print_status "📊 Replica set: rs0"
    print_status "🔗 Connection string: mongodb://localhost:27017/meeshy?replicaSet=rs0"
}

# Run main function
main "$@"
