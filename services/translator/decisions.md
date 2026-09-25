# Decisions - services/translator (FastAPI ML Service)

> **Un fichier par décision, sous `services/translator/decisions/` (#7711).** Ce fichier garde son préambule et la CARTE des décisions prises avant le 2026-09-25 ; il ne reçoit plus de décision : la garde `journal-one-file-per-entry-guard` (passerelle) rougit sur tout titre `## ` posé ici.
>
> **Écrire une décision** : créer `services/translator/decisions/<AAAA-MM-JJ>-<slug>.md`, dont la première ligne est `## <AAAA-MM-JJ> : <titre>`. Aucune ligne à ajouter ici.

**Carte des décisions, dans l'ordre du fichier d'origine**

- [2025-01: Framework - FastAPI + Uvicorn](decisions/2025-01-framework-fastapi-uvicorn.md)
- [2025-01: STT - Faster-Whisper (pas OpenAI Whisper)](decisions/2025-01-stt-faster-whisper-pas-openai-whisper.md)
- [2025-01: Translation - NLLB-200](decisions/2025-01-translation-nllb-200.md)
- [2025-01: TTS - Multi-backend routing par langue](decisions/2025-01-tts-multi-backend-routing-par-langue.md)
- [2025-01: IPC - ZeroMQ PULL/PUB](decisions/2025-01-ipc-zeromq-pull-pub.md)
- [2025-01: Worker Pool - Pool Manager custom avec batching](decisions/2025-01-worker-pool-pool-manager-custom-avec-batching.md)
- [2025-01: Cache - Redis avec fallback mmoire](decisions/2025-01-cache-redis-avec-fallback-mmoire.md)
- [2025-01: Voice Cloning - OpenVoice V2](decisions/2025-01-voice-cloning-openvoice-v2.md)
- [2025-01: Package Manager - uv (pas pip)](decisions/2025-01-package-manager-uv-pas-pip.md)
- [2025-01: Singletons - Pattern pour ressources coteuses](decisions/2025-01-singletons-pattern-pour-ressources-coteuses.md)
- [2025-01: Config - ~50 env vars centralises](decisions/2025-01-config-50-env-vars-centralises.md)
- [2025-01: Audio Pipeline - 3 tapes linaires avec cache intermdiaire](decisions/2025-01-audio-pipeline-3-tapes-linaires-avec-cache-intermdiaire.md)
- [2026-09-08: Verrou de synthèse Chatterbox — acquisition hors event loop (#5610)](decisions/2026-09-08-verrou-de-synthese-chatterbox-acquisition-hors-event-loop-5610.md)
- [2026-09: Plafond de duree audio - 10 minutes, refus avant acquisition (#3668)](decisions/2026-09-plafond-de-duree-audio-10-minutes-refus-avant-acquisition-3668.md)
- [2026-09: Whisper — Settings devient la seule source du modele/device/compute_type (#3666)](decisions/2026-09-whisper-settings-devient-la-seule-source-du-modele-device-compute-type.md)
- [2026-09-08: gRPC — code mort retire (#3664), dependances gardees pour l'instant (#5710)](decisions/2026-09-08-grpc-code-mort-retire-3664-dependances-gardees-pour-l-instant-5710.md)
