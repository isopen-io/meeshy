"""La publication et le lot ZMQ tournent sous le régime de leurs tâches (#16735, #16716).

La publication d'un résultat tournait HORS du `task_scope` : sous le régime
non déclaré, la trace d'une publication ratée taisait tout, même pour un
message ordinaire, et ce qui n'était pas expurgé (`{e}`, `traceback.print_exc`)
citait en clair le sous-titre qu'une exception portait. Le lot ZMQ appelait
`_ml_translate_batch` sans régime : un lot de messages ordinaires perdait son
diagnostic. Désormais :

- chaque publication s'exécute sous le régime de SA tâche ;
- un lot dont toutes les tâches sont ordinaires s'exécute sous le régime
  ordinaire ; un lot mixte, ou qui contient un sous-titre ou une tâche au
  repos, reste tu ;
- les journaux du chemin expurgent l'exception et ne joignent la trace qu'au
  régime ordinaire ;
- la forme des résultats publiés ne change pas.
"""

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.task_privacy import task_scope, text_may_be_logged
from services.zmq_pool import translation_processor as tp
from services.zmq_translation_handler import TranslationHandler

SPOKEN = "Le code du coffre est 4471, porte B."
MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d1"
OTHER_MESSAGE_ID = "65f1a2b3c4d5e6f7a8b9c0d2"
CAPTION_ID = "call-caption:call-1:1200"
LEGACY_CAPTION_ID = "call-call-1-1200"

ERROR_RESULT_KEYS = {
    'messageId', 'translatedText', 'sourceLanguage', 'targetLanguage',
    'confidenceScore', 'processingTime', 'modelType', 'error',
}

SILENT_TASKS = [
    pytest.param(False, CAPTION_ID, id="sous-titre"),
    pytest.param(False, LEGACY_CAPTION_ID, id="ancien-sous-titre"),
    pytest.param(True, MESSAGE_ID, id="au-repos"),
]


def _task(message_id=MESSAGE_ID, at_rest=False, targets=("en",), task_id="task-1"):
    return SimpleNamespace(
        task_id=task_id,
        message_id=message_id,
        text=SPOKEN,
        source_language="fr",
        target_languages=list(targets),
        model_type="basic",
        conversation_id="conv-1",
        created_at=0.0,
        at_rest=at_rest,
        accepted_error_codes=(),
    )


class _Service:
    def __init__(self, fail=False):
        self.fail = fail
        self.regimes = []

    async def translate_with_structure(self, text, source_language, target_language,
                                       model_type, source_channel, **_):
        self.regimes.append(text_may_be_logged())
        if self.fail:
            raise ValueError(f"tokenizer refused input: {SPOKEN}")
        return {"translated_text": "The safe code is 4471, door B.", "confidence": 0.95}

    async def _ml_translate_batch(self, texts, source_lang, target_lang, model_type):
        self.regimes.append(text_may_be_logged())
        if self.fail:
            raise ValueError(f"batch refused input: {SPOKEN}")
        return [f"{t} (en)" for t in texts]


class _Publisher:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    async def __call__(self, task_id, result, target_language):
        self.calls.append((result.get('messageId'), text_may_be_logged(), result))
        if self.fail:
            raise RuntimeError(f"pub socket refused payload: {result.get('translatedText')}")


def _logged(caplog):
    return caplog.text


def _traced(caplog):
    return [record for record in caplog.records if record.exc_info]


async def _single(task, service, publisher):
    return await tp.process_single_translation(
        task=task, worker_name="w1", translation_service=service,
        translation_cache=None, publish_func=publisher,
    )


async def _batch(tasks, service, publisher):
    return await tp.process_batch_translation(
        tasks=tasks, worker_name="w1", translation_service=service, publish_func=publisher,
    )


@pytest.mark.unit
async def test_an_ordinary_message_publishes_under_its_ordinary_regime():
    publisher = _Publisher()

    await _single(_task(), _Service(), publisher)

    assert [logged for _, logged, _ in publisher.calls] == [True]


@pytest.mark.unit
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_a_silent_task_publishes_under_its_silent_regime(at_rest, message_id):
    publisher = _Publisher()

    await _single(_task(message_id, at_rest), _Service(), publisher)

    assert [logged for _, logged, _ in publisher.calls] == [False]


@pytest.mark.unit
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_a_failed_publish_of_a_silent_task_never_logs_its_text(caplog, at_rest, message_id):
    caplog.set_level(logging.DEBUG)
    publisher = _Publisher(fail=True)

    results = await _single(_task(message_id, at_rest), _Service(), publisher)

    assert results == []
    assert len(publisher.calls) == 2
    assert SPOKEN not in _logged(caplog)
    assert "4471" not in _logged(caplog)


@pytest.mark.unit
async def test_a_failed_publish_of_an_ordinary_message_keeps_its_diagnostic(caplog):
    caplog.set_level(logging.DEBUG)

    await _single(_task(), _Service(), _Publisher(fail=True))

    assert "The safe code is 4471, door B." in _logged(caplog)


@pytest.mark.unit
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_a_failing_translation_of_a_silent_task_never_logs_its_text(caplog, at_rest, message_id):
    caplog.set_level(logging.DEBUG)
    publisher = _Publisher()

    await _single(_task(message_id, at_rest), _Service(fail=True), publisher)

    assert SPOKEN not in _logged(caplog)
    assert len(publisher.calls) == 1


@pytest.mark.unit
async def test_a_failing_translation_of_an_ordinary_message_keeps_its_diagnostic(caplog):
    caplog.set_level(logging.DEBUG)

    await _single(_task(), _Service(fail=True), _Publisher())

    assert SPOKEN in _logged(caplog)


@pytest.mark.unit
async def test_the_error_result_published_keeps_its_shape():
    publisher = _Publisher(fail=True)

    await _single(_task(CAPTION_ID), _Service(), publisher)

    _, _, error_result = publisher.calls[1]
    assert set(error_result) == ERROR_RESULT_KEYS
    assert error_result['translatedText'] == SPOKEN
    assert error_result['messageId'] == CAPTION_ID


@pytest.mark.unit
async def test_a_homogeneous_ordinary_batch_translates_under_the_ordinary_regime():
    service = _Service()
    tasks = [_task(MESSAGE_ID, task_id="t1"), _task(OTHER_MESSAGE_ID, task_id="t2")]

    await _batch(tasks, service, _Publisher())

    assert service.regimes == [True]


@pytest.mark.unit
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_a_mixed_batch_stays_silent(at_rest, message_id):
    service = _Service()
    tasks = [_task(MESSAGE_ID, task_id="t1"), _task(message_id, at_rest, task_id="t2")]

    await _batch(tasks, service, _Publisher())

    assert service.regimes == [False]


@pytest.mark.unit
async def test_a_batch_of_captions_stays_silent():
    service = _Service()
    tasks = [_task(CAPTION_ID, task_id="t1"), _task(LEGACY_CAPTION_ID, task_id="t2")]

    await _batch(tasks, service, _Publisher())

    assert service.regimes == [False]


@pytest.mark.unit
async def test_a_failing_ordinary_batch_keeps_its_diagnostic(caplog):
    caplog.set_level(logging.DEBUG)
    tasks = [_task(MESSAGE_ID, task_id="t1"), _task(OTHER_MESSAGE_ID, task_id="t2")]

    await _batch(tasks, _Service(fail=True), _Publisher())

    assert SPOKEN in _logged(caplog)


@pytest.mark.unit
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_a_failing_batch_with_a_silent_task_never_logs_its_text(caplog, at_rest, message_id):
    caplog.set_level(logging.DEBUG)
    publisher = _Publisher()
    tasks = [_task(MESSAGE_ID, task_id="t1"), _task(message_id, at_rest, task_id="t2")]

    await _batch(tasks, _Service(fail=True), publisher)

    assert SPOKEN not in _logged(caplog)
    assert [set(result) for _, _, result in publisher.calls] == [ERROR_RESULT_KEYS] * 2


@pytest.mark.unit
async def test_each_batch_result_is_published_under_its_own_task_regime():
    publisher = _Publisher()
    tasks = [_task(MESSAGE_ID, task_id="t1"), _task(CAPTION_ID, task_id="t2")]

    await _batch(tasks, _Service(), publisher)

    assert [(mid, logged) for mid, logged, _ in publisher.calls] == [(MESSAGE_ID, True), (CAPTION_ID, False)]


@pytest.mark.unit
async def test_a_batch_whose_publishes_all_fail_never_raises_nor_logs_a_caption(caplog):
    caplog.set_level(logging.DEBUG)
    tasks = [_task(MESSAGE_ID, task_id="t1"), _task(CAPTION_ID, task_id="t2")]

    completed = await _batch(tasks, _Service(), _Publisher(fail=True))

    assert completed == 0
    assert SPOKEN not in _logged(caplog)


def _handler(send_error):
    pub_socket = MagicMock()
    pub_socket.send = AsyncMock(side_effect=send_error)
    return TranslationHandler(pool_manager=MagicMock(), pub_socket=pub_socket), pub_socket


def _valid_result(message_id):
    return {
        'messageId': message_id, 'translatedText': "The safe code is 4471, door B.",
        'sourceLanguage': 'fr', 'targetLanguage': 'en', 'confidenceScore': 0.95,
        'processingTime': 0.1, 'modelType': 'basic', 'workerName': 'w1', 'created_at': 0.0,
    }


@pytest.mark.unit
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_the_handler_never_logs_nor_prints_a_failed_silent_publish(caplog, capsys, at_rest, message_id):
    caplog.set_level(logging.DEBUG)
    handler, _ = _handler(RuntimeError(f"zmq refused frame: {SPOKEN}"))

    with task_scope(at_rest, message_id):
        await handler._publish_translation_result("task-1", _valid_result(message_id), "en")

    captured = capsys.readouterr()
    assert SPOKEN not in _logged(caplog)
    assert SPOKEN not in captured.err + captured.out
    assert _traced(caplog) == []


@pytest.mark.unit
async def test_the_handler_keeps_the_full_trace_of_an_ordinary_failed_publish(caplog, capsys):
    caplog.set_level(logging.DEBUG)
    handler, _ = _handler(RuntimeError(f"zmq refused frame: {SPOKEN}"))

    with task_scope(False, MESSAGE_ID):
        await handler._publish_translation_result("task-1", _valid_result(MESSAGE_ID), "en")

    assert SPOKEN in _logged(caplog)
    assert len(_traced(caplog)) == 1
    assert _traced(caplog)[0].exc_info[0] is RuntimeError


@pytest.mark.unit
async def test_the_handler_still_sends_the_same_payload_once_under_a_caption_regime():
    handler, pub_socket = _handler(None)

    with task_scope(False, CAPTION_ID):
        await handler._publish_translation_result("task-1", _valid_result(CAPTION_ID), "en")

    sent = json.loads(pub_socket.send.call_args.args[0].decode("utf-8"))
    assert sent['type'] == 'translation_completed'
    assert sent['result']['translatedText'] == "The safe code is 4471, door B."
    assert sent['result']['messageId'] == CAPTION_ID


def _translation_service(engine):
    from services.translation_ml.translation_service import TranslationService

    TranslationService._instance = None
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = True
    cache = MagicMock()
    cache.check_cache_batch = AsyncMock(side_effect=lambda segments, *_: ([None] * len(segments), list(enumerate(s["text"] for s in segments))))
    cache.cache_batch_results = AsyncMock()
    service = TranslationService(model_loader, engine, cache)
    service.is_initialized = True
    return service


def _failing_engine():
    engine = MagicMock()
    engine.translate_text = AsyncMock(side_effect=ValueError(f"refused: {SPOKEN}"))
    engine.translate_batch = AsyncMock(side_effect=ValueError(f"refused: {SPOKEN}"))
    return engine


LONG_TEXT = "\n\n".join([SPOKEN] * 6)


@pytest.mark.unit
@pytest.mark.parametrize("text", [pytest.param(SPOKEN, id="simple"), pytest.param(LONG_TEXT, id="structure")])
@pytest.mark.parametrize("at_rest,message_id", SILENT_TASKS)
async def test_the_ml_service_never_logs_a_silent_task_exception(caplog, text, at_rest, message_id):
    caplog.set_level(logging.DEBUG)
    service = _translation_service(_failing_engine())

    with task_scope(at_rest, message_id):
        await service.translate_with_structure(text, "fr", "en", "basic", "zmq", use_cache=False)

    assert SPOKEN not in _logged(caplog)


@pytest.mark.unit
async def test_the_ml_service_never_logs_a_caption_when_segmentation_fails(caplog):
    caplog.set_level(logging.DEBUG)
    service = _translation_service(_failing_engine())
    service.text_segmenter = MagicMock()
    service.text_segmenter.segment_text.side_effect = ValueError(f"segmenter refused: {SPOKEN}")

    with task_scope(False, CAPTION_ID):
        await service.translate_with_structure(LONG_TEXT, "fr", "en", "basic", "zmq", use_cache=False)

    assert SPOKEN not in _logged(caplog)


@pytest.mark.unit
@pytest.mark.parametrize("text", [pytest.param(SPOKEN, id="simple"), pytest.param(LONG_TEXT, id="structure")])
async def test_the_ml_service_keeps_an_ordinary_exception_in_its_diagnostic(caplog, text):
    caplog.set_level(logging.DEBUG)
    service = _translation_service(_failing_engine())

    with task_scope(False, MESSAGE_ID):
        await service.translate_with_structure(text, "fr", "en", "basic", "zmq")

    assert SPOKEN in _logged(caplog)


@pytest.mark.unit
def test_a_pipeline_creation_failure_is_logged_with_its_trace_not_printed(caplog, capsys, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from services.translation_ml import translator_engine as te

    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(te, "Seq2SeqTranslator", MagicMock(side_effect=RuntimeError("weights corrupted")), raising=False)
    model_loader = MagicMock()
    model_loader.device = "cpu"
    engine = te.TranslatorEngine(model_loader, ThreadPoolExecutor(max_workers=1))

    pipeline, ok = engine._get_or_create_pipeline("basic", "fra_Latn", "eng_Latn")

    captured = capsys.readouterr()
    assert (pipeline, ok) == (None, False)
    assert "weights corrupted" not in captured.err
    traced = _traced(caplog)
    assert len(traced) == 1
    assert traced[0].exc_info[0] is RuntimeError
