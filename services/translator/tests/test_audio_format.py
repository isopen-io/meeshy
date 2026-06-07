"""Tests unitaires des helpers purs de format audio (D1/D2).

Couvre la politique d'encodage Opus, la résolution MIME et la sélection des
octets audio (préférence disque, fallback base64) — sans dépendance ML.
"""

import base64
import os

import pytest

from utils.audio_format import (
    export_options,
    mime_type_for,
    normalize_format,
    read_audio_bytes,
)

pytestmark = pytest.mark.unit


# ── normalize_format ──────────────────────────────────────────────

def test_normalize_format_lowercases_and_strips_dot_and_space():
    assert normalize_format(" .MP3 ") == "mp3"
    assert normalize_format("Opus") == "opus"
    assert normalize_format(None) == ""


# ── mime_type_for ─────────────────────────────────────────────────

def test_mime_type_for_known_formats():
    assert mime_type_for("opus") == "audio/opus"
    assert mime_type_for("mp3") == "audio/mp3"
    assert mime_type_for("wav") == "audio/wav"
    assert mime_type_for("ogg") == "audio/ogg"


def test_mime_type_for_is_case_insensitive():
    assert mime_type_for("OPUS") == "audio/opus"
    assert mime_type_for(".MP3") == "audio/mp3"


def test_mime_type_for_unknown_falls_back_to_audio_prefix():
    assert mime_type_for("xyz") == "audio/xyz"


def test_mime_type_for_empty_defaults_to_mp3():
    assert mime_type_for("") == "audio/mp3"
    assert mime_type_for(None) == "audio/mp3"


# ── export_options ────────────────────────────────────────────────

def test_export_options_opus_uses_libopus_mono_lowbitrate():
    opts = export_options("opus")
    assert opts["format"] == "opus"
    assert opts["codec"] == "libopus"
    assert opts["bitrate"].endswith("k")
    # mono (-ac 1) + application VoIP (basse latence basse bande)
    assert "-ac" in opts["parameters"]
    assert opts["parameters"][opts["parameters"].index("-ac") + 1] == "1"
    assert "-application" in opts["parameters"]


def test_export_options_opus_honours_overrides():
    opts = export_options("opus", bitrate="24k", application="audio")
    assert opts["bitrate"] == "24k"
    assert opts["parameters"][opts["parameters"].index("-application") + 1] == "audio"


def test_export_options_non_opus_is_simple_format_only():
    assert export_options("mp3") == {"format": "mp3"}
    assert export_options("wav") == {"format": "wav"}


def test_export_options_normalizes_input():
    assert export_options(".OPUS")["format"] == "opus"
    assert export_options(" MP3 ") == {"format": "mp3"}


# ── read_audio_bytes (D2) ─────────────────────────────────────────

def test_read_audio_bytes_prefers_file_over_base64(tmp_path):
    payload = b"\x00\x01opus-bytes\xff"
    f = tmp_path / "voice.opus"
    f.write_bytes(payload)
    # base64 d'autres données: doit être ignoré au profit du fichier
    other = base64.b64encode(b"stale-base64").decode()
    assert read_audio_bytes(audio_path=str(f), audio_data_base64=other) == payload


def test_read_audio_bytes_falls_back_to_base64_when_no_file():
    payload = b"legacy-bytes"
    b64 = base64.b64encode(payload).decode()
    assert read_audio_bytes(audio_path=None, audio_data_base64=b64) == payload
    assert read_audio_bytes(audio_path="/does/not/exist.opus", audio_data_base64=b64) == payload


def test_read_audio_bytes_returns_none_when_nothing_available():
    assert read_audio_bytes(audio_path=None, audio_data_base64=None) is None
    assert read_audio_bytes(audio_path="/nope.opus", audio_data_base64=None) is None
