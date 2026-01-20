#!/usr/bin/env python3
"""
Génère des fichiers audio de test pour les tests d'intégration

Ce script crée des fichiers audio synthétiques avec du texte en plusieurs langues
en utilisant gTTS (Google Text-to-Speech) ou ffmpeg.

Usage:
    python generate_test_audio.py
    python generate_test_audio.py --output /tmp/my_test.m4a
    python generate_test_audio.py --method gtts --lang fr
"""

import argparse
import logging
import os
import subprocess
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Textes de test par langue
TEST_TEXTS = {
    'fr': "Bonjour, ceci est un message de test pour vérifier la transcription et la traduction audio.",
    'en': "Hello, this is a test message to verify audio transcription and translation.",
    'es': "Hola, este es un mensaje de prueba para verificar la transcripción y traducción de audio.",
    'de': "Hallo, dies ist eine Testnachricht zur Überprüfung der Audio-Transkription und -Übersetzung.",
}


def generate_with_gtts(text: str, language: str, output_path: str) -> bool:
    """
    Génère un fichier audio avec Google Text-to-Speech

    Nécessite: pip install gtts
    """
    try:
        from gtts import gTTS
        logger.info(f"🎤 Génération audio avec gTTS ({language})...")

        # Créer l'audio avec gTTS
        tts = gTTS(text=text, lang=language, slow=False)

        # Sauvegarder en MP3 temporaire
        temp_mp3 = output_path.replace('.m4a', '_temp.mp3')
        tts.save(temp_mp3)

        # Convertir en M4A avec ffmpeg si disponible
        if is_ffmpeg_available():
            logger.info("🔄 Conversion MP3 → M4A...")
            result = subprocess.run(
                ['ffmpeg', '-i', temp_mp3, '-c:a', 'aac', '-b:a', '128k', output_path, '-y'],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                os.remove(temp_mp3)
                logger.info(f"✅ Fichier créé: {output_path}")
                return True
            else:
                logger.warning("⚠️ Conversion ffmpeg échouée, utilisation du MP3")
                os.rename(temp_mp3, output_path.replace('.m4a', '.mp3'))
                return True
        else:
            # Pas de ffmpeg, garder le MP3
            os.rename(temp_mp3, output_path.replace('.m4a', '.mp3'))
            logger.info(f"✅ Fichier créé: {output_path.replace('.m4a', '.mp3')} (MP3)")
            return True

    except ImportError:
        logger.error("❌ gTTS non installé. Installez-le avec: pip install gtts")
        return False
    except Exception as e:
        logger.error(f"❌ Erreur génération gTTS: {e}")
        return False


def generate_with_ffmpeg(output_path: str, duration: int = 5) -> bool:
    """
    Génère un fichier audio synthétique avec ffmpeg (ton pur)

    Utile si gTTS n'est pas disponible, mais pas de parole réelle.
    """
    if not is_ffmpeg_available():
        logger.error("❌ ffmpeg non trouvé. Installez-le avec: brew install ffmpeg")
        return False

    try:
        logger.info(f"🎵 Génération audio synthétique avec ffmpeg ({duration}s)...")

        # Générer un ton sinusoïdal à 440Hz (La)
        result = subprocess.run(
            [
                'ffmpeg',
                '-f', 'lavfi',
                '-i', f'sine=frequency=440:duration={duration}',
                '-c:a', 'aac',
                '-b:a', '128k',
                output_path,
                '-y'
            ],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            logger.info(f"✅ Fichier créé: {output_path}")
            logger.warning("⚠️ Note: fichier synthétique sans parole (ton pur)")
            return True
        else:
            logger.error(f"❌ Erreur ffmpeg: {result.stderr}")
            return False

    except Exception as e:
        logger.error(f"❌ Erreur génération ffmpeg: {e}")
        return False


def is_ffmpeg_available() -> bool:
    """Vérifie si ffmpeg est installé"""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def is_gtts_available() -> bool:
    """Vérifie si gTTS est installé"""
    try:
        import gtts
        return True
    except ImportError:
        return False


def get_file_info(file_path: str):
    """Affiche les informations du fichier audio créé"""
    if not os.path.exists(file_path):
        return

    size_kb = os.path.getsize(file_path) / 1024

    logger.info("\n" + "="*60)
    logger.info("📊 Informations du fichier")
    logger.info("="*60)
    logger.info(f"📁 Chemin: {file_path}")
    logger.info(f"💾 Taille: {size_kb:.1f} KB")

    # Si ffmpeg disponible, obtenir la durée
    if is_ffmpeg_available():
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                duration = float(result.stdout.strip())
                logger.info(f"⏱️  Durée: {duration:.1f}s")
        except Exception:
            pass

    logger.info("="*60)


def main():
    parser = argparse.ArgumentParser(
        description="Génère des fichiers audio de test pour les tests d'intégration"
    )
    parser.add_argument(
        '--output', '-o',
        default='/tmp/test_audio.m4a',
        help='Chemin du fichier de sortie (défaut: /tmp/test_audio.m4a)'
    )
    parser.add_argument(
        '--method', '-m',
        choices=['auto', 'gtts', 'ffmpeg'],
        default='auto',
        help='Méthode de génération (défaut: auto)'
    )
    parser.add_argument(
        '--lang', '-l',
        choices=['fr', 'en', 'es', 'de'],
        default='fr',
        help='Langue du texte pour gTTS (défaut: fr)'
    )
    parser.add_argument(
        '--duration', '-d',
        type=int,
        default=5,
        help='Durée en secondes pour ffmpeg (défaut: 5)'
    )
    parser.add_argument(
        '--text', '-t',
        help='Texte personnalisé pour gTTS'
    )

    args = parser.parse_args()

    logger.info("\n" + "="*60)
    logger.info("🎬 Génération de fichier audio de test")
    logger.info("="*60)

    # Créer le répertoire parent si nécessaire
    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
        logger.info(f"📁 Répertoire créé: {output_dir}")

    # Déterminer la méthode
    method = args.method
    if method == 'auto':
        if is_gtts_available():
            method = 'gtts'
            logger.info("🔍 Méthode auto → gTTS (disponible)")
        elif is_ffmpeg_available():
            method = 'ffmpeg'
            logger.info("🔍 Méthode auto → ffmpeg (gTTS non disponible)")
        else:
            logger.error("❌ Aucune méthode disponible!")
            logger.error("   Installez gTTS: pip install gtts")
            logger.error("   Ou installez ffmpeg: brew install ffmpeg")
            return 1

    # Générer le fichier
    success = False

    if method == 'gtts':
        text = args.text or TEST_TEXTS.get(args.lang, TEST_TEXTS['fr'])
        logger.info(f"📝 Texte: \"{text}\"")
        success = generate_with_gtts(text, args.lang, args.output)

    elif method == 'ffmpeg':
        success = generate_with_ffmpeg(args.output, args.duration)

    if success:
        # Afficher les infos du fichier
        actual_file = args.output
        if not os.path.exists(actual_file) and os.path.exists(actual_file.replace('.m4a', '.mp3')):
            actual_file = actual_file.replace('.m4a', '.mp3')

        get_file_info(actual_file)

        logger.info("\n✅ Fichier audio de test créé avec succès !")
        logger.info(f"\n🧪 Pour l'utiliser dans les tests:")
        logger.info(f"   cp {actual_file} /tmp/test_audio.m4a")
        logger.info(f"   pytest tests/integration/test_translator_e2e.py -v -s")

        return 0
    else:
        logger.error("\n❌ Échec de la génération du fichier audio")
        return 1


if __name__ == "__main__":
    sys.exit(main())
