"""Tests de _resolve_transitive_mapping (fusion de speakers multi-locuteurs).

Bug : la résolution suivait la chaîne via `mapping[current]` où `current`
devient une VALEUR du mapping. Si une valeur n'est pas elle-même une clé
(speaker fusionné vers un id absent du mapping), `mapping[current]` lève
KeyError → crash de tout le pipeline multi-speaker. Doit résoudre vers la
valeur sans crasher.
"""

import pytest

from src.services.audio_pipeline.multi_speaker_processor import _resolve_transitive_mapping


@pytest.mark.unit
def test_resolves_chain_to_final_destination():
    assert _resolve_transitive_mapping({"s0": "s1", "s1": "s2", "s2": "s2"}) == {
        "s0": "s2",
        "s1": "s2",
        "s2": "s2",
    }


@pytest.mark.unit
def test_value_not_a_key_does_not_raise_keyerror():
    # 's1' n'est pas une clé du mapping → ne doit pas crasher, résout vers 's1'.
    assert _resolve_transitive_mapping({"s0": "s1"}) == {"s0": "s1"}


@pytest.mark.unit
def test_chain_ending_on_dangling_value():
    # s0 → s1 → s2, mais s2 absent des clés → résout vers s2 sans KeyError.
    assert _resolve_transitive_mapping({"s0": "s1", "s1": "s2"}) == {
        "s0": "s2",
        "s1": "s2",
    }


@pytest.mark.unit
def test_cycle_terminates_without_infinite_loop():
    result = _resolve_transitive_mapping({"s0": "s1", "s1": "s0"})
    assert set(result.keys()) == {"s0", "s1"}


@pytest.mark.unit
def test_identity_mapping_unchanged():
    assert _resolve_transitive_mapping({"s0": "s0", "s1": "s1"}) == {"s0": "s0", "s1": "s1"}
