"""
3e volet de l'incident textes longs (2026-07-04) : sur le serveur prod
(4 cœurs), configure_pytorch_threads divisait les cœurs par le nombre TOTAL
de workers asyncio (34) → max(2, 4//34) = 2 threads torch pour tout le
process. Or torch.set_num_threads est GLOBAL et l'inférence ML est
sérialisée par un threading.Lock par modèle : il n'y a jamais qu'UNE
inférence active à la fois — la brider à 2 threads sur 4 cœurs la ralentit
~2× sans éviter aucune contention réelle. Mesuré en prod : ~9 s/phrase,
d'où l'échec des budgets même à 600 chars.

La règle : l'unique inférence active doit disposer de (presque) tous les
cœurs — cpu_count - 1, plancher 2 — indépendamment du nombre de workers
asyncio (qui attendent le lock, pas le CPU).
"""

from unittest.mock import patch

import pytest

from services.zmq_pool import worker_pool as wp


def _configured_threads(cpu_count: int, total_workers: int) -> int:
    calls = []
    with patch.object(wp.multiprocessing, "cpu_count", return_value=cpu_count):
        with patch("torch.set_num_threads", side_effect=calls.append):
            wp.configure_pytorch_threads(total_workers)
    assert len(calls) == 1
    return calls[0]


@pytest.mark.unit
def test_prod_shape_4_cores_34_workers_uses_nearly_all_cores():
    assert _configured_threads(cpu_count=4, total_workers=34) == 3


@pytest.mark.unit
def test_thread_count_ignores_worker_count():
    # Les workers asyncio attendent le lock modèle, pas le CPU : leur nombre
    # ne doit pas diluer les threads de l'unique inférence active.
    assert _configured_threads(4, 2) == _configured_threads(4, 64)


@pytest.mark.unit
def test_floor_of_two_threads_on_tiny_hosts():
    assert _configured_threads(cpu_count=1, total_workers=8) == 2
    assert _configured_threads(cpu_count=2, total_workers=8) == 2


@pytest.mark.unit
def test_big_host_keeps_one_core_for_the_event_loop():
    assert _configured_threads(cpu_count=16, total_workers=34) == 15
