# services/translator - FastAPI ML Service

## Tech Stack
- FastAPI + Uvicorn (async Python)
- PyTorch 2.2+ (CPU default, GPU optional)
- ZeroMQ (PULL/PUB communication with gateway)
- Faster-Whisper (STT), NLLB-200 (translation)
- Chatterbox TTS 0.1.6 (text-to-speech, Apache 2.0)
- Redis (cache) + MongoDB (database)
- Package manager: `uv` (ultra-fast)
- Python 3.11+

## Project Structure
```
src/
├── main.py                          → MeeshyTranslationServer orchestrator
├── config/
│   └── settings.py                  → Centralized config (~50 env vars)
├── api/
│   ├── translation_api.py           → FastAPI app factory
│   ├── health.py                    → Health checks (health, ready, live)
│   ├── audio_api.py                 → Audio endpoints
│   └── voice_api.py                 → Voice API (20+ endpoints)
├── services/
│   ├── zmq_server_core.py           → Main ZMQ orchestrator
│   ├── zmq_pool/                    → Worker pool architecture
│   │   ├── zmq_pool_manager.py      → Facade orchestrator
│   │   ├── worker_pool.py           → Worker scaling
│   │   ├── connection_manager.py    → Queue/priority
│   │   └── translation_processor.py → Execution
│   ├── zmq_translation_handler.py   → Text translation
│   ├── zmq_audio_handler.py         → Multipart audio
│   ├── zmq_transcription_handler.py → STT
│   ├── translation_ml/              → ML modules
│   │   ├── model_loader.py
│   │   ├── translator_engine.py
│   │   └── translation_cache.py
│   ├── tts/                         → Multi-model TTS
│   │   ├── tts_service.py           → Orchestrator (singleton)
│   │   ├── language_router.py       → Auto-select backend
│   │   └── backends/                → Chatterbox, Higgs, XTTS, MMS, VITS
│   ├── audio_pipeline/              → End-to-end pipeline
│   │   ├── audio_message_pipeline.py
│   │   ├── transcription_stage.py
│   │   └── translation_stage.py
│   ├── voice_clone/                 → OpenVoice V2
│   └── redis_service.py             → Cache with memory fallback
└── tests/
```

## ZMQ Architecture
- **PULL** on port 5555: Receives from Gateway (Gateway PUSH → Translator PULL)
- **PUB** on port 5558: Publishes results (Translator PUB → Gateway SUB)

### Message Types
1. **Text Translation**: JSON `{messageId, text, sourceLanguage, targetLanguage}`
2. **Audio**: Multipart - Frame 1 = JSON, Frames 2+ = binary audio
3. **Transcription**: STT-only processing
4. **Voice**: Voice profile creation/updating

## Audio Pipeline (3 stages)
```
Audio → Transcription (Faster-Whisper) → Translation (NLLB) → TTS (Chatterbox)
```

### TTS Backends (auto-selected by language)
| Backend | License | Best For |
|---------|---------|----------|
| Chatterbox | Apache 2.0 | Default, fast, commercial |
| Higgs Audio V2 | Limited | State-of-the-art quality |
| XTTS v2 | Legacy | Flexible, multilingual |
| MMS | Meta | 1100+ languages, African |
| VITS | ESPnet2 | Language-specific |

## Conventions

### Naming
```python
class ServiceName:           # PascalCase classes
    _instance = None         # Singleton pattern

    def get_data(self):      # snake_case methods
        pass

UPPER_CASE_CONSTANTS = 42    # Constants
_private_method()            # Single underscore prefix
```

### Service Pattern (Singleton)
```python
class ServiceName:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
```

### Async Task Management
```python
self.active_tasks: set[asyncio.Task] = set()
task = asyncio.create_task(coroutine())
self.active_tasks.add(task)
task.add_done_callback(self.active_tasks.discard)
```

### Logging
```python
import logging
logger = logging.getLogger(__name__)
logger.info("[TRANSLATOR] Service initialized")
logger.error("[TRANSLATOR] Critical error", exc_info=True)
```

### Error Handling
- Try/catch with traceback logging
- Graceful degradation: Redis → memory fallback
- No automatic retry (explicit in handlers)
- FFmpeg subprocess errors wrapped with context

## Configuration (Environment)
```env
FASTAPI_PORT=8000
ZMQ_PORT=5555
MODELS_PATH=/app/models
TTS_MODEL=chatterbox
WHISPER_MODEL=large-v3
REDIS_URL=redis://redis:6379
BATCH_SIZE=32
CONCURRENT_TRANSLATIONS=10
TRANSLATION_TIMEOUT=20
GPU_MEMORY_FRACTION=0.8
```

## Critical Version Constraints
```
transformers>=4.46.3    # LOCKED for Chatterbox compatibility
torch>=2.2.0            # CPU default
faster-whisper>=1.2.1   # STT
chatterbox-tts>=0.1.6   # Installed with --no-deps in Docker
```

## Testing
```bash
pytest tests/ -v                      # All tests
pytest tests/ -v -k "voice_clone"     # Pattern match
pytest tests/ -v --cov=src            # With coverage
```
- `pytest-asyncio` with `asyncio_mode = "auto"`
- Markers: `@pytest.mark.unit`, `@pytest.mark.integration`
- Fixtures in `conftest.py` (mock ZMQ, TTS, DB)

### Doubles de service : `create_autospec`, jamais `MagicMock()` nu

Un `MagicMock()` nu accepte **n'importe quel argument nommé** et **fabrique
n'importe quel attribut demandé**. C'est exactement le profil des deux pannes
d'intégration qui ont tué `voice_analyze` et `voice_compare` en production
pendant que leurs témoins restaient verts (cycle 90) :

```python
self.voice_analyzer.analyze(audio_path=…, analysis_types=…)  # TypeError réel
self.voice_analyzer.compare_voices(…)                        # AttributeError réel
```

`operation_handlers` appelait une API composite qui n'existait sur **aucune** des
deux classes d'analyseur du dépôt (`VoiceAnalyzerService` a `analyze(audio_path,
use_cache)` et `compare(…)` ; `voice_clone.VoiceAnalyzer` a `analyze_audio` et
`compare_voices(original_path, cloned_path)`). Les exceptions étaient avalées par
le `except Exception` du handler et servies en `INTERNAL_ERROR`.

```python
service = create_autospec(VoiceAnalyzerService, instance=True)
service.analyze.return_value = mock_result   # jamais `service.analyze = AsyncMock(…)`
```

**`spec=` ne suffit pas** : il contrôle l'EXISTENCE des attributs, pas les
signatures — et une réassignation d'attribut efface ce qu'il y avait posé.
Mesuré : sous `spec=`, la production revertie laissait le témoin passer.

Et **la charge utile d'un double se CAPTURE, elle ne s'invente pas.** Celui-ci
rendait du camelCase (`timbre`, `spectralCentroid`) qu'aucun émetteur du dépôt ne
produit — `VoiceCharacteristics.to_dict()` rend du snake_case imbriqué
(`spectral.centroid_hz`). La fixture propageait la fiction que la passerelle
déclarait de son côté.

Enfin : **un témoin qui assert `result['type'] in ['voice_api_success',
'voice_api_error']` ne peut pas tomber.** Il n'atteste rien.

### `except Exception` large : la panne devient un code d'erreur

Les handlers de `voice_api/` enveloppent chaque opération dans un
`except Exception → error_code="INTERNAL_ERROR"`. C'est voulu (le ZMQ ne doit pas
tomber sur une requête), mais cela transforme une erreur de PROGRAMMATION —
mauvaise signature, attribut inexistant — en réponse d'erreur ordinaire,
indiscernable d'un audio illisible. Le `logger.error` porte le message réel :
**c'est le seul endroit où la différence est visible.** En doutant d'une
opération voix, lire les logs avant de conclure à un problème de données.

## Build & Deploy
- Docker: `python:3.11-slim`, multi-stage
- CPU/GPU variants via `TORCH_BACKEND` build arg
- Models cached in `/app/models/` (huggingface, whisper, openvoice)
- Health checks: `/health`, `/ready`, `/live`
- Port 8000

## Key Rules
1. Always `async/await` (framework is async-first)
2. Wrap optional imports in try/except (graceful degradation)
3. Use dataclasses for data transfer objects
4. Add `[TRANSLATOR]` prefix to all log messages
5. Implement Singleton for expensive resources (models, connections)
6. Add type hints everywhere, including `Optional[]`
7. Use `field(default_factory=...)` for mutable defaults

## Architectural Decisions
Voir `decisions.md` dans ce rpertoire pour l'historique des choix architecturaux (FastAPI, Faster-Whisper, NLLB-200, multi-backend TTS, ZeroMQ, worker pool, Redis fallback, OpenVoice V2, uv, singletons, config, audio pipeline) avec contexte, alternatives rejetes et consquences.

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : latence par langue et par longueur telle que l'utilisateur la PERÇOIT, mémoire GPU/CPU des modèles chargés (et GPU réellement utilisé), qualité mesurée — aucun repli silencieux vers `fra_Latn`, couverture RÉELLE des langues offertes (complétude), pins de version tenus (compatibilité).
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
