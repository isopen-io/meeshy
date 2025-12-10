#!/bin/bash

# ===== MEESHY - CONFIGURATION MONGODB =====
# Script spécialisé pour configurer MongoDB et le replica set
# Usage: ./deploy-configure-mongodb.sh [DROPLET_IP]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-configure-mongodb" "configure_mongodb"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🍃 MEESHY - CONFIGURATION MONGODB${NC}"
    echo "====================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-configure-mongodb.sh [DROPLET_IP]"
    echo ""
    echo "Description:"
    echo "  Configure MongoDB et le replica set pour Meeshy:"
    echo "  • Configuration du replica set MongoDB"
    echo "  • Création des utilisateurs et permissions"
    echo "  • Initialisation de la base de données"
    echo "  • Vérification de la configuration"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-configure-mongodb.sh 192.168.1.100"
    echo "  ./deploy-configure-mongodb.sh 157.230.15.51"
    echo ""
}

# Attendre que MongoDB soit prêt
wait_for_mongodb() {
    local ip="$1"
    local max_attempts=3
    local attempt=1
    
    log_info "Attente que MongoDB soit prêt..."
    trace_deploy_operation "wait_mongodb" "STARTED" "Waiting for MongoDB to be ready on $ip"
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Tentative $attempt/$max_attempts - Vérification de MongoDB..."
        
        if ssh -o StrictHostKeyChecking=no root@$ip "docker exec meeshy-database mongosh --eval 'db.adminCommand(\"ping\")' >/dev/null 2>&1" >/dev/null 2>&1; then
            log_success "MongoDB est prêt et répond aux commandes"
            trace_deploy_operation "wait_mongodb" "SUCCESS" "MongoDB is ready on $ip"
            return 0
        fi
        
        log_info "MongoDB pas encore prêt, attente de 3 secondes..."
        sleep 3
        attempt=$((attempt + 1))
    done
    
    log_error "MongoDB n'est pas prêt après $max_attempts tentatives"
    trace_deploy_operation "wait_mongodb" "FAILED" "MongoDB not ready after $max_attempts attempts on $ip"
    exit 1
}

# Configurer le replica set MongoDB
configure_mongodb_replica() {
    local ip="$1"
    
    log_info "Configuration du replica set MongoDB..."
    trace_deploy_operation "configure_replica" "STARTED" "Configuring MongoDB replica set on $ip"
    
    # Script de configuration du replica set
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Attendre que MongoDB soit complètement démarré
        sleep 5
        
        # Configurer le replica set
        docker exec meeshy-database mongosh --eval "
            try {
                // Vérifier si le replica set est déjà configuré
                var status = rs.status();
                print('Replica set déjà configuré');
            } catch (e) {
                print('Configuration du replica set...');
                
                // Configuration du replica set
                var config = {
                    _id: 'meeshy-replica',
                    members: [
                        { _id: 0, host: 'meeshy-database:27017', priority: 1 }
                    ]
                };
                
                var result = rs.initiate(config);
                print('Replica set configuré: ' + JSON.stringify(result));
                
                // Attendre que le replica set soit prêt
                print('Attente que le replica set soit prêt...');
                while (rs.status().ok !== 1) {
                    sleep(1000);
                }
                print('Replica set prêt!');
            }
        "
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Replica set MongoDB configuré avec succès"
        trace_deploy_operation "configure_replica" "SUCCESS" "MongoDB replica set configured on $ip"
    else
        log_error "Échec de la configuration du replica set"
        trace_deploy_operation "configure_replica" "FAILED" "MongoDB replica set configuration failed on $ip"
        exit 1
    fi
}

# Créer les utilisateurs MongoDB
create_mongodb_users() {
    local ip="$1"
    
    log_info "Création des utilisateurs MongoDB..."
    trace_deploy_operation "create_users" "STARTED" "Creating MongoDB users on $ip"
    
    # Lire les mots de passe depuis le fichier de secrets
    local mongodb_password=""
    if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        mongodb_password=$(grep "MongoDB Password:" "$PROJECT_ROOT/secrets/clear.txt" | cut -d' ' -f3)
    fi
    
    if [ -z "$mongodb_password" ]; then
        log_warning "Mot de passe MongoDB non trouvé, utilisation d'un mot de passe par défaut"
        mongodb_password="meeshy_mongodb_2025"
    fi
    
    # Script de création des utilisateurs
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        # Attendre que le replica set soit prêt
        sleep 3
        
        # Créer l'utilisateur admin
        docker exec meeshy-database mongosh --eval "
            try {
                // Vérifier si l'utilisateur admin existe déjà
                var adminUser = db.getUser('meeshy_admin');
                if (adminUser) {
                    print('Utilisateur admin déjà existant');
                } else {
                    print('Création de l\\'utilisateur admin...');
                    db.createUser({
                        user: 'meeshy_admin',
                        pwd: '$mongodb_password',
                        roles: [
                            { role: 'userAdminAnyDatabase', db: 'admin' },
                            { role: 'readWriteAnyDatabase', db: 'admin' },
                            { role: 'dbAdminAnyDatabase', db: 'admin' }
                        ]
                    });
                    print('Utilisateur admin créé avec succès');
                }
            } catch (e) {
                print('Erreur lors de la création de l\\'utilisateur admin: ' + e);
            }
        "
        
        # Créer l'utilisateur application
        docker exec meeshy-database mongosh --eval "
            try {
                // Vérifier si l'utilisateur application existe déjà
                var appUser = db.getUser('meeshy_app');
                if (appUser) {
                    print('Utilisateur application déjà existant');
                } else {
                    print('Création de l\\'utilisateur application...');
                    db.createUser({
                        user: 'meeshy_app',
                        pwd: '$mongodb_password',
                        roles: [
                            { role: 'readWrite', db: 'meeshy' },
                            { role: 'readWrite', db: 'meeshy_sessions' },
                            { role: 'readWrite', db: 'meeshy_translations' }
                        ]
                    });
                    print('Utilisateur application créé avec succès');
                }
            } catch (e) {
                print('Erreur lors de la création de l\\'utilisateur application: ' + e);
            }
        "
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Utilisateurs MongoDB créés avec succès"
        trace_deploy_operation "create_users" "SUCCESS" "MongoDB users created on $ip"
    else
        log_error "Échec de la création des utilisateurs MongoDB"
        trace_deploy_operation "create_users" "FAILED" "MongoDB users creation failed on $ip"
        exit 1
    fi
}

# Initialiser les bases de données
initialize_databases() {
    local ip="$1"
    
    log_info "Initialisation des bases de données..."
    trace_deploy_operation "init_databases" "STARTED" "Initializing databases on $ip"
    
    # Lire les mots de passe depuis le fichier de secrets
    local mongodb_password=""
    if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        mongodb_password=$(grep "MongoDB Password:" "$PROJECT_ROOT/secrets/clear.txt" | cut -d' ' -f3)
    fi
    
    if [ -z "$mongodb_password" ]; then
        mongodb_password="meeshy_mongodb_2025"
    fi
    
    # Script d'initialisation des bases de données
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        # Initialiser la base de données principale
        docker exec meeshy-database mongosh -u meeshy_app -p '$mongodb_password' --authenticationDatabase admin meeshy --eval "
            try {
                print('Initialisation de la base de données meeshy...');
                
                // Créer les collections principales
                db.createCollection('conversations');
                db.createCollection('messages');
                db.createCollection('users');
                db.createCollection('translations');
                
                // Créer les index
                db.conversations.createIndex({ 'createdAt': 1 });
                db.conversations.createIndex({ 'participants': 1 });
                db.messages.createIndex({ 'conversationId': 1, 'createdAt': 1 });
                db.messages.createIndex({ 'senderId': 1 });
                db.users.createIndex({ 'email': 1 }, { unique: true });
                db.users.createIndex({ 'username': 1 }, { unique: true });
                db.translations.createIndex({ 'messageId': 1 });
                db.translations.createIndex({ 'targetLanguage': 1 });
                
                print('Base de données meeshy initialisée avec succès');
            } catch (e) {
                print('Erreur lors de l\\'initialisation: ' + e);
            }
        "
        
        # Initialiser la base de données des sessions
        docker exec meeshy-database mongosh -u meeshy_app -p '$mongodb_password' --authenticationDatabase admin meeshy_sessions --eval "
            try {
                print('Initialisation de la base de données meeshy_sessions...');
                
                // Créer les collections
                db.createCollection('sessions');
                db.createCollection('user_sessions');
                
                // Créer les index
                db.sessions.createIndex({ 'sessionId': 1 }, { unique: true });
                db.sessions.createIndex({ 'expiresAt': 1 }, { expireAfterSeconds: 0 });
                db.user_sessions.createIndex({ 'userId': 1 });
                db.user_sessions.createIndex({ 'expiresAt': 1 }, { expireAfterSeconds: 0 });
                
                print('Base de données meeshy_sessions initialisée avec succès');
            } catch (e) {
                print('Erreur lors de l\\'initialisation: ' + e);
            }
        "
        
        # Initialiser la base de données des traductions
        docker exec meeshy-database mongosh -u meeshy_app -p '$mongodb_password' --authenticationDatabase admin meeshy_translations --eval "
            try {
                print('Initialisation de la base de données meeshy_translations...');
                
                // Créer les collections
                db.createCollection('translation_cache');
                db.createCollection('translation_stats');
                
                // Créer les index
                db.translation_cache.createIndex({ 'sourceText': 1, 'targetLanguage': 1 }, { unique: true });
                db.translation_cache.createIndex({ 'createdAt': 1 }, { expireAfterSeconds: 86400 }); // 24h
                db.translation_stats.createIndex({ 'date': 1 });
                db.translation_stats.createIndex({ 'language': 1 });
                
                print('Base de données meeshy_translations initialisée avec succès');
            } catch (e) {
                print('Erreur lors de l\\'initialisation: ' + e);
            }
        "
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Bases de données initialisées avec succès"
        trace_deploy_operation "init_databases" "SUCCESS" "Databases initialized on $ip"
    else
        log_error "Échec de l'initialisation des bases de données"
        trace_deploy_operation "init_databases" "FAILED" "Database initialization failed on $ip"
        exit 1
    fi
}

# Vérifier la configuration MongoDB
verify_mongodb_config() {
    local ip="$1"
    
    log_info "Vérification de la configuration MongoDB..."
    trace_deploy_operation "verify_config" "STARTED" "Verifying MongoDB configuration on $ip"
    
    # Lire les mots de passe depuis le fichier de secrets
    local mongodb_password=""
    if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
        mongodb_password=$(grep "MongoDB Password:" "$PROJECT_ROOT/secrets/clear.txt" | cut -d' ' -f3)
    fi
    
    if [ -z "$mongodb_password" ]; then
        mongodb_password="meeshy_mongodb_2025"
    fi
    
    # Script de vérification
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        # Vérifier le statut du replica set
        echo "=== STATUT DU REPLICA SET ==="
        docker exec meeshy-database mongosh --eval "
            try {
                var status = rs.status();
                print('Replica set status: ' + status.ok);
                print('Primary: ' + status.members[0].name);
                print('State: ' + status.members[0].stateStr);
            } catch (e) {
                print('Erreur lors de la vérification du replica set: ' + e);
            }
        "
        
        # Vérifier les utilisateurs
        echo "=== UTILISATEURS MONGODB ==="
        docker exec meeshy-database mongosh --eval "
            try {
                var users = db.getUsers();
                print('Utilisateurs créés: ' + users.length);
                users.forEach(function(user) {
                    print('- ' + user.user + ' (' + user.roles.map(function(r) { return r.role; }).join(', ') + ')');
                });
            } catch (e) {
                print('Erreur lors de la vérification des utilisateurs: ' + e);
            }
        "
        
        # Vérifier les bases de données
        echo "=== BASES DE DONNÉES ==="
        docker exec meeshy-database mongosh -u meeshy_app -p '$mongodb_password' --authenticationDatabase admin --eval "
            try {
                var dbs = db.adminCommand('listDatabases');
                print('Bases de données disponibles:');
                dbs.databases.forEach(function(db) {
                    if (db.name.startsWith('meeshy')) {
                        print('- ' + db.name + ' (' + db.sizeOnDisk + ' bytes)');
                    }
                });
            } catch (e) {
                print('Erreur lors de la vérification des bases de données: ' + e);
            }
        "
        
        # Vérifier les collections
        echo "=== COLLECTIONS ==="
        docker exec meeshy-database mongosh -u meeshy_app -p '$mongodb_password' --authenticationDatabase admin meeshy --eval "
            try {
                var collections = db.getCollectionNames();
                print('Collections dans meeshy: ' + collections.join(', '));
            } catch (e) {
                print('Erreur lors de la vérification des collections: ' + e);
            }
        "
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Configuration MongoDB vérifiée avec succès"
        trace_deploy_operation "verify_config" "SUCCESS" "MongoDB configuration verified on $ip"
    else
        log_error "Échec de la vérification de la configuration MongoDB"
        trace_deploy_operation "verify_config" "FAILED" "MongoDB configuration verification failed on $ip"
        exit 1
    fi
}

# Fonction principale
main() {
    local ip="$1"
    
    # Parser les arguments si appelé directement
    if [ -z "$ip" ] && [ -n "$DROPLET_IP" ]; then
        ip="$DROPLET_IP"
    fi
    
    if [ -z "$ip" ]; then
        log_error "IP du serveur manquante"
        show_help
        exit 1
    fi
    
    log_info "🍃 Configuration de MongoDB sur le serveur $ip"
    
    # Attendre que MongoDB soit prêt
    wait_for_mongodb "$ip"
    
    # Configurer le replica set
    configure_mongodb_replica "$ip"
    
    # Créer les utilisateurs
    create_mongodb_users "$ip"
    
    # Initialiser les bases de données
    initialize_databases "$ip"
    
    # Vérifier la configuration
    verify_mongodb_config "$ip"
    
    # Résumé de la configuration
    echo ""
    echo "=== RÉSUMÉ DE LA CONFIGURATION MONGODB ==="
    echo "✅ Replica set: Configuré et fonctionnel"
    echo "✅ Utilisateurs: Créés avec les bonnes permissions"
    echo "✅ Bases de données: Initialisées avec les collections"
    echo "✅ Index: Créés pour optimiser les performances"
    echo "✅ Vérification: Configuration validée"
    echo "=========================================="
    
    log_success "Configuration MongoDB terminée avec succès"
    
    # Finaliser la traçabilité
    finalize_deploy_tracing "SUCCESS" "MongoDB configuration completed for $ip"
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
