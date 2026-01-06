# Architecture Complète - XTTS Voice Translation Microservice

## 1. Vue d'Ensemble du Système

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                           MEESHY VOICE TRANSLATION SYSTEM                            │
│                                                                                      │
│  ┌─────────────┐                                              ┌─────────────┐       │
│  │             │                                              │             │       │
│  │  iOS App    │◄────────────────────────────────────────────►│  Android    │       │
│  │  (Swift)    │                                              │  (Kotlin)   │       │
│  │             │                                              │             │       │
│  └──────┬──────┘                                              └──────┬──────┘       │
│         │                                                            │              │
│         │                    HTTPS / WebSocket                       │              │
│         │                                                            │              │
│         └────────────────────────┬───────────────────────────────────┘              │
│                                  │                                                   │
│                                  ▼                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                            API GATEWAY (Kong/Nginx)                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │  │
│  │  │    Auth     │  │ Rate Limit  │  │   Logging   │  │   Routing   │          │  │
│  │  │   (JWT)     │  │ (100/min)   │  │  (ELK)      │  │             │          │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                  │                                                   │
│                                  ▼                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                │  │
│  │                    TRANSLATOR MICROSERVICE (Python/FastAPI)                    │  │
│  │                                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐ │  │
│  │  │                      VOICE TRANSLATION PIPELINE                           │ │  │
│  │  │                                                                           │ │  │
│  │  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐ │ │  │
│  │  │  │  INPUT  │───►│ WHISPER │───►│TRANSLATE│───►│ XTTS-v2 │───►│ OUTPUT │ │ │  │
│  │  │  │  AUDIO  │    │  (STT)  │    │ (DeepL) │    │ (CLONE) │    │ AUDIO  │ │ │  │
│  │  │  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └────────┘ │ │  │
│  │  │                                                                           │ │  │
│  │  └──────────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                  │                                                   │
│         ┌────────────────────────┼────────────────────────┐                         │
│         │                        │                        │                         │
│         ▼                        ▼                        ▼                         │
│  ┌─────────────┐          ┌─────────────┐          ┌─────────────┐                  │
│  │   Redis     │          │ PostgreSQL  │          │    S3/CDN   │                  │
│  │   Cache     │          │  Database   │          │   Storage   │                  │
│  └─────────────┘          └─────────────┘          └─────────────┘                  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Pipeline de Traduction Vocale Détaillé

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                         VOICE TRANSLATION PIPELINE                                   │
│                                                                                      │
│  ════════════════════════════════════════════════════════════════════════════════   │
│                                                                                      │
│   ENTRÉE                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                              │   │
│   │  🎤 AUDIO INPUT                                                              │   │
│   │  ─────────────────────────────────────────────────────────────────────────   │   │
│   │  • Format: WAV, MP3, M4A, FLAC                                               │   │
│   │  • Sample Rate: 16kHz - 48kHz (resampled to 22050Hz)                        │   │
│   │  • Durée: 1s - 300s (5 min max)                                             │   │
│   │  • Taille: < 50MB                                                            │   │
│   │  • Voix: Homme, Femme, Enfant, Grave, Aiguë                                 │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                           │
│                                          ▼                                           │
│  ════════════════════════════════════════════════════════════════════════════════   │
│                                                                                      │
│   ÉTAPE 1: PRÉTRAITEMENT AUDIO                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                              │   │
│   │  🔧 AUDIO PREPROCESSING                                                      │   │
│   │  ─────────────────────────────────────────────────────────────────────────   │   │
│   │                                                                              │   │
│   │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐   │   │
│   │  │   Decode     │──►│  Resample    │──►│  Normalize   │──►│   Trim      │   │   │
│   │  │   (FFmpeg)   │   │  to 22050Hz  │   │  -3dB peak   │   │  Silence    │   │   │
│   │  └──────────────┘   └──────────────┘   └──────────────┘   └─────────────┘   │   │
│   │                                                                              │   │
│   │  Output: audio_preprocessed.wav (22050Hz, mono, normalized)                  │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                           │
│                                          ▼                                           │
│  ════════════════════════════════════════════════════════════════════════════════   │
│                                                                                      │
│   ÉTAPE 2: TRANSCRIPTION (WHISPER)                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                              │   │
│   │  📝 SPEECH-TO-TEXT (Whisper)                                                 │   │
│   │  ─────────────────────────────────────────────────────────────────────────   │   │
│   │                                                                              │   │
│   │  Model: whisper-base (74M params) ou whisper-large-v3 (1.5B params)         │   │
│   │                                                                              │   │
│   │  ┌─────────────────────────────────────────────────────────────────────┐    │   │
│   │  │  Input:  audio_preprocessed.wav                                      │    │   │
│   │  │  ─────────────────────────────────────────────────────────────────   │    │   │
│   │  │  Process:                                                            │    │   │
│   │  │    1. Mel Spectrogram (80 bins, 25ms window)                        │    │   │
│   │  │    2. Encoder (Transformer)                                          │    │   │
│   │  │    3. Decoder (Auto-regressive)                                      │    │   │
│   │  │    4. Language Detection                                             │    │   │
│   │  │  ─────────────────────────────────────────────────────────────────   │    │   │
│   │  │  Output:                                                             │    │   │
│   │  │    • text: "Bonjour, comment allez-vous aujourd'hui?"               │    │   │
│   │  │    • language: "fr"                                                  │    │   │
│   │  │    • confidence: 0.95                                                │    │   │
│   │  │    • segments: [{start: 0.0, end: 2.5, text: "Bonjour..."}]         │    │   │
│   │  └─────────────────────────────────────────────────────────────────────┘    │   │
│   │                                                                              │   │
│   │  Performance: ~0.5s (GPU) / ~3s (CPU) pour 10s d'audio                      │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                           │
│                                          ▼                                           │
│  ════════════════════════════════════════════════════════════════════════════════   │
│                                                                                      │
│   ÉTAPE 3: TRADUCTION                                                                │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                              │   │
│   │  🌍 TEXT TRANSLATION                                                         │   │
│   │  ─────────────────────────────────────────────────────────────────────────   │   │
│   │                                                                              │   │
│   │  Primary: DeepL API (meilleure qualité)                                      │   │
│   │  Fallback: Google Translate API                                              │   │
│   │                                                                              │   │
│   │  ┌─────────────────────────────────────────────────────────────────────┐    │   │
│   │  │  Input:                                                              │    │   │
│   │  │    • text: "Bonjour, comment allez-vous aujourd'hui?"               │    │   │
│   │  │    • source_lang: "fr"                                               │    │   │
│   │  │    • target_lang: "en"                                               │    │   │
│   │  │  ─────────────────────────────────────────────────────────────────   │    │   │
│   │  │  Output:                                                             │    │   │
│   │  │    • translated: "Hello, how are you today?"                        │    │   │
│   │  └─────────────────────────────────────────────────────────────────────┘    │   │
│   │                                                                              │   │
│   │  Langues supportées: EN, FR, ES, DE, IT, PT, NL, PL, RU, ZH, JA, KO...     │   │
│   │  Performance: ~200ms (API call)                                              │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                           │
│                                          ▼                                           │
│  ════════════════════════════════════════════════════════════════════════════════   │
│                                                                                      │
│   ÉTAPE 4: CLONAGE VOCAL (XTTS-v2)                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                              │   │
│   │  🎭 VOICE CLONING (XTTS-v2)                                                  │   │
│   │  ─────────────────────────────────────────────────────────────────────────   │   │
│   │                                                                              │   │
│   │  Model: tts_models/multilingual/multi-dataset/xtts_v2 (1.8GB)               │   │
│   │                                                                              │   │
│   │  ┌─────────────────────────────────────────────────────────────────────┐    │   │
│   │  │                                                                      │    │   │
│   │  │           ┌─────────────────┐                                        │    │   │
│   │  │           │  REFERENCE      │                                        │    │   │
│   │  │           │  AUDIO          │                                        │    │   │
│   │  │           │  (Your Voice)   │                                        │    │   │
│   │  │           └────────┬────────┘                                        │    │   │
│   │  │                    │                                                 │    │   │
│   │  │                    ▼                                                 │    │   │
│   │  │           ┌─────────────────┐                                        │    │   │
│   │  │           │    SPEAKER      │                                        │    │   │
│   │  │           │   ENCODER       │                                        │    │   │
│   │  │           │  (Extract ID)   │                                        │    │   │
│   │  │           └────────┬────────┘                                        │    │   │
│   │  │                    │                                                 │    │   │
│   │  │                    │ Speaker Embedding (512-dim)                     │    │   │
│   │  │                    │                                                 │    │   │
│   │  │                    ▼                                                 │    │   │
│   │  │  ┌─────────────────────────────────────────────────────────────┐    │    │   │
│   │  │  │                    XTTS-v2 MODEL                             │    │    │   │
│   │  │  │                                                              │    │    │   │
│   │  │  │   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐  │    │    │   │
│   │  │  │   │  Text    │   │  GPT-2   │   │ HiFi-GAN │   │ Audio  │  │    │    │   │
│   │  │  │   │ Encoder  │──►│ Decoder  │──►│ Vocoder  │──►│ Output │  │    │    │   │
│   │  │  │   │          │   │          │   │          │   │        │  │    │    │   │
│   │  │  │   └──────────┘   └──────────┘   └──────────┘   └────────┘  │    │    │   │
│   │  │  │        ▲              ▲                                     │    │    │   │
│   │  │  │        │              │                                     │    │    │   │
│   │  │  │   ┌────┴────┐   ┌────┴────┐                                │    │    │   │
│   │  │  │   │ "Hello, │   │ Speaker │                                │    │    │   │
│   │  │  │   │ how are │   │Embedding│                                │    │    │   │
│   │  │  │   │  you?"  │   │         │                                │    │    │   │
│   │  │  │   └─────────┘   └─────────┘                                │    │    │   │
│   │  │  │                                                              │    │    │   │
│   │  │  └──────────────────────────────────────────────────────────────┘    │    │   │
│   │  │                                                                      │    │   │
│   │  └─────────────────────────────────────────────────────────────────────┘    │   │
│   │                                                                              │   │
│   │  Langues XTTS: en, fr, es, de, it, pt, pl, tr, ru, nl, cs, ar, zh, ja, ko   │   │
│   │  Performance: ~2s (GPU) / ~8s (CPU) pour 5s d'output                        │   │
│   │  Similarité voix: 85-95%                                                     │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                           │
│                                          ▼                                           │
│  ════════════════════════════════════════════════════════════════════════════════   │
│                                                                                      │
│   SORTIE                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                              │   │
│   │  🔊 OUTPUT                                                                   │   │
│   │  ─────────────────────────────────────────────────────────────────────────   │   │
│   │                                                                              │   │
│   │  {                                                                           │   │
│   │    "job_id": "abc123",                                                       │   │
│   │    "status": "completed",                                                    │   │
│   │    "original_text": "Bonjour, comment allez-vous?",                         │   │
│   │    "translated_text": "Hello, how are you?",                                │   │
│   │    "source_language": "fr",                                                  │   │
│   │    "target_language": "en",                                                  │   │
│   │    "audio_url": "https://cdn.meeshy.com/audio/abc123.wav",                  │   │
│   │    "audio_base64": "UklGRi4A...",                                           │   │
│   │    "duration_seconds": 2.3,                                                  │   │
│   │    "voice_similarity": 0.87,                                                 │   │
│   │    "processing_time_ms": 3200                                                │   │
│   │  }                                                                           │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture des Services

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                           SERVICES ARCHITECTURE                                      │
│                                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                │  │
│  │   TRANSLATOR SERVICE (Python FastAPI)                                          │  │
│  │   Port: 8000                                                                   │  │
│  │                                                                                │  │
│  │   ┌─────────────────────────────────────────────────────────────────────────┐ │  │
│  │   │                          API LAYER                                       │ │  │
│  │   │                                                                          │ │  │
│  │   │  POST /api/v1/voice/translate      - Traduire audio                     │ │  │
│  │   │  POST /api/v1/voice/transcribe     - Transcrire seulement               │ │  │
│  │   │  POST /api/v1/voice/clone          - Cloner seulement                   │ │  │
│  │   │  POST /api/v1/voice/profile        - Créer profil voix                  │ │  │
│  │   │  GET  /api/v1/voice/job/{id}       - Status du job                      │ │  │
│  │   │  GET  /api/v1/languages            - Langues supportées                 │ │  │
│  │   │  GET  /health                      - Health check                       │ │  │
│  │   │                                                                          │ │  │
│  │   └─────────────────────────────────────────────────────────────────────────┘ │  │
│  │                                         │                                      │  │
│  │   ┌─────────────────────────────────────┼─────────────────────────────────┐   │  │
│  │   │                                     ▼                                  │   │  │
│  │   │                        SERVICE LAYER                                   │   │  │
│  │   │                                                                        │   │  │
│  │   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │  │
│  │   │   │ Transcription   │  │  Translation    │  │  VoiceCloning   │       │   │  │
│  │   │   │    Service      │  │    Service      │  │    Service      │       │   │  │
│  │   │   │                 │  │                 │  │                 │       │   │  │
│  │   │   │  • Whisper      │  │  • DeepL API    │  │  • XTTS-v2      │       │   │  │
│  │   │   │  • VAD          │  │  • Google API   │  │  • Speaker Enc  │       │   │  │
│  │   │   │  • Lang Detect  │  │  • Cache        │  │  • Voice Cache  │       │   │  │
│  │   │   │                 │  │                 │  │                 │       │   │  │
│  │   │   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘       │   │  │
│  │   │            │                    │                    │                │   │  │
│  │   └────────────┼────────────────────┼────────────────────┼────────────────┘   │  │
│  │                │                    │                    │                    │  │
│  │   ┌────────────┼────────────────────┼────────────────────┼────────────────┐   │  │
│  │   │            ▼                    ▼                    ▼                │   │  │
│  │   │                        MODEL LAYER                                    │   │  │
│  │   │                                                                       │   │  │
│  │   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │  │
│  │   │   │  WhisperModel   │  │   HTTPClient    │  │   XTTSModel     │      │   │  │
│  │   │   │                 │  │                 │  │                 │      │   │  │
│  │   │   │  whisper-base   │  │  deepl-api      │  │  xtts_v2        │      │   │  │
│  │   │   │  74M params     │  │  google-api     │  │  1.8GB          │      │   │  │
│  │   │   │  ~500MB         │  │                 │  │                 │      │   │  │
│  │   │   │                 │  │                 │  │                 │      │   │  │
│  │   │   └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │  │
│  │   │                                                                       │   │  │
│  │   └───────────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│                                         │                                            │
│         ┌───────────────────────────────┼───────────────────────────────┐           │
│         │                               │                               │           │
│         ▼                               ▼                               ▼           │
│  ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐  │
│  │                 │            │                 │            │                 │  │
│  │     REDIS       │            │   POSTGRESQL    │            │    S3 / CDN     │  │
│  │                 │            │                 │            │                 │  │
│  │  • Job Queue    │            │  • Users        │            │  • Audio Files  │  │
│  │  • Voice Cache  │            │  • Jobs         │            │  • Models       │  │
│  │  • Rate Limit   │            │  • Profiles     │            │  • Backups      │  │
│  │  • Sessions     │            │  • Analytics    │            │                 │  │
│  │                 │            │                 │            │                 │  │
│  └─────────────────┘            └─────────────────┘            └─────────────────┘  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Structure des Fichiers

```
translator/
│
├── src/
│   │
│   ├── main.py                          # FastAPI application entry point
│   │
│   ├── config/
│   │   ├── __init__.py
│   │   └── settings.py                  # Configuration (env vars, secrets)
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── voice.py                 # Voice translation endpoints
│   │   │   ├── health.py                # Health check endpoints
│   │   │   └── languages.py             # Language endpoints
│   │   │
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── voice.py                 # Request/Response models
│   │   │   └── common.py                # Common schemas
│   │   │
│   │   └── middleware/
│   │       ├── __init__.py
│   │       ├── auth.py                  # JWT authentication
│   │       └── rate_limit.py            # Rate limiting
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── transcription.py             # Whisper STT service
│   │   ├── translation.py               # DeepL/Google translation
│   │   ├── voice_cloning.py             # XTTS-v2 voice cloning
│   │   ├── audio_processing.py          # FFmpeg utilities
│   │   └── pipeline.py                  # Main translation pipeline
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── whisper_model.py             # Whisper model loader
│   │   └── xtts_model.py                # XTTS model loader
│   │
│   ├── workers/
│   │   ├── __init__.py
│   │   └── gpu_worker.py                # GPU processing worker
│   │
│   └── utils/
│       ├── __init__.py
│       ├── audio.py                     # Audio utilities
│       └── cache.py                     # Redis cache utilities
│
├── tests/
│   ├── __init__.py
│   ├── test_transcription.py
│   ├── test_translation.py
│   ├── test_voice_cloning.py
│   └── test_pipeline.py
│
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.gpu
│   └── docker-compose.yml
│
├── scripts/
│   ├── download_models.py               # Download Whisper + XTTS
│   └── benchmark.py                     # Performance benchmarks
│
├── requirements.txt
├── requirements-gpu.txt
├── .env.example
└── README.md
```

---

## 5. Flux de Données Détaillé

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                              DATA FLOW DIAGRAM                                       │
│                                                                                      │
│                                                                                      │
│    CLIENT                     SERVER                           EXTERNAL              │
│    ──────                     ──────                           ────────              │
│                                                                                      │
│  ┌─────────┐                                                                         │
│  │  User   │                                                                         │
│  │ Records │                                                                         │
│  │  Voice  │                                                                         │
│  └────┬────┘                                                                         │
│       │                                                                              │
│       │ 1. Audio WAV (Base64)                                                        │
│       │    + target_language: "en"                                                   │
│       │                                                                              │
│       ▼                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                              │    │
│  │   POST /api/v1/voice/translate                                               │    │
│  │   Content-Type: application/json                                             │    │
│  │   Authorization: Bearer <jwt_token>                                          │    │
│  │                                                                              │    │
│  │   {                                                                          │    │
│  │     "audio": "UklGRi4AAA...",           // Base64 WAV                       │    │
│  │     "audio_format": "wav",                                                   │    │
│  │     "target_language": "en",                                                 │    │
│  │     "source_language": null              // Auto-detect                      │    │
│  │   }                                                                          │    │
│  │                                                                              │    │
│  └──────────────────────────────────┬───────────────────────────────────────────┘    │
│                                     │                                                │
│                                     │ 2. Validate & Decode Audio                     │
│                                     │                                                │
│                                     ▼                                                │
│                          ┌─────────────────────┐                                     │
│                          │  Audio Preprocessor │                                     │
│                          │  ─────────────────  │                                     │
│                          │  • Decode Base64    │                                     │
│                          │  • Resample 22050Hz │                                     │
│                          │  • Normalize        │                                     │
│                          │  • Trim silence     │                                     │
│                          └──────────┬──────────┘                                     │
│                                     │                                                │
│                                     │ 3. Preprocessed Audio (numpy array)            │
│                                     │                                                │
│                                     ▼                                                │
│                          ┌─────────────────────┐                                     │
│                          │   Whisper STT       │                                     │
│                          │   ─────────────     │                                     │
│                          │   Model: base       │                                     │
│                          │   Device: CUDA      │                                     │
│                          └──────────┬──────────┘                                     │
│                                     │                                                │
│                                     │ 4. Transcription Result                        │
│                                     │    {text: "Bonjour...", lang: "fr"}            │
│                                     │                                                │
│                                     ▼                                                │
│                          ┌─────────────────────┐        ┌─────────────────┐          │
│                          │  Translation API    │───────►│   DeepL API     │          │
│                          │  ─────────────────  │        │   (External)    │          │
│                          │  source: fr         │◄───────│                 │          │
│                          │  target: en         │        └─────────────────┘          │
│                          └──────────┬──────────┘                                     │
│                                     │                                                │
│                                     │ 5. Translated Text                             │
│                                     │    "Hello, how are you?"                       │
│                                     │                                                │
│                                     ▼                                                │
│                          ┌─────────────────────┐                                     │
│                          │   XTTS-v2 Cloning   │                                     │
│                          │   ────────────────  │                                     │
│                          │                     │                                     │
│                          │   Reference: Input  │                                     │
│                          │   Text: Translated  │                                     │
│                          │   Lang: en          │                                     │
│                          │                     │                                     │
│                          └──────────┬──────────┘                                     │
│                                     │                                                │
│                                     │ 6. Cloned Audio (WAV)                          │
│                                     │                                                │
│                                     ▼                                                │
│                          ┌─────────────────────┐        ┌─────────────────┐          │
│                          │   Response Builder  │───────►│   S3 Upload     │          │
│                          │   ────────────────  │        │   (Optional)    │          │
│                          │                     │        └─────────────────┘          │
│                          │   • Encode Base64   │                                     │
│                          │   • Calculate metrics│                                    │
│                          │   • Build JSON      │                                     │
│                          └──────────┬──────────┘                                     │
│                                     │                                                │
│                                     │ 7. Response JSON                               │
│                                     │                                                │
│                                     ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                              │    │
│  │   HTTP 200 OK                                                                │    │
│  │   Content-Type: application/json                                             │    │
│  │                                                                              │    │
│  │   {                                                                          │    │
│  │     "job_id": "abc123",                                                      │    │
│  │     "status": "completed",                                                   │    │
│  │     "original_text": "Bonjour, comment allez-vous?",                        │    │
│  │     "translated_text": "Hello, how are you?",                               │    │
│  │     "source_language": "fr",                                                 │    │
│  │     "target_language": "en",                                                 │    │
│  │     "audio_base64": "UklGRi4A...",                                          │    │
│  │     "audio_url": "https://cdn.meeshy.com/audio/abc123.wav",                 │    │
│  │     "duration_seconds": 2.3,                                                 │    │
│  │     "voice_similarity": 0.87,                                                │    │
│  │     "processing_time_ms": 3200                                               │    │
│  │   }                                                                          │    │
│  │                                                                              │    │
│  └──────────────────────────────────┬───────────────────────────────────────────┘    │
│                                     │                                                │
│                                     │ 8. Decode & Play Audio                         │
│                                     │                                                │
│                                     ▼                                                │
│                              ┌─────────────┐                                         │
│                              │    User     │                                         │
│                              │   Hears     │                                         │
│                              │   Cloned    │                                         │
│                              │   Voice     │                                         │
│                              └─────────────┘                                         │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Modèles de Données

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                              DATA MODELS                                             │
│                                                                                      │
│  ═══════════════════════════════════════════════════════════════════════════════    │
│                                                                                      │
│   REQUEST MODELS                                                                     │
│   ──────────────                                                                     │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  VoiceTranslationRequest                                                     │   │
│   │  ───────────────────────────────────────────────────────────────────────    │   │
│   │                                                                              │   │
│   │  audio: str                    # Base64 encoded audio data                   │   │
│   │  audio_format: str = "wav"     # wav, mp3, m4a, flac                        │   │
│   │  source_language: str | None   # Auto-detect if None                        │   │
│   │  target_language: str          # Required: en, fr, es, de...                │   │
│   │  voice_profile_id: str | None  # Use cached voice profile                   │   │
│   │  options: TranslationOptions   # Additional options                         │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  TranslationOptions                                                          │   │
│   │  ───────────────────────────────────────────────────────────────────────    │   │
│   │                                                                              │   │
│   │  quality: str = "balanced"     # fast, balanced, high                       │   │
│   │  preserve_emotion: bool = True # Maintain emotional tone                    │   │
│   │  return_audio_url: bool = True # Return CDN URL                             │   │
│   │  return_base64: bool = True    # Return Base64 audio                        │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ═══════════════════════════════════════════════════════════════════════════════    │
│                                                                                      │
│   RESPONSE MODELS                                                                    │
│   ───────────────                                                                    │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  VoiceTranslationResponse                                                    │   │
│   │  ───────────────────────────────────────────────────────────────────────    │   │
│   │                                                                              │   │
│   │  job_id: str                   # Unique job identifier                       │   │
│   │  status: str                   # pending, processing, completed, failed     │   │
│   │  original_text: str            # Transcribed text                           │   │
│   │  translated_text: str          # Translated text                            │   │
│   │  source_language: str          # Detected/provided source language          │   │
│   │  target_language: str          # Target language                            │   │
│   │  audio_base64: str | None      # Base64 encoded output audio                │   │
│   │  audio_url: str | None         # CDN URL to audio file                      │   │
│   │  duration_seconds: float       # Output audio duration                      │   │
│   │  voice_similarity: float       # 0.0 - 1.0 similarity score                 │   │
│   │  processing_time_ms: int       # Total processing time                      │   │
│   │  timestamps: ProcessingTimestamps  # Detailed timing                        │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  ProcessingTimestamps                                                        │   │
│   │  ───────────────────────────────────────────────────────────────────────    │   │
│   │                                                                              │   │
│   │  preprocessing_ms: int         # Audio preprocessing time                   │   │
│   │  transcription_ms: int         # Whisper STT time                           │   │
│   │  translation_ms: int           # Translation API time                       │   │
│   │  voice_cloning_ms: int         # XTTS-v2 generation time                    │   │
│   │  postprocessing_ms: int        # Encoding and upload time                   │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ═══════════════════════════════════════════════════════════════════════════════    │
│                                                                                      │
│   DATABASE MODELS                                                                    │
│   ───────────────                                                                    │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  VoiceProfile (PostgreSQL)                                                   │   │
│   │  ───────────────────────────────────────────────────────────────────────    │   │
│   │                                                                              │   │
│   │  id: UUID (PK)                                                               │   │
│   │  user_id: UUID (FK)                                                          │   │
│   │  name: str                                                                   │   │
│   │  pitch_hz: float                                                             │   │
│   │  voice_type: str               # low, medium, high                          │   │
│   │  brightness: float                                                           │   │
│   │  embedding_path: str           # S3 path to speaker embedding               │   │
│   │  reference_audio_path: str     # S3 path to reference audio                 │   │
│   │  created_at: datetime                                                        │   │
│   │  updated_at: datetime                                                        │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────┐   │
│   │  TranslationJob (PostgreSQL)                                                 │   │
│   │  ───────────────────────────────────────────────────────────────────────    │   │
│   │                                                                              │   │
│   │  id: UUID (PK)                                                               │   │
│   │  user_id: UUID (FK)                                                          │   │
│   │  status: str                   # pending, processing, completed, failed     │   │
│   │  source_language: str                                                        │   │
│   │  target_language: str                                                        │   │
│   │  original_text: str                                                          │   │
│   │  translated_text: str                                                        │   │
│   │  input_audio_path: str                                                       │   │
│   │  output_audio_path: str                                                      │   │
│   │  voice_similarity: float                                                     │   │
│   │  processing_time_ms: int                                                     │   │
│   │  error_message: str | None                                                   │   │
│   │  created_at: datetime                                                        │   │
│   │  completed_at: datetime | None                                               │   │
│   │                                                                              │   │
│   └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Configuration Docker

```yaml
# docker-compose.yml

version: '3.8'

services:
  # ═══════════════════════════════════════════════════════════════
  # TRANSLATOR SERVICE (GPU)
  # ═══════════════════════════════════════════════════════════════
  translator:
    build:
      context: .
      dockerfile: docker/Dockerfile.gpu
    ports:
      - "8000:8000"
    environment:
      - DEEPL_API_KEY=${DEEPL_API_KEY}
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/translator
      - S3_BUCKET=${S3_BUCKET}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - CUDA_VISIBLE_DEVICES=0
    volumes:
      - ./models:/app/models
      - ./cache:/app/cache
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - redis
      - postgres
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ═══════════════════════════════════════════════════════════════
  # REDIS (Cache & Queue)
  # ═══════════════════════════════════════════════════════════════
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # ═══════════════════════════════════════════════════════════════
  # POSTGRESQL (Database)
  # ═══════════════════════════════════════════════════════════════
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=translator
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  redis_data:
  postgres_data:
```

---

## 8. Métriques de Performance

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                      │
│                           PERFORMANCE METRICS                                        │
│                                                                                      │
│  ═══════════════════════════════════════════════════════════════════════════════    │
│                                                                                      │
│   LATENCE PAR ÉTAPE (pour 10s d'audio input → 5s output)                            │
│   ──────────────────────────────────────────────────────────                        │
│                                                                                      │
│   ┌────────────────────┬─────────────┬─────────────┬─────────────────────────────┐  │
│   │      ÉTAPE         │    CPU      │    GPU      │         NOTES               │  │
│   ├────────────────────┼─────────────┼─────────────┼─────────────────────────────┤  │
│   │ Preprocessing      │   ~200ms    │   ~200ms    │ FFmpeg decode + normalize   │  │
│   │ Whisper STT        │   ~3000ms   │   ~500ms    │ whisper-base model          │  │
│   │ Translation        │   ~200ms    │   ~200ms    │ DeepL API call              │  │
│   │ XTTS-v2 Clone      │   ~8000ms   │   ~2000ms   │ Voice synthesis             │  │
│   │ Postprocessing     │   ~100ms    │   ~100ms    │ Encode + upload             │  │
│   ├────────────────────┼─────────────┼─────────────┼─────────────────────────────┤  │
│   │ TOTAL              │  ~11.5s     │   ~3.0s     │ End-to-end latency          │  │
│   └────────────────────┴─────────────┴─────────────┴─────────────────────────────┘  │
│                                                                                      │
│  ═══════════════════════════════════════════════════════════════════════════════    │
│                                                                                      │
│   UTILISATION MÉMOIRE                                                                │
│   ───────────────────                                                                │
│                                                                                      │
│   ┌────────────────────┬─────────────┬─────────────┐                                │
│   │      MODEL         │    RAM      │    VRAM     │                                │
│   ├────────────────────┼─────────────┼─────────────┤                                │
│   │ Whisper (base)     │   ~1.5GB    │   ~1.0GB    │                                │
│   │ XTTS-v2            │   ~3.0GB    │   ~2.5GB    │                                │
│   │ Runtime overhead   │   ~1.0GB    │   ~0.5GB    │                                │
│   ├────────────────────┼─────────────┼─────────────┤                                │
│   │ TOTAL              │   ~5.5GB    │   ~4.0GB    │                                │
│   └────────────────────┴─────────────┴─────────────┘                                │
│                                                                                      │
│  ═══════════════════════════════════════════════════════════════════════════════    │
│                                                                                      │
│   QUALITÉ VOCALE                                                                     │
│   ──────────────                                                                     │
│                                                                                      │
│   ┌────────────────────┬─────────────┬─────────────────────────────────────────┐    │
│   │   VOICE TYPE       │ SIMILARITY  │              NOTES                      │    │
│   ├────────────────────┼─────────────┼─────────────────────────────────────────┤    │
│   │ Male (low pitch)   │   85-90%    │ Best results with >6s reference         │    │
│   │ Male (medium)      │   88-93%    │ Optimal voice type                      │    │
│   │ Female (medium)    │   85-92%    │ Good quality                            │    │
│   │ Female (high)      │   82-88%    │ Slightly lower for very high pitch      │    │
│   │ Child              │   75-85%    │ More variation, needs longer reference  │    │
│   └────────────────────┴─────────────┴─────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Langues Supportées

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│              SUPPORTED LANGUAGES (XTTS-v2)                       │
│                                                                  │
│  ┌──────┬─────────────┬──────────────────────────────────────┐  │
│  │ CODE │   LANGUAGE  │              QUALITY                 │  │
│  ├──────┼─────────────┼──────────────────────────────────────┤  │
│  │  en  │  English    │  ★★★★★  Excellent                    │  │
│  │  fr  │  French     │  ★★★★★  Excellent                    │  │
│  │  es  │  Spanish    │  ★★★★★  Excellent                    │  │
│  │  de  │  German     │  ★★★★☆  Very Good                    │  │
│  │  it  │  Italian    │  ★★★★☆  Very Good                    │  │
│  │  pt  │  Portuguese │  ★★★★☆  Very Good                    │  │
│  │  pl  │  Polish     │  ★★★☆☆  Good                         │  │
│  │  tr  │  Turkish    │  ★★★☆☆  Good                         │  │
│  │  ru  │  Russian    │  ★★★★☆  Very Good                    │  │
│  │  nl  │  Dutch      │  ★★★☆☆  Good                         │  │
│  │  cs  │  Czech      │  ★★★☆☆  Good                         │  │
│  │  ar  │  Arabic     │  ★★★☆☆  Good                         │  │
│  │  zh  │  Chinese    │  ★★★★☆  Very Good                    │  │
│  │  ja  │  Japanese   │  ★★★★☆  Very Good                    │  │
│  │  ko  │  Korean     │  ★★★☆☆  Good                         │  │
│  │  hu  │  Hungarian  │  ★★★☆☆  Good                         │  │
│  └──────┴─────────────┴──────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

*Document Version: 1.0*
*XTTS Model: tts_models/multilingual/multi-dataset/xtts_v2*
*Last Updated: 2026-01-02*
