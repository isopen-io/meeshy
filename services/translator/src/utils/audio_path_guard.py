"""
Garde des chemins audio reçus par ZMQ (#18628).

Le socket PULL du traducteur n'est pas authentifié : un chemin de fichier
porté par une requête (`audioPath`, `audioPath_1`, `audioPath_2`) est une
donnée NON FIABLE. Il n'est ouvert que s'il désigne un fichier régulier qui,
liens symboliques résolus, tombe sous une racine autorisée. Tout le reste est
refusé, fail-closed, par `AudioPathRejected`.

Le garde ne s'applique qu'aux chemins VENUS DE LA REQUÊTE : les fichiers que
les handlers écrivent eux-mêmes (binaire multipart, base64) n'y passent pas.

Racines : `TRANSLATOR_AUDIO_PATH_ROOTS` (séparées par `os.pathsep`) si la
variable est posée, sinon le répertoire temporaire du processus et la racine
d'uploads de la passerelle (`UPLOAD_PATH`, `/app/uploads` par défaut, la
valeur même dont la passerelle compose les `audioPath` qu'elle envoie).

Le refus ne porte qu'une RAISON, jamais le chemin : les journaux et les
charges d'erreur publiées n'en reçoivent pas une miette.
"""

import os
import tempfile
from pathlib import Path
from typing import Optional, Sequence, Tuple

ROOTS_ENV = "TRANSLATOR_AUDIO_PATH_ROOTS"
GATEWAY_UPLOAD_ENV = "UPLOAD_PATH"
GATEWAY_UPLOAD_DEFAULT = "/app/uploads"
AUDIO_PATH_REJECTED = "AUDIO_PATH_REJECTED"
AUDIO_PATH_REJECTED_MESSAGE = "Audio path rejected"


class AudioPathRejected(Exception):
    """Chemin audio refusé. `reason` est un libellé fixe, sans donnée de requête."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(f"{AUDIO_PATH_REJECTED_MESSAGE}: {reason}")


def _default_roots() -> Tuple[str, ...]:
    return (
        tempfile.gettempdir(),
        os.getenv(GATEWAY_UPLOAD_ENV) or GATEWAY_UPLOAD_DEFAULT,
    )


def allowed_audio_roots() -> Tuple[Path, ...]:
    configured = os.getenv(ROOTS_ENV)
    raw = configured.split(os.pathsep) if configured is not None else _default_roots()
    return tuple(Path(entry).resolve() for entry in raw if entry.strip())


def _resolved(raw: object) -> Path:
    if not isinstance(raw, str) or not raw:
        raise AudioPathRejected("empty_or_invalid")
    if "\x00" in raw:
        raise AudioPathRejected("null_byte")
    try:
        return Path(raw).resolve(strict=True)
    except (FileNotFoundError, NotADirectoryError):
        raise AudioPathRejected("not_found") from None
    except (OSError, RuntimeError, ValueError):
        raise AudioPathRejected("unresolvable") from None


def guard_requested_audio_path(raw: object, roots: Optional[Sequence[Path]] = None) -> str:
    """Rend le chemin RÉSOLU d'un fichier régulier sous une racine autorisée, sinon lève."""
    resolved = _resolved(raw)
    bounds = tuple(roots) if roots is not None else allowed_audio_roots()
    if not any(resolved.is_relative_to(root) for root in bounds):
        raise AudioPathRejected("outside_roots")
    if not resolved.is_file():
        raise AudioPathRejected("not_a_file")
    return str(resolved)


def guard_optional_audio_path(raw: object) -> Optional[str]:
    """Un chemin absent (None, chaîne vide) reste absent ; tout chemin présent est gardé."""
    if raw is None or raw == "":
        return None
    return guard_requested_audio_path(raw)
