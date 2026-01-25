# Schema Unification: Single Source of Truth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Créer un système automatisé de génération Zod → JSON Schema pour éliminer la duplication, optimiser la bande passante des PATCH, et aligner avec le schéma Prisma comme source de vérité.

**Architecture:**
- **Source unique:** Schémas Zod définis dans `packages/shared/utils/validation.ts`
- **Génération automatique:** Convertir Zod → JSON Schema OpenAPI via `zod-to-json-schema`
- **Validation Prisma:** Script de vérification type-safety Zod ↔ Prisma
- **PATCH optimization:** Tous les champs nullable dans les update schemas

**Tech Stack:**
- Zod 3.x (validation runtime + types TypeScript)
- `zod-to-json-schema` (conversion automatique)
- Prisma (source de vérité base de données)
- Fastify OpenAPI 3.1

**Metrics actuels:**
- 94 JSON Schema manuels dans `api-schemas.ts` (3059 lignes)
- 72 schémas Zod dans `validation.ts` (2487 lignes)
- 53 modèles Prisma
- **Problème:** Désynchronisation entre Zod et JSON Schema (ex: customDestinationLanguage)

**Résultat attendu:**
- 0 JSON Schema manuels (tous générés)
- ~100% couverture Zod des modèles Prisma
- PATCH bandwidth optimisé (tous champs nullable)
- Documentation OpenAPI auto-générée et à jour

---

## Phase 1: Infrastructure & Analysis

### Task 1.1: Analyse des schémas existants

**Objectif:** Comprendre l'état actuel et identifier les gaps

**Files:**
- Read: `packages/shared/prisma/schema.prisma`
- Read: `packages/shared/types/api-schemas.ts`
- Read: `packages/shared/utils/validation.ts`
- Create: `docs/analysis/schema-inventory.md`

**Étapes:**

1. Lister modèles Prisma
2. Lister schémas Zod
3. Lister JSON Schema
4. Créer matrice de mapping
5. Identifier patterns et gaps
6. Documenter dans schema-inventory.md

**Validation:** Fichier `docs/analysis/schema-inventory.md` contient tableau complet des mappings

---

### Task 1.2: Setup générateur Zod → JSON Schema

**Objectif:** Infrastructure de génération automatique

**Files:**
- Create: `packages/shared/utils/schema-generator.ts`
- Create: `packages/shared/scripts/generate-schemas.ts`
- Modify: `packages/shared/package.json`

**Step 1: Installer dépendances**

```bash
cd packages/shared
npm install --save-dev zod-to-json-schema @types/node
```

**Step 2: Créer générateur**

Fichier: `packages/shared/utils/schema-generator.ts`

```typescript
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convertit Zod → JSON Schema OpenAPI 3.1
 */
export function zodToOpenAPI(
  zodSchema: z.ZodType<any>,
  options: {
    name: string;
    description?: string;
    nullable?: boolean;
  }
): any {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });

  if (options.nullable && jsonSchema.properties) {
    Object.keys(jsonSchema.properties).forEach(key => {
      jsonSchema.properties[key].nullable = true;
    });
  }

  return { ...jsonSchema, description: options.description };
}

/**
 * Crée schema PATCH (tous champs nullable + optional)
 */
export function createPatchSchema<T extends z.ZodType<any>>(
  baseSchema: T,
  name: string
): any {
  const patchZod = baseSchema.partial();
  return zodToOpenAPI(patchZod, {
    name: `${name}PatchRequest`,
    description: `Partial update (bandwidth optimized)`,
    nullable: true,
  });
}
```

**Step 3: Script de génération**

Fichier: `packages/shared/scripts/generate-schemas.ts`

```typescript
#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { zodToOpenAPI, createPatchSchema } from '../utils/schema-generator';
import * as schemas from '../utils/validation';

async function generateSchemas() {
  const output: Record<string, any> = {};

  for (const [key, value] of Object.entries(schemas)) {
    if (key.endsWith('Schema') && value && typeof value === 'object') {
      console.log(`Generating: ${key}`);
      output[key] = zodToOpenAPI(value as any, { name: key });

      if (key.startsWith('update')) {
        const patchKey = key.replace('update', 'patch');
        output[patchKey] = createPatchSchema(value as any, key);
        console.log(`  → PATCH: ${patchKey}`);
      }
    }
  }

  const outputPath = path.join(__dirname, '../types/api-schemas.generated.ts');
  const header = `/**
 * AUTO-GENERATED - DO NOT EDIT
 * Source: validation.ts
 * Generated: ${new Date().toISOString()}
 */\n\n`;

  const content = header + Object.entries(output)
    .map(([key, schema]) =>
      `export const ${key} = ${JSON.stringify(schema, null, 2)} as const;`)
    .join('\n\n');

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`✅ ${Object.keys(output).length} schemas → ${outputPath}`);
}

generateSchemas().catch(console.error);
```

**Step 4: Ajouter script npm**

```json
{
  "scripts": {
    "generate:schemas": "tsx scripts/generate-schemas.ts",
    "build": "tsc && npm run generate:schemas"
  }
}
```

**Step 5: Test génération**

```bash
npm run generate:schemas
head -30 types/api-schemas.generated.ts
```

**Step 6: Commit**

```bash
git add utils/schema-generator.ts scripts/generate-schemas.ts package.json types/api-schemas.generated.ts
git commit -m "feat: add Zod → JSON Schema generator"
```

---

## Phase 2: Migration des schémas

### Task 2.1: Compléter schémas Zod depuis Prisma

**Objectif:** Couverture 100% des modèles Prisma

**Files:**
- Modify: `packages/shared/utils/validation.ts`
- Read: `packages/shared/prisma/schema.prisma`

**Nouveaux schémas à créer:**

```typescript
// User - complet
export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().nullable().optional(),
  banner: z.string().url().nullable().optional(),
  timezone: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  phoneCountryCode: z.string().length(2).nullable().optional(),
  systemLanguage: z.string().min(2).max(5).optional(),
  regionalLanguage: z.string().min(2).max(5).nullable().optional(),
  customDestinationLanguage: z.union([
    z.literal(''),
    z.null(),
    z.string().min(2).max(5)
  ]).optional(),
  displayName: z.string().min(1).max(100).optional(),
});

// Message
export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  originalContent: z.string().optional(),
  originalLanguage: z.string().optional(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'VOICE', 'LOCATION']),
  status: z.enum(['SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createMessageSchema = messageSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const updateMessageSchema = createMessageSchema.partial();

// Conversation
export const conversationSchema = z.object({
  id: z.string(),
  type: z.enum(['DIRECT', 'GROUP', 'CHANNEL']),
  name: z.string().nullable(),
  description: z.string().nullable(),
  avatar: z.string().url().nullable(),
  createdById: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createConversationSchema = conversationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateConversationSchema = createConversationSchema.partial();
```

**Validation:** Tests unitaires

```typescript
// __tests__/validation.test.ts
describe('Zod Schemas', () => {
  it('validates user profile with empty customDestinationLanguage', () => {
    const result = updateUserProfileSchema.safeParse({
      customDestinationLanguage: '',
    });
    expect(result.success).toBe(true);
  });

  it('validates user profile with null', () => {
    const result = updateUserProfileSchema.safeParse({
      customDestinationLanguage: null,
    });
    expect(result.success).toBe(true);
  });

  it('validates message creation', () => {
    const result = createMessageSchema.safeParse({
      conversationId: '507f1f77bcf86cd799439011',
      senderId: '507f1f77bcf86cd799439012',
      content: 'Hello',
      type: 'TEXT',
      status: 'SENDING',
    });
    expect(result.success).toBe(true);
  });
});
```

**Commit:**

```bash
git add utils/validation.ts __tests__/validation.test.ts
git commit -m "feat: complete Zod schemas for all Prisma models"
```

---

### Task 2.2: Remplacer api-schemas.ts manuel

**Objectif:** Migration vers génération automatique

**Files:**
- Backup: `packages/shared/types/api-schemas.ts → api-schemas.manual-backup.ts`
- Replace: `api-schemas.ts` avec auto-generated

**Steps:**

1. Backup ancien fichier
2. Générer nouveaux schemas
3. Remplacer api-schemas.ts
4. Build & test
5. Commit

```bash
# 1. Backup
cp types/api-schemas.ts types/api-schemas.manual-backup.ts

# 2. Generate
npm run generate:schemas

# 3. Replace
mv types/api-schemas.generated.ts types/api-schemas.ts

# 4. Build
npm run build

# 5. Verify gateway compiles
cd ../../services/gateway
npm run build

# 6. Commit
git add packages/shared/types/api-schemas.ts \
        packages/shared/types/api-schemas.manual-backup.ts
git commit -m "feat: migrate to auto-generated schemas

BREAKING: api-schemas.ts now auto-generated
- 3059 lines manual → auto-generated
- PATCH variants with nullable fields
- Aligned with Zod source of truth"
```

---

## Phase 3: Optimisation & Validation

### Task 3.1: PATCH optimization

**Objectif:** Tous les PATCH acceptent champs partiels + nullable

**Test bandwidth:**

```bash
# Avant: ~500 bytes
{"firstName":"John","lastName":"Doe","email":"j@e.com",...}

# Après: ~20 bytes
{"firstName":"John"}
```

**Validation:**

```typescript
// __tests__/patch-optimization.test.ts
it('accepts single field', () => {
  const result = updateUserProfileSchema.safeParse({ firstName: 'John' });
  expect(result.success).toBe(true);
});

it('accepts null to clear', () => {
  const result = updateUserProfileSchema.safeParse({
    customDestinationLanguage: null
  });
  expect(result.success).toBe(true);
});
```

---

### Task 3.2: Validation Prisma ↔ Zod

**Objectif:** Garantir alignement type-safe

**Script:** `scripts/validate-schema-alignment.ts`

```typescript
#!/usr/bin/env tsx

import { PrismaClient } from '../prisma/client';
import * as schemas from '../utils/validation';

async function validateAlignment() {
  const prisma = new PrismaClient();
  const errors: string[] = [];

  console.log('🔍 Validating Prisma ↔ Zod alignment...\n');

  try {
    const user = await prisma.user.findFirst();
    if (user) {
      const result = schemas.updateUserProfileSchema.partial().safeParse(user);
      if (!result.success) {
        errors.push(`User: ${result.error.message}`);
      } else {
        console.log('  ✅ User aligned');
      }
    }

    const message = await prisma.message.findFirst();
    if (message && schemas.messageSchema) {
      const result = schemas.messageSchema.safeParse(message);
      if (!result.success) {
        errors.push(`Message: ${result.error.message}`);
      } else {
        console.log('  ✅ Message aligned');
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors.length > 0) {
    console.error('\n❌ Alignment errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('\n✅ All aligned!');
}

validateAlignment().catch(console.error);
```

**CI:**

```yaml
# .github/workflows/schema-validation.yml
name: Validate Schemas

on:
  pull_request:
    paths:
      - 'packages/shared/utils/validation.ts'
      - 'packages/shared/prisma/schema.prisma'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd packages/shared && npm ci
      - run: cd packages/shared && npm run generate:schemas
      - name: Check uncommitted changes
        run: |
          if [[ -n $(git status --porcelain packages/shared/types/api-schemas.ts) ]]; then
            echo "❌ Run npm run generate:schemas"
            exit 1
          fi
      - run: cd packages/shared && npm run validate:schemas
```

---

## Phase 4: Documentation & Déploiement

### Task 4.1: Documentation OpenAPI

**Fichier:** `services/gateway/src/docs/openapi-config.ts`

```typescript
export const openAPIConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Meeshy API',
    description: `
# Meeshy API

## 🔄 PATCH Optimization
All PATCH endpoints accept partial updates:
\`\`\`json
PATCH /api/v1/users/me
{"firstName": "John"}  // Only 1 field
\`\`\`

95% bandwidth reduction vs full updates.

## 📚 Auto-Generated Schemas
All schemas generated from Zod validation.
Source: \`packages/shared/utils/validation.ts\`
    `,
    version: '1.0.0',
  },
  servers: [
    { url: 'https://gate.meeshy.me', description: 'Production' },
    { url: 'https://gate.meeshy.local', description: 'Local' },
  ],
  tags: [
    { name: 'auth', description: 'Authentication' },
    { name: 'users', description: 'User management' },
    // ...
  ],
};
```

**Routes:**

```typescript
// Redirect /api/v1/docs → /docs
server.get('/api/v1/docs', (req, reply) => reply.redirect('/docs'));
server.get('/api/docs', (req, reply) => reply.redirect('/docs'));
```

---

### Task 4.2: Tests E2E

**Fichier:** `__tests__/e2e/schema-system.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Schema System E2E', () => {
  it('generates all schemas', async () => {
    await execFileAsync('npm', ['run', 'generate:schemas'], {
      cwd: __dirname + '/../..'
    });

    const content = fs.readFileSync(
      __dirname + '/../../types/api-schemas.ts',
      'utf-8'
    );

    expect(content).toContain('AUTO-GENERATED');
    expect(content).toContain('updateUserProfileSchema');
    expect(content).toContain('patchUserProfileSchema');
  });

  it('has nullable in PATCH schemas', () => {
    const content = fs.readFileSync(
      __dirname + '/../../types/api-schemas.ts',
      'utf-8'
    );

    const patches = content.match(/export const patch\w+Schema/g);
    expect(patches).toBeTruthy();
    expect(patches!.length).toBeGreaterThan(0);
  });
});
```

---

### Task 4.3: Déploiement

**Makefile:**

```makefile
.PHONY: generate-schemas validate-schemas

generate-schemas:
	cd packages/shared && npm run generate:schemas

validate-schemas:
	cd packages/shared && npm run validate:schemas

build-shared: generate-schemas
	cd packages/shared && npm run build
```

**Pre-commit hook:**

```bash
# .husky/pre-commit
if git diff --cached --name-only | grep -q "validation.ts"; then
  echo "🔄 Regenerating schemas..."
  cd packages/shared && npm run generate:schemas
  git add types/api-schemas.ts
fi
```

---

## Success Criteria

✅ **Metrics:**
- 0 lignes de JSON Schema manuel
- 100% schémas Zod → JSON Schema auto
- Tous PATCH acceptent champs partiels
- CI valide alignement Prisma ↔ Zod
- Tests E2E passent
- `/api/v1/docs` complet et à jour

✅ **Performance:**
- PATCH bandwidth: 500 bytes → 20 bytes (95% réduction)
- Sync effort: 30min → 0min (automatique)
- Risque desync: HIGH → ZERO (CI)

✅ **Documentation:**
- `docs/schema-unification.md`
- `docs/migration-guide.md`
- `docs/troubleshooting.md`
- OpenAPI avec exemples PATCH

---

## Rollback Plan

Si problèmes critiques:

```bash
git revert <commit-hash>
mv packages/shared/types/api-schemas.manual-backup.ts \
   packages/shared/types/api-schemas.ts
make build-gateway
make docker-start-network
```

---

## Timeline Estimé

- **Jour 1:** Phase 1 (analyse + setup) - 4h
- **Jour 2:** Phase 2 (migration) - 6h
- **Jour 3:** Phase 3 (optimisation + validation) - 4h
- **Jour 4:** Phase 4 (docs + déploiement) - 3h
- **Jour 5:** Tests production + monitoring - 2h

**Total:** ~20h sur 1 semaine
