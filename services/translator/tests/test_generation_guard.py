"""#9309 — un message court en peul ou en wolof ne tient plus le traducteur 20 secondes.

Sur le banc (#9284), fr→ff, en→ff et en→wo avaient un p95 de ~19 s pour un p50 de
~2,5 s : la génération gloutonne bouclait jusqu'au plafond fixe de 256 jetons, sous le
verrou du modèle. La génération est désormais bornée par la longueur de la source et
coupée dès qu'elle boucle, dans la production comme dans le banc qui la mesure.
"""

from unittest.mock import MagicMock

import pytest

from services.translation_ml.seq2seq_translator import Seq2SeqTranslator
from utils.generation_guard import (
    GENERATION_CEILING,
    GenerationOutcome,
    RepetitionLoopStop,
    collapse_trailing_loop,
    generation_budget,
    greedy_generation_kwargs,
    trailing_loop_period,
)


def _torch():
    torch = pytest.importorskip("torch")
    if isinstance(torch, MagicMock):
        pytest.skip("torch est simulé dans cet environnement")
    return torch


class TestBudget:
    def test_a_short_source_can_no_longer_reach_the_fixed_ceiling(self):
        assert generation_budget(12) == 40
        assert generation_budget(12) < GENERATION_CEILING / 4

    def test_the_budget_grows_with_the_source(self):
        assert generation_budget(20) < generation_budget(40) < generation_budget(80)

    def test_the_budget_never_exceeds_the_ceiling(self):
        assert generation_budget(400) == GENERATION_CEILING
        assert generation_budget(400, ceiling=128) == 128

    def test_a_tiny_source_keeps_room_for_a_few_words(self):
        assert generation_budget(2) == 16

    def test_greedy_kwargs_bound_by_new_tokens_and_stop_on_loops(self):
        kwargs = greedy_generation_kwargs(30)

        assert kwargs["max_new_tokens"] == 85
        assert (kwargs["num_beams"], kwargs["do_sample"]) == (1, False)
        assert "max_length" not in kwargs
        assert [type(c) for c in kwargs["stopping_criteria"]] == [RepetitionLoopStop]


class TestLoopDetection:
    def test_four_consecutive_copies_of_a_block_are_a_loop(self):
        assert trailing_loop_period([9, 5, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]) == 3

    def test_three_copies_are_not_yet_a_loop(self):
        assert trailing_loop_period([9, 1, 2, 1, 2, 1, 2]) is None

    def test_a_single_token_repeated_is_a_loop(self):
        assert trailing_loop_period([4, 7, 7, 7, 7]) == 1

    def test_a_sentence_that_repeats_a_word_far_apart_is_not_a_loop(self):
        assert trailing_loop_period([1, 2, 3, 1, 4, 5, 1, 2, 6, 7]) is None

    def test_a_block_longer_than_sixteen_tokens_is_left_to_the_budget(self):
        block = list(range(17))
        assert trailing_loop_period(block * 4) is None

    def test_collapse_keeps_one_copy_of_the_looping_block(self):
        assert collapse_trailing_loop([9, 5, 1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]) == [9, 5, 1, 2, 3]

    def test_collapse_ignores_the_padding_of_a_row_that_stopped_early(self):
        assert collapse_trailing_loop([2, 8, 6, 6, 6, 6, 1, 1, 1], pad_id=1) == [2, 8, 6]

    def test_collapse_leaves_a_clean_translation_untouched(self):
        assert collapse_trailing_loop([2, 8, 3, 4, 5, 2, 1, 1], pad_id=1) == [2, 8, 3, 4, 5, 2]

    def test_the_stopping_criterion_stops_only_the_looping_rows(self):
        torch = _torch()
        input_ids = torch.tensor([[2, 5, 6, 5, 6, 5, 6, 5, 6], [2, 3, 4, 5, 6, 7, 8, 9, 10]])

        assert RepetitionLoopStop()(input_ids, None).tolist() == [True, False]


class TestOutcome:
    def test_an_outcome_knows_when_it_spent_its_whole_budget(self):
        assert GenerationOutcome(generated_tokens=40, budget=40, looped=False).hit_budget
        assert not GenerationOutcome(generated_tokens=12, budget=40, looped=False).hit_budget
