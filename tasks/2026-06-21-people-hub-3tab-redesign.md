# People hub — 3-tab contact view redesign (2026-06-21)

Supersedes the IA of `tasks/2026-06-07-calls-view-people-hub-plan.md` (which used a
flat 5-tab hub). New structure, per product request: **three primary tabs** that
swipe under a collapsing header — **Appels** · **Clavier** · **Contacts** — where
Contacts nests the existing directory sub-tabs.

Delivery: **phased**, reviewed per phase. Call infrastructure: **full-stack** in Phase 2.

## Phase 1 — shell + sticky sub-tabs + working Keypad  ✅ (this commit)

- `PeopleTab` enum (calls/keypad/contacts) — `ContactsShared.swift`.
- `ContactsHubView` restructured into the 3-tab shell (collapsing header + paged
  TabView). Keeps `init(initialTab: ContactsTab)` so deep links
  (`Router.contacts(ContactsTab)`) still open on the right sub-tab.
- `ContactsSection` (new): the Contacts tab. Sticky Tous/Demandes/Bloqués/Découvrir
  sub-tab bar + tap-switched content (no nested horizontal paging, so the hub's
  primary swipe is unambiguous). Owns the 4 existing VMs; each existing tab view
  reused unchanged and reports scroll up to the hub header.
- `CallsTab` (new): Phase 1 empty-state shell + scroll plumbing. Filled in Phase 2.
- `KeypadViewModel` + `KeypadTab` (new): **working** dial pad. One smart input —
  numeric → `getProfileByPhone` (exact `GET /users/phone/:phone`); text → `searchUsers`
  (`GET /users/search`). No new endpoints. Tap result → profile sheet (where
  call/message actions live). Long-press backspace clears.
- `KeypadViewModelTests` (new): input editing, classification, phone lookup (incl.
  404 = normal "no match"), name search, error path.
- Registered all 5 files in `Meeshy.xcodeproj/project.pbxproj` (explicit refs,
  objectVersion 63 — no synchronized groups).

### Not verifiable in this env
No Swift toolchain on the Linux runner → `./apps/ios/meeshy.sh build|test` could not
be run here. Code written against existing proven patterns; **Xcode/CI must compile
+ run tests before merge.**

## Phase 2 — full Call stack  ✅ (shipped)

Delivered gateway → SDK → iOS. Note the IA refinement vs the 2026-06-07 plan:
peer is resolved from the **conversation roster** (not CallParticipant), so missed
incoming/outgoing calls — where the callee never joined — still show who was
involved. `isVideo` = `CallSession.metadata.type === 'video'`.

- **Gateway**: `GET /api/v1/calls/history?limit&cursor&filter=all|missed`,
  cursor-paginated, 3-month window. Pure helpers in `callHistory.ts` (13 unit
  tests, green) + `CallService.listHistory`. `missed` filter keyed on
  `status='missed'` incoming (excludes rejected + own outgoing-unanswered).
- **SDK**: `APICallRecord`/`CallDirection`/`CallHistoryPeer` + display accessors;
  `CallHistoryService(+Providing)`; `CachePolicy.callHistory` +
  `CacheCoordinator.callHistory` (encrypted, in init + invalidateAll).
- **iOS**: `CallsViewModel` (cache-first), `CallsTab` journal (filter chips,
  direction/video/duration rows, missed in red), `CallDetailSheet` (who/when/
  type/duration/data/phone + redial), `CallStarter` (resolve-or-profile) wired to
  journal redial + keypad result rows. `CallsViewModelTests` + mock.

### Review (Phase 2)
- Backend reviewed (independent agent): Prisma where/cursor/peer/route all sound;
  refined `missed` filter to `status='missed'` (was `answeredAt: null`, which
  wrongly included user-rejected calls). Accepted edge: anonymous direct peer →
  `peer: null`.
- iOS/SDK reviewed (independent agent): **no compile errors / logic bugs** — every
  interface (CacheFirstLoader, LoadState exhaustiveness, GRDBCacheStore Date
  round-trip, PaginatedAPIResponse, MeeshyAvatar contexts, CallStarter APIs,
  `.sheet(item:)`, `[weak self]`/deinit, field parity) verified against real defs.
- Reused, not reinvented: `EmptyStateView`, `MeeshyAvatar`, `CacheFirstLoader`,
  `RelativeTimeFormatter`/`Date.relativeTimeString`, `CallManager.startCall`,
  `ConversationService.findDirectWith`, existing pagination/response types.
- Still unverifiable here: SDK/app Swift build + Xcode tests (no toolchain). Gateway
  full `tsc`/integration need the network-blocked Prisma engine; pure helpers are
  standalone-typechecked + unit-tested.

Reuses the validated backend contract from the 2026-06-07 plan:
1. **Gateway**: `GET /api/v1/calls/history?limit&cursor&filter=all|missed` →
   `CallHistoryItem[]` derived from `CallSession` + `CallParticipant` for the
   current user (direction = initiator?outgoing:(answered?incoming:missed), isVideo,
   durationSec, peer{…}). 3-month sliding window. `CallService.listHistory(...)`.
2. **shared**: Zod schema + `CallHistoryItem` type.
3. **SDK**: `CallHistoryServiceProviding`/`CallHistoryService` + Decodable models +
   `CacheCoordinator` store (local cache, cache-first).
4. **iOS**: fill `CallsTab` — journal rows (avatar+presence+story, direction badge,
   audio/video, relative time), cache-first; tap → call detail (duration, data used
   = bytesSent+Received, conversation, participants, per-person history, recall
   audio/video via existing `CallManager.startCall`). Wire keypad result → direct
   audio/video call too (same conversation-resolution helper).
5. Tests at each layer.

## Review (Phase 1)
- 4 new app files + 1 test file; 2 files edited (`ContactsShared`, `ContactsHubView`).
- Reused: `CollapsibleHeader`, scroll-sentinel plumbing, `MeeshyAvatar`,
  `DynamicColorGenerator`, `HapticFeedback`, `adaptiveOnChange`, existing 4 tab views.
- No endpoint reinvention. Minimal blast radius: navigation entry + route signature
  unchanged.
