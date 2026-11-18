"""
#19596 — les horodatages d'un job vocal se servent en ISO 8601 UTC, suffixe `Z`.

La passerelle les sert sous `format: 'date-time'` ; un décodeur strict
(`ISO8601DateFormatter` iOS) refuse `2026-11-18T10:00:00.123456`, naïf et sans
fuseau. La forme retenue est celle de `Date.prototype.toISOString()` côté
passerelle : millisecondes et `Z`.
"""

import re
from datetime import datetime, timedelta, timezone

import pytest

from services.translation_pipeline_service import JobStatus, TranslationJob, TranslationPipelineService

UTC_MILLIS_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def _job(**overrides):
    return TranslationJob(id="mshy_job_test", user_id="u1", **overrides)


@pytest.fixture
def pipeline(tmp_path):
    original = TranslationPipelineService._instance
    TranslationPipelineService._instance = None
    service = TranslationPipelineService(max_concurrent_jobs=1, audio_output_dir=str(tmp_path))
    yield service
    TranslationPipelineService._instance = original


@pytest.mark.unit
def test_a_new_job_serves_its_creation_time_in_utc_with_z():
    assert UTC_MILLIS_Z.match(_job().to_dict()["created_at"])


@pytest.mark.unit
def test_started_and_completed_times_are_served_in_utc_with_z():
    moment = datetime(2026, 11, 18, 10, 0, 0, 123456, tzinfo=timezone.utc)
    served = _job(created_at=moment, started_at=moment, completed_at=moment).to_dict()

    assert served["created_at"] == "2026-11-18T10:00:00.123Z"
    assert served["started_at"] == "2026-11-18T10:00:00.123Z"
    assert served["completed_at"] == "2026-11-18T10:00:00.123Z"


@pytest.mark.unit
def test_times_not_reached_yet_stay_null():
    served = _job().to_dict()

    assert served["started_at"] is None
    assert served["completed_at"] is None


@pytest.mark.unit
def test_an_offset_time_is_converted_to_the_same_instant_in_utc():
    paris = timezone(timedelta(hours=1))
    served = _job(created_at=datetime(2026, 11, 18, 11, 0, 0, tzinfo=paris)).to_dict()

    assert served["created_at"] == "2026-11-18T10:00:00.000Z"


@pytest.mark.unit
def test_the_job_creation_time_is_the_current_utc_instant():
    before = datetime.now(timezone.utc)
    created = _job().created_at
    after = datetime.now(timezone.utc)

    assert before <= created <= after


@pytest.mark.unit
async def test_cleanup_removes_an_expired_completed_job_without_mixing_naive_and_aware(pipeline):
    expired = _job(status=JobStatus.COMPLETED, completed_at=datetime.now(timezone.utc) - timedelta(days=30))
    async with pipeline._jobs_lock:
        pipeline._jobs[expired.id] = expired

    await pipeline.cleanup_old_jobs()

    assert expired.id not in pipeline._jobs


@pytest.mark.unit
async def test_cleanup_still_removes_an_expired_job_whose_completion_time_is_naive(pipeline):
    expired = _job(status=JobStatus.FAILED, completed_at=datetime.now() - timedelta(days=30))
    async with pipeline._jobs_lock:
        pipeline._jobs[expired.id] = expired

    await pipeline.cleanup_old_jobs()

    assert expired.id not in pipeline._jobs
