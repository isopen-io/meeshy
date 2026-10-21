"""Banc de mesure de la traduction (#3662) : jeu doré, latence, scores, porte."""

import json
from pathlib import Path

import pytest

from src.benchmark.__main__ import main
from src.benchmark.engines import DeviceEngineTranslator, NllbTranslator, OpenAICompatibleTranslator
from src.benchmark.gate import find_regressions
from src.benchmark.golden import GoldenPair, GoldenSetError, flores_pairs, load_golden
from src.benchmark.latency import summarize_latencies
from src.benchmark.report import render_markdown, report_from_dict, report_to_dict
from src.benchmark.runner import run_benchmark
from src.benchmark.scoring import CometScorer, chrf
from utils.generation_guard import GenerationOutcome, RepetitionLoopStop, generation_budget


SHIPPED_GOLDEN = Path(__file__).parent.parent / "src" / "benchmark" / "golden" / "meeshy-chat.jsonl"


def make_pair(**overrides):
    fields = {
        "id": "p1",
        "source_lang": "fr",
        "target_lang": "en",
        "source": "Bonjour, tu viens ce soir ?",
        "reference": "Hi, are you coming tonight?",
        "origin": "test",
    }
    return GoldenPair(**{**fields, **overrides})


def write_jsonl(path, rows):
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n")
    return path


def write_flores(root, codes, lines=20, split="devtest"):
    folder = root / split
    folder.mkdir(parents=True)
    for code in codes:
        (folder / f"{code}.{split}").write_text(
            "\n".join(f"{code} phrase {i}" for i in range(lines)) + "\n"
        )
    return root


class FakeTranslator:
    def __init__(self, name="fake", answers=None, failing=()):
        self.name = name
        self.answers = answers or {}
        self.failing = set(failing)

    def translate(self, text, source_lang, target_lang):
        if text in self.failing:
            raise RuntimeError("panne du moteur")
        return self.answers.get(text, text)


class SlowFirstCallTranslator(FakeTranslator):
    def __init__(self, clock, load_seconds):
        super().__init__()
        self.clock = clock
        self.load_seconds = load_seconds
        self.loaded = False

    def translate(self, text, source_lang, target_lang):
        if not self.loaded:
            self.clock.now += self.load_seconds
            self.loaded = True
        return super().translate(text, source_lang, target_lang)


class ReportingTranslator(FakeTranslator):
    def __init__(self, outcomes, **kwargs):
        super().__init__(**kwargs)
        self.outcomes = outcomes
        self.last_generation = None

    def translate(self, text, source_lang, target_lang):
        self.last_generation = self.outcomes.get(text)
        return super().translate(text, source_lang, target_lang)


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def tolist(self):
        return self.rows


def make_nllb_engine(rows, generate_calls, source_tokens=3):
    class FakeTokenizer:
        src_lang = None
        pad_token_id = 1

        def __call__(self, text, **kwargs):
            return {"input_ids": [text, self.src_lang], "attention_mask": _Rows([[1] * source_tokens])}

        def convert_tokens_to_ids(self, token):
            return f"id:{token}"

        def batch_decode(self, outputs, skip_special_tokens):
            return [" ".join(str(i) for i in row if i > 9) for row in outputs]

    class FakeModel:
        def generate(self, **kwargs):
            generate_calls.append(kwargs)
            return _Rows(rows)

    loads = []

    def load(model_id):
        loads.append(model_id)
        return FakeTokenizer(), FakeModel()

    return NllbTranslator(model_id="facebook/nllb-200-distilled-600M", load=load), loads


class TickingClock:
    def __init__(self, step_seconds):
        self.step = step_seconds
        self.now = 0.0

    def __call__(self):
        self.now += self.step
        return self.now


class TestGoldenSet:
    def test_load_golden_reads_every_line_as_a_pair(self, tmp_path):
        path = write_jsonl(
            tmp_path / "set.jsonl",
            [
                {
                    "id": "a",
                    "source_lang": "fr",
                    "target_lang": "en",
                    "source": "Salut",
                    "reference": "Hi",
                    "origin": "x",
                },
                {
                    "id": "b",
                    "source_lang": "en",
                    "target_lang": "fr",
                    "source": "Hi",
                    "reference": "Salut",
                    "origin": "x",
                },
            ],
        )

        pairs = load_golden(path)

        assert [p.id for p in pairs] == ["a", "b"]
        assert pairs[1] == GoldenPair("b", "en", "fr", "Hi", "Salut", "x")

    def test_load_golden_names_the_line_of_a_missing_field(self, tmp_path):
        path = write_jsonl(
            tmp_path / "set.jsonl",
            [
                {
                    "id": "a",
                    "source_lang": "fr",
                    "target_lang": "en",
                    "source": "Salut",
                    "origin": "x",
                }
            ],
        )

        with pytest.raises(GoldenSetError, match=r"ligne 1.*reference"):
            load_golden(path)

    def test_load_golden_refuses_a_duplicated_id(self, tmp_path):
        row = {
            "id": "a",
            "source_lang": "fr",
            "target_lang": "en",
            "source": "S",
            "reference": "R",
            "origin": "x",
        }
        path = write_jsonl(tmp_path / "set.jsonl", [row, row])

        with pytest.raises(GoldenSetError, match="a"):
            load_golden(path)

    def test_load_golden_refuses_an_empty_text(self, tmp_path):
        path = write_jsonl(
            tmp_path / "set.jsonl",
            [
                {
                    "id": "a",
                    "source_lang": "fr",
                    "target_lang": "en",
                    "source": "  ",
                    "reference": "R",
                    "origin": "x",
                }
            ],
        )

        with pytest.raises(GoldenSetError, match="source"):
            load_golden(path)

    def test_the_shipped_chat_set_is_valid_and_covers_both_directions(self):
        pairs = load_golden(SHIPPED_GOLDEN)

        directions = {(p.source_lang, p.target_lang) for p in pairs}
        assert directions == {("fr", "en"), ("en", "fr")}
        assert len(pairs) >= 20


class TestFloresPairs:
    def test_every_language_is_paired_both_ways_with_every_pivot(self, tmp_path):
        root = write_flores(tmp_path, ["fra_Latn", "eng_Latn", "swh_Latn"])

        pairs = flores_pairs(
            root, pivots=("fr", "en"), languages=("sw",), sentences=1, paragraphs=0
        )

        directions = {(p.source_lang, p.target_lang) for p in pairs}
        assert directions == {
            ("fr", "en"),
            ("en", "fr"),
            ("fr", "sw"),
            ("sw", "fr"),
            ("en", "sw"),
            ("sw", "en"),
        }

    def test_sentences_are_spread_across_the_file_and_aligned(self, tmp_path):
        root = write_flores(tmp_path, ["fra_Latn", "eng_Latn"], lines=20)

        pairs = flores_pairs(root, pivots=("fr",), languages=("en",), sentences=4, paragraphs=0)
        fr_to_en = [p for p in pairs if p.source_lang == "fr"]

        assert [p.source for p in fr_to_en] == [f"fra_Latn phrase {i}" for i in (0, 5, 10, 15)]
        assert [p.reference for p in fr_to_en] == [f"eng_Latn phrase {i}" for i in (0, 5, 10, 15)]

    def test_a_paragraph_joins_four_consecutive_sentences(self, tmp_path):
        root = write_flores(tmp_path, ["fra_Latn", "eng_Latn"], lines=20)

        pairs = flores_pairs(root, pivots=("fr",), languages=("en",), sentences=0, paragraphs=1)
        paragraph = next(p for p in pairs if p.source_lang == "fr")

        assert paragraph.source == " ".join(f"fra_Latn phrase {i}" for i in range(4))
        assert paragraph.origin == "flores200-devtest"

    def test_ids_are_unique(self, tmp_path):
        root = write_flores(tmp_path, ["fra_Latn", "eng_Latn"], lines=20)

        pairs = flores_pairs(root, pivots=("fr",), languages=("en",), sentences=3, paragraphs=2)

        assert len({p.id for p in pairs}) == len(pairs) == 10

    def test_a_language_without_flores_code_is_refused_by_name(self, tmp_path):
        root = write_flores(tmp_path, ["fra_Latn"])

        with pytest.raises(GoldenSetError, match="ewo"):
            flores_pairs(root, pivots=("fr",), languages=("ewo",), sentences=1, paragraphs=0)

    def test_a_missing_flores_file_is_refused_with_its_path(self, tmp_path):
        root = write_flores(tmp_path, ["fra_Latn"])

        with pytest.raises(GoldenSetError, match="eng_Latn.devtest"):
            flores_pairs(root, pivots=("fr",), languages=("en",), sentences=1, paragraphs=0)


class TestLatency:
    def test_percentiles_use_the_nearest_rank(self):
        summary = summarize_latencies([float(v) for v in range(1, 21)])

        assert (summary.count, summary.p50_ms, summary.p95_ms) == (20, 10.0, 19.0)

    def test_order_does_not_matter(self):
        assert summarize_latencies([30.0, 10.0, 20.0]) == summarize_latencies([10.0, 20.0, 30.0])

    def test_no_measure_gives_no_percentile(self):
        summary = summarize_latencies([])

        assert (summary.count, summary.p50_ms, summary.p95_ms) == (0, None, None)


class TestScoring:
    def test_chrf_is_perfect_on_identical_text_and_lower_otherwise(self):
        perfect = chrf(["the cat sat on the mat"], ["the cat sat on the mat"])
        partial = chrf(["the dog sat on a rug"], ["the cat sat on the mat"])

        assert perfect == pytest.approx(100.0)
        assert 0.0 < partial < perfect

    def test_comet_scores_triplets_with_the_loaded_model(self):
        calls = []

        class FakeComet:
            def predict(self, samples, batch_size, gpus):
                calls.append((samples, batch_size, gpus))
                return type("Output", (), {"system_score": 0.83})()

        scorer = CometScorer(model_name="m", load=lambda name: FakeComet(), batch_size=4)

        score = scorer.score(["Salut"], ["Hi"], ["Hello"])

        assert score == pytest.approx(0.83)
        assert calls == [([{"src": "Salut", "mt": "Hi", "ref": "Hello"}], 4, 0)]


class TestEngines:
    def test_openai_compatible_engine_posts_a_deterministic_chat_request(self):
        requests = []

        def post(url, payload):
            requests.append((url, payload))
            return {"choices": [{"message": {"content": "  Hi, are you coming tonight?\n"}}]}

        engine = OpenAICompatibleTranslator(
            base_url="http://localhost:8080/", model="translategemma-4b", post=post
        )

        result = engine.translate("Bonjour, tu viens ce soir ?", "fr", "en")

        assert result == "Hi, are you coming tonight?"
        url, payload = requests[0]
        assert url == "http://localhost:8080/v1/chat/completions"
        assert payload["model"] == "translategemma-4b"
        assert payload["temperature"] == 0
        prompt = payload["messages"][0]["content"]
        assert "French" in prompt and "English" in prompt
        assert prompt.endswith("Bonjour, tu viens ce soir ?")
        assert engine.name == "openai:translategemma-4b"

    def test_openai_compatible_engine_falls_back_to_the_code_for_an_unnamed_language(self):
        prompts = []

        def post(url, payload):
            prompts.append(payload["messages"][0]["content"])
            return {"choices": [{"message": {"content": "x"}}]}

        OpenAICompatibleTranslator(base_url="http://h", model="m", post=post).translate(
            "Mbolo", "ewo", "fr"
        )

        assert "(ewo)" in prompts[0]

    def test_openai_compatible_engine_drops_a_reasoning_block(self):
        def post(url, payload):
            return {"choices": [{"message": {"content": "<think>\nbref\n</think>\n\nHabari za jioni"}}]}

        result = OpenAICompatibleTranslator(base_url="http://h", model="m", post=post).translate(
            "Good evening", "en", "sw"
        )

        assert result == "Habari za jioni"

    def test_device_engine_posts_the_pair_to_the_client_engine_server(self):
        requests = []

        def post(url, payload):
            requests.append((url, payload))
            return {"text": "Bonsoir"}

        engine = DeviceEngineTranslator(base_url="http://localhost:8790/", name="nllb-q8", post=post)

        assert engine.translate("Good evening", "en", "fr") == "Bonsoir"
        assert requests == [
            (
                "http://localhost:8790/translate",
                {"text": "Good evening", "source": "en", "target": "fr"},
            )
        ]
        assert engine.name == "device:nllb-q8"

    def test_device_engine_reports_a_refusal_as_a_failure(self):
        def post(url, payload):
            return {"error": "NLLB n'a pas de code pour ewo"}

        engine = DeviceEngineTranslator(base_url="http://h", name="nllb-q8", post=post)

        with pytest.raises(RuntimeError, match="ewo"):
            engine.translate("Mbolo", "ewo", "fr")

    def test_nllb_engine_forces_the_target_code_and_decodes_greedily(self):
        generate_calls = []
        engine, loads = make_nllb_engine([[2, 9, 40, 41, 2]], generate_calls)

        first = engine.translate("Salut", "fr", "sw")
        engine.translate("Salut", "fr", "sw")

        assert first == "40 41"
        assert loads == ["facebook/nllb-200-distilled-600M"]
        call = generate_calls[0]
        assert call["input_ids"] == ["Salut", "fra_Latn"]
        assert call["forced_bos_token_id"] == "id:swh_Latn"
        assert (call["num_beams"], call["do_sample"]) == (1, False)
        assert engine.name == "nllb:facebook/nllb-200-distilled-600M"

    def test_nllb_engine_generates_with_the_production_bounds(self):
        generate_calls = []
        engine, _ = make_nllb_engine([[2, 9, 40, 2]], generate_calls, source_tokens=12)

        engine.translate("Salut", "fr", "ff")

        call = generate_calls[0]
        assert "max_length" not in call
        assert call["max_new_tokens"] == generation_budget(12)
        assert [type(c) for c in call["stopping_criteria"]] == [RepetitionLoopStop]

    def test_nllb_engine_reports_what_each_generation_produced(self):
        looping = [2, 9, 40, 50, 40, 50, 40, 50, 40, 50]
        engine, _ = make_nllb_engine([looping], [], source_tokens=12)

        text = engine.translate("Salut", "fr", "wo")

        assert text == "40 50"
        assert engine.last_generation == GenerationOutcome(
            generated_tokens=9, budget=generation_budget(12), looped=True
        )

    def test_nllb_engine_refuses_a_language_it_cannot_name(self):
        engine = NllbTranslator(
            model_id="m", load=lambda model_id: pytest.fail("ne doit pas charger")
        )

        with pytest.raises(ValueError, match="ewo"):
            engine.translate("Mbolo", "ewo", "fr")


class TestRunner:
    def test_each_direction_gets_its_own_scores_in_first_seen_order(self):
        pairs = (
            make_pair(id="1", source_lang="fr", target_lang="en", source="Salut", reference="Hi"),
            make_pair(id="2", source_lang="en", target_lang="fr", source="Hi", reference="Salut"),
        )
        translator = FakeTranslator(answers={"Salut": "Hi", "Hi": "Bonjour"})

        report = run_benchmark(translator, pairs)

        assert report.engine == "fake"
        assert [(d.source_lang, d.target_lang) for d in report.directions] == [
            ("fr", "en"),
            ("en", "fr"),
        ]
        assert report.directions[0].chrf == pytest.approx(100.0)
        assert report.directions[1].chrf < 100.0
        assert report.directions[0].comet is None

    def test_latency_is_split_between_short_messages_and_paragraphs(self):
        pairs = (
            make_pair(id="s", source="court"),
            make_pair(id="m", source="m" * 250),
            make_pair(id="l", source="l" * 450),
        )

        report = run_benchmark(FakeTranslator(), pairs, clock=TickingClock(0.5))
        direction = report.directions[0]

        assert direction.segments == 3
        assert (direction.short.count, direction.short.p50_ms) == (1, 500.0)
        assert (direction.long.count, direction.long.p50_ms) == (1, 500.0)

    def test_the_engine_loads_before_the_clock_starts(self):
        clock = TickingClock(0.5)
        translator = SlowFirstCallTranslator(clock, load_seconds=30.0)
        pairs = (make_pair(id="1", source="Salut"), make_pair(id="2", source="Merci"))

        report = run_benchmark(translator, pairs, clock=clock)
        direction = report.directions[0]

        assert (direction.short.count, direction.short.p95_ms) == (2, 500.0)

    def test_a_failing_warm_up_does_not_stop_the_run(self):
        pairs = (make_pair(id="1", source="Merci"), make_pair(id="2", source="Salut"))

        report = run_benchmark(FakeTranslator(failing={"Merci"}), pairs)

        assert report.directions[0].failures == 1

    def test_an_engine_failure_counts_and_scores_as_an_empty_translation(self):
        pairs = (
            make_pair(id="1", source="Salut", reference="Hi"),
            make_pair(id="2", source="Merci", reference="Thanks"),
        )

        report = run_benchmark(FakeTranslator(answers={"Salut": "Hi"}, failing={"Merci"}), pairs)
        direction = report.directions[0]

        assert direction.failures == 1
        assert direction.short.count == 1
        assert direction.chrf < 100.0

    def test_the_longest_output_and_its_ratio_to_the_source_are_recorded(self):
        pairs = (
            make_pair(id="1", source="Salut", reference="Hi"),
            make_pair(id="2", source="Merci", reference="Thanks"),
        )
        translator = FakeTranslator(answers={"Salut": "Hi there", "Merci": "Thanks"})

        direction = run_benchmark(translator, pairs).directions[0]

        assert direction.output_chars_max == 8
        assert direction.output_ratio_max == pytest.approx(1.6)
        assert (direction.budget_hits, direction.loop_stops) == (None, None)

    def test_generations_cut_by_the_budget_or_a_loop_are_counted(self):
        pairs = (
            make_pair(id="1", source="Salut"),
            make_pair(id="2", source="Merci"),
            make_pair(id="3", source="Bonsoir"),
        )
        translator = ReportingTranslator(
            {
                "Salut": GenerationOutcome(generated_tokens=40, budget=40, looped=False),
                "Merci": GenerationOutcome(generated_tokens=12, budget=40, looped=True),
                "Bonsoir": GenerationOutcome(generated_tokens=5, budget=40, looped=False),
            }
        )

        direction = run_benchmark(translator, pairs).directions[0]

        assert (direction.budget_hits, direction.loop_stops) == (1, 1)

    def test_a_failed_segment_counts_no_output(self):
        pairs = (make_pair(id="1", source="Salut"),)

        direction = run_benchmark(FakeTranslator(failing={"Salut"}), pairs).directions[0]

        assert (direction.output_chars_max, direction.output_ratio_max) == (None, None)

    def test_comet_is_computed_per_direction_when_a_scorer_is_given(self):
        seen = []

        class FakeScorer:
            def score(self, sources, hypotheses, references):
                seen.append((sources, hypotheses, references))
                return 0.9

        report = run_benchmark(
            FakeTranslator(answers={"Salut": "Hi"}),
            (make_pair(source="Salut", reference="Hi"),),
            comet=FakeScorer(),
        )

        assert report.directions[0].comet == pytest.approx(0.9)
        assert seen == [(["Salut"], ["Hi"], ["Hi"])]


def make_report(engine="nllb", **direction_overrides):
    pairs = (make_pair(id="1", source="Salut", reference="Hi"),)
    report = run_benchmark(
        FakeTranslator(name=engine, answers={"Salut": "Hi"}), pairs, clock=TickingClock(0.2)
    )
    data = report_to_dict(report)
    data["directions"][0].update(direction_overrides)
    return report_from_dict(data)


class TestGate:
    def test_an_identical_run_has_no_regression(self):
        assert find_regressions(make_report(), make_report()) == ()

    def test_a_chrf_drop_beyond_tolerance_is_a_regression(self):
        regressions = find_regressions(
            make_report(chrf=97.0), make_report(chrf=99.0), chrf_tolerance=1.0
        )

        assert [(r.direction, r.metric) for r in regressions] == [("fr→en", "chrf")]

    def test_a_chrf_drop_within_tolerance_passes(self):
        assert (
            find_regressions(make_report(chrf=98.5), make_report(chrf=99.0), chrf_tolerance=1.0)
            == ()
        )

    def test_a_comet_drop_is_a_regression_only_when_both_runs_measured_it(self):
        assert (
            find_regressions(make_report(comet=0.70), make_report(comet=0.80))[0].metric == "comet"
        )
        assert find_regressions(make_report(comet=None), make_report(comet=0.80)) == ()

    def test_new_failures_are_a_regression(self):
        regressions = find_regressions(make_report(failures=2), make_report(failures=0))

        assert [r.metric for r in regressions] == ["failures"]

    def test_a_direction_missing_from_the_current_run_is_a_regression(self):
        baseline = report_to_dict(make_report())
        baseline["directions"].append(
            {**baseline["directions"][0], "source_lang": "fr", "target_lang": "sw"}
        )

        regressions = find_regressions(make_report(), report_from_dict(baseline))

        assert [(r.direction, r.metric) for r in regressions] == [("fr→sw", "missing")]

    def test_latency_is_gated_only_when_a_tolerance_is_given(self):
        slower = make_report(short={"count": 1, "p50_ms": 400.0, "p95_ms": 400.0})

        assert find_regressions(slower, make_report()) == ()
        assert [
            r.metric for r in find_regressions(slower, make_report(), latency_tolerance=0.5)
        ] == ["short_p95_ms"]


class TestReport:
    def test_a_report_survives_a_json_round_trip(self):
        report = make_report(comet=0.81)

        assert report_from_dict(json.loads(json.dumps(report_to_dict(report)))) == report

    def test_markdown_lists_one_row_per_direction(self):
        markdown = render_markdown(make_report(chrf=61.234, comet=0.8123))

        assert "nllb" in markdown
        assert "| fr→en | 1 | 61.2 | 0.812 | 200 | 200 | — | — | 0 | 2 | 0.40 | — | — |" in markdown

    def test_a_baseline_written_before_output_lengths_still_loads(self):
        data = report_to_dict(make_report())
        for field in ("output_chars_max", "output_ratio_max", "budget_hits", "loop_stops"):
            del data["directions"][0][field]

        direction = report_from_dict(data).directions[0]

        assert (direction.output_chars_max, direction.budget_hits) == (None, None)

    def test_markdown_shows_the_generations_that_were_cut(self):
        markdown = render_markdown(make_report(budget_hits=2, loop_stops=1))

        assert "| au budget | boucles |" in markdown
        assert "| 2 | 1 |" in markdown


class TestCommandLine:
    def test_run_measures_the_golden_set_and_writes_json_and_markdown(self, tmp_path):
        golden = write_jsonl(
            tmp_path / "set.jsonl",
            [
                {
                    "id": "a",
                    "source_lang": "fr",
                    "target_lang": "en",
                    "source": "Salut",
                    "reference": "Hi",
                    "origin": "x",
                }
            ],
        )
        out = tmp_path / "report.json"
        summary = tmp_path / "report.md"
        built = []

        def build(args):
            built.append((args.engine, args.model))
            return FakeTranslator(name="fake", answers={"Salut": "Hi"})

        code = main(
            [
                "run",
                "--engine",
                "nllb",
                "--model",
                "m",
                "--golden",
                str(golden),
                "--out",
                str(out),
                "--markdown",
                str(summary),
            ],
            engines={"nllb": build},
        )

        assert code == 0
        assert built == [("nllb", "m")]
        report = report_from_dict(json.loads(out.read_text()))
        assert report.directions[0].chrf == pytest.approx(100.0)
        assert "| fr→en |" in summary.read_text()

    def test_run_refuses_to_start_without_any_pair(self, tmp_path, capsys):
        code = main(
            ["run", "--engine", "nllb", "--out", str(tmp_path / "r.json")],
            engines={"nllb": lambda args: FakeTranslator()},
        )

        assert code == 2
        assert "aucune paire" in capsys.readouterr().err

    def test_gate_fails_on_a_regression_and_names_it(self, tmp_path, capsys):
        current = tmp_path / "current.json"
        baseline = tmp_path / "baseline.json"
        current.write_text(json.dumps(report_to_dict(make_report(chrf=80.0))))
        baseline.write_text(json.dumps(report_to_dict(make_report(chrf=90.0))))

        code = main(["gate", "--current", str(current), "--baseline", str(baseline)])

        assert code == 1
        assert "fr→en" in capsys.readouterr().out

    def test_gate_passes_without_baseline_and_says_so(self, tmp_path, capsys):
        current = tmp_path / "current.json"
        current.write_text(json.dumps(report_to_dict(make_report())))

        code = main(
            ["gate", "--current", str(current), "--baseline", str(tmp_path / "absent.json")]
        )

        assert code == 0
        assert "aucune référence" in capsys.readouterr().out

    def test_run_fails_when_the_engine_translated_nothing(self, tmp_path, capsys):
        golden = write_jsonl(
            tmp_path / "set.jsonl",
            [
                {
                    "id": "a",
                    "source_lang": "fr",
                    "target_lang": "en",
                    "source": "Salut",
                    "reference": "Hi",
                    "origin": "x",
                }
            ],
        )

        code = main(
            ["run", "--engine", "nllb", "--golden", str(golden), "--out", str(tmp_path / "r.json")],
            engines={"nllb": lambda args: FakeTranslator(failing={"Salut"})},
        )

        assert code == 1
        assert "aucune traduction" in capsys.readouterr().err
        assert (tmp_path / "r.json").is_file()
