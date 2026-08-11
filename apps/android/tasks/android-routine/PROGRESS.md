# Progress — state & what to do next

> On 2026-08-11 **home-screen widgets' fourth sub-slice landed**: `QuickReplyWidget`
> (slice `widget-quick-reply`, feature-parity §"Home-screen widgets" — the natural next step
> after the prior slice laid the exact foundation this widget needed). **RE-PROUVEN before
> starting**: `git branch -r`/`gh pr list --state open --search "apps/android OR apps/ios"`
> found no interrupted run of this routine (empty result — no open PRs at all at scan time).
> Re-read iOS's `QuickReplyWidgetView` in full (not from memory) before coding: featured
> conversation = `entry.conversations.first(where: isUnread) ?? entry.conversations.first` over
> the SAME `ConversationProvider` the recent-conversations widget shares (confirming the
> pinned-first-then-recency ordering reuse was correct, not assumed); 4 canned-reply buttons —
> "👍", "OK", "Thanks!", "Call me" — deep-linking (on iOS) to a dead `meeshy://quickreply/{id}`
> host (per the prior slice's own finding). **Shipped (production, all `apps/android`)**: new
> `QuickReplyWidgetPresentation` (`:app/widget`, pure) reuses the exact pinned-first-then-recency
> `sortedWith`/`ConversationRowTime` block already established by the two sibling widgets, then
> applies `ordered.firstOrNull { it.unreadCount > 0 } ?: ordered.firstOrNull()` — the direct port
> of iOS's own selection rule — mapping the featured conversation's `title`/`preview` via the
> same `displayTitle()`/`lastMessagePreview()` SSOTs. New `QuickReplyDeepLink.uri(conversationId,
> draftText)` (`:app/widget`, pure) builds `meeshy://conversation/{id}?draft={encoded}` via
> `java.net.URLEncoder` — the matching JVM-testable counterpart to `ChatViewModel.initialDraft`'s
> own `java.net.URLDecoder` (never `android.net.Uri.encode`/`.decode`, which silently no-op under
> this module's plain JVM unit tests, per the prior slice's own `NOTES.md` entry). `QuickReplyWidget`
> (Glance) shows the featured conversation's title/preview plus 4 chips — 👍 (no localization
> needed) + 3 new localized strings (`widget_quick_reply_ok`/`_thanks`/`_call_me`, en/fr/es/pt) —
> each chip's tap fires the now-real `CONVERSATION_DRAFT_DEEP_LINK` from the prior slice.
> **Deliberately prefills rather than auto-sends**: a blind background send from a cold widget
> process has no confirmation step; opening the conversation with the reply already typed (ready
> to confirm with a tap) matches the "quick, not blind" posture better, and needed zero new
> message-sending plumbing in the widget process itself. **+14 new tests**
> (`QuickReplyWidgetPresentationTest`: empty→null, an unread conversation wins over a more-recent
> read one, a pinned-but-read conversation is skipped in favor of an unread one, no-unread falls
> back to most-recent, no-unread-and-no-recency-tie falls back to pinned, direct/group title
> resolution, preview reuse, empty-message fallback; `QuickReplyDeepLinkTest`: plain text, space
> encoding, literal `+` escaped so it never round-trips as a space, emoji encoding, conversation id
> passthrough). **Mutation-proven**, two axes: neutralizing the unread-first selection
> (`ordered.firstOrNull { it.unreadCount > 0 } ?: ...` → `ordered.firstOrNull()`) fails **exactly**
> the 2 unread-selection tests (7 others green); neutralizing the URI encoding
> (`URLEncoder.encode(draftText, "UTF-8")` → the raw `draftText`) fails **exactly** the 3
> encoding-focused tests (2 others — plain ASCII and id-passthrough — stay green, since those
> inputs need no encoding either way). Both applied via a scratch `cp`-backed edit (never `git
> checkout --`), restored via `cp`, diffed clean against the backup afterward. **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, matching every prior
> slice — no build-graph regression; zero test failures across every module's XML reports).
> Reviewer **PASS** (diff `apps/android` only, confirmed via `git status --short` — 11 files, all
> under `apps/android`; SDK purity — the pure selection/URI-building decisions live in
> `:app/widget` (correctly, per the grain test: product decisions, not reusable atoms — mirrors
> every sibling widget's own precedent); SSOT — reuses `displayTitle`/`lastMessagePreview`/
> `ConversationRowTime`/`WidgetEntryPoint`/`directConversationTypes`/the now-real
> `CONVERSATION_DRAFT_DEEP_LINK`, zero re-implementation; no coverage floor lowered; no
> tautological tests). **Not attempted this run** (compile+test-only per the local JVM gate; no
> simulator/emulator session for on-device verification — a future run should install-and-verify
> that a real tap on a Quick Reply chip actually opens the conversation with the reply text
> pre-filled in the composer, closing the loop this slice and the prior one only proved
> independently at the unit-test level). **Deliberate, documented scope cut**: matches the exact
> canned-reply set iOS ships (👍/OK/Thanks!/Call me) rather than inventing a different or
> user-configurable set — true visual parity, only the WIRING differs (and improves on iOS's own
> dead one). **Next slice candidates (not attempted this run)**: mark-read widget action (still
> deprioritized — thin glue, low test value); Google Assistant App Actions (`shortcuts.xml`) for
> the voice-triggered half of the shortcuts epic — needs external Assistant indexing/review; a
> presence-cache foundation for conversation participants; on-device transcription for the Feed
> audio composer; Voice-cloning onboarding wizard; map/search/reverse-geocoding for the location
> attachment; PiP (calls + media) — per the orchestrator's guidance this remains a documented,
> real, multi-slice-epic gap warranting a planning/decomposition pass rather than a bare re-grep.
> With this slice, all 4 of iOS's `MeeshyWidgets` widgets (`UnreadCountWidget`,
> `RecentConversationsWidget`, `FavoriteContactsWidget`, `QuickReplyWidget`) now have an Android
> counterpart — the "Home-screen widgets" checklist item's remaining scope is refinement
> (mark-read, additional sizes/kinds, push-refresh, presence badge) plus the separate Assistant
> App Actions half, not missing widget kinds.

> On 2026-08-11 **chat-composer prefill-draft mechanism landed** (slice
> `chat-composer-prefill-draft`, feature-parity §"Home-screen widgets" — picked from the prior
> slice's own explicit "Next slice candidates" list: unlocking a genuinely working Quick Reply
> widget, since iOS's own is confirmed dead — a real opportunity to EXCEED iOS parity, not just
> match it). **RE-PROUVEN before starting**: `git branch -r`/`gh pr list --state open --search
> "apps/android OR apps/ios"` found no interrupted run of this routine — the sole open PR
> (`#2851`) is an unrelated concurrent `apps/web` session. Also considered `LanguagePickerDialog`
> consolidation (3 near-identical pickers) as a candidate this run, but discarded it after reading
> both existing dialogs (`RegionalLanguageDialog`/`ComposerLanguagePickerDialog`) in full: each is
> backed by a DIFFERENT pure filter source (`RegionalLanguageSelection`/`LanguageStepSelection`),
> so a shared extraction would only unify the `@Composable` shell — pure UI glue, exempt from
> `TDD-COVERAGE.md`, meaning the slice would ship with genuinely zero new unit tests (the same
> disqualifying reason `mark-read` was deprioritized two runs ago). **Shipped (production, all
> `apps/android`)**: `ChatViewModel` gains an optional `DRAFT_ARG` (`"draft"`) nav argument —
> `initialDraft` reads it from `SavedStateHandle`, decodes it (`java.net.URLDecoder`, NOT
> `android.net.Uri.decode` — see `NOTES.md` for why), and seeds the composer's INITIAL `_state`
> value directly. **Zero new precedence logic needed**: the already-existing, already-tested
> `DraftAutosave.restore(stored, currentDraft, isEditing)` guard (`currentDraft.isNotBlank() ->
> null`, i.e. "never clobber a non-empty composer") already refuses to overwrite a seeded value —
> a nav-arg-provided draft naturally wins over a stale persisted one with no new decision branch,
> reusing the existing SSOT exactly as designed rather than adding a parallel precedence rule.
> New deep-link pattern `Routes.CONVERSATION_DRAFT_DEEP_LINK`
> (`meeshy://conversation/{id}?draft={draft}`) added alongside (not replacing) the 4 existing
> conversation deep links — a genuinely new shape for this codebase (first `?query={arg}` deep
> link pattern; the `navArgument(... nullable = true; defaultValue = null)` optional-arg mechanism
> itself is an established precedent, e.g. `CallRoute`'s own optional args). **+6 new tests**
> (`ChatViewModelTest`: seeds the composer immediately from the nav arg; a nav-arg draft takes
> priority over a stale persisted draft; a blank/absent nav arg never blocks the persisted-draft
> restore, matches the existing `a_stored_reply_draft_re_arms_the_reply_when_the_conversation_
> opens` regression baseline unchanged; a percent-encoded arg decodes correctly; a malformed
> percent sequence — e.g. a literal `%` with no following hex digits — falls back to the raw text
> instead of crashing, a real robustness concern since this text ultimately originates from an
> external, not-fully-trusted URI). **Mutation-proven**, two axes: neutralizing the seed
> (`draft = initialDraft.orEmpty()` → `draft = ""`) fails **exactly** the 3 seeding-focused tests
> (8 others green); neutralizing the decode call (`URLDecoder.decode(...)` → the raw undecoded
> string) fails **exactly** the percent-encoding test (10 others green). Both applied via a
> scratch `cp`-backed edit (never `git checkout --`), restored via `cp`, diffed clean against the
> backup afterward. **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970
> tasks, matching every prior slice — no build-graph regression; zero test failures across every
> module's XML reports). Reviewer **PASS** (diff `apps/android` only, confirmed via `git status
> --short` — `MeeshyApp.kt` + `ChatViewModel.kt` + its test, 3 files; SDK purity — N/A here, this
> is app-side navigation/ViewModel wiring, correctly in `:app`/`:feature:chat`, no SDK boundary
> crossed; SSOT — reuses `DraftAutosave.restore`'s existing idle guard verbatim, zero
> re-implementation of precedence logic; no coverage floor lowered; no tautological tests). **Not
> attempted this run** (compile+test-only per the local JVM gate; the new `?draft=` deep-link
> QUERY PARAM pattern itself — as opposed to the ViewModel-level wiring, which IS unit tested — has
> no local precedent in this codebase and was not on-device verified; a future run should
> install-and-verify that tapping a real `meeshy://conversation/{id}?draft=...` URI actually seeds
> the composer, not just that the ViewModel behaves correctly given a populated `SavedStateHandle`).
> **Next slice candidates (not attempted this run)**: the Quick Reply widget itself (Glance, canned
> reply chips — 👍/OK/Thanks!/Call me, mirroring iOS's OWN button set even though iOS's wiring is
> dead — deep-linking via the now-real `CONVERSATION_DRAFT_DEEP_LINK`, prefilling but NOT
> auto-sending, matching the "opens the conversation with the reply ready to confirm" posture
> rather than a blind background send from a cold widget process); Google Assistant App Actions
> (`shortcuts.xml`) for the voice-triggered half of the shortcuts epic — needs external Assistant
> indexing/review, still a larger, non-locally-verifiable follow-up; the mark-read widget action
> (still deprioritized — thin glue, low test value); a presence-cache foundation for conversation
> participants; on-device transcription for the Feed audio composer; Voice-cloning onboarding
> wizard; map/search/reverse-geocoding for the location attachment; PiP (calls + media) — per the
> orchestrator's guidance this remains a documented, real, multi-slice-epic gap warranting a
> planning/decomposition pass rather than a bare re-grep.

> On 2026-08-11 **dynamic launcher shortcuts landed** (slice `dynamic-launcher-shortcuts`,
> feature-parity §"App Actions / dynamic shortcuts" — the prior widget slice's own "Quick reply
> widget" candidate was investigated first and DISQUALIFIED this run, see below; this slice was
> picked instead after that investigation surfaced it). **RE-PROUVEN before starting**:
> `git branch -r`/`gh pr list --state open --search "apps/android OR apps/ios"` found no
> interrupted run (3 open PRs, `#2846`/`#2848`/`#2849`, all unrelated concurrent sessions —
> `apps/web`/`apps/ios calls`/`apps/web`, none matching this routine's branch naming). **A real
> finding that changed this run's plan**: investigated "Quick reply widget" (the top "next slice"
> candidate from the prior entry) by reading iOS's `MeeshyWidgets.swift` `QuickReplyWidgetView`/
> `QuickReplyButton` in full — its 4 canned-reply buttons deep-link via
> `meeshy://quickreply/{id}?text=...`, but `grep`ping the ENTIRE iOS app
> (`DeepLinkRouter.swift`'s full `switch` over recognized hosts) found **no `quickreply` case
> anywhere** — iOS's own Quick Reply widget is dead/decorative in production today: tapping any of
> the 4 buttons opens the app via an unhandled URL host with no defined fallback behavior. The
> SAME grep also confirmed the `meeshy://contact/{id}` host `FavoriteContactsWidget` uses on iOS is
> equally unhandled — retroactively validating this routine's own earlier choice (prior slice) to
> reuse `meeshy://conversation/{id}` on Android instead of inventing a matching `contact` host.
> Porting Quick Reply faithfully would have replicated iOS's bug rather than shipped real value;
> building a genuinely working version needs a new prefill-draft mechanism in the chat composer
> (no `initialDraft`/`prefillText` nav-arg exists anywhere in `:feature:chat` today, confirmed by
> grep) — real, moderate scope, explicitly NOT attempted this run; logged as its own right-sized
> future slice rather than either faking it or quietly skipping the finding. Pivoted instead to
> "App Actions / dynamic shortcuts" from the same candidate list, and further narrowed IT after
> reading iOS's `MeeshyAppIntents.swift` (431 lines) in full: iOS's `MeeshyAppShortcuts` bundles 5
> Siri/`AppIntents` phrases (Send Message, Call Contact, Translate, Open Recent Conversation, Check
> Notifications) — 4 of which need Siri's own natural-language contact/parameter resolution with no
> direct Android equivalent, while Android's own nearest analogue for VOICE triggering (Google
> Assistant "App Actions" via `shortcuts.xml` capability bindings) needs external Assistant
> indexing/review and isn't reliably locally verifiable in this environment. Scoped this run to
> just the always-local, fully-testable slice of the epic: dynamic launcher shortcuts (long-press
> the launcher icon), Android's closest equivalent to iOS's simplest intent,
> `OpenRecentConversationIntent`. **Shipped (production, all `apps/android`)**: new
> `DynamicShortcutsPresentation` (`:app/shortcuts`, pure) sorts cached conversations pinned-first
> then by `ConversationRowTime.epochMillis` descending (the exact ordering SSOT the two prior
> widget slices already established and validated), caps at a caller-supplied `maxCount` (clamped
> to ≥0 — a negative value, defensive against any future caller misuse, never crashes), and maps
> each row via the existing `ApiConversation.displayTitle()` SSOT — zero re-implementation, third
> reuse of the exact pattern (`*Presentation.from()`) this app's home-screen widgets already
> established twice. `DynamicShortcutsPublisher` (`:app/shortcuts`, thin Android glue) reads the
> device's own real max via `ShortcutManagerCompat.getMaxShortcutCountPerActivity(context)` (never
> a hardcoded guess — OEM launchers vary), builds one `ShortcutInfoCompat` per row (app-icon
> `IconCompat`, `meeshy://conversation/{id}` intent — reuses the identical deep-link construction
> pattern both widgets already use, matched by the same pre-existing `navDeepLink`), and calls
> `ShortcutManagerCompat.setDynamicShortcuts(...)` (a full-replace call, not an add — so a stale
> shortcut for a since-deleted/renamed conversation self-corrects on the very next publish with no
> dedicated cleanup logic needed). `MainActivity` gains two `@Inject` fields
> (`ConversationRepository`, `SessionRepository` — both already `@Singleton`-scoped, no new DI
> wiring) and a new `onResume()` override that launches a `lifecycleScope` coroutine to publish —
> a plain, cheap, idempotent one-shot Room read (no network, no polling loop, matches the "Instant
> App" cache-first principle) rather than a dedicated live-update hook into the conversation list's
> own sync pipeline (deliberately narrower than a "live" system, exactly mirroring both widgets'
> own "static/OS-or-lifecycle-triggered refresh only" precedent). **+9 new tests**
> (`DynamicShortcutsPresentationTest`: empty list, direct-conversation other-participant name,
> group-conversation own title, pinned-before-recent ordering, recency ordering among unpinned, cap
> respected, a zero max count (rate-limited device) yields no shortcuts, a negative max count is
> clamped rather than crashing, shortcut id matches conversation id). **Mutation-proven**, two axes:
> neutralizing the recency sort key (`ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE` →
> `0L`) fails **exactly** `among unpinned conversations, the most recently active sorts first` (8
> others green); neutralizing the cap clamp (`maxCount.coerceAtLeast(0)` → `Int.MAX_VALUE`) fails
> **exactly** the 3 cap-focused tests (`the presentation caps at the device-reported max count`,
> `a max count of zero...resolves to no shortcuts`, `a negative max count is treated as zero...`; 6
> others green). Both applied via a scratch `cp`-backed edit (never `git checkout --`), restored via
> `cp`, diffed clean against the backup afterward. **Gate**: `./apps/android/meeshy.sh check` →
> **`BUILD SUCCESSFUL`** (970 tasks, matching every prior slice — no build-graph regression; zero
> test failures across every module's XML reports). Reviewer **PASS** (diff `apps/android` only,
> confirmed via `git status --short` — `MainActivity.kt` + 2 new files under `:app/shortcuts` +
> their test; SDK purity — the pure ordering/cap/map decision lives in `:app/shortcuts` (correctly,
> per the grain test: a product decision, not a reusable atom — mirrors both sibling widgets'
> precedent exactly), the `ShortcutManagerCompat` glue is exempt framework code; SSOT — reuses
> `displayTitle`/`ConversationRowTime`/`ConversationRepository.cachedConversations`/
> `SessionRepository.currentUserId`, zero re-implementation; no coverage floor lowered; no
> tautological tests). **Not attempted this run** (compile+test-only per the local JVM gate; no
> simulator/emulator session for on-device verification — a future run should install-and-verify
> that a real long-press on the launcher icon shows the shortcuts, correctly ordered, and that
> tapping one opens the right conversation). **Next slice candidates (not attempted this run)**: a
> chat-composer prefill-draft mechanism (would unlock a GENUINELY working Quick Reply widget, since
> iOS's own is confirmed dead — a real opportunity to exceed iOS parity, not just match it); Google
> Assistant App Actions (`shortcuts.xml` capability bindings) for the voice-triggered half of this
> same epic — needs external Assistant indexing/review, flagged as its own larger follow-up rather
> than a right-sized single slice; the mark-read widget action (still deprioritized — thin glue,
> low test value, see two runs ago); a presence-cache foundation for conversation participants; on-
> device transcription for the Feed audio composer; a shared `:sdk-ui` `LanguagePickerDialog`;
> Voice-cloning onboarding wizard; map/search/reverse-geocoding for the location attachment; PiP
> (calls + media) — per the orchestrator's guidance this remains a documented, real, multi-slice-
> epic gap warranting a planning/decomposition pass rather than a bare re-grep.

> On 2026-08-11 **home-screen widgets' third sub-slice landed**: `FavoriteContactsWidget`
> (slice `widget-favorite-contacts`, feature-parity §"Home-screen widgets" — picked from the
> prior slice's own explicit "Next slice candidates" list, per the orchestrator's standing
> guidance). **RE-PROUVEN before starting**: `git branch -r`/`gh pr list --state open --search
> "apps/android OR apps/ios"` found no interrupted run of this routine — the sole open PR
> (`#2846`) is an unrelated concurrent session on `apps/web`. Confirmed the prior run's own
> "widget-recent-conversations" PR (`#2841`) had in fact already merged and finished CI while its
> session ended (matches the documented "itérations 25, 29, 37, 38" recovery pattern exactly) —
> finalized it first (squash-merged, `tasks/lane-cursor.md` pushed as its own dedicated commit,
> stale remote branch deleted) before picking this new slice, rather than starting fresh work on
> top of an unfinished prior run. Read iOS's `WidgetDataManager.publishFavoriteContacts` +
> `MeeshyWidgets.FavoriteContactsWidget`/`FavoriteContactsProvider` before coding: a "favorite
> contact" on iOS is **not a distinct concept** — it's `conversations.filter { isPinned &&
> type == .direct }.prefix(8)`, mapped to `id`/`name`/`avatar`/`status` (`lastSeenText` or
> `"Offline"`)/`accentColor`. **Shipped (production, all `apps/android`)**: new
> `FavoriteContactsWidgetPresentation` (`:app/widget`, pure — same placement precedent as its two
> siblings) filters `resolvedPreferences?.isPinned == true && type in directConversationTypes`,
> sorts by `ConversationRowTime.epochMillis` descending (reused, not reimplemented — matches the
> recency ordering `RecentConversationsWidgetPresentation` already applies, and mirrors iOS's own
> implicit reliance on an already-recency-ordered upstream list), caps at 8 (iOS's own
> `.prefix(8)`), and maps each row via the same two existing SSOTs the sibling widget uses
> (`ApiConversation.displayTitle()`, `ApiConversation.accentHex()`). `directConversationTypes`
> (previously `private` in `RecentConversationsWidgetPresentation.kt`) is now `internal` and
> imported here — a one-line hoist, not a duplication, since it is a correctness-sensitive
> business rule ("what counts as a 1:1 chat") shared by two call sites now, not disposable UI
> glue. `FavoriteContactsWidget` (Glance `LazyColumn`, up to 8 rows, an accent-colored
> initial-letter avatar circle per row) reads the same Room-only
> `ConversationRepository.cachedConversations()` + persisted `TokenStore.userId` the
> `RecentConversationsWidget` already reads via the shared `WidgetEntryPoint` — no new Hilt
> plumbing needed, both existing accessors were already exposed. Tapping a row deep-links via the
> already-wired `meeshy://conversation/{id}` (`Routes.CONVERSATION_SINGULAR_DEEP_LINK`) rather
> than inventing an Android equivalent of iOS's own `meeshy://contact/{id}` route (which doesn't
> exist on this platform and whose only real payload, even on iOS, is the same conversation id) —
> a deliberate, documented parity decision, not a scope gap: opening the chat directly is at least
> as good UX as opening a contact profile for what is, underneath, a favorite chat partner.
> **A real, documented gap found and left open, not silently worked around**: Android's
> `ApiConversation.participants` (`ApiParticipant`) carries no `isOnline`/`lastActiveAt` fields at
> all — unlike iOS's `MeeshyConversation.lastSeenText`, there is currently no data source this
> widget could read synchronously to render a presence status line/badge without adding a new
> presence-cache dependency; the row therefore omits the online/offline indicator iOS's own face
> shows, an explicit scope cut rather than a fabricated fallback. **+8 new tests**
> (`FavoriteContactsWidgetPresentationTest`: empty list, other-participant-name resolution, an
> unpinned direct conversation excluded, a pinned group conversation excluded, a mix of favorites
> and non-favorites keeping only the true favorites, recency ordering, the 8-row cap, accent-color
> passthrough). **Mutation-proven**, two axes: neutralizing the pinned+direct filter
> (`.filter { it.resolvedPreferences?.isPinned == true && ... }` → `.filter { true }`) fails
> **exactly** the 3 exclusion-focused tests (`an unpinned direct conversation is not a favorite`,
> `a pinned group conversation is not a favorite contact`, `a mix of favorites and non-favorites
> keeps only the favorites`; 5 others green); neutralizing the recency sort key
> (`ConversationRowTime.epochMillis(it) ?: Long.MIN_VALUE` → `0L`) fails **exactly** `among
> favorites, the most recently active sorts first` (7 others green). Both applied via a scratch
> `cp`-backed edit (never `git checkout --`), restored via `cp`, diffed clean against the backup
> afterward. **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks,
> matching every prior slice — no build-graph regression; zero test failures across every
> module's XML reports, `grep -L 'failures="0"'` empty). Reviewer **PASS** (diff `apps/android`
> only, confirmed via `git status --short` — 10 files, all under `apps/android`; SDK purity — the
> pure filter/sort/cap/map decision lives in `:app/widget` (correctly, per the grain test: a
> product decision, not a reusable atom — mirrors both sibling widgets' own precedent exactly);
> SSOT — reuses `displayTitle`/`accentHex`/`ConversationRowTime`/`cachedConversations`/
> `WidgetEntryPoint`/`directConversationTypes` (hoisted, not duplicated), zero re-implementation;
> no coverage floor lowered; no tautological tests). **Not attempted this run** (compile+test-only
> per the local JVM gate; no simulator/emulator session for on-device verification — a future run
> should install-and-verify against the live gateway with the shared `atabeth` account, confirming
> a real pinned direct conversation renders as a favorite row and a pinned group does not). **Next
> slice candidates (not attempted this run)**: Quick reply widget (still zero-hit — likely the
> hardest of the four, Glance's interactive-input story for a text field inside a widget needs its
> own investigation); the mark-read widget action (plumbing confirmed present via `javap` in the
> prior slice, `ActionCallback`/`actionRunCallback` — genuinely thin glue with almost no new pure
> decision logic to TDD beyond the already-tested `isUnread` gate, worth reconsidering only once a
> presence-cache foundation or another action-callback use case makes the "first ActionCallback in
> this app" investment pay off across more than one call site); a presence-cache foundation for
> conversation participants (would unlock the favorite-contacts status badge AND several other
> gaps at once — worth a dedicated foundation slice rather than bolting a one-off presence read
> onto this widget); on-device transcription for the Feed audio composer; a shared `:sdk-ui`
> `LanguagePickerDialog`; Voice-cloning onboarding wizard; map/search/reverse-geocoding for the
> location attachment; PiP (calls + media) — per the orchestrator's guidance this remains a
> documented, real, multi-slice-epic gap warranting a planning/decomposition pass rather than a
> bare re-grep.

> On 2026-08-11 **home-screen widgets' second sub-slice landed**: `RecentConversationsWidget`
> (slice `widget-recent-conversations`, feature-parity §"Home-screen widgets" — RE-PROUVEN via the
> orchestrator's explicit candidate list: "sous-tranches suivantes du widget écran d'accueil").
> **RE-PROUVEN before starting**: `git branch -r`/`gh pr list --state open` found no interrupted
> run of this routine — the one open PR (`#2835`, `claude/keen-hamilton-lvgpqw`) is an unrelated
> concurrent session on `apps/ios` (naming doesn't match this routine, CI still running at scan
> time). Re-read the actual widget code from the prior slice (`UnreadCountWidget.kt`,
> `UnreadWidgetEntryPoint.kt`) rather than trusting the note: confirmed only the unread-count face
> exists (`grep`-confirmed zero `RecentConversations`/`FavoriteContacts`/`QuickReply` widget files),
> matching the prior run's own "Restent" list. Read iOS's `MeeshyWidgets.swift` (all 4 widgets) +
> `WidgetDataManager.swift` end to end before coding — the ordering rule (`isPinned` first, then
> `lastMessageAt` descending, `.reversed()` composition) and the sender-prefix rule
> (`formatLastMessage`: `"\(sender): \(preview)"` only when `type != .direct`) both come directly
> from there, not invented. **Shipped (production, all `apps/android`)**: new
> `RecentConversationsWidgetPresentation` (`:app/widget`, pure — mirrors the `UnreadWidgetPresentation`
> precedent's placement, a product decision not a reusable atom) sorts cached conversations
> pinned-first then by `ConversationRowTime.epochMillis` (existing `:feature:conversations` SSOT,
> reused not reimplemented), caps at 5, and maps each row via **three existing SSOTs**:
> `ApiConversation.displayTitle()` (`:sdk-core/theme`), `ApiConversation.accentHex()`
> (`:sdk-core/theme` — satisfies root `CLAUDE.md`'s "every conversation-context component uses
> accentColor" rule), and `lastMessagePreview()` (`:feature:conversations`, string resources reused
> via `me.meeshy.feature.conversations.R` — zero re-implementation of the photo/video/voice/file/
> location/sender-prefix labels). `RecentConversationsWidget` (Glance `LazyColumn`, up to 5 rows,
> a small accent-hex color chip per row, bold title when unread) reads the same Room-only
> `ConversationRepository.cachedConversations()` the unread-count widget already reads (no
> network, renders instantly from cache even offline). Tapping a row launches an explicit
> `Intent(ACTION_VIEW, "meeshy://conversation/{id}", context, MainActivity::class.java)` via
> `androidx.glance.appwidget.action.actionStartActivity(Intent)` (a DIFFERENT overload than the
> base `androidx.glance.action.actionStartActivity<T>()` the empty state still uses — verified via
> `javap` on the Glance 1.1.1 jars in `~/.gradle/caches` before writing any code, since the base
> package has no `Intent`-accepting overload at all) — matched by the app's own pre-existing
> `Routes.CONVERSATION_SINGULAR_DEEP_LINK` `navDeepLink` (Navigation-Compose 2.8.3's automatic
> Activity-intent deep-link consumption, confirmed via `libs.versions.toml` + the absence of any
> manual `handleDeepLink()` call — this Navigation version wires it automatically). **A genuine
> foundation gap found and closed en route**: resolving a direct conversation's *other* participant
> needs the current user's id, but `SessionRepository.currentUserId` is in-memory only, populated
> exclusively by the app's normal startup flow (`AuthRepository.restoreSession()` from
> `MainActivity`/a ViewModel) — a `GlanceAppWidgetReceiver`-triggered cold process never runs that
> flow, so it would have silently read `null` most of the time (misattributing "the other
> participant" whenever the signed-in user happens to sort first in `participants`). Added
> `TokenStore.userId: String?` (`:core:network`, same shape as the existing `jwt`/`sessionToken`
> fields, persisted via the same `EncryptedSharedPreferences` — `EncryptedTokenStore.clear()`
> already wiped it for free since it clears the whole prefs file), written by
> `SessionRepository.adopt()`/`.refresh()` alongside the in-memory publish, cleared by `.clear()`.
> The widget's shared `WidgetEntryPoint` (renamed from `UnreadWidgetEntryPoint` — it now serves
> both widgets, `git mv` preserved history) exposes `tokenStore()` alongside
> `conversationRepository()`. **+16 new tests** (12 `RecentConversationsWidgetPresentationTest`:
> empty list, other-participant-name resolution, direct-vs-group sender prefix incl. the "vous"
> label, unread true/false, pinned-before-recent ordering, recency ordering among unpinned, the
> 5-row cap, accent-color passthrough, no-last-message fallback; 4 new `SessionRepositoryTest`
> cases covering `adopt`/`clear`/`refresh` persisting-or-clearing `tokenStore.userId`).
> **Mutation-proven**, two axes on the new presentation logic: neutralizing the pinned-first sort
> key (`it.resolvedPreferences?.isPinned == true` → `false`) fails **exactly**
> `a pinned conversation sorts before a more recently active unpinned one` (11 others green);
> neutralizing the sender-prefix gate (`!in directConversationTypes` → `true`) fails **exactly**
> `a direct conversation's preview carries no sender prefix` (11 others green). Both applied via a
> scratch `cp`-backed edit (never `git checkout --`), restored via `cp`, diffed clean against the
> backup afterward. **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks,
> matching every prior slice — no build-graph regression; zero test failures across every module,
> confirmed via `grep -rL 'failures="0"'` over every touched module's XML reports). Reviewer
> **PASS** (diff `apps/android` only, confirmed via `git diff --stat origin/main` — 16 files, all
> under `apps/android`; SDK purity — the pure ordering/mapping decision lives in `:app/widget`
> (correctly, per the grain test: it's a product decision, not a reusable atom — mirrors the
> `UnreadWidgetPresentation` precedent exactly), `TokenStore.userId` is a passive persisted field
> with zero "when to do X" logic (an atom, correctly in `:core:network`); SSOT — reuses
> `displayTitle`/`accentHex`/`lastMessagePreview`/`ConversationRowTime`/`cachedConversations`, zero
> re-implementation; no coverage floor lowered; no tautological tests). **Not attempted this run**
> (compile+test-only per the local JVM gate; no simulator/emulator session for on-device
> verification against the live gateway and a real signed-in `TokenStore.userId` — a future run
> should install-and-verify with the shared `atabeth` account, confirming a real direct
> conversation's row shows the CONTACT's name and a group row shows the correct sender prefix on a
> genuine cold-process widget update, not just the unit-tested decision). **Deliberate, documented
> scope cut**: no mark-read quick action yet (iOS's `MarkConversationReadIntent` uses
> `AppIntent`/`Button(intent:)`; the Android equivalent is Glance's `actionRunCallback` +
> `ActionCallback` — confirmed present in the Glance 1.1.1 API via the same `javap` pass, so the
> plumbing exists, but wiring the first `ActionCallback` in this app is its own increment, not
> bundled into a widget that already touched `TokenStore`/`SessionRepository`); no push-refresh on
> data change (still the standing `WidgetCenter.reloadAllTimelines()`-equivalent gap, shared with
> `UnreadCountWidget`); only one resizable face (iOS ships 3 explicit `WidgetFamily` layouts —
> Android's continuous resize was judged sufficient parity for a first pass, matching the existing
> `UnreadCountWidget`'s own single-face precedent). **Next slice candidates (not attempted this
> run)**: Favorite contacts / Quick reply widgets (both still zero-hit); the mark-read widget
> action just scoped above; on-device transcription for the Feed audio composer (still the
> standing candidate); a shared `:sdk-ui` `LanguagePickerDialog`; Voice-cloning onboarding wizard;
> map/search/reverse-geocoding for the location attachment; PiP (calls + media) — per the
> orchestrator's guidance this remains a documented, real, multi-slice-epic gap warranting a
> planning/decomposition pass rather than a bare re-grep (last re-confirmed zero-hit iteration
> 44/45, not re-checked again this run).

> On 2026-08-11 **Contacts-list mood-emoji presence landed** (slice
> `contacts-mood-emoji-presence`, feature-parity §J — a broad-sweep find, per the orchestrator's
> "continue the broad sweep of `feature-parity.md`" guidance). **RE-PROUVEN before starting**:
> `git branch -r`/`gh pr list --state open` found no interrupted run of this routine (zero open
> PRs, no branch with recent commits/activity — every `origin/claude/apps/*` branch is stale, oldest
> observed 2026-07-10, none within 24h). Re-read the actual §J "Contacts list" bullet's own
> "**Pending:** mood-emoji presence" note against the real code, not just the note: grepped
> `moodEmoji` across `apps/android/feature/contacts` — genuinely zero hits, all 4
> `MeeshyAvatar(...)` call sites (`ContactsListTab`, `ContactsScreen`, `DiscoverTab`, `BlockedTab`)
> never pass it. **The twist**: `MeeshyAvatar` (`:sdk-ui`) already renders a full `moodEmoji: String?`
> badge (bottom-end overlay, mutually exclusive with the presence dot) — it shipped with the avatar
> atom itself at some earlier, undocumented point, just never fed a real value from any contacts
> surface. So this slice is purely the missing **orchestration wire** (which screen decides *which*
> mood to show), not a new UI atom — exactly the SDK-purity grain test in root `CLAUDE.md`: the atom
> was already SDK-side, the "when/which" decision was the actual gap, and that decision is app-side.
> Read iOS `ContactsListTab.swift` (`statusViewModel.statusForUser(userId:)?.moodEmoji` fed into
> `MeeshyAvatar`) and `StatusViewModel.statusForUser` (`statuses.first { $0.userId == userId }`)
> before coding. **Shipped (production, all `apps/android`)**: new pure
> `List<StatusEntry>.statusForUser(userId) → StatusEntry?` (`:sdk-core/status/StatusMapper.kt`,
> exact port of the iOS lookup, sits next to the existing `orderedForBar` SSOT) backs a new
> `ContactsListUiState.moodEmojiFor(userId) → String?` (blank-guarded, defense-in-depth even though
> `StatusMapper.toStatusEntry()` already structurally guarantees a non-blank `moodEmoji` at
> creation). `ContactsListViewModel` gains a `StatusBarCache` dependency — **reused, not
> reimplemented**: it's the same `:sdk-core` singleton the Feed status bar already populates as its
> L1 in-memory cache — and reads its **FRIENDS**-mode snapshot synchronously in `load()`, no
> dedicated network fetch of its own. `valueOrNull` (existing `CacheResult` SSOT, precedent:
> `CategoryRepository`) collapses Fresh/Stale/Syncing uniformly since a decorative avatar badge
> doesn't need a freshness distinction; a cold/never-loaded cache just means no badges paint yet —
> exactly iOS's own behaviour before its Feed status bar has ever loaded (no popup, no error, the
> row simply renders without the badge). +9 tests (4 `StatusMapperTest`: found/absent/empty-list/
> first-of-duplicates; 5 `ContactsListViewModelTest`: pure state blank-guard, live emoji painted
> from the FRIENDS cache on load, no emoji for a friend with no live status, and — the one genuinely
> risky wiring detail — the DISCOVER-mode cache never leaking into a Contacts row). **Mutation-
> proven**, two axes: dropping `moodEmojiFor`'s `.takeIf { it.isNotBlank() }` guard fails **exactly**
> the pure state test `moodEmojiFor resolves the live mood emoji from moodStatuses` (21 others
> green); swapping the cache read from `StatusFeedMode.FRIENDS` to `.DISCOVER` fails **exactly** the
> two mode-scoped tests (`a friend with a live status paints...` + `the DISCOVER status cache never
> leaks...`, 19 others green). Both applied via a scratch `cp`-backed edit (never `git checkout --`),
> restored via `cp`, diffed clean against the backup afterward. **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, matching every prior slice —
> no build-graph regression). Reviewer **PASS** (diff `apps/android` only, confirmed via
> `git diff --stat origin/main` — 5 files, `feature/contacts` + `sdk-core/status` only; SDK purity —
> the pure lookup lives in `:sdk-core`, the injected `StatusBarCache` singleton is consumed not
> reimplemented, all "which mode / when to read" orchestration stays app-side in the
> `:feature:contacts` ViewModel; SSOT — reuses `MeeshyAvatar`'s existing badge slot, `StatusBarCache`,
> `valueOrNull`, zero re-implementation; no coverage floor lowered; no tautological tests). **Not
> attempted this run** (compile+test-only per the local JVM gate; no simulator/emulator session for
> on-device verification — a future run should install-and-verify against the live gateway with the
> shared `atabeth` account, confirming a real friend's live mood status renders on their Contacts
> avatar). **Deliberate, documented scope cut**: only the Contacts tab is wired (the checklist bullet
> this closes is specifically "Contacts list"); Discover/Requests/Blocked tabs' `MeeshyAvatar(...)`
> call sites still pass no `moodEmoji` — a natural, small follow-up (same pattern, Discover would read
> the **DISCOVER**-mode cache, not FRIENDS). No cross-screen reactivity: a mood set/cleared while
> Contacts is already open only shows up on the next `load()` (pull-to-retry or re-entry), never live
> via a socket/Flow — matches the "best-effort decoration, not primary content" scope; iOS itself has
> no dedicated live-update wiring into this specific row either. **Housekeeping still outstanding,
> not actioned this run**: `NOTES.md` remains ~1650 lines, over the ~1500-line hygiene threshold —
> still needs its own dedicated archive commit (never bundled with a slice) on a future run; flagged
> again at the prior run and not yet picked up. **This very entry now also pushes `PROGRESS.md`
> itself just past ~1500 lines** — the next run (any lane) should open a dedicated
> `chore(tasks): archive PROGRESS.md` increment (keep the ~300 newest lines, move the rest to
> `PROGRESS-archive-2026-08.md`) before or alongside the `NOTES.md` archive, never bundled with a
> slice/item commit. **Next slice candidates (not attempted this run)**:
> the Discover/Requests/Blocked mood-emoji follow-up just noted above; on-device transcription for
> the Feed audio composer (still the standing candidate, needs its own foundation — parallel
> `AudioRecord` PCM capture or a post-hoc `MediaCodec` AAC→PCM decode, since the composer currently
> records MPEG_4/AAC not raw PCM); a shared `:sdk-ui` `LanguagePickerDialog` (3 near-identical picker
> UIs still exist); Voice-cloning onboarding wizard / voice-profile management (§K, both still
> unshipped); map/search/reverse-geocoding for the location attachment; **widgets/PiP categorical
> re-check, re-confirmed zero-hit this run too**: `grep -rli "glanceappwidget\|appwidgetprovider"` and
> `grep -rli "picture-in-picture\|pictureinpicture\|enterPip\|PipParams"` across all of `apps/android`
> both return **zero** matches (Q. Cross-cutting infrastructure already carries the explicit
> `- [ ] Home-screen widgets (...)` line from the iteration-19 audit-gap fix; PiP only has the H.
> Calls section's partial `- [~] Call states: ... PiP / floating call pill` line, not a standalone
> entry). This remains a real, planned, multi-slice-epic gap — not a missing checklist line, not a
> false "next slice" note — needing its own concrete sub-slice decomposition pass (e.g. a minimal
> static `GlanceAppWidget` scaffold as the first foundation slice) before it can be picked up as a
> right-sized single-run slice; documented here again explicitly per the orchestrator's standing
> guidance rather than re-grepped-and-dropped silently.

> On 2026-08-11 **the hard-press conversation preview popover landed** (slice
> `conversation-hardpress-preview`, feature-parity §B — a genuine gap RE-PROUVEN, not just
> re-copied from the note, via a broad sweep of `feature-parity.md`'s ~136 unchecked boxes per the
> orchestrator's explicit "continue the broad sweep" guidance). **RE-PROUVEN before starting**:
> `git branch -r`/`gh pr list --state open` found no interrupted run of this routine (only two
> unrelated open web PRs, `#2810`/`#2811`, both `apps/web` and already merged into `origin/main` by
> the time this run finished — origin/main advanced under this run purely from other concurrent
> sessions, confirmed via `git status --short` showing only `apps/android` files touched, never via
> the noisier `git diff origin/main` two-dot form which conflates "your branch is behind" with
> "your branch changed something"; `git diff origin/main...HEAD` or plain `git status` is the
> correct check in this multi-worktree repo where `refs/remotes/origin/main` is shared across every
> worktree and can move mid-run from an unrelated session's fetch). Read iOS's
> `ConversationPreviewView` (`ConversationListHelpers.swift`) closely before coding: a header
> (avatar/title/member-count/pin+mute badges/action buttons) plus a scroll of the last 5 cached
> messages rendered as real, non-interactive `ThemedMessageBubble`s, shown via native
> `.contextMenu(menuItems:preview:)` ABOVE the action menu on long-press; messages are loaded once
> per row into `ConversationListViewModel.previewMessages[id]` (cache-first via
> `CacheCoordinator.shared.messages.load`, `Array(data.suffix(5))`, background-refresh on
> stale/empty). **Shipped (production, all `apps/android`)**: new `MessageDao.recentForConversation`
> (`ORDER BY createdAt DESC LIMIT :limit`, a genuinely new bounded query — the existing
> `listForConversation` loads a conversation's ENTIRE history unbounded, wasteful for a "last 5"
> peek on an actively-used thread) → `MessageRepository.recentMessages(conversationId, limit=5)`, a
> cache-ONLY read (no `messagesStream`/SWR machinery, no background revalidate — deliberately
> narrower than iOS's own background-refresh half: a peek the user might dismiss in under a second
> should never spawn unbounded background sync work). Shared the entity→domain decode step
> (`MessageEntity.toLocalMessage()`, `:sdk-core`) between this new method and the existing
> `MessageCacheSource.observe()`, removing the prior duplication rather than adding a third copy.
> `ConversationListViewModel` gains `previewMessages: Map<String, List<LocalMessage>>` state +
> `loadPreviewMessages(id)` (double-load guard via a `containsKey` + in-flight `Set` check, mirrors
> iOS's `previewMessages[id] == nil && !previewLoadingInFlight.contains`) + `currentUser: MeeshyUser?`
> alongside the existing `currentUserId` (so the preview card can resolve the Prisme Linguistique —
> `MeeshyUser` already implements `ContentLanguagePreferences` — without a second session read at
> render time). New pure `previewLines()` (`:feature:conversations`) reuses `lastMessagePreview`
> (the row's own last-message formatter) verbatim per message via a small `ApiMessage →
> ApiConversationLastMessage` adapter feeding `message.displayContent(prefs)` — the SAME Prisme
> resolution the row's own preview line already gets, never `translations.first()`, per root
> `CLAUDE.md`'s explicit "le prisme s'applique... aux previews" rule. `combinedClickable`'s
> `onLongClick` now fires `onLoadPreview()` before opening the menu; `ConversationContextMenu`'s
> `DropdownMenu` gained a new `ConversationPreviewCard` (title + pin/mute badges + up to 5 message
> lines, or a loading/empty label) as its FIRST child, `HorizontalDivider()`, then the pre-existing
> action items — mirrors iOS's preview-above-menu shape without needing a custom `Popup` (Compose's
> `DropdownMenu` content lambda already accepts arbitrary composables, not just
> `DropdownMenuItem`s). +19 new tests (3 `MessageDaoTest`: newest-first ordering scoped to the
> conversation, limit respected, unknown-conversation empty; 4 `MessageRepositoryTest`: chronological
> order, zero network calls, cold-cache empty, local send-state passthrough; 8
> `ConversationPreviewMessagesTest`: empty list, ordering, sender prefix, "vous" label, media-type
> fallback, Prisme-preferred-translation-wins, no-match-shows-original, null-prefs-still-resolves-
> Prisme; 4 `ConversationListViewModelTest`: populates on load, never re-queries the same
> conversation twice, doesn't re-query while already in flight, independent per-conversation state).
> **Mutation-proven**, two axes: neutralizing `loadPreviewMessages`'s already-loaded guard (`if
> (_state.value.previewMessages.containsKey(id)) return` → `if (false) return`) fails **exactly**
> `load_preview_messages_never_queries_the_repository_twice_for_the_same_conversation` (41 others
> green); neutralizing `previewLines`'s Prisme call (`message.displayContent(resolved)` →
> `message.content`) fails **exactly** the "Prisme preferred translation wins" + "null preferences
> still resolves Prisme" tests (6 others green) — both applied via a scratch `cp`-backed edit
> (never `git checkout --`), restored via `cp`, diffed clean against the backup afterward. **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, matching every prior slice —
> no build-graph regression). Reviewer **PASS** (diff `apps/android` only, confirmed via
> `git status --short`; SDK purity — the entity decode + bounded query + cache-only repository read
> live in `:sdk-core`/`:core:database` as stateless building blocks, all orchestration [double-load
> guard, state map] and Compose UI glue stay app-side in `:feature:conversations`; SSOT — reuses
> `lastMessagePreview`/`LanguageResolver`/`ApiMessage.displayContent`, zero re-implementation; no
> coverage floor lowered; no tautological tests). **Full on-device verification against the live
> gateway** (`meeshy_pixel8`, real `atabeth` account): hit a genuine, HOST-CONTENTION-caused
> `ActivityManager` ANR mid-verification (load average ~7-8, three concurrent Claude Code sessions
> plus an active Xcode `xctest` run sharing the host with this emulator) — diagnosed via `adb
> logcat`'s `InputDispatcher: … spent Nms processing MotionEvent` lines (proves the SYSTEM was slow
> to *deliver* the touch, not that the app failed to *handle* one already delivered) before
> concluding it was unrelated to the diff; recovered via "Close app" + relaunch once host load
> visibly dropped, zero code changes needed (see `NOTES.md` for the full diagnostic writeup — a
> reusable playbook for the next host-contention false-positive). Once recovered: long-pressed the
> real `Belva Tano` thread (`uiautomator dump` + a grepped `content-desc="Belva Tano"` bounds
> attribute, center-tapped via `input touchscreen swipe x y x y 700`) — the preview card rendered
> the real title plus 5 real cached messages in chronological order (Portuguese content, proving the
> Prisme/decode pipeline round-trips real gateway data, not a fixture), divider, then the unchanged
> Pin/Mute/Mark-as-read/Archive/category-search menu below. Tapped outside to dismiss (clean, no
> crash, returned to the list) then re-opened the SAME row: the card rendered instantly with
> identical content (proves the already-loaded cache-hit guard skips the redundant Room query on a
> real device, not just in the mocked unit test). `adb logcat` checked across the whole session for
> `FATAL EXCEPTION`/`AndroidRuntime` app crashes — none (the one `D AndroidRuntime: Shutting down VM`
> line was normal noise from an earlier `am force-stop`, not a crash). Emulator left idle on the
> conversation list afterward. **Deliberate, documented scope cut**: no member-count line, no
> call/search/info quick-action buttons in the card (iOS's `ConversationPreviewView` has both) —
> the core value (a peek at recent activity before deciding an action) is delivered; the extra chrome
> would need new callback wiring this slice didn't need to touch. **Also inherited, not introduced,
> a pre-existing `lastMessagePreview` quirk**: a mid-list message with blank content and no
> recognized media type falls back to the same "No messages yet" label the row uses for a WHOLE
> empty conversation — seen live on-device on the real `Belva Tano` thread, documented in `NOTES.md`
> rather than fixed here (out of scope: this slice reuses the formatter, not rewrites its fallback
> semantics). **Housekeeping flagged, not actioned this run**: `NOTES.md` is now ~1630 lines, over
> the ~1500-line hygiene threshold — needs its own dedicated archive commit (never bundled with a
> slice) on a future run. **Next slice candidates (not attempted this run)**: on-device transcription
> for the Feed audio composer (still the standing candidate — confirmed via `grep`/websearch this run
> that Android's `RecognizerIntent.EXTRA_AUDIO_SOURCE` genuinely supports feeding a custom PCM audio
> source to `SpeechRecognizer` for on-device recognition, unlike the framework's live-mic-only
> reputation — but the composer currently records `MediaRecorder` MPEG_4/AAC, not raw PCM, so a real
> implementation needs either a parallel `AudioRecord` PCM capture during recording or a post-hoc
> `MediaCodec` AAC→PCM decode step first; right-sized as its own foundation slice, not attempted
> here); a shared `:sdk-ui` `LanguagePickerDialog` (3 near-identical picker UIs still exist); Voice-
> cloning onboarding wizard / voice-profile management (§K, both still unshipped); map/search/
> reverse-geocoding for the location attachment; widgets/PiP — per the orchestrator's standing
> guidance this remains a documented, real gap needing a planning pass, not re-grepped again this
> run (already re-confirmed zero-hit at iteration 44/45).

> On 2026-08-11 **"Change email / phone" landed** (slice `settings-account-contact-change`,
> feature-parity §K — found via the orchestrator's explicit "broad sweep of `feature-parity.md`"
> guidance rather than staying scoped to the Feed composer). **RE-PROUVEN before starting**:
> `git branch -r`/`gh pr list --state open` found no interrupted run of this routine (the one open
> PR, `#2807`, is an unrelated concurrent session on `apps/ios` calls, headRef doesn't match this
> routine's naming). Confirmed the gap for real, not just from the note: `grep`ping
> `changeEmail|verifyEmailChange|changePhone|verifyPhoneChange` across `apps/android` found the
> wire-level plumbing already complete (`UserApi`/`UserRepository`, `UserRequests.kt` DTOs, all
> pre-existing) but **zero** call sites under `feature/` or `app/` — the same "wired but unconsumed"
> shape as the note claimed, now independently confirmed. Read iOS's `SecurityView.swift` (1053
> lines) end to end before coding: email confirms out-of-band (a link mailed to the new address —
> `submitEmailChange()`/`resendEmailVerification()` only; iOS never calls `verifyEmailChange`
> anywhere in production code either, confirmed via grep — only its test mocks reference it, so
> skipping that wire-up on Android is TRUE parity, not a scope cut) with a 60s resend cooldown
> Timer; phone confirms in-app via a 6-digit SMS code (`submitPhoneChange()` → `verifyPhoneCode()`).
> Both sections also expose a "Verify" quick action for an already-set-but-unverified value that
> resubmits without opening the editor first. **Shipped (production, all `apps/android`)**: new
> `AccountContactViewModel`/`AccountContactScreen` (`:feature:settings`), reached via a new
> "Email & phone" Settings row between Two-factor and Active sessions. Reuses
> `SignupFieldValidation.isEmailValidLocally`/`isPhoneValidLocally` (`:core:model`, already the
> registration wizard's SSOT) for the local submit gates — no new validator duplicated. Reuses
> `MagicLinkCountdown` (`:core:model`, previously magic-link-login-only) verbatim for the 60s email
> resend cooldown — same `start`/`tick`/`canResend`/`expired` shape the magic-link flow already
> uses, just a second call site; deliberately did NOT rename/generalize the type for this (only the
> 2nd occurrence — this codebase's established convention is to duplicate small glue until a 3rd
> call site forces a shared abstraction, and `MagicLinkCountdown`'s shape was already fully generic,
> so reusing beat both renaming and reimplementing). Phone code entry filters non-digits +
> truncates to 6 as typed (mirrors iOS's `.adaptiveOnChange` filter), so `canVerifyPhoneCode` is a
> plain length check. Error mapping follows the `TwoFactorErrorKind`/`ChangePasswordError`
> precedent — a fixed per-action `AccountContactErrorKind` the screen localizes (en/fr/es/pt),
> never the gateway's raw English message (`contact-change.ts`'s `sendBadRequest` calls are
> free-text, not structured codes). Verify-phone-code 400 maps to a dedicated "incorrect or expired
> code" message (mirrors iOS's own targeted P1 fix for this exact case), other failures generic.
> On success, `verifyPhoneCode()` calls `SessionRepository.refresh()` so the displayed number
> updates immediately (mirrors iOS's `authManager.checkExistingSession()`). Both flows are
> inherently *online* (the gateway must reach a real inbox/handset) — online-only like
> `ChangePasswordViewModel`, never optimistic/offline-queued like `ProfileViewModel`. +31 tests
> (`AccountContactViewModelTest`: buffer editing, both submit gates, success/failure transitions,
> the cooldown tick/expire/resend-unlock cycle via `advanceTimeBy`, the double-tap in-flight guard
> on both submit paths and phone-verify, the two "Verify current value" quick actions, and
> field-scoped error clearing — editing email never clears a phone error and vice versa).
> **Mutation-proven**: neutralizing `canVerifyPhoneCode`'s length check (`== PHONE_CODE_LENGTH` →
> `true`) fails **exactly** `canVerifyPhoneCode_falseUntilExactlySixDigits` +
> `verifyPhoneCode_whenInvalid_doesNothing` (29 others green); neutralizing
> `toPhoneVerifyErrorKind`'s `httpStatus == 400` branch fails **exactly**
> `verifyPhoneCode_http400_mapsToInvalidCode` (30 others green). Both applied via a scratch
> `cp`-backed edit (never `git checkout --`), restored via `cp`, diffed clean against the backup
> afterward. **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks,
> matching every prior slice — no build-graph regression). Reviewer **PASS** (diff `apps/android`
> only; SDK purity — the two reused pure SSOTs live in `:core:model`, all orchestration/network/
> session-refresh glue stays app-side in `:feature:settings`; SSOT — no re-implementation of
> email/phone format validation or countdown ticking; no coverage floor lowered; no tautological
> tests). **Not attempted this run** (no simulator/emulator session for on-device verification —
> this run was compile+test-only per the local JVM gate; a future run should install-and-verify
> against the live gateway with the shared `atabeth` account, following the same
> `uiautomator dump` + real `bounds=` discipline as every prior on-device pass in this file).
> **Next slice candidates (not attempted this run)**: on-device transcription for the Feed audio
> attachment (still the standing candidate, needs its own foundation); a shared `:sdk-ui`
> `LanguagePickerDialog` (3 near-identical picker UIs now exist — registration inline grid,
> Settings' `RegionalLanguageDialog`, the Feed composer's `ComposerLanguagePickerDialog`); Voice-
> cloning onboarding wizard / voice-profile management (§K, both still unchecked, both genuinely
> unshipped — no `VoiceProfile`/`VoiceCloning` surface exists anywhere in `apps/android`); map/
> search/reverse-geocoding for the location attachment (needs a Maps SDK dependency + API key);
> widgets/PiP categorical re-check — per the orchestrator's standing guidance, NOT re-grepped this
> run (already re-confirmed zero-hit at iteration 44/45, already has checklist lines from the
> iteration-19 audit-gap fix — this remains a documented, real, multi-slice-epic gap needing a
> concrete sub-slice decomposition pass, not another bare re-grep).

> On 2026-08-11 **two-factor authentication was restored** (slice `settings-two-factor-auth`,
> feature-parity §L — a RE-PROUVER find during a broad re-sweep of `feature-parity.md`'s ~140
> unchecked boxes, per the orchestrator's explicit "the Feed composer is quasi-bouclé, re-balaie
> largement" guidance). **The finding**: `SettingsScreen.kt`'s 2FA row was removed the day before
> (commit `761164959`, "2FA : ligne retiree — aucune route gateway n'existe") — but that claim was
> factually wrong. `services/gateway/src/routes/two-factor.ts` + `TwoFactorService.ts` register
> real, tested, live endpoints under `auth/2fa` (`status`/`setup`/`enable`/`disable`/`verify`/
> `backup-codes`, present since a much older commit `c44ded3d5`, long before the removal), and iOS
> already ships this exact flow end to end (`TwoFactorViewModel`/`TwoFactorSetupView`/
> `TwoFactorService` in `packages/MeeshySDK`). This is the Android port. **Shipped (production, all
> `apps/android`)**: `TwoFactorCode` (`:core:model`, pure TOTP/backup-code format validation
> mirroring the gateway's `two-factor-schemas.ts` zod rules: exactly 6 digits for
> enable/backup-codes, 6-8 alphanumeric for disable) + `TwoFactorQrDataUrl` (`:core:model`, pure
> base64-payload extraction from the setup QR `data:image/png;base64,...` URL — kept independent
> of `Base64.decode`/`BitmapFactory`, which stay screen-side glue). `AuthApi`/`AuthRepository` gain
> the 6 `auth/2fa` endpoints (mirrors the existing `auth/sessions` pattern verbatim). New
> `TwoFactorViewModel` (`:feature:settings`) drives a `TwoFactorStage` state machine — `STATUS` →
> `SETUP` (QR + secret + TOTP confirm) → `BACKUP_CODES`, plus `DISABLE` (password + code) and
> `REGENERATE_CODES` — each failure mapped to a fixed per-action `TwoFactorErrorKind` (mirrors
> iOS's own fixed localized strings rather than parsing the server message). `TwoFactorScreen` is
> pure Compose glue. Settings row restored (reused an orphaned-since-yesterday
> `settings_two_factor` string resource), wired through new `Routes.TWO_FACTOR`. **+33 tests** (13
> `TwoFactorCodeTest`, 7 `TwoFactorQrDataUrlTest`, 20 `TwoFactorViewModelTest` — status load,
> setup→enable→backup-codes happy path, backup-code regeneration, disable, the malformed-code/
> missing-password local gates, the `confirmSetup` double-tap guard, and the per-action failure→
> error-kind mapping). Also updated the four call-sites of `AuthApi`'s fake test double
> (`AuthRepositoryTest`, `SessionRepositoryTest`, `AuthViewModelTest`, `RegistrationViewModelTest`)
> to implement the 5 new interface methods so the interface change stayed compile-clean everywhere.
> **Mutation-proven**: dropping `isValidTotp`'s length check fails **exactly** the 3
> boundary-length tests (10 others green); dropping `confirmSetup`'s stage/gate check fails
> **exactly** the malformed-code and in-flight-guard tests (18 others green). Both applied via a
> scratch `cp`-backed edit (never `git checkout --`), restored via `cp`. **Gate**:
> `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, matching the prior slice's
> count — no build-graph regression). Reviewer **PASS** (diff `apps/android` only, confirmed via
> `git diff --stat origin/main` — no other files touched; SDK purity — the two pure validators live
> in `:core:model`, all orchestration/state-machine/Android-framework glue [Base64 decode, Bitmap
> decode] stays app-side in `:feature:settings`; SSOT — reuses `AuthRepository`/`NetworkResult`/
> `apiCall`/`apiCallUnit`, no reimplementation; no coverage floor lowered; no tautological tests).
> **Full on-device verification against the live gateway** (`meeshy_pixel8`, real `atabeth` account
> — the same shared account used across this whole routine, NOT a disposable test account):
> installed the fresh build (`:app:installDebug` — `./meeshy.sh check` alone does not install),
> relaunched, session auto-restored. Every tap resolved via `uiautomator dump` + a grepped
> `bounds=`/clickable-ancestor attribute. Navigated Settings → Privacy & Security → **Two-factor
> auth** (row correctly positioned between Change password and Active sessions, exactly as coded):
> confirmed **Disabled** status rendered from a real `GET https://gate.meeshy.me/api/v1/auth/2fa/
> status` (`200`, 97ms, `adb logcat`). Tapped **Set up two-factor authentication**: a real `POST
> .../auth/2fa/setup` (`200`, 154ms) returned a genuine secret + QR data URL, and the screen
> rendered an actual scannable QR code image (decoded via `TwoFactorQrDataUrl.base64Payload` →
> `Base64.decode` → `BitmapFactory` on a REAL server payload, not a synthetic fixture) plus the
> manual-entry secret text; the **Activate** button correctly rendered disabled/greyed (empty code
> input → `canConfirmCode` gate false). **Deliberately stopped here** rather than completing the
> enable flow: computing a valid live TOTP code from the secret was possible, but actually calling
> `/enable` would have toggled real 2FA on this shared, password-unknown-to-this-session account —
> an unacceptable risk of locking every future run of this routine (both lanes use this account)
> out of it. Verified the safe exit path instead: tapped the back arrow, confirmed `cancel()` fired
> **zero** network calls (`adb logcat` filtered on `2fa` — empty since the setup call), returned to
> `STATUS` showing **Disabled** again — proving `setup()` is non-destructive/idempotent and the
> account was left in the exact state it started in. `adb logcat` checked across the whole session
> for `FATAL EXCEPTION`/`AndroidRuntime` crashes — none. Emulator left on the Settings screen
> afterward (not mid-flow). **Also fixed two stale `feature-parity.md` checkboxes discovered while
> re-proving this item**: "Active device sessions" was already fully shipped (`761164959`,
> 2026-08-10) but never checked off — confirmed still live on-device this run, now checked.
> **Next slice candidates (not attempted this run)**: "Change email / phone (two-step
> verification)" — the wire-level plumbing already exists (`UserApi.changeEmail`/`verifyEmailChange`/
> `resendEmailChangeVerification`/`changePhone`/`verifyPhoneChange`, `UserRequests.kt` models) but
> **no UI screen consumes it anywhere** — a genuine gap, right-sized for a dedicated slice (iOS's
> `SecurityView` has the reference flow inline); on-device transcription for the Feed audio
> attachment (still the standing candidate, needs its own foundation); a shared `:sdk-ui`
> `LanguagePickerDialog` (3 near-identical picker UIs now exist); map/search/reverse-geocoding for
> the location attachment; widgets/PiP — per the orchestrator's guidance this remains a documented,
> real gap needing a planning pass, not a re-grep (last re-confirmed zero-hit iteration 44/45, not
> re-checked again this run per the standing guidance to stop bare re-grepping it).

> **Archive:** entries older than the ~300-line hygiene threshold live in
> [`PROGRESS-archive-2026-08.md`](./PROGRESS-archive-2026-08.md) (same prepend/newest-first order).
> Archived 2026-08-10 (routine iteration 30, hygiene pass — pure archiving increment, no
> slice, `tasks/lane-cursor.md` unchanged per §Hygiène): moved the 4 oldest entries at the
> time (`feed-composer-media-attachments` back through the `TagInputField`/Kover tail note)
> to the archive, keeping the 4 most recent (`feed-composer-camera-capture`, the §C
> inverted-list decomposition, `notification-channel-id-drift`,
> `feed-composer-reel-classification`).

