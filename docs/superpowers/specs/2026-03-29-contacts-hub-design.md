# Contacts Hub — Design Spec

**Date**: 2026-03-29
**Status**: Approved
**Scope**: iOS app — new contacts management screen + menu integration

## Problem

The app has no centralized contacts management. Friend requests are accessible only via a dead route (no UI entry point). When viewing a profile of someone who sent a connection request, the user sees "Demande de connexion" instead of "Accepter/Refuser". There is no way to view accepted friends, sent requests, or invite people to Meeshy.

## Solution

A full-screen contacts hub accessible from the main menu ladder, organized into 4 horizontally-swipeable tabs with a modern, cohesive design.

## Entry Point — Menu Ladder Change

Replace the theme toggle (dynamic icon via `theme.preference.icon`) at index 4 in the menu ladder with a contacts navigation button:

- **Icon**: `person.2.fill`
- **Color**: `6366F1` (indigo500 — follows brand system, avoids deprecated pink)
- **Action**: `router.push(.contacts)`
- **Theme toggle removal**: The setting remains accessible via Settings screen (already exists there)

### Menu items after change (6 items, same count):
1. Profile (`person.fill`)
2. New Conversation (`plus.message.fill`)
3. Links (`link.badge.plus`)
4. Notifications (`bell.fill`)
5. **Contacts** (`person.2.fill`) — NEW, replaces theme toggle
6. Settings (`gearshape.fill`)

## Screen Structure

### Header
- Back arrow (chevron.left) left-aligned
- Title "Contacts" centered, `system size 17, weight .bold, design .rounded`
- Consistent with other app headers (FriendRequestListView style, modernized)

### Tab Bar
4 horizontal tabs below the header, swipeable with `TabView` or custom `HStack` + gesture:

| Tab | Icon | Label | Badge |
|-----|------|-------|-------|
| Contacts | `person.2.fill` | Contacts | Total count |
| Demandes | `person.badge.plus` | Demandes | Pending received count |
| Decouvrir | `magnifyingglass` | Decouvrir | — |
| Bloques | `hand.raised.fill` | Bloques | — |

Tab indicator: accent-colored underline (indigo500), animated on swipe.

## Testability — Protocol & DI Requirements

### FriendServiceProviding protocol (new)
`FriendService` currently has no protocol. Before implementing the hub, add:

```swift
public protocol FriendServiceProviding: Sendable {
    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest
    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest
    func deleteRequest(requestId: String) async throws
    func acceptedFriends(offset: Int, limit: Int, filter: String?) async throws -> OffsetPaginatedAPIResponse<[FriendRequestUser]>
}
```

Location: `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift` (above class declaration, per iOS TDD conventions).

### ViewModel Architecture — Per-Tab ViewModels
Split into focused ViewModels (not one monolith):

| ViewModel | Responsibilities | Dependencies |
|-----------|-----------------|--------------|
| `ContactsListViewModel` | Load accepted friends, filter by chip, search locally | `FriendServiceProviding` |
| `RequestsViewModel` | Load received + sent requests, accept/reject/cancel | `FriendServiceProviding` |
| `DiscoverViewModel` | Search users, send invitations, send friend requests | `FriendServiceProviding`, `UserService` |
| `BlockedViewModel` | Load blocked users, unblock | `BlockServiceProviding` |

All ViewModels accept dependencies via init injection with `.shared` defaults.

### LoadState (mandatory per architecture bible)
Every ViewModel exposes `loadState: LoadState` and follows cache-first:

```swift
enum LoadState {
    case idle, cachedStale, cachedFresh, loading, loaded, offline, error(String)
}
```

1. Call `CacheCoordinator` BEFORE any API request
2. Distinguish `.fresh/.stale/.expired/.empty` in a switch
3. Display `.stale` immediately + silent background refresh
4. NO spinner when cached data exists — skeleton only on empty cache

## Tab 1: Contacts (Accepted Friends)

### Filter Chips
Horizontal scrollable chips below the tab bar:

| Chip | Filter Logic |
|------|-------------|
| **Tous (N)** | All accepted friends, online first |
| **En ligne (N)** | `isOnline == true` |
| **Hors ligne** | `isOnline == false` |
| **Repertoire** | V1: "Bientot disponible" placeholder. V2: CNContact matching |
| **Affilies** | Users where `referredBy == currentUserId` (requires `referredBy` field on User) |

Default selection: "Tous". Active chip uses indigo500 fill, inactive uses bordered indigo900 style.

### Contact Row
Each row displays:
- `MeeshyAvatar` with presence indicator (green dot for online)
- Display name (bold) + @username (muted)
- Presence text: "En ligne" (green) or "Vu il y a Xh" (muted)
- Tap → opens `UserProfileSheet`

### Sorting
- Online contacts first, sorted by `lastActiveAt` descending
- Offline contacts sorted by `lastActiveAt` descending

### Search
Local search bar at top of the list, filters by name/username. Hides on scroll down, shows on scroll up.

### Pagination
Infinite scroll with load-more trigger at 80% scroll position. Loading indicator at bottom during fetch. Page size: 30.

### Data Source — `GET /api/v1/friends`

**Query logic**: Find all `FriendRequest` where `(senderId == currentUser OR receiverId == currentUser) AND status == 'accepted'`, resolve the OTHER user with presence data.

**Query params**: `offset`, `limit`, `filter` (all/online/offline/affiliate)

**Response schema**:
```typescript
{
  success: true,
  data: FriendUser[],
  pagination: { total, hasMore, limit, offset }
}

type FriendUser = {
  id: string           // userId (not requestId)
  username: string
  displayName: string | null
  firstName: string | null
  lastName: string | null
  avatar: string | null
  isOnline: boolean    // from PresenceManager/Redis
  lastActiveAt: string // ISO8601
  friendSince: string  // FriendRequest.respondedAt
  referredBy: string | null  // for affiliate filter
}
```

**Presence**: `isOnline` resolved from Redis presence store (same as conversation participant presence). NOT stale DB field.

### "Affilies" filter
Filters where `referredBy == currentUserId`. Requires checking if `referredBy` field exists on User model in Prisma schema. If not present, add it as optional `String?` field.

## Tab 2: Demandes (Friend Requests)

### Sub-filter
Two pill-shaped toggles at the top:
- **Recues (N)** — default selected, indigo500 fill
- **Envoyees (N)** — bordered style

### Received Requests
Each row:
- `MeeshyAvatar` with mood emoji if available
- Sender name (bold) + @username (muted)
- Optional message (secondary text, 2-line limit)
- Relative time ("Il y a 2h")
- Action buttons: reject (xmark, gray circle) + accept (checkmark, green gradient circle)

Actions (with optimistic updates):
- Accept → optimistically remove row + show toast "Connexion acceptee" → call `FriendService.respond(requestId:, accepted: true)` → on failure: rollback row + error toast
- Reject → optimistically remove row + show toast "Demande refusee" → call `FriendService.respond(requestId:, accepted: false)` → on failure: rollback row + error toast

### Sent Requests
Each row:
- `MeeshyAvatar`
- Receiver name + @username
- Relative time
- Status chip: "En attente" (warning color)
- Action: "Annuler" button → optimistically remove → `FriendService.deleteRequest(requestId:)` → rollback on failure

**Note**: `GET /friend-requests/sent` returns all statuses. Client-side filter to `status == "pending"` for this view.

### Empty States
- Received: "Aucune demande recue" + person.2.slash icon
- Sent: "Aucune demande envoyee" + paperplane icon

## Tab 3: Decouvrir (Invite + Search)

### Invite Section (top)
Card-style section with:

**Email invite field:**
- Text field with email keyboard, placeholder "Adresse email"
- "Envoyer" button
- On submit: calls `POST /api/v1/invitations/email` (uses existing NodeMailer/SMTP setup from gateway notification system)
- Success toast: "Invitation envoyee a {email}"

**SMS/Phone invite:**
- Text field with phone pad keyboard, placeholder "Numero de telephone"
- OR "Choisir un contact" button → opens `CNContactPickerViewController`
- On submit: opens native SMS composer (`MFMessageComposeViewController`) with pre-filled message:
  > "Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download"
- If selected contact has an email AND a phone: propose both options (email auto + SMS)

**Import contacts button:**
- "Importer mes contacts" with `person.crop.circle.badge.plus` icon
- V1: shows "Bientot disponible" sheet on tap

### Search Section (bottom)
- Search bar: "Rechercher un utilisateur Meeshy"
- Calls `GET /users/search?q={query}` (already exists in gateway)
- Results: avatar, name, username, action button
- **Connection status resolution**: Client-side cross-reference against local `contactsList` and `pendingRequests` (already loaded by other tabs). No server-side join needed.
  - If userId in accepted friends → "Connecte" badge (success color)
  - If userId in sent pending requests → "En attente" chip (warning color)
  - If userId in received pending requests → "Accepter" button (success color)
  - Otherwise → "Ajouter" button (indigo, sends friend request)

## Tab 4: Bloques (Blocked Users)

Reuses existing `BlockedUsersView` logic but integrated into the tab layout:

Each row:
- `MeeshyAvatar`
- Name + @username
- "Debloquer" button (warning color)
- Confirmation alert before unblocking

Data source: `BlockService.shared.listBlockedUsers()`

Optimistic update: remove row immediately, rollback on failure.

Empty state: "Aucun utilisateur bloque" + hand.raised.slash icon

## Real-Time Updates

Subscribe to Socket.IO events for live updates while the hub is open:

| Event | Action |
|-------|--------|
| `friend:request-received` | Add to received requests list, update badge |
| `friend:request-accepted` | Move from requests to contacts list |
| `friend:request-rejected` | Remove from sent requests list |
| `user:presence-changed` | Update online/offline status in contacts list |

Subscriptions managed via Combine in ViewModels, cleaned up on `deinit`.

## Accessibility

- All tabs: `.accessibilityLabel("Onglet Contacts")`, etc.
- Filter chips: `.accessibilityLabel("Filtre: En ligne, 5 contacts")`
- Action buttons: `.accessibilityLabel("Accepter la demande de Jean-Charles")`
- Contact rows: `.accessibilityElement(children: .combine)`
- Empty states: VoiceOver reads icon description + text

## New Route

Add to `Router.swift`:
```swift
case contacts
```

Navigation destination in `RootView.swift`:
```swift
case .contacts:
    ContactsHubView()
        .navigationBarHidden(true)
```

## New Files

| File | Location | Purpose |
|------|----------|---------|
| `ContactsHubView.swift` | `apps/ios/Meeshy/Features/Contacts/` | Main container with tabs + header |
| `ContactsListTab.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 1 — accepted friends list |
| `RequestsTab.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 2 — received/sent requests |
| `DiscoverTab.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 3 — invite + search |
| `BlockedTab.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 4 — blocked users |
| `ContactsListViewModel.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 1 ViewModel |
| `RequestsViewModel.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 2 ViewModel |
| `DiscoverViewModel.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 3 ViewModel |
| `BlockedViewModel.swift` | `apps/ios/Meeshy/Features/Contacts/` | Tab 4 ViewModel |
| `ContactsShared.swift` | `apps/ios/Meeshy/Features/Contacts/` | Shared helpers (relativeTime, filter chip enum) |

## Modified Files

| File | Change |
|------|--------|
| `RootView.swift` | Replace theme toggle with contacts in menu ladder, add `.contacts` route |
| `Router.swift` | Add `case contacts` |
| `ProfileView.swift` | Update friend requests button to navigate to contacts hub (Demandes tab) |
| `FriendService.swift` (SDK) | Add `FriendServiceProviding` protocol + `acceptedFriends()` method |

## Files to Deprecate

| File | Reason |
|------|--------|
| `FriendRequestListView.swift` | Replaced by RequestsTab inside ContactsHubView |

## Gateway Changes Needed

### New endpoint: `GET /api/v1/friends`
Returns accepted friends with presence. See "Data Source" section above for full schema.

Implementation: query `FriendRequest` where status=accepted on both sides, resolve other user, enrich with Redis presence.

### New endpoint: `POST /api/v1/invitations/email`
Sends invitation email to non-Meeshy user.

Body: `{ email: string }`

Uses existing gateway email infrastructure (NodeMailer configured in notification service). Renders a branded HTML email template with download link.

Rate limit: 10 invitations per hour per user.

### Sent requests filter
Add optional `?status=pending` query param to `GET /friend-requests/sent` to filter server-side (optimization — client can also filter locally).

### Future (V2): `POST /api/v1/contacts/match`
Match phone numbers/emails from device contacts against Meeshy users.

Body: `{ phones: string[], emails: string[] }`

## Design Language

- Follows existing Meeshy indigo brand identity
- Glass cards with `surfaceGradient(tint:)` + `glassCard()` modifier
- Spring animations for tab transitions
- Staggered appear for list items (0.04s delay per index)
- Haptic feedback on all actions
- Empty states with SF Symbols + descriptive text

## Out of Scope (V1)

- Device contact import (CNContact) — placeholder only
- "Repertoire" chip — shows "Bientot disponible"
- Contact matching API endpoint
- Rich affiliate tracking UI (depends on `referredBy` field availability)
- Mutual friends indicator
