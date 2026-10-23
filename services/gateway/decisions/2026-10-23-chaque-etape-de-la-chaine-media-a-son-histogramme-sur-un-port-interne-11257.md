## Chaque étape de la chaîne média a son histogramme, lu sur un port interne (2026-10-23, #11257)

### Contexte

Aucune mesure Prometheus n'existait. Les objectifs de temps de la chaîne média (`docs/video-calls/README.md:164`) ne se vérifiaient nulle part.

### Décision

1. **`media_stage_seconds{stage,kind}`** (`prom-client` 15.1.3, `services/metrics/mediaStageMetrics.ts`) :
   - étapes : `probe`, `thumbnail`, `variants`, `exif`, `audio`, `transcode` ;
   - genres : `image`, `video`, `audio`, `document`, `other` ;
   - le temps se lit sur l'horloge monotone et compte à la réussite comme à l'échec ;
   - les étiquettes ne prennent que ces valeurs bornées : aucun identifiant, aucun nom de fichier, aucun type MIME brut.
2. **Les sondes vivent chez l'appelé, pas chez l'appelant.**
   - Emplacements : `MetadataManager` (sonde des pistes, extraction des métadonnées, vignettes, variantes), `media-metadata-strip` (retrait des métadonnées, sur tampon comme sur fichier) et `media-renditions` (l'appel à ffmpeg du transcodage).
   - Les trois portes d'entrée sont donc mesurées (multipart, résumable, chiffré côté serveur), sans toucher `UploadProcessor` ni `tus-handler`.
   - L'étape `audio` est posée par S4 (#11259, PR #12284), qui réécrit la normalisation. Ce sera une ligne : `timeMediaStage('audio', 'audio', …)` autour de son appel ffmpeg.
3. **Un port INTERNE, jamais l'API.**
   - Traefik route `gate.<domaine>` vers le port 3000, tous chemins compris : un `/metrics` monté sur Fastify serait public.
   - Les mesures se servent donc par un serveur HTTP à part (`services/metrics/metricsServer.ts`), accroché au cycle de vie de la passerelle par `registerAllRoutes` :
     - OPT-IN : rien n'écoute sans `METRICS_PORT` ;
     - `127.0.0.1` par défaut, `METRICS_HOST=0.0.0.0` pour un collecteur du réseau des conteneurs ;
     - jamais le port de l'API ;
     - `GET /metrics` seul.
   - Rien n'est poussé : aucune mesure ne quitte le serveur sans qu'un collecteur interne vienne la lire. Le port n'est pas dans le manifeste des routes, qui recense l'API.
4. **Traducteur** : `audio_pipeline_seconds{stage}` (`whisper`, `nllb`, `tts`). Voir `services/translator/decisions/2026-10-23-l-audio-d-un-message-a-son-histogramme-11257.md`.
5. **Charge** : `tests/load/media-upload.js` (téléversement de 5 Mo) et `tests/load/vocal-30s.js` (vocal de 30 s jusqu'à sa transcription servie), en k6, contre le staging seulement (la production est refusée par le script).

### Ce qui reste

- Aucun collecteur Prometheus ne tourne encore en staging : poser `METRICS_PORT` et un collecteur interne relève d'un lot d'infrastructure.
- Les p95 ne sont pas mesurés ici : le scénario est dans l'issue.
