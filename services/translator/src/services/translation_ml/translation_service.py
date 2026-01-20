"""
Service de traduction ML - Façade orchestrateur
Responsabilités:
- API publique du service de traduction
- Coordination des modules (ModelLoader, TranslatorEngine, Cache)
- Gestion du cycle de vie (init, close)
- Statistiques et health check
"""

import logging
import time
import asyncio
import threading
from typing import Dict, Any, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor

from utils.text_segmentation import TextSegmenter

logger = logging.getLogger(__name__)


@dataclass
class TranslationResult:
    """Résultat d'une traduction unifié"""
    translated_text: str
    detected_language: str
    confidence: float
    model_used: str
    from_cache: bool
    processing_time: float
    source_channel: str


class TranslationService:
    """
    Façade orchestrateur pour le service de traduction ML
    Coordonne ModelLoader, TranslatorEngine et TranslationCache
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        model_loader,
        translator_engine,
        translation_cache,
        max_workers: int = 16
    ):
        """
        Initialise le service de traduction

        Args:
            model_loader: Instance ModelLoader
            translator_engine: Instance TranslatorEngine
            translation_cache: Instance TranslationCache
            max_workers: Nombre de workers pour ThreadPoolExecutor
        """
        if self._initialized:
            return

        self.model_loader = model_loader
        self.translator_engine = translator_engine
        self.translation_cache = translation_cache

        # Segmenteur de texte pour préservation de structure
        self.text_segmenter = TextSegmenter(max_segment_length=100)

        # Stats globales
        self.stats = {
            'translations_count': 0,
            'zmq_translations': 0,
            'rest_translations': 0,
            'websocket_translations': 0,
            'avg_processing_time': 0.0,
            'models_loaded': False,
            'startup_time': None
        }
        self.request_times = []

        # État d'initialisation
        self.is_initialized = False
        self.is_loading = False
        self._startup_lock = None  # Sera créé dans initialize()

        self._initialized = True
        logger.info("🤖 TranslationService créé (Singleton)")

    async def initialize(self) -> bool:
        """Initialise le service ML (modèles + cache)"""
        # Créer le lock dans le contexte async si nécessaire
        if self._startup_lock is None:
            self._startup_lock = asyncio.Lock()

        async with self._startup_lock:
            if self.is_initialized:
                logger.info("✅ Service ML déjà initialisé")
                return True

            if self.is_loading:
                logger.info("⏳ Initialisation ML en cours...")
                while self.is_loading and not self.is_initialized:
                    await asyncio.sleep(0.5)
                return self.is_initialized

            self.is_loading = True
            startup_start = time.time()

            try:
                logger.info("🚀 Initialisation du Service ML Unifié...")

                # Configurer l'environnement
                self.model_loader.configure_environment()

                # Initialiser le device
                device = self.model_loader.initialize_device()
                logger.info(f"⚙️ Device configuré: {device}")

                # Charger les modèles par ordre de priorité
                logger.info("📚 Chargement des modèles NLLB...")
                models_to_load = sorted(
                    self.model_loader.model_configs.items(),
                    key=lambda x: x[1]['priority']
                )

                for model_type, config in models_to_load:
                    try:
                        await self.model_loader.load_model(model_type)
                    except Exception as e:
                        logger.error(f"❌ Erreur chargement {model_type}: {e}")

                # Vérifier qu'au moins un modèle est chargé
                loaded_models = self.model_loader.get_loaded_models()
                if not loaded_models:
                    logger.error("❌ Aucun modèle ML chargé")
                    self.is_loading = False
                    return False

                # Initialiser le cache
                await self.translation_cache.initialize()

                # Finaliser
                startup_time = time.time() - startup_start
                self.stats['startup_time'] = startup_time
                self.stats['models_loaded'] = True
                self.is_initialized = True
                self.is_loading = False

                logger.info(f"✅ Service ML Unifié initialisé en {startup_time:.2f}s")
                logger.info(f"📊 Modèles chargés: {loaded_models}")
                logger.info("🎯 Prêt à servir tous les canaux: ZMQ, REST, WebSocket")

                return True

            except Exception as e:
                logger.error(f"❌ Erreur critique initialisation ML: {e}")
                self.is_loading = False
                return False

    async def translate(
        self,
        text: str,
        source_language: str = "auto",
        target_language: str = "en",
        model_type: str = "basic",
        source_channel: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Traduction simple d'un texte

        Args:
            text: Texte à traduire
            source_language: Langue source ('auto' pour détection)
            target_language: Langue cible
            model_type: Type de modèle ('basic', 'premium')
            source_channel: Canal source ('zmq', 'rest', 'websocket')

        Returns:
            Dict avec résultat de traduction
        """
        start_time = time.time()

        try:
            # Validation
            if not text.strip():
                raise ValueError("Text cannot be empty")

            # Vérifier initialisation
            if not self.is_initialized:
                logger.warning("Service ML non initialisé, utilisation du fallback")
                return await self._fallback_translate(
                    text, source_language, target_language, model_type, source_channel
                )

            # Fallback si modèle non disponible
            if not self.model_loader.is_model_loaded(model_type):
                available_models = self.model_loader.get_loaded_models()
                if available_models:
                    model_type = available_models[0]
                    logger.info(f"Modèle demandé non disponible, utilisation de: {model_type}")
                else:
                    return await self._fallback_translate(
                        text, source_language, target_language, model_type, source_channel
                    )

            # Détecter la langue source si nécessaire
            detected_lang = (
                source_language if source_language != "auto"
                else self.translator_engine.detect_language(text)
            )

            # Traduire
            translated_text = await self.translator_engine.translate_text(
                text, detected_lang, target_language, model_type
            )

            processing_time = time.time() - start_time
            self._update_stats(processing_time, source_channel)

            result = {
                'translated_text': translated_text,
                'detected_language': detected_lang,
                'confidence': 0.95,
                'model_used': f"{model_type}_ml",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel
            }

            logger.info(
                f"✅ [ML-{source_channel.upper()}] '{text[:20]}...' → "
                f"'{translated_text[:20]}...' ({processing_time:.3f}s)"
            )
            return result

        except Exception as e:
            logger.error(f"❌ Erreur traduction ML [{source_channel}]: {e}")
            return await self._fallback_translate(
                text, source_language, target_language, model_type, source_channel
            )

    async def translate_with_structure(
        self,
        text: str,
        source_language: str = "auto",
        target_language: str = "en",
        model_type: str = "basic",
        source_channel: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Traduction avec préservation de structure (paragraphes, emojis)

        AMÉLIORATION: Sélection automatique du modèle selon longueur
        OPTIMISATION: Batch ML + cache parallèle
        """
        start_time = time.time()

        try:
            # Validation
            if not text.strip():
                raise ValueError("Text cannot be empty")

            # Sélection automatique du modèle selon longueur
            text_length = len(text)
            original_model_type = model_type

            if text_length >= 200 and self.model_loader.is_model_loaded('premium'):
                model_type = 'premium'
            elif text_length >= 50 and self.model_loader.is_model_loaded('medium'):
                model_type = 'medium'
            elif not self.model_loader.is_model_loaded(model_type):
                available = self.model_loader.get_loaded_models()
                if available:
                    model_type = available[0]

            if model_type != original_model_type:
                logger.info(f"[STRUCTURED] Model switched: {original_model_type} → {model_type}")

            # Texte simple: utiliser traduction standard
            if len(text) <= 100 and '\n\n' not in text and not self.text_segmenter.extract_emojis(text)[1]:
                return await self.translate(text, source_language, target_language, model_type, source_channel)

            logger.info(f"[STRUCTURED] Starting structured translation: {len(text)} chars")

            # Vérifier initialisation
            if not self.is_initialized:
                return await self._fallback_translate(
                    text, source_language, target_language, model_type, source_channel
                )

            # Détecter langue
            detected_lang = (
                source_language if source_language != "auto"
                else self.translator_engine.detect_language(text)
            )

            # Segmenter le texte
            segments, emojis_map = self.text_segmenter.segment_text(text)
            logger.info(f"[STRUCTURED] Text segmented: {len(segments)} parts, {len(emojis_map)} emojis")

            # OPTIMISATION: Vérifier le cache en parallèle
            cache_hits = 0
            translated_segments, segments_to_translate = await self.translation_cache.check_cache_batch(
                segments, detected_lang, target_language, model_type
            )

            cache_hits = sum(1 for s in translated_segments if s is not None)

            # Traduire les segments non-cachés en BATCH
            if segments_to_translate:
                logger.info(
                    f"[BATCH-STRUCT] ⚡ {len(segments_to_translate)} segments à traduire "
                    f"en batch (cache hits: {cache_hits})"
                )

                indices = [item[0] for item in segments_to_translate]
                texts_to_translate = [item[1] for item in segments_to_translate]

                try:
                    # Appel BATCH ML
                    logger.info(f"[BATCH-STRUCT] 📤 Appel translator_engine.translate_batch()...")
                    translated_texts = await self.translator_engine.translate_batch(
                        texts_to_translate, detected_lang, target_language, model_type
                    )
                    logger.info(f"[BATCH-STRUCT] 📥 translate_batch retourné: {len(translated_texts)} résultats")

                    # Distribuer les résultats et mettre en cache
                    cache_items = []
                    for i, (idx, original_text) in enumerate(segments_to_translate):
                        translated_text = translated_texts[i] if i < len(translated_texts) else original_text
                        translated_segments[idx] = {'type': 'line', 'text': translated_text}
                        cache_items.append((original_text, translated_text))

                    # Cacher les résultats en arrière-plan
                    if cache_items:
                        await self.translation_cache.cache_batch_results(
                            cache_items, detected_lang, target_language, model_type
                        )

                except Exception as e:
                    logger.error(f"[BATCH-STRUCT] Erreur batch ML: {e}")
                    # Fallback individuel
                    for idx, text_to_trans in segments_to_translate:
                        try:
                            translated = await self.translator_engine.translate_text(
                                text_to_trans, detected_lang, target_language, model_type
                            )
                            translated_segments[idx] = {'type': 'line', 'text': translated}
                        except Exception:
                            translated_segments[idx] = {'type': 'line', 'text': text_to_trans}

            # Remplacer les None par segments originaux
            for i, seg in enumerate(translated_segments):
                if seg is None:
                    translated_segments[i] = segments[i]

            # Réassembler
            final_text = self.text_segmenter.reassemble_text(translated_segments, emojis_map)

            processing_time = time.time() - start_time
            self._update_stats(processing_time, source_channel)

            result = {
                'translated_text': final_text,
                'detected_language': detected_lang,
                'confidence': 0.95,
                'model_used': f"{model_type}_ml_structured",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel,
                'segments_count': len(segments),
                'emojis_count': len(emojis_map)
            }

            logger.info(
                f"✅ [ML-STRUCTURED-{source_channel.upper()}] {len(text)}→{len(final_text)} chars, "
                f"{len(segments)} segments, {len(emojis_map)} emojis ({processing_time:.3f}s)"
            )
            return result

        except Exception as e:
            logger.error(f"❌ Erreur traduction structurée [{source_channel}]: {e}")
            return await self.translate(text, source_language, target_language, model_type, source_channel)

    async def _fallback_translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        model_type: str,
        source_channel: str
    ) -> Dict[str, Any]:
        """Traduction de fallback si ML non disponible"""
        logger.warning(f"Utilisation du fallback pour {model_type} [{source_channel}]")

        # Dictionnaire simple
        translations = {
            ('fr', 'en'): {
                'bonjour': 'hello', 'comment': 'how', 'vous': 'you', 'allez': 'are'
            },
            ('en', 'fr'): {
                'hello': 'bonjour', 'how': 'comment', 'you': 'vous', 'are': 'êtes'
            }
        }

        # Traduction simple mot par mot
        lang_pair = (source_lang, target_lang)
        if lang_pair in translations:
            words = text.lower().split()
            translated_words = [translations[lang_pair].get(w, w) for w in words]
            translated_text = ' '.join(translated_words)
        else:
            translated_text = f"[FALLBACK-{source_lang}→{target_lang}] {text}"

        self._update_stats(0.001, source_channel)

        return {
            'translated_text': translated_text,
            'detected_language': source_lang,
            'confidence': 0.3,
            'model_used': f"{model_type}_fallback",
            'from_cache': False,
            'processing_time': 0.001,
            'source_channel': source_channel
        }

    def _update_stats(self, processing_time: float, source_channel: str):
        """Met à jour les statistiques globales"""
        self.stats['translations_count'] += 1

        if source_channel in ['zmq', 'rest', 'websocket']:
            self.stats[f'{source_channel}_translations'] += 1

        self.request_times.append(processing_time)

        if len(self.request_times) > 200:
            self.request_times = self.request_times[-200:]

        if self.request_times:
            self.stats['avg_processing_time'] = sum(self.request_times) / len(self.request_times)

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques globales"""
        return {
            'service_type': 'unified_ml',
            'is_singleton': True,
            'translations_count': self.stats['translations_count'],
            'zmq_translations': self.stats['zmq_translations'],
            'rest_translations': self.stats['rest_translations'],
            'websocket_translations': self.stats['websocket_translations'],
            'avg_processing_time': self.stats['avg_processing_time'],
            'models_loaded': {
                model_type: {
                    'name': self.model_loader.model_configs[model_type]['model_name'],
                    'description': self.model_loader.model_configs[model_type]['description'],
                    'local_path': str(self.model_loader.model_configs[model_type]['local_path']),
                    'is_local': self.model_loader.model_configs[model_type]['local_path'].exists()
                } for model_type in self.model_loader.get_loaded_models()
            },
            'is_initialized': self.is_initialized,
            'startup_time': self.stats['startup_time'],
            'device': self.model_loader.device
        }

    async def get_health(self) -> Dict[str, Any]:
        """Health check du service"""
        return {
            'status': 'healthy' if self.is_initialized else 'initializing',
            'models_count': len(self.model_loader.get_loaded_models()),
            'translations_served': self.stats['translations_count']
        }

    async def close(self):
        """Ferme proprement le service et libère les ressources"""
        logger.info("🛑 Arrêt du service ML unifié...")

        try:
            # Nettoyage des modules
            self.model_loader.cleanup()
            self.translator_engine.cleanup()

            # Réinitialiser état
            self.is_initialized = False
            self.is_loading = False
            self.stats['models_loaded'] = False

            # Réinitialiser singleton
            self._initialized = False
            TranslationService._instance = None

            logger.info("✅ Service ML unifié arrêté proprement")

        except Exception as e:
            logger.error(f"❌ Erreur lors de l'arrêt du service ML: {e}")
