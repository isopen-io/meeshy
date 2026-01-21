"""
Audio Format Converter
======================

Convertit les formats audio non supportés par soundfile/libsndfile en WAV.

soundfile (via libsndfile) ne supporte pas nativement :
- M4A (AAC)
- MP3
- Certains formats propriétaires

Ce module utilise pydub (via ffmpeg) pour la conversion.
"""

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Formats audio supportés nativement par soundfile (libsndfile)
SOUNDFILE_SUPPORTED_FORMATS = {'.wav', '.flac', '.ogg', '.aiff', '.aif', '.raw'}

# Cache des conversions pour éviter les reconversions
_conversion_cache: dict = {}


def convert_to_wav_if_needed(audio_path: str, cache: bool = True) -> str:
    """
    Convertit un fichier audio en WAV si le format n'est pas supporté par soundfile.

    soundfile/libsndfile ne supporte pas M4A, AAC, MP3 nativement.
    On utilise pydub (via ffmpeg) pour la conversion.

    Args:
        audio_path: Chemin du fichier audio source
        cache: Si True, utilise le cache pour éviter les reconversions

    Returns:
        Chemin du fichier WAV (original si déjà supporté, sinon fichier converti)
    """
    # Vérifier le cache
    if cache and audio_path in _conversion_cache:
        cached_path = _conversion_cache[audio_path]
        if Path(cached_path).exists():
            return cached_path

    ext = Path(audio_path).suffix.lower()

    # Si format déjà supporté, retourner tel quel
    if ext in SOUNDFILE_SUPPORTED_FORMATS:
        return audio_path

    try:
        from pydub import AudioSegment as PydubAudioSegment

        logger.info(f"[AUDIO_CONVERT] 🔄 Conversion {ext} → WAV: {Path(audio_path).name}")

        # Charger avec pydub (utilise ffmpeg en backend)
        audio = PydubAudioSegment.from_file(audio_path)

        # Créer un fichier WAV (même répertoire, suffixe _converted.wav)
        wav_path = str(Path(audio_path).with_suffix('.converted.wav'))

        # Exporter en WAV 16-bit, mono si stéréo
        audio = audio.set_sample_width(2)  # 16-bit
        if audio.channels > 1:
            audio = audio.set_channels(1)  # Mono

        audio.export(wav_path, format='wav')

        logger.info(f"[AUDIO_CONVERT] ✅ Converti: {wav_path}")

        # Mettre en cache
        if cache:
            _conversion_cache[audio_path] = wav_path

        return wav_path

    except ImportError:
        logger.error("[AUDIO_CONVERT] ❌ pydub non disponible pour la conversion")
        raise RuntimeError(f"pydub requis pour convertir {ext} en WAV")
    except Exception as e:
        logger.error(f"[AUDIO_CONVERT] ❌ Erreur conversion {audio_path}: {e}")
        raise


def clear_conversion_cache():
    """Vide le cache des conversions."""
    global _conversion_cache
    _conversion_cache.clear()
    logger.debug("[AUDIO_CONVERT] Cache vidé")


def get_supported_formats() -> set:
    """Retourne les formats supportés nativement par soundfile."""
    return SOUNDFILE_SUPPORTED_FORMATS.copy()
