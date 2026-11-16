"""
#18666 — témoins adverses du garde d'audioUrl (revue QA).

Chaque témoin passe par le VRAI client aiohttp quand la question porte sur ce
qu'il fait d'une URL admise : l'analyse de `urlsplit` (le garde) et celle de
yarl (le client) doivent désigner le même hôte, et c'est le résolveur vérifié,
jamais une autre voie, qui choisit l'adresse de connexion.
"""

import asyncio
import logging
import socket

import aiohttp
import pytest

import services.audio_fetcher as fetcher_module
import utils.audio_url_guard as guard_module
from services.audio_fetcher import AudioFetcherService
from utils.audio_url_guard import ALLOWED_HOSTS_ENV, AudioUrlRejected, admit_audio_url

SECRET = "SECRET-18666-QA"
CDN = "cdn.example.com"


def _getaddrinfo_returning(address):
    calls = []

    async def getaddrinfo(host, port, family=0):
        calls.append((host, port))
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    getaddrinfo.calls = calls
    return getaddrinfo


def _logged(caplog):
    return "\n".join(record.getMessage() for record in caplog.records)


async def _download(url, getaddrinfo=None):
    fetcher = AudioFetcherService(getaddrinfo=getaddrinfo)
    try:
        return await fetcher._download_from_url(url, "att-qa", "audio/mp4")
    finally:
        await fetcher.close()


@pytest.mark.parametrize(
    "url",
    [
        f"https://{CDN}#@127.0.0.1/a.m4a?token={SECRET}",
        f"https://{CDN}?@127.0.0.1/a.m4a?token={SECRET}",
        f"https://{CDN.upper()}/a.m4a?token={SECRET}",
        f"https://{CDN}:/a.m4a?token={SECRET}",
        f"https://{CDN}:0443/a.m4a?token={SECRET}",
    ],
    ids=["fragment_at", "query_at", "uppercase", "empty_port", "zero_padded_port"],
)
async def test_the_client_connects_through_the_verified_resolver_for_the_admitted_name(monkeypatch, caplog, url):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, CDN)
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning("127.0.0.1")

    assert await _download(url, getaddrinfo) is None

    assert getaddrinfo.calls == [(CDN, 443)]
    logged = _logged(caplog)
    assert "private_address" in logged
    assert SECRET not in logged


async def test_proxy_environment_is_ignored(monkeypatch, caplog):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, CDN)
    for name in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.setenv(name, "http://127.0.0.1:9")
    monkeypatch.delenv("NO_PROXY", raising=False)
    monkeypatch.delenv("no_proxy", raising=False)
    caplog.set_level(logging.DEBUG)
    getaddrinfo = _getaddrinfo_returning("127.0.0.1")

    assert await _download(f"https://{CDN}/a.m4a?token={SECRET}", getaddrinfo) is None

    assert getaddrinfo.calls == [(CDN, 443)]
    assert "private_address" in _logged(caplog)


@pytest.mark.parametrize(
    "host",
    ["[::ffff:a9fe:a9fe]", "[::ffff:7f00:1]", "[64:ff9b::a9fe:a9fe]", "[2002:a9fe:a9fe::1]", "[::1]", "100.64.0.1", "0.0.0.0"],
)
def test_non_global_ip_literals_are_refused_even_when_listed(host):
    bare = host.strip("[]")
    with pytest.raises(AudioUrlRejected) as caught:
        admit_audio_url(f"https://{host}/a.m4a", allowed_hosts=frozenset({bare}))
    assert caught.value.reason == "private_address"


@pytest.mark.parametrize("host", ["2852039166", "0177.0.0.1", "127.1", "10.1"])
def test_all_digit_hosts_that_are_not_canonical_addresses_are_refused_even_when_listed(host):
    with pytest.raises(AudioUrlRejected) as caught:
        admit_audio_url(f"https://{host}/a.m4a", allowed_hosts=frozenset({host}))
    assert caught.value.reason == "malformed"


@pytest.mark.parametrize("host", ["2852039166", "0x7f.1", "0177.0.0.1"])
async def test_numeric_hosts_listed_by_mistake_never_reach_the_network(monkeypatch, caplog, host):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, host)
    caplog.set_level(logging.DEBUG)

    assert await _download(f"https://{host}/a.m4a?token={SECRET}") is None

    logged = _logged(caplog)
    assert "audioUrl refusée" in logged
    assert "Téléchargement depuis" not in logged or "private_address" in logged
    assert SECRET not in logged


@pytest.mark.parametrize(
    "url",
    [
        f"https://{CDN}%2F@169.254.169.254/",
        f"https://{CDN};@169.254.169.254/",
        f"https://{CDN}\\@169.254.169.254/",
        f"https://169.254.169.254\\@{CDN}/",
        f"https://{CDN}./",
        f"https://cdn．example.com/",
        f"https://{CDN}:8443/",
        f"http://{CDN}/",
        f"//{CDN}/",
    ],
)
def test_parser_differentials_are_refused(url):
    with pytest.raises(AudioUrlRejected):
        admit_audio_url(url, allowed_hosts=frozenset({CDN}))


class _Content:
    def __init__(self, chunks, error=None):
        self._chunks = chunks
        self._error = error

    async def iter_chunked(self, _size):
        for chunk in self._chunks:
            yield chunk
        if self._error is not None:
            raise self._error


class _Response:
    def __init__(self, status, headers, content):
        self.status = status
        self.headers = headers
        self.content = content


async def test_a_body_cut_mid_stream_leaves_no_partial_file(monkeypatch, tmp_path):
    monkeypatch.setattr(fetcher_module, "TEMP_AUDIO_DIR", tmp_path)
    fetcher = AudioFetcherService()
    response = _Response(200, {"Content-Type": "audio/mp4"}, _Content([b"x" * 10], aiohttp.ClientPayloadError("cut")))

    with pytest.raises(aiohttp.ClientPayloadError):
        await fetcher._save_response(response, CDN, "att-qa", "audio/mp4")

    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("content_length", [None, "-1", "1e9", "abc", "4"])
async def test_the_streamed_cap_holds_whatever_content_length_says(monkeypatch, tmp_path, content_length):
    monkeypatch.setattr(fetcher_module, "TEMP_AUDIO_DIR", tmp_path)
    monkeypatch.setattr(fetcher_module, "MAX_DOWNLOAD_SIZE", 8)
    headers = {} if content_length is None else {"Content-Length": content_length}
    fetcher = AudioFetcherService()
    response = _Response(200, headers, _Content([b"x" * 5, b"x" * 5]))

    assert await fetcher._save_response(response, CDN, "att-qa", "audio/mp4") is None
    assert list(tmp_path.iterdir()) == []


def _bind_443():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind(("127.0.0.1", 443))
    except OSError:
        server.close()
        pytest.skip("port 443 indisponible sur ce poste")
    server.listen(1)
    server.setblocking(False)
    return server


async def test_the_connection_goes_to_the_verified_address_with_the_listed_name_as_sni(monkeypatch):
    monkeypatch.setenv(ALLOWED_HOSTS_ENV, CDN)
    monkeypatch.setattr(guard_module, "is_public_address", lambda _raw: True)
    server = _bind_443()
    received = bytearray()
    loop = asyncio.get_running_loop()

    async def serve_once():
        conn, _ = await loop.sock_accept(server)
        conn.setblocking(False)
        try:
            data = await asyncio.wait_for(loop.sock_recv(conn, 4096), timeout=5)
            received.extend(data)
        finally:
            conn.close()

    serving = asyncio.create_task(serve_once())
    getaddrinfo = _getaddrinfo_returning("127.0.0.1")
    try:
        result = await _download(f"https://{CDN}/a.m4a?token={SECRET}", getaddrinfo)
        await asyncio.wait_for(serving, timeout=5)
    finally:
        server.close()

    assert result is None
    assert getaddrinfo.calls == [(CDN, 443)]
    assert received[:1] == b"\x16"
    assert CDN.encode() in bytes(received)
