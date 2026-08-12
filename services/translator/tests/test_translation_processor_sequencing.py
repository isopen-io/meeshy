"""
Régression pour le 2e volet de l'incident textes longs (2026-07-04) : le
budget proportionnel était correct par langue, mais process_single_translation
lançait TOUTES les langues cibles en concurrence (asyncio.create_task) alors
que l'inférence ML est sérialisée par un threading.Lock par modèle
(model_loader.get_model_inference_lock). Le chrono de chaque langue courait
donc pendant l'attente des autres : pour N langues, la k-ième devait tenir
(k-1)×T_inférence + T_inférence dans un budget prévu pour UNE inférence —
toutes expiraient d'un coup (observé en prod : fr→pt et fr→en timeout à la
même milliseconde, même worker, même task, budget 108 s).

Le fan-out doit être séquentiel : la concurrence ne parallélisait rien.
"""

import asyncio
from types import SimpleNamespace

import pytest

from services.zmq_pool import translation_processor as tp


def _make_task(languages):
    return SimpleNamespace(
        task_id="task-seq-1",
        message_id="msg-seq-1",
        text="Bonjour tout le monde.",
        source_language="fr",
        target_languages=list(languages),
        model_type="premium",
        conversation_id="conv-1",
        created_at="2026-07-04T00:00:00Z",
    )


class _ProbeService:
    """Compte les traductions simultanément actives dans le service ML."""

    def __init__(self):
        self.active = 0
        self.max_active = 0
        self.calls = []

    async def translate_with_structure(self, text, source_language,
                                       target_language, model_type,
                                       source_channel):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.calls.append(target_language)
        await asyncio.sleep(0.01)
        self.active -= 1
        return {"translated_text": f"[{target_language}] {text}"}


@pytest.mark.unit
async def test_languages_of_one_task_are_translated_sequentially():
    service = _ProbeService()
    published = []

    async def publish(task_id, result, target_language):
        published.append((target_language, result.get("translatedText")))

    results = await tp.process_single_translation(
        task=_make_task(["en", "pt", "de"]),
        worker_name="test_worker",
        translation_service=service,
        translation_cache=None,
        publish_func=publish,
    )

    assert service.max_active == 1, (
        "les langues d'une même tâche doivent passer une par une dans le "
        "service ML — un fan-out concurrent fait courir le budget de chaque "
        "langue pendant l'attente du lock modèle des autres"
    )
    assert service.calls == ["en", "pt", "de"]
    assert [lang for lang, _ in published] == ["en", "pt", "de"]
    assert len(results) == 3


@pytest.mark.unit
async def test_one_failing_language_does_not_block_the_others():
    class FlakyService(_ProbeService):
        async def translate_with_structure(self, text, source_language,
                                           target_language, model_type,
                                           source_channel):
            if target_language == "pt":
                raise RuntimeError("inference_timeout: fr→pt")
            return await super().translate_with_structure(
                text, source_language, target_language, model_type,
                source_channel)

    service = FlakyService()
    published = []

    async def publish(task_id, result, target_language):
        published.append((target_language, bool(result.get("error"))))

    results = await tp.process_single_translation(
        task=_make_task(["en", "pt", "de"]),
        worker_name="test_worker",
        translation_service=service,
        translation_cache=None,
        publish_func=publish,
    )

    assert [lang for lang, _ in published] == ["en", "pt", "de"]
    assert published[1][1] is True
    # Comportement actuel : _translate_single_language avale l'exception et
    # publie un fallback "[XX] préfixe" porteur d'un champ error (simulacre
    # rejeté ensuite par la validation gateway — sa suppression est un
    # chantier séparé). L'important ici : en et de aboutissent quand même.
    assert len(results) == 3
    assert not published[0][1] and not published[2][1]


@pytest.mark.unit
def test_no_concurrent_language_fanout_remains_in_single_path():
    import inspect

    src = inspect.getsource(tp.process_single_translation)
    assert "create_task" not in src, (
        "process_single_translation ne doit plus fan-out les langues via "
        "asyncio.create_task : l'inférence est sérialisée par le lock modèle, "
        "la concurrence ne fait que consumer les budgets pendant l'attente"
    )
