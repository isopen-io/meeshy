"""
#18772 — témoins adversariaux du garde de webhook (audit avant fusion).

Le lot ne s'éprouve pas seulement sur les formes qu'il a prévues : ces témoins
rejouent les formes d'URL qui trompent un analyseur (IDN, point final, `%`,
barre oblique inverse, fragment, IPv6), les valeurs non textuelles que le PULL
ZMQ peut livrer, une résolution mêlant une adresse publique et une privée, et
une charge que le client ne sait pas sérialiser.

Invariant tenu : une URL admise désigne, pour `urlsplit` COMME pour le client
(yarl), exactement un hôte de la liste ; toute autre forme est refusée.
"""

import logging
import socket
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from yarl import URL

from services.job_webhook import admitted_webhook_url, open_webhook_session, send_job_webhook
from services.translation_pipeline_service import JobStatus, TranslationJob, TranslationPipelineService
from utils.audio_url_guard import (
    ALLOWED_HOSTS_ENV,
    WEBHOOK_ALLOWED_HOSTS_ENV,
    WebhookUrlRejected,
    admit_webhook_url,
)

HOOK = "hooks.example.com"
SECRET = "SECRET-QA-18772"
LISTED = frozenset({HOOK})


def _logged(caplog):
    return "\n".join(record.getMessage() for record in caplog.records)


@pytest.fixture
def allow_hook(monkeypatch):
    monkeypatch.setenv(WEBHOOK_ALLOWED_HOSTS_ENV, HOOK)
    monkeypatch.delenv(ALLOWED_HOSTS_ENV, raising=False)


@pytest.fixture
def pipeline(tmp_path):
    original = TranslationPipelineService._instance
    TranslationPipelineService._instance = None
    service = TranslationPipelineService(max_concurrent_jobs=1, audio_output_dir=str(tmp_path))
    yield service
    TranslationPipelineService._instance = original


def _getaddrinfo_returning(*addresses):
    calls = []

    async def getaddrinfo(host, port, family=0):
        calls.append((host, port))
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port)) for address in addresses]

    getaddrinfo.calls = calls
    return getaddrinfo


@pytest.mark.parametrize(
    "url",
    [
        f"https://{HOOK}./cb",
        "https://hooks.examplе.com/cb",
        "https://hooks．example．com/cb",
        "https://hooks%2eexample%2ecom/cb",
        f"https://{HOOK}\\@169.254.169.254/cb",
        f"https://169.254.169.254\\@{HOOK}/cb",
        f"https://169.254.169.254#@{HOOK}/cb",
        f"https://169.254.169.254?@{HOOK}/cb",
        f"https://{HOOK}%00.evil.net/cb",
        f"https://{HOOK}\t/cb",
        f"https://{HOOK}\n.evil.net/cb",
        "https://[::ffff:169.254.169.254]/cb",
        "https://[::1]/cb",
        "https://[fe80::1%25eth0]/cb",
        f"https:/{HOOK}/cb",
        f"https:{HOOK}/cb",
        f"//{HOOK}/cb",
        f"wss://{HOOK}/cb",
        f"https://{HOOK}:0443/cb",
        f"https://{HOOK}:80/cb",
    ],
)
def test_a_deceptive_url_form_is_refused_or_names_exactly_the_listed_host(url):
    try:
        admitted = admit_webhook_url(url, allowed_hosts=LISTED)
    except WebhookUrlRejected:
        return
    assert admitted.host == HOOK
    assert URL(admitted.url).host == HOOK
    assert URL(admitted.url).port == 443


@pytest.mark.parametrize("raw", [{"url": f"https://{HOOK}/"}, [f"https://{HOOK}/"], 42, True, b"https://x/"])
def test_a_non_text_webhook_from_zmq_is_forgotten_without_raising(allow_hook, caplog, raw):
    caplog.set_level(logging.DEBUG)
    assert admitted_webhook_url(raw) is None
    assert HOOK not in _logged(caplog)


async def test_a_non_text_webhook_never_opens_a_session(allow_hook):
    def refuse():
        raise AssertionError("aucune session ne doit s'ouvrir")

    assert await send_job_webhook({"url": f"https://{HOOK}/"}, {}, open_session=refuse) is False


async def test_a_listed_host_with_one_private_address_among_public_ones_is_refused(allow_hook, caplog):
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning("93.184.216.34", "169.254.169.254")

    delivered = await send_job_webhook(
        f"https://{HOOK}/cb?token={SECRET}", {}, open_session=lambda: open_webhook_session(getaddrinfo)
    )

    assert delivered is False
    assert getaddrinfo.calls == [(HOOK, 443)]
    logged = _logged(caplog)
    assert "private_address" in logged
    assert SECRET not in logged and HOOK not in logged


async def test_an_uppercase_listed_host_reaches_the_resolver_as_the_listed_name(allow_hook):
    getaddrinfo = _getaddrinfo_returning("10.0.0.1")

    delivered = await send_job_webhook(
        "https://HOOKS.Example.COM/cb", {}, open_session=lambda: open_webhook_session(getaddrinfo)
    )

    assert delivered is False
    assert getaddrinfo.calls == [(HOOK, 443)]


async def test_an_unserialisable_payload_fails_quietly_before_any_resolution(allow_hook, caplog):
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning("93.184.216.34")

    delivered = await send_job_webhook(
        f"https://{HOOK}/cb?token={SECRET}",
        {"result": object()},
        open_session=lambda: open_webhook_session(getaddrinfo),
    )

    assert delivered is False
    assert getaddrinfo.calls == []
    assert "TypeError" in _logged(caplog)
    assert SECRET not in _logged(caplog)


async def test_a_failed_job_with_a_refused_webhook_stays_failed_and_does_not_raise(pipeline, tmp_path, monkeypatch):
    monkeypatch.delenv(WEBHOOK_ALLOWED_HOSTS_ENV, raising=False)
    transcription = MagicMock()
    transcription.transcribe = AsyncMock(side_effect=RuntimeError("asr down"))
    pipeline.transcription_service = transcription
    published = []

    async def on_completed(job):
        published.append(job.status)

    pipeline.on_job_completed = on_completed
    audio = Path(tmp_path) / "a.wav"
    audio.write_bytes(b"fake")
    job = TranslationJob(
        id="job_qa_18772",
        user_id="user_qa",
        audio_path=str(audio),
        target_languages=["en"],
        generate_voice_clone=False,
        webhook_url=f"http://169.254.169.254/?token={SECRET}",
    )
    pipeline._jobs[job.id] = job

    await pipeline._process_job(job.id, 0)

    assert job.status == JobStatus.FAILED
    assert published == [JobStatus.FAILED]
