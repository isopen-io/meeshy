# Language System Fixes — 6 Correctness Issues (v2 — post-review)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 language system issues: autoTranslateEnabled stub, customDestinationLanguage ignored in web display, autoTranslate conversation flag not checked in translation pipeline, iOS Locale.current fallback, language code validation, and translation language cache staleness.

**Architecture:** 6 independent tasks across gateway, web, iOS, and shared. Each fix is surgical — modify 1-3 files with minimal blast radius.

**PRE-REQUISITE ALREADY DONE:** `resolveUserLanguage()` priority order corrected to `customDestinationLanguage > systemLanguage > 'fr'` (commit `fbfa9d1d`).

**Review corrections applied (v2):**
- T1: Keep `autoTranslateEnabled: true` in response for backward compat (41 web files depend on it). Remove only the featureUpdateData stub. Migration to per-conversation in separate plan.
- T3: REWRITTEN — real cause is React Query useMemo not recalculating on nested translation changes, not a local-state vs React-Query split.
- T4: Use cached approach (extend languageCache to include autoTranslateEnabled) instead of separate DB query.

**Tech Stack:** TypeScript (gateway + web), Swift (iOS), Zod (validation)

**Task dependencies:** T1-T6 are independent. T3 touches `ConversationLayout.tsx` and `messages-display.tsx`. T2 touches `ConversationLayout.tsx`. **Run T2 before T3** (same file).

---

## Task 1: Clean up autoTranslateEnabled stub in profile route

**Problem:** `profile.ts:172` maps `body.autoTranslateEnabled` into `featureUpdateData` which is logged as a warning and dropped. `autoTranslateEnabled` belongs on the Conversation model (per-conversation toggle), not on User.

**Fix:** Remove the dead `featureUpdateData` mapping. **Keep `autoTranslateEnabled: true` in responses** for backward compatibility (41 web files depend on it). Full migration to per-conversation is a separate plan.

**Files:**
- Modify: `services/gateway/src/routes/users/profile.ts`

- [ ] **Step 1: Read profile.ts to find all autoTranslateEnabled references**

Read `services/gateway/src/routes/users/profile.ts`. Find:
- Line ~172: `if (body.autoTranslateEnabled !== undefined) featureUpdateData.autoTranslateEnabled = body.autoTranslateEnabled;`
- Line ~241: `console.warn('[Profile] Feature update data not saved...')`

- [ ] **Step 2: Remove the dead featureUpdateData block**

Delete the line mapping `autoTranslateEnabled` into `featureUpdateData` (~line 172). If `featureUpdateData` is now empty (no other fields mapped), remove the entire block including the `const featureUpdateData = {}`, the `if (Object.keys...)` check, and the `console.warn`.

**DO NOT remove `autoTranslateEnabled: true` from responses** — 41 web files depend on it. Leave the hardcoded `true` as-is.

- [ ] **Step 3: Build**

`cd services/gateway && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```
fix(gateway): remove autoTranslateEnabled stub from user profile route

autoTranslateEnabled belongs on the Conversation model (per-conversation
toggle), not on the user profile response. The profile route was accepting
it in the body, logging a warning, dropping it, then hardcoding true in
every response. Removed the stub entirely.
```

---

## Task 2: Fix ConversationLayout — use resolveUserLanguage()

**Problem:** `ConversationLayout.tsx:351` passes `user.systemLanguage` directly as `userLanguage`, ignoring `customDestinationLanguage`. The Prisme Linguistique requires `customDestinationLanguage > systemLanguage > 'fr'`.

**Files:**
- Modify: `apps/web/components/conversations/ConversationLayout.tsx:351,353`

- [ ] **Step 1: Read ConversationLayout.tsx to find the language assignment**

Find `setSelectedLanguage(user.systemLanguage || 'fr')` (~line 351 and 353). Also find where `userLanguage` is passed to `MessagesDisplay`.

- [ ] **Step 2: Import resolveUserLanguage**

Add at the top:
```typescript
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
```

- [ ] **Step 3: Replace direct systemLanguage access**

```typescript
// BEFORE:
setSelectedLanguage(user.systemLanguage || 'fr');

// AFTER:
setSelectedLanguage(resolveUserLanguage(user));
```

Apply to ALL occurrences in the file.

- [ ] **Step 4: Also fix the userLanguage prop passed to children**

Search for `userLanguage={user.systemLanguage` or `userLanguage={selectedLanguage` in the file. Ensure `selectedLanguage` (now set via `resolveUserLanguage`) flows through.

- [ ] **Step 5: Build**

`cd apps/web && pnpm tsc --noEmit 2>&1 | grep "ConversationLayout" | head -5`

- [ ] **Step 6: Commit**

```
fix(web): use resolveUserLanguage() in ConversationLayout for Prisme compliance

ConversationLayout was passing user.systemLanguage directly, ignoring
customDestinationLanguage override. Now uses resolveUserLanguage() from
@meeshy/shared which respects the priority: customDestination > system > 'fr'.
```

---

## Task 3: Investigate and fix React Query translation propagation

**Problem (revised after review):** `ConversationLayout` uses `useConversationMessagesRQ` which reads from React Query cache. `useSocketCacheSync` writes translations to that same cache. In theory, translations should propagate. But they may not trigger re-renders because:
1. A `useMemo` in the RQ hook may not recalculate when nested `translations` arrays change
2. React Query's structural sharing may not detect nested array mutations

**Fix approach:** This requires investigation, not a blind fix. The implementer must:

**Files:**
- Read: `apps/web/hooks/queries/use-conversation-messages-rq.ts` (find the `useMemo` or `select`)
- Read: `apps/web/hooks/queries/use-socket-cache-sync.ts:184-218` (translation merge logic)
- Read: `apps/web/components/common/messages-display.tsx:275-313` (auto-switch effect)
- Read: `apps/web/components/conversations/ConversationLayout.tsx` (verify it uses `useConversationMessagesRQ`)

- [ ] **Step 1: Verify which message hook ConversationLayout uses**

Read `ConversationLayout.tsx`. Search for `useConversationMessages` — which variant? (`useConversationMessagesRQ` or `useConversationMessages`). Confirm it reads from React Query.

- [ ] **Step 2: Trace the translation write path**

In `use-socket-cache-sync.ts`, `handleTranslation` calls `queryClient.setQueryData(queryKeys.messages.infinite(...))`. Verify the mutation creates a NEW page object (not mutating in-place) so React Query detects the change.

- [ ] **Step 3: Check if the RQ hook's select/useMemo recalculates**

In the RQ hook used by ConversationLayout, check if there's a `select` or `useMemo` that flattens pages. If the memo depends on `data` reference and `setQueryData` creates a new reference, it should recalculate. If it depends on `data?.messages` (which may be the same array reference after structural sharing), it won't.

- [ ] **Step 4: Apply fix based on findings**

If the issue is structural sharing: add `structuralSharing: false` to the query options for messages.
If the issue is useMemo deps: fix the deps to include the full data reference.
If translations actually DO propagate (no bug): close this task as "verified working".

- [ ] **Step 5: Build and verify**

`cd apps/web && pnpm tsc --noEmit`
Then test: send a message in conversation → verify translation appears in real-time.

- [ ] **Step 6: Commit (if changes needed)**

```
fix(web): ensure React Query translation updates trigger re-renders in message display

[Describe the specific fix based on investigation findings]
```

- [ ] **Step 4: Build**

`cd apps/web && pnpm tsc --noEmit 2>&1 | grep "use-socket-callbacks" | head -5`

- [ ] **Step 5: Commit**

```
fix(web): restore translation merge in local message state for socket events

Socket translations were written to React Query cache only (useSocketCacheSync)
but MessagesDisplay reads from useConversationMessages local state. Translations
arrived but were invisible until page refresh. Now onTranslation also calls
updateMessage to merge translations into the local state array.
```

---

## Task 4: Check autoTranslateEnabled before producing translations

**Problem:** `_extractConversationLanguages()` never checks `autoTranslateEnabled` on the Conversation. If `autoTranslateEnabled = false`, translations are still produced and sent.

**Files:**
- Modify: `services/gateway/src/services/message-translation/MessageTranslationService.ts`

- [ ] **Step 1: Read _processTranslationsAsync to find where to add the check**

Read the method (~line 337). Find where `_extractConversationLanguages` is called. The check should happen BEFORE calling `_extractConversationLanguages` — if auto-translate is off for this conversation, return early.

- [ ] **Step 2: Add autoTranslateEnabled check**

Before the `_extractConversationLanguages` call, query the conversation:

```typescript
// Check if auto-translate is enabled for this conversation
const conversation = await this.prisma.conversation.findUnique({
  where: { id: message.conversationId },
  select: { autoTranslateEnabled: true }
});

if (conversation && !conversation.autoTranslateEnabled) {
  logger.info(`⏭️ [TRANSLATE] Auto-translate disabled for conversation ${message.conversationId}`);
  return;
}
```

**Note:** This adds 1 DB call per message. To avoid it, extend `_extractConversationLanguages` to also cache the `autoTranslateEnabled` flag. Or include it in the language cache.

- [ ] **Step 3: Build**

`cd services/gateway && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```
fix(gateway): check autoTranslateEnabled before producing translations

Previously, _extractConversationLanguages() never checked the conversation's
autoTranslateEnabled flag. Translations were produced even for conversations
with auto-translate explicitly disabled. Now returns early if disabled.
```

---

## Task 5: Fix iOS ProfileView Locale.current fallback

**Problem:** `ProfileView.swift:657` falls back to `Locale.current.language.languageCode` when `systemLanguage` is empty. This violates the Prisme Linguistique: device locale must never be used for content language.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift:657`

- [ ] **Step 1: Read ProfileView.swift to find the fallback**

Search for `Locale.current` in the file. Find the exact line and context.

- [ ] **Step 2: Replace with 'fr' fallback**

```swift
// BEFORE:
systemLanguage = user?.systemLanguage ?? Locale.current.language.languageCode?.identifier ?? "fr"

// AFTER:
systemLanguage = user?.systemLanguage ?? "fr"
```

- [ ] **Step 3: Build iOS**

`./apps/ios/meeshy.sh build`

- [ ] **Step 4: Commit**

```
fix(ios): remove Locale.current fallback in ProfileView language init

Prisme Linguistique: device locale must never be used for content language
resolution. Fallback is now 'fr' directly, matching the shared
resolveUserLanguage() fallback.
```

---

## Task 6: Add language code validation against catalog

**Problem:** The Zod schema only validates `min(2).max(5)` for language fields. A user could store "xyz" — the translator would fail silently.

**Files:**
- Modify: `packages/shared/utils/validation.ts` (the language field schema)
- Read: `packages/shared/utils/languages.ts` (the catalog)

- [ ] **Step 1: Read languages.ts to find the supported codes**

Read `packages/shared/utils/languages.ts`. Find the list of supported language codes. There should be an array or map of ~60 codes.

- [ ] **Step 2: Read validation.ts to find the language field schema**

Find where `systemLanguage`, `regionalLanguage` are validated. It should be in a Zod schema with `.min(2).max(5)`.

- [ ] **Step 3: Add code validation**

Import the language codes and add a `.refine()`:

```typescript
import { SUPPORTED_LANGUAGE_CODES } from './languages'; // or however the codes are exported

const languageCode = z.string().min(2).max(5).refine(
  code => SUPPORTED_LANGUAGE_CODES.includes(code),
  { message: 'Unsupported language code' }
);
```

If `SUPPORTED_LANGUAGE_CODES` doesn't exist as an export, create it:
```typescript
export const SUPPORTED_LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES);
```

Apply this schema to `systemLanguage` and `regionalLanguage` in the update profile schema.

**IMPORTANT:** `customDestinationLanguage` should also be validated but MAY accept codes not in the main catalog (for NLLB's 200+ languages). Keep `customDestinationLanguage` as `min(2).max(5)` without the catalog check, or widen the check to include all NLLB codes.

- [ ] **Step 4: Build shared + gateway**

```bash
cd packages/shared && npm run build
cd services/gateway && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
fix(shared): validate language codes against supported catalog

Language fields (systemLanguage, regionalLanguage) now validated against
the 60+ supported language catalog. Previously only checked min(2).max(5),
allowing arbitrary strings that the translator would silently reject.
```

---

## Post-Implementation Verification

- [ ] **Build all:** gateway (`tsc --noEmit`), web (`pnpm tsc --noEmit`), iOS (`meeshy.sh build`)
- [ ] **Test T1:** `PATCH /users/me` response no longer contains `autoTranslateEnabled`
- [ ] **Test T2:** Set `customDestinationLanguage` on user, open conversation → verify messages display in that language, not `systemLanguage`
- [ ] **Test T3:** Send a message in conversation → verify translation appears in real-time without page refresh
- [ ] **Test T4:** Set `autoTranslateEnabled: false` on a conversation in DB → send a message → verify no translation is produced (check gateway logs)
- [ ] **Test T5:** iOS ProfileView with no `systemLanguage` → verify fallback is 'fr', NOT device locale
- [ ] **Test T6:** `PATCH /users/me` with `systemLanguage: "xyz"` → verify 400 error with "Unsupported language code"
