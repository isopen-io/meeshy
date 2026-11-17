"""
#18772 — le traducteur n'envoie un webhook de traduction vocale que vers un
hôte autorisé.

`webhookUrl` arrive par la route publique de la passerelle (puis le PULL ZMQ,
non authentifié) ou par l'API REST du traducteur : c'est une donnée NON FIABLE.
`aiohttp.ClientSession().post(job.webhook_url)` sans garde, redirections
suivies et proxy de l'environnement honoré, ouvrait une SSRF vers les
métadonnées du nuage, la boucle locale et le réseau interne, et l'URL partait
dans les journaux.

Attendu : le MÊME garde que l'audioUrl (#18666) sur une liste d'hôtes DÉDIÉE,
`TRANSLATOR_WEBHOOK_ALLOWED_HOSTS`, vide par défaut ; une URL refusée est
oubliée dès la soumission sans faire échouer la traduction ; l'envoi se
re-vérifie, se connecte à l'adresse vérifiée, ne suit aucune redirection,
ignore le proxy de l'environnement ; ni URL, ni hôte, ni `str(e)` au journal.
"""

import asyncio
import logging
import socket
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import aiohttp
import pytest

from services import job_webhook
from services.job_webhook import admitted_webhook_url, open_webhook_session, send_job_webhook
from services.translation_pipeline_service import JobStatus, TranslationJob, TranslationPipelineService
from utils.audio_url_guard import (
    ALLOWED_HOSTS_ENV,
    WEBHOOK_ALLOWED_HOSTS_ENV,
    AudioUrlRejected,
    WebhookUrlRejected,
    admit_audio_url,
    admit_webhook_url,
)

SECRET = "SECRET-18772"
HOOK = "hooks.example.com"
CDN = "cdn.example.com"
PUBLIC_V4 = "93.184.216.34"


def _getaddrinfo_returning(address):
    calls = []

    async def getaddrinfo(host, port, family=0):
        calls.append((host, port))
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    getaddrinfo.calls = calls
    return getaddrinfo


def _logged(caplog):
    return "\n".join(record.getMessage() for record in caplog.records)


def _assert_nothing_identifying(text, *also):
    assert SECRET not in text
    assert "token=" not in text
    assert "/callback" not in text
    for needle in also:
        assert needle not in text


def _hook_url(host=HOOK):
    return f"https://{host}/callback?token={SECRET}"


class FakeResponse:
    def __init__(self, status, headers=None):
        self.status = status
        self.headers = headers or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False


class FakeSession:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.error is not None:
            raise self.error
        return self.response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False


def _opening(session):
    return lambda: session


@pytest.fixture
def allow_hook(monkeypatch):
    monkeypatch.setenv(WEBHOOK_ALLOWED_HOSTS_ENV, HOOK)
    monkeypatch.delenv(ALLOWED_HOSTS_ENV, raising=False)


@pytest.fixture
def no_webhook_hosts(monkeypatch):
    monkeypatch.delenv(WEBHOOK_ALLOWED_HOSTS_ENV, raising=False)


@pytest.fixture
def no_network(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("aucune session HTTP ne doit s'ouvrir")

    monkeypatch.setattr(aiohttp, "ClientSession", refuse)


@pytest.fixture
def pipeline(tmp_path):
    original = TranslationPipelineService._instance
    TranslationPipelineService._instance = None
    service = TranslationPipelineService(max_concurrent_jobs=1, audio_output_dir=str(tmp_path))
    yield service
    TranslationPipelineService._instance = original


# ─── Le garde : même forme que l'audioUrl, liste dédiée ─────────────────────


@pytest.mark.parametrize(
    ("url", "listed", "reason"),
    [
        ("http://169.254.169.254/latest/meta-data/", "169.254.169.254", "scheme"),
        ("https://169.254.169.254/latest/meta-data/", "169.254.169.254", "private_address"),
        ("https://localhost/callback", "", "host_not_allowed"),
        ("https://127.0.0.1/callback", "127.0.0.1", "private_address"),
        ("https://2852039166/callback", "2852039166", "malformed"),
        ("https://127.1/callback", "127.1", "malformed"),
        ("https://0177.0.0.1/callback", "0177.0.0.1", "malformed"),
        (f"https://{HOOK}:8443/callback", HOOK, "port"),
        (f"https://user:pw@{HOOK}/callback", HOOK, "userinfo"),
        ("https://evil.example.net/callback", HOOK, "host_not_allowed"),
    ],
)
def test_internal_and_unlisted_webhook_targets_are_refused(url, listed, reason):
    with pytest.raises(WebhookUrlRejected) as caught:
        admit_webhook_url(url, allowed_hosts=frozenset({listed} - {""}))
    assert caught.value.reason == reason


def test_the_webhook_list_is_empty_by_default(no_webhook_hosts):
    with pytest.raises(WebhookUrlRejected) as caught:
        admit_webhook_url(_hook_url())
    assert caught.value.reason == "host_not_allowed"


def test_a_host_allowed_for_audio_is_not_allowed_for_webhooks(monkeypatch, no_webhook_hosts):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, CDN)

    with pytest.raises(WebhookUrlRejected):
        admit_webhook_url(_hook_url(CDN))
    assert admit_audio_url(f"https://{CDN}/a.m4a").host == CDN


def test_a_host_allowed_for_webhooks_is_not_allowed_for_audio(allow_hook):
    assert admit_webhook_url(_hook_url()).host == HOOK
    with pytest.raises(AudioUrlRejected):
        admit_audio_url(f"https://{HOOK}/a.m4a")


def test_the_webhook_refusal_names_the_webhook_and_never_the_url():
    with pytest.raises(WebhookUrlRejected) as caught:
        admit_webhook_url(_hook_url("evil.example.net"), allowed_hosts=frozenset())
    assert str(caught.value) == "Webhook URL rejected: host_not_allowed"
    assert not isinstance(caught.value, AudioUrlRejected)


# ─── La soumission : une URL refusée est oubliée, la traduction continue ────


def test_a_refused_webhook_is_forgotten_without_being_logged(no_webhook_hosts, caplog):
    caplog.set_level(logging.DEBUG)

    assert admitted_webhook_url(_hook_url()) is None

    logged = _logged(caplog)
    assert "host_not_allowed" in logged
    _assert_nothing_identifying(logged, HOOK)


def test_an_absent_webhook_stays_absent_silently(no_webhook_hosts, caplog):
    caplog.set_level(logging.DEBUG)
    assert admitted_webhook_url(None) is None
    assert admitted_webhook_url("") is None
    assert _logged(caplog) == ""


async def test_submitting_a_job_with_a_refused_webhook_keeps_the_job_and_drops_the_url(
    pipeline, no_webhook_hosts, caplog
):
    caplog.set_level(logging.DEBUG)
    await pipeline.initialize()
    try:
        job = await pipeline.submit_job(
            user_id="user_18772",
            audio_path="/nonexistent/a.wav",
            target_languages=["fr"],
            webhook_url="http://169.254.169.254/latest/meta-data/?token=" + SECRET,
        )
    finally:
        await pipeline.close()

    assert job.webhook_url is None
    assert job.to_dict()["webhook_url"] is None
    logged = _logged(caplog)
    assert "scheme" in logged
    assert "webhook=none" in logged
    _assert_nothing_identifying(logged, "169.254.169.254")


async def test_submitting_a_job_with_an_allowed_webhook_keeps_it(pipeline, allow_hook, caplog):
    caplog.set_level(logging.DEBUG)
    await pipeline.initialize()
    try:
        job = await pipeline.submit_job(
            user_id="user_18772",
            audio_path="/nonexistent/a.wav",
            target_languages=["fr"],
            webhook_url=_hook_url(),
        )
    finally:
        await pipeline.close()

    assert job.webhook_url == _hook_url()
    logged = _logged(caplog)
    assert "webhook=yes" in logged
    _assert_nothing_identifying(logged, HOOK)


@dataclass
class _Transcription:
    text: str = "bonjour"
    language: str = "fr"
    duration_ms: int = 1000
    confidence: float = 0.9


async def _run_job(service, tmp_path, webhook_url):
    transcription = MagicMock()
    transcription.transcribe = AsyncMock(return_value=_Transcription())
    service.transcription_service = transcription
    service.translation_stage.process_languages = AsyncMock(return_value={})
    published = []

    async def on_completed(job):
        published.append(job.status)

    service.on_job_completed = on_completed
    audio = Path(tmp_path) / "a.wav"
    audio.write_bytes(b"fake")
    job = TranslationJob(
        id="job_18772",
        user_id="user_18772",
        audio_path=str(audio),
        target_languages=["en"],
        generate_voice_clone=False,
        webhook_url=webhook_url,
    )
    service._jobs[job.id] = job
    await service._process_job(job.id, 0)
    return job, published


async def test_the_translation_completes_when_the_stored_webhook_is_refused_at_send_time(
    pipeline, tmp_path, no_webhook_hosts, no_network, caplog
):
    caplog.set_level(logging.DEBUG)

    job, published = await _run_job(pipeline, tmp_path, "http://169.254.169.254/latest/?token=" + SECRET)

    assert job.status == JobStatus.COMPLETED
    assert published == [JobStatus.COMPLETED]
    logged = _logged(caplog)
    assert "scheme" in logged
    _assert_nothing_identifying(logged, "169.254.169.254")


async def test_the_translation_completes_when_an_allowed_webhook_is_unreachable(
    pipeline, tmp_path, allow_hook, monkeypatch, caplog
):
    caplog.set_level(logging.DEBUG)
    session = FakeSession(error=aiohttp.ClientConnectionError(f"cannot reach {_hook_url()}"))
    monkeypatch.setattr(job_webhook, "open_webhook_session", _opening(session))

    job, published = await _run_job(pipeline, tmp_path, _hook_url())

    assert job.status == JobStatus.COMPLETED
    assert published == [JobStatus.COMPLETED]
    assert len(session.calls) == 1
    logged = _logged(caplog)
    assert "ClientConnectionError" in logged
    _assert_nothing_identifying(logged, HOOK)


# ─── L'envoi : re-vérifié, adresse vérifiée, sans redirection ni proxy ──────


async def test_a_webhook_refused_at_send_time_never_opens_a_session(no_webhook_hosts, no_network, caplog):
    caplog.set_level(logging.DEBUG)

    assert await send_job_webhook(_hook_url(), {"event": "translation_completed"}) is False

    logged = _logged(caplog)
    assert "host_not_allowed" in logged
    _assert_nothing_identifying(logged, HOOK)


async def test_an_allowed_public_webhook_is_posted_without_following_redirects(allow_hook, caplog):
    caplog.set_level(logging.DEBUG)
    session = FakeSession(FakeResponse(204))
    payload = {"event": "translation_completed", "job": {"id": "j"}}

    assert await send_job_webhook(_hook_url(), payload, open_session=_opening(session)) is True

    assert len(session.calls) == 1
    url, kwargs = session.calls[0]
    assert url == _hook_url()
    assert kwargs["json"] == payload
    assert kwargs["allow_redirects"] is False
    _assert_nothing_identifying(_logged(caplog), HOOK)


async def test_a_redirect_to_an_internal_host_is_not_followed(allow_hook, caplog):
    caplog.set_level(logging.DEBUG)
    session = FakeSession(FakeResponse(302, {"Location": "http://169.254.169.254/latest/meta-data/"}))

    assert await send_job_webhook(_hook_url(), {}, open_session=_opening(session)) is False

    assert len(session.calls) == 1
    assert session.calls[0][1]["allow_redirects"] is False
    logged = _logged(caplog)
    assert "302" in logged
    _assert_nothing_identifying(logged, HOOK, "169.254.169.254")


@pytest.mark.parametrize(
    "error",
    [
        aiohttp.ClientConnectionError(f"boom {_hook_url()}"),
        asyncio.TimeoutError(),
        RuntimeError(f"unexpected {_hook_url()}"),
    ],
)
async def test_transport_errors_log_only_their_type(allow_hook, caplog, error):
    caplog.set_level(logging.DEBUG)
    session = FakeSession(error=error)

    assert await send_job_webhook(_hook_url(), {}, open_session=_opening(session)) is False

    logged = _logged(caplog)
    assert type(error).__name__ in logged or "timeout" in logged
    _assert_nothing_identifying(logged, HOOK)


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1"])
async def test_a_listed_host_resolving_to_a_private_address_is_refused_by_the_real_client(
    allow_hook, caplog, address
):
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning(address)

    delivered = await send_job_webhook(_hook_url(), {}, open_session=lambda: open_webhook_session(getaddrinfo))

    assert delivered is False
    assert getaddrinfo.calls == [(HOOK, 443)]
    logged = _logged(caplog)
    assert "private_address" in logged
    _assert_nothing_identifying(logged, HOOK, address)


async def test_the_real_client_ignores_the_proxy_environment(allow_hook, monkeypatch, caplog):
    for name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.setenv(name, "http://127.0.0.1:9")
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning("127.0.0.1")

    delivered = await send_job_webhook(_hook_url(), {}, open_session=lambda: open_webhook_session(getaddrinfo))

    assert delivered is False
    assert getaddrinfo.calls == [(HOOK, 443)]
    assert "private_address" in _logged(caplog)


async def test_the_real_client_resolves_only_through_the_webhook_list(monkeypatch, no_webhook_hosts, caplog):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, HOOK)
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning(PUBLIC_V4)
    session = open_webhook_session(getaddrinfo)
    try:
        with pytest.raises(WebhookUrlRejected) as caught:
            async with session.post(_hook_url(), json={}, allow_redirects=False):
                pass
    finally:
        await session.close()

    assert caught.value.reason == "host_not_allowed"
    assert getaddrinfo.calls == []


# ─── La charge envoyée au tiers ne recopie pas l'URL ───────────────────────


async def test_the_payload_sent_to_the_webhook_does_not_echo_the_webhook_url(pipeline, allow_hook, monkeypatch):
    session = FakeSession(FakeResponse(200))
    monkeypatch.setattr(job_webhook, "open_webhook_session", _opening(session))
    job = TranslationJob(
        id="job_18772",
        user_id="user_18772",
        status=JobStatus.COMPLETED,
        webhook_url=_hook_url(),
        callback_metadata={"k": "v"},
    )

    await pipeline._send_webhook(job)

    payload = session.calls[0][1]["json"]
    assert payload["event"] == "translation_completed"
    assert payload["metadata"] == {"k": "v"}
    assert payload["job"]["id"] == "job_18772"
    assert "webhook_url" not in payload["job"]
    assert SECRET not in repr(payload)
