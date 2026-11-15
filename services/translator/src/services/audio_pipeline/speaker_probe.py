"""
La sonde multi-locuteurs (#11268) : la diarization complète ne tourne que si
l'audio porte PLUSIEURS voix.

La diarization SpeechBrain calcule une empreinte de voix (ECAPA) par seconde,
puis les regroupe : pour un vocal de 30 s, une trentaine d'empreintes et un
clustering, alors que l'immense majorité des vocaux n'a qu'une voix. La sonde
n'en calcule que quelques-unes, sur des fenêtres réparties dans l'audio, et dit
« plusieurs locuteurs » dès que deux empreintes sont plus éloignées que le seuil.
Un doute (sonde en échec) retombe sur la diarization complète : on ne perd
jamais un locuteur par économie.

`DIARIZATION_MODE=always` rétablit la diarization systématique ;
`ENABLE_DIARIZATION=false` la coupe comme avant.
"""

from __future__ import annotations

import enum
import logging
import math
from typing import Awaitable, Callable, Mapping, Sequence

logger = logging.getLogger(__name__)

DIARIZATION_MODES: tuple[str, ...] = ("auto", "always")

PROBE_WINDOW_MS = 2_000
PROBE_WINDOW_COUNT = 4
# Une même voix sur ECAPA dépasse en pratique 0,6 de similarité cosinus ; deux voix distinctes restent en dessous.
SAME_SPEAKER_SIMILARITY = 0.6


class ProbeDecision(enum.Enum):
    DIARIZE = "diarize"
    SKIP = "skip"


def diarization_mode(env: Mapping[str, str]) -> str:
    mode = env.get("DIARIZATION_MODE", "auto").strip().lower()
    return mode if mode in DIARIZATION_MODES else "auto"


def probe_windows(duration_ms: int, window_ms: int = PROBE_WINDOW_MS, count: int = PROBE_WINDOW_COUNT) -> list[tuple[int, int]]:
    """Des fenêtres réparties du début à la fin ; aucune si l'audio n'en tient pas deux sans chevauchement."""
    if count < 2 or duration_ms < window_ms * count:
        return []
    step = (duration_ms - window_ms) / (count - 1)
    return [(int(round(index * step)), int(round(index * step)) + window_ms) for index in range(count)]


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm > 0 else 1.0


def looks_multi_speaker(embeddings: Sequence[Sequence[float]], threshold: float = SAME_SPEAKER_SIMILARITY) -> bool:
    return any(
        _cosine(embeddings[i], embeddings[j]) < threshold
        for i in range(len(embeddings))
        for j in range(i + 1, len(embeddings))
    )


async def should_diarize(audio_path: str, mode: str, probe: Callable[[str], Awaitable[bool]]) -> ProbeDecision:
    if mode == "always":
        return ProbeDecision.DIARIZE
    try:
        return ProbeDecision.DIARIZE if await probe(audio_path) else ProbeDecision.SKIP
    except Exception as error:  # la sonde ne coûte jamais un locuteur
        logger.warning(f"[SPEAKER_PROBE] sonde en échec, diarization complète : {error}")
        return ProbeDecision.DIARIZE


async def probe_multi_speaker(audio_path: str) -> bool:  # pragma: no cover — exige librosa, torch et l'encodeur ECAPA
    """La sonde réelle : quelques empreintes ECAPA via l'encodeur de la diarization SpeechBrain."""
    import asyncio

    import librosa
    import torch

    from ..diarization_speechbrain import get_speechbrain_diarization

    def run() -> bool:
        audio, sample_rate = librosa.load(audio_path, sr=16_000)
        duration_ms = int(len(audio) / sample_rate * 1000)
        windows = probe_windows(duration_ms)
        if not windows:
            return False
        encoder = get_speechbrain_diarization()._get_encoder()
        embeddings = []
        with torch.no_grad():
            for start_ms, end_ms in windows:
                window = audio[int(start_ms * sample_rate / 1000):int(end_ms * sample_rate / 1000)]
                embeddings.append(encoder.encode_batch(torch.tensor(window).unsqueeze(0)).squeeze().cpu().numpy().tolist())
        return looks_multi_speaker(embeddings)

    return await asyncio.get_running_loop().run_in_executor(None, run)
