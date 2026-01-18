"""
Module de cache de traductions
Responsabilités:
- Cache des traductions avec TTL
- Intégration Redis ou mémoire
- Vérification et mise en cache parallèle
- Optimisation des requêtes répétées
"""

import logging
import asyncio
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

# Import conditionnel du cache Redis
CACHE_AVAILABLE = False
try:
    from services.redis_service import get_translation_cache_service
    CACHE_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ Cache Redis non disponible")


class TranslationCache:
    """
    Gestionnaire de cache pour traductions
    Supporte Redis ou fallback mémoire locale
    """

    def __init__(self):
        """Initialise le gestionnaire de cache"""
        self._cache_service = None
        self._initialized = False

    async def initialize(self):
        """Initialise la connexion au cache Redis"""
        if not CACHE_AVAILABLE:
            logger.warning("Cache Redis non disponible, pas de mise en cache")
            return

        try:
            self._cache_service = get_translation_cache_service()
            self._initialized = True
            logger.info("✅ Cache Redis initialisé")
        except Exception as e:
            logger.warning(f"⚠️ Impossible d'initialiser le cache Redis: {e}")
            self._cache_service = None

    def is_available(self) -> bool:
        """Vérifie si le cache est disponible"""
        return self._initialized and self._cache_service is not None

    async def get_translation(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> Optional[Dict[str, Any]]:
        """
        Récupère une traduction depuis le cache

        Args:
            text: Texte source
            source_lang: Langue source
            target_lang: Langue cible
            model_type: Type de modèle utilisé

        Returns:
            Dict avec 'translated_text' si trouvé, None sinon
        """
        if not self.is_available():
            return None

        try:
            result = await self._cache_service.get_translation(
                text=text,
                source_lang=source_lang,
                target_lang=target_lang,
                model_type=model_type
            )
            return result
        except Exception as e:
            logger.debug(f"Erreur récupération cache: {e}")
            return None

    async def set_translation(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        translated_text: str,
        model_type: str,
        ttl: Optional[int] = None
    ):
        """
        Enregistre une traduction dans le cache

        Args:
            text: Texte source
            source_lang: Langue source
            target_lang: Langue cible
            translated_text: Texte traduit
            model_type: Type de modèle utilisé
            ttl: Time to live en secondes (optionnel)
        """
        if not self.is_available():
            return

        try:
            await self._cache_service.set_translation(
                text=text,
                source_lang=source_lang,
                target_lang=target_lang,
                translated_text=translated_text,
                model_type=model_type,
                ttl=ttl
            )
        except Exception as e:
            logger.debug(f"Erreur mise en cache: {e}")

    async def check_cache_batch(
        self,
        segments: List[Dict[str, Any]],
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> Tuple[List[Optional[Dict]], List[Tuple[int, str]]]:
        """
        Vérifie le cache pour plusieurs segments en parallèle

        Args:
            segments: Liste de segments à vérifier
            source_lang: Langue source
            target_lang: Langue cible
            model_type: Type de modèle

        Returns:
            Tuple: (résultats_cachés, segments_à_traduire)
                - résultats_cachés: Liste avec None ou dict pour chaque segment
                - segments_à_traduire: Liste de (index, texte) à traduire
        """
        if not self.is_available():
            # Pas de cache, tout à traduire
            segments_to_translate = []
            for i, seg in enumerate(segments):
                if seg.get('type') == 'line' and seg.get('text', '').strip():
                    segments_to_translate.append((i, seg.get('text', '')))
            return [None] * len(segments), segments_to_translate

        cached_results = [None] * len(segments)
        segments_to_translate = []

        async def check_segment(idx: int, segment: Dict) -> Tuple[int, Optional[Dict], str]:
            """Vérifie le cache pour un segment"""
            segment_type = segment.get('type', 'line')

            # Préserver les types spéciaux
            if segment_type in ['paragraph_break', 'separator', 'empty_line', 'code']:
                return (idx, segment, 'preserved')

            if segment_type == 'line':
                segment_text = segment.get('text', '')
                if not segment_text.strip():
                    return (idx, segment, 'empty')

                # Vérifier le cache
                cached = await self.get_translation(
                    text=segment_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    model_type=model_type
                )

                if cached:
                    return (idx, {'type': 'line', 'text': cached.get('translated_text', segment_text)}, 'cached')

                # Pas en cache, à traduire
                return (idx, segment_text, 'to_translate')

            return (idx, segment, 'preserved')

        # Vérifier en parallèle
        tasks = [check_segment(i, seg) for i, seg in enumerate(segments)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Traiter les résultats
        for result in results:
            if isinstance(result, Exception):
                continue

            idx, data, status = result

            if status in ['cached', 'preserved', 'empty']:
                cached_results[idx] = data
            elif status == 'to_translate':
                segments_to_translate.append((idx, data))

        return cached_results, segments_to_translate

    async def cache_batch_results(
        self,
        cache_items: List[Tuple[str, str]],
        source_lang: str,
        target_lang: str,
        model_type: str
    ):
        """
        Met en cache plusieurs résultats en parallèle (fire-and-forget)

        Args:
            cache_items: Liste de (texte_original, texte_traduit)
            source_lang: Langue source
            target_lang: Langue cible
            model_type: Type de modèle
        """
        if not self.is_available() or not cache_items:
            return

        async def cache_all():
            """Cache tous les items en parallèle"""
            tasks = []
            for orig_text, trans_text in cache_items:
                task = self.set_translation(
                    text=orig_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    translated_text=trans_text,
                    model_type=model_type
                )
                tasks.append(task)

            # Exécuter toutes les mises en cache sans bloquer
            await asyncio.gather(*tasks, return_exceptions=True)

        # Lancer en arrière-plan
        asyncio.create_task(cache_all())

    async def clear_cache(self):
        """Vide le cache (si supporté)"""
        if not self.is_available():
            return

        try:
            if hasattr(self._cache_service, 'clear'):
                await self._cache_service.clear()
                logger.info("✅ Cache vidé")
        except Exception as e:
            logger.warning(f"⚠️ Erreur vidage cache: {e}")

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du cache"""
        if not self.is_available():
            return {
                'cache_available': False,
                'provider': 'none'
            }

        try:
            if hasattr(self._cache_service, 'get_stats'):
                stats = await self._cache_service.get_stats()
                return {
                    'cache_available': True,
                    'provider': 'redis',
                    **stats
                }
        except Exception:
            pass

        return {
            'cache_available': True,
            'provider': 'redis',
            'stats': 'unavailable'
        }
