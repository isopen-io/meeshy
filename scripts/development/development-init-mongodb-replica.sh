#!/bin/bash

# 🔧 Script d'initialisation du replica set MongoDB pour le développement local
# Ce script configure MongoDB comme un replica set pour permettre les transactions Prisma

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Initialisation du replica set MongoDB...${NC}"

# Attendre que MongoDB soit prêt
echo -e "${YELLOW}⏳ Attente que MongoDB soit prêt...${NC}"
sleep 3

# Vérifier si MongoDB est accessible
if ! mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo -e "${RED}❌ MongoDB n'est pas accessible${NC}"
    exit 1
fi

echo -e "${GREEN}✅ MongoDB est accessible${NC}"

# Initialiser le replica set
echo -e "${YELLOW}🚀 Initialisation du replica set 'rs0'...${NC}"

mongosh --eval "
try {
    rs.status()
    print('✅ Replica set déjà initialisé')
} catch (e) {
    print('🔧 Initialisation du replica set...')
    rs.initiate({
        _id: 'rs0',
        members: [
            { _id: 0, host: 'localhost:27017' }
        ]
    })
    print('✅ Replica set initialisé avec succès')
}
" --quiet --username meeshy --password MeeshyPassword123 --authenticationDatabase admin

# Attendre que le replica set soit prêt
echo -e "${YELLOW}⏳ Attente que le replica set soit prêt...${NC}"
sleep 5

# Vérifier le statut du replica set
echo -e "${BLUE}📊 Statut du replica set:${NC}"
mongosh --eval "rs.status()" --quiet --username meeshy --password MeeshyPassword123 --authenticationDatabase admin

echo -e "${GREEN}🎉 Configuration MongoDB terminée !${NC}"
echo -e "${YELLOW}💡 Le replica set 'rs0' est maintenant configuré et prêt pour les transactions Prisma${NC}"
