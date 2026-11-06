"""
Écriture d'une piste WAV indépendante de la version de torchaudio (#16340).

`torchaudio.save` délègue à TorchCodec depuis torchaudio 2.9 et lève
`ImportError` sans lui : une montée de torch tirée par une dépendance
transitive suffisait à faire échouer toutes les synthèses. soundfile
(libsndfile) écrit le même WAV sans dépendre de torchaudio.
"""

from typing import Any

import numpy as np
import soundfile as sf


def _as_frames(wav: Any) -> np.ndarray:
    if hasattr(wav, "detach"):
        wav = wav.detach().cpu().numpy()
    signal = np.asarray(wav, dtype=np.float32)
    if signal.ndim == 1:
        return signal
    if signal.shape[0] == 1:
        return signal[0]
    return signal.T


def write_wav(path: str, wav: Any, sample_rate: int) -> str:
    sf.write(path, _as_frames(wav), int(sample_rate), subtype="FLOAT")
    return path
