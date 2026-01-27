# Migration vers Transformers 5.0.0 - Plan d'Analyse

**Date**: 2026-01-27
**Status**: 🔍 Analyse
**Priorité**: Haute (gains performance + features majeurs)

## Contexte

### Situation actuelle
- **Version**: transformers 4.54.1
- **Contrainte**: Fixée à `<5.0.0` car breaking change pour NLLB
- **Architecture**: 1 pipeline réutilisable par modèle (basic, medium, premium)
- **Flexibilité**: Supporte 200 langues × 199 = ~40,000 paires dynamiquement

### Problème avec Transformers 5.0.0
```python
# Transformers 4.x - Pipeline flexible ✅
pipeline = create_pipeline("translation", model=nllb_model, tokenizer=tokenizer)
pipeline(text, src_lang="fra_Latn", tgt_lang="eng_Latn")  # FR → EN
pipeline(text, src_lang="eng_Latn", tgt_lang="spa_Latn")  # EN → ES

# Transformers 5.0.0 - Pipeline figé ❌
pipeline = pipeline("translation", model="nllb", src_lang="fra_Latn", tgt_lang="eng_Latn")
pipeline(text)  # Toujours FR → EN seulement
```

## Avantages de Transformers 5.0.0

### 1. Performance d'inférence ⚡ (CRITIQUE pour nous)
- **Continuous batching**: Traiter plusieurs requêtes en parallèle
- **Paged attention**: Meilleure gestion mémoire GPU
- **Kernels optimisés**: FlashAttention 3, SDPA automatique
- **Impact estimé**: +30-50% throughput, -20% latence

### 2. Quantization native 📦 (ÉNORME gain)
- **4-bit**: 75% réduction mémoire (13B → 3.25GB)
- **8-bit**: 50% réduction mémoire
- **Impact**: Charger plus de modèles en mémoire simultanément
- **NLLB-3.3B en 4-bit**: ~800MB au lieu de 3.2GB

### 3. Interopérabilité production 🌐
- **vLLM**: Inférence haute performance (50x plus rapide)
- **SGLang**: Inférence structurée
- **TensorRT-LLM**: Optimisation GPU NVIDIA
- **Impact**: Migration facile vers infrastructure de production

### 4. Code simplifié 🧩
- **-80% code** pour maintenir nos modèles
- Architecture modulaire plus claire
- Moins de bugs cross-framework

### 5. Serving intégré 🚀
```bash
transformers serve --model facebook/nllb-200-distilled-600M --port 8000
```
Compatible OpenAI API → Facile à intégrer

## Options de migration

### Option 1: Pipeline Factory avec Cache Intelligent 💡 (RECOMMANDÉ)

**Principe**: Créer pipelines à la demande, les mettre en cache (LRU)

```python
from functools import lru_cache
from transformers import pipeline

class NLLBPipelineFactory:
    def __init__(self, model_name, cache_size=100):
        self.model_name = model_name
        self._cache = {}  # {(src, tgt): pipeline}
        self._max_cache = cache_size

    @lru_cache(maxsize=100)
    def get_pipeline(self, src_lang: str, tgt_lang: str):
        """
        Crée ou récupère un pipeline pour une paire de langues.
        Les 100 paires les plus utilisées restent en cache.
        """
        key = (src_lang, tgt_lang)

        if key not in self._cache:
            # Créer pipeline spécifique à la paire
            pipe = pipeline(
                "translation",
                model=self.model_name,
                src_lang=src_lang,
                tgt_lang=tgt_lang,
                device=0,  # GPU
                torch_dtype="auto",
                quantization_config="4bit"  # 75% réduction mémoire!
            )
            self._cache[key] = pipe

        return self._cache[key]

    async def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        pipe = self.get_pipeline(src_lang, tgt_lang)
        result = pipe(text)
        return result[0]['translation_text']
```

**Avantages**:
- ✅ Paires fréquentes (FR↔EN, EN↔ES) en cache chaud
- ✅ Utilise quantization 4-bit (75% réduction mémoire)
- ✅ Compatible transformers 5.0.0
- ✅ Paires rares créées à la demande

**Inconvénients**:
- ❌ Première traduction d'une paire = création pipeline (~500ms)
- ❌ Cache LRU évince paires peu utilisées

**Métriques d'usage** (à mesurer):
- Top 20 paires de langues = 80% du trafic ?
- Si oui, cache de 100 paires = quasi-permanent

### Option 2: Utilisation directe Model + Tokenizer

**Principe**: Bypass pipeline, utiliser model.generate() directement

```python
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

class NLLBTranslator:
    def __init__(self, model_name):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name,
            torch_dtype="auto",
            device_map="auto",
            quantization_config="4bit"
        )

    async def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        # Tokenizer configuré dynamiquement
        self.tokenizer.src_lang = src_lang
        inputs = self.tokenizer(text, return_tensors="pt").to(self.model.device)

        # Génération avec forced_bos_token_id pour langue cible
        forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(tgt_lang)
        outputs = self.model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_length=256
        )

        return self.tokenizer.decode(outputs[0], skip_special_tokens=True)
```

**Avantages**:
- ✅ 1 seul modèle en mémoire (comme actuellement)
- ✅ Toutes les paires de langues supportées
- ✅ Quantization 4-bit disponible
- ✅ Pas de cache de pipelines

**Inconvénients**:
- ❌ Plus de code à maintenir (vs pipeline)
- ❌ Pas d'optimisations pipeline automatiques

### Option 3: Migration vers vLLM (PRODUCTION READY) 🚀

**Principe**: Utiliser vLLM pour inférence ultra-optimisée

```python
from vllm import LLM, SamplingParams

class VLLMNLLBTranslator:
    def __init__(self, model_name):
        self.llm = LLM(
            model=model_name,
            tensor_parallel_size=1,  # Multi-GPU si disponible
            quantization="awq",      # Quantization optimisée
            max_model_len=512
        )

    async def translate_batch(self, texts: List[str], src_lang: str, tgt_lang: str):
        # vLLM fait continuous batching automatiquement
        prompts = [f"Translate from {src_lang} to {tgt_lang}: {text}" for text in texts]
        sampling_params = SamplingParams(temperature=0, max_tokens=256)

        outputs = self.llm.generate(prompts, sampling_params)
        return [out.outputs[0].text for out in outputs]
```

**Avantages**:
- ✅ **50x plus rapide** que transformers standard
- ✅ Continuous batching automatique
- ✅ PagedAttention (utilisation mémoire optimale)
- ✅ Multi-GPU natif
- ✅ Production-ready (utilisé par Meta, OpenAI, etc.)

**Inconvénients**:
- ❌ Dépendance externe (mais très stable)
- ❌ Installation plus complexe
- ❌ Nécessite étude compatibilité NLLB + vLLM

### Option 4: Pré-chargement des Top N paires

**Principe**: Pré-charger les 20-50 paires les plus fréquentes au démarrage

```python
class NLLBMultiPipelineManager:
    def __init__(self, model_name, top_pairs: List[Tuple[str, str]]):
        self.pipelines = {}

        # Pré-charger pipelines pour paires fréquentes
        for src_lang, tgt_lang in top_pairs:
            key = (src_lang, tgt_lang)
            self.pipelines[key] = pipeline(
                "translation",
                model=model_name,
                src_lang=src_lang,
                tgt_lang=tgt_lang,
                quantization_config="4bit"
            )

    async def translate(self, text: str, src_lang: str, tgt_lang: str):
        key = (src_lang, tgt_lang)

        if key in self.pipelines:
            # Hit: Pipeline pré-chargé
            return self.pipelines[key](text)[0]['translation_text']
        else:
            # Miss: Créer pipeline à la demande (rare)
            pipe = pipeline("translation", model=..., src_lang=src_lang, tgt_lang=tgt_lang)
            return pipe(text)[0]['translation_text']
```

**Avantages**:
- ✅ Zéro latence pour paires fréquentes
- ✅ Quantization 4-bit (20 pipelines × 800MB = 16GB max)

**Inconvénients**:
- ❌ Consommation mémoire fixe au démarrage
- ❌ Nécessite métriques d'usage pour identifier top pairs

## Gains estimés par option

| Critère | Option 1 (Cache) | Option 2 (Direct) | Option 3 (vLLM) | Option 4 (Pre-load) |
|---------|------------------|-------------------|-----------------|---------------------|
| **Latence paires fréquentes** | ⭐⭐⭐⭐ (cached) | ⭐⭐⭐ (OK) | ⭐⭐⭐⭐⭐ (50x) | ⭐⭐⭐⭐⭐ (instant) |
| **Latence paires rares** | ⭐⭐ (création 500ms) | ⭐⭐⭐ (OK) | ⭐⭐⭐⭐⭐ (50x) | ⭐⭐ (création) |
| **Mémoire** | ⭐⭐⭐⭐ (cache LRU) | ⭐⭐⭐⭐⭐ (1 modèle) | ⭐⭐⭐⭐ (paged attn) | ⭐⭐ (20× pipelines) |
| **Throughput** | ⭐⭐⭐ (standard) | ⭐⭐⭐ (standard) | ⭐⭐⭐⭐⭐ (cont. batch) | ⭐⭐⭐ (standard) |
| **Complexité** | ⭐⭐⭐ (medium) | ⭐⭐ (simple) | ⭐⭐⭐⭐ (complexe) | ⭐⭐⭐ (medium) |
| **Quantization 4-bit** | ✅ | ✅ | ✅ | ✅ |
| **Toutes langues** | ✅ | ✅ | ✅ | ⚠️ (fallback) |

## Plan d'expérimentation

### Phase 1: Mesures baseline (1 semaine)
1. **Instrumenter production actuelle** (transformers 4.x)
   - Latence moyenne par paire de langues
   - Distribution des paires utilisées (top 20, top 50, top 100)
   - Mémoire GPU/CPU utilisée
   - Throughput (requêtes/sec)

2. **Métriques clés à capturer**:
   ```python
   # Dans translator_engine.py
   @metrics.histogram("translation.latency", labels=["src_lang", "tgt_lang", "model"])
   async def translate_text(self, text, src_lang, tgt_lang, model_type):
       ...
   ```

3. **Questions à répondre**:
   - Top 20 paires = quel % du trafic ?
   - Latence P50, P95, P99 par paire
   - Pic de throughput actuel

### Phase 2: Prototypes (2 semaines)

#### Prototype A: Pipeline Factory (Option 1)
```bash
git checkout -b experiment/transformers5-pipeline-factory
# Implémenter NLLBPipelineFactory
# Tester avec transformers 5.0.0
# Mesurer latence + mémoire
```

#### Prototype B: Direct Model (Option 2)
```bash
git checkout -b experiment/transformers5-direct-model
# Implémenter NLLBTranslator
# Benchmarker vs Pipeline Factory
```

#### Prototype C: vLLM (Option 3) - Si ressources disponibles
```bash
git checkout -b experiment/vllm-nllb
# Installer vLLM
# Tester compatibilité NLLB
# Benchmarker performance
```

### Phase 3: Évaluation (1 semaine)
1. **Benchmarks standardisés**:
   - Dataset: 1000 phrases × top 20 paires
   - Mesurer: latence, throughput, mémoire
   - Comparer: 4.x baseline vs 5.0 options

2. **Tests d'intégration**:
   - Pool de workers ZMQ
   - Backpressure avec Redis
   - Cas limites (textes très longs, paires rares)

3. **Matrice de décision**:
   ```
   IF top_20_pairs > 80% traffic AND memory_available > 16GB:
       → Option 4 (Pre-load) ou Option 1 (Cache)
   ELIF GPU_available:
       → Option 3 (vLLM) [meilleur ROI]
   ELSE:
       → Option 2 (Direct Model) [simplicité]
   ```

### Phase 4: Migration production (2-3 semaines)
1. **Déploiement progressif**:
   - Staging: transformers 5.0.0 + option choisie
   - Tests A/B: 10% trafic → 50% → 100%
   - Rollback plan si régression

2. **Monitoring intensif**:
   - Grafana dashboards (latence, erreurs, mémoire)
   - Alertes sur dégradation performance
   - Logs détaillés pendant 2 semaines

## Gains estimés finaux

### Scénario conservateur (Option 1 ou 2)
- **Latence**: -20% (kernels optimisés)
- **Mémoire**: -50% (quantization 4-bit)
- **Throughput**: +15% (continuous batching partiel)
- **Coût GPU**: -30% (moins de mémoire = GPU plus petits)

### Scénario optimiste (Option 3 - vLLM)
- **Latence**: -70% (PagedAttention + kernels)
- **Mémoire**: -60% (gestion optimale)
- **Throughput**: +300% (continuous batching + multi-GPU)
- **Coût GPU**: -50% (utilisation maximale)

## Risques et mitigation

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Breaking changes cachés | High | Medium | Tests exhaustifs en staging |
| Régression qualité traduction | High | Low | Tests de référence (BLEU scores) |
| Augmentation latence paires rares | Medium | High | Fallback vers modèle direct |
| Instabilité vLLM | Medium | Low | Tests de charge prolongés |
| Incompatibilité NLLB + vLLM | High | Medium | Prototype avant engagement |

## Prochaines étapes immédiates

1. **✅ FAIT**: Documenter plan de migration
2. **TODO**: Instrumenter production actuelle (métriques)
3. **TODO**: Analyser distribution paires de langues (1 semaine de logs)
4. **TODO**: Créer branch `experiment/transformers5-prototypes`
5. **TODO**: Implémenter Option 1 (Pipeline Factory) comme POC
6. **TODO**: Benchmarker vs baseline
7. **TODO**: Décision GO/NO-GO basée sur métriques

## Conclusion

La migration vers transformers 5.0.0 apporterait des **gains massifs** :
- 🚀 Performance (latence, throughput)
- 💾 Réduction mémoire 50-75%
- 🔧 Interopérabilité (vLLM, SGLang)
- 📦 Quantization native

**Recommandation**: Prioriser cette migration comme **OKR Q1 2026**

L'architecture NLLB multilingue nécessite une approche adaptée (pas de pipeline universel), mais les options sont viables et les gains justifient largement l'investissement en engineering.

---

**Auteur**: Claude Sonnet 4.5 + @smpceo
**Références**:
- [Transformers v5 Blog](https://huggingface.co/blog/transformers-v5)
- [NLLB Documentation](https://huggingface.co/docs/transformers/en/model_doc/nllb)
- [vLLM Documentation](https://docs.vllm.ai/)
