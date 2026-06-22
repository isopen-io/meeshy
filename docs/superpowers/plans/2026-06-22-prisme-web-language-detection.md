# Prisme C4 — Détection de langue à l'émission (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Le client web doit fixer `originalLanguage` selon la **langue du texte tapé** (détectée on-device), pas la langue du profil utilisateur — fin des messages français taggés `en` par les comptes dont `systemLanguage='en'`.

**Architecture:** Miroir web de C1 (iOS). Un helper pur `detectComposeLanguage(text, fallback)` (via `tinyld`, déjà dépendance) branché au seam unique d'envoi `apps/web/hooks/use-messaging.ts`. Détection autoritaire, repli sur la langue annoncée/profil. Spec : `docs/superpowers/specs/2026-06-22-prisme-language-detection-and-display-design.md` (volet C4).

**Tech Stack:** Next.js 15 / TypeScript, `tinyld@^1.3.4` (déjà dans `apps/web/package.json`, jamais importé), `normalizeLanguageCode` de `@meeshy/shared`, Jest 30.

## Global Constraints
- Réutiliser `normalizeLanguageCode` de `@meeshy/shared` (ré-exporté via `packages/shared/utils/index.ts`) — ne pas réimplémenter. `@meeshy/shared` est dep workspace du web (déjà importé dans `apps/web/utils/language-detection.ts`).
- `tinyld` est déjà installé — l'importer, ne PAS ajouter de dépendance.
- La détection est **autoritaire** ; repli sur `fallback` (langue annoncée → `systemLanguage`) si texte trop court / confiance faible. Jamais de défaut codé en dur autre que ce `fallback`.
- Précision > rappel (cohérent avec C1/C2) : mieux vaut retomber sur le profil que mistaguer.
- Tests : `cd apps/web && npx jest --maxWorkers=50% <file>`. Tests sous `apps/web/__tests__/`.
- Commits : pas de trailer `Co-Authored-By`.
- Suivre la convention d'import du repo (alias `@/...` ou relatif — calquer un test voisin).

---

### Task 1: helper pur `detectComposeLanguage` (web)

**Files:**
- Modify: `apps/web/utils/language-detection.ts` (ajout d'une fonction exportée ; ne pas toucher `detectLanguage` existant)
- Test: `apps/web/__tests__/utils/detect-compose-language.test.ts`

**Interfaces:**
- Produces: `export function detectComposeLanguage(text: string, fallback: string): string` — code ISO 639-1 détecté, ou `fallback` (normalisé) si texte < 4 lettres / confiance tinyld faible.

- [ ] **Step 1: Write the failing test**

```ts
import { detectComposeLanguage } from '@/utils/language-detection';

describe('detectComposeLanguage', () => {
  it('detects French content', () => {
    expect(detectComposeLanguage("Bonjour, comment vas-tu aujourd'hui ? J'espère que tout va bien.", 'en')).toBe('fr');
  });
  it('detects English content', () => {
    expect(detectComposeLanguage('How are you doing today? I hope everything is going well.', 'fr')).toBe('en');
  });
  it('falls back to the provided language on short text', () => {
    expect(detectComposeLanguage('Ok', 'fr')).toBe('fr');
  });
  it('falls back on emoji-only text', () => {
    expect(detectComposeLanguage('🙂🙂🙂', 'fr')).toBe('fr');
  });
  it('normalizes the fallback (fr-FR → fr)', () => {
    expect(detectComposeLanguage('Ok', 'fr-FR')).toBe('fr');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --maxWorkers=50% __tests__/utils/detect-compose-language.test.ts 2>&1 | tail -20`
Expected: FAIL — `detectComposeLanguage is not a function` / not exported.
(If the `@/` alias doesn't resolve in jest, use the relative import matching a neighboring test under `apps/web/__tests__/utils/`.)

- [ ] **Step 3: Write minimal implementation**

Add to the TOP imports of `apps/web/utils/language-detection.ts`:
```ts
import { detectAll } from 'tinyld';
import { normalizeLanguageCode } from '@meeshy/shared';
```
Add the exported function (leave the existing `detectLanguage` untouched):
```ts
const COMPOSE_MIN_ALPHA = 4;
const COMPOSE_MIN_ACCURACY = 0.5;

/**
 * Détecte la langue du message composé (on-device, via tinyld) pour fixer
 * `originalLanguage` à l'émission. Repli sur `fallback` (langue annoncée /
 * systemLanguage) si le texte est trop court ou la confiance trop faible.
 * tinyld renvoie déjà de l'ISO 639-1 ; on normalise par sûreté.
 */
export function detectComposeLanguage(text: string, fallback: string): string {
  const safeFallback = normalizeLanguageCode(fallback) ?? fallback;
  const cleaned = (text || '').replace(/https?:\/\/\S+/g, ' ');
  const alpha = (cleaned.match(/\p{L}/gu) || []).length;
  if (alpha < COMPOSE_MIN_ALPHA) return safeFallback;
  const ranked = detectAll(cleaned);
  const top = ranked && ranked[0];
  if (!top || top.accuracy < COMPOSE_MIN_ACCURACY) return safeFallback;
  return normalizeLanguageCode(top.lang) ?? safeFallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --maxWorkers=50% __tests__/utils/detect-compose-language.test.ts 2>&1 | tail -20`
Expected: PASS (5 tests). If `detects_*` fails purely on the accuracy threshold, you MAY tune `COMPOSE_MIN_ACCURACY` (document the chosen value); do NOT weaken the short-text/emoji fallback. If `tinyld` exposes `detect`/`detectAll` under a different import shape, adjust the import to the installed API (verify against `apps/web/node_modules/tinyld`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/utils/language-detection.ts apps/web/__tests__/utils/detect-compose-language.test.ts
git commit -m "feat(web): detectComposeLanguage (tinyld) for on-device originalLanguage detection"
```

---

### Task 2: brancher la détection au seam d'envoi

**Files:**
- Modify: `apps/web/hooks/use-messaging.ts:222` (la ligne `const sourceLanguage = originalLanguage || systemLanguage;`)
- Test: `apps/web/__tests__/hooks/use-messaging-language.test.tsx`

**Interfaces:**
- Consumes: `detectComposeLanguage(text, fallback)` (Task 1).

**But:** rendre la détection du contenu autoritaire, le profil (`originalLanguage` passé par `ConversationLayout` = langue du profil) devenant le repli. Couvre le chemin normal (socket) et le chemin d'échec (store).

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook, act } from '@testing-library/react';
import { useMessaging } from '@/hooks/use-messaging';

// Mock the socket messaging layer to capture the language argument.
const sendMessageMock = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/lib/socket-messaging', () => ({
  // match the actual module path/shape used by use-messaging.ts (verify import)
  socketMessaging: { sendMessage: (...args: unknown[]) => sendMessageMock(...args) },
}));

describe('useMessaging — originalLanguage from content', () => {
  beforeEach(() => sendMessageMock.mockClear());

  it('tags an English message en even when the user profile is fr', async () => {
    const { result } = renderHook(() => useMessaging(/* conversationId + deps per existing tests */));
    await act(async () => {
      await result.current.sendMessage('How are you doing today my friend?', /* originalLanguage */ 'fr');
    });
    // socketMessaging.sendMessage(content, sourceLanguage, ...) — 2nd arg is the language
    expect(sendMessageMock.mock.calls[0][1]).toBe('en');
  });
});
```
NOTE: `useMessaging` has dependencies (currentUser, stores, socket). Wire the mocks following the closest existing hook test — `apps/web/__tests__/hooks/queries/use-send-message-mutation.test.tsx` — for `currentUser.systemLanguage='fr'` and the socket module path. Adjust the `renderHook` args and mock module path to the real ones. The behavioral assertion (English content → `'en'` despite fr profile) is the fixed requirement.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --maxWorkers=50% __tests__/hooks/use-messaging-language.test.tsx 2>&1 | tail -25`
Expected: FAIL — current code sends `originalLanguage` (='fr', the profile) so 2nd arg is `'fr'`, not `'en'`.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/hooks/use-messaging.ts`, add the import (top):
```ts
import { detectComposeLanguage } from '@/utils/language-detection';
```
Replace line ~222:
```ts
// BEFORE
const sourceLanguage = originalLanguage || systemLanguage;
// AFTER — content detection is authoritative; profile/system is the fallback
const sourceLanguage = detectComposeLanguage(content, originalLanguage || systemLanguage);
```
(Confirm `content` is the message-text parameter in scope — it is used just below at `prepareMessageMetadata(content, ...)` and `socketMessaging.sendMessage(content, ...)`.) Also update the failed-message store path (~line 272) `originalLanguage: originalLanguage || systemLanguage` → `originalLanguage: sourceLanguage` so the retry record carries the detected language.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --maxWorkers=50% __tests__/hooks/use-messaging-language.test.tsx 2>&1 | tail -25`
Expected: PASS.

- [ ] **Step 5: Run the existing messaging tests for regressions**

Run: `cd apps/web && npx jest --maxWorkers=50% use-messaging use-send-message 2>&1 | tail -20`
Expected: PASS (no regression in existing send tests; if `use-send-message-mutation.test.tsx` hard-asserts `originalLanguage:'en'` on French content, update it to reflect content-detection — analogous to the translator test-correction in the iOS/translator plan — and note it).

- [ ] **Step 6: Commit**

```bash
git add apps/web/hooks/use-messaging.ts apps/web/__tests__/hooks/use-messaging-language.test.tsx
git commit -m "fix(web): detect message language from content on send (was sending profile language)"
```

---

## Self-Review
- **Spec coverage:** C4 = Task 1 (helper) + Task 2 (wiring). ✓
- **Placeholders:** complete code for Task 1; Task 2 test gives the fixed behavioral assertion + points to the exact existing test to copy mock wiring from (legitimate "follow existing patterns" in an existing codebase). ✓
- **Type consistency:** `detectComposeLanguage(text: string, fallback: string): string` defined Task 1, consumed Task 2. ✓

## Déploiement
Web ships via its CI/Vercel pipeline on merge to main (push). No prod hotpatch needed.
