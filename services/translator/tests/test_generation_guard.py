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
    settle_generation,
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


class _Tokenizer:
    pad_token_id = 1

    def __init__(self, lengths):
        self.lengths = lengths
        self.src_lang = None

    def convert_tokens_to_ids(self, token):
        return 256000

    def __call__(self, texts, **kwargs):
        torch = _torch()
        width = max(self.lengths)
        mask = [[1] * n + [0] * (width - n) for n in self.lengths]
        return {"input_ids": torch.tensor(mask) * 7, "attention_mask": torch.tensor(mask)}

    def batch_decode(self, outputs, skip_special_tokens):
        return [" ".join(str(i) for i in row if 3 < i < 256000) for row in outputs]


class _Model:
    def __init__(self, rows):
        self.config = MagicMock(model_type="m2m_100")
        self.rows = rows
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return _torch().tensor(self.rows)


def _translator(lengths, rows):
    model = _Model(rows)
    translator = Seq2SeqTranslator(
        model=model, tokenizer=_Tokenizer(lengths), src_lang="fra_Latn", tgt_lang="fuv_Latn"
    )
    return translator, model


class TestSeq2SeqTranslator:
    def test_a_short_message_gets_a_budget_proportional_to_its_source(self):
        translator, model = _translator([12], [[2, 256000, 50, 60, 2]])

        translator("Salut, tu viens ce soir ?", max_length=256, num_beams=1, do_sample=False)

        call = model.calls[0]
        assert call["max_new_tokens"] == generation_budget(12)
        assert "max_length" not in call
        assert [type(c) for c in call["stopping_criteria"]] == [RepetitionLoopStop]

    def test_the_caller_max_length_stays_a_ceiling(self):
        translator, model = _translator([120], [[2, 256000, 50, 2]])

        translator("x", max_length=100)

        assert model.calls[0]["max_new_tokens"] == 100

    def test_a_batch_is_budgeted_on_its_longest_source(self):
        translator, model = _translator([5, 30, 12], [[2, 256000, 50, 2]] * 3)

        translator(["a", "b", "c"])

        assert model.calls[0]["max_new_tokens"] == generation_budget(30)

    def test_a_looping_row_is_decoded_with_a_single_copy_of_its_block(self):
        looping = [2, 256000, 40, 50, 60, 50, 60, 50, 60, 50, 60]
        clean = [2, 256000, 70, 80, 2, 1, 1, 1, 1, 1, 1]
        translator, _ = _translator([6, 6], [looping, clean])

        results = translator(["a", "b"])

        assert [r["translation_text"] for r in results] == ["40 50 60", "70 80"]

    def test_a_cut_generation_is_logged(self, caplog):
        translator, _ = _translator([6], [[2, 256000, 40, 50, 60, 50, 60, 50, 60, 50, 60]])

        with caplog.at_level("WARNING"):
            translator("a")

        assert "#9309" in caplog.text

    def test_a_real_m2m100_generate_honours_the_budget_and_the_loop_stop(self):
        _torch()
        transformers = pytest.importorskip("transformers")
        if isinstance(transformers, MagicMock):
            pytest.skip("transformers est simulé dans cet environnement")
        _torch().manual_seed(0)
        config = transformers.M2M100Config(
            vocab_size=32, d_model=16, encoder_layers=1, decoder_layers=1,
            encoder_attention_heads=2, decoder_attention_heads=2,
            encoder_ffn_dim=32, decoder_ffn_dim=32, max_position_embeddings=512,
            pad_token_id=1, bos_token_id=0, eos_token_id=2, decoder_start_token_id=2,
        )
        model = transformers.M2M100ForConditionalGeneration(config).eval()
        model.generation_config.eos_token_id = 31
        tokenizer = _Tokenizer([12])
        tokenizer.convert_tokens_to_ids = lambda token: 30
        translator = Seq2SeqTranslator(
            model=model, tokenizer=tokenizer, src_lang="fra_Latn", tgt_lang="fuv_Latn"
        )
        captured = []
        generate = model.generate
        model.generate = lambda **kwargs: captured.append(generate(**kwargs)) or captured[-1]

        translator("Salut", max_length=256)

        produced = captured[0].shape[-1] - 1
        assert produced <= generation_budget(12)
        _, outcome = settle_generation(captured[0][0].tolist(), generation_budget(12), 1)
        assert outcome.looped or outcome.hit_budget

    def test_an_explicit_generation_argument_still_wins(self):
        translator, model = _translator([12], [[2, 256000, 50, 2]])

        translator("a", max_new_tokens=8)

        assert model.calls[0]["max_new_tokens"] == 8
