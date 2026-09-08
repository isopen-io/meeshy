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

## 2026-09-08: Verrou de synthèse Chatterbox — acquisition hors event loop (#5610)
**Statut**: Accept
**Contexte**: `meeshy-translator` est resté bloqué 7 jours en production (2026-08-31 → mesuré
2026-09-07), CPU ~0%, `/live` injoignable — alors que `/live` ne fait aucune I/O. Tous les
workers ZMQ tournent en coroutines sur le MÊME thread d'event loop (`asyncio.create_task`,
pas des process/threads séparés). `ChatterboxBackend.synthesize()` sérialise ses appels
avec `self._synthesis_lock` — un `threading.Lock()` choisi (2025-01, cf. deadlock
2026-05-28) pour rester compatible avec `run_in_executor`. Le watchdog `with_synth_watchdog`
(180s, `asyncio.wait_for`) devait border un `generate()` bloqué et laisser sortir le `with
self._synthesis_lock:` pour libérer le verrou. Mais `with lock:` appelle `lock.acquire()`
SYNCHRONE sur le thread appelant : quand une deuxième synthèse atteint cette ligne pendant
que la première est bloquée dans l'executor, son `acquire()` gèle tout le thread d'event
loop — y compris le minuteur du watchdog de la PREMIÈRE synthèse, qui a besoin de ce même
thread pour jamais expirer. Le verrou ne se libère donc jamais, et rien d'autre sur ce
thread ne peut plus tourner, même un endpoint sans I/O.
**Decision**: Remplacer `with self._synthesis_lock:` par
`await loop.run_in_executor(None, self._synthesis_lock.acquire)` suivi d'un `try/finally`
explicite (`chatterbox_backend.py`) — le blocage a lieu sur un thread de l'executor, pas sur
le thread d'event loop, qui reste réactif (watchdog compris) pendant l'attente. Le
`torchaudio.save()` qui suivait la génération, jusqu'ici hors de toute borne, est désormais
lui aussi couvert par `with_synth_watchdog` (`DEFAULT_TTS_SAVE_TIMEOUT_S`, 30s par défaut,
`TTS_SAVE_TIMEOUT_S`) — un disque bloqué doit aussi libérer le verrou. Un service `autoheal`
(image `willfarrell/autoheal`) est ajouté aux compositions dev/staging/prod : il redémarre
tout conteneur marqué `autoheal=true` passé `unhealthy`, palliant le fait que
`restart: unless-stopped` ne réagit qu'à une SORTIE de process, jamais à un healthcheck
rouge — un conteneur figé mais non sorti (le cas vécu) ne se relève jamais tout seul sans
lui.
**Alternatives rejetées**: `asyncio.Lock()` seul (ne protège pas contre l'accès concurrent
depuis un thread d'executor si `synthesize()` était un jour appelé hors du loop principal —
le commentaire d'origine documentait déjà ce risque) ; tuer le thread executor bloqué (Python
n'expose aucune API pour interrompre un thread OS en cours d'exécution C — `generate()` peut
rester un thread « fantôme » jusqu'au redémarrage du process, d'où l'autoheal en filet de
sécurité plutôt qu'une garantie de libération à 100%) ; multiprocessing pour isoler chaque
synthèse (changement d'architecture disproportionné pour ce correctif, cause racine déjà
neutralisée par le changement d'acquisition).
**Cons**: Un `generate()` réellement wedgé (bug amont chatterbox/torch, cf. répétition de
token observée dans l'incident) laisse un thread executor occupé jusqu'au redémarrage du
process — l'autoheal borne la durée totale d'indisponibilité (prochain healthcheck rouge),
il ne récupère pas la mémoire du thread fantôme sans redémarrage.
**Preuve**: `services/translator/tests/test_chatterbox_synthesis_lock_non_blocking.py` —
isole le mécanisme (acquisition via executor vs. `with lock:` synchrone) sans dépendre de
`chatterbox`/`torch`, indisponibles dans certains environnements d'exécution.

## 2026-09: Plafond de duree audio - 10 minutes, refus avant acquisition (#3668)
**Statut**: Accept
**Contexte**: Aucune limite de duree ni de taille n'existait cote translator pour un audio transcrit/traduit ; seul le watchdog TTS (180s, `TTS_SYNTH_TIMEOUT_S`) bornait la synthese, sans borner transcription ni traduction. Un audio arbitrairement long (upload direct, client hors recorder web) pouvait donc immobiliser un worker indefiniment.
**Decision**: `MessageLimits.MAX_AUDIO_DURATION_MS` (config/message_limits.py, defaut 600000ms = 10 min, override `MAX_AUDIO_DURATION_MS`) aligne sur le hard limit du recorder web (`MAX_ALLOWED_DURATION` dans `apps/web/components/audio/AudioRecorderCard.tsx`) pour ne jamais refuser un audio qu'un client Meeshy peut legitimement produire. `zmq_audio_handler._handle_audio_process_request` refuse AVANT l'acquisition audio (le cout qu'un audio trop long ferait payer inutilement) via `validate_audio_duration()`, en publiant `audio_process_error` (`error_code: "audio_too_long"`) avec un message utilisateur clair, qui remonte au client par `audio:translation-failed` (gateway).
**Alternatives rejetees**: Ecreter la duree en base (`Math.min(duration, cap)`) sans rejeter — corrigerait une metadonnee sans jamais arreter le traitement couteux, exactement le defaut qu'un test jumeau (`routes/posts/__tests__/audio.duration.test.ts`, gateway) documente pour le chemin bibliotheque de sons ; borner seulement au niveau TTS — laisse transcription/traduction d'un audio demesure tourner sans controle.
**Cons**: Un audio absent de `audioDurationMs` (0/None) n'est pas refuse ici — l'absence de mesure n'est pas une violation ; un client bugue qui n'envoie jamais la duree contourne le plafond, mais n'echappe pas au watchdog TTS existant.

## 2026-09: Whisper — Settings devient la seule source du modele/device/compute_type (#3666)
**Statut**: Accept
**Contexte**: `Settings.whisper_model` valait `distil-large-v3` (`float16`, device `auto`) et n'etait lu par AUCUN appelant : `TranscriptionService.__init__` redefinissait ses propres defauts (`large-v3`, `cpu`, `int8`) et relisait `os.getenv()` directement, ligne par ligne. Les deux lisaient bien la MEME variable d'environnement quand elle etait posee, donc le defaut mort ne se voyait que par son ABSENCE — exactement le cas de la prod, qui tourne `large-v3` int8 CPU sans que personne n'ait jamais pu le changer en editant `settings.py`.
**Decision**: `Settings.whisper_model` / `whisper_device` / `whisper_compute_type` passent a `large-v3` / `cpu` / `int8` — les valeurs REELLEMENT deployees, pas une aspiration non mesuree (`distil-large-v3`/`float16` n'a jamais tourne en prod, et float16 n'est de toute facon pas supporte par ctranslate2 sur CPU). `TranscriptionService.__init__` n'a plus de defauts a lui : ses trois parametres deviennent optionnels et, si omis, viennent de `get_settings()` — le meme point d'entree que `translation_ml_service.py`/`tts_service.py`/`voice_clone_service.py`.
**Alternatives rejetees**: Adopter `distil-large-v3`/`float16` (les valeurs de `Settings`) comme nouveau defaut de prod — aurait change le modele et le device REELLEMENT utilises sans aucune mesure de latence/qualite a l'appui, l'inverse de ce qu'un changement de modele exige.
**Cons**: Le critere de fin de #3666 demandait aussi une latence de transcription mesuree avant/apres — non faite ici, l'environnement ne portant ni `torch` ni `faster-whisper` ; suivi ouvert en #3666 (comment de cloture) plutot que laisse tacite.
**Preuve**: `tests/test_06_transcription_service.py::test_transcription_service_reads_model_config_from_settings` — construit `TranscriptionService` avec `get_settings` remplace, verifie que `model_size`/`device`/`compute_type` viennent de la valeur substituee (rouge avant le correctif : `get_settings` n'existait pas dans le module).
