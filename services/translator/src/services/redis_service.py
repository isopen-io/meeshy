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
        try:
            # Vérifier si un event loop est en cours d'exécution
            loop = asyncio.get_running_loop()
            if self._cleanup_task is None or self._cleanup_task.done():
                self._cleanup_task = loop.create_task(self._memory_cleanup_loop())
        except RuntimeError:
            # Pas d'event loop en cours, la task sera créée au premier appel async
            logger.debug("[REDIS] Pas d'event loop actif, cleanup task sera créée plus tard")

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
# CACHE TRADUCTION TEXTE - BASÉ SUR HASH
# ═══════════════════════════════════════════════════════════════════════════════

import hashlib


class TranslationCacheService:
    """
    Service de cache pour les traductions texte.
    Utilise un hash du contenu pour éviter les retraductions.

    Stratégie:
    - Clé = hash(text + source_lang + target_lang + model_type)
    - TTL = 1 mois (le texte lui-même indique s'il y a eu modification)
    - Si le texte change → hash change → cache miss automatique
    - Réutilisation cross-message/conversation pour textes identiques
    - Fonctionne aussi au niveau segment (chaque segment est caché individuellement)
    """

    def __init__(self, redis_service: RedisService, settings=None):
        self.redis = redis_service
        self.settings = settings

        # Pattern de clé - basé uniquement sur le hash du contenu
        self.key_pattern = "translation:text:{hash}"

        # TTL = 1 mois (30 jours = 2592000 secondes)
        # Le texte lui-même sert d'indicateur de modification
        self.ttl_translation = int(os.getenv("TRANSLATION_CACHE_TTL", "2592000"))

        # Modèle premium pour éviter retraduction
        self.premium_models = ["premium", "1.3B", "nllb-200-1.3B"]

    def _compute_hash(self, text: str, source_lang: str, target_lang: str, model_type: str = "premium") -> str:
        """
        Calcule un hash unique pour une traduction.
        Combine: texte + langues + modèle
        """
        content = f"{text}|{source_lang}|{target_lang}|{model_type}"
        return hashlib.sha256(content.encode()).hexdigest()[:32]

    async def get_translation(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        model_type: str = "premium"
    ) -> Optional[Dict[str, Any]]:
        """
        Récupère une traduction depuis le cache.

        Args:
            text: Texte source (peut être un message complet ou un segment)
            source_lang: Langue source
            target_lang: Langue cible
            model_type: Type de modèle

        Returns:
            Dict avec 'translated_text', 'model_type', 'cached_at' ou None
        """
        # Vérifier par hash du texte
        cache_hash = self._compute_hash(text, source_lang, target_lang, model_type)
        key = self.key_pattern.format(hash=cache_hash)

        data = await self.redis.get(key)
        if data:
            logger.debug(f"[CACHE] ✅ Hit: {source_lang}→{target_lang} (hash={cache_hash[:8]})")
            return json.loads(data)

        # Si on demande un modèle non-premium, vérifier si une version premium existe
        if model_type not in self.premium_models:
            premium_hash = self._compute_hash(text, source_lang, target_lang, "premium")
            premium_key = self.key_pattern.format(hash=premium_hash)
            premium_data = await self.redis.get(premium_key)
            if premium_data:
                logger.debug(f"[CACHE] ✅ Hit premium: {source_lang}→{target_lang}")
                return json.loads(premium_data)

        return None

    async def set_translation(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        translated_text: str,
        model_type: str = "premium",
        ttl: int = None
    ) -> bool:
        """
        Sauvegarde une traduction dans le cache.

        Args:
            text: Texte source (peut être un message complet ou un segment)
            source_lang: Langue source
            target_lang: Langue cible
            translated_text: Texte traduit
            model_type: Type de modèle
            ttl: Durée de vie en secondes (défaut: 1 mois)
        """
        cache_hash = self._compute_hash(text, source_lang, target_lang, model_type)
        key = self.key_pattern.format(hash=cache_hash)
        ttl = ttl or self.ttl_translation

        cache_data = {
            "translated_text": translated_text,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "model_type": model_type,
            "cached_at": datetime.now().isoformat(),
            "text_hash": cache_hash
        }

        # Stocker par hash (réutilisation cross-message/segment)
        success = await self.redis.setex(key, ttl, json.dumps(cache_data))

        if success:
            logger.debug(f"[CACHE] 💾 Traduction mise en cache: {source_lang}→{target_lang} (hash={cache_hash[:8]})")

        return success

    async def get_batch_translations(
        self,
        texts: List[str],
        source_lang: str,
        target_lang: str,
        model_type: str = "premium"
    ) -> Dict[str, Optional[Dict[str, Any]]]:
        """
        Récupère plusieurs traductions en batch.

        Returns:
            Dict[text -> cached_result or None]
        """
        results = {}
        for text in texts:
            cached = await self.get_translation(text, source_lang, target_lang, model_type)
            results[text] = cached
        return results

    async def invalidate_translation(self, text: str, source_lang: str, target_lang: str, model_type: str = "premium") -> bool:
        """Invalide une traduction du cache"""
        cache_hash = self._compute_hash(text, source_lang, target_lang, model_type)
        key = self.key_pattern.format(hash=cache_hash)
        return await self.redis.delete(key)

    def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du cache traduction"""
        return {
            **self.redis.get_stats(),
            "ttl_translation": self.ttl_translation,
            "premium_models": self.premium_models
        }


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS POUR CACHE AUDIO
# ═══════════════════════════════════════════════════════════════════════════════

class AudioCacheService:
    """
    Service de cache spécialisé pour les transcriptions et traductions audio.
    Utilise un hash du contenu audio pour éviter les retraductions.

    Stratégie:
    - Transcription: indexée par hash audio (pas attachmentId) pour réutilisation cross-conversation
    - Audio traduit: indexé par hash audio + langue cible
    - Profil vocal: indexé par userId
    """

    def __init__(self, redis_service: RedisService, settings=None):
        self.redis = redis_service
        self.settings = settings

        # Patterns de clés - basés sur HASH audio (pas attachmentId)
        self.key_transcription_by_hash = "audio:transcription:hash:{audio_hash}"
        self.key_translated_audio_by_hash = "audio:translation:hash:{audio_hash}:{lang}"
        self.key_audio_hash_mapping = "audio:hash:mapping:{attachment_id}"  # attachment_id -> audio_hash
        self.key_voice_profile = "voice:profile:{user_id}"

        # Patterns legacy (pour compatibilité)
        self.key_transcription = "audio:transcription:{attachment_id}"
        self.key_translated_audio = "audio:translation:{attachment_id}:{lang}"

        # TTL par défaut - 1 mois pour transcription/audio traduit
        self.ttl_transcription = 2592000  # 30 jours (audio réutilisable cross-conversation)
        self.ttl_translated_audio = 2592000  # 30 jours (audio traduit réutilisable)
        self.ttl_voice_profile = 7776000  # 90 jours (3 mois)
        self.ttl_hash_mapping = 2592000  # 30 jours pour le mapping

        if settings:
            self.ttl_voice_profile = getattr(settings, 'voice_profile_cache_ttl', self.ttl_voice_profile)

    # ─────────────────────────────────────────────────────────────────────────
    # HASH AUDIO - Permet réutilisation cross-conversation
    # ─────────────────────────────────────────────────────────────────────────

    def compute_audio_hash(self, audio_path: str) -> str:
        """
        Calcule un hash SHA256 du contenu audio.
        Permet d'identifier un audio identique même dans différentes conversations.
        """
        try:
            with open(audio_path, 'rb') as f:
                content = f.read()
            return hashlib.sha256(content).hexdigest()[:32]
        except Exception as e:
            logger.warning(f"[CACHE] Impossible de hasher l'audio: {e}")
            # Fallback sur le chemin
            return hashlib.sha256(audio_path.encode()).hexdigest()[:32]

    async def get_or_compute_audio_hash(self, attachment_id: str, audio_path: str) -> str:
        """
        Récupère le hash audio depuis le cache ou le calcule.
        Stocke le mapping attachment_id -> audio_hash pour référence rapide.
        """
        # Vérifier si le mapping existe
        mapping_key = self.key_audio_hash_mapping.format(attachment_id=attachment_id)
        cached_hash = await self.redis.get(mapping_key)
        if cached_hash:
            return cached_hash

        # Calculer le hash
        audio_hash = self.compute_audio_hash(audio_path)

        # Stocker le mapping
        await self.redis.setex(mapping_key, self.ttl_hash_mapping, audio_hash)

        return audio_hash

    # ─────────────────────────────────────────────────────────────────────────
    # TRANSCRIPTION STT - BASÉE SUR HASH AUDIO
    # ─────────────────────────────────────────────────────────────────────────

    async def get_transcription_by_hash(self, audio_hash: str) -> Optional[Dict[str, Any]]:
        """Récupère une transcription par hash audio (cross-conversation)"""
        key = self.key_transcription_by_hash.format(audio_hash=audio_hash)
        data = await self.redis.get(key)
        if data:
            logger.debug(f"[CACHE] ✅ Hit transcription (hash={audio_hash[:8]})")
            return json.loads(data)
        return None

    async def set_transcription_by_hash(self, audio_hash: str, transcription: Dict[str, Any], ttl: int = None) -> bool:
        """Sauvegarde une transcription par hash audio"""
        key = self.key_transcription_by_hash.format(audio_hash=audio_hash)
        ttl = ttl or self.ttl_transcription
        success = await self.redis.setex(key, ttl, json.dumps(transcription))
        if success:
            logger.debug(f"[CACHE] 💾 Transcription mise en cache (hash={audio_hash[:8]})")
        return success

    async def get_transcription(self, attachment_id: str, audio_path: str = None) -> Optional[Dict[str, Any]]:
        """
        Récupère une transcription - essaie d'abord par hash si audio_path fourni.
        Compatible cross-conversation.
        """
        # Si on a le chemin audio, utiliser le hash
        if audio_path:
            audio_hash = await self.get_or_compute_audio_hash(attachment_id, audio_path)
            cached = await self.get_transcription_by_hash(audio_hash)
            if cached:
                return cached

        # Fallback sur attachment_id (legacy)
        key = self.key_transcription.format(attachment_id=attachment_id)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_transcription(self, attachment_id: str, transcription: Dict[str, Any], audio_path: str = None, ttl: int = None) -> bool:
        """Sauvegarde une transcription - utilise hash si audio_path fourni"""
        ttl = ttl or self.ttl_transcription

        # Stocker par hash si audio_path fourni
        if audio_path:
            audio_hash = await self.get_or_compute_audio_hash(attachment_id, audio_path)
            await self.set_transcription_by_hash(audio_hash, transcription, ttl)

        # Stocker aussi par attachment_id (legacy compatibility)
        key = self.key_transcription.format(attachment_id=attachment_id)
        return await self.redis.setex(key, ttl, json.dumps(transcription))

    # ─────────────────────────────────────────────────────────────────────────
    # AUDIO TRADUIT - BASÉ SUR HASH AUDIO
    # ─────────────────────────────────────────────────────────────────────────

    async def get_translated_audio_by_hash(self, audio_hash: str, lang: str) -> Optional[Dict[str, Any]]:
        """Récupère un audio traduit par hash (cross-conversation)"""
        key = self.key_translated_audio_by_hash.format(audio_hash=audio_hash, lang=lang)
        data = await self.redis.get(key)
        if data:
            logger.debug(f"[CACHE] ✅ Hit audio traduit {lang} (hash={audio_hash[:8]})")
            return json.loads(data)
        return None

    async def set_translated_audio_by_hash(self, audio_hash: str, lang: str, audio_data: Dict[str, Any], ttl: int = None) -> bool:
        """Sauvegarde un audio traduit par hash"""
        key = self.key_translated_audio_by_hash.format(audio_hash=audio_hash, lang=lang)
        ttl = ttl or self.ttl_translated_audio
        success = await self.redis.setex(key, ttl, json.dumps(audio_data))
        if success:
            logger.debug(f"[CACHE] 💾 Audio traduit {lang} mis en cache (hash={audio_hash[:8]})")
        return success

    async def get_all_translated_audio_by_hash(self, audio_hash: str, target_languages: List[str]) -> Dict[str, Optional[Dict[str, Any]]]:
        """
        Récupère toutes les traductions audio existantes pour un hash.
        Retourne un dict {lang: audio_data or None}
        """
        results = {}
        for lang in target_languages:
            results[lang] = await self.get_translated_audio_by_hash(audio_hash, lang)
        return results

    async def get_translated_audio(self, attachment_id: str, lang: str, audio_path: str = None) -> Optional[Dict[str, Any]]:
        """
        Récupère un audio traduit - essaie d'abord par hash.
        Compatible cross-conversation.
        """
        # Si on a le chemin audio, utiliser le hash
        if audio_path:
            audio_hash = await self.get_or_compute_audio_hash(attachment_id, audio_path)
            cached = await self.get_translated_audio_by_hash(audio_hash, lang)
            if cached:
                return cached

        # Fallback sur attachment_id (legacy)
        key = self.key_translated_audio.format(attachment_id=attachment_id, lang=lang)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_translated_audio(self, attachment_id: str, lang: str, audio_data: Dict[str, Any], audio_path: str = None, ttl: int = None) -> bool:
        """Sauvegarde un audio traduit - utilise hash si audio_path fourni"""
        ttl = ttl or self.ttl_translated_audio

        # Stocker par hash si audio_path fourni
        if audio_path:
            audio_hash = await self.get_or_compute_audio_hash(attachment_id, audio_path)
            await self.set_translated_audio_by_hash(audio_hash, lang, audio_data, ttl)

        # Stocker aussi par attachment_id (legacy compatibility)
        key = self.key_translated_audio.format(attachment_id=attachment_id, lang=lang)
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
# SINGLETON HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

_redis_service: Optional[RedisService] = None
_audio_cache: Optional[AudioCacheService] = None
_translation_cache: Optional[TranslationCacheService] = None


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


def get_translation_cache_service(settings=None) -> TranslationCacheService:
    """Retourne l'instance singleton du service de cache traduction"""
    global _translation_cache
    if _translation_cache is None:
        _translation_cache = TranslationCacheService(get_redis_service(), settings)
    return _translation_cache
