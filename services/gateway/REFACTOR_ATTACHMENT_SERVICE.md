# Refactorisation AttachmentService

## Objectif
Refactoriser `src/services/AttachmentService.ts` (1,294 lignes) en modules maintenables < 800 lignes.

## Structure cible

```
src/services/attachments/
├── AttachmentService.ts     # 439 lignes - Orchestrateur principal
├── UploadProcessor.ts       # 501 lignes - Gestion upload et chiffrement
├── MetadataManager.ts       # 337 lignes - Extraction métadonnées
└── index.ts                 # 23 lignes - Exports publics
```

## Répartition des responsabilités

### AttachmentService.ts (Orchestrateur)
- Coordonne UploadProcessor et MetadataManager
- Gère les opérations DB (récupération, association, suppression)
- Expose l'API publique du service
- Délègue upload et métadonnées aux modules spécialisés

### UploadProcessor.ts (Upload & Chiffrement)
- Validation des fichiers
- Génération des chemins structurés (YYYY/mm/userId/filename)
- Sauvegarde physique avec permissions sécurisées (chmod 644)
- Upload standard et chiffré (E2EE)
- Génération des URLs publiques et relatives
- Upload multiple et création d'attachments texte

### MetadataManager.ts (Métadonnées)
- Génération de miniatures (images)
- Extraction métadonnées images (dimensions)
- Extraction métadonnées audio (durée, bitrate, codec, channels)
- Extraction métadonnées vidéo (fps, codec, résolution)
- Extraction métadonnées PDF (nombre de pages)
- Extraction métadonnées texte/code (nombre de lignes)

## Exports publics (index.ts)

```typescript
export { AttachmentService } from './AttachmentService';
export { UploadProcessor } from './UploadProcessor';
export { MetadataManager } from './MetadataManager';

export type {
  FileToUpload,
  UploadResult,
  EncryptedUploadResult,
} from './UploadProcessor';

export type {
  AudioMetadata,
  VideoMetadata,
  ImageMetadata,
  PdfMetadata,
  TextMetadata,
} from './MetadataManager';
```

## Migrations d'imports

Ancien import:
```typescript
import { AttachmentService } from '../services/AttachmentService';
```

Nouveau import:
```typescript
import { AttachmentService } from '../services/attachments';
```

## Fichiers mis à jour

### Routes
- `src/routes/attachments/upload.ts`
- `src/routes/attachments/download.ts`
- `src/routes/attachments/metadata.ts`
- `src/routes/conversations/messages.ts`
- `src/routes/conversations/messages-advanced.ts`
- `src/routes/conversations.ts`
- `src/routes/maintenance.ts`
- `src/routes/messages.ts`

### Services
- `src/services/MaintenanceService.ts`
- `src/socketio/MeeshySocketIOManager.ts`

### Tests
- `src/__tests__/resilience/status-resilience.test.ts`
- `src/__tests__/unit/services/AttachmentService.test.ts`
- `src/__tests__/unit/MaintenanceService.test.ts`
- `src/__tests__/unit/StatusService.test.ts`

## Composition forte

L'AttachmentService utilise la composition pour déléguer:
```typescript
export class AttachmentService {
  private uploadProcessor: UploadProcessor;
  private metadataManager: MetadataManager;
  private encryptionService: AttachmentEncryptionService;

  constructor(prisma: PrismaClient) {
    this.uploadProcessor = new UploadProcessor(prisma);
    this.metadataManager = new MetadataManager(this.uploadBasePath);
    this.encryptionService = getAttachmentEncryptionService(prisma);
  }

  // Délégation upload
  async uploadFile(...) {
    return this.uploadProcessor.uploadFile(...);
  }
}
```

## Types forts

Tous les modules utilisent des types stricts:
- `FileToUpload` - Interface de fichier à uploader
- `UploadResult` - Résultat d'upload standard
- `EncryptedUploadResult` - Résultat d'upload chiffré (E2EE)
- `AudioMetadata`, `VideoMetadata`, `ImageMetadata` - Métadonnées spécifiques

## Ancien fichier

L'ancien fichier a été renommé:
```
src/services/AttachmentService.ts → src/services/AttachmentService.ts.old
```

Il peut être supprimé après validation complète de la refactorisation.

## Bénéfices

1. **Maintenabilité**: Modules < 800 lignes, responsabilités claires
2. **Testabilité**: Modules isolés plus faciles à tester
3. **Réutilisabilité**: MetadataManager et UploadProcessor indépendants
4. **Type Safety**: Exports sélectifs avec types forts
5. **Évolutivité**: Ajout de nouveaux types de métadonnées facilité

## Prochaines étapes

1. Exécuter les tests unitaires: `npm test -- AttachmentService`
2. Vérifier le build: `npm run build`
3. Valider les routes attachments en dev
4. Supprimer l'ancien fichier après validation
