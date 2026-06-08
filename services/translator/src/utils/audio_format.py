"""Helpers purs de format audio pour le pipeline TTS.

Centralise la politique d'encodage (Opus basse bande pour la voix, D1 du
sprint « Poids des Payloads ») et la sélection des octets audio à transmettre
(D2 : suppression du round-trip base64 interne synthétiseur → handler ZMQ).

Module volontairement sans dépendance lourde (ffmpeg/pydub/torch) afin de
rester unit-testable sans le stack ML.
"""

import base64
import os
from typing import Optional

# Opus VoIP defaults — mono, basse bande (D1). Surchargeable par env pour
# laisser le déploiement ajuster le compromis qualité/poids sans redeploy.
OPUS_BITRATE = os.getenv("TTS_OPUS_BITRATE", "32k")
OPUS_APPLICATION = os.getenv("TTS_OPUS_APPLICATION", "voip")

# Mapping format → type MIME. On conserve "audio/mp3" (legacy) pour ne pas
# casser les clients existants ; "audio/opus" est ajouté pour D1.
_MIME_BY_FORMAT = {
    "opus": "audio/opus",
    "ogg": "audio/ogg",
    "mp3": "audio/mp3",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "flac": "audio/flac",
}


def normalize_format(target_format: Optional[str]) -> str:
    """Normalise un format ('.MP3', ' Opus ' → 'mp3', 'opus')."""
    return (target_format or "").strip().lower().lstrip(".")


def mime_type_for(target_format: Optional[str]) -> str:
    """Type MIME pour un format audio. Fallback 'audio/mp3' si inconnu/vide."""
    fmt = normalize_format(target_format)
    if not fmt:
        return "audio/mp3"
    return _MIME_BY_FORMAT.get(fmt, f"audio/{fmt}")


def export_options(
    target_format: Optional[str],
    *,
    bitrate: Optional[str] = None,
    application: Optional[str] = None,
) -> dict:
    """Construit les kwargs d'`AudioSegment.export()` (pydub/ffmpeg).

    Opus → libopus mono basse bande (VoIP) pour le plus gros gain de poids ;
    les autres formats utilisent l'export simple par défaut de pydub.
    """
    fmt = normalize_format(target_format)
    if fmt == "opus":
        return {
            "format": "opus",
            "codec": "libopus",
            "bitrate": bitrate or OPUS_BITRATE,
            "parameters": ["-ac", "1", "-application", application or OPUS_APPLICATION],
        }
    return {"format": fmt}


def read_audio_bytes(
    *,
    audio_path: Optional[str] = None,
    audio_data_base64: Optional[str] = None,
) -> Optional[bytes]:
    """Octets audio à placer dans une frame binaire ZMQ.

    Préfère lire le fichier sur disque (D2 : pas de round-trip base64) ; le
    base64 n'est qu'un fallback legacy pour les producteurs non migrés.
    """
    if audio_path and os.path.exists(audio_path):
        with open(audio_path, "rb") as f:
            return f.read()
    if audio_data_base64:
        return base64.b64decode(audio_data_base64)
    return None
