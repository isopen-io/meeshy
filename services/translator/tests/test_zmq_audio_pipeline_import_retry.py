"""
Régression pour l'incident prod 2026-07-03 : un ImportError au boot figeait
AUDIO_PIPELINE_AVAILABLE=False silencieusement (`except ImportError: pass`)
pour toute la vie du process — chaque message vocal répondait
pipeline_unavailable pendant ~8 h alors que le module était importable
(vérifié dans le container). Le mode dégradé du boot doit être RÉVERSIBLE :
l'import est retenté à chaud à la première requête.
"""

import inspect

import pytest

import services.zmq_audio_handler as handler_module


@pytest.mark.unit
def test_retry_import_recovers_from_boot_failure(monkeypatch):
    # Simule l'état post-boot-raté : flag figé False (le module, lui, est
    # importable — exactement la situation de l'incident).
    monkeypatch.setattr(handler_module, "AUDIO_PIPELINE_AVAILABLE", False)

    assert handler_module._retry_audio_pipeline_import() is True
    assert handler_module.AUDIO_PIPELINE_AVAILABLE is True
    assert callable(handler_module.get_audio_pipeline)


@pytest.mark.unit
def test_retry_import_noop_when_already_available():
    assert handler_module._retry_audio_pipeline_import() is True
    assert handler_module.AUDIO_PIPELINE_AVAILABLE is True


@pytest.mark.unit
def test_request_guard_and_init_use_the_retry_not_the_frozen_flag():
    # Le guard de la requête audio ET l'__init__ du handler doivent passer
    # par le retry — un `if not AUDIO_PIPELINE_AVAILABLE` figé referait
    # exactement l'incident.
    request_src = inspect.getsource(
        handler_module.AudioHandler._handle_audio_process_request
    )
    assert "_retry_audio_pipeline_import" in request_src, (
        "la requête audio doit retenter l'import à chaud avant de répondre "
        "pipeline_unavailable"
    )
    init_src = inspect.getsource(handler_module.AudioHandler.__init__)
    assert "_retry_audio_pipeline_import" in init_src


@pytest.mark.unit
def test_boot_import_failure_is_logged_not_swallowed():
    # Le `except ImportError` du chargement de module doit LOGGER le
    # traceback — le `pass` silencieux a rendu l'incident indiagnosticable
    # pendant 8 h.
    module_src = inspect.getsource(handler_module)
    guard_zone = module_src.split("def _retry_audio_pipeline_import")[0]
    assert "traceback.format_exc()" in guard_zone
    assert "except ImportError:\n    pass" not in guard_zone
