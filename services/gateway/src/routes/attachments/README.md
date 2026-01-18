# Attachments Routes Module

Ce module gère toutes les routes API pour la gestion des fichiers joints (attachments) dans l'application Meeshy.

## Structure

```
src/routes/attachments/
├── index.ts          # Point d'entrée principal et orchestration
├── types.ts          # Types TypeScript et interfaces (58 lignes)
├── upload.ts         # Routes d'upload de fichiers (273 lignes)
├── download.ts       # Routes de téléchargement et streaming (331 lignes)
├── metadata.ts       # Routes de gestion et métadonnées (386 lignes)
└── translation.ts    # Routes de traduction et transcription (479 lignes)
```

## Modules

### `types.ts`
Définit tous les types TypeScript utilisés par les routes d'attachments:
- `AuthContext`: Contexte d'authentification utilisateur
- `UploadedFile`: Structure de fichier uploadé
- `TranslateBody`: Paramètres de traduction
- `ConversationAttachmentsQuery`: Paramètres de requête pour lister les attachments
- Interfaces de paramètres pour les routes

### `upload.ts`
Gère l'upload de fichiers:
- **POST /attachments/upload** - Upload de fichiers multiples avec métadonnées
- **POST /attachments/upload-text** - Création de fichiers texte à partir de contenu

**Fonctionnalités:**
- Support utilisateurs authentifiés et anonymes
- Extraction automatique de métadonnées (dimensions, durée)
- Validation des permissions pour utilisateurs anonymes
- Parsing de métadonnées client-side

### `download.ts`
Gère le téléchargement et streaming de fichiers:
- **GET /attachments/:attachmentId** - Stream du fichier original
- **GET /attachments/:attachmentId/thumbnail** - Stream de la miniature
- **GET /attachments/file/\*** - Stream par chemin de fichier

**Fonctionnalités:**
- Support Range requests pour audio/vidéo (seeking)
- Headers CORS pour chargement cross-origin
- Cache agressif (1 an, immutable)
- Détection automatique du type MIME
- Support iframe embedding pour PDFs

### `metadata.ts`
Gère les métadonnées et opérations CRUD:
- **GET /attachments/:attachmentId/metadata** - Récupération des métadonnées complètes
- **DELETE /attachments/:attachmentId** - Suppression d'un attachment
- **GET /conversations/:conversationId/attachments** - Liste des attachments d'une conversation

**Fonctionnalités:**
- Vérification de permissions (propriétaire, admin, anonyme)
- Filtrage par type (image, document, audio, video, text)
- Pagination (limit, offset)
- Support utilisateurs authentifiés et anonymes

### `translation.ts`
Gère la traduction et transcription d'attachments:
- **POST /attachments/:attachmentId/translate** - Traduction d'un attachment
- **POST /attachments/:attachmentId/transcribe** - Transcription audio uniquement

**Fonctionnalités:**
- Validation des features utilisateur (canTranslateAudio, canUseVoiceCloning)
- Support audio, image, video, document
- Traduction synchrone ou asynchrone
- Clonage de voix optionnel
- Webhooks pour notifications asynchrones
- Priorités de traduction (1-10)

## Authentification

Le module utilise deux middlewares d'authentification:

### `authOptional`
```typescript
{
  requireAuth: false,
  allowAnonymous: true
}
```
Utilisé pour les routes accessibles aux utilisateurs anonymes (upload, download, liste).

### `authRequired`
```typescript
{
  requireAuth: true,
  allowAnonymous: false
}
```
Utilisé pour les routes nécessitant une authentification (traduction, transcription).

## Initialisation

Le module s'initialise automatiquement via `index.ts`:

```typescript
export async function attachmentRoutes(fastify: FastifyInstance) {
  // Initialisation des services
  const prisma = (fastify as any).prisma;
  const translateService = (fastify as any).zmqClient
    ? new AttachmentTranslateService(prisma, (fastify as any).zmqClient)
    : null;

  // Enregistrement parallèle des routes
  await Promise.all([
    registerUploadRoutes(fastify, authOptional, prisma),
    registerDownloadRoutes(fastify, prisma),
    registerMetadataRoutes(fastify, authRequired, authOptional, prisma),
    registerTranslationRoutes(fastify, authRequired, prisma, translateService),
  ]);
}
```

## Services utilisés

- **AttachmentService**: Gestion CRUD des attachments
- **AttachmentTranslateService**: Traduction d'attachments (audio, image, video, document)
- **UserFeaturesService**: Validation des permissions utilisateur
- **PrismaClient**: Accès à la base de données

## Permissions utilisateurs anonymes

Les utilisateurs anonymes peuvent interagir avec les attachments selon les permissions du share link:

- `allowAnonymousFiles`: Upload de fichiers non-image
- `allowAnonymousImages`: Upload d'images
- `allowViewHistory`: Visualisation de l'historique des attachments

## Métadonnées supportées

Lors de l'upload, les métadonnées suivantes peuvent être fournies:

- **Images**: `width`, `height`, dimensions
- **Audio/Video**: `duration`, codec, bitrate
- **Tous**: informations de fichier (taille, type MIME)

## Codes HTTP

- **200**: Succès
- **206**: Partial Content (Range requests)
- **400**: Requête invalide (pas de fichiers, paramètres manquants)
- **401**: Authentification requise
- **403**: Permission refusée
- **404**: Resource non trouvée
- **500**: Erreur serveur
- **501**: Non implémenté (type d'attachment non supporté pour traduction)
- **503**: Service indisponible (service de traduction non initialisé)

## Migration depuis l'ancien fichier

L'ancien fichier `src/routes/attachments.ts` (1,548 lignes) redirige maintenant vers ce module:

```typescript
export { attachmentRoutes } from './attachments/index';
```

Cette approche assure la rétrocompatibilité sans modification du code appelant.

## Optimisations

- **Promise.all()**: Enregistrement parallèle des routes pour démarrage rapide
- **Streaming**: Lecture de fichiers par stream pour économie mémoire
- **Cache**: Headers de cache agressifs pour performances réseau
- **Types forts**: Aucun usage de `any`, sauf pour contextes Fastify
- **Validation**: Schémas OpenAPI complets pour documentation automatique
