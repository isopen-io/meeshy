# Resumable Upload: 30 fichiers / 4 GB par fichier

**Date**: 2026-02-21
**Status**: Approved

## Objectif

Permettre l'upload de jusqu'a 30 fichiers simultanement avec des videos allant jusqu'a 4 GB, sur webapp, iOS et backend, avec reprise automatique en cas d'interruption.

## Problemes actuels

| Probleme | Impact |
|----------|--------|
| `toBuffer()` charge le fichier entier en RAM | 4 GB = crash serveur |
| Pas de chunked upload | Perte totale si connexion coupee |
| UPLOAD_LIMITS = 2 GB | Insuffisant pour videos 4 GB |
| XHR envoie tout en un seul POST | Timeout probable sur gros fichiers |
| iOS n'upload pas reellement les fichiers | Fichiers ajoutes localement sans envoi au serveur |
| Pas de queue cote client | 30 fichiers = 30 connexions simultanees |

## Decisions

- **Protocole**: tus (open-source, standard, utilise par Vimeo/Cloudflare/Supabase)
- **Resumable**: Oui, reprise automatique via HEAD offset
- **Stockage**: Disque local avec abstraction StorageAdapter (migration S3 future)
- **Concurrence**: Queue de 30 fichiers, 3 uploads paralleles max
- **Chunks**: 10 MB par chunk
- **Backward compat**: Ancien endpoint REST `/attachments/upload` conserve pour petits fichiers (< 50 MB)

## Architecture

```
Client (Web/iOS)                    Gateway (Fastify)
---------------------               --------------------
tus-js-client / TUSKit              @tus/server + @tus/file-store
     |                                      |
     +-- POST /uploads (create)             +-- Cree fichier vide + metadata
     +-- PATCH /uploads/:id (chunks)        +-- Ecrit chunks sur disque (streaming)
     +-- HEAD /uploads/:id (resume)         +-- Retourne offset actuel
     +-- onUploadFinish hook                +-- Post-traitement (metadata, thumbnail, DB)
```

### Flux detaille

1. L'utilisateur choisit jusqu'a 30 fichiers
2. Les fichiers sont mis en file d'attente (3 paralleles max)
3. Chaque fichier uploade en chunks de 10 MB via tus
4. Si interruption, HEAD retourne l'offset, upload reprend
5. A la fin de chaque fichier, le serveur extrait les metadata (ffprobe, sharp)
6. Le client recoit l'ID d'attachment et l'associe au message

## Changements par couche

### 1. packages/shared - Constantes et types

- `UPLOAD_LIMITS.VIDEO = 4294967296` (4 GB)
- `UPLOAD_LIMITS.IMAGE = 4294967296` (4 GB)
- `UPLOAD_LIMITS.AUDIO = 4294967296` (4 GB)
- `UPLOAD_LIMITS.DOCUMENT = 4294967296` (4 GB)
- `UPLOAD_LIMITS.TEXT = 2147483648` (2 GB inchange)
- `UPLOAD_LIMITS.CODE = 2147483648` (2 GB inchange)
- `MAX_FILES_PER_MESSAGE = 30`
- `MAX_CONCURRENT_UPLOADS = 3`
- `TUS_CHUNK_SIZE = 10485760` (10 MB)
- `SMALL_FILE_THRESHOLD = 52428800` (50 MB - seuil pour upload direct vs tus)
- Nouveau type `TusUploadMetadata` pour les metadonnees tus

### 2. services/gateway - Serveur tus

- Installer `@tus/server` + `@tus/file-store`
- Monter sur `/uploads/*` (separe des routes REST)
- Hook `onUploadCreate`: validation (taille, type MIME, auth)
- Hook `onUploadFinish`: extraction metadata -> sauvegarde DB -> deplacement fichier dans structure YYYY/mm/userId/
- Abstraction `StorageAdapter` interface avec `LocalStorageAdapter`
- Cleanup cron: supprimer uploads incomplets > 24h
- L'ancien endpoint `/attachments/upload` REST reste intact
- Le body limit Fastify (50 MB) ne change pas car tus bypass le body parser

### 3. apps/web - Client tus + queue

- Installer `tus-js-client`
- Nouveau service `TusUploadService`:
  - Queue avec max 3 uploads paralleles
  - Progress par fichier (percentage, loaded, total)
  - Progress global (fichiers termines / total)
  - Auto-resume via fingerprinting (localStorage)
  - Fallback sur ancien upload REST pour fichiers < 50 MB
- Nouveau composant `UploadProgressBar` dans le composer
- Mise a jour `AttachmentLimitModal` pour limite de 30 fichiers

### 4. apps/ios - TUSKit + queue

- Installer `TUSKit` via SPM
- Nouveau service `TusUploadManager`:
  - Queue avec max 3 uploads paralleles
  - Background URLSession pour uploads en arriere-plan
  - Progress par fichier avec Combine publishers
  - Resume automatique si app passe en background/foreground
- Mise a jour du composer pour afficher progress par fichier
- PHPicker/fileImporter: pas de limite de selection a 30

### 5. Infrastructure

- Traefik: verifier `client_max_body_size` (doit etre >= 10 MB pour les chunks, pas 4 GB)
- Volume Docker `/app/uploads` (deja configure)
- Dossier temporaire tus: `/app/uploads/.tus-resumable/`
- Cleanup cron pour uploads incomplets

## Ce qui ne change PAS

- L'endpoint `/attachments/upload` REST (backward compat pour petits fichiers)
- Le pipeline audio via WebSocket `message:send-with-attachments`
- Le systeme de chiffrement E2EE
- La structure de stockage disque `YYYY/mm/userId/filename`
- Les types d'attachments et MIME types acceptes
- Le download endpoint `/attachments/:id`

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Saturation disque avec uploads incomplets | Cleanup cron 24h |
| Abus (spam de gros fichiers) | Rate limiting par user + quota si necessaire |
| Memoire serveur pendant metadata extraction | ffprobe en stream, sharp en stream, jamais toBuffer() |
| Compatibilite navigateurs anciens | tus-js-client supporte IE10+ |
| iOS background upload killed par OS | URLSession background task, NSURLSessionConfiguration.background |
