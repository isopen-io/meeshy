"""
#18436 — la boucle de réception du traducteur ne journalise jamais le message
d'une exception.

Le `ping` est le seul type que le routeur ATTEND de façon synchrone : une
exception levée par son handler remonte jusqu'au `except Exception` de
`start()`, qui écrivait `Erreur inattendue: {e}` puis imprimait un traceback
sur stderr. Le message d'une exception peut porter le contenu de la requête.

Les requêtes lancées en tâche suivie (`_create_tracked_task`) ont le même
défaut un cran plus loin : le rappel de fin de tâche écrivait l'exception
entière.

Attendu aux deux sites : une ligne `[TRANSLATOR]` qui ne porte que le TYPE de
l'exception, aucun traceback, et le travail continue.
"""

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, create_autospec

import pytest
import zmq

from services.zmq_server_core import ZMQTranslationServer
from services.zmq_translation_handler import TranslationHandler

SECRET = "secret-de-la-requete-18436"


def _closing_tracker(launched: list):
    def track(coro, task_type):
        launched.append(task_type)
        coro.close()

    return track


def _core(frames: list) -> tuple[ZMQTranslationServer, list]:
    launched: list = []
    core = ZMQTranslationServer.__new__(ZMQTranslationServer)
    core.active_tasks = set()
    core.task_counters = {}
    core.translation_handler = create_autospec(TranslationHandler, instance=True)
    core.audio_handler = MagicMock()
    core.transcription_handler = MagicMock()
    core.voice_handler = None
    core._create_tracked_task = _closing_tracker(launched)
    core._inject_binary_frames = MagicMock()
    core.pull_socket = SimpleNamespace(recv_multipart=AsyncMock(side_effect=frames))
    core.pub_socket = object()
    core._update_cpu_usage_background = AsyncMock()
    core._cleanup_temp_files_background = AsyncMock()
    core.stop = AsyncMock()
    return core, launched


def _frame(payload: dict) -> list:
    return [json.dumps(payload).encode("utf-8")]


def _translator_lines(caplog) -> list[str]:
    return [record.getMessage() for record in caplog.records if "[TRANSLATOR]" in record.getMessage()]


@pytest.mark.unit
async def test_a_ping_handler_failure_logs_its_type_only_and_the_loop_goes_on(caplog, capsys):
    core, launched = _core(
        [
            _frame({"type": "ping", "timestamp": 1}),
            _frame({"type": "translation", "text": "Bonjour", "targetLanguages": ["en"]}),
            zmq.ZMQError(),
        ]
    )
    core.translation_handler._handle_translation_request_multipart.side_effect = [RuntimeError(SECRET), None]
    caplog.set_level(logging.DEBUG)

    await core.start()

    stderr = capsys.readouterr().err
    lines = [line for line in _translator_lines(caplog) if "RuntimeError" in line]
    assert len(lines) == 1, [record.getMessage() for record in caplog.records]
    assert SECRET not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)
    assert "Traceback" not in stderr
    assert SECRET not in stderr
    assert core.pull_socket.recv_multipart.await_count == 3
    assert launched == ["translation"]


@pytest.mark.unit
async def test_an_uncaught_tracked_task_failure_logs_its_type_only(caplog):
    core = ZMQTranslationServer.__new__(ZMQTranslationServer)
    core.active_tasks = set()
    core.task_counters = {}
    caplog.set_level(logging.DEBUG)

    async def fail():
        raise ValueError(SECRET)

    task = core._create_tracked_task(fail(), "translation")
    with pytest.raises(ValueError):
        await task

    lines = [line for line in _translator_lines(caplog) if "ValueError" in line]
    assert len(lines) == 1, [record.getMessage() for record in caplog.records]
    assert "translation" in lines[0]
    assert SECRET not in caplog.text
    assert core.active_tasks == set()
