# MemberRole Alignment Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centraliser toutes les vérifications de rôles conversation/communauté sur `MemberRole` enum + helpers de `role-types.ts`, et éliminer les hiérarchies custom hardcodées, le mélange global/member, et les string comparisons.

**Architecture:** Trois axes — (1) créer une fonction utilitaire `getEffectiveRole()` qui résout le rôle effectif = max(globalRole, memberRole) pour remplacer les 3 hiérarchies custom dupliquées, (2) remplacer toutes les comparaisons hardcodées par `hasMinimumMemberRole()` et `MemberRole` enum côté web, (3) ajouter `creator` au `CommunityRole` Swift et créer un enum `MemberRole` unifié dans le SDK iOS.

**Tech Stack:** TypeScript (shared + web), Swift (SDK + iOS app), Zod, XCTest, Jest

**Dependency graph:**
```
Task 1 (shared: getEffectiveRole + hasModeratorPrivileges)
  ├── Task 2 (web: ConversationView)     ─┐
  ├── Task 3 (web: use-stream-messages)   ├── Task 7 (web: BubbleMessage + use-message-interactions)
  ├── Task 4 (web: ConversationSettings)  │
  ├── Task 5 (web: HeaderToolbar)         │
  └── Task 6 (web: participants.service)  ─┘
Task 8 (web: factorize participant utils + use-participant-management)
  └── needs: Task 1 (uses getEffectiveRole in hook)
Task 9 (iOS SDK: MemberRole enum) → Task 10 (iOS: ParticipantsView)
Task 11 (cleanup: deprecated aliases)
```

---

## Context: Two Role Systems

**Global roles** (`GlobalUserRole` in `role-types.ts`): UPPERCASE, system-wide.
```
BIGBOSS (100) > ADMIN (80) > MODERATOR (60) > AUDIT (40) > ANALYST (30) > USER (10)
```

**Member roles** (`MemberRole` in `role-types.ts`): lowercase, per-conversation/community.
```
creator (40) > admin (30) > moderator (20) > member (10)
```

**Effective role** = max(global hierarchy, member hierarchy). Example: global USER + conversation creator → effective = creator level.

**Source of truth:** `packages/shared/types/role-types.ts`

**Key helpers already available:**
- `hasMinimumMemberRole(role, required)` — hierarchy comparison
- `isMemberCreator(role)`, `isMemberAdmin(role)`, `isMemberModerator(role)` — type guards
- `MEMBER_ROLE_HIERARCHY` — `{ creator: 40, admin: 30, moderator: 20, member: 10 }`
- `GLOBAL_ROLE_HIERARCHY` — `{ BIGBOSS: 100, ADMIN: 80, ... USER: 10 }`
- `normalizeGlobalRole(str)` — normalizes string to `GlobalUserRole`

---

### Task 1: Add `getEffectiveRole()` to shared role-types

**Why:** 3 places (ConversationView, use-stream-messages, use-message-interactions) each hardcode a custom `PRIVILEGE_LEVELS` map mixing global + member roles. This creates a single, tested, canonical function.

**Files:**
- Modify: `packages/shared/types/role-types.ts`
- Create: `packages/shared/types/__tests__/role-types.test.ts`

**Step 1: Write the failing tests**

```typescript
// packages/shared/types/__tests__/role-types.test.ts
import { getEffectiveRole, getEffectiveRoleLevel } from '../role-types';

describe('getEffectiveRole', () => {
  it('returns global role when higher than member role', () => {
    expect(getEffectiveRole('ADMIN', 'member')).toBe('ADMIN');
  });

  it('returns member role uppercased when higher than global role', () => {
    expect(getEffectiveRole('USER', 'creator')).toBe('CREATOR');
  });

  it('returns global role when member role is empty', () => {
    expect(getEffectiveRole('USER', '')).toBe('USER');
  });

  it('returns global role when member role is undefined', () => {
    expect(getEffectiveRole('MODERATOR', undefined)).toBe('MODERATOR');
  });

  it('handles BIGBOSS as highest', () => {
    expect(getEffectiveRole('BIGBOSS', 'creator')).toBe('BIGBOSS');
  });

  it('handles case-insensitive global role', () => {
    expect(getEffectiveRole('user', 'admin')).toBe('ADMIN');
  });

  it('handles case-insensitive member role', () => {
    expect(getEffectiveRole('USER', 'Creator')).toBe('CREATOR');
  });
});

describe('getEffectiveRoleLevel', () => {
  it('returns numeric level for effective role', () => {
    expect(getEffectiveRoleLevel('USER', 'creator')).toBe(40);
  });

  it('returns global level when higher', () => {
    expect(getEffectiveRoleLevel('BIGBOSS', 'member')).toBe(100);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx jest types/__tests__/role-types.test.ts --no-cache`
Expected: FAIL — `getEffectiveRole` is not exported

**Step 3: Write the implementation**

Add to `packages/shared/types/role-types.ts` after the `MEMBER_ROLE_HIERARCHY` block (around line 123):

```typescript
/**
 * Mapping des rôles member vers des niveaux comparables aux rôles globaux.
 * Permet de comparer creator (conv) vs MODERATOR (global) sur une echelle unique.
 *
 * Echelle: BIGBOSS=100, ADMIN=80, CREATOR=70, MODERATOR=60, AUDIT=40, ANALYST=30, USER/MEMBER=10
 */
const UNIFIED_ROLE_LEVELS: Record<string, number> = {
  // Global roles (UPPERCASE)
  BIGBOSS: 100,
  ADMIN: 80,
  MODERATOR: 60,
  AUDIT: 40,
  ANALYST: 30,
  USER: 10,
  // Member roles (UPPERCASE for lookup after normalization)
  CREATOR: 70,
  MEMBER: 10,
};

/**
 * Retourne le role effectif = max(globalRole, memberRole) sur une echelle unifiee.
 * Le resultat est toujours UPPERCASE.
 *
 * @param globalRole - Role global de l'utilisateur (ex: 'USER', 'ADMIN')
 * @param memberRole - Role dans la conversation/communaute (ex: 'creator', 'admin', 'member')
 * @returns Le role avec le niveau le plus eleve, en UPPERCASE
 */
export function getEffectiveRole(
  globalRole: string,
  memberRole: string | undefined | null,
): string {
  const globalUpper = (globalRole || 'USER').toUpperCase();
  const memberUpper = (memberRole || '').toUpperCase();
  const globalLevel = UNIFIED_ROLE_LEVELS[globalUpper] || 0;
  const memberLevel = UNIFIED_ROLE_LEVELS[memberUpper] || 0;
  return memberLevel > globalLevel ? memberUpper : globalUpper;
}

/**
 * Retourne le niveau numerique du role effectif.
 */
export function getEffectiveRoleLevel(
  globalRole: string,
  memberRole: string | undefined | null,
): number {
  const globalUpper = (globalRole || 'USER').toUpperCase();
  const memberUpper = (memberRole || '').toUpperCase();
  const globalLevel = UNIFIED_ROLE_LEVELS[globalUpper] || 0;
  const memberLevel = UNIFIED_ROLE_LEVELS[memberUpper] || 0;
  return Math.max(globalLevel, memberLevel);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/shared && npx jest types/__tests__/role-types.test.ts --no-cache`
Expected: PASS (all 9 tests)

**Step 5: Export from index**

Verify `getEffectiveRole` and `getEffectiveRoleLevel` are accessible via `@meeshy/shared/types`. If `role-types.ts` is re-exported from `types/index.ts`, this is automatic.

**Step 6: Commit**

```bash
git add packages/shared/types/role-types.ts packages/shared/types/__tests__/role-types.test.ts
git commit -m "feat(shared): add getEffectiveRole() for unified global+member role resolution"
```

---

### Task 2: Replace custom hierarchy in ConversationView

**Why:** `ConversationView.tsx:188-195` hardcodes a `PRIVILEGE_LEVELS` map. Replace with `getEffectiveRole()`.

**Files:**
- Modify: `apps/web/components/conversations/ConversationView.tsx:185-195`

**Step 1: Read the current code**

Read `apps/web/components/conversations/ConversationView.tsx` lines 180-200.

**Step 2: Replace the hardcoded hierarchy**

Replace:
```typescript
const PRIVILEGE_LEVELS: Record<string, number> = {
  BIGBOSS: 100, ADMIN: 80, CREATOR: 70, MODERATOR: 60, AUDIT: 40, ANALYST: 30, USER: 10, MEMBER: 10,
};
const convRoleUpper = conversationRole.toUpperCase();
const globalRoleUpper = globalRole.toUpperCase();
const effectiveRole = (PRIVILEGE_LEVELS[convRoleUpper] || 0) > (PRIVILEGE_LEVELS[globalRoleUpper] || 0)
  ? convRoleUpper
  : globalRoleUpper;
```

With:
```typescript
import { getEffectiveRole } from '@meeshy/shared/types/role-types';
// ... (add import at top of file)

const effectiveRole = getEffectiveRole(globalRole, conversationRole);
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep ConversationView`
Expected: No errors related to ConversationView

**Step 4: Commit**

```bash
git add apps/web/components/conversations/ConversationView.tsx
git commit -m "refactor(web): use getEffectiveRole() in ConversationView"
```

---

### Task 3: Replace custom hierarchy in use-stream-messages

**Why:** `hooks/use-stream-messages.ts:184-191` has the same duplicated `LEVELS` map.

**Files:**
- Modify: `apps/web/hooks/use-stream-messages.ts:184-191`

**Step 1: Replace getUserModerationRole**

Replace:
```typescript
const getUserModerationRole = useCallback((): string => {
  const globalRole = (user.role as string) || 'USER';
  const convRole = (conversationRole || '').toUpperCase();
  const LEVELS: Record<string, number> = {
    BIGBOSS: 100, ADMIN: 80, CREATOR: 70, MODERATOR: 60, AUDIT: 40, ANALYST: 30, USER: 10, MEMBER: 10,
  };
  return (LEVELS[convRole] || 0) > (LEVELS[globalRole] || 0) ? convRole : globalRole;
}, [user.role, conversationRole]);
```

With:
```typescript
import { getEffectiveRole } from '@meeshy/shared/types/role-types';
// ... (add import at top of file)

const getUserModerationRole = useCallback(
  (): string => getEffectiveRole(user.role as string, conversationRole),
  [user.role, conversationRole],
);
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep use-stream-messages`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/hooks/use-stream-messages.ts
git commit -m "refactor(web): use getEffectiveRole() in use-stream-messages"
```

---

### Task 4: Fix ConversationSettingsModal ADMIN_ROLES

**Why:** Line 107 mixes global + member roles in both cases: `['ADMIN', 'MODERATOR', 'BIGBOSS', 'CREATOR', 'AUDIT', 'ANALYST', 'admin', 'moderator']`. Should use `hasMinimumMemberRole()` for conversation context.

**Files:**
- Modify: `apps/web/components/conversations/ConversationSettingsModal.tsx:107,204-206`

**Step 1: Replace ADMIN_ROLES + canAccessAdminSettings**

Replace:
```typescript
const ADMIN_ROLES = ['ADMIN', 'MODERATOR', 'BIGBOSS', 'CREATOR', 'AUDIT', 'ANALYST', 'admin', 'moderator'];
```

And:
```typescript
const canAccessAdminSettings = useMemo(() => {
  return ADMIN_ROLES.includes(currentUserRole.toUpperCase()) ||
         ADMIN_ROLES.includes(currentUserRole.toLowerCase());
}, [currentUserRole]);
```

With:
```typescript
import { hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';
// ... (add import at top of file)

// (remove ADMIN_ROLES constant entirely)

const canAccessAdminSettings = useMemo(() => {
  return hasMinimumMemberRole(currentUserRole.toLowerCase(), MemberRole.MODERATOR);
}, [currentUserRole]);
```

**Context:** `currentUserRole` here is the **conversation role** (creator/admin/moderator/member). The check should be: "is this user at least a moderator in this conversation?" — which is exactly `hasMinimumMemberRole`.

**Important:** Verify where `currentUserRole` comes from in the component props. Read the file to confirm it's a member role, not a global role. If it's a global role, use `getEffectiveRole()` first.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep ConversationSettingsModal`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/web/components/conversations/ConversationSettingsModal.tsx
git commit -m "refactor(web): use hasMinimumMemberRole() in ConversationSettingsModal"
```

---

### Task 5: Fix HeaderToolbar string comparisons

**Why:** `header/HeaderToolbar.tsx:72-75` uses hardcoded string comparisons mixing global role (`currentUser.role !== 'BIGBOSS'`) and member role (`currentUserRole !== 'CREATOR'`).

**Files:**
- Modify: `apps/web/components/conversations/header/HeaderToolbar.tsx:70-75`

**Step 1: Read the current code**

Read `apps/web/components/conversations/header/HeaderToolbar.tsx` lines 65-80 to understand the full condition.

**Step 2: Replace with helper functions**

Replace the condition with:
```typescript
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';

// The condition checks if user can access settings
// Replace: currentUser.role !== 'BIGBOSS' && currentUser.role !== 'ADMIN' && currentUserRole !== 'ADMIN' && currentUserRole !== 'CREATOR'
// With:
const canAccessSettings = isGlobalAdmin(currentUser.role) ||
  hasMinimumMemberRole(currentUserRole?.toLowerCase() || 'member', MemberRole.ADMIN);
```

Adjust the surrounding logic accordingly (the original uses negation — `!canAccessSettings` to hide settings button).

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep HeaderToolbar`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/components/conversations/header/HeaderToolbar.tsx
git commit -m "refactor(web): use role helpers in HeaderToolbar"
```

---

### Task 6: Fix participants.service updateParticipantRole case

**Why:** `participants.service.ts:193` accepts `'ADMIN' | 'MODERATOR' | 'MEMBER'` (UPPERCASE) but the backend expects lowercase values matching `MemberRole`.

**Files:**
- Modify: `apps/web/services/conversations/participants.service.ts:190-199`

**Step 1: Fix the type and normalize**

Replace:
```typescript
async updateParticipantRole(
  conversationId: string,
  userId: string,
  role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
): Promise<void> {
  await apiService.patch(`/conversations/${conversationId}/participants/${userId}/role`, { role });
```

With:
```typescript
import type { MemberRoleType } from '@meeshy/shared/types/role-types';

async updateParticipantRole(
  conversationId: string,
  userId: string,
  role: MemberRoleType,
): Promise<void> {
  await apiService.patch(`/conversations/${conversationId}/participants/${userId}/role`, { role: role.toLowerCase() });
```

**Step 2: Find and fix all callers**

Search for `updateParticipantRole` in the web app. Fix any caller that passes UPPERCASE values:
```bash
grep -rn 'updateParticipantRole' apps/web/
```

Each caller must pass lowercase `MemberRoleType` values: `'creator' | 'admin' | 'moderator' | 'member'`.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep participants`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/web/services/conversations/participants.service.ts
git commit -m "fix(web): use MemberRoleType for updateParticipantRole"
```

---

### Task 7: Fix BubbleMessage and use-message-interactions role checks

**Why:** Both files use `['MODERATOR', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(role)` mixing global + member roles. Since these receive the **effective role** (already UPPERCASE from `getEffectiveRole()`), the check is: "does this effective role have moderation privileges?"

**Files:**
- Modify: `apps/web/components/common/BubbleMessage.tsx:46,116,122`
- Modify: `apps/web/hooks/use-message-interactions.ts:54-55,74`

**Step 1: Create a shared helper (in role-types.ts)**

Add to `packages/shared/types/role-types.ts`:

```typescript
/**
 * Verifie si un role effectif (global ou member, UPPERCASE) a des privileges de moderation.
 * Utilise pour les checks de permission sur les messages (edit, delete).
 */
export function hasModeratorPrivileges(effectiveRole: string): boolean {
  const level = UNIFIED_ROLE_LEVELS[effectiveRole.toUpperCase()] || 0;
  return level >= UNIFIED_ROLE_LEVELS.MODERATOR; // >= 60
}
```

**Step 2: Add test**

```typescript
describe('hasModeratorPrivileges', () => {
  it('returns true for BIGBOSS', () => expect(hasModeratorPrivileges('BIGBOSS')).toBe(true));
  it('returns true for ADMIN', () => expect(hasModeratorPrivileges('ADMIN')).toBe(true));
  it('returns true for CREATOR', () => expect(hasModeratorPrivileges('CREATOR')).toBe(true));
  it('returns true for MODERATOR', () => expect(hasModeratorPrivileges('MODERATOR')).toBe(true));
  it('returns false for USER', () => expect(hasModeratorPrivileges('USER')).toBe(false));
  it('returns false for MEMBER', () => expect(hasModeratorPrivileges('MEMBER')).toBe(false));
  it('returns false for ANALYST', () => expect(hasModeratorPrivileges('ANALYST')).toBe(false));
  it('is case insensitive', () => expect(hasModeratorPrivileges('creator')).toBe(true));
});
```

**Step 3: Replace in use-message-interactions.ts**

Replace:
```typescript
const hasSpecialPrivileges = ['MODERATOR', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(normalizedRole);
```
With:
```typescript
import { hasModeratorPrivileges } from '@meeshy/shared/types/role-types';
const hasSpecialPrivileges = hasModeratorPrivileges(userRole);
```

And replace:
```typescript
if (['BIGBOSS', 'ADMIN', 'MODERATOR', 'CREATOR'].includes(userRole.toUpperCase())) return true;
```
With:
```typescript
if (hasModeratorPrivileges(userRole)) return true;
```

**Step 4: Replace in BubbleMessage.tsx**

Replace:
```typescript
userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
```
With:
```typescript
userRole?: string;
```

Replace both:
```typescript
if (userRole && ['MODERATOR', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole)) return true;
```
With:
```typescript
import { hasModeratorPrivileges } from '@meeshy/shared/types/role-types';
if (userRole && hasModeratorPrivileges(userRole)) return true;
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -E "BubbleMessage|use-message-interactions"`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/shared/types/role-types.ts packages/shared/types/__tests__/role-types.test.ts apps/web/components/common/BubbleMessage.tsx apps/web/hooks/use-message-interactions.ts
git commit -m "refactor(shared,web): add hasModeratorPrivileges() and use in message permission checks"
```

---

### Task 8: Factorize participant helpers + align use-participant-management

**Why:** Three files duplicate the same logic:
- `isAnonymousUser()` — copié dans `conversation-participants.tsx`, `conversation-participants-drawer.tsx`, et 5 autres fichiers
- `getDisplayName()` / `getAvatarFallback()` — dupliqué dans participants + drawer
- `isAdmin` check — dupliqué dans `use-participant-management.ts` (hook) et `conversation-participants-drawer.tsx` (inline)
- `handleRemoveParticipant` — dupliqué dans le hook et le drawer

Le hook `useParticipantManagement` est utilisé par `ConversationSettingsModal` et `conversation-details-sidebar` mais **pas** par le drawer qui recalcule tout en interne.

**Files:**
- Create: `apps/web/utils/participant-helpers.ts`
- Modify: `apps/web/hooks/use-participant-management.ts`
- Modify: `apps/web/components/conversations/conversation-participants-drawer.tsx`
- Modify: `apps/web/components/conversations/conversation-participants.tsx`

**Step 1: Create shared participant helpers**

```typescript
// apps/web/utils/participant-helpers.ts
import type { Participant } from '@meeshy/shared/types/participant';
import { hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';
import { getUserInitials } from '@/lib/avatar-utils';

export function isAnonymousParticipant(participant: Participant): boolean {
  return participant.type === 'anonymous' || 'sessionToken' in participant || 'shareLinkId' in participant;
}

export function getParticipantDisplayName(user: { displayName?: string; firstName?: string; lastName?: string; username: string }): string {
  return user.displayName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.username;
}

export function getParticipantInitials(user: { displayName?: string; firstName?: string; lastName?: string; username: string }): string {
  return getUserInitials(user);
}

export function isParticipantModerator(role: string): boolean {
  return hasMinimumMemberRole(role.toLowerCase(), MemberRole.MODERATOR);
}
```

**Step 2: Extend use-participant-management with getEffectiveRole**

```typescript
// apps/web/hooks/use-participant-management.ts
import { getEffectiveRole } from '@meeshy/shared/types/role-types';
import { hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';

export function useParticipantManagement(conversation: Conversation, currentUser: User) {
  const userMembership = conversation.participants?.find(p => p.userId === currentUser.id);
  const memberRole = userMembership?.role || 'member';

  const effectiveRole = useMemo(
    () => getEffectiveRole(currentUser.role, memberRole),
    [currentUser.role, memberRole],
  );

  const isAdmin = useMemo(
    () => hasMinimumMemberRole(memberRole.toLowerCase(), MemberRole.MODERATOR) ||
          isGlobalAdmin(currentUser.role),
    [memberRole, currentUser.role],
  );

  const canModifyImage = useMemo(
    () => conversation.type !== 'direct' && isAdmin,
    [conversation.type, isAdmin],
  );

  // ... handleRemoveParticipant stays here (single source)
  // ... expose: { isAdmin, canModifyImage, effectiveRole, memberRole, handleRemoveParticipant, isLoading }
}
```

**Step 3: Refactor drawer to use the hook + shared helpers**

In `conversation-participants-drawer.tsx`:
- Remove inline `isAnonymousUser`, `getDisplayName`, `getAvatarFallback` — import from `participant-helpers.ts`
- Remove inline `isAdmin` calculation — get from `useParticipantManagement` or compute from props
- Remove inline `handleRemoveParticipant` — use callback prop or hook

**Important:** The drawer receives `participants: Participant[]` as props (not `conversation`), so it can't directly use `useParticipantManagement` which takes a `Conversation`. Two options:
1. Pass `isAdmin` and `handleRemoveParticipant` as props from the parent
2. Or compute `isAdmin` from the existing `currentRole` using `isParticipantModerator(currentRole)`

Option 2 is simpler — the drawer already computes `currentRole` from participants. Replace:
```typescript
const isAdmin = currentRole === MemberRole.CREATOR ||
                currentRole === MemberRole.ADMIN ||
                currentRole === MemberRole.MODERATOR;
```
With:
```typescript
import { isParticipantModerator } from '@/utils/participant-helpers';
const isAdmin = isParticipantModerator(currentRole || 'member');
```

**Step 4: Refactor conversation-participants.tsx**

Replace inline helpers with imports:
```typescript
import { isAnonymousParticipant, getParticipantDisplayName, getParticipantInitials } from '@/utils/participant-helpers';
```

Remove local `isAnonymousUser`, `getDisplayName`, `getAvatarFallback` functions.

**Step 5: Update use-participant-management to use role-types helpers**

Replace the verbose `isAdmin` check:
```typescript
// Before (6 conditions)
const isAdmin =
  currentUser.role === UserRoleEnum.ADMIN ||
  currentUser.role === UserRoleEnum.BIGBOSS ||
  userMembership?.role === MemberRole.CREATOR ||
  userMembership?.role === MemberRole.ADMIN ||
  userMembership?.role === MemberRole.MODERATOR;

// After (1 call)
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
const isAdmin = isGlobalAdmin(currentUser.role) ||
  hasMinimumMemberRole(memberRole.toLowerCase(), MemberRole.MODERATOR);
```

Same for `canModifyImage` — simplify to just `isAdmin` (moderators should also be able to modify images in non-direct conversations):
```typescript
const canModifyImage = conversation.type !== 'direct' && isAdmin;
```

**Step 6: Remove UserRoleEnum import from cleaned files**

After refactoring, `UserRoleEnum` should no longer be needed in:
- `use-participant-management.ts`
- `conversation-participants.tsx` (already uses `MemberRole`)

**Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -E "participant|drawer"`
Expected: No new errors

**Step 8: Run existing tests**

Run: `cd apps/web && npx jest --testPathPattern="conversation-participants" --no-cache`
Expected: Pre-existing failures only (i18n), no new regressions

**Step 9: Commit**

```bash
git add apps/web/utils/participant-helpers.ts apps/web/hooks/use-participant-management.ts apps/web/components/conversations/conversation-participants-drawer.tsx apps/web/components/conversations/conversation-participants.tsx
git commit -m "refactor(web): factorize participant helpers, deduplicate isAdmin/remove logic"
```

---

### Task 9: Add `MemberRole` enum to iOS SDK + fix CommunityRole (was Task 8)

**Why:** `CommunityRole` in `CommunityModels.swift` lacks `creator` case. Rather than patching, create a unified `MemberRole` enum (matching shared TS) and make `CommunityRole` a typealias.

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/MemberRole.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift:5-20,87-89`

**Step 1: Create MemberRole.swift**

```swift
import Foundation

/// Roles d'un membre dans une conversation ou communaute.
/// Aligne avec `MemberRole` dans `packages/shared/types/role-types.ts`.
public enum MemberRole: String, Codable, CaseIterable, Sendable, Comparable {
    case creator
    case admin
    case moderator
    case member

    /// Niveau hierarchique (plus eleve = plus de privileges)
    public var level: Int {
        switch self {
        case .creator: return 40
        case .admin: return 30
        case .moderator: return 20
        case .member: return 10
        }
    }

    public var displayName: String {
        switch self {
        case .creator: return "Creator"
        case .admin: return "Admin"
        case .moderator: return "Moderator"
        case .member: return "Member"
        }
    }

    public var icon: String {
        switch self {
        case .creator: return "crown.fill"
        case .admin: return "shield.checkered"
        case .moderator: return "shield.lefthalf.filled"
        case .member: return "person.fill"
        }
    }

    /// Verifie si ce role a au moins le niveau requis
    public func hasMinimumRole(_ required: MemberRole) -> Bool {
        level >= required.level
    }

    /// Comparable conformance basee sur la hierarchie
    public static func < (lhs: MemberRole, rhs: MemberRole) -> Bool {
        lhs.level < rhs.level
    }
}
```

**Step 2: Update CommunityModels.swift**

Replace:
```swift
public enum CommunityRole: String, Codable, CaseIterable, Sendable {
    case admin
    case moderator
    case member
    // ... displayName, icon computed properties
}
```

With:
```swift
/// @deprecated Use MemberRole instead
public typealias CommunityRole = MemberRole
```

Remove the `displayName` and `icon` computed properties from the old enum (they're now in `MemberRole`).

Update `APICommunityMember.communityRole`:
```swift
public var communityRole: MemberRole {
    MemberRole(rawValue: role) ?? .member
}
```

**Step 3: Verify CommunityPermissions still works**

`CommunityPermissions.forRole(_ role: CommunityRole)` should still compile since `CommunityRole` is now `MemberRole`. But the `switch` must handle `.creator`:

```swift
public static func forRole(_ role: MemberRole) -> Set<CommunityPermission> {
    switch role {
    case .creator:
        return Set(CommunityPermission.allCases)
    case .admin:
        return Set(CommunityPermission.allCases)
    case .moderator:
        return [.inviteMembers, .removeMembers, .moderateContent, .createConversations, .editConversations]
    case .member:
        return [.createConversations]
    }
}
```

**Step 4: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

**Step 5: Write tests**

```swift
// MeeshyTests/Unit/MemberRoleTests.swift
import XCTest
@testable import MeeshySDK

final class MemberRoleTests: XCTestCase {
    func test_hierarchy_creatorIsHighest() {
        XCTAssertTrue(MemberRole.creator > MemberRole.admin)
        XCTAssertTrue(MemberRole.admin > MemberRole.moderator)
        XCTAssertTrue(MemberRole.moderator > MemberRole.member)
    }

    func test_hasMinimumRole_creatorHasAll() {
        XCTAssertTrue(MemberRole.creator.hasMinimumRole(.member))
        XCTAssertTrue(MemberRole.creator.hasMinimumRole(.moderator))
        XCTAssertTrue(MemberRole.creator.hasMinimumRole(.admin))
        XCTAssertTrue(MemberRole.creator.hasMinimumRole(.creator))
    }

    func test_hasMinimumRole_memberHasOnlyMember() {
        XCTAssertTrue(MemberRole.member.hasMinimumRole(.member))
        XCTAssertFalse(MemberRole.member.hasMinimumRole(.moderator))
    }

    func test_rawValue_isLowercase() {
        XCTAssertEqual(MemberRole.creator.rawValue, "creator")
        XCTAssertEqual(MemberRole.admin.rawValue, "admin")
    }

    func test_decodingFromString() {
        let data = "\"creator\"".data(using: .utf8)!
        let role = try! JSONDecoder().decode(MemberRole.self, from: data)
        XCTAssertEqual(role, .creator)
    }

    func test_communityRoleTypealias() {
        let role: CommunityRole = .creator
        XCTAssertEqual(role, MemberRole.creator)
    }
}
```

**Step 6: Run tests**

Run: `./apps/ios/meeshy.sh test`
Expected: All pass

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MemberRole.swift packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift apps/ios/MeeshyTests/Unit/MemberRoleTests.swift
git commit -m "feat(sdk): add MemberRole enum, make CommunityRole typealias"
```

---

### Task 10: Replace hardcoded strings in iOS ParticipantsView (was Task 9)

**Why:** `ParticipantsView.swift` has ~15 hardcoded `.uppercased() == "CREATOR"` comparisons. Replace with `MemberRole` enum.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`

**Step 1: Read the full file**

Read `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift` to understand all role comparisons.

**Step 2: Add a computed property for parsed role**

Add near the existing computed properties:

```swift
private var parsedRole: MemberRole {
    guard let roleStr = currentUserRole?.lowercased() else { return .member }
    return MemberRole(rawValue: roleStr) ?? .member
}
```

**Step 3: Replace all computed role properties**

Replace:
```swift
private var isAdmin: Bool {
    let role = currentUserRole?.uppercased() ?? ""
    return ["ADMIN", "CREATOR", "BIGBOSS"].contains(role)
}

private var isCreator: Bool {
    (currentUserRole?.uppercased() ?? "") == "CREATOR"
}

private var isConvAdmin: Bool {
    (currentUserRole?.uppercased() ?? "") == "ADMIN"
}

private var isModerator: Bool {
    (currentUserRole?.uppercased() ?? "") == "MODERATOR"
}
```

With:
```swift
private var isAdmin: Bool {
    parsedRole.hasMinimumRole(.admin)
}

private var isCreator: Bool {
    parsedRole == .creator
}

private var isConvAdmin: Bool {
    parsedRole == .admin
}

private var isModerator: Bool {
    parsedRole == .moderator
}
```

**Step 4: Replace hardcoded strings in menu logic**

Replace all `participantRole == "MEMBER"`, `participantRole != "CREATOR"`, `participantRole != "ADMIN"` etc. with:

```swift
let targetRole = MemberRole(rawValue: participant.conversationRole?.lowercased() ?? "member") ?? .member
```

Then use `targetRole == .member`, `targetRole != .creator`, etc.

**Step 5: Replace roleBadgeLabel and roleBadgeColor**

```swift
private func roleBadgeLabel(_ role: String) -> String {
    let memberRole = MemberRole(rawValue: role.lowercased()) ?? .member
    return memberRole.displayName
}

private func roleBadgeColor(_ role: String) -> Color {
    let memberRole = MemberRole(rawValue: role.lowercased()) ?? .member
    switch memberRole {
    case .creator, .admin: return Color(hex: "A855F7")
    case .moderator: return Color(hex: "08D9D6")
    case .member: return Color(hex: "6B7280")
    }
}
```

**Step 6: Build**

Run: `./apps/ios/meeshy.sh build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift
git commit -m "refactor(ios): use MemberRole enum in ParticipantsView"
```

---

### Task 11: Clean up deprecated aliases in shared types (was Task 10)

**Why:** `role-types.ts` exports deprecated aliases (`hasMinimumConversationRole`, `isConversationAdmin`, `isConversationModerator`, `isConversationMemberRole`, `CONVERSATION_ROLE_HIERARCHY`, `COMMUNITY_ROLE_HIERARCHY`). Also `community.ts` exports deprecated `CommunityRole` enum. Verify no usages remain, then remove.

**Files:**
- Modify: `packages/shared/types/role-types.ts:137-143,221-222,263-267`
- Modify: `packages/shared/types/community.ts:13-20` (if CommunityRole still used)

**Step 1: Search for usages**

```bash
grep -rn "hasMinimumConversationRole\|isConversationAdmin\|isConversationModerator\|isConversationMemberRole\|CONVERSATION_ROLE_HIERARCHY" apps/ services/ packages/
grep -rn "CommunityRole" apps/ packages/ --include="*.ts" --include="*.tsx" --include="*.swift"
```

**Step 2: Replace any remaining usages**

For each file still importing deprecated names, replace with canonical equivalents:
- `hasMinimumConversationRole` → `hasMinimumMemberRole`
- `isConversationAdmin` → `isMemberAdmin`
- `isConversationModerator` → `isMemberModerator`
- `CONVERSATION_ROLE_HIERARCHY` → `MEMBER_ROLE_HIERARCHY`
- `CommunityRole` (TS) → `MemberRole`

**Step 3: Remove deprecated exports only if zero usages remain**

If usages still exist in untouched code, keep the aliases for now but add `// TODO: remove after full migration` comment.

**Step 4: Build both platforms**

Run: `cd packages/shared && npm run build`
Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Run: `./apps/ios/meeshy.sh build`
Expected: All pass

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(shared): remove deprecated role aliases where possible"
```

---

## Execution Order (Parallelizable Waves)

| Wave | Tasks | Dependency |
|------|-------|------------|
| 1 | Task 1 (shared: getEffectiveRole + hasModeratorPrivileges + tests) | None |
| 2 | Tasks 2, 3, 4, 5, 6 (web role alignment, in parallel) + Task 9 (iOS SDK MemberRole) | Task 1 (web), None (iOS) |
| 3 | Task 7 (BubbleMessage + use-message-interactions) + Task 8 (factorize participant helpers) | Task 1 |
| 4 | Task 10 (iOS ParticipantsView) | Task 9 |
| 5 | Task 11 (cleanup deprecated aliases) | All previous |

**Note:** Web tasks (2-8) and iOS tasks (9-10) are independent and can run in parallel across waves.
