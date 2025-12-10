#!/bin/bash

# Script pour générer les images Open Graph pour Meeshy
# Ces images seront utilisées pour les aperçus de partage sur les réseaux sociaux

# Configuration
WIDTH=1200
HEIGHT=630
OUTPUT_DIR="public/images"

# Créer le dossier de sortie s'il n'existe pas
mkdir -p "$OUTPUT_DIR"

echo "🎨 Génération des images Open Graph pour Meeshy..."

# Fonction pour générer une image avec ImageMagick
generate_og_image() {
    local filename=$1
    local title=$2
    local subtitle=$3
    local bg_color=$4
    
    echo "Génération de $filename..."
    
    # Créer une image avec un dégradé de fond et du texte
    convert -size ${WIDTH}x${HEIGHT} \
        -background "$bg_color" \
        -fill white \
        -font "Arial-Bold" \
        -pointsize 72 \
        -gravity center \
        -annotate +0-50 "$title" \
        -pointsize 36 \
        -fill "#E5E7EB" \
        -annotate +0+50 "$subtitle" \
        "$OUTPUT_DIR/$filename"
}

# Générer les différentes images Open Graph
generate_og_image "meeshy-og-default.jpg" \
    "Meeshy" \
    "Messagerie Multilingue en Temps Réel" \
    "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)"

generate_og_image "meeshy-og-affiliate.jpg" \
    "Rejoignez Meeshy" \
    "Invitation d'un ami" \
    "linear-gradient(135deg, #10B981 0%, #3B82F6 100%)"

generate_og_image "meeshy-og-conversation.jpg" \
    "Conversation Meeshy" \
    "Rejoignez la discussion" \
    "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)"

generate_og_image "meeshy-og-join.jpg" \
    "Rejoindre Meeshy" \
    "Connectez-vous avec le monde" \
    "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)"

generate_og_image "meeshy-og-signin.jpg" \
    "Inscription Meeshy" \
    "Créez votre compte" \
    "linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)"

echo "✅ Images Open Graph générées avec succès !"
echo "📁 Images créées dans le dossier: $OUTPUT_DIR"
echo ""
echo "📋 Fichiers générés:"
ls -la "$OUTPUT_DIR"/meeshy-og-*.jpg
