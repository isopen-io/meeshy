"""
Service Redis avec fallback automatique sur cache mémoire

Ce wrapper permet au système de fonctionner avec ou sans Redis :
- Mode normal : Utilise Redis si disponible
- Mode dégradé : Utilise un cache mémoire si Redis est inaccessible

Avantages :
- Pas de crash si Redis est down
- Pas d'erreurs non gérées
- Transition transparente entre les modes
- Logs clairs pour identifier le mode actif
"""

import os
import asyncio
import logging
import time
import json
import re
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

# Flag de disponibilité Redis
REDIS_AVAILABLE = False

try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
    logger.info("✅ [REDIS] redis-py async disponible")
except ImportError:
    logger.warning("⚠️ [REDIS] redis-py non disponible - cache mémoire uniquement")


@dataclass
class CacheEntry:
    """Entrée de cache avec expiration"""
    value: str
    expires_at: float  # timestamp


class RedisService:
    """
    Service Redis avec fallback automatique sur cache mémoire

    Fonctionnalités:
    - Connexion Redis async avec retry
    - Fallback automatique sur cache mémoire
    - Nettoyage automatique des entrées expirées
    - Méthodes: get, set, setex, delete, keys
    """

    _instance = None

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, redis_url: str = None):
        if self._initialized:
            return

        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis: Optional[aioredis.Redis] = None
        self.memory_cache: Dict[str, CacheEntry] = {}
        self.is_redis_available = False
        self.permanently_disabled = not REDIS_AVAILABLE
        self.connection_attempts = 0
        self.max_connection_attempts = 3
        self._cleanup_task: Optional[asyncio.Task] = None
        self._initialized = True

        logger.info(f"[REDIS] Service initialisé: url={self.redis_url}")

    async def initialize(self) -> bool:
        """Initialise la connexion Redis"""
        if self.permanently_disabled:
            logger.info("[REDIS] 💾 Mode cache mémoire uniquement (Redis désactivé)")
            self._start_memory_cleanup()
            return True

        try:
            self.redis = aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=False
            )

            # Test de connexion
            await self.redis.ping()
            self.is_redis_available = True
            self.connection_attempts = 0
            logger.info("[REDIS] ✅ Redis connecté avec succès")

            # Démarrer le nettoyage mémoire en backup
            self._start_memory_cleanup()
            return True

        except Exception as e:
            self.connection_attempts += 1
            logger.warning(f"[REDIS] ⚠️ Connexion échouée ({self.connection_attempts}/{self.max_connection_attempts}): {e}")

            if self.connection_attempts >= self.max_connection_attempts:
                self.permanently_disabled = True
                logger.warning("[REDIS] ⚠️ Max tentatives atteintes - mode cache mémoire permanent")

            self.is_redis_available = False
            self._start_memory_cleanup()
            return True  # On continue avec le cache mémoire

    def _start_memory_cleanup(self):
        """Démarre le nettoyage automatique du cache mémoire"""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._memory_cleanup_loop())

    async def _memory_cleanup_loop(self):
        """Boucle de nettoyage du cache mémoire"""
        while True:
            try:
                await asyncio.sleep(60)  # Toutes les 60 secondes
                now = time.time()
                expired_keys = [
                    key for key, entry in self.memory_cache.items()
                    if entry.expires_at < now
                ]
                for key in expired_keys:
                    del self.memory_cache[key]

                if expired_keys:
                    logger.debug(f"[REDIS] 🧹 {len(expired_keys)} entrées expirées supprimées du cache mémoire")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[REDIS] Erreur cleanup: {e}")

    async def get(self, key: str) -> Optional[str]:
        """Récupère une valeur (Redis ou mémoire)"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                value = await self.redis.get(key)
                return value
            except Exception as e:
                logger.warning(f"[REDIS] Erreur get: {e} - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire
        entry = self.memory_cache.get(key)
        if entry and entry.expires_at > time.time():
            return entry.value

        # Supprimer si expiré
        if entry:
            del self.memory_cache[key]

        return None

    async def set(self, key: str, value: str, ex: int = None) -> bool:
        """Définit une valeur (Redis ou mémoire)"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                if ex:
                    await self.redis.setex(key, ex, value)
                else:
                    await self.redis.set(key, value)
                return True
            except Exception as e:
                logger.warning(f"[REDIS] Erreur set: {e} - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire
        expires_at = time.time() + (ex if ex else 3600)  # 1 heure par défaut
        self.memory_cache[key] = CacheEntry(value=value, expires_at=expires_at)
        return True

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        """Définit une valeur avec expiration"""
        return await self.set(key, value, ex=seconds)

    async def delete(self, key: str) -> bool:
        """Supprime une clé"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                await self.redis.delete(key)
                return True
            except Exception as e:
                logger.warning(f"[REDIS] Erreur delete: {e} - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire
        if key in self.memory_cache:
            del self.memory_cache[key]
        return True

    async def keys(self, pattern: str) -> List[str]:
        """Récupère les clés correspondant à un pattern"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                keys = await self.redis.keys(pattern)
                return keys
            except Exception as e:
                logger.warning(f"[REDIS] Erreur keys: {e} - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire avec regex
        regex_pattern = "^" + pattern.replace("*", ".*") + "$"
        regex = re.compile(regex_pattern)
        return [key for key in self.memory_cache.keys() if regex.match(key)]

    async def exists(self, key: str) -> bool:
        """Vérifie si une clé existe"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                return await self.redis.exists(key) > 0
            except Exception as e:
                logger.warning(f"[REDIS] Erreur exists: {e} - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire
        entry = self.memory_cache.get(key)
        if entry and entry.expires_at > time.time():
            return True
        return False

    async def ttl(self, key: str) -> int:
        """Récupère le TTL d'une clé en secondes"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                return await self.redis.ttl(key)
            except Exception as e:
                logger.warning(f"[REDIS] Erreur ttl: {e} - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire
        entry = self.memory_cache.get(key)
        if entry:
            remaining = int(entry.expires_at - time.time())
            return max(0, remaining)
        return -2  # Clé n'existe pas

    def _handle_redis_error(self):
        """Gère une erreur Redis"""
        self.connection_attempts += 1
        if self.connection_attempts >= self.max_connection_attempts:
            self.permanently_disabled = True
            self.is_redis_available = False
            logger.warning("[REDIS] ⚠️ Trop d'erreurs - passage permanent en cache mémoire")

    def is_available(self) -> bool:
        """Vérifie si Redis est disponible"""
        return not self.permanently_disabled and self.is_redis_available

    def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du cache"""
        return {
            "mode": "Redis" if self.is_available() else "Memory",
            "redis_available": self.is_available(),
            "memory_entries": len(self.memory_cache),
            "permanently_disabled": self.permanently_disabled,
            "connection_attempts": self.connection_attempts
        }

    async def close(self):
        """Ferme la connexion Redis et nettoie"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        if self.redis:
            await self.redis.close()
            self.redis = None

        self.memory_cache.clear()
        logger.info("[REDIS] 🛑 Service Redis fermé")


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS POUR CACHE AUDIO
# ═══════════════════════════════════════════════════════════════════════════════

class AudioCacheService:
    """
    Service de cache spécialisé pour les transcriptions et traductions audio
    Utilise les patterns de clés définis dans settings.py
    """

    def __init__(self, redis_service: RedisService, settings=None):
        self.redis = redis_service
        self.settings = settings

        # Patterns de clés par défaut
        self.key_transcription = "audio:transcription:{attachment_id}"
        self.key_translated_audio = "audio:translation:{attachment_id}:{lang}"
        self.key_voice_profile = "voice:profile:{user_id}"

        # TTL par défaut
        self.ttl_transcription = 3600  # 1 heure
        self.ttl_translated_audio = 3600  # 1 heure
        self.ttl_voice_profile = 7776000  # 90 jours (3 mois)

        if settings:
            self.key_transcription = getattr(settings, 'redis_key_transcription', self.key_transcription)
            self.key_translated_audio = getattr(settings, 'redis_key_translated_audio', self.key_translated_audio)
            self.key_voice_profile = getattr(settings, 'redis_key_voice_profile', self.key_voice_profile)
            self.ttl_voice_profile = getattr(settings, 'voice_profile_cache_ttl', self.ttl_voice_profile)

    # ─────────────────────────────────────────────────────────────────────────
    # TRANSCRIPTION STT
    # ─────────────────────────────────────────────────────────────────────────

    async def get_transcription(self, attachment_id: str) -> Optional[Dict[str, Any]]:
        """Récupère une transcription depuis le cache"""
        key = self.key_transcription.format(attachment_id=attachment_id)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_transcription(self, attachment_id: str, transcription: Dict[str, Any], ttl: int = None) -> bool:
        """Sauvegarde une transcription dans le cache"""
        key = self.key_transcription.format(attachment_id=attachment_id)
        ttl = ttl or self.ttl_transcription
        return await self.redis.setex(key, ttl, json.dumps(transcription))

    # ─────────────────────────────────────────────────────────────────────────
    # AUDIO TRADUIT
    # ─────────────────────────────────────────────────────────────────────────

    async def get_translated_audio(self, attachment_id: str, lang: str) -> Optional[Dict[str, Any]]:
        """Récupère les métadonnées d'un audio traduit depuis le cache"""
        key = self.key_translated_audio.format(attachment_id=attachment_id, lang=lang)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_translated_audio(self, attachment_id: str, lang: str, audio_data: Dict[str, Any], ttl: int = None) -> bool:
        """Sauvegarde les métadonnées d'un audio traduit dans le cache"""
        key = self.key_translated_audio.format(attachment_id=attachment_id, lang=lang)
        ttl = ttl or self.ttl_translated_audio
        return await self.redis.setex(key, ttl, json.dumps(audio_data))

    # ─────────────────────────────────────────────────────────────────────────
    # PROFIL VOCAL
    # ─────────────────────────────────────────────────────────────────────────

    async def get_voice_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Récupère un profil vocal depuis le cache"""
        key = self.key_voice_profile.format(user_id=user_id)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_voice_profile(self, user_id: str, profile: Dict[str, Any], ttl: int = None) -> bool:
        """Sauvegarde un profil vocal dans le cache (TTL: 3 mois par défaut)"""
        key = self.key_voice_profile.format(user_id=user_id)
        ttl = ttl or self.ttl_voice_profile
        return await self.redis.setex(key, ttl, json.dumps(profile))

    async def delete_voice_profile(self, user_id: str) -> bool:
        """Supprime un profil vocal du cache"""
        key = self.key_voice_profile.format(user_id=user_id)
        return await self.redis.delete(key)

    def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du cache audio"""
        return {
            **self.redis.get_stats(),
            "ttl_transcription": self.ttl_transcription,
            "ttl_translated_audio": self.ttl_translated_audio,
            "ttl_voice_profile": self.ttl_voice_profile
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SINGLETON HELPER
# ═══════════════════════════════════════════════════════════════════════════════

_redis_service: Optional[RedisService] = None
_audio_cache: Optional[AudioCacheService] = None


def get_redis_service() -> RedisService:
    """Retourne l'instance singleton du service Redis"""
    global _redis_service
    if _redis_service is None:
        _redis_service = RedisService()
    return _redis_service


def get_audio_cache_service(settings=None) -> AudioCacheService:
    """Retourne l'instance singleton du service de cache audio"""
    global _audio_cache
    if _audio_cache is None:
        _audio_cache = AudioCacheService(get_redis_service(), settings)
    return _audio_cache
