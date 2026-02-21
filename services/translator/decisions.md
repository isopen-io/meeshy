# Decisions - services/translator (FastAPI ML Service)

## 2025-01: Framework - FastAPI + Uvicorn
**Statut**: Accept
**Contexte**: Service ML async-first avec haute concurrence I/O
**Decision**: FastAPI avec Uvicorn, async/await partout, Pydantic Settings pour config
**Alternatives rejet**: Flask (synchrone, lent), Django (trop lourd pour microservice), Tornado (cosystme moins mature)
**Cons**: `asyncio.to_thread()` ncessaire pour les oprations ML CPU-bound

## 2025-01: STT - Faster-Whisper (pas OpenAI Whisper)
**Statut**: Accept
**Contexte**: Transcription rapide pour pipeline audio temps rel
**Decision**: Faster-Whisper (CTranslate2), modle `distil-large-v3`, compute type `float16`
**Alternatives rejet**: OpenAI Whisper officiel (3-5x plus lent, plus de mmoire), WhisperX (complexit diarization), MMS-ASR (qualit moindre pour langues europennes)
**Cons**: Dpendance CTranslate2 (compilation), installation spare dans Docker

## 2025-01: Translation - NLLB-200
**Statut**: Accept
**Contexte**: 200+ langues avec un seul modle, support langues africaines critique
**Decision**: NLLB-200-Distilled-600M (basic/medium), NLLB-200-Distilled-1.3B (premium)
**Alternatives rejet**: Opus-MT (600+ modles spars), M2M-100 (dprc par Meta), GPT-3.5/4 API (cot prohibitif  100k+ msg/s), mBART (qualit infrieure)
**Cons**: 600M-1.3B params = haute mmoire, infrence CPU lente (mitig par worker pool + batching)

## 2025-01: TTS - Multi-backend routing par langue
**Statut**: Accept
**Contexte**: Aucun moteur TTS ne couvre toutes les langues avec qualit acceptable
**Decision**: 5 backends avec LanguageRouter auto-select: Chatterbox (primaire, Apache 2.0), Higgs V2 (qualit SOTA), XTTS v2 (legacy), MMS (1100+ langues), VITS (spcifique)
**Alternatives rejet**: Google/Amazon TTS (cot, latence, vendor lock-in), Coqui TTS seul (licence MPL 2.0), engine unique (couverture insuffisante)
**Cons**: 5 engines = image Docker ~8GB, routing complexe
**Attention**: Conflit Chatterbox `transformers==4.46.3` vs traduction `transformers>=5.0.0` - Chatterbox rendu optionnel

## 2025-01: IPC - ZeroMQ PULL/PUB
**Statut**: Accept
**Contexte**: Rception de requtes du Gateway et publication de rsultats
**Decision**: PULL sur port 5555 (rception), PUB sur port 5558 (publication). Multipart: Frame 1 = JSON, Frames 2+ = binaire audio
**Alternatives rejet**: gRPC (overhead protobuf pour binaire), REST (pas de streaming), RabbitMQ (broker inutile)
**Cons**: Pas de persistence, gestion manuelle des frames multipart
**Attention**: `binaryFrames[0]` = premier binaire (PAS index [1])

## 2025-01: Worker Pool - Pool Manager custom avec batching
**Statut**: Accept
**Contexte**: Maximiser le throughput de traduction sur CPU
**Decision**: TranslationPoolManager facade, WorkerPool avec priorit, batch accumulation 50ms / max 10 textes, scaling dynamique 2-40 workers
**Alternatives rejet**: ThreadPoolExecutor seul (pas de priorit/batching), Celery (overhead broker), Ray (trop lourd)
**Cons**: 50ms de latence base (batching), code complexe rparti sur 4 modules

## 2025-01: Cache - Redis avec fallback mmoire
**Statut**: Accept
**Contexte**: Cache de traductions/transcriptions, service ne doit jamais crasher
**Decision**: RedisService singleton, fallback automatique vers dict Python aprs 3 checs, cleanup toutes les 60s
**Alternatives rejet**: Redis seul (crash si down), mmoire seul (perdu au restart), Memcached (client async moins mature)
**Cons**: Mode mmoire perdu au restart, pas partag entre instances

## 2025-01: Voice Cloning - OpenVoice V2
**Statut**: Accept
**Contexte**: Clonage vocal pour personnaliser le TTS
**Decision**: OpenVoice V2 se_extractor (embedding 256-dim), ToneColorConverter, cache fichier 90j, min 10s audio, max 20 chantillons
**Alternatives rejet**: XTTS seul (17 langues seulement), RVC (trop lent, GPU requis), So-VITS-SVC (optimis chant, pas parole)
**Cons**: Fonctionne sur CPU mais plus lent, 10s minimum d'audio ncessaire
**Scurit**: Srialisation JSON uniquement (pas de format binaire non scuris)

## 2025-01: Package Manager - uv (pas pip)
**Statut**: Accept
**Contexte**: pip prend 4.5 min pour installer PyTorch + deps
**Decision**: `uv` (Rust-based) - 10-100x plus rapide. `uv sync` (4s) vs `pip install` (4min 32s). `pyproject.toml` source de vrit
**Alternatives rejet**: pip (trop lent), poetry (3x seulement), pipenv (abandonn), conda (pas adapt Docker prod)
**Cons**: Moins mature que pip, ncessite binaire `uv` dans l'image Docker

## 2025-01: Singletons - Pattern pour ressources coteuses
**Statut**: Accept
**Contexte**: Modles ML (600M-1.3B params) ne doivent tre chargs qu'une fois
**Decision**: Singleton thread-safe avec `threading.Lock()` pour TranslationMLService, TTSService, VoiceCloneService, RedisService
**Alternatives rejet**: DI (passer des modles  travers 10+ couches), variables globales (pas thread-safe), init au niveau module (side effects)
**Cons**: Difficile  tester (reset tat singleton), dpendances caches

## 2025-01: Config - ~50 env vars centralises
**Statut**: Accept
**Contexte**: Configuration flexible pour diffrents environnements (dev/docker/prod, CPU/GPU)
**Decision**: Classe `Settings` unique avec Pydantic Settings, 50+ env vars avec dfauts, proprits calcules
**Alternatives rejet**: Fichiers YAML/JSON (moins flexible Docker/K8s), hardcod (impossible multi-env), multiple classes (dcouverte difficile)
**Cons**: 50+ vars intimidant pour les nouveaux dveloppeurs

## 2025-01: Audio Pipeline - 3 tapes linaires avec cache intermdiaire
**Statut**: Accept
**Contexte**: Un audio transcrit une fois, traduit en N langues
**Decision**: Transcription (Whisper) -> Translation (NLLB) -> TTS (Chatterbox). Cache Redis par tape (`audio:transcription:{id}`, `audio:translation:{id}:{lang}`)
**Alternatives rejet**: Modle end-to-end (qualit infrieure, moins de langues), pipeline parallle (impossible, transcription requise avant traduction)
**Cons**: Latence cumule ~1.5s (500ms STT + 200ms MT + 800ms TTS)
