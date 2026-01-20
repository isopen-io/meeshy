# Stratégie de Tests pour la Cohérence des Interfaces d'Échange

## 1. Vue d'Ensemble

Cette stratégie vise à garantir la cohérence totale entre :
- **Types TypeScript** (`attachment-audio.ts`, `socketio-events.ts`)
- **Schémas JSON** (`api-schemas.ts` pour Fastify/OpenAPI)
- **Transformers** (`transformers.service.ts`)
- **API REST** (Gateway Fastify)
- **Socket.IO** (événements temps réel)

## 2. Architecture des Tests

```
packages/shared/
├── tests/
│   ├── unit/
│   │   ├── transformers.test.ts          # Tests unitaires des transformers
│   │   ├── schema-validation.test.ts     # Validation des schémas JSON
│   │   └── type-guards.test.ts           # Type guards et helpers
│   ├── integration/
│   │   ├── rest-socketio-sync.test.ts    # Cohérence REST ↔ Socket.IO
│   │   ├── schema-type-alignment.test.ts # Cohérence Schémas ↔ Types
│   │   └── end-to-end-flow.test.ts       # Flux complet transcription/traduction
│   └── contract/
│       ├── attachment-contract.test.ts   # Contrats d'interface Attachment
│       ├── translation-contract.test.ts  # Contrats Traduction
│       └── socketio-contract.test.ts     # Contrats événements Socket.IO

services/gateway/
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── AttachmentService.test.ts
│   │   │   ├── AudioTranslateService.test.ts
│   │   │   └── MessageTranslationService.test.ts
│   │   └── routes/
│   │       ├── attachments.test.ts
│   │       └── messages.test.ts
│   ├── integration/
│   │   ├── rest-api.test.ts              # Tests API REST complètes
│   │   └── socketio-events.test.ts       # Tests événements Socket.IO
│   └── e2e/
│       └── audio-translation-flow.test.ts # Flux bout-en-bout

apps/web/
└── tests/
    ├── unit/
    │   └── transformers.service.test.ts   # Tests transformers frontend
    └── integration/
        └── api-consumer.test.ts           # Tests consommation API
```

---

## 3. Tests Unitaires des Transformers

### 3.1 Fichier : `packages/shared/tests/unit/transformers.test.ts`

#### Objectif
Valider que les fonctions de transformation produisent des données conformes aux interfaces attendues.

#### Scénarios Critiques

```typescript
import { describe, it, expect } from 'vitest';
import {
  toSocketIOTranslation,
  toSocketIOTranslations,
  getAvailableLanguages,
  hasTranslation,
  upsertTranslation,
  softDeleteTranslation,
  type AttachmentTranslation,
  type AttachmentTranslations,
  type SocketIOTranslation,
} from '@meeshy/shared/types/attachment-audio';

describe('Transformers - toSocketIOTranslation', () => {
  it('should convert audio translation to SocketIO format', () => {
    const translation: AttachmentTranslation = {
      type: 'audio',
      transcription: 'Hello world',
      url: 'https://cdn.example.com/audio.mp3',
      durationMs: 5000,
      format: 'mp3',
      cloned: true,
      quality: 0.95,
      voiceModelId: 'model-123',
      ttsModel: 'xtts',
      createdAt: '2025-01-20T10:00:00Z',
    };

    const result = toSocketIOTranslation('att-123', 'fr', translation);

    expect(result).toEqual({
      id: 'att-123_fr',
      type: 'audio',
      targetLanguage: 'fr',
      translatedText: 'Hello world',
      url: 'https://cdn.example.com/audio.mp3',
      durationMs: 5000,
      voiceCloned: true,
      voiceQuality: 0.95,
      format: 'mp3',
      ttsModel: 'xtts',
      voiceModelId: 'model-123',
      path: undefined,
      pageCount: undefined,
      overlayApplied: undefined,
    });
  });

  it('should convert video translation to SocketIO format', () => {
    const translation: AttachmentTranslation = {
      type: 'video',
      transcription: 'Subtitle text',
      url: 'https://cdn.example.com/video.mp4',
      durationMs: 120000,
      format: 'mp4',
      createdAt: '2025-01-20T10:00:00Z',
    };

    const result = toSocketIOTranslation('att-456', 'es', translation);

    expect(result.type).toBe('video');
    expect(result.targetLanguage).toBe('es');
    expect(result.durationMs).toBe(120000);
    expect(result.voiceCloned).toBeUndefined();
  });

  it('should convert document translation to SocketIO format', () => {
    const translation: AttachmentTranslation = {
      type: 'document',
      transcription: 'Translated document content',
      url: 'https://cdn.example.com/doc.pdf',
      pageCount: 10,
      format: 'pdf',
      createdAt: '2025-01-20T10:00:00Z',
    };

    const result = toSocketIOTranslation('att-789', 'de', translation);

    expect(result.type).toBe('document');
    expect(result.pageCount).toBe(10);
    expect(result.durationMs).toBeUndefined();
  });

  it('should handle missing optional fields gracefully', () => {
    const translation: AttachmentTranslation = {
      type: 'text',
      transcription: 'Simple text',
      createdAt: '2025-01-20T10:00:00Z',
    };

    const result = toSocketIOTranslation('att-999', 'en', translation);

    expect(result.url).toBe('');
    expect(result.durationMs).toBeUndefined();
    expect(result.voiceCloned).toBeUndefined();
  });
});

describe('Transformers - toSocketIOTranslations', () => {
  it('should convert multiple translations', () => {
    const translations: AttachmentTranslations = {
      en: {
        type: 'audio',
        transcription: 'Hello',
        url: 'https://cdn.example.com/en.mp3',
        createdAt: '2025-01-20T10:00:00Z',
      },
      fr: {
        type: 'audio',
        transcription: 'Bonjour',
        url: 'https://cdn.example.com/fr.mp3',
        createdAt: '2025-01-20T10:00:00Z',
      },
      es: {
        type: 'audio',
        transcription: 'Hola',
        url: 'https://cdn.example.com/es.mp3',
        deletedAt: '2025-01-20T11:00:00Z', // Soft deleted
        createdAt: '2025-01-20T10:00:00Z',
      },
    };

    const result = toSocketIOTranslations('att-123', translations);

    expect(result).toHaveLength(2); // es excluded (soft deleted)
    expect(result[0].targetLanguage).toBe('en');
    expect(result[1].targetLanguage).toBe('fr');
  });

  it('should return empty array for undefined translations', () => {
    const result = toSocketIOTranslations('att-123', undefined);
    expect(result).toEqual([]);
  });
});

describe('Transformers - Helper Functions', () => {
  const translations: AttachmentTranslations = {
    en: {
      type: 'audio',
      transcription: 'English',
      createdAt: '2025-01-20T10:00:00Z',
    },
    fr: {
      type: 'audio',
      transcription: 'Français',
      deletedAt: '2025-01-20T11:00:00Z',
      createdAt: '2025-01-20T10:00:00Z',
    },
  };

  it('hasTranslation - should detect existing non-deleted translation', () => {
    expect(hasTranslation(translations, 'en')).toBe(true);
  });

  it('hasTranslation - should return false for deleted translation', () => {
    expect(hasTranslation(translations, 'fr')).toBe(false);
  });

  it('hasTranslation - should return false for missing translation', () => {
    expect(hasTranslation(translations, 'de')).toBe(false);
  });

  it('getAvailableLanguages - should return only non-deleted languages', () => {
    const languages = getAvailableLanguages(translations);
    expect(languages).toEqual(['en']);
  });

  it('upsertTranslation - should add new translation', () => {
    const updated = upsertTranslation(translations, 'de', {
      type: 'audio',
      transcription: 'Deutsch',
    });

    expect(updated.de).toBeDefined();
    expect(updated.de.transcription).toBe('Deutsch');
    expect(updated.de.deletedAt).toBeNull();
  });

  it('softDeleteTranslation - should mark translation as deleted', () => {
    const updated = softDeleteTranslation(translations, 'en');
    expect(updated.en.deletedAt).toBeDefined();
    expect(typeof updated.en.deletedAt).toBe('string');
  });
});
```

---

## 4. Tests d'Intégration REST ↔ Socket.IO

### 4.1 Fichier : `packages/shared/tests/integration/rest-socketio-sync.test.ts`

#### Objectif
Garantir que les données retournées par l'API REST sont identiques aux données émises via Socket.IO.

#### Scénarios Critiques

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import type { SocketIOTranslation, AudioTranslationReadyEventData } from '@meeshy/shared/types/socketio-events';

describe('REST ↔ Socket.IO Synchronization', () => {
  let socket: Socket;
  let authToken: string;
  const API_BASE = 'http://localhost:3010';

  beforeAll(async () => {
    // Authentification
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'test@example.com',
      password: 'password123',
    });
    authToken = loginResponse.data.token;

    // Connexion Socket.IO
    socket = io(API_BASE, {
      auth: { token: authToken },
    });

    await new Promise((resolve) => {
      socket.on('connect', resolve);
    });
  });

  afterAll(() => {
    socket.disconnect();
  });

  it('should emit same translation data via REST and Socket.IO', async () => {
    // 1. Télécharger un fichier audio
    const formData = new FormData();
    formData.append('file', new Blob(['fake audio']), 'test.mp3');
    formData.append('type', 'audio');

    const uploadResponse = await axios.post(
      `${API_BASE}/attachments/upload`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    const attachmentId = uploadResponse.data.attachment.id;

    // 2. Demander la traduction audio
    const translationPromise = new Promise<AudioTranslationReadyEventData>((resolve) => {
      socket.once('audio:translation-ready', (data) => resolve(data));
    });

    await axios.post(
      `${API_BASE}/attachments/${attachmentId}/translate`,
      {
        targetLanguages: ['fr', 'es'],
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    // 3. Récupérer données Socket.IO
    const socketData = await translationPromise;

    // 4. Récupérer données REST
    const restResponse = await axios.get(
      `${API_BASE}/attachments/${attachmentId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    const restTranslations: SocketIOTranslation[] = restResponse.data.translatedAudios;

    // 5. Comparer les structures
    expect(socketData.translatedAudios).toHaveLength(restTranslations.length);

    socketData.translatedAudios.forEach((socketTr, index) => {
      const restTr = restTranslations[index];

      expect(socketTr.id).toBe(restTr.id);
      expect(socketTr.type).toBe(restTr.type);
      expect(socketTr.targetLanguage).toBe(restTr.targetLanguage);
      expect(socketTr.translatedText).toBe(restTr.translatedText);
      expect(socketTr.url).toBe(restTr.url);
      expect(socketTr.durationMs).toBe(restTr.durationMs);
      expect(socketTr.voiceCloned).toBe(restTr.voiceCloned);
    });
  });
});
```

---

## 5. Tests de Contrat (Contract Testing)

### 5.1 Fichier : `packages/shared/tests/contract/translation-contract.test.ts`

#### Objectif
Valider que les schémas JSON et les types TypeScript restent alignés.

#### Scénarios Critiques

```typescript
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type {
  AttachmentTranslation,
  SocketIOTranslation,
} from '@meeshy/shared/types/attachment-audio';

const ajv = new Ajv({ strict: false });
addFormats(ajv);

// Import du schéma JSON (simulé ici, devrait être importé depuis api-schemas.ts)
const translationJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['audio', 'video', 'text', 'document', 'image'] },
    transcription: { type: 'string' },
    url: { type: 'string', nullable: true },
    durationMs: { type: 'number', nullable: true },
    cloned: { type: 'boolean', nullable: true },
    voiceModelId: { type: 'string', nullable: true },
    pageCount: { type: 'number', nullable: true },
    overlayApplied: { type: 'boolean', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
    deletedAt: { type: 'string', format: 'date-time', nullable: true },
  },
  required: ['type', 'transcription', 'createdAt'],
  additionalProperties: false,
};

const socketIOTranslationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['audio', 'video', 'text', 'document', 'image'] },
    targetLanguage: { type: 'string' },
    translatedText: { type: 'string' },
    url: { type: 'string' },
    durationMs: { type: 'number', nullable: true },
    voiceCloned: { type: 'boolean', nullable: true },
    pageCount: { type: 'number', nullable: true },
  },
  required: ['id', 'type', 'targetLanguage', 'translatedText', 'url'],
  additionalProperties: false,
};

describe('Contract Testing - AttachmentTranslation', () => {
  const validateTranslation = ajv.compile(translationJsonSchema);

  it('should validate audio translation against schema', () => {
    const translation: AttachmentTranslation = {
      type: 'audio',
      transcription: 'Test audio',
      url: 'https://example.com/audio.mp3',
      durationMs: 5000,
      cloned: true,
      voiceModelId: 'model-123',
      createdAt: '2025-01-20T10:00:00Z',
    };

    const valid = validateTranslation(translation);
    if (!valid) {
      console.error(validateTranslation.errors);
    }
    expect(valid).toBe(true);
  });

  it('should reject invalid translation type', () => {
    const invalidTranslation = {
      type: 'invalid-type',
      transcription: 'Test',
      createdAt: '2025-01-20T10:00:00Z',
    };

    const valid = validateTranslation(invalidTranslation);
    expect(valid).toBe(false);
    expect(validateTranslation.errors).toBeDefined();
  });
});

describe('Contract Testing - SocketIOTranslation', () => {
  const validateSocketIO = ajv.compile(socketIOTranslationSchema);

  it('should validate SocketIO translation against schema', () => {
    const translation: SocketIOTranslation = {
      id: 'att-123_fr',
      type: 'audio',
      targetLanguage: 'fr',
      translatedText: 'Bonjour',
      url: 'https://example.com/audio.mp3',
      durationMs: 5000,
      voiceCloned: true,
    };

    const valid = validateSocketIO(translation);
    if (!valid) {
      console.error(validateSocketIO.errors);
    }
    expect(valid).toBe(true);
  });

  it('should reject missing required fields', () => {
    const invalidTranslation = {
      id: 'att-123_fr',
      type: 'audio',
      // Missing targetLanguage, translatedText, url
    };

    const valid = validateSocketIO(invalidTranslation);
    expect(valid).toBe(false);
  });
});
```

---

## 6. Tests de Régression

### 6.1 Fichier : `packages/shared/tests/regression/breaking-changes.test.ts`

#### Objectif
Détecter les breaking changes dans les interfaces publiques.

#### Stratégie

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('Breaking Changes Detection', () => {
  it('should maintain backward compatibility for SocketIOTranslation', async () => {
    // Snapshot des propriétés obligatoires
    const requiredFields = [
      'id',
      'type',
      'targetLanguage',
      'translatedText',
      'url',
    ];

    // Validation dynamique
    const typeDefinition = await fs.readFile(
      path.join(__dirname, '../../types/attachment-audio.ts'),
      'utf-8'
    );

    requiredFields.forEach((field) => {
      const regex = new RegExp(`readonly ${field}:\\s*\\w+;`);
      expect(typeDefinition).toMatch(regex);
    });
  });

  it('should maintain deprecated aliases', async () => {
    const typeDefinition = await fs.readFile(
      path.join(__dirname, '../../types/attachment-audio.ts'),
      'utf-8'
    );

    // Vérifier que les aliases existent
    expect(typeDefinition).toContain('export type SocketIOTranslatedAudio = SocketIOTranslation');
    expect(typeDefinition).toContain('export const toSocketIOAudio = toSocketIOTranslation');
    expect(typeDefinition).toContain('export const toSocketIOAudios = toSocketIOTranslations');
  });
});
```

---

## 7. Outils et Configuration

### 7.1 Installation des Dépendances

```bash
# Dans packages/shared/
bun add -D vitest ajv ajv-formats socket.io-client axios
```

### 7.2 Configuration Vitest

**Fichier : `packages/shared/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'types/**/*.ts',
        'utils/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@meeshy/shared': path.resolve(__dirname, './'),
    },
  },
});
```

### 7.3 Scripts Package.json

**Fichier : `packages/shared/package.json`**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:contract": "vitest run tests/contract",
    "test:regression": "vitest run tests/regression"
  }
}
```

---

## 8. Stratégie de Validation des Schémas

### 8.1 Validation Automatique avec JSON Schema

**Fichier : `packages/shared/tests/unit/schema-validation.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// Import dynamique des schémas depuis api-schemas.ts
import * as schemas from '../../types/api-schemas';

describe('Schema Validation - api-schemas.ts', () => {
  it('should validate all schemas are valid JSON Schema', () => {
    const schemaKeys = Object.keys(schemas);

    schemaKeys.forEach((key) => {
      const schema = (schemas as any)[key];
      if (typeof schema === 'object' && schema.type) {
        expect(() => ajv.compile(schema)).not.toThrow();
      }
    });
  });

  it('should validate transcription schema structure', () => {
    const transcriptionSchema = (schemas as any).transcriptionSchema;

    expect(transcriptionSchema.properties.type).toBeDefined();
    expect(transcriptionSchema.properties.type.enum).toContain('audio');
    expect(transcriptionSchema.properties.type.enum).toContain('video');
    expect(transcriptionSchema.properties.type.enum).toContain('document');
    expect(transcriptionSchema.properties.type.enum).toContain('image');
  });

  it('should validate translationsJson schema structure', () => {
    const translationsSchema = (schemas as any).translationsJsonSchema;

    expect(translationsSchema.type).toBe('object');
    expect(translationsSchema.additionalProperties).toBeDefined();
    expect(translationsSchema.additionalProperties.properties.type.enum).toContain('audio');
  });
});
```

### 8.2 Tests de Génération de Documentation OpenAPI

**Fichier : `services/gateway/tests/unit/openapi-generation.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { build } from '../src/server';

describe('OpenAPI Documentation Generation', () => {
  it('should generate valid OpenAPI spec', async () => {
    const app = await build();

    const spec = app.swagger();

    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();

    // Vérifier que les routes d'attachments sont documentées
    expect(spec.paths['/attachments/{id}']).toBeDefined();
    expect(spec.paths['/attachments/{id}/translate']).toBeDefined();

    // Vérifier les schémas
    expect(spec.components?.schemas).toBeDefined();

    await app.close();
  });

  it('should document translatedAudios schema correctly', async () => {
    const app = await build();
    const spec = app.swagger();

    const attachmentSchema = spec.components?.schemas?.Attachment;

    expect(attachmentSchema).toBeDefined();
    expect(attachmentSchema.properties.translatedAudios).toBeDefined();
    expect(attachmentSchema.properties.translatedAudios.type).toBe('array');

    const translatedAudioItem = attachmentSchema.properties.translatedAudios.items;
    expect(translatedAudioItem.properties.type.enum).toEqual([
      'audio',
      'video',
      'text',
      'document',
      'image',
    ]);

    await app.close();
  });
});
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

**Fichier : `.github/workflows/test-interfaces.yml`**

```yaml
name: Test Interface Consistency

on:
  pull_request:
    paths:
      - 'packages/shared/types/**'
      - 'services/gateway/src/**'
      - 'apps/web/services/**'
  push:
    branches:
      - main
      - dev

jobs:
  test-shared:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run --cwd packages/shared test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: packages/shared/coverage/lcov.info
          flags: shared

  test-gateway:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run --cwd services/gateway test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: services/gateway/coverage/lcov.info
          flags: gateway

  contract-tests:
    runs-on: ubuntu-latest
    needs: [test-shared, test-gateway]
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run --cwd packages/shared test:contract
      - name: Notify on breaking changes
        if: failure()
        run: echo "::error::Breaking changes detected in interface contracts"
```

---

## 10. Scénarios Critiques à Couvrir

### 10.1 Tests Unitaires Transformers
- ✅ Conversion `AttachmentTranslation` → `SocketIOTranslation` pour tous les types
- ✅ Gestion des champs optionnels et nullable
- ✅ Soft delete des traductions
- ✅ Helpers de manipulation (upsert, get, delete)

### 10.2 Tests d'Intégration REST ↔ Socket.IO
- ✅ Données identiques entre API REST et événements Socket.IO
- ✅ Format des événements `audio:translation-ready`
- ✅ Format des événements `transcription:ready`
- ✅ Cohérence des IDs et références

### 10.3 Tests de Contrat
- ✅ Schémas JSON valides selon JSON Schema Draft 7
- ✅ Types TypeScript alignés avec schémas JSON
- ✅ Documentation OpenAPI générée correctement
- ✅ Pas de propriétés supplémentaires non documentées

### 10.4 Tests de Régression
- ✅ Aliases de compatibilité maintenus
- ✅ Propriétés obligatoires non supprimées
- ✅ Enums non modifiés sans migration
- ✅ Snapshots des interfaces publiques

---

## 11. Métriques de Qualité

### 11.1 Objectifs de Couverture
- **Transformers** : 100% (fonctions pures, faciles à tester)
- **Schémas** : 100% (validation exhaustive)
- **API Routes** : 85%+ (logique métier critique)
- **Socket.IO Events** : 80%+ (événements temps réel)

### 11.2 Indicateurs de Réussite
- ✅ Aucun breaking change non détecté
- ✅ 100% des schémas JSON valides
- ✅ Temps de build < 30s
- ✅ Temps d'exécution tests < 60s
- ✅ Zéro régression sur interfaces publiques

---

## 12. Documentation et Maintenance

### 12.1 Documentation des Tests
Chaque fichier de test doit inclure :
- **Description** : Objectif du test
- **Prérequis** : Dépendances nécessaires
- **Scénarios** : Cas testés
- **Exemples** : Données de test réutilisables

### 12.2 Mise à Jour Continue
- **Snapshot automatique** : Capture des interfaces après chaque modification
- **Changelog automatique** : Génération via semantic-release
- **Migration guide** : Documentation des breaking changes

---

## 13. Prochaines Étapes

### Phase 1 : Configuration Infrastructure (Semaine 1)
1. Installer Vitest + dépendances
2. Créer structure de dossiers tests
3. Configurer CI/CD
4. Établir baselines de couverture

### Phase 2 : Tests Unitaires (Semaine 2)
1. Tests transformers
2. Tests schema validation
3. Tests type guards
4. Tests helpers

### Phase 3 : Tests d'Intégration (Semaine 3)
1. Tests REST API
2. Tests Socket.IO
3. Tests synchronisation REST ↔ Socket.IO

### Phase 4 : Tests de Contrat (Semaine 4)
1. Validation schémas JSON
2. Alignement TypeScript ↔ JSON
3. Tests de régression
4. Documentation OpenAPI

### Phase 5 : Optimisation et Monitoring (Semaine 5)
1. Optimisation temps d'exécution
2. Dashboards de couverture
3. Alertes breaking changes
4. Documentation complète

---

## 14. Résumé Exécutif

Cette stratégie garantit :
- ✅ **Cohérence totale** entre types TS, schémas JSON, REST et Socket.IO
- ✅ **Détection automatique** des breaking changes
- ✅ **Couverture exhaustive** (85%+ global, 100% interfaces critiques)
- ✅ **CI/CD intégré** avec alertes et blocage sur échec
- ✅ **Documentation automatique** OpenAPI synchronisée
- ✅ **Migration sécurisée** avec aliases de compatibilité

**Résultat attendu** : Zéro désynchronisation entre interfaces, confiance totale dans les refactorings, déploiements sécurisés.
