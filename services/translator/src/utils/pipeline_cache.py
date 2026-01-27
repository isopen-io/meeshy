"""
Cache LRU pour pipelines de traduction
Gère efficacement les paires de langues fréquentes avec éviction automatique
"""

import logging
import threading
from collections import OrderedDict
from typing import Optional, Tuple, Any
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class CacheStats:
    """Statistiques du cache"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    total_requests: int = 0

    @property
    def hit_rate(self) -> float:
        """Taux de hit du cache en %"""
        if self.total_requests == 0:
            return 0.0
        return (self.hits / self.total_requests) * 100


class LRUPipelineCache:
    """
    Cache LRU thread-safe pour pipelines de traduction

    Stratégie:
    - Garde les N paires (modèle + src_lang + tgt_lang) les plus utilisées
    - Éviction automatique des paires les moins récemment utilisées
    - Thread-safe pour accès concurrent
    - Métriques détaillées (hits, misses, evictions)

    Exemples:
        >>> cache = LRUPipelineCache(max_size=50)
        >>> pipeline = cache.get("basic", "fra_Latn", "eng_Latn")
        >>> if pipeline is None:
        ...     pipeline = create_new_pipeline()
        ...     cache.put("basic", "fra_Latn", "eng_Latn", pipeline)
    """

    def __init__(self, max_size: int = 50):
        """
        Initialise le cache LRU

        Args:
            max_size: Nombre maximum de pipelines en cache (défaut: 50)
        """
        self.max_size = max_size
        self._cache: OrderedDict[str, Any] = OrderedDict()
        self._lock = threading.Lock()
        self._stats = CacheStats()

        # Timestamp pour métriques
        self._last_stats_log = time.time()
        self._stats_log_interval = 300  # Log stats toutes les 5 minutes

        logger.info(f"🗂️  LRUPipelineCache initialisé (max_size={max_size})")

    def _make_key(self, model_type: str, source_lang: str, target_lang: str) -> str:
        """
        Crée une clé unique pour la combinaison modèle + langues

        Args:
            model_type: Type de modèle ('basic', 'premium', etc.)
            source_lang: Code langue source (ex: 'fra_Latn')
            target_lang: Code langue cible (ex: 'eng_Latn')

        Returns:
            Clé unique pour le cache
        """
        return f"{model_type}:{source_lang}→{target_lang}"

    def get(self, model_type: str, source_lang: str, target_lang: str) -> Optional[Any]:
        """
        Récupère un pipeline du cache

        Args:
            model_type: Type de modèle
            source_lang: Langue source
            target_lang: Langue cible

        Returns:
            Pipeline si trouvé, None sinon
        """
        key = self._make_key(model_type, source_lang, target_lang)

        with self._lock:
            self._stats.total_requests += 1

            if key in self._cache:
                # HIT: déplacer en fin (marquer comme récemment utilisé)
                self._cache.move_to_end(key)
                self._stats.hits += 1

                logger.debug(
                    f"✅ Cache HIT: {key} "
                    f"(hit_rate: {self._stats.hit_rate:.1f}%)"
                )

                self._maybe_log_stats()
                return self._cache[key]
            else:
                # MISS
                self._stats.misses += 1

                logger.debug(
                    f"❌ Cache MISS: {key} "
                    f"(hit_rate: {self._stats.hit_rate:.1f}%)"
                )

                self._maybe_log_stats()
                return None

    def put(
        self,
        model_type: str,
        source_lang: str,
        target_lang: str,
        pipeline: Any
    ) -> None:
        """
        Ajoute un pipeline au cache

        Args:
            model_type: Type de modèle
            source_lang: Langue source
            target_lang: Langue cible
            pipeline: Pipeline à cacher
        """
        key = self._make_key(model_type, source_lang, target_lang)

        with self._lock:
            # Si déjà présent, déplacer en fin
            if key in self._cache:
                self._cache.move_to_end(key)
                self._cache[key] = pipeline
                logger.debug(f"🔄 Cache UPDATE: {key}")
                return

            # Vérifier limite de taille
            if len(self._cache) >= self.max_size:
                # Éviction: supprimer l'élément le plus ancien (FIFO)
                evicted_key, _ = self._cache.popitem(last=False)
                self._stats.evictions += 1

                logger.info(
                    f"🗑️  Cache EVICTION: {evicted_key} "
                    f"(cache_size: {len(self._cache)}/{self.max_size})"
                )

            # Ajouter le nouveau pipeline
            self._cache[key] = pipeline

            logger.info(
                f"✅ Cache PUT: {key} "
                f"(cache_size: {len(self._cache)}/{self.max_size})"
            )

    def _maybe_log_stats(self) -> None:
        """Log des statistiques périodiquement"""
        now = time.time()

        if now - self._last_stats_log >= self._stats_log_interval:
            self.log_stats()
            self._last_stats_log = now

    def log_stats(self) -> None:
        """Log les statistiques détaillées du cache"""
        logger.info(
            f"📊 CACHE STATS | "
            f"Requests: {self._stats.total_requests} | "
            f"Hit rate: {self._stats.hit_rate:.1f}% "
            f"({self._stats.hits} hits, {self._stats.misses} misses) | "
            f"Evictions: {self._stats.evictions} | "
            f"Size: {len(self._cache)}/{self.max_size}"
        )

    def get_stats(self) -> CacheStats:
        """
        Récupère les statistiques actuelles

        Returns:
            CacheStats avec métriques détaillées
        """
        with self._lock:
            return CacheStats(
                hits=self._stats.hits,
                misses=self._stats.misses,
                evictions=self._stats.evictions,
                total_requests=self._stats.total_requests
            )

    def get_top_pairs(self, n: int = 10) -> list[Tuple[str, str]]:
        """
        Retourne les N paires les plus récemment utilisées

        Args:
            n: Nombre de paires à retourner

        Returns:
            Liste de tuples (key, position) triés par récence
        """
        with self._lock:
            # OrderedDict: dernier = plus récent
            items = list(self._cache.items())[-n:]
            return [(key, idx) for idx, (key, _) in enumerate(items, 1)]

    def clear(self) -> None:
        """Vide le cache complètement"""
        with self._lock:
            self._cache.clear()
            logger.info("🧹 Cache vidé complètement")

    def remove(self, model_type: str, source_lang: str, target_lang: str) -> bool:
        """
        Supprime une paire spécifique du cache

        Args:
            model_type: Type de modèle
            source_lang: Langue source
            target_lang: Langue cible

        Returns:
            True si supprimé, False si pas trouvé
        """
        key = self._make_key(model_type, source_lang, target_lang)

        with self._lock:
            if key in self._cache:
                del self._cache[key]
                logger.info(f"🗑️  Cache REMOVE: {key}")
                return True
            return False

    def __len__(self) -> int:
        """Retourne le nombre d'éléments dans le cache"""
        with self._lock:
            return len(self._cache)

    def __repr__(self) -> str:
        """Représentation string du cache"""
        stats = self.get_stats()
        return (
            f"LRUPipelineCache("
            f"size={len(self)}/{self.max_size}, "
            f"hit_rate={stats.hit_rate:.1f}%, "
            f"evictions={stats.evictions})"
        )
