"""Ligne de commande du banc : `run` mesure un moteur, `gate` compare à la référence.

    cd services/translator/src
    python -m benchmark run --engine nllb --model facebook/nllb-200-distilled-600M \\
        --flores-dir /data/flores200_dataset --languages fr,en,sw --out report.json
    python -m benchmark gate --current report.json --baseline benchmark/baselines/<moteur>.json
"""

import argparse
import json
import logging
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from .engines import DeviceEngineTranslator, NllbTranslator, OpenAICompatibleTranslator, Translator
from .gate import find_regressions
from .golden import GoldenSetError, flores_pairs, load_golden
from .report import render_markdown, report_from_dict, report_to_dict
from .runner import run_benchmark
from .scoring import CometScorer


EngineFactory = Callable[[argparse.Namespace], Translator]

DEFAULT_ENGINES: Mapping[str, EngineFactory] = {
    "nllb": lambda args: NllbTranslator(model_id=args.model),
    "openai": lambda args: OpenAICompatibleTranslator(base_url=args.base_url, model=args.model),
    "device": lambda args: DeviceEngineTranslator(base_url=args.base_url, name=args.model),
}


def _codes(value: str) -> tuple[str, ...]:
    return tuple(code.strip() for code in value.split(",") if code.strip())


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m benchmark")
    commands = parser.add_subparsers(dest="command", required=True)

    run = commands.add_parser("run", help="mesure un moteur sur le jeu doré")
    run.add_argument("--engine", choices=sorted(DEFAULT_ENGINES), required=True)
    run.add_argument("--model", default="facebook/nllb-200-distilled-600M")
    run.add_argument("--base-url", default="http://localhost:8080")
    run.add_argument("--golden", type=Path, action="append", default=[])
    run.add_argument("--flores-dir", type=Path)
    run.add_argument("--flores-split", default="devtest")
    run.add_argument("--languages", type=_codes, default=_codes("fr,en"))
    run.add_argument("--pivots", type=_codes, default=_codes("fr,en"))
    run.add_argument("--sentences", type=int, default=6)
    run.add_argument("--paragraphs", type=int, default=1)
    run.add_argument("--comet-model")
    run.add_argument("--out", type=Path, required=True)
    run.add_argument("--markdown", type=Path)

    gate = commands.add_parser("gate", help="refuse une régression face à la référence")
    gate.add_argument("--current", type=Path, required=True)
    gate.add_argument("--baseline", type=Path, required=True)
    gate.add_argument("--chrf-tolerance", type=float, default=1.0)
    gate.add_argument("--comet-tolerance", type=float, default=0.01)
    gate.add_argument("--latency-tolerance", type=float)
    return parser


def _pairs(args: argparse.Namespace) -> tuple:
    golden = tuple(pair for path in args.golden for pair in load_golden(path))
    if args.flores_dir is None:
        return golden
    flores = flores_pairs(
        args.flores_dir,
        pivots=args.pivots,
        languages=args.languages,
        sentences=args.sentences,
        paragraphs=args.paragraphs,
        split=args.flores_split,
    )
    return golden + flores


def _run(args: argparse.Namespace, engines: Mapping[str, EngineFactory]) -> int:
    try:
        pairs = _pairs(args)
    except GoldenSetError as error:
        print(f"[BENCHMARK] jeu doré invalide : {error}", file=sys.stderr)
        return 2
    if not pairs:
        print(
            "[BENCHMARK] aucune paire à mesurer : passer --golden ou --flores-dir", file=sys.stderr
        )
        return 2
    comet = CometScorer(model_name=args.comet_model) if args.comet_model else None
    report = run_benchmark(engines[args.engine](args), pairs, comet=comet)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report_to_dict(report), indent=2, ensure_ascii=False) + "\n")
    markdown = render_markdown(report)
    if args.markdown:
        args.markdown.write_text(markdown)
    print(markdown)
    if all(direction.failures == direction.segments for direction in report.directions):
        print(
            "[BENCHMARK] aucune traduction produite : le moteur a échoué sur chaque paire",
            file=sys.stderr,
        )
        return 1
    return 0


def _gate(args: argparse.Namespace) -> int:
    if not args.baseline.is_file():
        print(f"[BENCHMARK] aucune référence à {args.baseline} : porte non appliquée")
        return 0
    regressions = find_regressions(
        report_from_dict(json.loads(args.current.read_text())),
        report_from_dict(json.loads(args.baseline.read_text())),
        chrf_tolerance=args.chrf_tolerance,
        comet_tolerance=args.comet_tolerance,
        latency_tolerance=args.latency_tolerance,
    )
    for regression in regressions:
        print(
            f"[BENCHMARK] régression {regression.direction} {regression.metric} : {regression.baseline} → {regression.current}"
        )
    if regressions:
        return 1
    print("[BENCHMARK] aucune régression face à la référence")
    return 0


def main(
    argv: Sequence[str] | None = None, engines: Mapping[str, EngineFactory] = DEFAULT_ENGINES
) -> int:
    args = _parser().parse_args(argv)
    if args.command == "run":
        return _run(args, engines)
    return _gate(args)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    sys.exit(main())
