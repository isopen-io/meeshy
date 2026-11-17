"""
#19293 / #19380 — l'état et l'annulation d'un job vocal n'appartiennent qu'à
son propriétaire.

La passerelle authentifie l'appelant et pose `userId` (tiré du JWT) dans les
requêtes ZMQ `voice_job_status` / `voice_job_cancel`. Le traducteur compare ce
`userId` au propriétaire du job : un job inconnu, un job d'un autre, ou une
requête sans `userId` rendent la MÊME réponse (aucun oracle « existe mais pas
à toi »). La vue servie au propriétaire ne nomme ni l'utilisateur ni l'URL du
webhook. L'annulation par le propriétaire fonctionne (#19380 : elle levait un
TypeError, `cancel_job` rendant un booléen).
"""

import uuid

import pytest

from services.translation_pipeline_service import JobStatus, TranslationPipelineService
from services.voice_api.voice_api_handler import VoiceAPIHandler

OWNER = "6553a1b2c3d4e5f60718293a"
STRANGER = "6553a1b2c3d4e5f60718293b"


@pytest.fixture
def pipeline(tmp_path):
    original = TranslationPipelineService._instance
    TranslationPipelineService._instance = None
    service = TranslationPipelineService(max_concurrent_jobs=1, audio_output_dir=str(tmp_path))
    yield service
    TranslationPipelineService._instance = original


@pytest.fixture
def handler(pipeline):
    return VoiceAPIHandler(translation_pipeline=pipeline)


async def _submit(pipeline, user_id=OWNER):
    await pipeline.initialize()
    try:
        return await pipeline.submit_job(
            user_id=user_id,
            audio_path="/nonexistent/a.wav",
            target_languages=["fr"],
            webhook_url="https://hooks.example.com/callback",
        )
    finally:
        await pipeline.close()


def _request(kind, job_id, user_id):
    request = {"type": kind, "taskId": str(uuid.uuid4()), "jobId": job_id}
    if user_id is not None:
        request["userId"] = user_id
    return request


def _refusal(response):
    return (response["type"], response["errorCode"], response["error"])


async def test_the_owner_reads_the_status_without_user_nor_webhook(handler, pipeline):
    job = await _submit(pipeline)

    response = await handler.handle_request(_request("voice_job_status", job.id, OWNER))

    assert response["type"] == "voice_api_success"
    served = response["result"]
    assert served["id"] == job.id
    assert served["status"] == "pending"
    assert "user_id" not in served
    assert "webhook_url" not in served
    assert OWNER not in str(served)
    expected_keys = set(job.to_dict()) - {"user_id", "webhook_url"}
    assert set(served) == expected_keys


async def test_a_stranger_gets_the_same_refusal_as_an_unknown_job(handler, pipeline):
    job = await _submit(pipeline)

    stranger = await handler.handle_request(_request("voice_job_status", job.id, STRANGER))
    unknown = await handler.handle_request(_request("voice_job_status", "mshy_unknown", STRANGER))

    assert stranger["type"] == "voice_api_error"
    assert stranger["errorCode"] == "NOT_FOUND"
    assert _refusal(stranger) == _refusal(unknown)


@pytest.mark.parametrize("user_id", [None, ""])
async def test_a_status_request_without_user_is_refused_as_not_found(handler, pipeline, user_id):
    job = await _submit(pipeline)

    response = await handler.handle_request(_request("voice_job_status", job.id, user_id))
    unknown = await handler.handle_request(_request("voice_job_status", "mshy_unknown", OWNER))

    assert response["errorCode"] == "NOT_FOUND"
    assert _refusal(response) == _refusal(unknown)


async def test_the_owner_cancels_a_pending_job(handler, pipeline):
    job = await _submit(pipeline)

    response = await handler.handle_request(_request("voice_job_cancel", job.id, OWNER))

    assert response["type"] == "voice_api_success"
    assert response["result"]["success"] is True
    assert isinstance(response["result"]["message"], str)
    assert (await pipeline.get_job(job.id)).status == JobStatus.CANCELLED


async def test_a_stranger_cannot_cancel_and_the_job_stays_pending(handler, pipeline):
    job = await _submit(pipeline)

    stranger = await handler.handle_request(_request("voice_job_cancel", job.id, STRANGER))
    unknown = await handler.handle_request(_request("voice_job_cancel", "mshy_unknown", STRANGER))

    assert stranger["type"] == "voice_api_error"
    assert stranger["errorCode"] == "NOT_FOUND"
    assert _refusal(stranger) == _refusal(unknown)
    assert (await pipeline.get_job(job.id)).status == JobStatus.PENDING


@pytest.mark.parametrize("user_id", [None, ""])
async def test_a_cancel_without_user_is_refused_and_the_job_stays_pending(handler, pipeline, user_id):
    job = await _submit(pipeline)

    response = await handler.handle_request(_request("voice_job_cancel", job.id, user_id))

    assert response["errorCode"] == "NOT_FOUND"
    assert (await pipeline.get_job(job.id)).status == JobStatus.PENDING


async def test_the_owner_cancelling_a_finished_job_is_told_it_did_not_cancel(handler, pipeline):
    job = await _submit(pipeline)
    job.status = JobStatus.COMPLETED

    response = await handler.handle_request(_request("voice_job_cancel", job.id, OWNER))

    assert response["type"] == "voice_api_success"
    assert response["result"]["success"] is False
    assert isinstance(response["result"]["message"], str)
    assert job.status == JobStatus.COMPLETED


async def test_a_failing_store_answers_a_fixed_message(handler, pipeline, monkeypatch):
    job = await _submit(pipeline)

    async def boom(job_id):
        raise RuntimeError("SENTINEL-SECRET-19293")

    monkeypatch.setattr(pipeline, "get_job", boom)

    status = await handler.handle_request(_request("voice_job_status", job.id, OWNER))
    cancel = await handler.handle_request(_request("voice_job_cancel", job.id, OWNER))

    for response in (status, cancel):
        assert response["errorCode"] == "INTERNAL_ERROR"
        assert "SENTINEL-SECRET-19293" not in response["error"]
