# Device Locale 4e Priorité Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le Prisme Linguistique pour insérer `deviceLocale` (`Locale.current` iOS, `Accept-Language` web) en 4e priorité de résolution de langue, après les préférences in-app et avant le fallback `original` / `'fr'`. Sans supplanter les préférences in-app.

**Architecture:** Le contrat est piloté par `packages/shared/utils/conversation-helpers.ts` (source de vérité). Les autres surfaces (gateway, iOS) consomment ce contrat. Côté backend, `User.deviceLocale` est persistée et propagée au translator. Côté iOS, `Locale.current.languageCode` est injecté via header `X-Device-Locale` et inclus dans `preferredContentLanguages`.

**Tech Stack:** TypeScript strict (shared, gateway), Prisma 5 (MongoDB), Fastify 5, Swift 6 (iOS + SDK), Jest (gateway + shared), XCTest (iOS + SDK), pytest indirectement (translator inchangé).

**Spec source :** `docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md`

---

## File Structure

| File | Role | Change |
|------|------|--------|
| `packages/shared/utils/conversation-helpers.ts` | Source de vérité résolution langue (signature étendue + nouvelle fonction `resolveUserLanguagesOrdered`). | Modify |
| `packages/shared/utils/language-normalize.ts` | (Nouveau) Helper `normalizeLanguageCode("fr-FR") → "fr"`. | Create |
| `packages/shared/__tests__/conversation-helpers.test.ts` | Tests pour `resolveUserLanguage` + `resolveUserLanguagesOrdered`. | Create (ou ajouter si fichier existe) |
| `packages/shared/__tests__/language-normalize.test.ts` | Tests pour le helper de normalisation. | Create |
| `packages/shared/prisma/schema.prisma` | Ajout `deviceLocale String?` au modèle `User` après ligne 115. | Modify |
| `services/gateway/src/middleware/deviceLocale.ts` | (Nouveau) Middleware Fastify : lit `X-Device-Locale`, met à jour `User.deviceLocale` avec debounce 5 min. | Create |
| `services/gateway/src/server.ts` | Enregistre le middleware après `registerClientMutationIdHook` (cf. ligne 578). | Modify |
| `services/gateway/src/services/message-translation/MessageTranslationService.ts:600-684` | `_extractConversationLanguages` inclut `user.deviceLocale` dans la liste retournée. | Modify |
| `services/gateway/src/__tests__/unit/middleware/deviceLocale.test.ts` | Tests middleware (debounce, normalisation, no-op). | Create |
| `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts` | Test que `_extractConversationLanguages` inclut deviceLocale. | Create |
| `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift:191-339` | Ajout `deviceLocale: String?` au struct `MeeshyUser` + init + `withProfileChanges` + `preferredContentLanguages` étendu. | Modify |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:344-348` | Injecter `X-Device-Locale` à côté de `clientHeaders`. | Modify |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserTests.swift` | Tests `preferredContentLanguages` incluant deviceLocale. | Create ou modify |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/APIClientHeaderTests.swift` | Tests header `X-Device-Locale` injecté. | Create |
| `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift:72-78` | `resolved` inclut le 4e élément `normalizedDeviceLocale`. | Modify |
| `apps/ios/MeeshyTests/Unit/Models/ConversationLanguagePreferencesTests.swift` | Tests resolved retourne 4 langues, dédup, fallback nil. | Create ou modify |
| `CLAUDE.md` | Section « Prisme Linguistique » : ordre 1-4, retirer la règle « JAMAIS locale appareil ». | Modify |
| `apps/ios/CLAUDE.md` | Section « Prisme Linguistique — Implementation iOS » : mise à jour ordre + drapeaux max 4. | Modify |

Aucun changement requis dans `services/translator/`.

---

## Phase 1 — Shared Layer (source de vérité)

### Task 1: Helper `normalizeLanguageCode`

**Files:**
- Create: `packages/shared/utils/language-normalize.ts`
- Create: `packages/shared/__tests__/language-normalize.test.ts`

- [ ] **Step 1: Test rouge — normalisation**

Créer `packages/shared/__tests__/language-normalize.test.ts` :

```typescript
import { normalizeLanguageCode } from '../utils/language-normalize';

describe('normalizeLanguageCode', () => {
  it('returns ISO 639-1 for plain code', () => {
    expect(normalizeLanguageCode('fr')).toBe('fr');
  });

  it('strips region tag', () => {
    expect(normalizeLanguageCode('fr-FR')).toBe('fr');
    expect(normalizeLanguageCode('en-US')).toBe('en');
  });

  it('strips region and script tags', () => {
    expect(normalizeLanguageCode('zh-Hant-HK')).toBe('zh');
  });

  it('handles underscore separators (iOS Locale.current.identifier)', () => {
    expect(normalizeLanguageCode('fr_FR')).toBe('fr');
  });

  it('lowercases the language code', () => {
    expect(normalizeLanguageCode('FR-FR')).toBe('fr');
  });

  it('returns undefined for empty or invalid input', () => {
    expect(normalizeLanguageCode('')).toBeUndefined();
    expect(normalizeLanguageCode(undefined)).toBeUndefined();
    expect(normalizeLanguageCode(null as unknown as string)).toBeUndefined();
    expect(normalizeLanguageCode('@@@')).toBeUndefined();
    expect(normalizeLanguageCode('a')).toBeUndefined();  // 1-char ne suffit pas
  });

  it('caps length at 2 chars (NLLB-200 mapping uses 2-letter codes)', () => {
    expect(normalizeLanguageCode('eng')).toBe('en');  // garde les 2 premiers ?
    // NOTE: cf. ambiguïté — voir Step 2 pour résoudre.
  });
});
```

- [ ] **Step 2: Run et vérifier l'échec**

Run: `cd packages/shared && npm test -- language-normalize`
Expected: tests échouent avec `Cannot find module '../utils/language-normalize'`.

- [ ] **Step 3: Implémenter `normalizeLanguageCode`**

Créer `packages/shared/utils/language-normalize.ts` :

```typescript
/**
 * Normalise un identifier de langue vers la forme ISO 639-1 (2 lettres lowercase).
 *
 * Entrées acceptées (cas réels rencontrés cross-platform) :
 * - `"fr"`, `"FR"` → `"fr"`
 * - `"fr-FR"`, `"fr_FR"` (iOS Locale.current.identifier) → `"fr"`
 * - `"zh-Hant-HK"` (script + region) → `"zh"`
 * - `"en-US"` (Accept-Language web) → `"en"`
 *
 * Retourne `undefined` pour les entrées invalides (vides, malformées,
 * codes < 2 caractères). Le translator NLLB-200 utilise un mapping 2-lettres
 * (`"fr" → "fra_Latn"`), donc on capture cette granularité.
 */
export function normalizeLanguageCode(input: string | null | undefined): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  if (trimmed.length < 2) return undefined;

  // Garder uniquement la partie avant le premier séparateur (-, _)
  const primary = trimmed.split(/[-_]/)[0]?.toLowerCase();
  if (!primary || primary.length < 2) return undefined;

  // Filtre des caractères non-alphabétiques (ex: "@@@")
  if (!/^[a-z]+$/.test(primary)) return undefined;

  // Restreindre à 2 lettres (ISO 639-1 ; NLLB-200 mapping)
  return primary.slice(0, 2);
}
```

- [ ] **Step 4: Run et vérifier le vert**

Run: `cd packages/shared && npm test -- language-normalize`
Expected: tous les tests passent.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/utils/language-normalize.ts packages/shared/__tests__/language-normalize.test.ts
git commit -m "feat(shared): add normalizeLanguageCode helper (ISO 639-1, supports - / _ separators)"
```

---

### Task 2: Étendre `resolveUserLanguage` + nouveau `resolveUserLanguagesOrdered`

**Files:**
- Modify: `packages/shared/utils/conversation-helpers.ts`
- Create or modify: `packages/shared/__tests__/conversation-helpers.test.ts`

- [ ] **Step 1: Test rouge — nouvelle signature avec `deviceLocale`**

Créer ou ajouter dans `packages/shared/__tests__/conversation-helpers.test.ts` :

```typescript
import { resolveUserLanguage, resolveUserLanguagesOrdered } from '../utils/conversation-helpers';

describe('resolveUserLanguage with deviceLocale', () => {
  it('returns systemLanguage when set, ignoring deviceLocale', () => {
    expect(resolveUserLanguage(
      { systemLanguage: 'fr', regionalLanguage: undefined, customDestinationLanguage: undefined },
      { deviceLocale: 'it' }
    )).toBe('fr');
  });

  it('returns deviceLocale when all 3 in-app prefs are unset', () => {
    expect(resolveUserLanguage(
      { systemLanguage: undefined, regionalLanguage: undefined, customDestinationLanguage: undefined },
      { deviceLocale: 'it-IT' }
    )).toBe('it');
  });

  it('normalizes deviceLocale (zh-Hant-HK → zh)', () => {
    expect(resolveUserLanguage(
      { systemLanguage: undefined, regionalLanguage: undefined, customDestinationLanguage: undefined },
      { deviceLocale: 'zh-Hant-HK' }
    )).toBe('zh');
  });

  it('falls back to fr when nothing is set', () => {
    expect(resolveUserLanguage({
      systemLanguage: undefined, regionalLanguage: undefined, customDestinationLanguage: undefined
    })).toBe('fr');
  });

  it('backward compat: single-argument call still works', () => {
    expect(resolveUserLanguage({
      systemLanguage: 'es', regionalLanguage: undefined, customDestinationLanguage: undefined
    })).toBe('es');
  });
});

describe('resolveUserLanguagesOrdered', () => {
  it('returns 4-level priority list when all set and distinct', () => {
    expect(resolveUserLanguagesOrdered(
      { systemLanguage: 'fr', regionalLanguage: 'es', customDestinationLanguage: 'pt' },
      { deviceLocale: 'it' }
    )).toEqual(['fr', 'es', 'pt', 'it']);
  });

  it('dedupes when deviceLocale matches an in-app pref', () => {
    expect(resolveUserLanguagesOrdered(
      { systemLanguage: 'fr', regionalLanguage: undefined, customDestinationLanguage: undefined },
      { deviceLocale: 'fr-FR' }
    )).toEqual(['fr']);
  });

  it('omits deviceLocale when invalid', () => {
    expect(resolveUserLanguagesOrdered(
      { systemLanguage: 'fr', regionalLanguage: undefined, customDestinationLanguage: undefined },
      { deviceLocale: '@@@' }
    )).toEqual(['fr']);
  });

  it('returns empty when nothing is set (caller decides fallback)', () => {
    expect(resolveUserLanguagesOrdered({
      systemLanguage: undefined, regionalLanguage: undefined, customDestinationLanguage: undefined
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run et vérifier l'échec**

Run: `cd packages/shared && npm test -- conversation-helpers`
Expected: les tests `resolveUserLanguagesOrdered` échouent (fonction inexistante). Les tests `resolveUserLanguage with deviceLocale` peuvent échouer ou passer selon la branche actuelle — au minimum les cas `deviceLocale` doivent échouer car la signature actuelle ne le supporte pas.

- [ ] **Step 3: Étendre `conversation-helpers.ts`**

Dans `packages/shared/utils/conversation-helpers.ts`, remplacer la fonction `resolveUserLanguage` actuelle (lignes 10-19) par :

```typescript
import { normalizeLanguageCode } from './language-normalize';

export interface ResolveUserLanguageOpts {
  /** Locale appareil (`Locale.current.identifier` iOS, `Accept-Language` web). */
  deviceLocale?: string;
}

/**
 * Résout la langue préférée d'un utilisateur pour l'affichage de contenu.
 * Ordre : systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale → 'fr'
 *
 * La locale appareil intervient en 4e priorité (Prisme Linguistique étendu
 * 2026-05-26) — elle ne supplante jamais les préférences in-app.
 */
export function resolveUserLanguage(
  user: {
    systemLanguage?: string;
    regionalLanguage?: string;
    customDestinationLanguage?: string;
  },
  opts: ResolveUserLanguageOpts = {}
): string {
  if (user.systemLanguage) return user.systemLanguage;
  if (user.regionalLanguage) return user.regionalLanguage;
  if (user.customDestinationLanguage) return user.customDestinationLanguage;
  const normalized = normalizeLanguageCode(opts.deviceLocale);
  if (normalized) return normalized;
  return 'fr';
}

/**
 * Liste ordonnée et dédupliquée des langues préférées d'un utilisateur.
 * Utilisée pour itérer sur les traductions disponibles dans l'ordre de priorité
 * du Prisme Linguistique. Ne contient PAS de fallback `'fr'` : si tout est vide,
 * la liste est vide et le caller décide.
 */
export function resolveUserLanguagesOrdered(
  user: {
    systemLanguage?: string;
    regionalLanguage?: string;
    customDestinationLanguage?: string;
  },
  opts: ResolveUserLanguageOpts = {}
): string[] {
  const candidates = [
    user.systemLanguage,
    user.regionalLanguage,
    user.customDestinationLanguage,
    normalizeLanguageCode(opts.deviceLocale),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const lc = c.toLowerCase();
    if (seen.has(lc)) continue;
    seen.add(lc);
    out.push(lc);
  }
  return out;
}
```

- [ ] **Step 4: Mettre à jour `getRequiredLanguages` pour propager `deviceLocale`**

Modifier la fonction `getRequiredLanguages` (lignes 175-192) pour accepter un opt-in :

```typescript
export function getRequiredLanguages(
  conversationMembers: Array<{
    systemLanguage?: string;
    regionalLanguage?: string;
    customDestinationLanguage?: string;
    deviceLocale?: string;
  }>
): string[] {
  const languages = new Set<string>();

  conversationMembers.forEach(user => {
    const lang = resolveUserLanguage(user, { deviceLocale: user.deviceLocale });
    if (lang) {
      languages.add(lang);
    }
  });

  return Array.from(languages);
}
```

- [ ] **Step 5: Run et vérifier le vert**

Run: `cd packages/shared && npm test -- conversation-helpers`
Expected: tous les tests passent.

Run aussi le full build pour catch tout autre call site cassé : `cd packages/shared && npm run build`
Expected: `tsc` réussit. Si un call site existant casse à cause de la nouvelle signature, l'option `opts` est facultative donc cela ne devrait pas arriver — sinon, fix le call site.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/utils/conversation-helpers.ts packages/shared/__tests__/conversation-helpers.test.ts
git commit -m "feat(shared): resolveUserLanguage accepts deviceLocale opt, add resolveUserLanguagesOrdered

Locale appareil entre en 4e priorité du Prisme Linguistique, après les
préférences in-app (system/regional/custom) et avant le fallback 'fr'.
Backward compat: l'option deviceLocale est facultative, les appels
existants restent valides."
```

---

### Task 3: Schéma Prisma — `User.deviceLocale`

**Files:**
- Modify: `packages/shared/prisma/schema.prisma`

- [ ] **Step 1: Ajouter le champ après `customDestinationLanguage` (ligne 115)**

Ouvre `packages/shared/prisma/schema.prisma`, localise le bloc `model User {` (ligne 81) et la ligne 115 :

```prisma
customDestinationLanguage String?
```

Ajoute juste en dessous :

```prisma
  // Locale appareil (Locale.current iOS, Accept-Language web) propagée par le client.
  // 4e priorité Prisme Linguistique 2026-05-26. Max 8 char (ISO 639-1 normalisé).
  deviceLocale              String?
```

- [ ] **Step 2: Regénérer le client Prisma**

Run: `cd packages/shared && npx prisma generate`
Expected: `✔ Generated Prisma Client`.

- [ ] **Step 3: Vérifier qu'aucun code existant n'est cassé par la nouvelle propriété**

Run: `cd packages/shared && npm run build`
Expected: `tsc` réussit.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma packages/shared/prisma/client
git commit -m "feat(shared): add User.deviceLocale field for 4th-priority Prisme

Nullable string, normalized to ISO 639-1 by the gateway middleware.
No data migration needed: null = legacy behavior, populated opportunistically
on first authenticated request from a client that sends X-Device-Locale."
```

---

## Phase 2 — Gateway

### Task 4: Middleware `deviceLocale.ts`

**Files:**
- Create: `services/gateway/src/middleware/deviceLocale.ts`
- Create: `services/gateway/src/__tests__/unit/middleware/deviceLocale.test.ts`

- [ ] **Step 1: Lire un middleware existant comme référence de style**

Run: `cat services/gateway/src/middleware/validation.ts | head -60`
Expected: comprendre la signature Fastify (`async (req, reply) => {…}`, types FastifyRequest/FastifyReply, imports).

Lire aussi `services/gateway/src/__tests__/unit/middleware/auth.test.ts` pour le style des tests.

- [ ] **Step 2: Test rouge — middleware**

Créer `services/gateway/src/__tests__/unit/middleware/deviceLocale.test.ts` :

```typescript
import { deviceLocaleMiddleware, _resetDeviceLocaleCache } from '../../../middleware/deviceLocale';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../../config/database';

jest.mock('../../../config/database', () => ({
  prisma: { user: { update: jest.fn() } }
}));

const makeReq = (headers: Record<string, string>, user?: { id: string; deviceLocale?: string | null }) => ({
  headers,
  user,
}) as unknown as FastifyRequest;

const makeReply = () => ({} as FastifyReply);

beforeEach(() => {
  (prisma.user.update as jest.Mock).mockReset();
  _resetDeviceLocaleCache();
});

describe('deviceLocaleMiddleware', () => {
  it('is a no-op when header is absent', async () => {
    await deviceLocaleMiddleware(makeReq({}, { id: 'u1' }), makeReply());
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('is a no-op for unauthenticated requests', async () => {
    await deviceLocaleMiddleware(makeReq({ 'x-device-locale': 'fr-FR' }), makeReply());
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('persists normalized deviceLocale on first call', async () => {
    await deviceLocaleMiddleware(
      makeReq({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: null }),
      makeReply()
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deviceLocale: 'fr' },
    });
  });

  it('is a no-op when value unchanged', async () => {
    await deviceLocaleMiddleware(
      makeReq({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: 'fr' }),
      makeReply()
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('respects 5-minute debounce on subsequent calls for same user', async () => {
    const req1 = makeReq({ 'x-device-locale': 'fr-FR' }, { id: 'u1', deviceLocale: null });
    await deviceLocaleMiddleware(req1, makeReply());
    expect(prisma.user.update).toHaveBeenCalledTimes(1);

    // 2nd call within 5 min — debounced even if user changes locale to 'es'
    const req2 = makeReq({ 'x-device-locale': 'es-ES' }, { id: 'u1', deviceLocale: 'fr' });
    await deviceLocaleMiddleware(req2, makeReply());
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed headers', async () => {
    await deviceLocaleMiddleware(
      makeReq({ 'x-device-locale': '@@@' }, { id: 'u1', deviceLocale: null }),
      makeReply()
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run et vérifier l'échec**

Run: `cd services/gateway && npm test -- deviceLocale`
Expected: tests échouent — module middleware introuvable.

- [ ] **Step 4: Implémenter le middleware**

Créer `services/gateway/src/middleware/deviceLocale.ts` :

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const DEBOUNCE_MS = 5 * 60 * 1000;  // 5 min — évite l'écriture à chaque requête
const lastUpdateByUserId = new Map<string, number>();

/**
 * Reset interne — utilisé par les tests uniquement.
 */
export function _resetDeviceLocaleCache(): void {
  lastUpdateByUserId.clear();
}

/**
 * Middleware Fastify : si le client envoie X-Device-Locale, normalise et
 * persiste opportunément dans User.deviceLocale (debounce 5 min par user).
 *
 * Pas une erreur si le header est absent, malformé, ou si l'utilisateur n'est
 * pas authentifié — le contrat est best-effort.
 */
export async function deviceLocaleMiddleware(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers['x-device-locale'];
  if (!header || typeof header !== 'string') return;

  const normalized = normalizeLanguageCode(header);
  if (!normalized) return;

  const user = (req as FastifyRequest & { user?: { id: string; deviceLocale?: string | null } }).user;
  if (!user) return;

  if (user.deviceLocale === normalized) return;  // no-op si déjà à jour

  const last = lastUpdateByUserId.get(user.id);
  const now = Date.now();
  if (last && now - last < DEBOUNCE_MS) return;  // debounce

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { deviceLocale: normalized },
    });
    lastUpdateByUserId.set(user.id, now);
  } catch (err) {
    // Best-effort : ne jamais casser une requête authentifiée pour une préférence
    logger.warn({ userId: user.id, normalized, err }, 'deviceLocaleMiddleware: persist failed');
  }
}
```

- [ ] **Step 5: Run tests et vérifier vert**

Run: `cd services/gateway && npm test -- deviceLocale`
Expected: tous les tests passent.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/middleware/deviceLocale.ts services/gateway/src/__tests__/unit/middleware/deviceLocale.test.ts
git commit -m "feat(gateway): deviceLocale middleware (X-Device-Locale → User.deviceLocale, debounced 5 min)

Best-effort: header absent / malformé / unauthenticated → no-op.
Normalise via @meeshy/shared/utils/language-normalize."
```

---

### Task 5: Enregistrer le middleware dans `server.ts`

**Files:**
- Modify: `services/gateway/src/server.ts:578` (après `registerClientMutationIdHook`)

- [ ] **Step 1: Ajouter l'import et l'enregistrement**

Ouvre `services/gateway/src/server.ts`, localise ligne 578 :

```typescript
        registerClientMutationIdHook(this.server)
```

Juste en dessous, ajoute :

```typescript
        // X-Device-Locale → User.deviceLocale (4e priorité Prisme Linguistique).
        // onRequest car le hook ne dépend que des headers et de req.user (post-auth).
        this.server.addHook('onRequest', deviceLocaleMiddleware)
```

En haut du fichier, ajoute l'import (au bon endroit avec les autres middleware imports — typiquement vers ligne 30-31) :

```typescript
import { deviceLocaleMiddleware } from './middleware/deviceLocale'
```

- [ ] **Step 2: Vérifier le build TypeScript**

Run: `cd services/gateway && npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add services/gateway/src/server.ts
git commit -m "feat(gateway): register deviceLocale middleware in server hooks"
```

---

### Task 6: Propager `deviceLocale` dans `MessageTranslationService._extractConversationLanguages`

**Files:**
- Modify: `services/gateway/src/services/message-translation/MessageTranslationService.ts:600-684`
- Create: `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts`

- [ ] **Step 1: Lire le code actuel**

Run: `sed -n '590,700p' services/gateway/src/services/message-translation/MessageTranslationService.ts`
Expected: voir la fonction `_extractConversationLanguages`, ce qu'elle sélectionne dans Prisma (`systemLanguage`, `regionalLanguage`), et la forme du retour.

- [ ] **Step 2: Test rouge**

Créer `services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts` :

```typescript
import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

// Mock Prisma — selon le pattern observé dans les autres tests du dossier.
// Si un MockPrismaClient existe, l'utiliser ; sinon mock minimal.
jest.mock('../../../config/database', () => ({
  prisma: {
    conversationMember: {
      findMany: jest.fn(),
    },
  },
}));
import { prisma } from '../../../config/database';

describe('MessageTranslationService._extractConversationLanguages', () => {
  beforeEach(() => {
    (prisma.conversationMember.findMany as jest.Mock).mockReset();
    // Reset cache interne du service si nécessaire — selon implémentation
  });

  it('inclut deviceLocale parmi les destinations quand distinct des prefs in-app', async () => {
    (prisma.conversationMember.findMany as jest.Mock).mockResolvedValue([
      { user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: 'it' } },
      { user: { systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: 'en' } },
    ]);
    const service = new MessageTranslationService(/* deps... */);
    const langs = await (service as any)._extractConversationLanguages('conv1');
    expect(langs.sort()).toEqual(['en', 'fr', 'it'].sort());
  });

  it('dedupe deviceLocale matching an in-app pref', async () => {
    (prisma.conversationMember.findMany as jest.Mock).mockResolvedValue([
      { user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: 'fr' } },
    ]);
    const service = new MessageTranslationService(/* deps... */);
    const langs = await (service as any)._extractConversationLanguages('conv1');
    expect(langs).toEqual(['fr']);
  });
});
```

Note : si la signature `new MessageTranslationService(/* deps... */)` exige des arguments, copie le pattern utilisé dans les autres tests du dossier `services/gateway/src/__tests__/unit/services/`.

- [ ] **Step 3: Run et vérifier l'échec**

Run: `cd services/gateway && npm test -- message-translation-destinations`
Expected: échoue car la sélection Prisma actuelle ne charge pas `deviceLocale` ni ne l'inclut dans le retour.

- [ ] **Step 4: Modifier `_extractConversationLanguages`**

Dans `services/gateway/src/services/message-translation/MessageTranslationService.ts`, lignes 652-684 (la portion qui sélectionne et collecte les langues), apporter ces modifications :

1. Ajouter `deviceLocale: true` dans le `select` Prisma de `conversationMember.findMany`. Exemple si la requête actuelle ressemble à :

```typescript
const members = await prisma.conversationMember.findMany({
  where: { conversationId, isActive: true },
  select: {
    user: {
      select: {
        systemLanguage: true,
        regionalLanguage: true,
        customDestinationLanguage: true,
      },
    },
  },
});
```

Ajouter `deviceLocale: true` :

```typescript
        user: {
          select: {
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            deviceLocale: true,
          },
        },
```

2. Dans la boucle de collecte (probablement vers ligne 660-680), utiliser `resolveUserLanguagesOrdered` du shared :

```typescript
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';

// ... dans la fonction :
const set = new Set<string>();
for (const m of members) {
  const u = m.user;
  if (!u) continue;
  for (const code of resolveUserLanguagesOrdered(
    u,
    { deviceLocale: u.deviceLocale ?? undefined }
  )) {
    set.add(code);
  }
}
return Array.from(set);
```

Si la fonction actuelle utilise une logique différente (ex: `resolveUserLanguage` directe + push), respecter la sémantique existante mais inclure `deviceLocale` dans les destinations.

- [ ] **Step 5: Run tests et vérifier le vert**

Run: `cd services/gateway && npm test -- message-translation-destinations`
Expected: les deux tests passent.

Lancer aussi la suite complète du module pour les régressions :
Run: `cd services/gateway && npm test -- message-translation`
Expected: aucune régression (les tests pré-existants restent verts).

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/message-translation/MessageTranslationService.ts services/gateway/src/__tests__/unit/services/message-translation-destinations.test.ts
git commit -m "feat(gateway): _extractConversationLanguages includes User.deviceLocale

Propagates the 4th-priority device locale to translator destinations.
Dedupe is handled by resolveUserLanguagesOrdered (shared)."
```

---

## Phase 3 — iOS + SDK

### Task 7: SDK — `MeeshyUser.deviceLocale` + `preferredContentLanguages`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift:191-339`
- Create or modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserTests.swift`

- [ ] **Step 1: Test rouge**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserTests.swift` (ou ajouter à un fichier existant si présent) :

```swift
import XCTest
@testable import MeeshySDK

final class MeeshyUserPreferredContentLanguagesTests: XCTestCase {

    func test_preferredContentLanguages_includesDeviceLocale_in_fourthPosition() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: "fr",
            regionalLanguage: "es",
            customDestinationLanguage: "pt",
            deviceLocale: "it"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr", "es", "pt", "it"])
    }

    func test_preferredContentLanguages_dedupesDeviceLocale_matchingInAppPref() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocale: "fr"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_fallsBackToFr_whenAllNil() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            systemLanguage: nil,
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocale: nil
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }

    func test_preferredContentLanguages_normalizesDeviceLocale_minusForm() {
        let user = MeeshyUser(
            id: "u1", username: "alice",
            deviceLocale: "fr-FR"
        )
        XCTAssertEqual(user.preferredContentLanguages, ["fr"])
    }
}
```

- [ ] **Step 2: Run et échec**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/MeeshyUserPreferredContentLanguagesTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: échec — `MeeshyUser` n'a pas de paramètre `deviceLocale`.

- [ ] **Step 3: Étendre `MeeshyUser`**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` :

1. Ajouter la propriété stored à côté des autres prefs de traduction (juste après `customDestinationLanguage` ligne 222) :

```swift
    public let customDestinationLanguage: String?
    public let autoTranslateEnabled: Bool?
    /// Locale appareil (Locale.current iOS, Accept-Language web).
    /// 4e priorité Prisme Linguistique — propagée par APIClient via header X-Device-Locale,
    /// persistée serveur dans User.deviceLocale.
    public let deviceLocale: String?
```

2. Ajouter à l'init (ligne 231-250) :

```swift
        customDestinationLanguage: String? = nil,
        autoTranslateEnabled: Bool? = nil,
        deviceLocale: String? = nil,
        timezone: String? = nil,
        ...
```

Et dans le body de l'init :

```swift
        self.customDestinationLanguage = customDestinationLanguage
        self.autoTranslateEnabled = autoTranslateEnabled
        self.deviceLocale = deviceLocale
        self.timezone = timezone
        ...
```

3. Mettre à jour `withProfileChanges` (ligne 289-322) pour propager `deviceLocale` :

```swift
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            deviceLocale: deviceLocale,
            timezone: timezone,
            ...
```

4. Remplacer le commentaire et l'implémentation de `preferredContentLanguages` (lignes 324-340+) :

```swift
    /// Ordered list of preferred content languages for the Prisme Linguistique.
    /// Resolution order:
    /// 1. systemLanguage   (in-app)
    /// 2. regionalLanguage (in-app)
    /// 3. customDestinationLanguage (in-app)
    /// 4. deviceLocale     (Locale.current — added 2026-05-26)
    /// 5. "fr"             (ultimate fallback when nothing is set)
    public var preferredContentLanguages: [String] {
        var preferred: [String] = []
        let append: (String?) -> Void = { code in
            guard let code = code, !code.isEmpty else { return }
            let normalized = Self.normalizeLanguageCode(code)
            guard let n = normalized else { return }
            if !preferred.contains(where: { $0.caseInsensitiveCompare(n) == .orderedSame }) {
                preferred.append(n)
            }
        }
        append(systemLanguage)
        append(regionalLanguage)
        append(customDestinationLanguage)
        append(deviceLocale)
        if preferred.isEmpty {
            preferred.append("fr")
        }
        return preferred
    }

    /// Normalise un identifier de langue vers ISO 639-1 (2 lettres lowercase).
    /// Miroir Swift de `normalizeLanguageCode` (packages/shared/utils/language-normalize.ts).
    static func normalizeLanguageCode(_ input: String?) -> String? {
        guard let input = input?.trimmingCharacters(in: .whitespaces),
              input.count >= 2 else { return nil }
        let primary = input.split(whereSeparator: { $0 == "-" || $0 == "_" }).first?.lowercased() ?? ""
        guard primary.count >= 2,
              primary.allSatisfy({ $0.isLetter }) else { return nil }
        return String(primary.prefix(2))
    }
```

**Important** : le helper `normalizeLanguageCode` Swift miroite la version TypeScript du shared. Garder les deux synchrones (toute évolution doit toucher les deux). Documenter ce miroir dans `apps/ios/CLAUDE.md` (Phase 4 Task 11).

- [ ] **Step 4: Run et vérifier vert**

Run même commande qu'à Step 2.
Expected: les 4 tests passent.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Auth/MeeshyUserTests.swift
git commit -m "feat(sdk): MeeshyUser.deviceLocale + preferredContentLanguages 4-level priority

Adds the optional deviceLocale field carried by /auth/me & profile updates.
preferredContentLanguages now resolves: system > regional > custom > deviceLocale > fr.
Mirror Swift helper normalizeLanguageCode kept in sync with shared TS helper."
```

---

### Task 8: SDK — `APIClient` injecte `X-Device-Locale`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:344-348`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/APIClientHeaderTests.swift`

- [ ] **Step 1: Vérifier ClientInfoProvider — utilise-t-il déjà la locale ?**

Run:
```bash
grep -rn "Locale.current\|X-Device-Locale\|locale" packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider*.swift 2>/dev/null
grep -rn "ClientInfoProvider" packages/MeeshySDK/Sources/MeeshySDK/Networking/ | head -10
```
Expected: localiser le fichier. Si `ClientInfoProvider.buildHeaders()` envoie déjà un header `X-Client-Locale`, on l'ajuste plutôt que d'ajouter un doublon. **Si non**, on ajoute `X-Device-Locale` séparé.

**Décision dans le plan** : on ajoute un header DÉDIÉ `X-Device-Locale` (distinct des autres "client info" comme version/device/geo) pour que le middleware gateway puisse cibler précisément ce signal sans dépendre du payload bricolé d'autres headers. Si une consolidation s'avère pertinente, un follow-up le fera.

- [ ] **Step 2: Test rouge**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/APIClientHeaderTests.swift` :

```swift
import XCTest
@testable import MeeshySDK

final class APIClientHeaderTests: XCTestCase {

    func test_buildURLRequest_injectsXDeviceLocale_fromLocaleCurrent() async throws {
        // L'APIClient doit injecter X-Device-Locale: <Locale.current.identifier>
        // sur toute requête sortante. On vérifie via une route fictive interceptée.
        let client = APIClient.shared
        let request = try await client._buildURLRequestForTesting(
            endpoint: "/test/echo",
            method: "GET",
            body: nil,
            headers: nil,
            authToken: nil
        )
        let value = request.value(forHTTPHeaderField: "X-Device-Locale")
        XCTAssertNotNil(value, "X-Device-Locale header must be present")
        // Format: lettres et optionnel séparateur. Pas d'assertion exacte sur la valeur
        // (dépend du simulateur). Mais on vérifie qu'elle est non-vide et parseable.
        XCTAssertTrue((value ?? "").count >= 2)
    }

    func test_buildURLRequest_normalizesUnderscoreToDash_inXDeviceLocale() async throws {
        // Locale.current.identifier sur iOS renvoie "fr_FR" (underscore).
        // Pour le serveur on préfère "fr-FR" (RFC 5646 conformant Accept-Language style).
        let client = APIClient.shared
        let request = try await client._buildURLRequestForTesting(
            endpoint: "/test/echo",
            method: "GET",
            body: nil,
            headers: nil,
            authToken: nil
        )
        let value = request.value(forHTTPHeaderField: "X-Device-Locale") ?? ""
        XCTAssertFalse(value.contains("_"), "Underscore should be converted to dash: \(value)")
    }
}
```

L'introspection utilise `_buildURLRequestForTesting` qu'on doit exposer (Step 4).

- [ ] **Step 3: Run et échec attendu**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/APIClientHeaderTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: échec (helper testing absent et header non injecté).

- [ ] **Step 4: Implémenter — ajout du header dans `request(...)`**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`, juste après les lignes 344-348 (clientHeaders boucle) :

```swift
        // Client identification headers (version, device, locale, geo)
        let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
        for (key, value) in clientHeaders {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }

        // 4e priorité Prisme Linguistique — locale appareil pour permettre au
        // gateway/translator de générer la traduction adaptée à l'usage réel.
        // Format: Locale.current.identifier transformé en RFC 5646 (underscore → dash).
        if let deviceLocale = Self.currentDeviceLocaleHeaderValue() {
            urlRequest.setValue(deviceLocale, forHTTPHeaderField: "X-Device-Locale")
        }
```

Ajouter en bas du fichier (ou dans une `extension APIClient`) la helper :

```swift
extension APIClient {
    /// Locale appareil formatée pour le header X-Device-Locale.
    /// `Locale.current.identifier` retourne `"fr_FR"` (underscore) ; on convertit en `"fr-FR"`.
    static func currentDeviceLocaleHeaderValue() -> String? {
        let id = Locale.current.identifier
        guard !id.isEmpty else { return nil }
        return id.replacingOccurrences(of: "_", with: "-")
    }
}
```

Ajouter aussi le helper testing (visible-en-tests) sur `APIClient` :

```swift
#if DEBUG
extension APIClient {
    /// Construit une URLRequest pour les tests d'introspection des headers.
    /// Ne déclenche aucun réseau. Reproduit fidèlement le pipeline de headers
    /// utilisé par `request(...)`.
    func _buildURLRequestForTesting(
        endpoint: String,
        method: String,
        body: Data?,
        headers: [String: String]?,
        authToken: String?
    ) async throws -> URLRequest {
        var urlRequest = URLRequest(url: URL(string: "https://example.test\(endpoint)")!)
        urlRequest.httpMethod = method
        let clientHeaders = await ClientInfoProvider.shared.buildHeaders()
        for (key, value) in clientHeaders {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        if let deviceLocale = Self.currentDeviceLocaleHeaderValue() {
            urlRequest.setValue(deviceLocale, forHTTPHeaderField: "X-Device-Locale")
        }
        if let token = authToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }
        headers?.forEach { urlRequest.setValue($1, forHTTPHeaderField: $0) }
        return urlRequest
    }
}
#endif
```

- [ ] **Step 5: Run tests vert**

Run même commande qu'au Step 3.
Expected: les 2 tests passent.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift packages/MeeshySDK/Tests/MeeshySDKTests/Networking/APIClientHeaderTests.swift
git commit -m "feat(sdk/api): inject X-Device-Locale header on every authenticated request

Converts Locale.current.identifier (fr_FR) to RFC 5646 form (fr-FR).
Server middleware normalizes and persists into User.deviceLocale for the
4th-priority Prisme Linguistique pipeline."
```

---

### Task 9: iOS app — `ConversationLanguagePreferences.resolved` 4 niveaux

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift:72-78`
- Create: `apps/ios/MeeshyTests/Unit/Models/ConversationLanguagePreferencesTests.swift`

- [ ] **Step 1: Test rouge**

Créer `apps/ios/MeeshyTests/Unit/Models/ConversationLanguagePreferencesTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class ConversationLanguagePreferencesTests: XCTestCase {

    func test_resolved_returnsFourLanguages_whenAllDistinct() {
        let prefs = ConversationLanguagePreferences(
            systemLanguage: "fr",
            regionalLanguage: "es",
            customDestinationLanguage: "pt",
            deviceLocaleOverride: "it"
        )
        XCTAssertEqual(prefs.resolved, ["fr", "es", "pt", "it"])
    }

    func test_resolved_dedupesDeviceLocale_matchingSystem() {
        let prefs = ConversationLanguagePreferences(
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: "fr"
        )
        XCTAssertEqual(prefs.resolved, ["fr"])
    }

    func test_resolved_skipsDeviceLocale_whenNil() {
        let prefs = ConversationLanguagePreferences(
            systemLanguage: "fr",
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: nil
        )
        XCTAssertEqual(prefs.resolved, ["fr"])
    }

    func test_resolved_normalizesDashedDeviceLocale() {
        let prefs = ConversationLanguagePreferences(
            systemLanguage: nil,
            regionalLanguage: nil,
            customDestinationLanguage: nil,
            deviceLocaleOverride: "it-IT"
        )
        XCTAssertEqual(prefs.resolved, ["it"])
    }
}
```

Note : `deviceLocaleOverride` est un param dédié injecté en tests pour ne pas dépendre du `Locale.current` du simulateur. En prod, il vaut `nil` et le code consomme `Locale.current.languageCode`.

- [ ] **Step 2: Run et vérifier l'échec**

Run: `./apps/ios/meeshy.sh test`
Expected: les nouveaux tests échouent — `deviceLocaleOverride` paramètre absent.

- [ ] **Step 3: Modifier `ConversationLanguagePreferences.swift`**

Dans `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift` :

1. Ajouter un paramètre `deviceLocaleOverride` à l'init (avec default `nil`) :

```swift
struct ConversationLanguagePreferences {
    let systemLanguage: String?
    let regionalLanguage: String?
    let customDestinationLanguage: String?
    /// Injecté en tests pour ne pas dépendre de `Locale.current` du simulateur.
    /// En production, laisser à nil → `Locale.current.languageCode` est lu.
    let deviceLocaleOverride: String?

    init(
        systemLanguage: String? = nil,
        regionalLanguage: String? = nil,
        customDestinationLanguage: String? = nil,
        deviceLocaleOverride: String? = nil
    ) {
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.customDestinationLanguage = customDestinationLanguage
        self.deviceLocaleOverride = deviceLocaleOverride
    }
```

2. Modifier la propriété `resolved` (lignes 72-78) :

```swift
    var resolved: [String] {
        let candidates: [String?] = [
            systemLanguage,
            regionalLanguage,
            customDestinationLanguage,
            normalizedDeviceLocale,
        ]
        return candidates
            .compactMap { $0 }
            .uniqued(by: { $0.lowercased() })
    }

    private var normalizedDeviceLocale: String? {
        let raw = deviceLocaleOverride ?? Locale.current.languageCode
        return ConversationLanguagePreferences.normalize(raw)
    }

    /// Miroir de `MeeshyUser.normalizeLanguageCode` SDK (et de
    /// `normalizeLanguageCode` shared TS). Toute évolution doit toucher les 3 sites.
    static func normalize(_ input: String?) -> String? {
        guard let input = input?.trimmingCharacters(in: .whitespaces),
              input.count >= 2 else { return nil }
        let primary = input.split(whereSeparator: { $0 == "-" || $0 == "_" }).first?.lowercased() ?? ""
        guard primary.count >= 2, primary.allSatisfy({ $0.isLetter }) else { return nil }
        return String(primary.prefix(2))
    }
```

Si les call sites existants utilisent un initializer sans `deviceLocaleOverride`, ils continueront à fonctionner via le default `nil`. Vérifier toutefois que les vues qui construisent `ConversationLanguagePreferences` n'invoquent pas un init par position (rare en Swift, mais à confirmer).

- [ ] **Step 4: Run tests vert**

Run: `./apps/ios/meeshy.sh test`
Expected: les 4 tests passent. Aucune régression sur le reste.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift apps/ios/MeeshyTests/Unit/Models/ConversationLanguagePreferencesTests.swift
git commit -m "feat(ios): ConversationLanguagePreferences.resolved includes deviceLocale (4th priority)

Reads Locale.current.languageCode by default; tests inject via override.
Mirror normalize() kept in sync with SDK + shared TS helpers."
```

---

## Phase 4 — Documentation

### Task 10: Mettre à jour `CLAUDE.md` (racine)

**Files:**
- Modify: `CLAUDE.md` (section « Prisme Linguistique — Philosophie Produit »)

- [ ] **Step 1: Localiser la section**

Run: `grep -n "Prisme Linguistique\|Locale.current" CLAUDE.md`
Expected: voir les lignes des passages à modifier.

- [ ] **Step 2: Modifier la section "Resolution de langue"**

Trouve dans `CLAUDE.md` le bloc :

```markdown
### Resolution de langue
Ordre de resolution pour le contenu (messages, transcriptions) — identique partout :
1. `systemLanguage` — langue primaire configuree dans l'app (priorite la plus haute)
2. `regionalLanguage` — langue secondaire configuree dans l'app
3. `customDestinationLanguage` — langue de destination personnalisee
4. Fallback : `'fr'`
```

Remplace par :

```markdown
### Resolution de langue
Ordre de resolution pour le contenu (messages, transcriptions) — identique partout :
1. `systemLanguage` — langue primaire configuree dans l'app (priorite la plus haute)
2. `regionalLanguage` — langue secondaire configuree dans l'app
3. `customDestinationLanguage` — langue de destination personnalisee
4. `deviceLocale` — locale appareil (`Locale.current` iOS, `Accept-Language` web), 4e priorité 2026-05-26
5. Fallback : `'fr'`
```

- [ ] **Step 3: Remplacer le paragraphe « JAMAIS la locale appareil »**

Trouve le bloc :

```markdown
**La locale appareil (`Locale.current`) ne doit JAMAIS etre utilisee pour la resolution de contenu.** C'est la langue d'interface (UI), pas la langue de contenu. Un utilisateur francophone avec un iPhone en anglais veut lire ses messages en francais, pas en anglais.
```

Remplace par :

```markdown
**La locale appareil intervient en 4e priorité — jamais en remplacement des préférences in-app.** Un utilisateur francophone avec un iPhone en anglais voit toujours ses messages en français (priorité 1) ; la locale anglaise n'intervient que si aucune traduction française n'est disponible ET qu'une traduction anglaise existe. Source de vérité : `resolveUserLanguage()` dans `packages/shared/utils/conversation-helpers.ts` accepte `{ deviceLocale }` en 2e argument.
```

- [ ] **Step 4: Mettre à jour la « Règle critique #2 »**

Trouve :

```markdown
2. **Ne JAMAIS ajouter la locale appareil dans les langues preferees de contenu.** Seules `systemLanguage` et `regionalLanguage` (configurees in-app) determinent les langues de contenu.
```

Remplace par :

```markdown
2. **La locale appareil entre en 4e priorité (Prisme étendu 2026-05-26)** — après `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`. Elle ne les supplante jamais. iOS l'injecte via header `X-Device-Locale` ; gateway la persiste opportunément dans `User.deviceLocale`.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): update Prisme Linguistique — deviceLocale as 4th priority"
```

---

### Task 11: Mettre à jour `apps/ios/CLAUDE.md`

**Files:**
- Modify: `apps/ios/CLAUDE.md` (section « Prisme Linguistique — Implementation iOS »)

- [ ] **Step 1: Localiser**

Run: `grep -n "Prisme Linguistique\|translationFlagStrip\|max 3" apps/ios/CLAUDE.md`

- [ ] **Step 2: Mettre à jour les passages**

1. La phrase :
   ```
   translationFlagStrip → Drapeaux de langue (original + systeme + regional/custom, max 3)
   ```
   remplace `max 3` par `max 4` et étends la description :
   ```
   translationFlagStrip → Drapeaux de langue (original + systeme + regional/custom + deviceLocale, max 4)
   ```

2. Ajouter un paragraphe à la fin de la section « Architecture cote iOS » :

   ```markdown
   ### Helper de normalisation locale appareil

   Trois sites maintiennent un helper identique pour normaliser un identifier de langue vers ISO 639-1 (2 lettres lowercase) :
   - `packages/shared/utils/language-normalize.ts` — source de vérité
   - `MeeshyUser.normalizeLanguageCode` (SDK Swift)
   - `ConversationLanguagePreferences.normalize` (app iOS)

   Toute évolution de la logique de normalisation doit toucher les **trois** sites pour préserver la symétrie cross-platform.
   ```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/CLAUDE.md
git commit -m "docs(ios/claude.md): document 4-flag drapeau strip + normalize helper mirrors"
```

---

## Phase 5 — Validation Intégration

### Task 12: Build + smoke gateway local

**Files:** aucun, validation uniquement.

- [ ] **Step 1: Build complet shared + gateway**

Run:
```bash
cd packages/shared && npm run build
cd ../../services/gateway && npm run build
```
Expected: `tsc` réussit pour les deux.

- [ ] **Step 2: Lancer gateway local + tester header**

Démarrer gateway local (tmux meeshy, fenêtre 1) ou via Docker. Puis :

```bash
TOKEN=<jwt>  # obtenir via auth/login
curl -i -H "Authorization: Bearer $TOKEN" -H "X-Device-Locale: it-IT" \
  http://localhost:3000/api/v1/users/profile
```
Expected: code 200. Faire un second `curl` similaire 1 seconde après → User.deviceLocale doit avoir été persistée à `"it"` (vérifier via Prisma Studio ou via une route admin si dispo). Le 2e call ne ré-écrit pas (debounce).

- [ ] **Step 3: Run la suite shared + gateway complète**

Run:
```bash
cd packages/shared && npm test
cd ../../services/gateway && npm test
```
Expected: aucune régression.

---

### Task 13: Build iOS + scénario manuel

**Files:** aucun, validation uniquement.

- [ ] **Step 1: Build app**

Run: `./apps/ios/meeshy.sh build`
Expected: `Build succeeded`.

- [ ] **Step 2: Lancer l'app + naviguer dans une conversation**

Run: `./apps/ios/meeshy.sh run`
Attendre l'app prête. Naviguer vers une conversation multilingue.

- [ ] **Step 3: Scénario fonctionnel**

1. Régler le simulateur en langue italienne : Settings → General → Language & Region → iPhone Language → Italian.
2. Restart de l'app (`meeshy.sh restart`).
3. Sur ton compte (`systemLanguage = "fr"`), réceptionner un message envoyé par un autre participant en allemand.
4. Attendre que le translator finisse → traductions fr + it doivent être présentes (vérifier via Prisma Studio ou logs translator).
5. Sur la bulle, vérifier que le drapeau italien apparaît dans le footer (4e drapeau).
6. Cliquer le drapeau italien → contenu secondaire italien s'affiche inline.

- [ ] **Step 4: Run la suite app iOS**

Run: `./apps/ios/meeshy.sh test`
Expected: aucune régression. Re-run flaky tests connus si rouge (cf. mémoire `feedback_ios_test_suite_flaky.md`).

- [ ] **Step 5: Capturer un screenshot du résultat**

Run: `./apps/ios/meeshy.sh screenshot`
Capture dans `apps/ios/screenshots/`. Référencer dans la PR description.

---

### Task 14: PR + cleanup

**Files:** aucun, juste publication.

- [ ] **Step 1: Push de la branche**

Run:
```bash
git push -u origin feat/device-locale-fourth-priority
```

- [ ] **Step 2: Créer la PR**

Run (cf. instructions du système pour `gh pr create`) :
```bash
gh pr create --title "feat(prisme): device locale as 4th priority cross-platform" --body "$(cat <<'EOF'
## Summary
- packages/shared: resolveUserLanguage accepts { deviceLocale }, new resolveUserLanguagesOrdered, User.deviceLocale schema field
- services/gateway: middleware X-Device-Locale → User.deviceLocale (debounce 5 min), MessageTranslationService includes deviceLocale in destinations
- packages/MeeshySDK: MeeshyUser.deviceLocale + preferredContentLanguages 4-level, APIClient injects X-Device-Locale header
- apps/ios: ConversationLanguagePreferences.resolved 4-level
- docs: CLAUDE.md + apps/ios/CLAUDE.md updated

## Test plan
- [ ] packages/shared : `npm test` (all green)
- [ ] services/gateway : `npm test` (all green)
- [ ] MeeshySDK : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro'` (all green)
- [ ] apps/ios : `./meeshy.sh test` (all green)
- [ ] Smoke: header X-Device-Locale persisté avec debounce
- [ ] E2E: user FR + iPhone IT voit le drapeau italien comme 4e drapeau

## Spec source
docs/superpowers/specs/2026-05-26-device-locale-fourth-priority-design.md
EOF
)"
```

- [ ] **Step 3: Validation finale**

Vérifier la PR sur GitHub. Si CI rouge (iOS Tests notamment), inspecter et fixer.

---

## Self-Review

**Spec coverage :**
- Surface 1 (shared : resolveUserLanguage + resolveUserLanguagesOrdered + Prisma) → Task 1, 2, 3 ✓
- Surface 2 (gateway : middleware + propagation translator) → Task 4, 5, 6 ✓
- Surface 3 (translator : aucun changement) → confirmé spec ✓
- Surface 4 (iOS + SDK : MeeshyUser, APIClient, ConversationLanguagePreferences) → Task 7, 8, 9 ✓
- Surface 5 (CLAUDE.md) → Task 10, 11 ✓
- Tests E2E manuel → Task 13 Step 3 ✓
- Migration & rollout (pas de feature flag, backward compat) → couvert par signature opt + champ `String?` ✓
- Risques (charge translator, Locale change, exotic locale, race condition) → couvert par tests dédup + best-effort middleware ✓

**Placeholder scan :** un seul "TODO conditionnel" repéré dans Task 6 Step 4 (« Si la fonction actuelle utilise une logique différente, respecter la sémantique existante »). C'est légitime car l'agent exécutant a besoin de cette flexibilité — la signature exacte du retour interne de `_extractConversationLanguages` n'est pas reproduite dans le plan, l'agent lira le code. Acceptable.

**Type consistency :**
- `normalizeLanguageCode` : 3 sites (TS shared, Swift SDK, Swift app). Plan documente le miroir Task 11 et exige la sync.
- `resolveUserLanguagesOrdered` : nom utilisé identiquement dans Task 2 (création), Task 6 (consommation gateway).
- `deviceLocale` : nom de champ utilisé identiquement Prisma (Task 3), MeeshyUser (Task 7), header (Task 8 — `X-Device-Locale`).
- `_resetDeviceLocaleCache` : exporté Task 4 Step 4 et appelé Task 4 Step 2 dans `beforeEach`.

**Test scope :** chaque surface a sa propre suite de tests TDD (Task 1, 2, 4, 6, 7, 8, 9). Task 13 = manuel E2E sur device.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-device-locale-fourth-priority-plan.md`. Two execution options :

1. **Subagent-Driven (recommended)** — un subagent par phase (ou par task), review entre phases. Phase 1 puis Phase 2 puis Phase 3 puis Phase 4 (parallélisable avec Phase 3) puis Phase 5.
2. **Inline Execution** — exécution dans la session courante via executing-plans, batch par phase avec checkpoints.

L'ordre de merge importe (cf. spec § Migration & rollout) : `packages/shared` → `services/gateway` + `services/translator` → `apps/ios` → docs. Mais la PR globale peut shippe tout d'un coup une fois testée localement.
