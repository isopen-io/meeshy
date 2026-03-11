# @meeshy/shared Package Deep Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminer les violations systémiques du package shared : `any` types, duplications de types, `isDeleted` redondant, rôle AGENT manquant, `Set<string>` non-sérialisable, et bloat dans index.ts.

**Architecture:** Approche bottom-up — corriger d'abord les types canoniques dans leurs fichiers source, puis dédupliquer en faisant pointer les fichiers secondaires vers la source unique, et enfin nettoyer index.ts pour qu'il soit un pur barrel d'exports. Chaque task est indépendante sauf les tâches de déduplication (T4-T6) qui dépendent de T1-T3.

**Tech Stack:** TypeScript 5.9 strict, Zod 4, Vitest/Jest

---

## Wave 1 : Fixes atomiques (parallélisables)

### Task 1: Eliminer `any` dans les types

**Files:**
- Modify: `packages/shared/types/participant.ts:71`
- Modify: `packages/shared/types/attachment-audio.ts:63,66,70,74,75,161`
- Modify: `packages/shared/types/socketio-events.ts:445`
- Modify: `packages/shared/types/video-call.ts:460-461,517`
- Modify: `packages/shared/types/user-preferences.ts:112`
- Modify: `packages/shared/types/report.ts:159`
- Modify: `packages/shared/types/admin.ts:176`
- Modify: `packages/shared/types/push-notification.ts:88`
- Modify: `packages/shared/types/attachment.ts:312`
- Modify: `packages/shared/types/audio-effects-timeline.ts:242,252`

**Step 1: Fix `participant.ts:71`**

Replace `user: z.any().optional()` with a proper lazy schema:
```typescript
// Before
user: z.any().optional(),

// After
user: z.unknown().optional(),
```

**Step 2: Fix `attachment-audio.ts` (6 occurrences)**

```typescript
// Before (lines 63, 66, 70, 74, 75)
speakerAnalysis?: any;
voiceQualityAnalysis?: any;
documentLayout?: any;
detectedObjects?: any[];
ocrRegions?: any[];

// After
speakerAnalysis?: Record<string, unknown>;
voiceQualityAnalysis?: Record<string, unknown>;
documentLayout?: Record<string, unknown>;
detectedObjects?: readonly Record<string, unknown>[];
ocrRegions?: readonly Record<string, unknown>[];
```

```typescript
// Before (line 161)
metadata?: Record<string, any>;

// After
metadata?: Record<string, unknown>;
```

**Step 3: Fix `socketio-events.ts:445`**

```typescript
// Before
readonly speakerAnalysis?: any;

// After
readonly speakerAnalysis?: Record<string, unknown>;
```

**Step 4: Fix `video-call.ts:460-461,517`**

```typescript
// Before
sfuDevice: any | null;
sfuTransport: any | null;
// ...
readonly details?: any;

// After
sfuDevice: unknown | null;
sfuTransport: unknown | null;
// ...
readonly details?: Record<string, unknown>;
```

**Step 5: Fix `user-preferences.ts:112`**

```typescript
// Before
readonly conversations: any[];

// After
readonly conversations: readonly Record<string, unknown>[];
```

**Step 6: Fix `report.ts:159`**

```typescript
// Before
[key: string]: any;

// After
[key: string]: string | number | boolean | null | undefined;
```

**Step 7: Fix `admin.ts:176`**

```typescript
// Before
export interface AdminApiResponse<T = any> extends ApiResponse<T> {}

// After
export interface AdminApiResponse<T = unknown> extends ApiResponse<T> {}
```

**Step 8: Fix `push-notification.ts:88`**

```typescript
// Before
readonly [key: string]: any;

// After
readonly [key: string]: string | number | boolean | null | undefined;
```

**Step 9: Fix `attachment.ts:312`**

```typescript
// Before
[key: string]: any;

// After
[key: string]: string | number | boolean | Record<string, unknown> | readonly unknown[] | null | undefined;
```

**Step 10: Fix `audio-effects-timeline.ts:242,252`**

```typescript
// Before
export function isValidAudioEffectsTimeline(data: any): data is AudioEffectsTimeline {
// ...
data.events.every((event: any) =>

// After
export function isValidAudioEffectsTimeline(data: unknown): data is AudioEffectsTimeline {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
// ...
(obj.events as unknown[]).every((event: unknown) =>
```

**Step 11: Build shared**

Run: `cd packages/shared && npm run build`
Expected: Success, no errors

**Step 12: Commit**

```bash
git add packages/shared/types/participant.ts packages/shared/types/attachment-audio.ts \
  packages/shared/types/socketio-events.ts packages/shared/types/video-call.ts \
  packages/shared/types/user-preferences.ts packages/shared/types/report.ts \
  packages/shared/types/admin.ts packages/shared/types/push-notification.ts \
  packages/shared/types/attachment.ts packages/shared/types/audio-effects-timeline.ts
git commit -m "fix(shared): replace all any types with unknown/Record<string, unknown>"
```

---

### Task 2: Eliminer `any` dans les utilitaires

**Files:**
- Modify: `packages/shared/utils/errors.ts:33-34,137`
- Modify: `packages/shared/utils/validation.ts:21,46-47,52-53,581,614`
- Modify: `packages/shared/utils/conversation-helpers.ts:141`

**Step 1: Fix `errors.ts:33-34`**

```typescript
// Before
if (typeof (Error as any).captureStackTrace === 'function') {
  (Error as any).captureStackTrace(this, this.constructor);

// After
const ErrorWithCapture = Error as { captureStackTrace?: (target: object, constructor: Function) => void };
if (typeof ErrorWithCapture.captureStackTrace === 'function') {
  ErrorWithCapture.captureStackTrace(this, this.constructor);
```

**Step 2: Fix `errors.ts:137`**

```typescript
// Before
reply: any

// After
reply: { status: (code: number) => { send: (body: unknown) => void } }
```

**Step 3: Fix `validation.ts` — Zod transforms**

```typescript
// Before (lines 46-47, 52-53, 614)
.transform((val: any) => parseInt(val || '20', 10))

// After
.transform((val) => parseInt(val || '20', 10))
```
Zod already infers the type from the preceding `.string().optional()` — the `any` annotation is unnecessary. Remove all `(val: any)` and `(err: any)` annotations in transforms, let Zod infer.

**Step 4: Fix `validation.ts:21`**

```typescript
// Before
const errors = result.error.issues.map((err: any) => ({

// After
const errors = result.error.issues.map((err) => ({
```

**Step 5: Fix `validation.ts:581`**

```typescript
// Before
.refine((data: any) => Object.keys(data).length > 0, {

// After
.refine((data) => Object.keys(data).length > 0, {
```

**Step 6: Fix `conversation-helpers.ts:141`**

Read the function to understand the member type, then type it properly:
```typescript
// Before
const otherMembers = members.filter((m: any) => m.id !== currentUserId);

// After
const otherMembers = members.filter((m) => m.id !== currentUserId);
```
If needed, add a type parameter to the function or define a minimal `{ id: string; displayName?: string }` member interface.

**Step 7: Build shared**

Run: `cd packages/shared && npm run build`
Expected: Success

**Step 8: Commit**

```bash
git add packages/shared/utils/
git commit -m "fix(shared): eliminate any types in utility functions"
```

---

### Task 3: Supprimer `isDeleted` redondant

**Files:**
- Modify: `packages/shared/types/conversation.ts:149`
- Modify: `packages/shared/types/message-types.ts:92`
- Modify: `packages/shared/types/socketio-events.ts:799`
- Modify: `packages/shared/types/index.ts:343`

**Context:** La convention Meeshy interdit les paires boolean + timestamp redondantes. `deletedAt?: Date` suffit (`null` = non supprimé). Le modèle Prisma `Message` n'a PAS de champ `isDeleted`.

**IMPORTANT:** `isEdited` + `editedAt` est OK — Prisma a `isEdited Boolean @default(false)` comme denormalized flag.

**Step 1: Vérifier les consommateurs de `isDeleted`**

Run: `grep -rn "\.isDeleted" apps/web/ apps/ios/ services/gateway/src/ --include="*.ts" --include="*.tsx" --include="*.swift" | grep -v node_modules | grep -v ".d.ts" | head -30`

Analyser si les consommateurs utilisent `isDeleted` ou `deletedAt`. Le but est de ne garder que `deletedAt` dans les types shared, mais les consommateurs devront être mis à jour pour utiliser `!!msg.deletedAt` au lieu de `msg.isDeleted`.

**Step 2: Modifier `conversation.ts:149`**

```typescript
// Before
readonly isDeleted: boolean;
readonly deletedAt?: Date;

// After
readonly deletedAt?: Date;
```

**Step 3: Modifier `message-types.ts:92`**

```typescript
// Before (GatewayMessage)
readonly isDeleted: boolean;
readonly deletedAt?: Date;

// After
readonly deletedAt?: Date;
```

**Step 4: Modifier `socketio-events.ts:799`**

```typescript
// Before (SocketIOMessage)
isDeleted?: boolean;
deletedAt?: Date;

// After
deletedAt?: Date;
```

**Step 5: Modifier `index.ts:343`**

```typescript
// Before (TranslatedMessage — deprecated)
readonly isDeleted: boolean;
readonly deletedAt?: Date;

// After
readonly deletedAt?: Date;
```

**Step 6: Grep et corriger les consommateurs**

Search: `grep -rn "isDeleted" apps/web/ services/gateway/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules`

Remplacer chaque usage:
- `message.isDeleted` → `!!message.deletedAt`
- `isDeleted: true` → `deletedAt: new Date()`
- `isDeleted: false` → `deletedAt: undefined` ou supprimer
- `isDeleted: Boolean(message.isDeleted)` → `deletedAt: message.deletedAt ?? undefined`
- Dans MeeshySocketIOManager: `isDeleted: message.deletedAt !== null` → supprimer, garder `deletedAt`

**Step 7: Build shared + gateway + web**

Run: `cd packages/shared && npm run build && cd ../../services/gateway && npx tsc --noEmit && cd ../../apps/web && npx tsc --noEmit`
Expected: All pass

**Step 8: Commit**

```bash
git add packages/shared/ apps/web/ services/gateway/
git commit -m "fix(shared): remove redundant isDeleted boolean, use deletedAt only"
```

---

### Task 4: Ajouter le rôle AGENT

**Files:**
- Modify: `packages/shared/types/role-types.ts:23-36,42-48,54-61,145-154`
- Modify: `packages/shared/types/index.ts:241-248`
- Test: `packages/shared/types/__tests__/role-types.test.ts`

**Step 1: Write failing test**

```typescript
// In role-types.test.ts
describe('AGENT role', () => {
  test('GlobalUserRole includes AGENT', () => {
    expect(GlobalUserRole.AGENT).toBe('AGENT');
  });

  test('AGENT has correct hierarchy level', () => {
    expect(GLOBAL_ROLE_HIERARCHY[GlobalUserRole.AGENT]).toBe(5);
  });

  test('normalizeGlobalRole recognizes AGENT', () => {
    expect(normalizeGlobalRole('AGENT')).toBe(GlobalUserRole.AGENT);
  });

  test('isGlobalUserRole accepts AGENT', () => {
    expect(isGlobalUserRole('AGENT')).toBe(true);
  });

  test('AGENT is below ANALYST in hierarchy', () => {
    expect(hasMinimumRole('AGENT', 'ANALYST')).toBe(false);
    expect(hasMinimumRole('ANALYST', 'AGENT')).toBe(true);
  });

  test('getEffectiveRole works with AGENT', () => {
    expect(getEffectiveRole('AGENT', 'admin')).toBe('ADMIN');
    expect(getEffectiveRole('AGENT', null)).toBe('AGENT');
  });
});
```

**Step 2: Run test, verify failure**

Run: `cd packages/shared && npx vitest run types/__tests__/role-types.test.ts`
Expected: FAIL — AGENT not defined

**Step 3: Add AGENT to `role-types.ts`**

```typescript
// In GlobalUserRole enum (after ANALYST, before USER)
/** Agent IA (SAV, FAQ, etc.) */
AGENT = 'AGENT',

// In GlobalUserRoleType
| 'AGENT'

// In GLOBAL_ROLE_HIERARCHY (AGENT = 5, below USER = 10)
[GlobalUserRole.AGENT]: 5,

// In UNIFIED_ROLE_LEVELS
AGENT: 5,
```

Note: AGENT is ranked BELOW USER (5 < 10) because AI agents should have fewer privileges than regular users. They can be elevated via member roles if needed.

**Step 4: Add AGENT to `index.ts:241-248`**

```typescript
export enum UserRoleEnum {
  BIGBOSS = 'BIGBOSS',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  AUDIT = 'AUDIT',
  ANALYST = 'ANALYST',
  USER = 'USER',
  AGENT = 'AGENT',
}
```

And add AGENT to `ROLE_HIERARCHY` (index.ts:383-390):
```typescript
[UserRoleEnum.AGENT]: 0,
```

And add AGENT to `DEFAULT_PERMISSIONS` (index.ts:392-460) with minimal permissions (all false, same as USER).

**Step 5: Run test, verify pass**

Run: `cd packages/shared && npx vitest run types/__tests__/role-types.test.ts`
Expected: PASS

**Step 6: Build shared**

Run: `cd packages/shared && npm run build`
Expected: Success

**Step 7: Commit**

```bash
git add packages/shared/types/role-types.ts packages/shared/types/index.ts \
  packages/shared/types/__tests__/role-types.test.ts
git commit -m "feat(shared): add AGENT role aligned with Prisma schema"
```

---

## Wave 2 : Déduplication de types (séquentiel, dépend de Wave 1)

### Task 5: Dédupliquer TranslationModel, MessageTranslation, MessageStatusEntry, UITranslationState

**Files:**
- Modify: `packages/shared/types/conversation.ts:80,86-105,220-229,504-526`
- Modify: `packages/shared/types/message-types.ts:16,21,26-37,43-66,192-201`
- Modify: `packages/shared/types/index.ts:710-711`
- Modify: `packages/shared/types/messaging.ts:58`

**Stratégie:**
- `TranslationModel` : source canonique = `message-types.ts:16`. Supprimer les copies dans `conversation.ts:80` et `index.ts:710-711`. Faire importer/re-exporter.
- `MessageTranslation` : source canonique = `conversation.ts:86-105` (la plus complète, avec encryption fields). Supprimer la copie dans `message-types.ts:26-37`. Importer depuis conversation.ts.
- `MessageStatusEntry` : source canonique = `message-types.ts:43-66`. Supprimer la copie dans `conversation.ts:504-526`. Importer depuis message-types.ts.
- `UITranslationState` : source canonique = `message-types.ts:192-201`. Supprimer la copie dans `conversation.ts:220-229`. Importer depuis message-types.ts.
- `TranslationStatus` : source canonique = `status-types.ts:60` (`ProcessStatus | 'cached'`). La version dans `message-types.ts:21` est un sous-ensemble UI. Renommer cette dernière en `UITranslationStatus` (elle existe déjà dans `conversation.ts:215`).
- `TranslationModelType` dans `messaging.ts:58` : supprimer, importer `TranslationModel` depuis message-types.ts.

**Step 1: Modifier `conversation.ts`**

1. Supprimer la définition de `TranslationModel` (line 80)
2. Ajouter import: `import type { TranslationModel, MessageStatusEntry, UITranslationState } from './message-types.js';`
3. Supprimer la définition de `MessageStatusEntry` (lines 504-526)
4. Supprimer la définition de `UITranslationState` (lines 220-229)
5. Garder `MessageTranslation` dans conversation.ts (la version complète avec encryption)
6. Re-exporter: `export type { TranslationModel, MessageStatusEntry, UITranslationState };`

**Step 2: Modifier `message-types.ts`**

1. Supprimer `TranslationModel` (line 16) — importer depuis conversation.ts
2. Renommer `TranslationStatus` (line 21) en: supprimer la ligne. Utiliser `UITranslationStatus` de conversation.ts ou inline dans `UITranslationState.status`.
3. Supprimer `MessageTranslation` (lines 26-37) — importer depuis conversation.ts
4. Ajouter en haut: `import type { TranslationModel, MessageTranslation } from './conversation.js';`
5. Re-exporter: `export type { TranslationModel, MessageTranslation };`

**Step 3: Modifier `index.ts`**

1. Supprimer `TRANSLATION_MODELS` const et `TranslationModel` type (lines 710-711)
2. Supprimer `MESSAGE_TYPES` const et `MessageType` type (lines 717-718) — ces sont déjà définis dans socketio-events.ts
3. Vérifier que les re-exports depuis `conversation.js` et `message-types.js` couvrent ces types

**Step 4: Modifier `messaging.ts:58`**

Supprimer `TranslationModelType` et importer `TranslationModel`:
```typescript
import type { TranslationModel } from './message-types.js';
// Remplacer chaque usage de TranslationModelType par TranslationModel
```

**Step 5: Build shared**

Run: `cd packages/shared && npm run build`
Expected: Success

**Step 6: Vérifier les consommateurs**

Run: `grep -rn "TranslationModel\b\|MessageStatusEntry\|UITranslationState\|TranslationModelType" apps/web/ services/gateway/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" | head -20`

Corriger les imports si nécessaire.

**Step 7: Build all**

Run: `cd packages/shared && npm run build && cd ../../services/gateway && npx tsc --noEmit`
Expected: All pass

**Step 8: Commit**

```bash
git add packages/shared/types/
git commit -m "refactor(shared): deduplicate TranslationModel, MessageTranslation, MessageStatusEntry, UITranslationState"
```

---

### Task 6: Dédupliquer UserRoleEnum, ConversationRole, ValidationError

**Files:**
- Modify: `packages/shared/types/index.ts:241-248,254,380,383-390,651-655`
- Modify: `packages/shared/types/messaging.ts:311-314`

**Step 1: Remplacer `UserRoleEnum` par re-export de `GlobalUserRole`**

Dans `index.ts`:
```typescript
// Before
export enum UserRoleEnum { ... }
export type UserRole = UserRoleEnum;
export const ROLE_HIERARCHY = { ... };

// After
import { GlobalUserRole, GLOBAL_ROLE_HIERARCHY } from './role-types.js';
/** @deprecated Use GlobalUserRole instead */
export const UserRoleEnum = GlobalUserRole;
export type UserRole = GlobalUserRole;
/** @deprecated Use GLOBAL_ROLE_HIERARCHY instead */
export const ROLE_HIERARCHY: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(GLOBAL_ROLE_HIERARCHY).map(([k, v]) => [k, v])
);
```

**Step 2: Remplacer `ConversationRole` dans index.ts**

```typescript
// Before (line 254)
export type ConversationRole = 'admin' | 'moderator' | 'member';

// After — already exported from role-types.ts via export *
// Supprimer la ligne 254
```

Vérifier que `role-types.ts` est bien exporté via `export *` dans index.ts. Si non, ajouter: `export * from './role-types.js';`

**Step 3: Supprimer `ValidationError` dupliqué**

Dans `messaging.ts:311-314`, supprimer la définition et importer depuis index.ts:
```typescript
import type { ValidationError } from './index.js';
```

Ou mieux: garder la définition dans `messaging.ts` (c'est le fichier spécialisé), et dans `index.ts` supprimer la copie et re-exporter:
```typescript
export type { ValidationError } from './messaging.js';
```

**Step 4: Build shared**

Run: `cd packages/shared && npm run build`
Expected: Success

**Step 5: Commit**

```bash
git add packages/shared/types/index.ts packages/shared/types/messaging.ts
git commit -m "refactor(shared): deduplicate UserRoleEnum, ConversationRole, ValidationError"
```

---

### Task 7: Corriger `Set<string>` non-sérialisable

**Files:**
- Modify: `packages/shared/types/conversation.ts:244`
- Modify: `packages/shared/types/message-types.ts:233`

**Step 1: Modifier `conversation.ts:244`**

```typescript
// Before (MessageWithTranslations)
readonly translatingLanguages: Set<string>;

// After
readonly translatingLanguages: readonly string[];
```

**Step 2: Modifier `message-types.ts:233`**

```typescript
// Before (UIMessage)
readonly translatingLanguages: Set<string>;

// After
readonly translatingLanguages: readonly string[];
```

**Step 3: Grep consommateurs**

Run: `grep -rn "translatingLanguages" apps/web/ services/gateway/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20`

Corriger les usages:
- `new Set<string>()` → `[]`
- `.has(lang)` → `.includes(lang)`
- `.add(lang)` → `[...prev, lang]`
- `.delete(lang)` → `.filter(l => l !== lang)`
- `Set.size` → `.length`

**Step 4: Build all**

Run: `cd packages/shared && npm run build && cd ../../services/gateway && npx tsc --noEmit`
Expected: All pass

**Step 5: Commit**

```bash
git add packages/shared/types/ apps/web/
git commit -m "fix(shared): replace Set<string> with readonly string[] for JSON serialization"
```

---

## Wave 3 : Nettoyage index.ts (dépend de Wave 2)

### Task 8: Nettoyer index.ts — supprimer les types inline legacy

**Files:**
- Modify: `packages/shared/types/index.ts`

**Context:** index.ts contient ~33 définitions inline. Stratégie: déplacer les types actifs vers des fichiers dédiés, supprimer les types legacy non-utilisés.

**Step 1: Identifier les types encore utilisés**

Pour chaque type inline dans index.ts, grep les imports dans apps/ et services/:
```bash
for type in TranslationRequest TranslationResponse ServiceConfig ServiceHealth BubbleTranslation TranslatedMessage Translation GroupMember GroupCreatorInfo Group LinkCreatorInfo ConversationLinkStats ConversationLink AuthRequest AuthResponse AuthMode TypingIndicator OnlineStatus ErrorResponse ValidationError LanguageCode SupportedLanguage ConnectionStats TranslationStats UpdateUserRequest UpdateUserResponse CreateConversationRequest SendMessageRequest; do
  echo "=== $type ==="
  grep -rn "$type" apps/web/ services/gateway/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts" | head -3
done
```

**Step 2: Pour les types utilisés (probablement Group, ConversationLink, Auth*, etc.), garder mais marquer avec TODO**

Ne pas déplacer maintenant — c'est du refactoring profond. Marquer chaque bloc avec `// TODO: move to dedicated file`.

**Step 3: Supprimer les types confirmés non-utilisés**

Pour chaque type avec 0 imports externes: supprimer de index.ts.

Types probablement dead:
- `BubbleTranslation` (remplacé par `UITranslationState`)
- `TranslatedMessage` (marqué deprecated, remplacé par `MessageWithTranslations`)
- `Translation` (trop simple, probablement inutilisé)
- `LanguageCode` (remplacé par `SupportedLanguageInfo`)
- `SupportedLanguage` (juste `string`)

**Step 4: Supprimer `DEFAULT_PERMISSIONS` si un doublon existe**

Vérifier si `DEFAULT_PERMISSIONS` est utilisé en dehors de shared. Si oui, garder. Si non, supprimer (le gateway a probablement sa propre implémentation).

**Step 5: Build shared + gateway**

Run: `cd packages/shared && npm run build && cd ../../services/gateway && npx tsc --noEmit`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/shared/types/index.ts
git commit -m "refactor(shared): remove dead legacy types from index.ts"
```

---

### Task 9: Ajouter `readonly` aux interfaces socketio-events.ts

**Files:**
- Modify: `packages/shared/types/socketio-events.ts`

**Context:** Toutes les interfaces de socketio-events.ts manquent de `readonly`. Les fichiers conversation.ts et message-types.ts les utilisent correctement.

**Step 1: Ajouter `readonly` à `SocketIOMessageSender`**

```typescript
export interface SocketIOMessageSender {
  readonly id: string;
  readonly displayName: string;
  readonly avatar?: string;
  readonly type?: ParticipantType;
  readonly userId?: string;
  readonly username?: string;
  readonly firstName?: string;
  readonly lastName?: string;
}
```

**Step 2: Ajouter `readonly` à `SocketIOMessage`**

Toutes les propriétés deviennent `readonly`.

**Step 3: Ajouter `readonly` à `SocketIOUser`**

Toutes les propriétés deviennent `readonly`.

**Step 4: Ajouter `readonly` à `UserPermissions`**

Toutes les propriétés deviennent `readonly`.

**Step 5: Ajouter `readonly` aux autres interfaces**

Appliquer à: `TranslationEvent`, `TranslationData`, `TypingEvent`, `UserStatusEvent`, `ConversationStatsDTO`, `MessageTranslationCache`, `UserLanguageConfig`, `ConnectionStatus`, `ConnectionDiagnostics`, `SocketIOResponse`.

**Step 6: Build shared + gateway**

Run: `cd packages/shared && npm run build && cd ../../services/gateway && npx tsc --noEmit`
Expected: Peut-être des erreurs si le gateway mute ces objets. Corriger les mutations côté gateway (assigner à une variable locale au lieu de muter).

**Step 7: Commit**

```bash
git add packages/shared/types/socketio-events.ts
git commit -m "refactor(shared): add readonly to all socketio-events.ts interfaces"
```

---

## Wave 4 : Vérification finale

### Task 10: Vérification complète — build all + run tests

**Step 1: Build shared**

Run: `cd packages/shared && npm run build`
Expected: Success, 0 errors

**Step 2: Run shared tests**

Run: `cd packages/shared && npx vitest run`
Expected: All tests pass

**Step 3: Build gateway**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: Success, 0 errors

**Step 4: Build web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Success, 0 errors (ou les mêmes erreurs pré-existantes)

**Step 5: Grep final pour `any` restants**

Run: `grep -rn ": any\b\|as any\|= any\|<any>" packages/shared/types/ packages/shared/utils/ --include="*.ts" | grep -v ".test." | grep -v "__tests__" | grep -v node_modules`
Expected: 0 résultats (ou justifiés)

**Step 6: Commit si corrections nécessaires**

```bash
git add -A
git commit -m "fix(shared): final cleanup after deep review"
```

---

## Résumé des waves

| Wave | Tasks | Parallélisable | Description |
|------|-------|----------------|-------------|
| 1 | T1, T2, T3, T4 | Oui (4 en parallèle) | Fixes atomiques : any, isDeleted, AGENT |
| 2 | T5, T6, T7 | Partiellement (T5→T6, T7 indépendant) | Déduplication de types |
| 3 | T8, T9 | Oui (2 en parallèle) | Nettoyage index.ts + readonly |
| 4 | T10 | Non | Vérification finale |
