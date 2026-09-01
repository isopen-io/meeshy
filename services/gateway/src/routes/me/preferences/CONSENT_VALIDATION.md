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
└─> textTranslationEnabledAt
```

> **`thirdPartyServicesConsentAt` a été RETIRÉ de cette hiérarchie (#4343).**
> Il n'y a jamais eu ni route pour l'écrire, ni clé de schéma pour le porter,
> ni colonne `User` pour le stocker. Il était pourtant PRÉSENT en base, posé en
> masse par la migration `enable_audio_features_in_preferences.js`
> (`updateMany({})`, janvier 2026) — mesuré sur staging le 2026-08-31 : **207
> lignes de préférences sur 207**, pour 223 comptes. Les trois gardes
> PASSAIENT donc pour les comptes dotés d'une ligne et REFUSAIENT les 16 sans
> ligne, en nommant une preuve que le produit n'avait aucun moyen de délivrer.
> **Le verdict dépendait de la date de la ligne, jamais d'un consentement.** L'arbitrage retenu est le RETRAIT de l'exigence
> (option b), et non l'invention de l'écrivain manquant : aucun tiers ne
> reçoit quoi que ce soit dans ce dépôt — il n'existe ni scanner de logiciels
> malveillants, ni traitement d'arrière-plan virtuel, et un drapeau bêta
> n'envoie rien nulle part. Un consentement doit être SPÉCIFIQUE et ÉCLAIRÉ ;
> « services tiers » ne nommait ici aucun traitement réel à autoriser.
> Si un vrai service tiers arrive, c'est SON arrivée qui apportera son
> consentement, nommé (#4551).

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
| `virtualBackgroundEnabled` | `dataProcessingConsentAt` |

### Document Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| *(aucune)* | — |

`scanFilesForMalware` n'exige plus rien depuis #4343. C'était la garde la plus
coûteuse des trois : cette préférence vaut `true` **par défaut** au schéma, si
bien que tout utilisateur qui rouvrait ses préférences de document et les
enregistrait resoumettait la valeur par défaut et récoltait une violation —
sur la préférence qui rend le produit plus SÛR.

### Application Preferences

| Préférence | Consentements Requis |
|------------|---------------------|
| `telemetryEnabled` | `dataProcessingConsentAt` |

`betaFeaturesEnabled` n'exige plus rien depuis #4343 : activer un drapeau de
fonctionnalité n'est pas un traitement de donnée personnelle. L'interrupteur
existe pourtant dans deux interfaces (`ApplicationSettings` sur le web,
`SettingsView` sur iOS) — jusqu'à #4343, l'utilisateur y voyait un
interrupteur qui échouait **toujours**.

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

Les CONSENTEMENTS sont quatre colonnes du modèle `User` — les quatre, et
seulement les quatre, que `getConsentStatus` met dans son `select`
(`packages/shared/prisma/schema.prisma`, § `model User`) :

```typescript
await prisma.user.update({
  where: { id: userId },
  data: {
    dataProcessingConsentAt: new Date(),   // Base obligatoire
    voiceDataConsentAt: new Date(),        // Pour l'audio
    voiceProfileConsentAt: new Date(),     // Pour le profil vocal
    voiceCloningEnabledAt: new Date()      // Pour le clonage
  }
});
```

**Les cinq autres noms que cette page emploie ne sont PAS des colonnes `User`.**
`audioTranscriptionEnabledAt`, `textTranslationEnabledAt`,
`audioTranslationEnabledAt`, `translatedAudioGenerationEnabledAt` et
`voiceCloningConsentAt` : les écrire sur `prisma.user.update` lève
`PrismaClientValidationError: Unknown argument` — mesuré contre le client
généré. Les quatre premiers sont des clés LEGACY du blob JSON
`UserPreferences.audio`, que `getConsentStatus` lit encore en priorité ; leurs
écrivains ACTUELS sont les booléens d'`AudioPreferenceSchema`
(`transcriptionEnabled`, `audioTranslationEnabled`, `ttsEnabled`), posés par
`PATCH /me/preferences/audio`. Les cinq restent en revanche exacts dans les
`requiredConsents` d'une violation et dans les tableaux ci-dessus : c'est le
vocabulaire que le service émet sur le fil, pas une adresse en base.

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

### Le patron : un double Prisma LOCAL, jamais une base

Aucune suite de consentement du gateway ne parle à MongoDB, et aucune ne le
peut : `jest.config.json` fait pointer `@meeshy/shared/prisma/client` sur
`src/__tests__/__stubs__/prisma-client.ts` pour **tous** les runs,
`jest.setup.js` pose `DATABASE_URL='file:./test.db'`, et le seul répertoire qui
ouvre un vrai client (`src/__tests__/integration/`) est dans
`testPathIgnorePatterns`. Un consentement de test se pose donc dans un DOUBLE,
et c'est le VRAI `ConsentValidationService` qu'on interroge — jamais une copie
de sa hiérarchie.

Le patron des deux suites vivantes, `makePrisma`, copié depuis
`src/__tests__/unit/services/ConsentValidationService.test.ts` :

```typescript
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const NOW = new Date();

function makeUser(overrides: Record<string, any> = {}) {
  return {
    dataProcessingConsentAt: null,
    voiceDataConsentAt: null,
    voiceProfileConsentAt: null,
    voiceCloningEnabledAt: null,
    ...overrides,
  };
}

function makePrisma(
  userOverrides: Record<string, any> = {},
  prefsOverrides: { audio?: any; application?: any } = {}
) {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(makeUser(userOverrides)),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({
        audio: prefsOverrides.audio ?? {},
        application: prefsOverrides.application ?? {},
      }),
    },
  } as unknown as PrismaClient;
}
```

Un cas ne nomme alors que ce qui le distingue :

```typescript
it('canTranscribeAudio requires voiceDataConsent + audioTranscriptionEnabledAt', async () => {
  const prisma = makePrisma(
    { voiceDataConsentAt: NOW, dataProcessingConsentAt: NOW },
    { audio: { audioTranscriptionEnabledAt: NOW } }
  );
  const status = await new ConsentValidationService(prisma).getConsentStatus('u1');

  expect(status.canTranscribeAudio).toBe(true);
});
```

**Le premier argument porte les quatre COLONNES, le second le blob de
préférences** — la seule répartition que le schéma accepte (§ « Comment donner
les consentements ? »). Un helper qui rangerait les dix noms dans un unique
`prisma.user.create` ne pourrait pas s'exécuter : il en a existé un
(`__tests__/helpers/consent-test-helper.ts`), recommandé depuis cette page et
importé par aucune suite ; #4552 l'a supprimé plutôt que réparé, parce que son
`getUserConsentStatus` recopiait `ConsentValidationService.getConsentStatus` —
une copie que le § « Tests » de `services/gateway/CLAUDE.md` interdit, et qui
avait déjà divergé (elle rendait `hasThirdPartyServicesConsent`, retiré par
#4343, et calculait la hiérarchie À PLAT).

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
- `services/ConsentValidationService.ts` - Logique de validation
- `src/__tests__/unit/services/ConsentValidationService.test.ts` - Le patron `makePrisma` et la hiérarchie, cas par cas
- `src/__tests__/ConsentValidationService.test.ts` - La même surface, sur l'aiguillage par catégorie
- `src/__tests__/unit/services/consent-third-party-services-requirement-removed.test.ts` - Ce que #4343 a retiré, et qui ne doit pas revenir
- `src/__tests__/routes/preferences-consent.e2e.test.ts` - Les DÉFAUTS des préférences concernées ; il n'exerce pas le service, son en-tête le dit
