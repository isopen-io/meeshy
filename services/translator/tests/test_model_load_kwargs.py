"""
TDD — Construction des kwargs de chargement de modèle NLLB.

Régression prod (2026-06-21) : `low_cpu_mem_usage=True` charge le modèle via le
device `meta` puis matérialise les poids. Sous pression mémoire, des poids
restaient sur `meta` → `RuntimeError: Tensor on device cpu is not on the expected
device meta!` au moment de `generate()` → traductions renvoyées en
`[ML-Pipeline-Error]` puis rejetées par la gateway.

Sur CPU on n'utilise plus `low_cpu_mem_usage` (aucun bénéfice CPU réel, et c'est
la source des poids `meta`). Sur GPU on garde `device_map="auto"` +
`low_cpu_mem_usage` (le chargement meta via accelerate y est correct).
"""
from services.translation_ml.model_loader import build_model_load_kwargs


def test_cpu_kwargs_avoid_meta_device():
    kw = build_model_load_kwargs("cpu", "float32", "/cache")
    # Pas de low_cpu_mem_usage sur CPU (évite les poids restés sur `meta`)
    assert kw.get("low_cpu_mem_usage", False) is False
    # Pas de device_map sur CPU
    assert kw.get("device_map") is None
    # Les bases restent présentes
    assert kw["cache_dir"] == "/cache"
    assert kw["torch_dtype"] == "float32"


def test_cuda_kwargs_use_device_map_and_low_cpu_mem():
    kw = build_model_load_kwargs("cuda", "float16", "/cache")
    assert kw.get("device_map") == "auto"
    assert kw.get("low_cpu_mem_usage") is True
    assert kw["torch_dtype"] == "float16"
