"""Scores de qualité : chrF (sacrebleu) et COMET quand il est installé."""

from collections.abc import Callable, Sequence
from typing import Any

import sacrebleu


DEFAULT_COMET_MODEL = "Unbabel/wmt22-comet-da"


def chrf(hypotheses: Sequence[str], references: Sequence[str]) -> float:
    return sacrebleu.corpus_chrf(list(hypotheses), [list(references)]).score


def _load_comet(model_name: str) -> Any:
    from comet import download_model, load_from_checkpoint

    return load_from_checkpoint(download_model(model_name))


class CometScorer:
    def __init__(
        self,
        model_name: str = DEFAULT_COMET_MODEL,
        load: Callable[[str], Any] = _load_comet,
        batch_size: int = 8,
    ):
        self.model_name = model_name
        self._load = load
        self._batch_size = batch_size
        self._model: Any | None = None

    def score(
        self, sources: Sequence[str], hypotheses: Sequence[str], references: Sequence[str]
    ) -> float:
        if self._model is None:
            self._model = self._load(self.model_name)
        samples = [
            {"src": source, "mt": hypothesis, "ref": reference}
            for source, hypothesis, reference in zip(sources, hypotheses, references, strict=False)
        ]
        return float(self._model.predict(samples, batch_size=self._batch_size, gpus=0).system_score)
