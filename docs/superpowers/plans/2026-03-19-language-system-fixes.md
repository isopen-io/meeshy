# Language System Fixes — 8 Correctness Issues

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 language system issues: autoTranslateEnabled stub, customDestinationLanguage ignored in web display, socket translations not reaching display, autoTranslate conversation flag not checked, iOS Locale.current fallback, language code validation, and missing translation indicator.

**Architecture:** 6 independent tasks across gateway, web, iOS, and shared. Each fix is surgical — modify 1-3 files with minimal blast radius. The web socket/display fix (T3) is the most complex and highest impact.

**Tech Stack:** TypeScript (gateway + web), Swift (iOS), Zod (validation)

**Task dependencies:** T1-T6 are independent. T3 touches `ConversationLayout.tsx` and `messages-display.tsx`. T2 touches `ConversationLayout.tsx`. **Run T2 before T3** (same file).

---

## Task 1: Fix autoTranslateEnabled — persist to Conversation model

**Problem:** `autoTranslateEnabled` is on the `Conversation` model but the profile update route stubs it to `true` and never saves user preference changes. The field is per-conversation, not per-user — the gateway should not be accepting it in user profile updates.

**Root cause:** `profile.ts:172` maps `body.autoTranslateEnabled` into `featureUpdateData` which is logged as warning and dropped. Line 247 hardcodes `autoTranslateEnabled: true` in every response.

**Fix:** Remove the stub. `autoTranslateEnabled` belongs on Conversation (it's already there in Prisma schema). The profile route should not handle it at all — it's a conversation setting.

**Files:**
- Modify: `services/gateway/src/routes/users/profile.ts:172,247`

- [ ] **Step 1: Read profile.ts to find all autoTranslateEnabled references**

Read `services/gateway/src/routes/users/profile.ts`. Find:
- Line ~172: `if (body.autoTranslateEnabled !== undefined) featureUpdateData.autoTranslateEnabled = body.autoTranslateEnabled;`
- Line ~247: `autoTranslateEnabled: true`
- Any other references

- [ ] **Step 2: Remove the featureUpdateData mapping**

Delete the line that maps `autoTranslateEnabled` into `featureUpdateData` (~line 172).

- [ ] **Step 3: Remove the hardcoded response stub**

At ~line 247, remove `autoTranslateEnabled: true` from the response. The client should get this from the Conversation object, not the user profile.

```typescript
// BEFORE:
const responseUser = {
  ...updatedUser,
  autoTranslateEnabled: true
};

// AFTER:
const responseUser = updatedUser;
```

Check if there are other places that hardcode `autoTranslateEnabled: true` in profile.ts (search the file). Remove all of them.

- [ ] **Step 4: Check if the featureUpdateData block is now empty**

After removing `autoTranslateEnabled` (and the previous removal of `translateTo*` booleans), `featureUpdateData` should have nothing mapped into it. If the entire block is empty, remove it and the `console.warn` at ~line 241.

- [ ] **Step 5: Build**

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

## Task 3: Fix socket translations not reaching message display

**Problem:** Two parallel message state systems exist:
1. `useConversationMessages` — local React state (what `MessagesDisplay` reads)
2. `useSocketCacheSync` — React Query cache (where socket translations are written)

When a translation arrives via Socket.IO, it's written to React Query but `MessagesDisplay` reads from the local state → **translations don't appear until page refresh**.

**Fix:** When socket translations arrive, ALSO update the local state via `useConversationMessages.updateMessage()`.

**Files:**
- Modify: `apps/web/hooks/conversations/use-socket-callbacks.ts:177-189`

- [ ] **Step 1: Read use-socket-callbacks.ts**

Read the file. Find the `onTranslation` callback (~line 177). Note the comment: "Cache mutation (updateMessage) removed — useSocketCacheSync is the single cache writer."

- [ ] **Step 2: Read useConversationMessages to understand updateMessage**

Read `apps/web/hooks/use-conversation-messages.ts`. Find the `updateMessage` function. Understand its signature — it should accept a message ID and update function/partial.

- [ ] **Step 3: Restore translation update in onTranslation callback**

The `onTranslation` callback must merge translations into the local message state. The React Query sync remains as-is (useSocketCacheSync handles it). But we also need to update the local state for `MessagesDisplay`:

```typescript
const onTranslation = useCallback(
  (messageId: string, translations: Translation[]) => {
    // Update local message state so MessagesDisplay sees it immediately
    updateMessage(messageId, (msg: Message) => {
      const existingTranslations = Array.isArray(msg.translations) ? [...msg.translations] : [];
      for (const t of translations) {
        const targetLang = t.targetLanguage || t.language;
        const idx = existingTranslations.findIndex((et: any) =>
          (et.targetLanguage || et.language) === targetLang
        );
        if (idx >= 0) {
          existingTranslations[idx] = t;
        } else {
          existingTranslations.push(t);
        }
      }
      return { ...msg, translations: existingTranslations };
    });

    // UI state updates (existing)
    const newLanguages = translations
      .map(t => t.targetLanguage || t.language)
      .filter((lang): lang is string => Boolean(lang));
    addUsedLanguages(newLanguages);

    for (const translation of translations) {
      // ... existing removeTranslatingState logic
    }
  },
  [updateMessage, addUsedLanguages]
);
```

**IMPORTANT:** Check if `updateMessage` is available in the callback's scope. It may need to be passed as a parameter from the parent component or via a ref. Read how `useSocketCallbacks` receives its dependencies.

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
