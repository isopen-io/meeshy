#!/bin/bash
# Script simple pour vérifier le cache WAV

CACHE_DIR="/Users/smpceo/Documents/v2_meeshy/services/translator/models/wav_cache"
MAX_AGE_DAYS=7

echo ""
echo "============================================================"
echo "📊 STATISTIQUES DU CACHE WAV"
echo "============================================================"
echo ""
echo "📁 Répertoire: $CACHE_DIR"

# Vérifier si le répertoire existe
if [ ! -d "$CACHE_DIR" ]; then
    echo "❌ Répertoire n'existe pas encore"
    exit 0
fi

# Compter les fichiers WAV
FILE_COUNT=$(find "$CACHE_DIR" -name "*.wav" 2>/dev/null | wc -l | tr -d ' ')
echo "📄 Nombre de fichiers: $FILE_COUNT"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo ""
    echo "⚠️  Cache vide - aucune conversion effectuée récemment"
    exit 0
fi

# Calculer la taille totale
TOTAL_SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
echo "💾 Taille totale: $TOTAL_SIZE"

echo ""
echo "============================================================"
echo "📋 CONTENU DU CACHE"
echo "============================================================"
echo ""

# Lister les fichiers avec leur âge
for file in "$CACHE_DIR"/*.wav 2>/dev/null; do
    if [ -f "$file" ]; then
        FILENAME=$(basename "$file")

        # Calculer l'âge en jours
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            FILE_TIME=$(stat -f %m "$file")
            CURRENT_TIME=$(date +%s)
        else
            # Linux
            FILE_TIME=$(stat -c %Y "$file")
            CURRENT_TIME=$(date +%s)
        fi

        AGE_SECONDS=$((CURRENT_TIME - FILE_TIME))
        AGE_DAYS=$(echo "scale=1; $AGE_SECONDS / 86400" | bc)

        # Taille du fichier
        if [[ "$OSTYPE" == "darwin"* ]]; then
            SIZE=$(stat -f %z "$file")
        else
            SIZE=$(stat -c %s "$file")
        fi
        SIZE_KB=$(echo "scale=1; $SIZE / 1024" | bc)

        # Statut
        if (( $(echo "$AGE_DAYS < $MAX_AGE_DAYS" | bc -l) )); then
            STATUS="🟢"
        else
            STATUS="🔴"
        fi

        echo "$STATUS $FILENAME"
        echo "   Age: ${AGE_DAYS} jours | Taille: ${SIZE_KB} KB"
        echo ""
    fi
done

echo "============================================================"
echo "✅ Analyse terminée"
echo "============================================================"
echo ""
