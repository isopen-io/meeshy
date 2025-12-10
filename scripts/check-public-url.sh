#!/bin/bash

# Script de vérification de PUBLIC_URL pour Meeshy
# Usage: ./scripts/check-public-url.sh

echo "=== Vérification de PUBLIC_URL (Meeshy) ==="
echo ""

# Déterminer si on est en production ou local
if [ -d "/opt/meeshy" ]; then
    ENV_FILE="/opt/meeshy/.env"
    echo "🌐 Environnement: PRODUCTION"
else
    ENV_FILE=".env"
    echo "💻 Environnement: LOCAL"
fi
echo ""

# Vérifier le fichier .env
echo "1. Fichier .env ($ENV_FILE):"
if [ -f "$ENV_FILE" ]; then
    grep -E '^(DOMAIN|PUBLIC_URL)=' "$ENV_FILE" || echo "   ⚠️  Variables DOMAIN ou PUBLIC_URL manquantes!"
else
    echo "   ❌ Fichier .env non trouvé!"
fi
echo ""

# Vérifier la variable dans le container (si Docker est disponible)
if command -v docker &> /dev/null; then
    echo "2. Container gateway:"
    if docker ps --format '{{.Names}}' | grep -q meeshy-gateway; then
        docker exec meeshy-gateway env | grep -E '^(DOMAIN|PUBLIC_URL)=' || echo "   ⚠️  Variables non chargées dans le container!"
    else
        echo "   ⚠️  Container meeshy-gateway non trouvé ou arrêté"
    fi
    echo ""

    # Vérifier les logs
    echo "3. Logs AttachmentService:"
    if docker ps --format '{{.Names}}' | grep -q meeshy-gateway; then
        docker logs meeshy-gateway 2>&1 | grep 'AttachmentService.*Configuration' | tail -1 || echo "   ⚠️  Logs AttachmentService non trouvés"
    fi
    echo ""

    # Vérifier un exemple d'URL en base
    echo "4. Exemple d'URL en base:"
    if docker ps --format '{{.Names}}' | grep -q meeshy-database; then
        URL=$(docker exec meeshy-database mongosh meeshy --quiet --eval \
          'const att = db.MessageAttachment.findOne({}, {fileUrl: 1}); if(att) print(att.fileUrl); else print("");' 2>/dev/null)
        if [ -n "$URL" ]; then
            echo "   $URL"
        else
            echo "   ℹ️  Aucun attachement trouvé en base"
        fi
    else
        echo "   ⚠️  Container meeshy-database non trouvé"
    fi
    echo ""
fi

# Analyse
echo "=== Analyse ==="

# Récupérer les valeurs
if [ -f "$ENV_FILE" ]; then
    DOMAIN_ENV=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"')
    PUBLIC_URL_ENV=$(grep '^PUBLIC_URL=' "$ENV_FILE" | cut -d'=' -f2 | tr -d '"')
fi

if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q meeshy-gateway; then
    PUBLIC_URL_CONTAINER=$(docker exec meeshy-gateway env 2>/dev/null | grep '^PUBLIC_URL=' | cut -d'=' -f2)
    DOMAIN_CONTAINER=$(docker exec meeshy-gateway env 2>/dev/null | grep '^DOMAIN=' | cut -d'=' -f2)
fi

echo "Fichier .env:"
echo "  DOMAIN: ${DOMAIN_ENV:-non défini}"
echo "  PUBLIC_URL: ${PUBLIC_URL_ENV:-non défini}"
echo ""

if [ -n "$PUBLIC_URL_CONTAINER" ] || [ -n "$DOMAIN_CONTAINER" ]; then
    echo "Container gateway:"
    echo "  DOMAIN: ${DOMAIN_CONTAINER:-non défini}"
    echo "  PUBLIC_URL: ${PUBLIC_URL_CONTAINER:-non défini}"
    echo ""
fi

# Vérifications
ERRORS=0

if [ "$PUBLIC_URL_CONTAINER" == "https://gate.meeshy.me" ] || [ "$PUBLIC_URL_CONTAINER" == "https://gate.$DOMAIN_CONTAINER" ]; then
    echo "✅ PUBLIC_URL correcte dans le container!"
elif [ -z "$PUBLIC_URL_CONTAINER" ]; then
    if [ "$DOMAIN_CONTAINER" == "meeshy.me" ]; then
        echo "✅ DOMAIN correcte, PUBLIC_URL sera auto-détectée comme https://gate.meeshy.me"
    else
        echo "⚠️  PUBLIC_URL non définie dans le container et DOMAIN=$DOMAIN_CONTAINER"
        ERRORS=$((ERRORS + 1))
    fi
elif [ "$PUBLIC_URL_CONTAINER" == *"localhost"* ]; then
    echo "❌ PUBLIC_URL pointe vers localhost!"
    ERRORS=$((ERRORS + 1))
elif [ "$PUBLIC_URL_CONTAINER" == *"gateway:3000"* ]; then
    echo "❌ PUBLIC_URL pointe vers le container interne!"
    ERRORS=$((ERRORS + 1))
else
    echo "⚠️  PUBLIC_URL inattendue: $PUBLIC_URL_CONTAINER"
    ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "🎉 Configuration correcte!"
    exit 0
else
    echo "❗ $ERRORS problème(s) détecté(s)"
    echo ""
    echo "Pour corriger:"
    echo "  1. Éditer $ENV_FILE et s'assurer que:"
    echo "     DOMAIN=meeshy.me"
    echo "     PUBLIC_URL=https://gate.meeshy.me"
    echo "  2. Redémarrer le gateway:"
    echo "     docker compose -f docker-compose.traefik.yml up -d gateway"
    exit 1
fi

