#!/bin/bash

# Script de diagnostic réseau pour le service de traduction Meeshy
# Aide à identifier les problèmes de connectivité avec Hugging Face

echo "🔍 Diagnostic réseau pour le service de traduction Meeshy"
echo "=================================================="

# Vérifier la connectivité de base
echo "📡 Test de connectivité de base..."
if ping -c 3 8.8.8.8 > /dev/null 2>&1; then
    echo "✅ Connectivité Internet OK"
else
    echo "❌ Pas de connectivité Internet"
fi

# Vérifier la résolution DNS
echo "🌐 Test de résolution DNS..."
if nslookup huggingface.co > /dev/null 2>&1; then
    echo "✅ Résolution DNS OK pour huggingface.co"
else
    echo "❌ Problème de résolution DNS pour huggingface.co"
fi

# Vérifier la connectivité vers Hugging Face
echo "🤗 Test de connectivité vers Hugging Face..."
if curl -s --connect-timeout 10 https://huggingface.co > /dev/null; then
    echo "✅ Connectivité vers huggingface.co OK"
else
    echo "❌ Pas de connectivité vers huggingface.co"
fi

# Vérifier la connectivité vers XetHub
echo "📦 Test de connectivité vers XetHub..."
if curl -s --connect-timeout 10 https://transfer.xethub.hf.co > /dev/null; then
    echo "✅ Connectivité vers XetHub OK"
else
    echo "❌ Pas de connectivité vers XetHub"
fi

# Vérifier les certificats SSL
echo "🔒 Test des certificats SSL..."
if [ -f "/etc/ssl/certs/ca-certificates.crt" ]; then
    if curl -s --connect-timeout 10 --cacert /etc/ssl/certs/ca-certificates.crt https://huggingface.co > /dev/null; then
        echo "✅ Certificats SSL OK"
    else
        echo "❌ Problème avec les certificats SSL"
    fi
elif [ -f "/etc/ssl/certs/ca-bundle.crt" ]; then
    if curl -s --connect-timeout 10 --cacert /etc/ssl/certs/ca-bundle.crt https://huggingface.co > /dev/null; then
        echo "✅ Certificats SSL OK (ca-bundle.crt)"
    else
        echo "❌ Problème avec les certificats SSL (ca-bundle.crt)"
    fi
else
    echo "❌ Aucun fichier de certificats SSL trouvé"
fi

# Vérifier les variables d'environnement
echo "⚙️ Variables d'environnement réseau..."
echo "HF_HUB_ENABLE_HF_TRANSFER: ${HF_HUB_ENABLE_HF_TRANSFER:-non défini}"
echo "HF_HUB_DOWNLOAD_TIMEOUT: ${HF_HUB_DOWNLOAD_TIMEOUT:-non défini}"
echo "HF_HUB_DOWNLOAD_MAX_RETRIES: ${HF_HUB_DOWNLOAD_MAX_RETRIES:-non défini}"
echo "REQUESTS_CA_BUNDLE: ${REQUESTS_CA_BUNDLE:-non défini}"
echo "CURL_CA_BUNDLE: ${CURL_CA_BUNDLE:-non défini}"

# Vérifier le cache des modèles
echo "📁 État du cache des modèles..."
if [ -d "/app/models" ]; then
    echo "✅ Dossier /app/models existe"
    echo "📊 Taille du cache: $(du -sh /app/models 2>/dev/null | cut -f1 || echo 'impossible de calculer')"
    echo "📋 Contenu: $(ls -la /app/models | wc -l) fichiers"
else
    echo "❌ Dossier /app/models n'existe pas"
fi

# Test de téléchargement simple
echo "⬇️ Test de téléchargement simple..."
if curl -s --connect-timeout 30 -o /tmp/test_download https://huggingface.co/api/models/Helsinki-NLP/opus-mt-en-fr; then
    echo "✅ Téléchargement simple OK"
    rm -f /tmp/test_download
else
    echo "❌ Échec du téléchargement simple"
fi

# Vérifier les ports ouverts
echo "🔌 Ports en écoute..."
if command -v lsof > /dev/null 2>&1; then
    echo "📋 Ports en écoute:"
    lsof -i -P -n | grep LISTEN || echo "Aucun port en écoute détecté"
else
    echo "⚠️ lsof non disponible"
fi

# Vérifier la mémoire disponible
echo "💾 État de la mémoire..."
free -h 2>/dev/null || echo "⚠️ Impossible de vérifier la mémoire"

# Vérifier l'espace disque
echo "💿 Espace disque disponible..."
df -h /app 2>/dev/null || echo "⚠️ Impossible de vérifier l'espace disque"

echo "=================================================="
echo "🔍 Diagnostic terminé"
echo ""
echo "💡 Conseils de résolution:"
echo "1. Si pas de connectivité Internet: vérifier la configuration réseau Docker"
echo "2. Si problème DNS: ajouter --dns 8.8.8.8 au docker run"
echo "3. Si problème SSL: vérifier les certificats dans le container"
echo "4. Si problème XetHub: essayer avec HF_HUB_ENABLE_HF_TRANSFER=0"
echo "5. Si espace disque insuffisant: augmenter l'espace alloué au container"
echo "6. Le service retournera des messages d'échec clairs si les modèles ne se chargent pas"
