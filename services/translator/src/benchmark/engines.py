"""Moteurs mesurés : NLLB (production actuelle), tout serveur compatible OpenAI, et le
moteur des clients.

Le second adaptateur sert à la fois llama.cpp (`llama-server`, chemin CPU) et vLLM
(chemin GPU) : un candidat se mesure avec le même code sur les deux matériels.

Le troisième mesure le moteur que le web et la coque Android exécutent sur l'appareil
(#9897) : `apps/web/scripts/device-translation-bench-server.ts` sert le code même de
`apps/web/src/lib/device-translation`, avec les poids que les clients téléchargent.
"""

import re
from collections.abc import Callable, Mapping
from typing import Any, Protocol

from config.settings import LANGUAGE_MAPPINGS
from utils.generation_guard import GenerationOutcome, greedy_generation_kwargs, settle_generation


LANGUAGE_NAMES = {
    "fr": "French",
    "en": "English",
    "pt": "Portuguese",
    "ar": "Arabic",
    "es": "Spanish",
    "de": "German",
    "sw": "Swahili",
    "ha": "Hausa",
    "yo": "Yoruba",
    "ig": "Igbo",
    "wo": "Wolof",
    "ln": "Lingala",
    "ff": "Fula",
    "am": "Amharic",
    "zu": "Zulu",
    "bas": "Basaa",
    "dua": "Duala",
    "ewo": "Ewondo",
    "fan": "Fang",
    "ksf": "Bafia",
    "nnh": "Ngiemboon",
    "byv": "Medumba",
}

NLLB_MAX_TOKENS = 256

REASONING_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL)


class Translator(Protocol):
    name: str

    def translate(self, text: str, source_lang: str, target_lang: str) -> str: ...


def _language_label(code: str) -> str:
    name = LANGUAGE_NAMES.get(code)
    return f"{name} ({code})" if name else f"({code})"


def translation_prompt(text: str, source_lang: str, target_lang: str) -> str:
    source = _language_label(source_lang)
    target = _language_label(target_lang)
    return (
        f"You are a professional {source} to {target} translator. Your goal is to accurately "
        f"convey the meaning and nuances of the original text while adhering to the target "
        f"language grammar, vocabulary, and cultural sensitivities.\n"
        f"Produce only the translation, without any additional explanations or commentary. "
        f"Please translate the following text into {target}:\n\n\n{text}"
    )


def _http_post(url: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
    import httpx

    response = httpx.post(url, json=dict(payload), timeout=300.0)
    response.raise_for_status()
    return response.json()


class OpenAICompatibleTranslator:
    def __init__(
        self,
        base_url: str,
        model: str,
        prompt: Callable[[str, str, str], str] = translation_prompt,
        post: Callable[[str, Mapping[str, Any]], Mapping[str, Any]] = _http_post,
    ):
        self.name = f"openai:{model}"
        self._url = f"{base_url.rstrip('/')}/v1/chat/completions"
        self._model = model
        self._prompt = prompt
        self._post = post

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        payload = {
            "model": self._model,
            "temperature": 0,
            "messages": [{"role": "user", "content": self._prompt(text, source_lang, target_lang)}],
        }
        answer = self._post(self._url, payload)
        content = answer["choices"][0]["message"]["content"]
        return REASONING_BLOCK.sub("", content).strip()


class DeviceEngineTranslator:
    def __init__(
        self,
        base_url: str,
        name: str,
        post: Callable[[str, Mapping[str, Any]], Mapping[str, Any]] = _http_post,
    ):
        self.name = f"device:{name}"
        self._url = f"{base_url.rstrip('/')}/translate"
        self._post = post

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        answer = self._post(self._url, {"text": text, "source": source_lang, "target": target_lang})
        if "error" in answer:
            raise RuntimeError(str(answer["error"]))
        return str(answer["text"])


def _load_nllb(model_id: str) -> tuple[Any, Any]:
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    return AutoTokenizer.from_pretrained(model_id), AutoModelForSeq2SeqLM.from_pretrained(model_id)


class NllbTranslator:
    def __init__(
        self,
        model_id: str,
        load: Callable[[str], tuple[Any, Any]] = _load_nllb,
        codes: Mapping[str, str] = LANGUAGE_MAPPINGS,
    ):
        self.name = f"nllb:{model_id}"
        self._model_id = model_id
        self._load = load
        self._codes = codes
        self._loaded: tuple[Any, Any] | None = None
        self.last_generation: GenerationOutcome | None = None

    def _code(self, language: str) -> str:
        code = self._codes.get(language)
        if code is None:
            raise ValueError(f"NLLB n'a pas de code pour {language}")
        return code

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        source_code = self._code(source_lang)
        target_code = self._code(target_lang)
        if self._loaded is None:
            self._loaded = self._load(self._model_id)
        tokenizer, model = self._loaded
        tokenizer.src_lang = source_code
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=NLLB_MAX_TOKENS)
        source_tokens = sum(inputs["attention_mask"].tolist()[0])
        bounds = greedy_generation_kwargs(source_tokens, ceiling=NLLB_MAX_TOKENS)
        outputs = model.generate(
            **inputs,
            forced_bos_token_id=tokenizer.convert_tokens_to_ids(target_code),
            **bounds,
        )
        kept, self.last_generation = settle_generation(
            outputs.tolist()[0], bounds["max_new_tokens"], tokenizer.pad_token_id
        )
        return tokenizer.batch_decode([kept], skip_special_tokens=True)[0]
