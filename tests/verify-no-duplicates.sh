#!/bin/bash

# Script de vérification rapide pour confirmer l'absence de doublons

echo ""
echo "============================================"
echo "🔍 VÉRIFICATION ABSENCE DE DOUBLONS"
echo "============================================"
echo ""

# Lancer le test et analyser les résultats
OUTPUT=$(pnpm ts-node authenticated-translation-test.ts admin admin123 meeshy 2>&1)

# Extraire les résultats
TOTAL_EVENTS=$(echo "$OUTPUT" | grep "Événements 'message:translation' reçus:" | awk '{print $4}')
UNIQUE_LANGS=$(echo "$OUTPUT" | grep "Langues uniques:" | cut -d':' -f2 | tr ',' '\n' | wc -w | xargs)

echo "📊 Résultats:"
echo "   Événements reçus: $TOTAL_EVENTS"
echo "   Langues uniques: $UNIQUE_LANGS"
echo ""

# Vérifier s'il y a des doublons
if [ "$TOTAL_EVENTS" = "$UNIQUE_LANGS" ]; then
    echo "✅ AUCUN DOUBLON DÉTECTÉ"
    echo "   Chaque langue est reçue exactement 1 fois"
    echo ""
    echo "Détail par langue:"
    echo "$OUTPUT" | grep -A10 "Détail par langue:" | tail -n+2 | head -10
    echo ""
    echo "============================================"
    echo "✅ TEST RÉUSSI - Système fonctionnel"
    echo "============================================"
    exit 0
else
    echo "⚠️  DOUBLONS DÉTECTÉS"
    echo "   Événements: $TOTAL_EVENTS"
    echo "   Langues uniques: $UNIQUE_LANGS"
    echo "   Différence: $((TOTAL_EVENTS - UNIQUE_LANGS)) doublon(s)"
    echo ""
    echo "Détail par langue:"
    echo "$OUTPUT" | grep -A10 "Détail par langue:" | tail -n+2 | head -10
    echo ""
    echo "============================================"
    echo "❌ TEST ÉCHOUÉ - Doublons présents"
    echo "============================================"
    exit 1
fi
