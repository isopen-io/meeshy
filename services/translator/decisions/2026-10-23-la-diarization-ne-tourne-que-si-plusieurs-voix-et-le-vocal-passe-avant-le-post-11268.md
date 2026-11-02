## La diarization ne tourne que si plusieurs voix sont entendues, et le vocal d'un message passe avant le média d'un post (2026-10-23, #11268)

### Contexte

- **La diarization tournait sur chaque audio.** Par défaut, SpeechBrain calcule une empreinte ECAPA par seconde puis les regroupe, en parallèle de Whisper. La quasi-totalité des vocaux n'a qu'une voix.
- **Aucune priorité entre les requêtes.** Chaque requête `audio_process` lançait sa tâche sans attendre. Les médias d'un post arrivés en rafale partageaient donc le processeur avec le vocal qu'un lecteur attend dans une conversation.

### Décision

1. **La sonde multi-locuteurs** (`services/audio_pipeline/speaker_probe.py`).
   - Elle calcule quatre empreintes ECAPA de 2 s, réparties du début à la fin. Si deux d'entre elles ont une similarité cosinus sous 0,6, la diarization complète tourne. Sinon, la transcription part sans diarization.
   - Un audio de moins de 8 s n'est pas sondé : il est traité comme une seule voix.
   - Une sonde en échec retombe sur la diarization complète : on ne perd jamais un locuteur par économie.
   - `DIARIZATION_MODE=always` rétablit l'ancien comportement, et `ENABLE_DIARIZATION=false` coupe tout, comme avant.
2. **L'admission à priorités** (`utils/audio_admission.py`).
   - Les requêtes `audio_process` entrent par une admission à concurrence bornée (`AUDIO_PROCESS_CONCURRENCY`, 2 par défaut).
   - Quand une place se libère, le vocal d'un message (sans `postId`) part avant le média d'un post ; l'ordre d'arrivée départage ensuite.
   - Une tâche qui échoue rend sa place.
3. **Le défaut `WHISPER_MODEL` reste `large-v3`.**
   - Le critère exige une mesure de qualité avant de passer à `large-v3-turbo`, et le translator n'a aucun jeu de test STT : `src/benchmark` mesure la traduction, pas la transcription.
   - Le changement attend ce jeu de test (issue de suivi). `WHISPER_MODEL=large-v3-turbo` reste réglable par l'environnement (`faster-whisper` 1.2.1).

### Non mesuré

- Le p95 d'un vocal de 30 s avant/après, en staging. Il se lit sur `audio_pipeline_seconds` (#11257) avec `tests/load/vocal-30s.js`, en comparant `DIARIZATION_MODE=always` et `auto`.
- Le seuil de 0,6 est argumenté (une même voix dépasse en pratique 0,6 sur ECAPA), non mesuré sur les vocaux de Meeshy.
