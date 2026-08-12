"""
TDD — Le verrou d'inférence (`model_lock`) doit être acquis/libéré PAR CHUNK
pendant un batch, et non tenu pendant tout le batch.

Régression de prod (2026-06-21) : un message vocal découpé en ~937 segments est
traduit en un seul `translate_batch`. Comme le lock était tenu pour tout le batch,
ce job audio monopolisait le modèle pendant ~60s et affamait toutes les
traductions texte temps réel (→ timeouts ZMQ côté gateway → traductions perdues).

La correction libère le lock entre chaque chunk pour qu'une traduction texte
en attente puisse s'intercaler.
"""
import math
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from services.translation_ml.translator_engine import TranslatorEngine


class _CountingLock:
    """Lock réel qui compte combien de fois il est entré via `with`."""

    def __init__(self):
        self._lock = threading.Lock()
        self.enter_count = 0
        self._held = 0
        self.max_concurrent = 0

    def __enter__(self):
        self._lock.acquire()
        self.enter_count += 1
        self._held += 1
        self.max_concurrent = max(self.max_concurrent, self._held)
        return self

    def __exit__(self, *exc):
        self._held -= 1
        self._lock.release()
        return False


def _make_engine(counting_lock):
    model_loader = MagicMock()
    model_loader.device = "cpu"
    model_loader.is_model_loaded.return_value = True
    model_loader.get_model.return_value = MagicMock(name="model")
    model_loader.get_thread_local_tokenizer.return_value = MagicMock(name="tokenizer")
    model_loader.get_model_inference_lock.return_value = counting_lock

    executor = ThreadPoolExecutor(max_workers=2)
    engine = TranslatorEngine(model_loader=model_loader, executor=executor, cache_size=10)

    def fake_pipeline(chunk, **kwargs):
        texts = [chunk] if isinstance(chunk, str) else list(chunk)
        return [{"translation_text": f"T:{t}"} for t in texts]

    engine._get_or_create_pipeline = MagicMock(return_value=(fake_pipeline, True))
    return engine


@pytest.mark.asyncio
async def test_translate_batch_releases_lock_per_chunk():
    counting_lock = _CountingLock()
    engine = _make_engine(counting_lock)

    texts = [f"texte {i}" for i in range(20)]
    results = await engine.translate_batch(texts, "fr", "en", "basic")

    assert len(results) == 20
    assert all(r.startswith("T:") for r in results)

    batch_size = engine.perf_config.batch_size
    expected_chunks = math.ceil(len(texts) / batch_size)

    # Le lock doit être pris UNE FOIS PAR CHUNK (donc libéré entre les chunks),
    # pas une seule fois pour l'intégralité du batch.
    assert counting_lock.enter_count == expected_chunks, (
        f"lock entré {counting_lock.enter_count}x, attendu {expected_chunks} "
        f"(un par chunk de {batch_size})"
    )
