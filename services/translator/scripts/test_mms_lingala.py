#!/usr/bin/env python3
"""
Script de test pour MMS TTS avec les langues africaines
Usage: python scripts/test_mms_lingala.py [--text "Votre texte"] [--language sw]

IMPORTANT: Lingala (ln) n'est PAS disponible pour MMS TTS!
Utilisez Swahili (sw) ou d'autres langues africaines disponibles:
- am (Amharic), sw (Swahili), yo (Yoruba), ha (Hausa)
- rw (Kinyarwanda), rn (Kirundi), sn (Shona), lg (Luganda)
- om (Oromo), ti (Tigrinya), ny (Chichewa), ee (Ewe)
- ff (Fula), mg (Malagasy), so (Somali), ts (Tsonga)
"""

import sys
import os
import asyncio
import argparse

# Ajouter le chemin src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.mms_tts_service import get_mms_tts_service, MMS_AVAILABLE


async def test_mms_tts(text: str, language: str, output_format: str = "mp3"):
    """Test de synthese MMS TTS"""

    print("=" * 60)
    print("TEST MMS TTS - Meeshy Multilingual Speech")
    print("=" * 60)

    if not MMS_AVAILABLE:
        print("ERREUR: MMS TTS non disponible")
        print("Installez: pip install ttsmms")
        return

    # Obtenir le service
    service = get_mms_tts_service()

    # Initialiser
    print(f"\n[1/4] Initialisation du service MMS...")
    await service.initialize()

    # Verifier le support de la langue
    print(f"\n[2/4] Verification du support pour '{language}'...")
    if not service.is_language_supported(language):
        reason = service.get_unavailable_reason(language)
        print(f"ERREUR: {reason}")
        print(f"\nLangues africaines disponibles: {service.get_african_languages()}")
        print(f"Langues europeennes: en, fr, es, de, pt")
        return
    print(f"Langue '{language}' supportee")

    # Synthetiser
    print(f"\n[3/4] Synthese en cours...")
    print(f"  Texte: {text}")
    print(f"  Langue: {language}")
    print(f"  Format: {output_format}")

    try:
        result = await service.synthesize(
            text=text,
            language=language,
            output_format=output_format
        )

        print(f"\n[4/4] Synthese terminee!")
        print(f"  Fichier: {result.audio_path}")
        print(f"  Duree: {result.duration_ms}ms")
        print(f"  Temps de traitement: {result.processing_time_ms}ms")
        print(f"  Modele: {result.model_id}")

        # Stats du service
        stats = await service.get_stats()
        print(f"\n[Stats]")
        print(f"  Modeles charges: {stats['loaded_models']}")
        print(f"  Langues africaines: {stats['african_languages']}")

        print("\n" + "=" * 60)
        print("TEST REUSSI!")
        print("=" * 60)

        return result.audio_path

    except Exception as e:
        print(f"\nERREUR: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Test MMS TTS avec langues africaines",
        epilog="NOTE: Lingala (ln) n'est PAS disponible. Utilisez sw, yo, ha, am, etc."
    )
    parser.add_argument(
        "--text", "-t",
        default="Habari, ninajaribu mfumo wa kutafsiri sauti na sentensi hii.",
        help="Texte a synthetiser"
    )
    parser.add_argument(
        "--language", "-l",
        default="sw",  # Changed default to Swahili (available)
        help="Code de langue (sw=Swahili, yo=Yoruba, ha=Hausa, am=Amharic, etc.)"
    )
    parser.add_argument(
        "--format", "-f",
        default="mp3",
        choices=["mp3", "wav", "ogg"],
        help="Format de sortie audio"
    )

    args = parser.parse_args()

    # Exemples de textes par langue
    examples = {
        "sw": "Habari, ninajaribu mfumo wa kutafsiri sauti na sentensi hii.",
        "yo": "Bawo ni, mo n gbiyanju eto itumọ ohun pẹlu gbolohun yii.",
        "ha": "Sannu, ina gwada tsarin fassarar murya da wannan jumla.",
        "am": "ሰላም፣ ይህን ዓረፍተ ነገር በድምፅ ትርጉም ስርዓት እየሞከርኩ ነው።",
        "rw": "Muraho, ndagerageza uburyo bwo guhindura ijwi ukoresheje aya magambo.",
        "fr": "Bonjour, je teste le systeme de traduction vocale avec cette phrase.",
        "en": "Hello, I am testing the voice translation system with this sentence.",
    }

    # Utiliser l'exemple si le texte par defaut est garde
    if args.text == parser.get_default("text") and args.language in examples:
        args.text = examples[args.language]

    asyncio.run(test_mms_tts(args.text, args.language, args.format))


if __name__ == "__main__":
    main()
