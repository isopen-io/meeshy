"""
#17189 — le refus transitoire du translator porte un code déclaré.

`_pool_full_error` publiait seulement le libellé « translation pool full », que
la passerelle reconnaissait par comparaison de chaîne : le renommer rouvrait
#17004 (disjoncteur ouvert à l'arrêt) sans qu'aucun témoin ne tombe.

Le refus porte désormais `errorCode: TRANSLATION_POOL_FULL` À CÔTÉ du libellé,
que garde une passerelle ancienne. Le code n'est pas négocié par
`acceptsErrorCodes` : il est additif, et une passerelle qui l'ignore lit encore
le libellé.

Le second témoin confronte le code à la SOURCE de la passerelle
(`zmq-translation/types.ts`) : un renommage d'un seul côté le fait tomber.
"""
import json
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

GATEWAY_TYPES = (
    Path(__file__).resolve().parents[2]
    / "gateway" / "src" / "services" / "zmq-translation" / "types.ts"
)


def _task(task_id: str = "t1"):
    from services.zmq_models import TranslationTask
    return TranslationTask(
        task_id=task_id,
        message_id=f"msg-{task_id}",
        text="texte",
        source_language="en",
        target_languages=["fr"],
        conversation_id="conv-1",
    )


def _gateway_constant(name: str) -> str:
    match = re.search(rf"export const {name}\s*=\s*'([^']+)'", GATEWAY_TYPES.read_text(encoding="utf-8"))
    assert match, f"{name} introuvable dans {GATEWAY_TYPES}"
    return match.group(1)


@pytest.mark.unit
def test_pool_full_error_carries_its_declared_code_and_keeps_the_legacy_label():
    from services.zmq_translation_handler import TranslationHandler, TRANSLATION_POOL_FULL, POOL_FULL_ERROR
    error = TranslationHandler._pool_full_error(_task())
    assert error['errorCode'] == TRANSLATION_POOL_FULL == 'TRANSLATION_POOL_FULL'
    assert error['error'] == POOL_FULL_ERROR == 'translation pool full'


@pytest.mark.unit
async def test_published_refusal_carries_the_code_on_the_wire():
    from services.zmq_translation_handler import TranslationHandler
    pub_socket = AsyncMock()
    handler = TranslationHandler(pool_manager=object(), pub_socket=pub_socket)
    await handler.publish_pool_full([_task("t9")])
    sent = json.loads(pub_socket.send.call_args.args[0].decode('utf-8'))
    assert sent['errorCode'] == 'TRANSLATION_POOL_FULL'
    assert sent['error'] == 'translation pool full'


@pytest.mark.unit
@pytest.mark.skipif(not GATEWAY_TYPES.exists(), reason="source de la passerelle absente (image isolée)")
def test_emitted_code_and_label_are_those_the_gateway_declares():
    from services.zmq_translation_handler import TranslationHandler
    error = TranslationHandler._pool_full_error(_task())
    assert error['errorCode'] == _gateway_constant('TRANSLATION_POOL_FULL_ERROR_CODE')
    assert error['error'] == _gateway_constant('LEGACY_POOL_FULL_ERROR')
