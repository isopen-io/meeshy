"""
Translation Processor - Traitement des tâches de traduction

Responsabilités:
- Traitement single translation
- Traitement batch translation
- Cache management
- Résultats et erreurs
"""

import asyncio
import logging
import time
from typing import List, Callable, Optional, Any

# Import local
from ..zmq_models import TranslationTask

logger = logging.getLogger(__name__)

# Budget d'inférence — incident prod 2026-07-04 : un post de 1839 chars
# (fr → 7 langues) n'a JAMAIS été traduit. Le texte est bien segmenté en
# phrases par translate_with_structure, mais le timeout FIXE de 45 s
# couvrait la traduction du texte ENTIER (tous segments, modèle premium,
# CPU) : tout texte >~1500 chars force-échouait, le gateway épuisait ses
# 5 retries et le message restait dans sa langue d'origine — rupture
# silencieuse du Prisme Linguistique. Le budget croît avec la longueur
# (le coût CPU est ~linéaire au nombre de segments), borné pour ne pas
# monopoliser un worker sur un input pathologique.
# Calibration : mesure prod ~30 s/500 chars par langue seule (lock libre) ;
# la pente à 45 s garde ~1.5× de marge pour la contention inter-workers sur
# le lock d'inférence du modèle.
INFERENCE_TIMEOUT_BASE_S = 45.0
INFERENCE_TIMEOUT_PER_500_CHARS_S = 45.0
INFERENCE_TIMEOUT_MAX_S = 360.0


def inference_timeout_for(text_length: int) -> float:
    """Budget d'inférence (secondes) proportionnel à la longueur du texte.

    ≤ 500 chars : base 45 s (comportement historique, inchangé pour les
    messages courts) ; au-delà : +45 s par tranche de 500 chars, plafonné
    à 360 s.
    """
    extra = INFERENCE_TIMEOUT_PER_500_CHARS_S * max(0, text_length - 500) / 500.0
    return min(INFERENCE_TIMEOUT_MAX_S, INFERENCE_TIMEOUT_BASE_S + extra)


async def process_single_translation(
    task: TranslationTask,
    worker_name: str,
    translation_service: Any,
    translation_cache: Optional[Any],
    publish_func: Callable
) -> List[dict]:
    """
    Traite une tâche de traduction unique

    Args:
        task: Tâche de traduction
        worker_name: Nom du worker
        translation_service: Service de traduction ML
        translation_cache: Service de cache Redis
        publish_func: Fonction pour publier les résultats

    Returns:
        Liste des résultats de traduction
    """
    results = []

    try:
        # Une langue à la fois : l'inférence ML est sérialisée par le lock
        # modèle (model_loader.get_model_inference_lock), un fan-out
        # concurrent ne parallélise rien mais fait courir le budget de
        # CHAQUE langue pendant l'attente des autres — un texte long
        # multi-langues expirait alors toutes ses langues d'un coup.
        for target_language in task.target_languages:
            try:
                result = await _translate_single_language(
                    task=task,
                    target_language=target_language,
                    worker_name=worker_name,
                    translation_service=translation_service,
                    translation_cache=translation_cache
                )

                # Ajouter métadonnées
                result['poolType'] = 'any' if task.conversation_id == 'any' else 'normal'
                result['created_at'] = task.created_at

                # Publier le résultat
                await publish_func(task.task_id, result, target_language)
                results.append(result)

            except Exception as e:
                logger.error(
                    f"Translation error for {target_language} in {task.task_id}: {e}"
                )
                # Publier un résultat d'erreur
                error_result = _create_error_result(task, target_language, str(e))
                await publish_func(task.task_id, error_result, target_language)

    except Exception as e:
        logger.error(f"Error processing single task {task.task_id}: {e}")

    return results


async def process_batch_translation(
    tasks: List[TranslationTask],
    worker_name: str,
    translation_service: Any,
    publish_func: Callable
) -> int:
    """
    Traite un batch de tâches de traduction

    OPTIMISATION: 2-3x plus rapide que N appels individuels

    Args:
        tasks: Liste de tâches de traduction
        worker_name: Nom du worker
        translation_service: Service de traduction ML
        publish_func: Fonction pour publier les résultats

    Returns:
        Nombre de traductions complétées
    """
    if not tasks:
        return 0

    batch_start = time.time()
    translations_completed = 0

    try:
        # Extraire les informations communes
        source_lang = tasks[0].source_language
        target_langs = tasks[0].target_languages
        model_type = tasks[0].model_type
        pool_type = 'any' if tasks[0].conversation_id == 'any' else 'normal'

        # Extraire les textes
        texts = [t.text for t in tasks]

        logger.info(
            f"⚡ [BATCH] Worker {worker_name}: processing {len(texts)} texts "
            f"({source_lang}→{target_langs})"
        )

        # Pour chaque langue cible
        for target_lang in target_langs:
            try:
                # Utiliser le batch translation du service ML — budget = somme
                # des budgets individuels (proportionnels à la longueur).
                batch_timeout = sum(inference_timeout_for(len(t)) for t in texts)
                if translation_service and hasattr(translation_service, '_ml_translate_batch'):
                    try:
                        translated_texts = await asyncio.wait_for(
                            translation_service._ml_translate_batch(
                                texts=texts,
                                source_lang=source_lang,
                                target_lang=target_lang,
                                model_type=model_type
                            ),
                            timeout=batch_timeout
                        )
                    except asyncio.TimeoutError:
                        logger.error(f"⏱️ [BATCH] Timeout ({batch_timeout:.0f}s) for {source_lang}→{target_lang} batch={len(texts)}")
                        raise
                else:
                    # Fallback: traduire un par un
                    translated_texts = []
                    for text in texts:
                        single_budget = inference_timeout_for(len(text))
                        try:
                            result = await asyncio.wait_for(
                                translation_service.translate_with_structure(
                                    text=text,
                                    source_language=source_lang,
                                    target_language=target_lang,
                                    model_type=model_type,
                                    source_channel='zmq_batch'
                                ),
                                timeout=single_budget
                            )
                        except asyncio.TimeoutError:
                            logger.error(f"⏱️ [BATCH] Single inference timeout ({single_budget:.0f}s, {len(text)} chars) {source_lang}→{target_lang}")
                            raise
                        translated_texts.append(result.get('translated_text', text))

                # Distribuer les résultats
                for i, (task, translated_text) in enumerate(zip(tasks, translated_texts)):
                    processing_time = time.time() - batch_start

                    result = {
                        'messageId': task.message_id,
                        'translatedText': translated_text,
                        'sourceLanguage': source_lang,
                        'targetLanguage': target_lang,
                        'confidenceScore': 0.95,
                        'processingTime': processing_time,
                        'modelType': model_type,
                        'workerName': worker_name,
                        'fromCache': False,
                        'batchSize': len(tasks),
                        'batchIndex': i,
                        'poolType': pool_type,
                        'created_at': task.created_at
                    }

                    await publish_func(task.task_id, result, target_lang)
                    translations_completed += 1

            except Exception as e:
                logger.error(f"[BATCH] Translation error for {target_lang}: {e}")
                # Publier des erreurs pour chaque tâche
                for task in tasks:
                    error_result = _create_error_result(task, target_lang, str(e))
                    await publish_func(task.task_id, error_result, target_lang)

        batch_time = (time.time() - batch_start) * 1000
        logger.info(
            f"✅ [BATCH] {len(tasks)} translations completed in {batch_time:.0f}ms "
            f"({batch_time/len(tasks):.0f}ms/text)"
        )

    except Exception as e:  # pragma: no cover
        logger.error(f"[BATCH] General batch error: {e}")

    return translations_completed


async def _translate_single_language(
    task: TranslationTask,
    target_language: str,
    worker_name: str,
    translation_service: Any,
    translation_cache: Optional[Any]
) -> dict:
    """
    Traduit un texte vers une langue cible spécifique (avec cache Redis)

    Args:
        task: Tâche de traduction
        target_language: Langue cible
        worker_name: Nom du worker
        translation_service: Service de traduction ML
        translation_cache: Service de cache Redis

    Returns:
        Résultat de traduction
    """
    start_time = time.time()

    try:
        # ═══════════════════════════════════════════════════════════════════
        # ÉTAPE 1: Vérifier le cache
        # ═══════════════════════════════════════════════════════════════════
        if translation_cache:
            cached = await translation_cache.get_translation(
                text=task.text,
                source_lang=task.source_language,
                target_lang=target_language,
                model_type=task.model_type
            )

            if cached:
                processing_time = time.time() - start_time
                logger.debug(
                    f"⚡ [CACHE] Hit: {task.source_language}→{target_language} "
                    f"(msg={task.message_id})"
                )

                return {
                    'messageId': task.message_id,
                    'translatedText': cached.get('translated_text', ''),
                    'sourceLanguage': cached.get('source_lang', task.source_language),
                    'targetLanguage': target_language,
                    'confidenceScore': 0.99,
                    'processingTime': processing_time,
                    'modelType': cached.get('model_type', task.model_type),
                    'workerName': worker_name,
                    'fromCache': True,
                    'segmentsCount': 0,
                    'emojisCount': 0
                }

        # ═══════════════════════════════════════════════════════════════════
        # ÉTAPE 2: Traduire si pas en cache
        # ═══════════════════════════════════════════════════════════════════
        if translation_service:
            inference_budget = inference_timeout_for(len(task.text))
            try:
                result = await asyncio.wait_for(
                    translation_service.translate_with_structure(
                        text=task.text,
                        source_language=task.source_language,
                        target_language=target_language,
                        model_type=task.model_type,
                        source_channel='zmq'
                    ),
                    timeout=inference_budget
                )
            except asyncio.TimeoutError:
                logger.error(
                    f"⏱️ [PROCESSOR] Inference timeout ({inference_budget:.0f}s, {len(task.text)} chars) "
                    f"for {task.source_language}→{target_language} "
                    f"msg={task.message_id} task={task.task_id}"
                )
                raise RuntimeError(f"inference_timeout: {task.source_language}→{target_language}")

            processing_time = time.time() - start_time

            # Validation du résultat
            if result is None:
                logger.error(f"Translation service returned None for {worker_name}")
                raise Exception("Translation service returned None")

            if not isinstance(result, dict) or 'translated_text' not in result:
                logger.error(f"Invalid result for {worker_name}: {result}")
                raise Exception(f"Invalid translation result: {result}")

            # ═══════════════════════════════════════════════════════════════════
            # ÉTAPE 3: Mettre en cache la nouvelle traduction
            # ═══════════════════════════════════════════════════════════════════
            if translation_cache:
                await translation_cache.set_translation(
                    text=task.text,
                    source_lang=task.source_language,
                    target_lang=target_language,
                    translated_text=result['translated_text'],
                    model_type=task.model_type
                )

            return {
                'messageId': task.message_id,
                'translatedText': result['translated_text'],
                'sourceLanguage': result.get('detected_language', task.source_language),
                'targetLanguage': target_language,
                'confidenceScore': result.get('confidence', 0.95),
                'processingTime': processing_time,
                'modelType': task.model_type,
                'workerName': worker_name,
                'fromCache': False,
                'segmentsCount': result.get('segments_count', 0),
                'emojisCount': result.get('emojis_count', 0)
            }
        else:
            # Fallback si pas de service de traduction
            translated_text = f"[{target_language.upper()}] {task.text}"
            processing_time = time.time() - start_time

            return {
                'messageId': task.message_id,
                'translatedText': translated_text,
                'sourceLanguage': task.source_language,
                'targetLanguage': target_language,
                'confidenceScore': 0.1,
                'processingTime': processing_time,
                'modelType': 'fallback',
                'workerName': worker_name,
                'error': 'No translation service available'
            }

    except Exception as e:
        logger.error(f"Translation error in {worker_name}: {e}")
        # Fallback en cas d'erreur
        translated_text = f"[{target_language.upper()}] {task.text}"
        processing_time = time.time() - start_time

        return {
            'messageId': task.message_id,
            'translatedText': translated_text,
            'sourceLanguage': task.source_language,
            'targetLanguage': target_language,
            'confidenceScore': 0.1,
            'processingTime': processing_time,
            'modelType': 'fallback',
            'workerName': worker_name,
            'error': str(e)
        }


def _create_error_result(
    task: TranslationTask,
    target_language: str,
    error_message: str
) -> dict:
    """
    Crée un résultat d'erreur pour une traduction échouée

    Args:
        task: Tâche de traduction
        target_language: Langue cible
        error_message: Message d'erreur

    Returns:
        Résultat d'erreur
    """
    return {
        'messageId': task.message_id,
        'translatedText': f"[ERROR: {error_message}]",
        'sourceLanguage': task.source_language,
        'targetLanguage': target_language,
        'confidenceScore': 0.0,
        'processingTime': 0.0,
        'modelType': task.model_type,
        'error': error_message
    }
