# Module Attachments

Service de gestion des attachements de messages avec support E2EE.

## Architecture

```
attachments/
├── AttachmentService.ts     # 439 lignes - Orchestrateur principal
├── UploadProcessor.ts       # 501 lignes - Upload et chiffrement  
├── MetadataManager.ts       # 337 lignes - Extraction métadonnées
└── index.ts                 # 23 lignes - Exports publics
```

## Utilisation

```typescript
import { AttachmentService, type FileToUpload } from './services/attachments';

const service = new AttachmentService(prisma);

// Upload standard
const result = await service.uploadFile(file, userId);

// Upload chiffré E2EE
const encrypted = await service.uploadEncryptedFile(
  file,
  userId, 
  'e2ee'
);

// Métadonnées complètes
const attachment = await service.getAttachmentWithMetadata(attachmentId);
```

## Modules

### AttachmentService
Orchestrateur principal qui coordonne les opérations.

**Responsabilités:**
- Délégation upload/métadonnées
- Opérations DB (CRUD)
- Association aux messages
- Gestion URLs publiques

### UploadProcessor  
Gestion des uploads et du chiffrement.

**Responsabilités:**
- Validation fichiers (type, taille)
- Génération chemins structurés
- Sauvegarde physique sécurisée
- Upload standard/chiffré (E2EE/hybrid)
- Gestion URLs

**Sécurité:**
- Permissions `chmod 644` (pas d'exécution)
- Validation MIME type
- Limites de taille (2GB max)

### MetadataManager
Extraction de métadonnées par type de fichier.

**Types supportés:**
- **Images**: Dimensions, miniatures (300px)
- **Audio**: Durée, bitrate, codec, canaux
- **Vidéo**: FPS, codec, résolution, durée
- **PDF**: Nombre de pages
- **Texte/Code**: Nombre de lignes

## Chiffrement E2EE

Support de 3 modes:
- `e2ee`: Chiffrement end-to-end complet
- `server`: Chiffrement côté serveur  
- `hybrid`: Double chiffrement (E2EE + serveur)

```typescript
const result = await service.uploadEncryptedFile(
  file,
  userId,
  'e2ee' // ou 'server' ou 'hybrid'
);

// Clés de chiffrement retournées (à envoyer via canal E2EE)
console.log(result.encryptionMetadata.encryptionKey);
```

## Organisation fichiers

Structure hiérarchique: `YYYY/MM/userId/filename_uuid.ext`

Exemple:
```
uploads/attachments/
└── 2026/
    └── 01/
        └── 507f1f77bcf86cd799439011/
            ├── photo_abc123.jpg
            ├── photo_abc123_thumb.jpg
            └── audio_def456.webm.enc
```

## Types exportés

```typescript
// Interfaces upload
type FileToUpload
type UploadResult
type EncryptedUploadResult

// Métadonnées
type AudioMetadata
type VideoMetadata  
type ImageMetadata
type PdfMetadata
type TextMetadata
```

## Migration depuis ancien service

Ancien:
```typescript
import { AttachmentService } from '../services/AttachmentService';
```

Nouveau:
```typescript
import { AttachmentService } from '../services/attachments';
```

L'API publique reste identique, seul le chemin d'import change.
