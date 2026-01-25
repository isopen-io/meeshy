#!/bin/bash
set -e

echo "[TRANSLATOR] Demarrage du service Translator (ML uniquement - Redis cache)..."

# =============================================================================
# FIX VOLUME PERMISSIONS AND SWITCH TO NON-ROOT USER
# =============================================================================
# Docker named volumes are created with root ownership. This section fixes
# permissions on mounted volumes before switching to the 'translator' user.
# =============================================================================

fix_volume_permissions() {
    echo "[TRANSLATOR] Verification et correction des permissions des volumes..."

    # List of directories that may be mounted as volumes
    VOLUME_DIRS=(
        "/workspace/models"
        "/workspace/cache"
        "/workspace/logs"
    )

    for dir in "${VOLUME_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            # Check if directory is owned by root (UID 0)
            CURRENT_OWNER=$(stat -c '%u' "$dir" 2>/dev/null || echo "unknown")
            if [ "$CURRENT_OWNER" = "0" ]; then
                echo "[TRANSLATOR] Correction des permissions pour $dir (owned by root)..."
                chown -R translator:translator "$dir"
                chmod -R 755 "$dir"
                echo "[TRANSLATOR] Permissions corrigees pour $dir"
            else
                echo "[TRANSLATOR] Permissions OK pour $dir (owner UID: $CURRENT_OWNER)"
            fi
        else
            echo "[TRANSLATOR] Creation du repertoire $dir..."
            mkdir -p "$dir"
            chown -R translator:translator "$dir"
            chmod -R 755 "$dir"
        fi
    done

    echo "[TRANSLATOR] Verification des permissions terminee"
}

# Only fix permissions if running as root
if [ "$(id -u)" = "0" ]; then
    echo "[TRANSLATOR] Execution en tant que root, correction des permissions..."
    fix_volume_permissions

    echo "[TRANSLATOR] Passage a l'utilisateur translator..."
    exec gosu translator "$0" "$@"
fi

# From here, we are running as 'translator' user
echo "[TRANSLATOR] Execution en tant que: $(id)"

# Attendre que Redis soit disponible (optionnel - l'application gère les reconnexions)
wait_for_redis() {
    if [ -n "$REDIS_HOST" ]; then
        echo "[TRANSLATOR] Attente de Redis sur $REDIS_HOST:$REDIS_PORT..."

        MAX_RETRIES=5
        RETRY_COUNT=0

        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
                echo "[TRANSLATOR] Redis est accessible"
                return 0
            fi

            echo "[TRANSLATOR] Redis non accessible, tentative $((RETRY_COUNT + 1))/$MAX_RETRIES..."
            sleep 2
            RETRY_COUNT=$((RETRY_COUNT + 1))
        done

        echo "[TRANSLATOR] ATTENTION: Redis non accessible après $MAX_RETRIES tentatives"
        echo "[TRANSLATOR] Le service démarrera sans cache Redis"
    fi
}

# Fonction principale
main() {
    echo "[TRANSLATOR] Initialisation du service ML..."

    # Vérifier Redis (non bloquant)
    wait_for_redis || true

    # Les modèles ML sont téléchargés automatiquement par l'application Python
    echo "[TRANSLATOR] Demarrage de l application Translator (ML Service)..."

    # Demarrer l application Python
    exec python3 -u src/main.py
}

# Executer la fonction principale
main