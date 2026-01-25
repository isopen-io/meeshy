#!/bin/bash
# infrastructure/scripts/capture-current-state.sh
set -euo pipefail

OUTPUT_DIR="docs/infrastructure/snapshots/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "📸 Capture de l'état actuel du système..."
echo "   Output: $OUTPUT_DIR"

# Capture Docker
echo "   → Conteneurs Docker..."
ssh root@meeshy.me "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'" > "$OUTPUT_DIR/docker-containers.txt" 2>&1 || echo "Erreur conteneurs" >> "$OUTPUT_DIR/errors.txt"

echo "   → Images Docker..."
ssh root@meeshy.me "docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}'" > "$OUTPUT_DIR/docker-images.txt" 2>&1 || echo "Erreur images" >> "$OUTPUT_DIR/errors.txt"

echo "   → Volumes Docker..."
ssh root@meeshy.me "docker volume ls" > "$OUTPUT_DIR/docker-volumes.txt" 2>&1 || echo "Erreur volumes" >> "$OUTPUT_DIR/errors.txt"

# Capture structure /opt/meeshy
echo "   → Structure /opt/meeshy..."
ssh root@meeshy.me "ls -laR /opt/meeshy 2>/dev/null || echo 'Répertoire inexistant'" > "$OUTPUT_DIR/meeshy-directory.txt"

# Capture config Docker Compose
echo "   → Configuration Docker Compose..."
ssh root@meeshy.me "cat /opt/meeshy/docker-compose.yml 2>/dev/null || echo 'Pas de docker-compose.yml'" > "$OUTPUT_DIR/docker-compose.yml"

echo "   → Variables d'environnement (masquées)..."
ssh root@meeshy.me "cat /opt/meeshy/.env 2>/dev/null | sed 's/=.*/=***MASKED***/' || echo 'Pas de .env'" > "$OUTPUT_DIR/env-structure.txt"

# Capture état MongoDB
echo "   → Bases de données MongoDB..."
ssh root@meeshy.me "docker exec meeshy-database mongosh --quiet --eval 'db.adminCommand({listDatabases: 1})' 2>/dev/null || echo 'MongoDB non accessible'" > "$OUTPUT_DIR/mongodb-databases.txt"

echo "   → Collections MongoDB..."
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --quiet --eval 'db.getCollectionNames()' 2>/dev/null || echo 'Base meeshy non accessible'" > "$OUTPUT_DIR/mongodb-collections.txt"

# Stats collections
echo "   → Statistiques des collections..."
ssh root@meeshy.me "docker exec meeshy-database mongosh meeshy --quiet --eval '
  db.getCollectionNames().forEach(function(col) {
    var count = db[col].countDocuments();
    print(col + \": \" + count + \" documents\");
  })
' 2>/dev/null || echo 'Erreur stats'" > "$OUTPUT_DIR/mongodb-stats.txt"

# Capture SHA des images
echo "   → SHA des images Docker..."
ssh root@meeshy.me "docker inspect meeshy-gateway --format '{{.Image}}' 2>/dev/null || echo 'N/A'" > "$OUTPUT_DIR/gateway-sha.txt"
ssh root@meeshy.me "docker inspect meeshy-translator --format '{{.Image}}' 2>/dev/null || echo 'N/A'" > "$OUTPUT_DIR/translator-sha.txt"
ssh root@meeshy.me "docker inspect meeshy-web --format '{{.Image}}' 2>/dev/null || echo 'N/A'" > "$OUTPUT_DIR/frontend-sha.txt"
ssh root@meeshy.me "docker inspect meeshy-database --format '{{.Image}}' 2>/dev/null || echo 'N/A'" > "$OUTPUT_DIR/database-sha.txt"

echo ""
echo "✅ État capturé dans $OUTPUT_DIR"
echo "$OUTPUT_DIR" > .last-snapshot-dir

# Afficher un résumé
echo ""
echo "📊 RÉSUMÉ:"
echo "   Conteneurs actifs:"
cat "$OUTPUT_DIR/docker-containers.txt" | head -20
echo ""
echo "   Collections MongoDB:"
cat "$OUTPUT_DIR/mongodb-stats.txt"
