#!/usr/bin/env python3
"""
Exemple d'utilisation du VoiceQualityAnalyzer dans un workflow de clonage vocal.

Scénario:
1. Utilisateur envoie un message vocal original
2. Le service transcrit et traduit vers plusieurs langues
3. Le TTS génère les audios traduits avec clonage vocal
4. VoiceQualityAnalyzer évalue la qualité de chaque audio généré
5. Rapport de qualité global généré

Cas d'usage:
- Validation qualité avant envoi aux destinataires
- Tests A/B de modèles de clonage
- Métriques de performance pour monitoring
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, Any

# Configuration logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class VoiceCloningQualityWorkflow:
    """
    Workflow complet avec analyse de qualité intégrée.
    """

    def __init__(self):
        """Initialise le workflow avec tous les services nécessaires"""
        from services.voice_clone_service import get_voice_clone_service
        from services.tts_service import get_tts_service

        self.voice_service = get_voice_clone_service()
        self.tts_service = get_tts_service()

    async def process_voice_message_with_quality_check(
        self,
        original_audio_path: str,
        user_id: str,
        target_languages: list,
        translations: Dict[str, str],
        quality_threshold: float = 0.60
    ) -> Dict[str, Any]:
        """
        Traite un message vocal avec analyse de qualité complète.

        Args:
            original_audio_path: Chemin vers l'audio original
            user_id: ID de l'utilisateur
            target_languages: Langues cibles ["en", "fr", "es"]
            translations: {lang: texte_traduit}
            quality_threshold: Seuil de similarité minimum acceptable (0-1)

        Returns:
            Dict avec résultats + rapport de qualité
        """
        logger.info(f"🚀 Démarrage workflow qualité: {len(target_languages)} langues")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 1: Analyse qualité de l'audio original
        # ═══════════════════════════════════════════════════════════════
        logger.info("📊 ÉTAPE 1: Analyse audio original")

        original_metrics = await self.voice_service.analyze_voice_quality(
            original_audio_path,
            detailed=True  # MFCC pour comparaison ultérieure
        )

        logger.info(
            f"  ✅ Original: voice_type={original_metrics.voice_type}, "
            f"pitch={original_metrics.pitch_mean_hz:.1f}Hz, "
            f"duration={original_metrics.duration_seconds:.1f}s"
        )

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 2: Créer/récupérer profil vocal
        # ═══════════════════════════════════════════════════════════════
        logger.info("🎤 ÉTAPE 2: Création profil vocal")

        voice_model = await self.voice_service.get_or_create_voice_model(
            user_id=user_id,
            current_audio_path=original_audio_path,
            current_audio_duration_ms=int(original_metrics.duration_seconds * 1000)
        )

        logger.info(
            f"  ✅ Profil: quality_score={voice_model.quality_score:.2f}, "
            f"version={voice_model.version}"
        )

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 3: Générer audios traduits avec TTS
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"🔊 ÉTAPE 3: Génération TTS ({len(target_languages)} langues)")

        generated_audios = {}
        for lang in target_languages:
            translated_text = translations.get(lang, "")
            if not translated_text:
                logger.warning(f"⚠️  Pas de traduction pour {lang}, skip")
                continue

            # Générer avec clonage vocal
            tts_result = await self.tts_service.synthesize_with_voice(
                text=translated_text,
                speaker_audio_path=original_audio_path,
                target_language=lang,
                output_format="mp3"
            )

            generated_audios[lang] = tts_result.audio_path
            logger.info(f"  ✅ {lang}: {tts_result.audio_path}")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 4: Analyse qualité de chaque audio généré
        # ═══════════════════════════════════════════════════════════════
        logger.info("📊 ÉTAPE 4: Analyse qualité audios générés")

        quality_reports = {}
        failed_languages = []

        for lang, generated_path in generated_audios.items():
            logger.info(f"  🔍 Analyse {lang}...")

            # Analyser l'audio généré
            generated_metrics = await self.voice_service.analyze_voice_quality(
                generated_path,
                detailed=True
            )

            # Comparer avec l'original
            similarity = await self.voice_service.compare_voice_similarity(
                original_audio_path,
                generated_path
            )

            quality_reports[lang] = {
                "metrics": generated_metrics,
                "similarity": similarity,
                "passed": similarity.overall_similarity >= quality_threshold
            }

            # Log résultat
            status = "✅" if similarity.overall_similarity >= quality_threshold else "❌"
            logger.info(
                f"    {status} Similarité: {similarity.overall_similarity:.2%} "
                f"(pitch={similarity.pitch_similarity:.2%}, "
                f"brightness={similarity.brightness_similarity:.2%}, "
                f"mfcc={similarity.mfcc_similarity:.2%})"
            )

            if not quality_reports[lang]["passed"]:
                failed_languages.append(lang)

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 5: Générer rapport de qualité global
        # ═══════════════════════════════════════════════════════════════
        logger.info("📋 ÉTAPE 5: Génération rapport qualité")

        report = self._generate_quality_report(
            original_metrics=original_metrics,
            quality_reports=quality_reports,
            quality_threshold=quality_threshold,
            failed_languages=failed_languages
        )

        # ═══════════════════════════════════════════════════════════════
        # RÉSULTAT FINAL
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"\n{'=' * 80}")
        logger.info(f"📊 RAPPORT FINAL")
        logger.info(f"{'=' * 80}")
        logger.info(f"Langues testées: {len(target_languages)}")
        logger.info(f"Audios générés: {len(generated_audios)}")
        logger.info(f"Qualité OK: {len(target_languages) - len(failed_languages)}")
        logger.info(f"Qualité insuffisante: {len(failed_languages)}")

        if failed_languages:
            logger.warning(f"⚠️  Langues à revoir: {', '.join(failed_languages)}")
        else:
            logger.info(f"✅ Toutes les traductions passent le seuil de qualité")

        return {
            "original_metrics": original_metrics.to_dict(),
            "voice_model": {
                "user_id": voice_model.user_id,
                "quality_score": voice_model.quality_score,
                "version": voice_model.version
            },
            "generated_audios": generated_audios,
            "quality_reports": {
                lang: {
                    "metrics": report["metrics"].to_dict(),
                    "similarity": report["similarity"].to_dict(),
                    "passed": report["passed"]
                }
                for lang, report in quality_reports.items()
            },
            "summary": report
        }

    def _generate_quality_report(
        self,
        original_metrics,
        quality_reports: Dict,
        quality_threshold: float,
        failed_languages: list
    ) -> Dict[str, Any]:
        """Génère un rapport de qualité agrégé"""
        total = len(quality_reports)
        passed = total - len(failed_languages)

        avg_similarity = sum(
            r["similarity"].overall_similarity for r in quality_reports.values()
        ) / total if total > 0 else 0

        avg_pitch_sim = sum(
            r["similarity"].pitch_similarity for r in quality_reports.values()
        ) / total if total > 0 else 0

        avg_brightness_sim = sum(
            r["similarity"].brightness_similarity for r in quality_reports.values()
        ) / total if total > 0 else 0

        avg_mfcc_sim = sum(
            r["similarity"].mfcc_similarity for r in quality_reports.values()
        ) / total if total > 0 else 0

        return {
            "total_languages": total,
            "passed_count": passed,
            "failed_count": len(failed_languages),
            "failed_languages": failed_languages,
            "pass_rate": passed / total if total > 0 else 0,
            "quality_threshold": quality_threshold,
            "average_similarity": avg_similarity,
            "average_pitch_similarity": avg_pitch_sim,
            "average_brightness_similarity": avg_brightness_sim,
            "average_mfcc_similarity": avg_mfcc_sim,
            "original_voice_type": original_metrics.voice_type,
            "original_pitch_hz": original_metrics.pitch_mean_hz,
            "recommendation": self._get_recommendation(avg_similarity, quality_threshold)
        }

    def _get_recommendation(self, avg_similarity: float, threshold: float) -> str:
        """Génère une recommandation basée sur la qualité moyenne"""
        if avg_similarity >= 0.80:
            return "✅ EXCELLENT - Qualité de clonage optimale, aucune action requise"
        elif avg_similarity >= threshold:
            return "👍 BON - Qualité acceptable, envoi possible"
        elif avg_similarity >= 0.40:
            return "⚠️  MOYEN - Considérer re-génération avec meilleurs paramètres"
        else:
            return "❌ FAIBLE - Re-génération fortement recommandée"


async def example_usage():
    """
    Exemple d'utilisation du workflow avec analyse de qualité.
    """
    logger.info("=" * 80)
    logger.info("EXEMPLE: Voice Cloning Quality Workflow")
    logger.info("=" * 80)

    # Configuration
    original_audio = "/path/to/original_message.wav"
    user_id = "user_123"
    target_languages = ["en", "fr", "es"]
    translations = {
        "en": "Hello, how are you today?",
        "fr": "Bonjour, comment allez-vous aujourd'hui?",
        "es": "Hola, ¿cómo estás hoy?"
    }

    # Exécuter le workflow
    workflow = VoiceCloningQualityWorkflow()

    try:
        result = await workflow.process_voice_message_with_quality_check(
            original_audio_path=original_audio,
            user_id=user_id,
            target_languages=target_languages,
            translations=translations,
            quality_threshold=0.60  # 60% de similarité minimum
        )

        # Afficher le rapport
        logger.info("\n📊 RAPPORT DÉTAILLÉ:")
        logger.info(f"  Pass rate: {result['summary']['pass_rate']:.1%}")
        logger.info(f"  Similarité moyenne: {result['summary']['average_similarity']:.2%}")
        logger.info(f"  Recommandation: {result['summary']['recommendation']}")

    except Exception as e:
        logger.error(f"❌ Erreur workflow: {e}")
        import traceback
        traceback.print_exc()


async def example_ab_testing():
    """
    Exemple: Tests A/B de différents modèles de clonage.
    """
    logger.info("=" * 80)
    logger.info("EXEMPLE: A/B Testing de modèles de clonage")
    logger.info("=" * 80)

    from services.voice_clone_service import get_voice_clone_service

    service = get_voice_clone_service()

    original_audio = "/path/to/original.wav"

    # Tester deux modèles différents
    models = {
        "model_a": "/path/to/generated_model_a.wav",
        "model_b": "/path/to/generated_model_b.wav"
    }

    results = {}

    for model_name, generated_path in models.items():
        similarity = await service.compare_voice_similarity(
            original_audio,
            generated_path
        )

        results[model_name] = similarity
        logger.info(
            f"{model_name}: {similarity.overall_similarity:.2%} "
            f"(pitch={similarity.pitch_similarity:.2%}, "
            f"brightness={similarity.brightness_similarity:.2%}, "
            f"mfcc={similarity.mfcc_similarity:.2%})"
        )

    # Déterminer le gagnant
    winner = max(results.items(), key=lambda x: x[1].overall_similarity)
    logger.info(f"\n🏆 GAGNANT: {winner[0]} avec {winner[1].overall_similarity:.2%}")


if __name__ == "__main__":
    # Exécuter l'exemple principal
    asyncio.run(example_usage())

    # Décommenter pour tester l'A/B testing
    # asyncio.run(example_ab_testing())
