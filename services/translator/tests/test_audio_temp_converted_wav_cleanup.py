"""
#13102 — recette staging du 2026-10-26 : le clair d'un vocal au repos restait
sur le disque du translator, sous `/tmp/meeshy_audio/<…>.converted.wav` (la
conversion WAV de Whisper). Le nettoyage de fin de tâche efface le fichier
reçu ET sa conversion, et oublie celle-ci du cache de conversion.
"""
from services import audio_fetcher as fetcher_module
from utils import audio_format_converter as converter


def test_the_task_cleanup_erases_the_received_file_and_its_wav_conversion(tmp_path, monkeypatch):
    monkeypatch.setattr(fetcher_module, "TEMP_AUDIO_DIR", tmp_path)
    received = tmp_path / "audio_6adf3884065ef6a3ca148a2f_20261026_112453.m4a"
    converted = tmp_path / "audio_6adf3884065ef6a3ca148a2f_20261026_112453.converted.wav"
    received.write_bytes(b"M4A")
    converted.write_bytes(b"RIFF-CLAIR")
    converter._conversion_cache[str(received)] = str(converted)

    fetcher_module.AudioFetcherService.cleanup_temp_file(object.__new__(fetcher_module.AudioFetcherService), str(received))

    assert [received.exists(), converted.exists()] == [False, False]
    assert str(received) not in converter._conversion_cache


def test_a_file_outside_the_temp_directory_is_never_touched(tmp_path, monkeypatch):
    monkeypatch.setattr(fetcher_module, "TEMP_AUDIO_DIR", tmp_path / "temp")
    outside = tmp_path / "audio_x.m4a"
    outside_wav = tmp_path / "audio_x.converted.wav"
    outside.write_bytes(b"M4A")
    outside_wav.write_bytes(b"RIFF")
    fetcher_module.AudioFetcherService.cleanup_temp_file(object.__new__(fetcher_module.AudioFetcherService), str(outside))
    assert [outside.exists(), outside_wav.exists()] == [True, True]
