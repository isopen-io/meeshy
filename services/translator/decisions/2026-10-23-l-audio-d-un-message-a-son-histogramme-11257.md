## L'audio d'un message a son histogramme : whisper, nllb, tts (2026-10-23, #11257)

### Décision

- **L'histogramme.** `audio_pipeline_seconds{stage}` (`prometheus-client`, déjà déclaré dans `pyproject.toml`) vit dans `src/utils/audio_pipeline_metrics.py`, avec un registre dédié. Il mesure le temps sur `time.perf_counter`, à la réussite comme à l'échec. L'étiquette `stage` ne prend que `whisper`, `nllb` et `tts` : aucun texte, aucune langue, aucun identifiant.
- **Où sont posés les décorateurs.** Ils sont sur les appels réels, pas sur les étapes qui consultent d'abord un cache :
  - `TranscriptionService._run_whisper` ;
  - `TranslationStage._translate_text`, appelé après le cache de traduction ;
  - `UnifiedTTSService.synthesize_with_voice`, par où passent les trois synthèses.
- **Où se lisent les mesures.** `GET /metrics`, monté sur l'application FastAPI du traducteur. Ce port n'est routé par aucun Traefik, et rien n'est poussé.

### Ce qui reste

La mesure avant/après d'un vocal de 30 s (S13, #11268) s'appuie sur cet histogramme, en staging.
