"""
#18666 — le traducteur ne télécharge un `audioUrl` reçu par ZMQ que depuis un
hôte autorisé.

Le PULL ZMQ du traducteur n'est pas authentifié : un `audioUrl` est une donnée
NON FIABLE. `session.get(audio_url)` sans garde, redirections suivies, ouvrait
une SSRF vers les métadonnées du nuage (169.254.169.254), la boucle locale et
le réseau interne Docker, et l'URL complète (jeton de signature compris)
partait dans les journaux.

Attendu : `https` seulement, hôte dans `TRANSLATOR_AUDIO_URL_ALLOWED_HOSTS`
(vide par défaut ⇒ tout refusé), chaque adresse résolue globale, la connexion
faite vers l'adresse vérifiée, aucune redirection suivie, et jamais l'URL dans
un journal ni dans le message d'une exception.
"""

import asyncio
import logging
import socket

import aiohttp
import pytest

from services.audio_fetcher import AudioFetcherService
from utils.audio_url_guard import (
    ALLOWED_HOSTS_ENV,
    AudioUrlRejected,
    VerifiedAudioHostResolver,
    admit_audio_url,
    allowed_audio_url_hosts,
)

SECRET = "SECRET-18666"
CDN = "cdn.example.com"
PUBLIC_V4 = "93.184.216.34"


def _infos(*addresses):
    return [
        (
            socket.AF_INET6 if ":" in address else socket.AF_INET,
            socket.SOCK_STREAM,
            6,
            "",
            (address, 443, 0, 0) if ":" in address else (address, 443),
        )
        for address in addresses
    ]


def _getaddrinfo_returning(*addresses):
    calls = []

    async def getaddrinfo(host, port, family=0):
        calls.append((host, port))
        return _infos(*addresses)

    getaddrinfo.calls = calls
    return getaddrinfo


async def _getaddrinfo_failing(host, port, family=0):
    raise socket.gaierror(socket.EAI_NONAME, f"unknown {host}")


def _reason(raw, allowed=frozenset({CDN})):
    with pytest.raises(AudioUrlRejected) as caught:
        admit_audio_url(raw, allowed_hosts=allowed)
    return caught.value


class FakeContent:
    def __init__(self, body):
        self._body = body

    async def iter_chunked(self, _size):
        yield self._body


class FakeResponse:
    def __init__(self, status, headers=None, body=b""):
        self.status = status
        self.headers = headers or {}
        self.content = FakeContent(body)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False


class FakeSession:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.error is not None:
            raise self.error
        return self.response


def _fetcher_with(session):
    fetcher = AudioFetcherService()

    async def get_session():
        return session

    fetcher._get_session = get_session
    return fetcher


def _logged(caplog):
    return "\n".join(record.getMessage() for record in caplog.records)


def _assert_url_absent(text):
    assert SECRET not in text
    assert "token=" not in text
    assert "/a.m4a" not in text


@pytest.fixture
def allow_cdn(monkeypatch):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, CDN)


@pytest.fixture
def no_allowed_hosts(monkeypatch):
    monkeypatch.delenv(ALLOWED_HOSTS_ENV, raising=False)


def test_cloud_metadata_over_http_is_refused():
    assert _reason(
        "http://169.254.169.254/latest/meta-data/", allowed=frozenset({"169.254.169.254"})
    ).reason == "scheme"


def test_cloud_metadata_over_https_is_refused_even_when_listed():
    assert _reason(
        "https://169.254.169.254/", allowed=frozenset({"169.254.169.254"})
    ).reason == "private_address"


def test_loopback_literal_is_refused_even_when_listed():
    assert _reason("https://127.0.0.1/", allowed=frozenset({"127.0.0.1"})).reason == "private_address"
    assert _reason("https://[::1]/", allowed=frozenset({"::1"})).reason == "private_address"


def test_localhost_on_a_service_port_is_refused():
    assert _reason("https://localhost:8000/x", allowed=frozenset({"localhost"})).reason == "port"


def test_explicit_port_443_is_admitted():
    assert admit_audio_url(f"https://{CDN}:443/a.m4a", allowed_hosts=frozenset({CDN})).host == CDN


def test_userinfo_is_refused():
    assert _reason(f"https://user:pw@{CDN}/a.m4a").reason == "userinfo"


@pytest.mark.parametrize("raw", [None, "", 42, "https:///a.m4a", f"https://{CDN}/a b", "https://cdn.example.com:x/"])
def test_malformed_urls_are_refused(raw):
    assert _reason(raw).reason == "malformed"


def test_unlisted_host_is_refused():
    assert _reason("https://media.example.org/a.m4a").reason == "host_not_allowed"


def test_empty_allow_list_refuses_everything(no_allowed_hosts):
    assert allowed_audio_url_hosts() == frozenset()
    with pytest.raises(AudioUrlRejected) as caught:
        admit_audio_url(f"https://{CDN}/a.m4a")
    assert caught.value.reason == "host_not_allowed"


def test_allow_list_is_parsed_lowercase_and_trimmed(monkeypatch):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, " CDN.Example.com , media.example.org ,")
    assert allowed_audio_url_hosts() == frozenset({CDN, "media.example.org"})


def test_listed_host_is_admitted_with_its_url_unchanged(allow_cdn):
    admitted = admit_audio_url(f"https://CDN.example.com/a.m4a?token={SECRET}")
    assert admitted.host == CDN
    assert admitted.url == f"https://CDN.example.com/a.m4a?token={SECRET}"


def test_rejection_message_never_carries_the_url():
    rejected = _reason(f"https://evil.example.net/a.m4a?token={SECRET}")
    _assert_url_absent(str(rejected))
    assert "evil.example.net" not in str(rejected)


@pytest.mark.parametrize("address", ["10.0.0.5", "::1", "::ffff:127.0.0.1", "169.254.169.254", "0.0.0.0", "::", "100.64.0.1", "224.0.0.1", "fe80::1"])
async def test_listed_host_resolving_to_a_non_global_address_is_refused(address):
    resolver = VerifiedAudioHostResolver(
        getaddrinfo=_getaddrinfo_returning(address), allowed_hosts=frozenset({CDN})
    )
    with pytest.raises(AudioUrlRejected) as caught:
        await resolver.resolve(CDN, 443)
    assert caught.value.reason == "private_address"


async def test_one_private_address_among_public_ones_refuses_the_host():
    resolver = VerifiedAudioHostResolver(
        getaddrinfo=_getaddrinfo_returning(PUBLIC_V4, "10.0.0.5"), allowed_hosts=frozenset({CDN})
    )
    with pytest.raises(AudioUrlRejected) as caught:
        await resolver.resolve(CDN, 443)
    assert caught.value.reason == "private_address"


async def test_listed_host_resolving_to_a_public_address_is_served_that_address():
    getaddrinfo = _getaddrinfo_returning(PUBLIC_V4)
    resolver = VerifiedAudioHostResolver(getaddrinfo=getaddrinfo, allowed_hosts=frozenset({CDN}))

    resolved = await resolver.resolve(CDN, 443)

    assert getaddrinfo.calls == [(CDN, 443)]
    assert [(entry["hostname"], entry["host"], entry["port"]) for entry in resolved] == [(CDN, PUBLIC_V4, 443)]


async def test_resolver_refuses_an_unlisted_host_without_resolving_it():
    getaddrinfo = _getaddrinfo_returning(PUBLIC_V4)
    resolver = VerifiedAudioHostResolver(getaddrinfo=getaddrinfo, allowed_hosts=frozenset({CDN}))
    with pytest.raises(AudioUrlRejected) as caught:
        await resolver.resolve("media.example.org", 443)
    assert caught.value.reason == "host_not_allowed"
    assert getaddrinfo.calls == []


async def test_resolution_failure_is_a_fixed_reason():
    resolver = VerifiedAudioHostResolver(getaddrinfo=_getaddrinfo_failing, allowed_hosts=frozenset({CDN}))
    with pytest.raises(AudioUrlRejected) as caught:
        await resolver.resolve(CDN, 443)
    assert caught.value.reason == "resolution_failed"
    assert CDN not in str(caught.value)


async def test_dns_rebinding_to_loopback_is_refused_before_any_connection(allow_cdn, caplog):
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning("127.0.0.1")
    fetcher = AudioFetcherService(getaddrinfo=getaddrinfo)
    try:
        result = await fetcher._download_from_url(f"https://{CDN}/a.m4a?token={SECRET}", "att1", "audio/mp4")
    finally:
        await fetcher.close()

    assert result is None
    assert getaddrinfo.calls == [(CDN, 443)]
    logged = _logged(caplog)
    assert "private_address" in logged
    _assert_url_absent(logged)


async def test_redirect_is_never_followed(allow_cdn, caplog):
    caplog.set_level(logging.DEBUG)
    session = FakeSession(FakeResponse(302, {"Location": "http://169.254.169.254/latest/meta-data/"}))
    fetcher = _fetcher_with(session)

    result = await fetcher._download_from_url(f"https://{CDN}/a.m4a?token={SECRET}", "att1", "audio/mp4")

    assert result is None
    assert len(session.calls) == 1
    assert session.calls[0][1].get("allow_redirects") is False
    logged = _logged(caplog)
    assert "redirect" in logged
    assert "169.254.169.254" not in logged
    _assert_url_absent(logged)


async def test_refused_url_never_reaches_the_network_nor_the_logs(no_allowed_hosts, caplog):
    caplog.set_level(logging.DEBUG)
    session = FakeSession(FakeResponse(200, body=b"x"))
    fetcher = _fetcher_with(session)

    result = await fetcher._download_from_url(f"https://{CDN}/a.m4a?token={SECRET}", "att1", "audio/mp4")

    assert result is None
    assert session.calls == []
    logged = _logged(caplog)
    assert "host_not_allowed" in logged
    _assert_url_absent(logged)


async def test_http_failure_logs_neither_the_url_nor_its_query(allow_cdn, caplog):
    caplog.set_level(logging.DEBUG)
    fetcher = _fetcher_with(FakeSession(FakeResponse(500)))

    result = await fetcher._download_from_url(f"https://{CDN}/a.m4a?token={SECRET}", "att1", "audio/mp4")

    assert result is None
    logged = _logged(caplog)
    assert "500" in logged
    _assert_url_absent(logged)


@pytest.mark.parametrize(
    "error",
    [aiohttp.InvalidURL(f"https://{CDN}/a.m4a?token={SECRET}"), asyncio.TimeoutError(), RuntimeError(f"/a.m4a?token={SECRET}")],
    ids=["client_error", "timeout", "other"],
)
async def test_transport_errors_log_only_their_type(allow_cdn, caplog, error):
    caplog.set_level(logging.DEBUG)
    fetcher = _fetcher_with(FakeSession(error=error))

    result = await fetcher._download_from_url(f"https://{CDN}/a.m4a?token={SECRET}", "att1", "audio/mp4")

    assert result is None
    _assert_url_absent(_logged(caplog))


async def test_successful_download_keeps_the_size_cap_and_writes_the_body(allow_cdn, tmp_path, monkeypatch):
    import services.audio_fetcher as fetcher_module

    monkeypatch.setattr(fetcher_module, "TEMP_AUDIO_DIR", tmp_path)
    fetcher = _fetcher_with(FakeSession(FakeResponse(200, {"Content-Type": "audio/mp4"}, b"RIFFdata")))

    result = await fetcher._download_from_url(f"https://{CDN}/a.m4a?token={SECRET}", "att1", "audio/wav")

    assert result is not None and result.endswith(".m4a")
    with open(result, "rb") as handle:
        assert handle.read() == b"RIFFdata"


async def test_oversized_content_length_is_refused(allow_cdn):
    fetcher = _fetcher_with(FakeSession(FakeResponse(200, {"Content-Length": str(200 * 1024 * 1024)})))
    assert await fetcher._download_from_url(f"https://{CDN}/a.m4a", "att1", "audio/mp4") is None


async def test_acquire_audio_with_a_refused_url_falls_back_to_error_without_logging_it(no_allowed_hosts, caplog):
    caplog.set_level(logging.DEBUG)
    fetcher = AudioFetcherService(getaddrinfo=_getaddrinfo_returning(PUBLIC_V4))
    try:
        local_path, source = await fetcher.acquire_audio(
            attachment_id="att1", audio_url=f"https://{CDN}/a.m4a?token={SECRET}"
        )
    finally:
        await fetcher.close()

    assert (local_path, source) == (None, "error")
    _assert_url_absent(_logged(caplog))


async def test_audio_handler_never_logs_nor_publishes_the_url(no_allowed_hosts, monkeypatch, caplog, capsys):
    import json

    import services.zmq_audio_handler as audio_module
    from services.zmq_audio_handler import AudioHandler

    class CapturingSocket:
        def __init__(self):
            self.sent = []

        async def send(self, data):
            self.sent.append(json.loads(data.decode("utf-8")))

        async def send_multipart(self, frames):
            self.sent.append(json.loads(frames[0].decode("utf-8")))

    fetcher = AudioFetcherService(getaddrinfo=_getaddrinfo_returning(PUBLIC_V4))
    monkeypatch.setattr(audio_module, "_retry_audio_pipeline_import", lambda: True)
    monkeypatch.setattr(audio_module, "AUDIO_FETCHER_AVAILABLE", True)
    monkeypatch.setattr(audio_module, "get_audio_fetcher", lambda: fetcher)
    caplog.set_level(logging.DEBUG)
    sock = CapturingSocket()
    handler = AudioHandler.__new__(AudioHandler)
    handler.pub_socket = sock
    handler.db = None
    handler.audio_pipeline = None

    try:
        await handler._handle_audio_process_request(
            {
                "messageId": "m1",
                "attachmentId": "a1",
                "senderId": "s1",
                "audioDurationMs": 1000,
                "audioUrl": f"https://{CDN}/a.m4a?token={SECRET}",
            }
        )
    finally:
        await fetcher.close()

    captured = capsys.readouterr()
    _assert_url_absent(_logged(caplog))
    _assert_url_absent(captured.out + captured.err)
    assert len(sock.sent) == 1
    _assert_url_absent(json.dumps(sock.sent[0]))
