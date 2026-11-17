"""
#19254 — le webhook de traduction vocale n'envoie que l'identifiant et l'état
du job, jamais son contenu.

Le tiers qui reçoit le webhook n'est pas authentifié comme le propriétaire du
job : il apprend QU'un job est fini, puis lit le résultat par la route d'état
authentifiée. Ni texte traduit, ni transcription, ni audio, ni utilisateur, ni
message d'erreur brut, ni langues cibles ne partent dans la charge.
"""

import json
import re

import pytest

from services import translation_pipeline_service
from services.translation_pipeline_service import JobStatus, TranslationJob, TranslationPipelineService

HOOK_URL = "https://hooks.example.com/callback"
TRANSLATED = "SENTINEL-TRANSLATED-19254"
TRANSCRIPT = "SENTINEL-TRANSCRIPT-19254"
AUDIO = "SENTINEL-AUDIO-B64-19254"
USER = "SENTINEL-USER-19254"
ERROR = "SENTINEL-ERROR-19254"
TARGET = "sentinel-lang-19254"
SENTINELS = (TRANSLATED, TRANSCRIPT, AUDIO, USER, ERROR, TARGET)
EXPECTED_KEYS = {"event", "job", "job_id", "metadata"}


@pytest.fixture
def pipeline(tmp_path):
    original = TranslationPipelineService._instance
    TranslationPipelineService._instance = None
    service = TranslationPipelineService(max_concurrent_jobs=1, audio_output_dir=str(tmp_path))
    yield service
    TranslationPipelineService._instance = original


@pytest.fixture
def sent(monkeypatch):
    calls = []

    async def capture(raw_url, payload, open_session=None):
        calls.append((raw_url, payload))
        return True

    monkeypatch.setattr(translation_pipeline_service, "send_job_webhook", capture)
    return calls


def _job(status, webhook_url=HOOK_URL, metadata=None):
    return TranslationJob(
        id="job_19254",
        user_id=USER,
        status=status,
        target_languages=[TARGET],
        webhook_url=webhook_url,
        callback_metadata=metadata if metadata is not None else {"message_id": "m1"},
        result={
            "translations": [{"language": TARGET, "translatedText": TRANSLATED, "audioBase64": AUDIO}],
            "originalAudio": {"transcription": TRANSCRIPT},
        },
        error=ERROR,
        error_code="RuntimeError",
    )


async def test_a_completed_job_sends_only_its_id_and_status(pipeline, sent):
    await pipeline._send_webhook(_job(JobStatus.COMPLETED))

    assert len(sent) == 1
    url, payload = sent[0]
    assert url == HOOK_URL
    assert set(payload) == EXPECTED_KEYS
    assert payload["event"] == "translation_completed"
    assert payload["job"] == {"id": "job_19254", "status": "completed"}
    assert payload["job_id"] == "job_19254"
    serialised = json.dumps(payload)
    assert [s for s in SENTINELS if s in serialised] == []


async def test_a_failed_job_says_it_failed_without_its_error_text(pipeline, sent):
    await pipeline._send_webhook(_job(JobStatus.FAILED))

    payload = sent[0][1]
    assert set(payload) == EXPECTED_KEYS
    assert payload["event"] == "translation_failed"
    assert payload["job"] == {"id": "job_19254", "status": "failed"}
    serialised = json.dumps(payload)
    assert [s for s in SENTINELS if s in serialised] == []


async def test_the_caller_metadata_travels_unchanged(pipeline, sent):
    metadata = {"message_id": "m1", "attachment_id": "a1", "nested": {"k": [1, 2]}}

    await pipeline._send_webhook(_job(JobStatus.COMPLETED, metadata=metadata))

    assert sent[0][1]["metadata"] == metadata


async def test_no_webhook_url_sends_nothing(pipeline, sent):
    await pipeline._send_webhook(_job(JobStatus.COMPLETED, webhook_url=None))

    assert sent == []


async def test_the_job_keeps_its_full_view_for_the_authenticated_status_route(pipeline, sent):
    job = _job(JobStatus.COMPLETED)

    await pipeline._send_webhook(job)

    view = job.to_dict()
    assert view["result"]["translations"][0]["translatedText"] == TRANSLATED
    assert view["user_id"] == USER
    assert view["error"] == ERROR


OBJECT_ID_USER = "6553a1b2c3d4e5f60718293a"


async def _submit(pipeline, user_id=OBJECT_ID_USER):
    await pipeline.initialize()
    try:
        return await pipeline.submit_job(
            user_id=user_id,
            audio_path="/nonexistent/a.wav",
            target_languages=["fr"],
        )
    finally:
        await pipeline.close()


async def test_the_job_id_carries_no_fragment_of_its_user(pipeline):
    job = await _submit(pipeline)

    assert OBJECT_ID_USER[:8] not in job.id
    assert OBJECT_ID_USER not in job.id
    assert job.user_id == OBJECT_ID_USER


async def test_the_webhook_payload_of_a_submitted_job_names_no_user(pipeline):
    job = await _submit(pipeline)
    job.status = JobStatus.COMPLETED

    serialised = json.dumps(translation_pipeline_service.webhook_payload(job))

    assert OBJECT_ID_USER[:8] not in serialised
    assert OBJECT_ID_USER not in serialised


async def test_the_job_id_is_opaque_prefixed_and_unique(pipeline):
    ids = [pipeline._generate_job_id(OBJECT_ID_USER) for _ in range(200)]

    assert len(set(ids)) == len(ids)
    assert all(re.fullmatch(r"mshy_[0-9a-f]{32,}", job_id) for job_id in ids)
