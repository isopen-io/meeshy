#!/usr/bin/env python3
"""
Test Chatterbox avec tous les 6 paramètres configurables
========================================================

Ce test génère plusieurs versions audio en variant tous les paramètres:
- exaggeration (0.0-1.0): Expressivité vocale
- cfg_weight (0.0-1.0): Guidance du modèle
- temperature (0.0-2.0): Créativité/aléatoire
- repetition_penalty (1.0-3.0): Pénalité de répétition
- min_p (0.0-1.0): Probabilité minimum sampling
- top_p (0.0-1.0): Nucleus sampling

Usage:
    cd services/translator
    python -m src.tests.integration.test_chatterbox_all_params \
        --audio /path/to/voice.wav \
        --output-dir ./outputs/param_tests
"""

import os
import sys
import asyncio
import argparse
import json
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

# Ajouter le chemin du projet
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from src.services.tts.backends.chatterbox_backend import ChatterboxBackend


@dataclass
class ParamSet:
    """Jeu de paramètres à tester"""
    name: str
    exaggeration: float
    cfg_weight: float
    temperature: float
    repetition_penalty: float
    min_p: float
    top_p: float
    description: str = ""


@dataclass
class TestResult:
    """Résultat d'un test"""
    params: ParamSet
    language: str
    text: str
    audio_path: str
    duration_ms: int
    success: bool
    error: Optional[str] = None


# Jeux de paramètres prédéfinis pour différents cas d'usage
PRESET_PARAM_SETS: List[ParamSet] = [
    # Valeurs par défaut
    ParamSet(
        name="default",
        exaggeration=0.5,
        cfg_weight=0.5,
        temperature=0.8,
        repetition_penalty=1.2,
        min_p=0.05,
        top_p=1.0,
        description="Valeurs par défaut équilibrées"
    ),

    # Voix naturelle (faible expressivité)
    ParamSet(
        name="natural",
        exaggeration=0.2,
        cfg_weight=0.3,
        temperature=0.5,
        repetition_penalty=1.2,
        min_p=0.05,
        top_p=0.9,
        description="Voix naturelle et posée"
    ),

    # Voix expressive (haute expressivité)
    ParamSet(
        name="expressive",
        exaggeration=0.8,
        cfg_weight=0.5,
        temperature=1.0,
        repetition_penalty=1.5,
        min_p=0.05,
        top_p=1.0,
        description="Voix très expressive et dynamique"
    ),

    # Voix stable (faible température)
    ParamSet(
        name="stable",
        exaggeration=0.4,
        cfg_weight=0.7,
        temperature=0.3,
        repetition_penalty=1.3,
        min_p=0.1,
        top_p=0.8,
        description="Voix stable et consistante"
    ),

    # Voix créative (haute température)
    ParamSet(
        name="creative",
        exaggeration=0.6,
        cfg_weight=0.4,
        temperature=1.5,
        repetition_penalty=1.8,
        min_p=0.02,
        top_p=1.0,
        description="Voix créative avec variations"
    ),

    # Optimisé pour langues non-anglaises
    ParamSet(
        name="non_english",
        exaggeration=0.5,
        cfg_weight=0.0,  # Important: 0 pour langues non-anglaises
        temperature=0.8,
        repetition_penalty=2.0,  # Plus élevé pour multilingue
        min_p=0.05,
        top_p=1.0,
        description="Optimisé pour langues non-anglaises"
    ),

    # Anti-répétition fort
    ParamSet(
        name="no_repeat",
        exaggeration=0.5,
        cfg_weight=0.5,
        temperature=0.8,
        repetition_penalty=2.5,
        min_p=0.08,
        top_p=0.9,
        description="Forte pénalité contre les répétitions"
    ),

    # Sampling strict (nucleus sampling restrictif)
    ParamSet(
        name="strict_sampling",
        exaggeration=0.5,
        cfg_weight=0.6,
        temperature=0.7,
        repetition_penalty=1.3,
        min_p=0.1,
        top_p=0.7,
        description="Sampling strict et prévisible"
    ),
]

# Textes de test par langue
TEST_TEXTS: Dict[str, str] = {
    "en": "Hello! My name is Claude. I am testing the voice cloning system with various parameters.",
    "fr": "Bonjour ! Je m'appelle Claude. Je teste le système de clonage vocal avec différents paramètres.",
    "es": "¡Hola! Me llamo Claude. Estoy probando el sistema de clonación de voz con varios parámetros.",
    "de": "Hallo! Mein Name ist Claude. Ich teste das Sprachklon-System mit verschiedenen Parametern.",
    "it": "Ciao! Mi chiamo Claude. Sto testando il sistema di clonazione vocale con vari parametri.",
    "pt": "Olá! Meu nome é Claude. Estou testando o sistema de clonagem de voz com vários parâmetros.",
    "ja": "こんにちは！私はクロードです。様々なパラメータで音声クローンシステムをテストしています。",
    "zh": "你好！我叫Claude。我正在测试带有各种参数的语音克隆系统。",
}


async def run_test(
    backend: ChatterboxBackend,
    audio_path: str,
    params: ParamSet,
    language: str,
    text: str,
    output_dir: Path
) -> TestResult:
    """Exécute un test avec un jeu de paramètres"""
    output_file = output_dir / f"{params.name}_{language}.wav"

    try:
        print(f"  [{params.name}] {language}: {params.description}")

        await backend.synthesize(
            text=text,
            language=language,
            speaker_audio_path=audio_path,
            output_path=str(output_file),
            exaggeration=params.exaggeration,
            cfg_weight=params.cfg_weight,
            temperature=params.temperature,
            repetition_penalty=params.repetition_penalty,
            min_p=params.min_p,
            top_p=params.top_p,
            auto_optimize_params=False  # Désactivé pour utiliser nos valeurs exactes
        )

        # Calculer la durée (compatible toutes versions librosa)
        from utils.audio_utils import get_audio_duration
        duration = get_audio_duration(str(output_file))
        duration_ms = int(duration * 1000)

        print(f"    ✅ Généré: {output_file.name} ({duration_ms}ms)")

        return TestResult(
            params=params,
            language=language,
            text=text,
            audio_path=str(output_file),
            duration_ms=duration_ms,
            success=True
        )

    except Exception as e:
        print(f"    ❌ Erreur: {e}")
        return TestResult(
            params=params,
            language=language,
            text=text,
            audio_path="",
            duration_ms=0,
            success=False,
            error=str(e)
        )


async def main():
    parser = argparse.ArgumentParser(
        description="Test Chatterbox avec tous les 6 paramètres"
    )
    parser.add_argument(
        "--audio", "-a",
        required=True,
        help="Chemin vers l'audio de référence pour le clonage"
    )
    parser.add_argument(
        "--output-dir", "-o",
        default="./outputs/param_tests",
        help="Répertoire de sortie pour les audios générés"
    )
    parser.add_argument(
        "--languages", "-l",
        nargs="+",
        default=["fr", "en"],
        help="Langues à tester (ex: fr en es)"
    )
    parser.add_argument(
        "--presets", "-p",
        nargs="*",
        default=None,
        help="Presets à tester (ex: default natural expressive). Si non spécifié, teste tous."
    )
    parser.add_argument(
        "--custom-params",
        type=str,
        default=None,
        help="Paramètres personnalisés en JSON (ex: '{\"exaggeration\": 0.7, \"cfg_weight\": 0.3}')"
    )

    args = parser.parse_args()

    # Vérifier l'audio
    if not os.path.exists(args.audio):
        print(f"❌ Fichier audio introuvable: {args.audio}")
        sys.exit(1)

    # Créer le répertoire de sortie
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(args.output_dir) / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Test Chatterbox - Tous les paramètres")
    print(f"{'='*60}")
    print(f"Audio de référence: {args.audio}")
    print(f"Répertoire sortie: {output_dir}")
    print(f"Langues: {args.languages}")
    print(f"{'='*60}\n")

    # Initialiser le backend
    print("🔄 Initialisation Chatterbox...")
    backend = ChatterboxBackend(device="auto")
    await backend.initialize()
    await backend.initialize_multilingual()
    print("✅ Chatterbox initialisé\n")

    # Déterminer les presets à tester
    param_sets = []

    if args.custom_params:
        # Paramètres personnalisés
        custom = json.loads(args.custom_params)
        param_sets.append(ParamSet(
            name="custom",
            exaggeration=custom.get("exaggeration", 0.5),
            cfg_weight=custom.get("cfg_weight", 0.5),
            temperature=custom.get("temperature", 0.8),
            repetition_penalty=custom.get("repetition_penalty", 1.2),
            min_p=custom.get("min_p", 0.05),
            top_p=custom.get("top_p", 1.0),
            description="Paramètres personnalisés"
        ))
    elif args.presets:
        # Presets spécifiques
        preset_map = {p.name: p for p in PRESET_PARAM_SETS}
        for name in args.presets:
            if name in preset_map:
                param_sets.append(preset_map[name])
            else:
                print(f"⚠️ Preset inconnu: {name}")
    else:
        # Tous les presets
        param_sets = PRESET_PARAM_SETS

    print(f"📋 Presets à tester: {[p.name for p in param_sets]}")
    print(f"🌍 Langues: {args.languages}\n")

    # Exécuter les tests
    results: List[TestResult] = []

    for lang in args.languages:
        text = TEST_TEXTS.get(lang, TEST_TEXTS["en"])
        print(f"\n🌍 Langue: {lang}")
        print(f"   Texte: {text[:50]}...")
        print()

        for params in param_sets:
            result = await run_test(
                backend=backend,
                audio_path=args.audio,
                params=params,
                language=lang,
                text=text,
                output_dir=output_dir
            )
            results.append(result)

    # Résumé
    print(f"\n{'='*60}")
    print("RÉSUMÉ")
    print(f"{'='*60}")

    success_count = sum(1 for r in results if r.success)
    total_count = len(results)

    print(f"Tests réussis: {success_count}/{total_count}")
    print(f"Fichiers générés: {output_dir}")

    # Sauvegarder les résultats
    results_file = output_dir / "results.json"
    results_data = {
        "timestamp": timestamp,
        "audio_reference": args.audio,
        "languages": args.languages,
        "results": [
            {
                "preset": r.params.name,
                "description": r.params.description,
                "params": {
                    "exaggeration": r.params.exaggeration,
                    "cfg_weight": r.params.cfg_weight,
                    "temperature": r.params.temperature,
                    "repetition_penalty": r.params.repetition_penalty,
                    "min_p": r.params.min_p,
                    "top_p": r.params.top_p,
                },
                "language": r.language,
                "text": r.text,
                "audio_path": r.audio_path,
                "duration_ms": r.duration_ms,
                "success": r.success,
                "error": r.error
            }
            for r in results
        ]
    }

    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(results_data, f, ensure_ascii=False, indent=2)

    print(f"Résultats sauvegardés: {results_file}")

    # Afficher le tableau comparatif
    print(f"\n📊 Tableau comparatif des paramètres:")
    print("-" * 100)
    print(f"{'Preset':<15} {'Exp':<5} {'CFG':<5} {'Temp':<5} {'RepP':<5} {'MinP':<5} {'TopP':<5} | Description")
    print("-" * 100)
    for p in param_sets:
        print(f"{p.name:<15} {p.exaggeration:<5.2f} {p.cfg_weight:<5.2f} {p.temperature:<5.2f} {p.repetition_penalty:<5.2f} {p.min_p:<5.2f} {p.top_p:<5.2f} | {p.description}")
    print("-" * 100)

    print(f"\n✅ Test terminé!")
    print(f"   Écoutez les fichiers dans: {output_dir}")

    # Fermer le backend
    await backend.close()


if __name__ == "__main__":
    asyncio.run(main())
