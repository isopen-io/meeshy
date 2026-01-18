#!/usr/bin/env python3
"""
Generate Test Audio Fixtures
=============================

Génère des fichiers audio de test pour VoiceAnalyzerService.

Types de fichiers générés:
- Voix masculine (male_voice.wav)
- Voix féminine (female_voice.wav)
- Voix enfant (child_voice.wav)
- Silence (silence.wav)
- Bruit blanc (white_noise.wav)
- Audio court (short_audio.wav)
- Voix expressive (expressive_voice.wav)
- Voix monotone (monotone_voice.wav)

Usage:
    python generate_test_audio.py [--output-dir DIR] [--duration SECONDS]
"""

import os
import sys
import argparse
import logging
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

import numpy as np

logger = logging.getLogger(__name__)

# Vérifier la disponibilité de soundfile
try:
    import soundfile as sf
    SOUNDFILE_AVAILABLE = True
except ImportError:
    logger.error("soundfile n'est pas installé. Installation: pip install soundfile")
    SOUNDFILE_AVAILABLE = False


class AudioGenerator:
    """Générateur de fichiers audio de test"""

    def __init__(self, sample_rate: int = 22050):
        self.sample_rate = sample_rate

    def generate_voice(
        self,
        duration: float,
        f0: float,
        pitch_variance: float = 0.1,
        expressiveness: float = 0.5
    ) -> np.ndarray:
        """
        Génère un signal vocal synthétique.

        Args:
            duration: Durée en secondes
            f0: Fréquence fondamentale (Hz)
            pitch_variance: Variance du pitch (0-1)
            expressiveness: Expressivité (0-1)

        Returns:
            Signal audio normalisé
        """
        t = np.linspace(0, duration, int(self.sample_rate * duration))

        # Modulation du pitch
        if pitch_variance > 0:
            pitch_mod = 1 + pitch_variance * np.sin(2 * np.pi * 3 * t)
        else:
            pitch_mod = 1.0

        # Générer la fondamentale et harmoniques
        signal = np.zeros_like(t)
        harmonics = [1.0, 0.5, 0.3, 0.2, 0.1]

        for i, amp in enumerate(harmonics, start=1):
            signal += amp * np.sin(2 * np.pi * f0 * i * pitch_mod * t)

        # Ajouter de l'expressivité avec modulation d'amplitude
        if expressiveness > 0:
            envelope = 0.5 + expressiveness * 0.5 * np.sin(2 * np.pi * 4 * t)
        else:
            envelope = 0.8

        signal = signal * envelope

        # Ajouter un peu de bruit pour le réalisme
        noise_level = 0.02
        signal += noise_level * np.random.randn(len(t))

        # Normaliser
        signal = signal / np.max(np.abs(signal)) * 0.9

        return signal.astype(np.float32)

    def generate_male_voice(self, duration: float = 3.0) -> np.ndarray:
        """Génère une voix masculine typique"""
        return self.generate_voice(
            duration=duration,
            f0=120,  # 120 Hz = voix masculine moyenne
            pitch_variance=0.08,
            expressiveness=0.5
        )

    def generate_female_voice(self, duration: float = 3.0) -> np.ndarray:
        """Génère une voix féminine typique"""
        return self.generate_voice(
            duration=duration,
            f0=220,  # 220 Hz = voix féminine moyenne
            pitch_variance=0.12,
            expressiveness=0.6
        )

    def generate_child_voice(self, duration: float = 2.0) -> np.ndarray:
        """Génère une voix d'enfant"""
        return self.generate_voice(
            duration=duration,
            f0=300,  # 300 Hz = voix enfant
            pitch_variance=0.15,
            expressiveness=0.7
        )

    def generate_expressive_voice(self, duration: float = 3.0) -> np.ndarray:
        """Génère une voix très expressive"""
        return self.generate_voice(
            duration=duration,
            f0=150,
            pitch_variance=0.20,  # Haute variance
            expressiveness=0.8    # Très expressive
        )

    def generate_monotone_voice(self, duration: float = 3.0) -> np.ndarray:
        """Génère une voix monotone"""
        return self.generate_voice(
            duration=duration,
            f0=130,
            pitch_variance=0.02,  # Variance minimale
            expressiveness=0.1    # Peu expressive
        )

    def generate_silence(self, duration: float = 1.0) -> np.ndarray:
        """Génère un fichier silencieux"""
        return np.zeros(int(self.sample_rate * duration), dtype=np.float32)

    def generate_white_noise(self, duration: float = 1.0) -> np.ndarray:
        """Génère du bruit blanc"""
        signal = np.random.randn(int(self.sample_rate * duration))
        return (signal / np.max(np.abs(signal)) * 0.5).astype(np.float32)

    def generate_short_audio(self, duration: float = 0.5) -> np.ndarray:
        """Génère un audio très court"""
        return self.generate_voice(
            duration=duration,
            f0=150,
            pitch_variance=0.08,
            expressiveness=0.5
        )

    def save(self, signal: np.ndarray, filepath: Path):
        """Sauvegarde un signal audio en WAV"""
        if not SOUNDFILE_AVAILABLE:
            raise ImportError("soundfile requis pour sauvegarder les fichiers audio")

        sf.write(str(filepath), signal, self.sample_rate)
        logger.info(f"✅ Fichier sauvegardé: {filepath.name} ({len(signal)/self.sample_rate:.2f}s)")


def main():
    """Point d'entrée principal"""
    parser = argparse.ArgumentParser(description="Génère des fichiers audio de test")
    parser.add_argument(
        '--output-dir',
        type=str,
        default='./test_audio_fixtures',
        help='Répertoire de sortie (défaut: ./test_audio_fixtures)'
    )
    parser.add_argument(
        '--duration',
        type=float,
        default=3.0,
        help='Durée par défaut des fichiers (défaut: 3.0s)'
    )
    parser.add_argument(
        '--sample-rate',
        type=int,
        default=22050,
        help='Sample rate (défaut: 22050 Hz)'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Mode verbose'
    )

    args = parser.parse_args()

    # Configuration du logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

    if not SOUNDFILE_AVAILABLE:
        logger.error("❌ soundfile n'est pas installé")
        logger.error("Installation: pip install soundfile")
        sys.exit(1)

    # Créer le répertoire de sortie
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"📁 Répertoire de sortie: {output_dir}")
    logger.info(f"🎵 Sample rate: {args.sample_rate} Hz")
    logger.info(f"⏱️  Durée par défaut: {args.duration}s")
    logger.info("")

    # Créer le générateur
    generator = AudioGenerator(sample_rate=args.sample_rate)

    # Générer tous les fichiers
    fixtures = {
        'male_voice.wav': lambda: generator.generate_male_voice(args.duration),
        'female_voice.wav': lambda: generator.generate_female_voice(args.duration),
        'child_voice.wav': lambda: generator.generate_child_voice(2.0),
        'expressive_voice.wav': lambda: generator.generate_expressive_voice(args.duration),
        'monotone_voice.wav': lambda: generator.generate_monotone_voice(args.duration),
        'silence.wav': lambda: generator.generate_silence(1.0),
        'white_noise.wav': lambda: generator.generate_white_noise(1.0),
        'short_audio.wav': lambda: generator.generate_short_audio(0.5),
    }

    logger.info("🎵 Génération des fichiers audio...")
    logger.info("")

    for filename, generate_func in fixtures.items():
        filepath = output_dir / filename
        try:
            signal = generate_func()
            generator.save(signal, filepath)
        except Exception as e:
            logger.error(f"❌ Erreur pour {filename}: {e}")

    logger.info("")
    logger.info("✅ Génération terminée!")
    logger.info(f"📂 Fichiers disponibles dans: {output_dir.absolute()}")
    logger.info("")
    logger.info("Usage dans les tests:")
    logger.info(f"  sample_audio = '{output_dir}/male_voice.wav'")
    logger.info(f"  analyzer.analyze(sample_audio)")


if __name__ == '__main__':
    main()
