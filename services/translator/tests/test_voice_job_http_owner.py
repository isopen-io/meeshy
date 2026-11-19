"""
#19471 — les routes HTTP d'état et d'annulation d'un job vocal ne servent que
son propriétaire.

`GET` et `DELETE /api/v1/voice/job/{job_id}` dérivent l'appelant de l'en-tête
`Authorization` par le même `get_user_id` que `POST /voice/translate/async`, et
comparent cette identité à `job.user_id`. Un job d'un autre porteur, une
requête sans en-tête ou un job soumis par la passerelle (ObjectId réel, voie
ZMQ) rendent la MÊME réponse qu'un job inconnu : 404 « Job not found », sans
oracle d'existence. Le refus n'appelle jamais `cancel_job`. La vue servie au
propriétaire ne nomme ni l'utilisateur ni l'URL du webhook.
"""

import asyncio
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.translation_pipeline_service import JobStatus, TranslationPipelineService

OWNER_BEARER = "Bearer owner-token-AAAAAAAA"
OWNER_ID = "user_AAAAAAAA"
STRANGER_BEARER = "Bearer stranger-token-BBBBBBBB"
GATEWAY_OBJECT_ID = "6553a1b2c3d4e5f60718293a"
WEBHOOK = "https://hooks.example.com/callback"


@pytest.fixture
def pipeline(tmp_path):
    original = TranslationPipelineService._instance
    TranslationPipelineService._instance = None
    service = TranslationPipelineService(max_concurrent_jobs=1, audio_output_dir=str(tmp_path))
    yield service
    TranslationPipelineService._instance = original


@pytest.fixture
def client(pipeline, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("AUDIO_OUTPUT_DIR", str(tmp_path / "out"))
    from api.voice_api import create_voice_api_router

    app = FastAPI()
    app.include_router(create_voice_api_router(translation_pipeline=pipeline))
    return TestClient(app)


@pytest.fixture
def cancel_calls(pipeline, monkeypatch):
    calls = []
    real_cancel = pipeline.cancel_job

    async def spy(job_id):
        calls.append(job_id)
        return await real_cancel(job_id)

    monkeypatch.setattr(pipeline, "cancel_job", spy)
    return calls


def _submit(pipeline, user_id=OWNER_ID):
    async def submit():
        await pipeline.initialize()
        try:
            return await pipeline.submit_job(
                user_id=user_id,
                audio_path="/nonexistent/a.wav",
                target_languages=["fr"],
                webhook_url=WEBHOOK,
            )
        finally:
            await pipeline.close()

    return asyncio.run(submit())


def _headers(bearer):
    return {"Authorization": bearer} if bearer else {}


def _refusal(response):
    return (response.status_code, response.json())


def test_the_owner_reads_the_status_of_its_job(client, pipeline):
    job = _submit(pipeline)

    response = client.get(f"/api/v1/voice/job/{job.id}", headers=_headers(OWNER_BEARER))

    assert response.status_code == 200
    assert response.json()["id"] == job.id
    assert response.json()["status"] == "pending"


def test_the_served_view_names_neither_the_user_nor_the_webhook(client, pipeline):
    job = _submit(pipeline)

    served = client.get(f"/api/v1/voice/job/{job.id}", headers=_headers(OWNER_BEARER)).json()

    assert "user_id" not in served
    assert "webhook_url" not in served
    assert OWNER_ID not in str(served)
    assert WEBHOOK not in str(served)


def test_an_unknown_job_is_not_found(client):
    response = client.get("/api/v1/voice/job/missing-job", headers=_headers(OWNER_BEARER))

    assert _refusal(response) == (404, {"detail": "Job not found"})


@pytest.mark.parametrize("bearer", [STRANGER_BEARER, None], ids=["stranger", "no-header"])
def test_another_caller_gets_the_same_refusal_as_an_unknown_job(client, pipeline, bearer):
    job = _submit(pipeline)

    refused = client.get(f"/api/v1/voice/job/{job.id}", headers=_headers(bearer))
    unknown = client.get("/api/v1/voice/job/missing-job", headers=_headers(bearer))

    assert _refusal(refused) == _refusal(unknown) == (404, {"detail": "Job not found"})


def test_a_gateway_job_is_never_readable_over_http(client, pipeline):
    job = _submit(pipeline, user_id=GATEWAY_OBJECT_ID)

    for bearer in (OWNER_BEARER, f"Bearer {GATEWAY_OBJECT_ID}", None):
        response = client.get(f"/api/v1/voice/job/{job.id}", headers=_headers(bearer))
        assert _refusal(response) == (404, {"detail": "Job not found"})


@pytest.mark.parametrize("bearer", [STRANGER_BEARER, None], ids=["stranger", "no-header"])
def test_another_caller_cannot_cancel_and_cancel_is_never_attempted(
    client, pipeline, cancel_calls, bearer
):
    job = _submit(pipeline)

    response = client.delete(f"/api/v1/voice/job/{job.id}", headers=_headers(bearer))

    assert _refusal(response) == (404, {"detail": "Job not found"})
    assert cancel_calls == []
    assert job.status == JobStatus.PENDING


def test_a_gateway_job_is_never_cancellable_over_http(client, pipeline, cancel_calls):
    job = _submit(pipeline, user_id=GATEWAY_OBJECT_ID)

    response = client.delete(f"/api/v1/voice/job/{job.id}", headers=_headers(f"Bearer {GATEWAY_OBJECT_ID}"))

    assert _refusal(response) == (404, {"detail": "Job not found"})
    assert cancel_calls == []
    assert job.status == JobStatus.PENDING


def test_cancelling_an_unknown_job_is_the_same_refusal(client, cancel_calls):
    response = client.delete("/api/v1/voice/job/missing-job", headers=_headers(OWNER_BEARER))

    assert _refusal(response) == (404, {"detail": "Job not found"})
    assert cancel_calls == []


def test_the_owner_cancels_its_pending_job(client, pipeline, cancel_calls):
    job = _submit(pipeline)

    response = client.delete(f"/api/v1/voice/job/{job.id}", headers=_headers(OWNER_BEARER))

    assert response.status_code == 200
    assert response.json() == {"cancelled": True, "job_id": job.id}
    assert cancel_calls == [job.id]
    assert job.status == JobStatus.CANCELLED


def test_the_owner_still_gets_400_when_the_job_cannot_be_cancelled(client, pipeline):
    job = _submit(pipeline)
    job.status = JobStatus.PROCESSING

    response = client.delete(f"/api/v1/voice/job/{job.id}", headers=_headers(OWNER_BEARER))

    assert response.status_code == 400
    assert "cannot be cancelled" in response.json()["detail"]
