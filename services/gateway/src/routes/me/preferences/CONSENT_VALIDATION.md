# Validation de Consentement GDPR pour les Préférences

## Vue d'ensemble

Le système de préférences utilisateur intègre une validation automatique des consentements GDPR. Certaines préférences nécessitent que l'utilisateur ait donné des consentements spécifiques avant de pouvoir être activées.

## Hiérarchie des Consentements

```
dataProcessingConsentAt (BASE OBLIGATOIRE)
├─> voiceDataConsentAt
│   ├─> audioTranscriptionEnabledAt
│   │   └─> audioTranslationEnabledAt
│   │       └─> translatedAudioGenerationEnabledAt
│   └─> voiceProfileConsentAt
│       └─> voiceCloningConsentAt
│           └─> voiceCloningEnabledAt
├─> textTranslationEnabledAt
└─> thirdPartyServicesConsentAt
```

## Règles de Validation par Catégorie

### Audio Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `transcriptionEnabled` | `voiceDataConsentAt` + `audioTranscriptionEnabledAt` |
| `audioTranslationEnabled` | `audioTranscriptionEnabledAt` + `textTranslationEnabledAt` + `audioTranslationEnabledAt` |
| `ttsEnabled` | `audioTranslationEnabledAt` + `translatedAudioGenerationEnabledAt` |
| `voiceProfileEnabled` | `voiceProfileConsentAt` |
| `voiceCloneQuality` | `voiceCloningConsentAt` + `voiceCloningEnabledAt` (si `voiceProfileEnabled=true`) |

### Privacy Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `allowAnalytics` | `dataProcessingConsentAt` |
| `shareUsageData` | `dataProcessingConsentAt` |

### Message Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `autoTranslateIncoming` | `textTranslationEnabledAt` |
| `autoTranslateLanguages` | `textTranslationEnabledAt` (si non vide) |

### Video Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `virtualBackgroundEnabled` | `dataProcessingConsentAt` + `thirdPartyServicesConsentAt` |

### Document Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `scanFilesForMalware` | `thirdPartyServicesConsentAt` |

### Application Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `telemetryEnabled` | `dataProcessingConsentAt` |
| `betaFeaturesEnabled` | `thirdPartyServicesConsentAt` |

### Notification Preferences

Aucune validation de consentement (les notifications sont une fonctionnalité de base).

## Comportement de l'API

### Requête Valide

**Request:**
```http
PUT /api/v1/me/preferences/audio
Authorization: Bearer {token}
Content-Type: application/json

{
  "transcriptionEnabled": true,
  ...
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "transcriptionEnabled": true,
    ...
  }
}
```

### Requête avec Consentement Manquant

**Request:**
```http
PUT /api/v1/me/preferences/audio
Authorization: Bearer {token}

{
  "transcriptionEnabled": true
}
```

**Response (403 Forbidden):**
```json
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

### Multiples Violations

Si plusieurs champs violent les règles de consentement, toutes les violations sont retournées :

**Response (403 Forbidden):**
```json
{
  "success": false,
  "error": "CONSENT_REQUIRED",
  "message": "Missing required consents for requested preferences",
  "violations": [
    {
      "field": "transcriptionEnabled",
      "message": "Audio transcription requires voice data consent and feature activation",
      "requiredConsents": ["voiceDataConsentAt", "audioTranscriptionEnabledAt"]
    },
    {
      "field": "ttsEnabled",
      "message": "TTS requires audio translation and translated audio generation to be enabled",
      "requiredConsents": ["audioTranslationEnabledAt", "translatedAudioGenerationEnabledAt"]
    }
  ]
}
```

## Validation lors de PATCH (Mise à jour partielle)

Lors d'une opération `PATCH`, la validation s'applique aux **données mergées** (existantes + nouvelles).

**Exemple :**

1. Utilisateur a `{ transcriptionEnabled: true }` avec les consentements appropriés
2. Consentements sont révoqués
3. Utilisateur fait `PATCH { audioQuality: "high" }`
4. La validation vérifie `{ transcriptionEnabled: true, audioQuality: "high" }`
5. **Résultat** : 403 car `transcriptionEnabled=true` nécessite des consentements qui ne sont plus présents

Cette approche garantit que les préférences existantes restent conformes aux consentements actuels.

## Comment donner les consentements ?

Les consentements sont gérés via le modèle `User` dans Prisma :

```typescript
await prisma.user.update({
  where: { id: userId },
  data: {
    dataProcessingConsentAt: new Date(),      // Consentement de base
    voiceDataConsentAt: new Date(),           // Pour audio
    audioTranscriptionEnabledAt: new Date()   // Activer transcription
  }
});
```

## API de Statut de Consentement

Pour vérifier l'état de consentement d'un utilisateur :

```typescript
import { ConsentValidationService } from '@/services/ConsentValidationService';

const consentService = new ConsentValidationService(prisma);
const status = await consentService.getConsentStatus(userId);

console.log(status);
// {
//   hasDataProcessingConsent: true,
//   hasVoiceDataConsent: true,
//   canTranscribeAudio: true,
//   canTranslateText: false,
//   canTranslateAudio: false,
//   ...
// }
```

## Tests

### Helper pour les tests

Utilisez `consent-test-helper.ts` pour créer des utilisateurs de test avec différents niveaux de consentement :

```typescript
import { CONSENT_LEVELS, createTestUserWithConsents } from '@/__tests__/helpers/consent-test-helper';

// Créer un utilisateur avec transcription activée
const user = await createTestUserWithConsents(prisma, CONSENT_LEVELS.TRANSCRIPTION);

// Créer un utilisateur sans consentement
const userNoConsent = await createTestUserWithConsents(prisma, CONSENT_LEVELS.NONE);

// Créer un utilisateur avec tous les consentements
const userFull = await createTestUserWithConsents(prisma, CONSENT_LEVELS.FULL);
```

### Niveaux de consentement disponibles

- `CONSENT_LEVELS.NONE` - Aucun consentement
- `CONSENT_LEVELS.BASIC` - Consentement de base uniquement
- `CONSENT_LEVELS.VOICE_DATA` - Données vocales
- `CONSENT_LEVELS.TRANSCRIPTION` - Transcription audio
- `CONSENT_LEVELS.TEXT_TRANSLATION` - Traduction texte
- `CONSENT_LEVELS.AUDIO_TRANSLATION` - Traduction audio
- `CONSENT_LEVELS.TTS` - Text-to-speech
- `CONSENT_LEVELS.VOICE_PROFILE` - Profil vocal
- `CONSENT_LEVELS.VOICE_CLONING` - Clonage vocal
- `CONSENT_LEVELS.FULL` - Tous les consentements

## Implémentation

### ConsentValidationService

Le service `ConsentValidationService` est automatiquement utilisé par le factory router :

```typescript
// services/ConsentValidationService.ts
export class ConsentValidationService {
  async validatePreferences(
    userId: string,
    category: string,
    preferences: Record<string, any>
  ): Promise<ConsentViolation[]>

  async getConsentStatus(userId: string): Promise<ConsentStatus>
}
```

### Factory Router Integration

Le factory router intègre automatiquement la validation :

```typescript
// Avant l'upsert des préférences
const consentViolations = await consentService.validatePreferences(
  userId,
  category,
  validated
);

if (consentViolations.length > 0) {
  return reply.status(403).send({
    success: false,
    error: 'CONSENT_REQUIRED',
    message: 'Missing required consents for requested preferences',
    violations: consentViolations
  });
}
```

## Évolution Future

Pour ajouter une nouvelle règle de validation :

1. Identifier la préférence qui nécessite un consentement
2. Ajouter la validation dans `ConsentValidationService.ts`
3. Ajouter des tests dans `preferences-consent.e2e.test.ts`
4. Mettre à jour cette documentation

**Exemple :**

```typescript
// Dans ConsentValidationService.ts
async validateNewCategoryPreferences(
  userId: string,
  preferences: Record<string, any>
): Promise<ConsentViolation[]> {
  const status = await this.getConsentStatus(userId);
  const violations: ConsentViolation[] = [];

  if (preferences.newFeature === true && !status.hasRequiredConsent) {
    violations.push({
      field: 'newFeature',
      message: 'New feature requires specific consent',
      requiredConsents: ['requiredConsentAt']
    });
  }

  return violations;
}
```

## Support

Pour toute question sur la validation de consentement, consultez :
- `ConsentValidationService.ts` - Logique de validation
- `consent-test-helper.ts` - Helpers pour tests
- `preferences-consent.e2e.test.ts` - Exemples de tests
