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
from typing import List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor

from config.settings import LANGUAGE_MAPPINGS
from utils.sentence_plan import SentencePlan, plan_sentences
from utils.text_segmentation import (
    has_translatable_text,
    protect_entities,
    restore_entities,
    strip_entities,
)

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


class TranslationInferenceError(RuntimeError):
    """Échec RÉEL de l'inférence ML (pipeline indisponible, résultat inattendu,
    exception du modèle). Ne JAMAIS l'attraper pour retourner un texte de
    substitution (`[ML-Pipeline-Error] …`, `[ML-Batch-Error] …`) comme si
    c'était une traduction : cette valeur remonte jusqu'à
    `translate_with_structure`, qui la mettait en cache 30 jours et
    l'assemblait dans le texte final sans qu'aucun contrôle de validité ne
    puisse la détecter au milieu d'un texte multi-segments (#3663). Laisser
    l'exception se propager pour que l'appelant retombe sur le texte
    original."""


class UnsupportedLanguageError(TranslationInferenceError):
    """Code de langue (source ou cible) sans entrée dans `LANGUAGE_MAPPINGS`
    — donc sans code NLLB-200 connu (#3659). Sous-classe de
    `TranslationInferenceError` à dessein : elle doit traverser exactement
    les mêmes garde-fous (jamais mise en cache, jamais assemblée comme une
    traduction réelle) et le même repli sur le texte original.

    Avant #3659, `self.lang_codes.get(code, 'eng_Latn'/'fra_Latn')` retombait
    silencieusement sur l'anglais ou le français pour toute langue absente du
    mapping — une demande de tamoul rendait du français sans que rien ne le
    signale. C'est précisément le repli silencieux que la règle 1 du Prisme
    Linguistique interdit (`CLAUDE.md` racine) : à défaut de traduction, le
    contraire de « fabriquer une traduction fausse » est de ne PAS traduire,
    et de laisser l'appelant servir l'original."""


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

    def _resolve_nllb_code(self, iso_code: str, role: str) -> str:
        """Résout un code ISO 639-1 vers son code NLLB-200 via `lang_codes`.

        Lève `UnsupportedLanguageError` si `iso_code` n'a pas d'entrée — plus
        jamais de repli silencieux vers `eng_Latn`/`fra_Latn` (#3659). `role`
        ('source' ou 'cible') sert uniquement au message d'erreur.
        """
        nllb_code = self.lang_codes.get(iso_code)
        if nllb_code is None:
            raise UnsupportedLanguageError(
                f"Langue {role} '{iso_code}' sans code NLLB-200 dans "
                f"LANGUAGE_MAPPINGS — aucune traduction ne peut être produite "
                f"pour ce code (voir #3659 : jamais de repli vers eng_Latn/"
                f"fra_Latn)."
            )
        return nllb_code

    def detect_language(self, text: str, fallback: Optional[str] = None) -> str:
        """Détecte la langue source. langdetect seuillé ; jamais de défaut 'en'
        arbitraire — repli sur `fallback` puis `DEFAULT_DETECT_LANGUAGE`."""
        default = fallback if fallback is not None else DEFAULT_DETECT_LANGUAGE
        cleaned = strip_entities(text or "").strip()
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

        # Adresses, mentions, hashtags et émojis ne passent jamais par NLLB (#9086).
        masked_text, entities = protect_entities(text)
        if not has_translatable_text(masked_text):
            return text
        translated = await self._translate_masked_text(
            masked_text, source_lang, target_lang, model_type
        )
        return restore_entities(translated, entities)

    def _plan(self, masked_text: str, source_lang: str, target_lang: str) -> SentencePlan:
        """Les phrases du message, chacune résolue par le lexique ou confiée au modèle (#9723).

        Un message n'est JAMAIS donné d'un seul tenant à NLLB : traduit entier, un
        message court à plusieurs phrases perdait ses phrases courtes (mesuré sur
        600M et 1.3B, staging 2026-10-08)."""
        return plan_sentences(
            masked_text, source_lang, target_lang,
            split_long=lambda sentence: smart_split_text(sentence, max_chars=200),
        )

    async def _translate_masked_text(
        self,
        masked_text: str,
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> str:
        """Traduit un texte dont les entités protégées sont déjà masquées, phrase par phrase."""
        plan = self._plan(masked_text, source_lang, target_lang)
        outputs = await self._translate_model_inputs(
            plan.model_inputs, source_lang, target_lang, model_type
        )
        return plan.assemble(outputs)

    async def _translate_model_inputs(
        self,
        inputs: List[str],
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> List[str]:
        """Les phrases d'un message en UN appel au modèle : une seule passe, jamais N."""
        if not inputs:
            return []
        if len(inputs) == 1:
            return [await self._translate_single_chunk(inputs[0], source_lang, target_lang, model_type)]
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.executor, self._infer_batch_sync, inputs, source_lang, target_lang, model_type
        )

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
                # Codes NLLB — jamais de repli silencieux (#3659)
                nllb_source = self._resolve_nllb_code(source_lang, 'source')
                nllb_target = self._resolve_nllb_code(target_lang, 'cible')

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
                    raise TranslationInferenceError(f"Résultat NLLB inattendu: {result}")

            except TranslationInferenceError:
                raise
            except Exception as e:
                logger.error(f"Erreur pipeline {model_type}: {e}")
                raise TranslationInferenceError(f"Erreur pipeline {model_type}: {e}") from e

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

        # Chaque texte est découpé en phrases ; toutes les phrases de tous les
        # textes partent au modèle dans le même lot, puis se regroupent (#9723).
        protected = [protect_entities(text) for text in texts]
        plans = [
            self._plan(masked, source_lang, target_lang) if has_translatable_text(masked) else None
            for masked, _ in protected
        ]
        model_inputs = [chunk for plan in plans if plan is not None for chunk in plan.model_inputs]

        outputs: List[str] = []
        if model_inputs:
            loop = asyncio.get_event_loop()
            outputs = await loop.run_in_executor(
                self.executor, self._infer_batch_sync, model_inputs, source_lang, target_lang, model_type
            )
        logger.info(
            f"⚡ [BATCH] {len(texts)} textes, {len(model_inputs)} phrases au modèle "
            f"({source_lang}→{target_lang})"
        )

        results: List[str] = []
        cursor = 0
        for text, plan, (_, entities) in zip(texts, plans, protected):
            if plan is None:
                results.append(text)
                continue
            taken = len(plan.model_inputs)
            results.append(restore_entities(plan.assemble(outputs[cursor:cursor + taken]), entities))
            cursor += taken
        return results

    def _infer_batch_sync(
        self,
        inputs: List[str],
        source_lang: str,
        target_lang: str,
        model_type: str
    ) -> List[str]:
        """Inférence par lots de `batch_size`, verrou du modèle pris et rendu PAR lot.

        ISOLATION AUDIO ↔ TEXTE (anti-famine) : un long job audio (des centaines de
        segments) libère le modèle entre chaque lot ; une traduction texte temps réel
        en attente s'intercale au lieu d'attendre tout le job (→ plus de timeout ZMQ
        côté gateway). Chaque appel au pipeline reste atomique et sérialisé par le
        verrou : la thread-safety PyTorch est préservée.
        """
        try:
            # Codes NLLB — jamais de repli silencieux (#3659)
            nllb_source = self._resolve_nllb_code(source_lang, 'source')
            nllb_target = self._resolve_nllb_code(target_lang, 'cible')

            reusable_pipeline, is_available = self._get_or_create_pipeline(
                model_type, nllb_source, nllb_target
            )
            if not is_available or reusable_pipeline is None:
                raise Exception(f"Pipeline non disponible pour {model_type}")

            model_lock = self.model_loader.get_model_inference_lock(model_type)
            batch_size = self.perf_config.batch_size
            all_results: List[str] = []

            with create_inference_context():
                for i in range(0, len(inputs), batch_size):
                    chunk = inputs[i:i + batch_size]
                    # Greedy (num_beams=1), déterministe ; budget borné par la source (#9309)
                    with model_lock:
                        results = reusable_pipeline(
                            chunk,
                            src_lang=nllb_source,
                            tgt_lang=nllb_target,
                            max_length=256,
                            num_beams=1,
                            do_sample=False
                        )

                    # Agrégation HORS verrou : le modèle est libre pendant le formatage.
                    for result in results:
                        if isinstance(result, dict) and 'translation_text' in result:
                            all_results.append(result['translation_text'])
                        elif isinstance(result, list) and len(result) > 0 and 'translation_text' in result[0]:
                            all_results.append(result[0]['translation_text'])
                        else:
                            raise TranslationInferenceError(f"Résultat batch NLLB inattendu: {result}")

            if len(all_results) != len(inputs):
                raise TranslationInferenceError(
                    f"Le modèle a rendu {len(all_results)} traductions pour {len(inputs)} phrases"
                )

            if self.perf_config.enable_memory_cleanup and len(inputs) > 20:
                from utils.performance import get_performance_optimizer
                get_performance_optimizer().cleanup_memory()

            return all_results

        except TranslationInferenceError:
            raise
        except Exception as e:
            logger.error(f"[BATCH-SYNC] ❌ Erreur batch pipeline {model_type}: {e}")
            raise TranslationInferenceError(f"Erreur batch pipeline {model_type}: {e}") from e

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
