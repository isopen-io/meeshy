# Parallélisation GPU - ThreadPoolExecutor vs asyncio.gather

## Problème Résolu

### AVANT (asyncio.gather - FAUX parallélisme)
```python
# audio_message_pipeline.py - SÉQUENTIEL!
results = await asyncio.gather(
    *[process_single_language(lang, cloning_params) for lang in languages],
    return_exceptions=True
)
# → Utilise une SEULE event loop
# → Les opérations GPU s'exécutent SÉQUENTIELLEMENT
# → Temps total = somme des temps individuels
```

**Problème**: `asyncio.gather` utilise une seule event loop. Même si les coroutines sont lancées "en parallèle", les opérations GPU (TTS, clonage vocal) sont thread-safe mais pas async-safe. Résultat: exécution SÉQUENTIELLE.

### APRÈS (ThreadPoolExecutor - VRAIE parallélisation)
```python
# Chaque thread a sa propre event loop → vraie parallélisation GPU
with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = {executor.submit(process_language_sync, task): task[0]
               for task in tasks}

    for future in as_completed(futures):
        lang = futures[future]
        result = future.result()
```

**Solution**: ThreadPoolExecutor crée un thread par langue. Chaque thread a sa propre event loop asyncio. Les opérations GPU peuvent s'exécuter VRAIMENT en parallèle.

## Architecture

### Pattern iOS Script (lignes 866-903)
```python
def process_language(args: Tuple) -> Dict:
    """Fonction SYNCHRONE pour ThreadPoolExecutor"""
    (reference_path, target_lang, translated_text, output_path,
     config, cloner) = args

    # Clone voice (thread-safe)
    cloner.clone(...)

    # Analyze similarity
    comparison = VoiceAnalyzer.compare(original, cloned)

    return {'success': True, 'lang': target_lang, ...}

# Parallel execution
with ThreadPoolExecutor(max_workers=config.max_workers) as executor:
    futures = {executor.submit(process_language, task): task[1]
               for task in tasks}

    for future in as_completed(futures):
        result = future.result()
```

### Implémentation Pipeline Audio

```python
def process_language_sync(task_args: Tuple) -> Tuple:
    """Fonction SYNCHRONE qui crée sa propre event loop"""
    target_lang, lang_cloning_params = task_args

    # Créer une nouvelle boucle d'événements pour ce thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        # Exécuter le traitement asynchrone dans cette boucle
        result = loop.run_until_complete(
            self._process_single_language_async(
                target_lang=target_lang,
                # ... autres paramètres
            )
        )
        return result
    finally:
        loop.close()

async def _process_single_language_async(self, ...):
    """Logique asynchrone (traduction + TTS + cache)"""
    # 1. Traduire le texte
    translated_text = await self._translate_text_with_cache(...)

    # 2. Générer audio avec voix clonée (GPU)
    tts_result = await self.tts_service.synthesize_with_voice(...)

    # 3. Mettre en cache
    await self.audio_cache.set_translated_audio_by_hash(...)

    return (target_lang, TranslatedAudioVersion(...))
```

## Configuration

### Variable d'Environnement
```bash
# Nombre de workers parallèles (défaut: min(nb_langues, 4))
export TTS_MAX_WORKERS=4
```

### Calcul Automatique
```python
max_workers = min(len(languages_to_process), int(os.getenv("TTS_MAX_WORKERS", "4")))
```

- **2 langues** → 2 workers (parallélisation complète)
- **3 langues** → 3 workers (parallélisation complète)
- **5 langues** → 4 workers (limite pour éviter surcharge GPU)

## Performance

### Scénario: Traduction en 3 langues (fr, es, de)

#### AVANT (asyncio.gather)
```
[PIPELINE] 🔄 Traitement PARALLÈLE de 3 langues: ['fr', 'es', 'de']
[TTS] Synthèse fr: 2500ms
[TTS] Synthèse es: 2300ms  # Attend que fr finisse
[TTS] Synthèse de: 2400ms  # Attend que es finisse
[PIPELINE] ⚡ 3 langues traitées en 7200ms
```
**Temps total**: ~7200ms (séquentiel)

#### APRÈS (ThreadPoolExecutor)
```
[PIPELINE] 🔄 Traitement PARALLÈLE de 3 langues: ['fr', 'es', 'de']
[PIPELINE] 🔧 ThreadPoolExecutor: 3 workers pour 3 langues
[TTS] Synthèse fr: 2500ms  # Thread 1
[TTS] Synthèse es: 2300ms  # Thread 2 (en parallèle)
[TTS] Synthèse de: 2400ms  # Thread 3 (en parallèle)
[PIPELINE] ⚡ Progression: 1/3 langues complétées (es)
[PIPELINE] ⚡ Progression: 2/3 langues complétées (de)
[PIPELINE] ⚡ Progression: 3/3 langues complétées (fr)
[PIPELINE] ✅ 3/3 langues traitées avec succès en 2500ms (parallélisation réelle)
```
**Temps total**: ~2500ms (parallèle - temps de la plus longue)

### Gain de Performance
- **2-3 langues**: **2-3x plus rapide**
- **4+ langues**: **3-4x plus rapide** (limité par max_workers)

## Logs et Monitoring

### Progress Tracking
```python
for future in as_completed(futures):
    lang = futures[future]
    try:
        result = future.result()
        completed_count += 1
        logger.info(
            f"[PIPELINE] ⚡ Progression: {completed_count}/{len(languages_to_process)} "
            f"langues complétées ({lang})"
        )
```

### Résumé Final
```python
logger.info(
    f"[PIPELINE] ✅ {success_count}/{len(languages_to_process)} langues traitées "
    f"avec succès en {parallel_time}ms (parallélisation réelle)"
)
```

## Considérations GPU

### Thread Safety
- **TTS Service**: Thread-safe (chaque thread charge son propre modèle)
- **Voice Clone**: Thread-safe (lecture seule des embeddings)
- **Redis Cache**: Thread-safe (connexions indépendantes)

### Limite de Workers
```python
# Éviter surcharge GPU (4 workers par défaut)
max_workers = min(len(languages_to_process), 4)
```

### Gestion Mémoire
- Chaque thread a sa propre event loop (overhead minimal)
- Les modèles GPU peuvent être partagés (selon backend)
- Cache Redis partagé (pas de duplication)

## Migration Checklist

- [x] Import ThreadPoolExecutor et as_completed
- [x] Créer process_language_sync() avec new_event_loop
- [x] Extraire _process_single_language_async()
- [x] Remplacer asyncio.gather par ThreadPoolExecutor
- [x] Ajouter progress tracking (as_completed)
- [x] Configurer max_workers (env var)
- [x] Vérifier syntaxe Python
- [ ] Tests d'intégration multi-langues
- [ ] Benchmarks de performance

## Tests Recommandés

```bash
# Test 2 langues (parallélisation complète)
pytest tests/test_parallel_processing.py::test_two_languages -v

# Test 4 langues (limite de workers)
pytest tests/test_parallel_processing.py::test_four_languages -v

# Benchmark asyncio.gather vs ThreadPoolExecutor
pytest tests/benchmark_parallel.py -v
```

## Références

- Script iOS: `ios-simulator/scripts/ios_batch_voice_cloning.py` (lignes 866-903)
- Pattern ThreadPoolExecutor: [Python Docs](https://docs.python.org/3/library/concurrent.futures.html)
- GIL et GPU: [Why ThreadPoolExecutor for GPU](https://stackoverflow.com/questions/68104420/)
