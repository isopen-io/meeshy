# User Preferences API - Système Unifié

## Vue d'ensemble

Le nouveau système de préférences utilisateur utilise une architecture unifiée basée sur :
- **Modèle Prisma** : `UserPreferences` avec 7 champs JSON
- **Validation Zod** : Schemas avec defaults automatiques et validation runtime
- **Factory Router** : Pattern DRY pour générer les routes CRUD
- **Validation GDPR** : Consentements obligatoires pour certaines préférences

## Architecture

### Modèle de Données

```prisma
model UserPreferences {
  id     String @id @default(auto()) @map("_id") @db.ObjectId
  userId String @unique @db.ObjectId

  privacy      Json?  // Paramètres de confidentialité
  audio        Json?  // Transcription, traduction, TTS
  message      Json?  // Formatage, auto-save
  notification Json?  // Préférences de notifications
  video        Json?  // Appels vidéo, qualité, codec
  document     Json?  // Preview, download, storage
  application  Json?  // Thème, langue, UI

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation("UserPreferences", fields: [userId], references: [id], onDelete: Cascade)
}
```

### 7 Catégories de Préférences

1. **Privacy** (`privacy`) - 12 champs
   - Visibilité du profil (online status, last seen, read receipts, typing)
   - Paramètres de contact (requests, invites, calls)
   - Données (analytics, usage data, screenshots, search)

2. **Audio** (`audio`) - 15 champs
   - Transcription (enabled, source, auto-transcribe)
   - Traduction audio (enabled, format)
   - TTS (enabled, speed, pitch)
   - Qualité audio (quality, noise suppression, echo)
   - Profil vocal (enabled, clone quality)

3. **Message** (`message`) - 14 champs
   - Saisie (sendOnEnter, formatting toolbar, markdown)
   - Correction (autocorrect, spellcheck)
   - Aperçus (links, images)
   - Brouillons (save, expiration)
   - Présentation (font size, alignment)
   - Auto-traduction (enabled, languages)

4. **Notification** (`notification`) - 24 champs
   - Canaux (push, email, sound, vibration)
   - Types (12 types de notifications)
   - DND (enabled, start/end time, days)
   - Aperçu (show preview, sender name)
   - Groupement (group notifications, badge)

5. **Video** (`video`) - 18 champs
   - Qualité (quality, bitrate, frame rate, resolution, codec)
   - Affichage (mirror, layout, self-view position)
   - Effets (background blur, virtual background)
   - Performance (hardware acceleration, adaptive bitrate)
   - Comportement (auto start, auto mute)

6. **Document** (`document`) - 14 champs
   - Téléchargement (auto, wifi only, max size)
   - Aperçu (inline, PDF, images, videos)
   - Stockage (quota, auto-delete, retention)
   - Upload (compress images, quality)
   - Sécurité (allowed types, malware scan, external links)

7. **Application** (`application`) - 18 champs
   - Apparence (theme, accent color, font)
   - Langues (interface, system, regional, custom)
   - Mise en page (compact mode, sidebar, avatars)
   - Accessibilité (reduced motion, high contrast, screen reader)
   - Avancé (shortcuts, tutorials, beta features, telemetry)

## Routes API

### Routes Globales

```
GET    /api/v1/me/preferences          # Récupérer toutes les préférences
DELETE /api/v1/me/preferences          # Réinitialiser toutes les préférences
```

### Routes par Catégorie

Chaque catégorie expose 4 routes CRUD :

```
GET    /api/v1/me/preferences/{category}   # Récupérer (retourne defaults si null)
PUT    /api/v1/me/preferences/{category}   # Remplacer complètement
PATCH  /api/v1/me/preferences/{category}   # Mise à jour partielle (merge)
DELETE /api/v1/me/preferences/{category}   # Réinitialiser aux defaults
```

Catégories disponibles : `privacy`, `audio`, `message`, `notification`, `video`, `document`, `application`

### Exemples de Requêtes

#### GET - Récupérer les préférences audio

```http
GET /api/v1/me/preferences/audio
Authorization: Bearer {token}

Response 200:
{
  "success": true,
  "data": {
    "transcriptionEnabled": true,
    "transcriptionSource": "auto",
    "audioTranslationEnabled": false,
    "ttsEnabled": false,
    ...
  }
}
```

#### PUT - Remplacer complètement

```http
PUT /api/v1/me/preferences/audio
Authorization: Bearer {token}
Content-Type: application/json

{
  "transcriptionEnabled": true,
  "transcriptionSource": "server",
  "autoTranscribeIncoming": true,
  ...
}

Response 200:
{
  "success": true,
  "data": { ... }
}
```

#### PATCH - Mise à jour partielle

```http
PATCH /api/v1/me/preferences/audio
Authorization: Bearer {token}

{
  "transcriptionSource": "mobile",
  "ttsSpeed": 1.2
}

Response 200:
{
  "success": true,
  "data": {
    "transcriptionEnabled": true,        # Valeur existante conservée
    "transcriptionSource": "mobile",     # Valeur mise à jour
    "ttsSpeed": 1.2,                     # Valeur mise à jour
    ...
  }
}
```

#### DELETE - Réinitialiser

```http
DELETE /api/v1/me/preferences/audio
Authorization: Bearer {token}

Response 200:
{
  "success": true,
  "message": "audio preferences reset to defaults"
}
```

## Validation de Consentement GDPR

Certaines préférences nécessitent des consentements GDPR. Voir [CONSENT_VALIDATION.md](./CONSENT_VALIDATION.md) pour la documentation complète.

### Exemple de Violation de Consentement

```http
PUT /api/v1/me/preferences/audio
{
  "transcriptionEnabled": true
}

Response 403:
{
  "success": false,
  "error": "CONSENT_REQUIRED",
  "message": "Missing required consents for requested preferences",
  "violations": [
    {
      "field": "transcriptionEnabled",
      "message": "Audio transcription requires voice data consent and feature activation",
      "requiredConsents": [
        "voiceDataConsentAt",
        "audioTranscriptionEnabledAt"
      ]
    }
  ]
}
```

## Gestion des Defaults

Les valeurs par défaut sont définies dans les schemas Zod :

```typescript
import {
  AUDIO_PREFERENCE_DEFAULTS,
  PRIVACY_PREFERENCE_DEFAULTS,
  // ... autres defaults
} from '@meeshy/shared/types/preferences';
```

Comportement :
- Si `UserPreferences` n'existe pas → retourne defaults
- Si champ JSON est `null` → retourne defaults
- Les defaults sont appliqués automatiquement par Zod lors du parse

## Factory Pattern

Le système utilise un factory pour générer les routes CRUD :

```typescript
import { createPreferenceRouter } from './preference-router-factory';

// Génère automatiquement les 4 routes CRUD
fastify.register(
  createPreferenceRouter('audio', AudioPreferenceSchema, AUDIO_PREFERENCE_DEFAULTS),
  { prefix: '/audio' }
);
```

## Tests

### Tests Unitaires
```bash
npm test packages/shared/types/preferences/__tests__/preferences.test.ts
```

### Tests E2E
```bash
npm test services/gateway/src/__tests__/routes/preferences.e2e.test.ts
npm test services/gateway/src/__tests__/routes/preferences-consent.e2e.test.ts
```

### Helper de Tests

```typescript
import { CONSENT_LEVELS, createTestUserWithConsents } from '@/__tests__/helpers/consent-test-helper';

// Créer un utilisateur avec transcription activée
const user = await createTestUserWithConsents(prisma, CONSENT_LEVELS.TRANSCRIPTION);

// Créer un utilisateur avec tous les consentements
const userFull = await createTestUserWithConsents(prisma, CONSENT_LEVELS.FULL);
```

## Schémas Zod

Chaque catégorie a un schema Zod complet avec :
- Validation de types
- Enums pour les valeurs contraintes
- Limites numériques (min/max)
- Patterns regex (ex: format d'heure HH:MM)
- Defaults automatiques

Exemple :

```typescript
export const AudioPreferenceSchema = z.object({
  transcriptionEnabled: z.boolean().default(true),
  transcriptionSource: z.enum(['auto', 'mobile', 'server']).default('auto'),
  ttsSpeed: z.number().min(0.5).max(2.0).default(1.0),
  // ...
});
```

## Migration depuis l'ancien système

### Ancien système (obsolète)
- Modèle : `NotificationPreference`, `UserPreference` (key-value)
- Routes : `/api/notification-preferences`, `/api/user-preferences`

### Nouveau système
- Modèle : `UserPreferences` avec champs JSON
- Routes : `/api/v1/me/preferences/*`
- Validation : Zod + GDPR consents
- Factory pattern : DRY, maintainable

## Fichiers Importants

```
services/gateway/src/routes/me/preferences/
├── index.ts                          # Point d'entrée, routes globales
├── preference-router-factory.ts      # Factory pour générer routes CRUD
├── CONSENT_VALIDATION.md             # Documentation consentements
└── README.md                         # Ce fichier

packages/shared/types/preferences/
├── index.ts                          # Barrel export
├── privacy.ts                        # Schema + defaults privacy
├── audio.ts                          # Schema + defaults audio
├── message.ts                        # Schema + defaults message
├── notification.ts                   # Schema + defaults notification
├── video.ts                          # Schema + defaults video
├── document.ts                       # Schema + defaults document
└── application.ts                    # Schema + defaults application

services/gateway/src/services/
└── ConsentValidationService.ts       # Validation GDPR automatique
```

## Évolutivité

Le système est conçu pour évoluer sans migration :

1. **Ajouter un champ** : Ajouter dans le schema Zod avec `.default()`
2. **Nouvelle catégorie** : Créer schema, ajouter champ JSON, register factory
3. **Nouvelle règle de consentement** : Ajouter dans ConsentValidationService

Aucune migration Prisma nécessaire car les champs JSON sont flexibles !
