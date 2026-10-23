"""
#11257 — l'audio d'un message a son histogramme `audio_pipeline_seconds{stage}` :
whisper (la transcription), nllb (la traduction du texte), tts (la synthèse).
Le temps est mesuré à la réussite comme à l'échec, l'étiquette ne prend que les
trois valeurs nommées, et le registre se lit sur `GET /metrics` (port du
traducteur, jamais routé par Traefik) — rien n'est poussé.
"""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from utils.audio_pipeline_metrics import (
    AUDIO_STAGES,
    audio_pipeline_metrics,
    metrics_router,
)


def _count(metrics, stage: str) -> float:
    return metrics.registry.get_sample_value("audio_pipeline_seconds_count", {"stage": stage}) or 0.0


def _sum(metrics, stage: str) -> float:
    return metrics.registry.get_sample_value("audio_pipeline_seconds_sum", {"stage": stage}) or 0.0


def _clock(*readings: float):
    queue = list(readings)
    return lambda: queue.pop(0) if queue else 0.0


def test_names_the_three_stages_of_a_voice_message():
    assert AUDIO_STAGES == ("whisper", "nllb", "tts")


def test_times_a_successful_stage_in_seconds():
    metrics = audio_pipeline_metrics(clock=_clock(10.0, 12.5))

    @metrics.timed("whisper")
    async def transcribe(path: str) -> str:
        return f"texte de {path}"

    assert asyncio.run(transcribe("vocal.m4a")) == "texte de vocal.m4a"
    assert _count(metrics, "whisper") == 1
    assert _sum(metrics, "whisper") == pytest.approx(2.5)


def test_times_a_failing_stage_and_lets_its_error_through():
    metrics = audio_pipeline_metrics(clock=_clock(0.0, 0.75))

    @metrics.timed("tts")
    async def synthesize() -> None:
        raise RuntimeError("modèle indisponible")

    with pytest.raises(RuntimeError, match="modèle indisponible"):
        asyncio.run(synthesize())
    assert _count(metrics, "tts") == 1
    assert _sum(metrics, "tts") == pytest.approx(0.75)


def test_refuses_a_stage_outside_the_named_three():
    metrics = audio_pipeline_metrics()
    with pytest.raises(ValueError):
        metrics.timed("diarization")


def test_serves_prometheus_text_on_get_metrics_with_only_the_stage_label():
    metrics = audio_pipeline_metrics(clock=_clock(0.0, 1.0))

    @metrics.timed("nllb")
    async def translate() -> str:
        return "Bonjour"

    asyncio.run(translate())
    app = FastAPI()
    app.include_router(metrics_router(metrics.registry))

    response = TestClient(app).get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert 'audio_pipeline_seconds_count{stage="nllb"} 1.0' in response.text
    assert "Bonjour" not in response.text


def test_the_pipeline_stages_are_decorated_where_they_run():
    import inspect

    from services.audio_pipeline import translation_stage
    from services import transcription_service
    from services.tts import tts_service

    def timed_stage(function):
        return getattr(function, "__audio_pipeline_stage__", None)

    assert timed_stage(transcription_service.TranscriptionService._run_whisper) == "whisper"
    assert timed_stage(translation_stage.TranslationStage._translate_text) == "nllb"
    assert timed_stage(tts_service.UnifiedTTSService.synthesize_with_voice) == "tts"
    assert inspect.iscoroutinefunction(translation_stage.TranslationStage._translate_text)


def test_the_translator_api_serves_the_process_registry_on_get_metrics():
    from unittest.mock import MagicMock

    from api.translation_api import TranslationAPI

    api = TranslationAPI(translation_service=MagicMock())
    response = TestClient(api.app).get("/metrics")

    assert response.status_code == 200
    assert "audio_pipeline_seconds" in response.text
