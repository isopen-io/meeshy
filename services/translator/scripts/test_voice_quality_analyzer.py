#!/usr/bin/env python3
"""
Script de test pour VoiceQualityAnalyzer.

Teste:
- Analyse de qualité vocale (pitch, MFCC, spectral)
- Comparaison de similarité entre audios
- Détection de type de voix (High/Medium/Low)
- Performance et temps d'exécution

Usage:
    python scripts/test_voice_quality_analyzer.py [audio_path1] [audio_path2]

Si aucun fichier fourni, utilise des fichiers de test par défaut.
"""

import asyncio
import sys
import os
import logging
from pathlib import Path

# Ajouter le répertoire parent au PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from services.voice_clone.voice_quality_analyzer import (
    VoiceQualityAnalyzer,
    VoiceQualityMetrics,
    VoiceSimilarityResult,
    get_voice_quality_analyzer
)

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_analyze_single_audio(analyzer: VoiceQualityAnalyzer, audio_path: str):
    """
    Teste l'analyse d'un seul fichier audio.
    """
    logger.info(f"\n{'=' * 80}")
    logger.info(f"TEST 1: Analyse d'un seul audio")
    logger.info(f"{'=' * 80}")

    if not os.path.exists(audio_path):
        logger.error(f"❌ Fichier non trouvé: {audio_path}")
        return None

    # Analyse sans MFCC (rapide)
    logger.info("📊 Analyse RAPIDE (sans MFCC)...")
    metrics_fast = await analyzer.analyze(audio_path, detailed=False)

    logger.info(f"\nRésultats (rapide):")
    logger.info(f"  🎵 Pitch: {metrics_fast.pitch_mean_hz:.1f} Hz (±{metrics_fast.pitch_std_hz:.1f})")
    logger.info(f"  🔊 Voice type: {metrics_fast.voice_type}")
    logger.info(f"  ✨ Brightness: {metrics_fast.brightness:.1f} Hz")
    logger.info(f"  ⏱️  Duration: {metrics_fast.duration_seconds:.2f}s")

    # Analyse avec MFCC (complète)
    logger.info("\n📊 Analyse COMPLÈTE (avec MFCC)...")
    metrics_detailed = await analyzer.analyze(audio_path, detailed=True)

    logger.info(f"\nRésultats (complet):")
    logger.info(f"  🎵 Pitch: {metrics_detailed.pitch_mean_hz:.1f} Hz (±{metrics_detailed.pitch_std_hz:.1f})")
    logger.info(f"  📊 Pitch range: [{metrics_detailed.pitch_min_hz:.1f} - {metrics_detailed.pitch_max_hz:.1f}] Hz")
    logger.info(f"  🔊 Voice type: {metrics_detailed.voice_type}")
    logger.info(f"  ✨ Brightness: {metrics_detailed.brightness:.1f} Hz")
    logger.info(f"  ⏱️  Duration: {metrics_detailed.duration_seconds:.2f}s")

    if metrics_detailed.mfcc_coefficients:
        logger.info(f"  🔢 MFCC: {len(metrics_detailed.mfcc_coefficients)} coefficients")
        logger.info(f"     Sample: [{metrics_detailed.mfcc_coefficients[0]:.2f}, "
                   f"{metrics_detailed.mfcc_coefficients[1]:.2f}, "
                   f"{metrics_detailed.mfcc_coefficients[2]:.2f}, ...]")

    # Test de sérialisation
    logger.info("\n📦 Test sérialisation JSON...")
    metrics_dict = metrics_detailed.to_dict()
    logger.info(f"  ✅ Sérialisé: {len(str(metrics_dict))} caractères")

    return metrics_detailed


async def test_compare_two_audios(
    analyzer: VoiceQualityAnalyzer,
    audio1_path: str,
    audio2_path: str
):
    """
    Teste la comparaison de similarité entre deux audios.
    """
    logger.info(f"\n{'=' * 80}")
    logger.info(f"TEST 2: Comparaison de similarité entre deux audios")
    logger.info(f"{'=' * 80}")

    if not os.path.exists(audio1_path):
        logger.error(f"❌ Fichier 1 non trouvé: {audio1_path}")
        return None

    if not os.path.exists(audio2_path):
        logger.error(f"❌ Fichier 2 non trouvé: {audio2_path}")
        return None

    logger.info(f"📁 Audio 1: {audio1_path}")
    logger.info(f"📁 Audio 2: {audio2_path}")

    # Comparaison
    logger.info("\n🔬 Analyse de similarité...")
    similarity = await analyzer.compare(audio1_path, audio2_path)

    logger.info(f"\n📊 Résultats de similarité:")
    logger.info(f"  🎵 Pitch similarity:      {similarity.pitch_similarity:.2%}")
    logger.info(f"  ✨ Brightness similarity: {similarity.brightness_similarity:.2%}")
    logger.info(f"  🔢 MFCC similarity:       {similarity.mfcc_similarity:.2%}")
    logger.info(f"  {'=' * 60}")
    logger.info(f"  🎯 OVERALL SIMILARITY:    {similarity.overall_similarity:.2%}")

    # Interprétation
    if similarity.overall_similarity >= 0.80:
        verdict = "✅ EXCELLENT - Voix très similaires"
    elif similarity.overall_similarity >= 0.60:
        verdict = "👍 BON - Voix assez similaires"
    elif similarity.overall_similarity >= 0.40:
        verdict = "⚠️  MOYEN - Similitudes partielles"
    else:
        verdict = "❌ FAIBLE - Voix différentes"

    logger.info(f"\n  {verdict}")

    # Détails des métriques
    if similarity.original_metrics and similarity.cloned_metrics:
        logger.info(f"\n📈 Détails comparatifs:")
        logger.info(f"  Audio 1 - Voice type: {similarity.original_metrics.voice_type}")
        logger.info(f"           Pitch: {similarity.original_metrics.pitch_mean_hz:.1f} Hz")
        logger.info(f"           Brightness: {similarity.original_metrics.brightness:.1f} Hz")
        logger.info(f"")
        logger.info(f"  Audio 2 - Voice type: {similarity.cloned_metrics.voice_type}")
        logger.info(f"           Pitch: {similarity.cloned_metrics.pitch_mean_hz:.1f} Hz")
        logger.info(f"           Brightness: {similarity.cloned_metrics.brightness:.1f} Hz")

    # Test de sérialisation
    logger.info("\n📦 Test sérialisation JSON...")
    similarity_dict = similarity.to_dict()
    logger.info(f"  ✅ Sérialisé: {len(str(similarity_dict))} caractères")

    return similarity


async def test_batch_analysis(analyzer: VoiceQualityAnalyzer, audio_paths: list):
    """
    Teste l'analyse batch de plusieurs audios en parallèle.
    """
    logger.info(f"\n{'=' * 80}")
    logger.info(f"TEST 3: Analyse batch (parallèle)")
    logger.info(f"{'=' * 80}")

    # Filtrer les fichiers existants
    valid_paths = [p for p in audio_paths if os.path.exists(p)]

    if not valid_paths:
        logger.warning("⚠️  Aucun fichier valide pour l'analyse batch")
        return None

    logger.info(f"📁 {len(valid_paths)} fichiers à analyser")

    # Analyse batch
    import time
    start_time = time.time()

    results = await analyzer.analyze_batch(valid_paths, detailed=False)

    batch_time = int((time.time() - start_time) * 1000)

    logger.info(f"\n✅ Analyse batch terminée: {len(results)} audios en {batch_time}ms")
    logger.info(f"   Moyenne: {batch_time // len(results) if results else 0}ms par audio")

    # Afficher un résumé
    logger.info(f"\n📊 Résumé:")
    for path, metrics in results.items():
        filename = Path(path).name
        logger.info(
            f"  {filename}: "
            f"voice_type={metrics.voice_type}, "
            f"pitch={metrics.pitch_mean_hz:.1f}Hz, "
            f"duration={metrics.duration_seconds:.1f}s"
        )

    return results


async def main():
    """
    Fonction principale de test.
    """
    logger.info("=" * 80)
    logger.info("TEST VoiceQualityAnalyzer")
    logger.info("=" * 80)

    # Vérifier la disponibilité
    analyzer = get_voice_quality_analyzer()
    if not analyzer.is_available():
        logger.error("❌ VoiceQualityAnalyzer non disponible (librosa manquant)")
        sys.exit(1)

    logger.info("✅ VoiceQualityAnalyzer disponible")

    # Arguments de ligne de commande
    if len(sys.argv) >= 2:
        audio1_path = sys.argv[1]
        audio2_path = sys.argv[2] if len(sys.argv) >= 3 else audio1_path
    else:
        # Utiliser des fichiers de test par défaut
        logger.warning("⚠️  Aucun fichier fourni, recherche de fichiers de test...")

        # Chercher des fichiers audio dans le répertoire courant
        test_audio_dir = Path(__file__).parent.parent / "test_data" / "audio"
        if not test_audio_dir.exists():
            test_audio_dir = Path.cwd()

        audio_files = list(test_audio_dir.glob("*.wav")) + list(test_audio_dir.glob("*.mp3"))

        if len(audio_files) == 0:
            logger.error("❌ Aucun fichier audio trouvé. Usage: python test_voice_quality_analyzer.py <audio1> [audio2]")
            sys.exit(1)

        audio1_path = str(audio_files[0])
        audio2_path = str(audio_files[1]) if len(audio_files) >= 2 else audio1_path

        logger.info(f"📁 Fichiers de test trouvés: {len(audio_files)}")

    # TEST 1: Analyse d'un seul audio
    await test_analyze_single_audio(analyzer, audio1_path)

    # TEST 2: Comparaison de similarité (si deux fichiers)
    if audio1_path != audio2_path:
        await test_compare_two_audios(analyzer, audio1_path, audio2_path)

    # TEST 3: Analyse batch (si plusieurs fichiers disponibles)
    test_audio_dir = Path(audio1_path).parent
    audio_files = list(test_audio_dir.glob("*.wav")) + list(test_audio_dir.glob("*.mp3"))
    if len(audio_files) >= 2:
        await test_batch_analysis(analyzer, [str(p) for p in audio_files[:5]])

    logger.info(f"\n{'=' * 80}")
    logger.info("✅ TOUS LES TESTS TERMINÉS")
    logger.info("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
