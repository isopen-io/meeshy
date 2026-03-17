# P0 Correctness Fixes + CLAUDE.md Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 active P0 correctness bugs identified in the Architecture Bible audit, then integrate the new mandatory principles into CLAUDE.md files.

**Architecture:** Each fix is independent and can be parallelized. Fixes span gateway middleware, Prisma queries, SDK models, and CLAUDE.md documentation. No new features — strictly correcting existing incorrect behavior.

**Tech Stack:** TypeScript (gateway), Swift (SDK), Markdown (CLAUDE.md)

**Spec reference:** `docs/superpowers/specs/2026-03-17-architecture-bible-design.md`

**Findings already resolved (verified during planning):**
- Fix #6 (`.broadcast` ConversationType) — already exists in SDK `CoreModels.swift:137`
- Fix #7 (MediaCards `translations[0]` fallback) — all 3 files already use `.find(t => t.isOriginal)`, no `[0]` fallback
- Fix #8 (3 different fallback languages) — all fallbacks already `'fr'` consistently

---

## Chunk 1: Gateway Correctness (Fixes #1, #2, #3, #4)

### Task 1: Fix auth middleware — add missing Prisma select fields for language flags

The `resolveUserLanguage()` function needs `translateToSystemLanguage`, `translateToRegionalLanguage`, and `useCustomDestination` flags. But `auth.ts` line 139-160 does not include them in the Prisma `select`.

**IMPORTANT:** These fields exist in MongoDB but are NOT in the Prisma schema (documented in root CLAUDE.md). They are accessible when NO `select` is used, OR via `(user as any).fieldName`. Since auth.ts already uses `select`, we must either:
- (A) Remove `select` to get all fields (wastes bandwidth)
- (B) Keep `select` and cast to `any` for the extra fields (current approach for `resolveUserLanguage`)

Option B is already in use (`resolveUserLanguage(user as any)` at line 183). The issue is that WITH a `select`, these fields are NOT returned by Prisma even with `as any`. We need to either drop the `select` or use a raw query.

**Files:**
- Modify: `services/gateway/src/middleware/auth.ts:139-160`

- [ ] **Step 1: Check if `resolveUserLanguage` works correctly when flags are undefined**

Read `packages/shared/utils/conversation-helpers.ts` lines 9-30. When `translateToSystemLanguage` is `undefined`, the condition `if (user.translateToSystemLanguage && ...)` is falsy. This means with a `select` that doesn't include these fields, `resolveUserLanguage` will skip system and regional languages and fall back to `user.systemLanguage || 'fr'`. This is actually correct behavior (conservative fallback) but misses the user's preferences.

- [ ] **Step 2: Remove `select` from the auth Prisma query to get all fields**

In `services/gateway/src/middleware/auth.ts`, find the `prisma.user.findUnique` call (around lines 139-160). Remove the `select` clause entirely so Prisma returns ALL fields including the unmodeled ones:

```typescript
// BEFORE (lines 139-160):
const user = await this.prisma.user.findUnique({
  where: { id: jwtUserId },
  select: {
    id: true, username: true, email: true, firstName: true, lastName: true,
    displayName: true, avatar: true, role: true, systemLanguage: true,
    regionalLanguage: true, customDestinationLanguage: true, isOnline: true,
    lastActiveAt: true, isActive: true, createdAt: true, updatedAt: true
  }
});

// AFTER:
const user = await this.prisma.user.findUnique({
  where: { id: jwtUserId }
});
```

This returns all fields from MongoDB, including `translateToSystemLanguage`, `translateToRegionalLanguage`, `useCustomDestination` which are needed by `resolveUserLanguage()`.

- [ ] **Step 3: Verify the `resolveUserLanguage` call still works**

The call at line 183 is `resolveUserLanguage(user as any)`. Without `select`, `user` has all fields. The `as any` cast is still needed because the Prisma-generated type doesn't include the unmodeled fields.

- [ ] **Step 4: Build gateway to verify no compilation errors**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors (removing `select` only broadens the returned type)

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/middleware/auth.ts
git commit -m "fix(gateway): remove Prisma select in auth middleware to expose translation flag fields

resolveUserLanguage() needs translateToSystemLanguage, translateToRegionalLanguage,
and useCustomDestination which exist in MongoDB but not in the Prisma schema.
With select, these fields were always undefined, causing language resolution
to always fall through to the systemLanguage fallback."
```

---

### Task 2: Fix `_extractConversationLanguages` — ensure Prisma select includes flags

Same root cause as Task 1: the Prisma `select` in the translation service doesn't include the flag fields.

**Files:**
- Modify: `services/gateway/src/services/message-translation/MessageTranslationService.ts`

- [ ] **Step 1: Find the Prisma query in `_extractConversationLanguages`**

Search for `_extractConversationLanguages` in `MessageTranslationService.ts`. Find the `prisma.participant.findMany` query that fetches participants with their user data.

- [ ] **Step 2: Verify the current participant user select includes language fields**

Check if the `select` on `user` includes `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`, and critically `useCustomDestination`, `translateToSystemLanguage`, `translateToRegionalLanguage`.

- [ ] **Step 3: If using `select`, remove it from the `user` relation to get all fields**

Same pattern as Task 1 — either remove the `select` on the `user` include, or switch to `include: { user: true }` to get all fields.

- [ ] **Step 4: Verify the language extraction logic at lines 634-636 handles the flags**

The current code at line 634:
```typescript
if ((participant.user as any).useCustomDestination && participant.user.customDestinationLanguage) {
  languages.add(participant.user.customDestinationLanguage);
}
```

This correctly gates `customDestinationLanguage` behind `useCustomDestination`. After removing the `select`, the `(as any)` cast should no longer be needed for `useCustomDestination` (but keep it since the field isn't in the Prisma schema).

Also verify that `systemLanguage` and `regionalLanguage` extraction respects `translateToSystemLanguage` and `translateToRegionalLanguage` flags. If the code currently adds them unconditionally, add flag gates:

```typescript
// After the useCustomDestination block, add gates:
if ((participant.user as any).translateToSystemLanguage !== false && participant.user.systemLanguage) {
  languages.add(participant.user.systemLanguage);
}
if ((participant.user as any).translateToRegionalLanguage !== false && participant.user.regionalLanguage) {
  languages.add(participant.user.regionalLanguage);
}
```

Note: `!== false` (not `=== true`) because if the flag is `undefined` (legacy data), we default to including the language.

- [ ] **Step 5: Build to verify**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/services/message-translation/MessageTranslationService.ts
git commit -m "fix(gateway): respect translation flags in _extractConversationLanguages

Gate systemLanguage behind translateToSystemLanguage and
regionalLanguage behind translateToRegionalLanguage.
Remove Prisma user select to expose unmodeled flag fields from MongoDB."
```

---

### Task 3: Clean up ConversationListCache dead code

The cache was disabled (`canUseCache = false`) and Redis was never wired (`redis: undefined`). Rather than try to fix and re-enable it (which needs a separate design), clean it up so it doesn't confuse future developers.

**Files:**
- Modify: `services/gateway/src/services/ConversationListCache.ts`
- Modify: `services/gateway/src/routes/conversations/core.ts`

- [ ] **Step 1: Find all imports of `conversationListCache` and `invalidateConversationCacheAsync`**

Run: `grep -rn "conversationListCache\|invalidateConversationCacheAsync" services/gateway/src/ --include="*.ts"`

Note all files that import these.

- [ ] **Step 2: Comment out the cache checks and set operations in core.ts**

In `services/gateway/src/routes/conversations/core.ts`, the `canUseCache = false` already disables the code. Add a clear comment explaining why:

```typescript
// DISABLED: ConversationListCache was never wired to Redis and caused stale
// lastMessage data. See Architecture Bible finding #3. Re-enable after
// implementing proper cache invalidation with socket events.
const canUseCache = false;
```

- [ ] **Step 3: Add a deprecation comment to ConversationListCache.ts**

At the top of the file:

```typescript
/**
 * @deprecated DISABLED — Redis never wired, cache never functional.
 * See Architecture Bible finding #3.
 * TODO: Re-implement with proper Redis integration and socket-based invalidation.
 */
```

- [ ] **Step 4: Commit**

```bash
git add services/gateway/src/services/ConversationListCache.ts services/gateway/src/routes/conversations/core.ts
git commit -m "fix(gateway): document ConversationListCache as disabled dead code

Redis was never wired (redis: undefined) and canUseCache was hardcoded false.
Added deprecation comments instead of deleting to preserve invalidation logic
for future re-implementation with socket-based cache sync."
```

---

### Task 4: Fix `requireActiveAccount` empty stub

The function is exported and could be used by routes expecting account validation.

**Files:**
- Modify: `services/gateway/src/middleware/auth.ts:544-545`

- [ ] **Step 1: Check if `requireActiveAccount` is used anywhere**

Run: `grep -rn "requireActiveAccount" services/gateway/src/ --include="*.ts"`

- [ ] **Step 2: If unused — remove the export and add deprecation notice**

If no route imports it:

```typescript
/** @deprecated Not implemented. Use manual isActive check in route handlers. */
async function requireActiveAccount(_request: FastifyRequest, _reply: FastifyReply) {
  // No-op: account activity check not implemented.
  // Routes needing this should check authContext.registeredUser.isActive directly.
}
```

- [ ] **Step 3: If used — implement the check**

If routes DO import it:

```typescript
export async function requireActiveAccount(request: FastifyRequest, reply: FastifyReply) {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    reply.code(403).send({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Authentication required' } });
    return;
  }

  if (!authContext.registeredUser.isActive) {
    reply.code(403).send({ success: false, error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account is deactivated' } });
    return;
  }
}
```

- [ ] **Step 4: Fix `requireEmailVerification` missing return**

At line ~540, after the 403 response for unverified email, add `return`:

```typescript
if (!authContext.registeredUser.emailVerifiedAt) {
  reply.code(403).send({ success: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email verification required' } });
  return;  // ADD THIS — currently falls through
}
```

- [ ] **Step 5: Build to verify**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src/middleware/auth.ts
git commit -m "fix(gateway): implement requireActiveAccount and fix requireEmailVerification return

requireActiveAccount was an empty stub. Now checks isActive field.
requireEmailVerification was missing return after 403 response."
```

---

## Chunk 2: SDK Correctness (Fix #5)

### Task 5: Fix iOS `preferredContentLanguages` — always include systemLanguage as fallback

The current implementation at `AuthModels.swift:289-301` correctly gates languages behind flags. But when ALL flags are false/nil, the function returns an empty array. Per Prisme Linguistique rules, `systemLanguage` should ALWAYS be the last resort fallback.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift:289-301`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthModelsTests.swift`

- [ ] **Step 1: Write failing test — empty preferred languages when all flags false**

In `packages/MeeshySDK/Tests/MeeshySDKTests/Auth/` (create `AuthModelsTests.swift` if needed):

```swift
import XCTest
@testable import MeeshySDK

final class MeeshyUserLanguageTests: XCTestCase {

    func test_preferredContentLanguages_allFlagsFalse_returnsSystemLanguageFallback() {
        var user = MeeshyUser.stub()
        user.systemLanguage = "fr"
        user.regionalLanguage = "en"
        user.translateToSystemLanguage = false
        user.translateToRegionalLanguage = false
        user.useCustomDestination = false

        let result = user.preferredContentLanguages

        XCTAssertFalse(result.isEmpty, "Should always contain at least systemLanguage as fallback")
        XCTAssertEqual(result, ["fr"])
    }

    func test_preferredContentLanguages_systemFlagTrue_includesSystem() {
        var user = MeeshyUser.stub()
        user.systemLanguage = "fr"
        user.regionalLanguage = "en"
        user.translateToSystemLanguage = true
        user.translateToRegionalLanguage = true

        let result = user.preferredContentLanguages

        XCTAssertTrue(result.contains("fr"))
        XCTAssertTrue(result.contains("en"))
    }

    func test_preferredContentLanguages_customDestination_includesCustomFirst() {
        var user = MeeshyUser.stub()
        user.systemLanguage = "fr"
        user.customDestinationLanguage = "ja"
        user.useCustomDestination = true
        user.translateToSystemLanguage = true

        let result = user.preferredContentLanguages

        XCTAssertEqual(result.first, "ja")
        XCTAssertTrue(result.contains("fr"))
    }
}
```

Note: `MeeshyUser.stub()` needs to exist or be created as a test helper.

- [ ] **Step 2: Run test to verify first test fails**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUserLanguageTests/test_preferredContentLanguages_allFlagsFalse 2>&1 | tail -20`
Expected: FAIL — empty array returned when all flags false

- [ ] **Step 3: Add systemLanguage fallback to `preferredContentLanguages`**

In `AuthModels.swift`, modify the computed property:

```swift
public var preferredContentLanguages: [String] {
    var preferred: [String] = []
    if useCustomDestination == true, let custom = customDestinationLanguage {
        preferred.append(custom)
    }
    if translateToSystemLanguage == true, let sys = systemLanguage, !preferred.contains(where: { $0.caseInsensitiveCompare(sys) == .orderedSame }) {
        preferred.append(sys)
    }
    if translateToRegionalLanguage == true, let reg = regionalLanguage, !preferred.contains(where: { $0.caseInsensitiveCompare(reg) == .orderedSame }) {
        preferred.append(reg)
    }
    // Fallback: systemLanguage is ALWAYS included as last resort (Prisme Linguistique rule)
    if preferred.isEmpty, let sys = systemLanguage {
        preferred.append(sys)
    }
    return preferred
}
```

- [ ] **Step 4: Run all tests**

Run: `cd packages/MeeshySDK && swift test --filter MeeshyUserLanguageTests 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 5: Run full SDK tests**

Run: `cd packages/MeeshySDK && swift test 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 6: Build iOS app**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -10`
Expected: BUILD SUCCEEDED

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Auth/AuthModelsTests.swift
git commit -m "fix(sdk): add systemLanguage fallback to preferredContentLanguages

When all translation flags (translateToSystemLanguage, translateToRegionalLanguage,
useCustomDestination) are false, the function returned an empty array. Now falls
back to systemLanguage as last resort per Prisme Linguistique rules."
```

---

## Chunk 3: CLAUDE.md Integration

### Task 6: Add Instant App Principles to root CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read current CLAUDE.md to find the right insertion point**

The new section goes after "## Development Philosophy" and before or after "## Workflow Orchestration".

- [ ] **Step 2: Add the Instant App Principles section**

Insert after the "## Development Philosophy" section (after the "### Preferred Tools" subsection):

```markdown
## Instant App Principles (Non-Negotiable)

These principles are mandatory alongside TDD. Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md`

### Cache-First, Network-Second
Every screen MUST display cached data IMMEDIATELY if available.
No spinner when cache has data (even stale). Skeleton/placeholder ONLY on empty cache (cold start).

### Stale-While-Revalidate
Use CacheResult<T> (.fresh/.stale/.expired/.empty) and distinguish each case.
Serve .stale immediately + silent background refresh. NEVER call .value directly — handle each case.

### Optimistic Updates
Every user action gets instant feedback. Network confirms after.
Capture snapshot → apply local → send network → rollback on failure.

### Offline Graceful Degradation
App MUST work offline for reads. Write actions queued (OfflineQueue). FIFO flush on reconnect.

### Zero Unnecessary Re-render
Leaf views: NO @ObservedObject on global singletons. Pass primitive values (isDark: Bool).
Use @Environment(\.colorScheme) for simple dark/light. Equatable + .equatable() on list cell views.

### Single Source of Truth
Each data type has ONE source. No reimplementation.
Language resolution: resolveUserLanguage() from packages/shared/.
Types: packages/shared/types/. iOS models: packages/MeeshySDK/.
Response format: sendSuccess()/sendError() from utils/response.ts.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Instant App Principles to root CLAUDE.md

6 mandatory principles: Cache-First, SWR, Optimistic Updates,
Offline Degradation, Zero Re-render, Single Source of Truth.
Reference: Architecture Bible spec 2026-03-17."
```

---

### Task 7: Add Cache-First Pattern to apps/ios/CLAUDE.md

**Files:**
- Modify: `apps/ios/CLAUDE.md`

- [ ] **Step 1: Read current file to find insertion point**

Add after the "## TDD & Testing Standards" section.

- [ ] **Step 2: Add the Cache-First section**

```markdown
## Cache-First Pattern (Obligatoire)

Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Pattern I1

Every ViewModel loading data MUST:
1. Call `CacheCoordinator.shared.{store}.load(for: key)` BEFORE any API request
2. Distinguish `.fresh` / `.stale` / `.expired` / `.empty` in a switch
3. Display `.stale` immediately + silent background refresh
4. NO spinner when cached data exists
5. Use SkeletonPlaceholder (not ProgressView) on empty cache

### LoadState Enum
Every data-loading ViewModel MUST expose `loadState: LoadState`:
```swift
enum LoadState {
    case idle, cachedStale, cachedFresh, loading, loaded, offline, error(String)
}
```

### Leaf Views — Zero @ObservedObject Singleton
Views rendered in loops (ThemedMessageBubble, MeeshyAvatar, ThemedConversationRow)
MUST NOT have `@ObservedObject` on global singletons.
Pass `isDark: Bool`, `accentColor: String` as `let` parameters.
Alternative: `@Environment(\.colorScheme)` for simple dark/light checks.
```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/CLAUDE.md
git commit -m "docs(ios): add Cache-First pattern and LoadState requirement to CLAUDE.md"
```

---

### Task 8: Add React Query Patterns to apps/web/CLAUDE.md

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Read current file to find insertion point**

- [ ] **Step 2: Add the React Query Patterns section**

```markdown
## React Query Patterns (Obligatoire)

Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Patterns W1-W7

### Cache Persistence
React Query cache MUST be persisted to IndexedDB via `persistQueryClient`.
Result: browser open = previous session data displayed immediately.

### Hover Prefetch
Clickable items (ConversationItem, PostCard) MUST prefetch destination data on hover
via `queryClient.prefetchQuery()`.

### Translation Cache
Translation cache MUST be a bounded LRU (max 500 entries), not an unbounded Map.

### Error Boundaries
Each feature MUST have its own ErrorBoundary.
A crash in message list MUST NOT crash the conversation list.

### Dead Code
`conversation-store.ts` is DEAD CODE — DO NOT use.
Use React Query hooks (useConversationsQuery, useConversationMessages).
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs(web): add React Query patterns and dead code warnings to CLAUDE.md"
```

---

### Task 9: Add Caching & Response patterns to services/gateway/CLAUDE.md

**Files:**
- Modify: `services/gateway/CLAUDE.md`

- [ ] **Step 1: Read current file to find insertion point**

- [ ] **Step 2: Add the Caching & Response section**

```markdown
## Caching Patterns (Obligatoire)

Reference: `docs/superpowers/specs/2026-03-17-architecture-bible-design.md` Patterns G1-G7

### Auth User Cache
Auth middleware Prisma query should be cached in Redis (5min TTL).
Invalidate on: profile update, role change, language change.

### ConversationId Cache
`normalizeConversationId` MUST cache identifier→ObjectId mapping in memory (immutable data).

### HTTP Cache-Control
Read-heavy endpoints MUST return `Cache-Control` + `ETag` headers.
Client sends `If-None-Match`, gateway responds 304 if unchanged.

### Response Format
ALL routes MUST use `sendSuccess()`/`sendError()` from `utils/response.ts`.
Pagination under `meta.pagination`, NOT top-level.
Errors under `error: { code, message }`, NOT `error: "string"`.

### Language Resolution
ALWAYS use `resolveUserLanguage()` from `@meeshy/shared` for language resolution.
NEVER reimplement the priority order locally.
```

- [ ] **Step 3: Commit**

```bash
git add services/gateway/CLAUDE.md
git commit -m "docs(gateway): add caching, response format, and language resolution rules to CLAUDE.md"
```

---

## Post-Implementation Verification

- [ ] **Step 1: Run gateway TypeScript check**

Run: `cd services/gateway && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 2: Run SDK tests**

Run: `cd packages/MeeshySDK && swift test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 3: Build iOS app**

Run: `./apps/ios/meeshy.sh build 2>&1 | tail -10`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Verify all CLAUDE.md files have the new sections**

Run: `grep -l "Instant App\|Cache-First\|React Query Patterns\|Caching Patterns" CLAUDE.md apps/ios/CLAUDE.md apps/web/CLAUDE.md services/gateway/CLAUDE.md`
Expected: All 4 files listed
