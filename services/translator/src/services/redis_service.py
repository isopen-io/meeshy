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
from collections import OrderedDict
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime

from services.task_privacy import cache_allowed, current_message_id

logger = logging.getLogger(__name__)

MAX_MEMORY_CACHE_SIZE = 500

# Flag de disponibilité Redis
REDIS_AVAILABLE = False

try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
    logger.info("✅ [REDIS] redis-py async disponible")
except ImportError:
    logger.warning("⚠️ [REDIS] redis-py non disponible - cache mémoire uniquement")


# #13102 — la SEULE forme d'empreinte audio sous laquelle on range : 32
# hexadécimaux, ceux que `compute_audio_hash` tire des OCTETS du fichier. Une
# empreinte de repli (chemin, identifiant) ne range rien. Liste d'admission,
# jamais de refus.
REAL_AUDIO_HASH = re.compile(r"^[0-9a-f]{32}$")
SYNTHETIC_HASH_PREFIX = "synthetic:"


def is_real_audio_hash(audio_hash: Optional[str]) -> bool:
    return isinstance(audio_hash, str) and REAL_AUDIO_HASH.match(audio_hash) is not None


class ErasureNotConfirmedError(RuntimeError):
    """#13102 — Redis n'a pas confirmé un effacement : rien ne s'acquitte."""


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
        self.memory_cache: OrderedDict[str, CacheEntry] = OrderedDict()
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
            # Log seulement le type et message pour éviter problème event loop
            error_msg = f"{type(e).__name__}: {str(e)}"
            logger.warning(f"[REDIS] ⚠️ Connexion échouée ({self.connection_attempts}/{self.max_connection_attempts}): {error_msg}")

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
                # Log seulement le type pour éviter problème event loop
                # Ne pas essayer de convertir en string car l'exception peut contenir
                # des références à des Tasks/Futures liés à un autre event loop
                error_type = type(e).__name__
                logger.warning(f"[REDIS] Erreur get ({error_type}) - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire (LRU: move to end on access)
        entry = self.memory_cache.get(key)
        if entry and entry.expires_at > time.time():
            self.memory_cache.move_to_end(key)
            return entry.value

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
                # Log seulement le type pour éviter problème event loop
                error_type = type(e).__name__
                logger.warning(f"[REDIS] Erreur set ({error_type}) - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire (LRU, bounded)
        expires_at = time.time() + (ex if ex else 3600)  # 1 heure par défaut
        self.memory_cache[key] = CacheEntry(value=value, expires_at=expires_at)
        self.memory_cache.move_to_end(key)
        while len(self.memory_cache) > MAX_MEMORY_CACHE_SIZE:
            self.memory_cache.popitem(last=False)
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
                # Log seulement le type pour éviter problème event loop
                error_type = type(e).__name__
                logger.warning(f"[REDIS] Erreur delete ({error_type}) - fallback mémoire")
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
                # Log seulement le type pour éviter problème event loop
                error_type = type(e).__name__
                logger.warning(f"[REDIS] Erreur keys ({error_type}) - fallback mémoire")
                self._handle_redis_error()

        # Fallback cache mémoire avec regex
        regex_pattern = "^" + pattern.replace("*", ".*") + "$"
        regex = re.compile(regex_pattern)
        return [key for key in self.memory_cache.keys() if regex.match(key)]

    # ─────────────────────────────────────────────────────────────────────────
    # EFFACEMENT CONFIRMÉ (#13102) — jamais de repli silencieux
    # ─────────────────────────────────────────────────────────────────────────

    def _require_redis(self) -> None:
        if self.permanently_disabled or not self.is_redis_available or not self.redis:
            raise ErasureNotConfirmedError("Redis indisponible : l'effacement ne peut pas être confirmé")

    async def get_confirmed(self, key: str) -> Optional[str]:
        """Lit dans REDIS seulement : une lecture mémoire ne dirait rien de ce que Redis garde."""
        self._require_redis()
        try:
            return await self.redis.get(key)
        except Exception as error:
            raise ErasureNotConfirmedError(type(error).__name__) from error

    async def setex_durable(self, key: str, seconds: int, value: str) -> bool:
        """
        #13102 — écrit dans REDIS seulement, jamais dans le cache mémoire de
        repli : un contenu indexé pour l'effacement ne doit vivre que là où
        l'effacement le retrouve et le confirme. Redis indisponible ⇒ rien
        n'est rangé (`False`) — le cache n'est qu'une accélération.
        """
        if self.permanently_disabled or not self.is_redis_available or not self.redis:
            return False
        try:
            await self.redis.setex(key, seconds, value)
            return True
        except Exception as e:
            logger.warning(f"[REDIS] Écriture non rangée ({type(e).__name__}) — aucun repli mémoire")
            self._handle_redis_error()
            return False

    async def write_atomic(self, operations: List[tuple]) -> bool:
        """
        #13102 — une transaction Redis (`MULTI`/`EXEC`) : `("setex", clé, ttl,
        valeur)` et `("sadd", ensemble, membre, ttl)` (le membre ET l'échéance de
        l'ensemble). Tout ou rien ; jamais de repli mémoire.
        """
        if self.permanently_disabled or not self.is_redis_available or not self.redis:
            return False
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                for operation in operations:
                    if operation[0] == "setex":
                        _, key, seconds, value = operation
                        pipe.setex(key, seconds, value)
                    elif operation[0] == "sadd":
                        _, key, member, seconds = operation
                        pipe.sadd(key, member)
                        pipe.expire(key, seconds)
                    else:
                        raise ValueError(f"opération inconnue: {operation[0]}")
                await pipe.execute()
            return True
        except Exception as e:
            logger.warning(f"[REDIS] Écriture transactionnelle non rangée ({type(e).__name__})")
            self._handle_redis_error()
            return False

    async def smembers_confirmed(self, key: str) -> List[str]:
        """Les membres d'un ensemble d'index, dans Redis seulement (jamais KEYS ni SCAN)."""
        self._require_redis()
        try:
            return sorted(await self.redis.smembers(key))
        except Exception as error:
            raise ErasureNotConfirmedError(type(error).__name__) from error

    async def setex_durable_atomic(self, entries: List[tuple]) -> bool:
        """
        #13102 — plusieurs clés (un contenu ET son index d'effacement) écrites
        dans UNE transaction Redis (`MULTI`/`EXEC`) : toutes ou aucune. Un
        contenu ne reste jamais rangé sans l'index qui permet de l'oublier.
        """
        if self.permanently_disabled or not self.is_redis_available or not self.redis:
            return False
        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                for key, seconds, value in entries:
                    pipe.setex(key, seconds, value)
                results = await pipe.execute()
            return all(bool(result) for result in results)
        except Exception as e:
            logger.warning(f"[REDIS] Écriture transactionnelle non rangée ({type(e).__name__})")
            self._handle_redis_error()
            return False

    async def delete_confirmed(self, keys: List[str]) -> int:
        """
        Efface ces clés de Redis ET du cache mémoire de repli, et rend combien
        Redis en a effacé. Lève si Redis ne CONFIRME pas : l'appelant ne doit
        jamais acquitter un effacement qui n'a pas eu lieu.
        """
        for key in keys:
            self.memory_cache.pop(key, None)
        if not keys:
            return 0
        self._require_redis()
        try:
            return int(await self.redis.delete(*keys))
        except Exception as error:
            raise ErasureNotConfirmedError(type(error).__name__) from error

    async def exists(self, key: str) -> bool:
        """Vérifie si une clé existe"""
        # Essayer Redis si disponible
        if not self.permanently_disabled and self.is_redis_available and self.redis:
            try:
                return await self.redis.exists(key) > 0
            except Exception as e:
                # Log seulement le type pour éviter problème event loop
                error_type = type(e).__name__
                logger.warning(f"[REDIS] Erreur exists ({error_type}) - fallback mémoire")
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
                # Log seulement le type pour éviter problème event loop
                error_type = type(e).__name__
                logger.warning(f"[REDIS] Erreur ttl ({error_type}) - fallback mémoire")
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

        # Pattern de clé - basé uniquement sur le hash du contenu. Le segment de
        # révision change quand le PIPELINE change ce qu'il rend pour un même texte :
        # `v2` = traduction phrase par phrase (#9723). Les entrées `translation:text:`
        # écrites d'un seul tenant (phrases perdues) ne sont plus jamais resservies
        # et expirent d'elles-mêmes (TTL 30 jours).
        # v3 (#13102) : les entrées v2, rangées sans index d'effacement, ne sont plus jamais servies.
        self.key_pattern = "translation:text:v3:{hash}"
        # #13102 — l'index des traductions d'un message : un ENSEMBLE d'empreintes.
        self.message_index_pattern = "translation:v3:message:{message_id}"

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
        # #13102 — une tâche au repos ne lit rien du cache.
        if not cache_allowed():
            return None

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
        ttl: int = None,
        message_id: Optional[str] = None
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
        # #13102 — ni le texte ni sa traduction d'une tâche au repos ne se rangent.
        if not cache_allowed():
            return False

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

        # Stocker par hash (réutilisation cross-message/segment). #13102 — avec
        # l'index du message qui l'a fait naître (explicite, sinon celui de la
        # tâche), dans la MÊME transaction et au même TTL : jamais un contenu
        # sans son index. Sans message nommé, RIEN n'est rangé.
        message_id = message_id or current_message_id()
        if not message_id:
            return False
        success = await self.redis.write_atomic([
            ("setex", key, ttl, json.dumps(cache_data)),
            ("sadd", self.message_index_pattern.format(message_id=message_id), cache_hash, ttl),
        ])

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

    async def forget_message(self, message_id: str) -> int:
        """
        #13102 — oublie les traductions rangées pour ce message (texte entier et
        segments), par l'index posé à leur écriture : aucun texte n'a besoin de
        voyager pour être oublié. Idempotent.
        """
        index_key = self.message_index_pattern.format(message_id=message_id)
        hashes = await self.redis.smembers_confirmed(index_key)
        deleted = await self.redis.delete_confirmed([self.key_pattern.format(hash=h) for h in hashes])
        await self.redis.delete_confirmed([index_key])
        return deleted

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
        # v3 (#13102) : les entrées d'avant, rangées sans correspondance garantie, ne sont plus servies.
        self.key_transcription_by_hash = "audio:v3:transcription:hash:{audio_hash}"
        self.key_translated_audio_by_hash = "audio:v3:translation:hash:{audio_hash}:{lang}"
        self.key_audio_hash_mapping = "audio:v3:hash:mapping:{attachment_id}"  # attachment_id -> audio_hash
        # #13102 — les langues rangées, en ENSEMBLES : l'oubli les lit sans balayer Redis.
        self.key_hash_langs = "audio:v3:hash:langs:{audio_hash}"
        self.key_attachment_langs = "audio:v3:attachment:langs:{attachment_id}"
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
            # Log seulement le type et message pour éviter problème event loop
            error_msg = f"{type(e).__name__}: {str(e)}"
            logger.warning(f"[CACHE] Impossible de hasher l'audio ({error_msg})")
            # Repli sur le chemin, MARQUÉ synthétique : rien ne se range sous lui (#13102).
            return SYNTHETIC_HASH_PREFIX + hashlib.sha256(audio_path.encode()).hexdigest()[:32]

    async def get_or_compute_audio_hash(self, attachment_id: str, audio_path: str) -> str:
        """
        Récupère le hash audio depuis le cache ou le calcule.
        Stocke le mapping attachment_id -> audio_hash pour référence rapide.
        """
        # #13102 — une tâche au repos calcule l'empreinte sans rien ranger.
        if not cache_allowed():
            return self.compute_audio_hash(audio_path)

        # Vérifier si le mapping existe
        mapping_key = self.key_audio_hash_mapping.format(attachment_id=attachment_id)
        cached_hash = await self.redis.get(mapping_key)
        if cached_hash:
            return cached_hash

        # #13102 — la correspondance ne s'écrit plus seule : elle part dans la
        # même transaction que chaque contenu rangé sous l'empreinte
        # (`_set_by_hash_with_mapping`), avec un TTL au moins égal.
        return self.compute_audio_hash(audio_path)

    async def _set_by_hash_with_mapping(self, attachment_id: Optional[str], audio_hash: str, key: str, ttl: int, value: str, lang: Optional[str] = None) -> bool:
        """
        #13102 — un contenu rangé par empreinte audio et la correspondance
        `pièce → empreinte` qui permet de l'oublier, dans UNE transaction, la
        correspondance vivant au moins aussi longtemps que le contenu. Sans
        pièce nommée, ou sous une empreinte qui n'est pas celle des octets,
        rien n'est rangé.
        """
        if not cache_allowed() or not attachment_id or not is_real_audio_hash(audio_hash):
            return False
        mapping_key = self.key_audio_hash_mapping.format(attachment_id=attachment_id)
        index_ttl = max(ttl, self.ttl_hash_mapping)
        return await self.redis.write_atomic([
            ("setex", key, ttl, value),
            ("setex", mapping_key, index_ttl, audio_hash),
            *([("sadd", self.key_hash_langs.format(audio_hash=audio_hash), lang, index_ttl)] if lang else []),
        ])

    # ─────────────────────────────────────────────────────────────────────────
    # TRANSCRIPTION STT - BASÉE SUR HASH AUDIO
    # ─────────────────────────────────────────────────────────────────────────

    async def get_transcription_by_hash(self, audio_hash: str) -> Optional[Dict[str, Any]]:
        """Récupère une transcription par hash audio (cross-conversation)"""
        if not cache_allowed():
            return None
        key = self.key_transcription_by_hash.format(audio_hash=audio_hash)
        data = await self.redis.get(key)
        if data:
            logger.debug(f"[CACHE] ✅ Hit transcription (hash={audio_hash[:8]})")
            return json.loads(data)
        return None

    async def set_transcription_by_hash(self, audio_hash: str, transcription: Dict[str, Any], ttl: int = None, attachment_id: Optional[str] = None) -> bool:
        """Sauvegarde une transcription par hash audio, avec la correspondance de SA pièce (#13102)"""
        key = self.key_transcription_by_hash.format(audio_hash=audio_hash)
        ttl = ttl or self.ttl_transcription
        success = await self._set_by_hash_with_mapping(attachment_id, audio_hash, key, ttl, json.dumps(transcription))
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

        if not cache_allowed():
            return None

        # Fallback sur attachment_id (legacy)
        key = self.key_transcription.format(attachment_id=attachment_id)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_transcription(self, attachment_id: str, transcription: Dict[str, Any], audio_path: str = None, ttl: int = None) -> bool:
        """Sauvegarde une transcription - utilise hash si audio_path fourni"""
        if not cache_allowed():
            return False
        ttl = ttl or self.ttl_transcription

        # Stocker par hash si audio_path fourni
        if audio_path:
            audio_hash = await self.get_or_compute_audio_hash(attachment_id, audio_path)
            await self.set_transcription_by_hash(audio_hash, transcription, ttl, attachment_id=attachment_id)

        # Stocker aussi par attachment_id (legacy compatibility)
        key = self.key_transcription.format(attachment_id=attachment_id)
        return await self.redis.setex_durable(key, ttl, json.dumps(transcription))

    # ─────────────────────────────────────────────────────────────────────────
    # AUDIO TRADUIT - BASÉ SUR HASH AUDIO
    # ─────────────────────────────────────────────────────────────────────────

    async def get_translated_audio_by_hash(self, audio_hash: str, lang: str) -> Optional[Dict[str, Any]]:
        """Récupère un audio traduit par hash (cross-conversation)"""
        if not cache_allowed():
            return None
        key = self.key_translated_audio_by_hash.format(audio_hash=audio_hash, lang=lang)
        data = await self.redis.get(key)
        if data:
            logger.debug(f"[CACHE] ✅ Hit audio traduit {lang} (hash={audio_hash[:8]})")
            return json.loads(data)
        return None

    async def set_translated_audio_by_hash(self, audio_hash: str, lang: str, audio_data: Dict[str, Any], ttl: int = None, attachment_id: Optional[str] = None) -> bool:
        """Sauvegarde un audio traduit par hash, avec la correspondance de SA pièce (#13102)"""
        key = self.key_translated_audio_by_hash.format(audio_hash=audio_hash, lang=lang)
        ttl = ttl or self.ttl_translated_audio
        success = await self._set_by_hash_with_mapping(attachment_id, audio_hash, key, ttl, json.dumps(audio_data), lang=lang)
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

        if not cache_allowed():
            return None

        # Fallback sur attachment_id (legacy)
        key = self.key_translated_audio.format(attachment_id=attachment_id, lang=lang)
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def set_translated_audio(self, attachment_id: str, lang: str, audio_data: Dict[str, Any], audio_path: str = None, ttl: int = None) -> bool:
        """Sauvegarde un audio traduit - utilise hash si audio_path fourni"""
        if not cache_allowed():
            return False
        ttl = ttl or self.ttl_translated_audio

        # Stocker par hash si audio_path fourni
        if audio_path:
            audio_hash = await self.get_or_compute_audio_hash(attachment_id, audio_path)
            await self.set_translated_audio_by_hash(audio_hash, lang, audio_data, ttl, attachment_id=attachment_id)

        # Stocker aussi par attachment_id (legacy compatibility)
        key = self.key_translated_audio.format(attachment_id=attachment_id, lang=lang)
        return await self.redis.write_atomic([
            ("setex", key, ttl, json.dumps(audio_data)),
            ("sadd", self.key_attachment_langs.format(attachment_id=attachment_id), lang, ttl),
        ])

    async def forget_attachment(self, attachment_id: str) -> int:
        """
        #13102 — oublie tout ce que le translator a tiré d'une pièce effacée :
        la transcription et les pistes traduites (par empreinte audio et par
        identifiant, forme héritée) et la table de correspondance. Idempotent :
        une pièce déjà oubliée, ou jamais vue, ne fait rien.
        """
        mapping_key = self.key_audio_hash_mapping.format(attachment_id=attachment_id)
        attachment_langs_key = self.key_attachment_langs.format(attachment_id=attachment_id)
        audio_hash = await self.redis.get_confirmed(mapping_key)
        keys = [
            self.key_transcription.format(attachment_id=attachment_id),
            *(self.key_translated_audio.format(attachment_id=attachment_id, lang=lang) for lang in await self.redis.smembers_confirmed(attachment_langs_key)),
        ]
        indexes = [mapping_key, attachment_langs_key]
        if audio_hash:
            hash_langs_key = self.key_hash_langs.format(audio_hash=audio_hash)
            keys.append(self.key_transcription_by_hash.format(audio_hash=audio_hash))
            keys.extend(self.key_translated_audio_by_hash.format(audio_hash=audio_hash, lang=lang) for lang in await self.redis.smembers_confirmed(hash_langs_key))
            indexes.append(hash_langs_key)
        deleted = await self.redis.delete_confirmed(list(dict.fromkeys(keys)))
        await self.redis.delete_confirmed(indexes)
        return deleted

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
