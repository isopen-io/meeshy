"""
Module moteur de traduction ML
Responsabilités:
- Logique de traduction ML (batch et individuelle)
- Détection de langue
- Gestion des pipelines thread-local
- Optimisations performance (inference mode, batch processing)
- Découpage intelligent de textes longs
"""

import logging
import asyncio
import os
import threading
import re
from typing import List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor

from config.settings import LANGUAGE_MAPPINGS

logger = logging.getLogger(__name__)

try:
    from langdetect import detect_langs, DetectorFactory, LangDetectException
    DetectorFactory.seed = 0  # déterministe
    _LANGDETECT_OK = True
except ImportError:
    _LANGDETECT_OK = False

DEFAULT_DETECT_LANGUAGE = os.getenv("TRANSLATOR_DEFAULT_DETECT_LANG", "fr")
try:
    DETECT_MIN_CONFIDENCE = float(os.getenv("TRANSLATOR_DETECT_MIN_CONFIDENCE", "0.80"))
except ValueError:
    DETECT_MIN_CONFIDENCE = 0.80


# ═══════════════════════════════════════════════════════════════════════════
# PRÉSERVATION DES LIENS HTTP(S)
# NLLB corromprait les URLs (domaines/segments traduits comme des mots). On les
# masque par un marqueur emoji-délimité (copié verbatim par NLLB, comme les
# emojis) avant traduction, puis on les restaure intactes après.
# ═══════════════════════════════════════════════════════════════════════════
_URL_PATTERN = re.compile(r'https?://\S+')


def mask_urls(text: str) -> Tuple[str, List[str]]:
    """Remplace chaque URL HTTP(S) par un marqueur 🔗{i}🔗.

    Retourne `(texte_masqué, urls)` où `urls[i]` est l'URL d'origine du marqueur i.
    """
    urls: List[str] = []

    def _replace(match: "re.Match[str]") -> str:
        urls.append(match.group(0))
        return f'🔗{len(urls) - 1}🔗'

    return _URL_PATTERN.sub(_replace, text), urls


def restore_urls(text: str, urls: List[str]) -> str:
    """Restaure les URLs masquées par `mask_urls`.

    Tolère un espacement éventuellement inséré par NLLB autour du marqueur.
    """
    for index, url in enumerate(urls):
        text = re.sub(r'🔗\s*' + str(index) + r'\s*🔗', lambda _m: url, text)
    return text


def smart_split_text(text: str, max_chars: int = 200) -> List[str]:
    """
    Découpe intelligemment un texte long en morceaux aux ponctuations naturelles.

    Stratégie de découpage (par ordre de préférence):
    1. Aux points, points d'exclamation, points d'interrogation (. ! ?)
    2. Aux points-virgules et deux-points (; :)
    3. Aux virgules (,)
    4. Aux espaces si aucune ponctuation
    5. Force le découpage si vraiment trop long

    Args:
        text: Texte à découper
        max_chars: Taille maximale de chaque morceau (défaut: 200 caractères)

    Returns:
        Liste de morceaux de texte (≤ max_chars chacun)

    Exemples:
        >>> smart_split_text("Bonjour. Comment allez-vous? Très bien!", 25)
        ['Bonjour.', 'Comment allez-vous?', 'Très bien!']

        >>> smart_split_text("Un texte très très très long sans ponctuation", 20)
        ['Un texte très très', 'très long sans', 'ponctuation']
    """
    if len(text) <= max_chars:
        return [text]

    chunks = []
    remaining = text

    while len(remaining) > max_chars:
        # Chercher un point de coupure dans les premiers max_chars caractères
        chunk = remaining[:max_chars]

        # 1. Priorité: couper aux points forts (. ! ?)
        strong_punct = max(
            chunk.rfind('. '),
            chunk.rfind('! '),
            chunk.rfind('? ')
        )

        # 2. Sinon, couper aux points moyens (; :)
        if strong_punct == -1:
            medium_punct = max(
                chunk.rfind('; '),
                chunk.rfind(': ')
            )
            cut_pos = medium_punct
        else:
            cut_pos = strong_punct

        # 3. Sinon, couper aux virgules
        if cut_pos == -1:
            cut_pos = chunk.rfind(', ')

        # 4. Sinon, couper aux espaces
        if cut_pos == -1:
            cut_pos = chunk.rfind(' ')

        # 5. Si aucune ponctuation/espace, forcer la coupure
        if cut_pos == -1:
            cut_pos = max_chars - 1
        else:
            # Inclure la ponctuation dans le chunk
            cut_pos += 1
            if cut_pos < len(chunk) and chunk[cut_pos] == ' ':
                cut_pos += 1  # Inclure l'espace après la ponctuation

        # Extraire le chunk et continuer avec le reste
        chunks.append(remaining[:cut_pos].strip())
        remaining = remaining[cut_pos:].strip()

    # Ajouter le dernier morceau
    if remaining:
        chunks.append(remaining)

    # Ne jamais émettre de chunk vide (ex. texte uniquement composé d'espaces :
    # les .strip() laissaient un "" en tête) — un chunk vide gaspille/troublerait
    # un appel de traduction NLLB.
    return [chunk for chunk in chunks if chunk]

# Import conditionnel des dépendances ML
ML_AVAILABLE = False
try:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    from .seq2seq_translator import Seq2SeqTranslator
    ML_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ Dependencies ML non disponibles")

from utils.performance import (
    PerformanceConfig,
    create_inference_context
)
from utils.pipeline_cache import LRUPipelineCache


class TranslatorEngine:
    """
    Moteur de traduction utilisant les modèles NLLB
    Gère la traduction ML batch et individuelle avec optimisations
    """

    def __init__(self, model_loader, executor: ThreadPoolExecutor, cache_size: int = 50):
        """
        Initialise le moteur de traduction

        Args:
            model_loader: Instance de ModelLoader avec modèles chargés
            executor: ThreadPoolExecutor pour traductions asynchrones
            cache_size: Taille maximale du cache LRU (défaut: 50 paires)
        """
        self.model_loader = model_loader
        self.executor = executor
        self.perf_config = PerformanceConfig()

        # Cache LRU pour gérer intelligemment les paires de langues fréquentes
        # Permet de réutiliser les pipelines optimisés et prépare l'architecture multi-modèles
        self._pipeline_cache = LRUPipelineCache(max_size=cache_size)
        self._pipeline_lock = threading.Lock()

        # Mapping des codes de langues NLLB — source unique : LANGUAGE_MAPPINGS
        # (config/settings.py). L'ancien dict codé en dur ne couvrait que 8 des 40
        # langues déclarées dans SUPPORTED_LANGUAGES ; les 32 autres tombaient sur
        # le défaut `.get(code, 'eng_Latn'/'fra_Latn')` aux call sites de traduction
        # → une demande de russe renvoyait silencieusement du français.
        self.lang_codes = dict(LANGUAGE_MAPPINGS)

        logger.info("⚙️ TranslatorEngine initialisé")

    def detect_language(self, text: str, fallback: Optional[str] = None) -> str:
        """Détecte la langue source. langdetect seuillé ; jamais de défaut 'en'
        arbitraire — repli sur `fallback` puis `DEFAULT_DETECT_LANGUAGE`."""
        default = fallback if fallback is not None else DEFAULT_DETECT_LANGUAGE
        cleaned = _URL_PATTERN.sub(" ", text or "").strip()
        if not _LANGDETECT_OK or sum(c.isalpha() for c in cleaned) < 4:
            return default
        try:
            ranked = detect_langs(cleaned)
        except LangDetectException:
            return default
        top = ranked[0]
        if top.prob < DETECT_MIN_CONFIDENCE:
            return default
        return top.lang.split("-")[0]  # zh-cn/zh-tw -> zh

    def _get_or_create_pipeline(
        self,
        model_type: str,
        source_lang: str,
        target_lang: str
    ) -> Tuple[Optional[any], bool]:
        """
        OPTIMISATION: Obtient ou crée un pipeline avec cache LRU intelligent

        Stratégie:
        1. Vérifier cache LRU (paires fréquentes gardées en mémoire)
        2. Si MISS: créer nouveau pipeline
        3. Mettre en cache avec politique d'éviction LRU

        Note: Avec NLLB, un seul pipeline gère toutes les paires de langues.
        Le cache LRU prépare l'architecture pour multi-modèles futurs où
        différentes paires utiliseront des modèles spécialisés.

        Args:
            model_type: Type de modèle ('basic', 'premium')
            source_lang: Langue source (code NLLB, ex: 'fra_Latn')
            target_lang: Langue cible (code NLLB, ex: 'eng_Latn')

        Returns:
            tuple: (pipeline, is_available) où is_available=True si succès
        """
        if not ML_AVAILABLE:
            return None, False

        # Tentative 1: Récupérer du cache LRU
        cached_pipeline = self._pipeline_cache.get(model_type, source_lang, target_lang)
        if cached_pipeline is not None:
            return cached_pipeline, True

        # Cache MISS: créer nouveau pipeline
        with self._pipeline_lock:
            # Double-check après acquisition du lock
            cached_pipeline = self._pipeline_cache.get(model_type, source_lang, target_lang)
            if cached_pipeline is not None:
                return cached_pipeline, True

            try:
                model = self.model_loader.get_model(model_type)
                if model is None:
                    logger.error(f"❌ Modèle {model_type} non chargé")
                    return None, False

                tokenizer = self.model_loader.get_thread_local_tokenizer(model_type)
                if tokenizer is None:
                    logger.error(f"❌ Tokenizer non disponible pour {model_type}")
                    return None, False

                # Créer le wrapper Seq2Seq générique pour cette paire
                # Note: Transformers 5.0+ n'a PAS de task "translation" dans le registry
                # On utilise donc directement AutoModelForSeq2SeqLM + AutoTokenizer
                # via notre wrapper Seq2SeqTranslator qui:
                # - Auto-détecte le type de modèle (NLLB, T5, mT5, mBART)
                # - Adapte automatiquement la stratégie de traduction
                # - Émule l'API pipeline pour compatibilité
                device = self.model_loader.device
                new_pipeline = Seq2SeqTranslator(
                    model=model,
                    tokenizer=tokenizer,
                    src_lang=source_lang,  # Format dépend du modèle (ex: eng_Latn pour NLLB)
                    tgt_lang=target_lang,  # Format dépend du modèle (ex: fra_Latn pour NLLB)
                    device=0 if device == 'cuda' and torch.cuda.is_available() else -1,
                    max_length=512,
                    batch_size=8
                )

                # Mettre en cache avec LRU
                self._pipeline_cache.put(model_type, source_lang, target_lang, new_pipeline)

                logger.info(
                    f"✅ Pipeline créé et caché: {model_type} "
                    f"{source_lang}→{target_lang} "
                    f"(cache: {len(self._pipeline_cache)}/{self._pipeline_cache.max_size})"
                )

                return new_pipeline, True

            except Exception as e:
                logger.error(f"❌ Erreur création pipeline: {e}")
                import traceback
                traceback.print_exc()
                return None, False

    async def translate_text(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> str:
        """
        Traduction ML d'un texte individuel avec pipeline réutilisable.

        Pour les textes longs (>200 caractères), découpe intelligemment
        aux ponctuations et traduit par morceaux pour éviter la troncature.

        Args:
            text: Texte à traduire
            source_lang: Langue source ('fr', 'en', etc)
            target_lang: Langue cible
            model_type: Type de modèle ('basic', 'premium')

        Returns:
            Texte traduit
        """
        if not self.model_loader.is_model_loaded(model_type):
            raise Exception(f"Modèle {model_type} non chargé")

        # ═══════════════════════════════════════════════════════════════════
        # PRÉSERVATION DES LIENS: masquer les URLs HTTP(S) AVANT découpage et
        # traduction (NLLB les corromprait). Restaurées verbatim à la fin.
        # ═══════════════════════════════════════════════════════════════════
        masked_text, urls = mask_urls(text)

        # ═══════════════════════════════════════════════════════════════════
        # DÉCOUPAGE INTELLIGENT: Textes longs découpés aux ponctuations
        # ═══════════════════════════════════════════════════════════════════
        if len(masked_text) > 200:
            logger.info(
                f"[TRANSLATE] Texte long détecté ({len(masked_text)} chars) → "
                f"découpage intelligent aux ponctuations"
            )

            # Découper en morceaux de max 200 caractères
            chunks = smart_split_text(masked_text, max_chars=200)

            logger.info(
                f"[TRANSLATE] Texte découpé en {len(chunks)} morceaux "
                f"(tailles: {[len(c) for c in chunks]})"
            )

            # Traduire chaque morceau
            translated_chunks = []
            for i, chunk in enumerate(chunks):
                logger.debug(f"[TRANSLATE] Chunk {i+1}/{len(chunks)}: '{chunk[:50]}...'")
                translated_chunk = await self._translate_single_chunk(
                    chunk, source_lang, target_lang, model_type
                )
                translated_chunks.append(translated_chunk)

            # Recoller les morceaux traduits
            final_translation = ' '.join(translated_chunks)

            logger.info(
                f"[TRANSLATE] ✅ Traduction complète: {len(text)} → {len(final_translation)} chars"
            )

            return restore_urls(final_translation, urls)

        # Texte court: traduction directe
        translated = await self._translate_single_chunk(
            masked_text, source_lang, target_lang, model_type
        )
        return restore_urls(translated, urls)

    async def _translate_single_chunk(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> str:
        """
        Traduit un seul morceau de texte (≤ 200 caractères).

        Args:
            text: Texte à traduire
            source_lang: Langue source
            target_lang: Langue cible
            model_type: Type de modèle

        Returns:
            Texte traduit
        """

        def translate_sync():
            """Traduction synchrone dans un thread"""
            try:
                # Codes NLLB
                nllb_source = self.lang_codes.get(source_lang, 'eng_Latn')
                nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')

                # Obtenir pipeline du cache LRU (ou créer si nécessaire)
                reusable_pipeline, is_available = self._get_or_create_pipeline(
                    model_type, nllb_source, nllb_target
                )

                if not is_available or reusable_pipeline is None:
                    raise Exception(f"Pipeline non disponible pour {model_type}")

                # ✨ THREAD-SAFETY: Lock d'inférence pour protéger le modèle PyTorch
                model_lock = self.model_loader.get_model_inference_lock(model_type)

                with model_lock:
                    # OPTIMISATION AVANCÉE: Greedy decoding (4x plus rapide)
                    with create_inference_context():
                        result = reusable_pipeline(
                            text,
                            src_lang=nllb_source,
                            tgt_lang=nllb_target,
                            max_length=256,       # Optimisé pour chunks courts (découpage intelligent avant)
                            num_beams=1,          # GREEDY (4x plus rapide!)
                            do_sample=False       # Déterministe
                            # early_stopping retiré: incompatible avec num_beams=1 (greedy decoding)
                        )

                # Extraire le résultat
                # Note: Seq2SeqTranslator retourne un dict pour un texte unique
                if result and 'translation_text' in result:
                    return result['translation_text']
                elif result and isinstance(result, list) and len(result) > 0 and 'translation_text' in result[0]:
                    return result[0]['translation_text']
                else:
                    logger.error(f"[NLLB] Résultat inattendu: {result}")
                    return f"[NLLB-No-Result] {text}"

            except Exception as e:
                logger.error(f"Erreur pipeline {model_type}: {e}")
                return f"[ML-Pipeline-Error] {text}"

        # Exécuter de manière asynchrone
        loop = asyncio.get_event_loop()
        translated = await loop.run_in_executor(self.executor, translate_sync)
        return translated

    async def translate_batch(
        self,
        texts: List[str],
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> List[str]:
        """
        OPTIMISATION: Traduction BATCH pour plusieurs textes à la fois

        Avantages:
        - Pipeline créé UNE SEULE fois au lieu de N fois
        - Batch processing natif du modèle (padding optimisé)
        - Meilleure utilisation GPU/CPU
        - Réduction overhead de 70% sur pipeline creation

        Args:
            texts: Liste de textes à traduire
            source_lang: Code langue source
            target_lang: Code langue cible
            model_type: Type de modèle

        Returns:
            Liste des textes traduits (même ordre)
        """
        if not texts:
            return []

        # Fallback si peu de textes
        if len(texts) <= 2:
            results = []
            for text in texts:
                translated = await self.translate_text(text, source_lang, target_lang, model_type)
                results.append(translated)
            return results

        if not self.model_loader.is_model_loaded(model_type):
            raise Exception(f"Modèle {model_type} non chargé")

        batch_size = self.perf_config.batch_size

        def translate_batch_sync():
            """Traduction batch synchrone - OPTIMISÉ POUR VITESSE"""
            try:
                logger.info(f"[BATCH-SYNC] 🚀 FAST translate_batch_sync: {len(texts)} textes, {source_lang}→{target_lang}")

                # Codes NLLB
                nllb_source = self.lang_codes.get(source_lang, 'eng_Latn')
                nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')

                # Obtenir pipeline du cache LRU (ou créer si nécessaire)
                reusable_pipeline, is_available = self._get_or_create_pipeline(
                    model_type, nllb_source, nllb_target
                )

                if not is_available or reusable_pipeline is None:
                    raise Exception(f"Pipeline non disponible pour {model_type}")

                all_results = []

                # ✨ THREAD-SAFETY: Lock d'inférence pour protéger le modèle PyTorch
                # Les modèles PyTorch ne sont PAS thread-safe, donc on sérialise les inférences
                model_lock = self.model_loader.get_model_inference_lock(model_type)

                # ═══════════════════════════════════════════════════════════════
                # ISOLATION AUDIO ↔ TEXTE (anti-famine)
                # Le verrou d'inférence est acquis/libéré PAR CHUNK, et non pour
                # l'intégralité du batch. Un long job audio (un message vocal peut
                # générer des centaines de segments) libère ainsi le modèle entre
                # chaque chunk : une traduction texte temps réel en attente peut
                # s'intercaler au lieu d'attendre tout le batch (→ plus de timeout
                # ZMQ côté gateway, plus de traductions perdues). Chaque appel
                # `reusable_pipeline(chunk)` reste atomique et sérialisé par le lock,
                # donc la thread-safety PyTorch est préservée.
                # ═══════════════════════════════════════════════════════════════
                n_chunks = (len(texts) + batch_size - 1) // batch_size
                logger.info(
                    f"🔒 [MODEL_LOCK] Inférence batch '{model_type}' en {n_chunks} chunk(s) "
                    f"(lock acquis/libéré par chunk)"
                )

                # OPTIMISATION: Traitement direct SANS timeout wrapper (overhead supprimé)
                with create_inference_context():
                    for i in range(0, len(texts), batch_size):
                        chunk = texts[i:i + batch_size]

                        # ═══════════════════════════════════════════════════════════════
                        # OPTIMISATIONS NLLB AVANCÉES:
                        # - num_beams=1: Greedy decoding (4x plus rapide que beam search)
                        # - do_sample=False: Désactive sampling (déterministe)
                        # - max_length=256: Optimisé pour segments courts
                        # ═══════════════════════════════════════════════════════════════
                        with model_lock:
                            results = reusable_pipeline(
                                chunk,
                                src_lang=nllb_source,
                                tgt_lang=nllb_target,
                                max_length=256,       # Optimisé pour segments courts (découpage avant si besoin)
                                num_beams=1,          # GREEDY DECODING (4x plus rapide!)
                                do_sample=False       # Déterministe
                                # early_stopping retiré: incompatible avec num_beams=1
                            )

                        # Agrégation des résultats HORS lock (le modèle est libre
                        # pour une autre traduction pendant qu'on formate la sortie).
                        for result in results:
                            if isinstance(result, dict) and 'translation_text' in result:
                                all_results.append(result['translation_text'])
                            elif isinstance(result, list) and len(result) > 0:
                                all_results.append(result[0].get('translation_text', '[No-Result]'))
                            else:
                                all_results.append('[Batch-No-Result]')

                logger.info(f"🔓 [MODEL_LOCK] Batch '{model_type}' terminé (lock libéré entre chunks)")

                logger.info(f"[BATCH-SYNC] ✅ Sortie inference_context, {len(all_results)} résultats")

                # Nettoyage mémoire périodique
                if self.perf_config.enable_memory_cleanup and len(texts) > 20:
                    from utils.performance import get_performance_optimizer
                    perf_optimizer = get_performance_optimizer()
                    perf_optimizer.cleanup_memory()

                logger.info(f"[BATCH-SYNC] ✅ Fin translate_batch_sync: {len(all_results)} traductions")
                return all_results

            except Exception as e:
                logger.error(f"[BATCH-SYNC] ❌ Erreur batch pipeline {model_type}: {e}")
                import traceback
                traceback.print_exc()
                return [f"[ML-Batch-Error] {t}" for t in texts]

        # Exécuter de manière asynchrone
        logger.info(f"[BATCH] 🔄 Soumission à executor (threads actifs: {self.executor._max_workers})")
        loop = asyncio.get_event_loop()
        logger.info(f"[BATCH] Event loop obtenue: {loop}")
        results = await loop.run_in_executor(self.executor, translate_batch_sync)
        logger.info(f"[BATCH] ✅ run_in_executor terminé, {len(results)} résultats")

        logger.info(f"⚡ [BATCH] {len(texts)} textes traduits en batch ({source_lang}→{target_lang})")
        return results

    def cleanup(self):
        """Libère les ressources du moteur"""
        logger.info("🧹 Nettoyage TranslatorEngine...")

        # Log statistiques finales du cache avant nettoyage
        self._pipeline_cache.log_stats()

        # Vider le cache
        self._pipeline_cache.clear()

        logger.info("✅ TranslatorEngine nettoyé")

    def get_cache_stats(self):
        """
        Retourne les statistiques du cache LRU

        Returns:
            CacheStats avec métriques (hits, misses, evictions, hit_rate)
        """
        return self._pipeline_cache.get_stats()

    def get_top_language_pairs(self, n: int = 10):
        """
        Retourne les N paires de langues les plus utilisées

        Args:
            n: Nombre de paires à retourner

        Returns:
            Liste de tuples (clé, position) des paires les plus fréquentes
        """
        return self._pipeline_cache.get_top_pairs(n)
