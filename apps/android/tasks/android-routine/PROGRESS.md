# Progress — state & what to do next

> Older entries archived in `PROGRESS-archive-2026-08.md` (prepend/newest-first, same convention).

> On 2026-08-20 **Composer live sentiment shipped** (slice `composer-live-sentiment`,
> feature-parity's Chat "Live sentiment + language detection (smart context zone)" composite — the
> **live-sentiment** half). **Step 0**: no open `claude/apps/android/*` PR to merge first (checked
> the remote heads + `list_pull_requests --head isopen-io:claude/apps/android` → `[]`; the previous
> slice `conversation-lock-open-gate` is merged as #3221). Branched off `origin/main` (`3ccd8a72`)
> clean, branch created as the literal first action before any edit. This container **reaches
> `dl.google.com`** (curl → 200), so the SDK bootstrapped and the **full local gate ran here**
> (assembleDebug + testDebugUnitTest) — not only on CI.
>
> **The gap, re-proved by reading source**: a zero-hit grep for `Sentiment` across `apps/android`
> confirmed the composer had no sentiment surface. iOS ships TWO distinct sentiment scorers — the
> **agent's #2 candidate conflated them**: (1) the message-detail sheet's `MessageDetailSentimentTab`
> uses Apple's `NLTagger` (on-device **ML**), which has **no portable Android equivalent** (a
> faithful port is impossible — the scores would differ), so it is deliberately **out of scope**;
> (2) the composer's `SmartContextZone` uses `TextAnalyzer.computeSentiment`, a **dictionary**
> (FR/EN/ES/DE weighted words) scorer that IS portable. This slice ports (2).
>
> **Pure core (`:core:model`)**: `SentimentAnalyzer.score(text)` — lowercase, tokenize on whitespace
> with leading/trailing punctuation trimmed (Unicode punctuation categories), sum the dictionary
> hits (positive dict consulted first), normalize `sum / wordCount * 2`, clamp to `[-1, 1]` — a
> faithful port of iOS `computeSentiment`. `SentimentLevel` (7 buckets + glyphs + `from(score)` with
> iOS's exact thresholds: neutral band `[-0.1, 0.1]` inclusive, `-0.6`→NEGATIVE, `0.3`→POSITIVE,
> `0.6`→VERY_POSITIVE).
>
> **Wiring**: `ChatUiState.composerSentiment` — a pure computed getter (same idiom as the existing
> `composerAffordances`) that returns `null` on a blank draft (no glyph shown) else
> `SentimentLevel.from(SentimentAnalyzer.score(draft))`. `ChatScreen`'s composer renders it as the
> input field's `trailingIcon` (the mood emoji), with a localized "Message tone" content
> description. No new plumbing — it rides the existing `draft` state, so every keystroke re-derives it
> exactly like the mention state already does.
>
> **Tests**: +20 `SentimentTest` (`from` boundary buckets incl. both neutral edges, the 7 glyphs,
> `score` empty/blank/punctuation-only → 0, single-word clamp both signs, word-count normalization,
> mixed sum, case-insensitivity, punctuation trimming, non-English dictionaries, end-to-end
> text→level, determinism) + 5 `ChatViewModelTest` (null on blank; positive/negative/neutral typing
> map to the right level; clears when the draft empties). Reducer/scorer branch coverage effectively
> total; the Compose `trailingIcon` is exempt glue per TDD-COVERAGE. Strings ×1 (`chat_composer_sentiment`)
> across EN/FR/ES/PT.
>
> **Env**: the outbound proxy rate-limits Gradle's **parallel** first-fetch of uncached artifacts
> (`429 Too Many Requests` on `repo.maven.apache.org`); a direct `curl` of the same artifact returns
> 200. Ran the gate under a 429-aware retry loop (`--max-workers=2`); each attempt warms more of the
> cache until it goes green (NOTES). **Gotcha logged**: `pkill -f 'gradlew'` self-terminates the
> retry script (its own command line contains "gradlew").
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` green across all modules locally before push.

> On 2026-08-20 **Conversation lock open-gate shipped** (slice `conversation-lock-open-gate`,
> feature-parity's Conversations lock composite — the "open-gate on tap" sub-gap left open by
> `conversation-lock-menu`). **Step 0**: checked the full open-PR list (8 open, none on a
> `claude/apps/android/*` branch — #3220/#3218 gateway, #3217 iOS, five Dependabot), so no
> prior-iteration PR to merge first. Branched off `origin/main` (`1eeff7c7`) clean, branch created
> as the literal first action before any edit. `dl.google.com` reachable here (curl → 200), so the
> **full local gate ran locally**, not only on CI.
>
> **The gap, re-proved by reading source**: `ConversationListScreen`'s row `onClick` called
> `onConversationClick(conversation.id)` **directly** — a locked conversation opened straight
> through, its 🔒 badge purely cosmetic on tap. iOS gates this: `ConversationListView` row tap does
> `if isLocked { lockSheetMode = .openConversation } else { onSelect }`, and
> `ConversationLockSheet.Mode.openConversation` verifies the 4-digit code then calls `onSuccess()`
> **without removing the lock** (distinct from `.unlockConversation`, which removes it).
>
> **SOTA over iOS by extraction + honest effect naming**: the decision is lifted out of the view
> into the already-pure `LockPinReducer`. New `LockPinMode.OPEN_CONVERSATION` mirrors
> `completeUnlock` but emits a brand-new **`LockPinEffect.OpenConversation(id)`** — deliberately
> distinct from `RemoveLock` — so "reveal once, stays locked" is provable in a unit test (the
> reducer test asserts `doesNotContain(RemoveLock)`). New `LockPinCopy.OPEN` gives the sheet its own
> honest header ("Locked conversation" / "Enter the code … to open it"), not the misleading
> "Unlock" copy, since the lock is not being removed.
>
> **Wiring**: `ConversationListViewModel.onConversationTap(id)` consults the authoritative
> `lockStore.isLocked(id)` (same synchronous read `onLockToggle` uses, not the mirrored state set —
> so a tap can't race a just-applied lock) → locked opens the `OPEN_CONVERSATION` sheet, unlocked
> emits on a new one-shot **`openConversation: Flow<String>`** (a `Channel(BUFFERED).receiveAsFlow()`,
> the same idiom as this file's existing `refreshRequests`; an event, not state, so a config-change
> replay never re-navigates). `applyLockResult` routes the `OpenConversation` effect to the same
> channel. `ConversationListScreen` collects it in a `LaunchedEffect(viewModel)` → `onConversationClick`,
> and the row `onClick` now calls `onConversationTap` — the gate is the **single** navigation entry
> point (grep confirms one `onConversationClick(` call site left, inside the collector).
>
> **Tests**: +5 `LockPinReducerTest` (open length=4, copy=OPEN, correct-code→OpenConversation+Completed
> AND not RemoveLock, wrong-code→CODE_INCORRECT+no effects, null-id inert) + 4
> `ConversationLockFlowViewModelTest` (unlocked tap navigates straight, locked tap opens the gate and
> does NOT navigate, correct open code navigates + keeps the lock, wrong open code keeps the gate + no
> nav) — all against the real `InMemoryConversationLockStore`, nav events collected off the real
> `openConversation` flow, never a mock. Reducer branch coverage total; the sheet/`LaunchedEffect`
> are exempt Compose glue per TDD-COVERAGE. Strings ×2 (title+subtitle) across EN/FR/ES/PT.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green (the 2 new suites), then full
> `assembleDebug` + `testDebugUnitTest` across all modules green locally before push.

> On 2026-08-19 **Conversation lock/unlock shipped** (slice `conversation-lock-menu`,
> feature-parity's Conversations "Pinned/muted/archived… locked pending" composite line — the
> locked sub-gap). No open `claude/apps/android/*` PR to merge first (checked the full open-PR list:
> 7 open, none on an android-routine branch). `df -h` not a concern; branched off `origin/main`
> (`a53205df`) clean. **Full local gate ran here** — this container reaches `dl.google.com` (see
> NOTES), so `assembleDebug` + `testDebugUnitTest` both went green locally before the PR, not only
> on CI.
>
> **The gap, re-proved by reading source, not an agent's paraphrase**: `ConversationLockStore` +
> `EncryptedConversationLockStore` (master 6-digit PIN + per-conversation 4-digit PIN, SHA-256
> hashed, DI-wired) already existed, and `ConversationListViewModel` already *collected*
> `lockedConversationIdsFlow` into state — but nothing rendered it and nothing could lock/unlock: the
> state field's own doc comment named the PIN flow a "deliberately deferred follow-up". This slice
> is that follow-up.
>
> **SOTA over iOS by extraction**: iOS's `ConversationLockSheet.handleComplete` embeds a 7-mode ×
> 3-step PIN state machine *inside* the SwiftUI view (untestable). Android lifts the menu-reachable
> subset into a pure **`LockPinReducer`** (oracle-injected, effect-emitting) per TDD-COVERAGE's
> "push decisions out of the Composable" directive. Two concrete improvements this makes provable:
> (1) a confirm mismatch rewinds to the mode's *real* entry step (0 for setup, 1 for a code) instead
> of iOS's blanket `step = 1`, which mislabels the setup flow's header; (2) locking with no master
> PIN yet **chains** first-time setup straight into the 4-digit code (`pendingLockConversationId`),
> where iOS dead-ends on a "configure a master PIN in Settings" alert Android has no Settings screen
> to honour.
>
> **Wiring**: `ConversationListViewModel.onLockToggle/onLockDigit/onLockDelete/dismissLockPrompt`
> drive a `lockPrompt: LockPinState?` on the UiState; effects apply to the real `ConversationLockStore`
> (setMasterPin/setLock/removeLock), whose flow re-derives the row's 🔒 badge. New context-menu
> Lock/Unlock row (label+icon flip on `isLocked`); new `ConversationLockPinSheet` (ModalBottomSheet
> hero-lock + dots + 10-key pad, indigo accent, `LockOpen` glyph on the unlock flow). Strings ×22
> across EN/FR/ES/PT.
>
> **Tests**: +21 `LockPinReducerTest` (every mode/step, buffer-full & empty-delete inert arms,
> wrong-master/wrong-code/mismatch failure arms, null-id defensive arms, copy/pinLength/currentPin
> derivation) + 9 `ConversationLockFlowViewModelTest` (mode selection per store state, the
> setup→lock chain, unlock, wrong-PIN keeps-open, dismiss drops the pending chain, digit/delete inert
> with no sheet) — all against the real `InMemoryConversationLockStore`, never a canned mock.
> Reducer branch coverage is effectively total; the Composable sheet is exempt glue per TDD-COVERAGE.
>
> **Verified**: `./gradlew assembleDebug` (exit 0, all modules) then `./gradlew testDebugUnitTest`
> (BUILD SUCCESSFUL, all modules) green locally. Env gotchas (compileSdk 37 → `android-37.0` on
> `--channel=3`, newer cmdline-tools required, Maven 429 burst) written up in NOTES.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=5 last_run=conversation-lock-menu`.

> On 2026-08-17 **Chat scroll-to-bottom offline indicator shipped** (slice
> `chat-scroll-offline-indicator`, feature-parity's scroll-control composite line, "offline
> indicator" sub-gap). `gh pr list --state open --search "apps/android OR apps/ios"` showed two
> unrelated open PRs. `df -h /` showed 22 Gi free.
>
> **Pivoted away from the Explore agent's #2-ranked candidate (drag-to-dismiss on the fullscreen
> image viewer) after re-assessing the risk, not the reward**: composing THREE independent Compose
> gesture detectors on one node (existing tap + existing pinch/pan/zoom + a new vertical
> drag-to-dismiss, active only at rest scale) carries a real risk of pointer-event-consumption
> conflicts between sibling `pointerInput` blocks — this session has no established way to
> interactively verify an Android gesture on-device or in an emulator (unlike iOS's idb+simulator
> tooling), and this exact codebase's own memory index documents a cluster of gesture bugs that
> shipped fully broken without unit tests catching them. Chose the mechanically safer #3 candidate
> instead — no gesture composition, a pure sealed-interface extension over already-established
> infrastructure.
>
> **Re-proved the gap and the exact iOS priority by reading the SDK source directly**, not an
> agent's paraphrase: `ChatViewModel` already computed `isOffline` from `NetworkConditionMonitor`
> but only fed it into `toBubbles` (the per-message hourglass, already shipped) — never exposed at
> the `ChatUiState` top level, never passed to `ScrollControlContent.of`. Read
> `ConversationScrollControlsView.swift` end to end: the real priority is
> `isSearchingQuotedMessage > hasUnreadContent (unread OR typing) > isOffline > plain chevron` —
> Android has no quoted-message-search state, so only the Typing/Unread > Offline > Plain tier
> applies, which slots in exactly at the position the already-shipped Typing-over-Unread rule
> already established.
>
> **New `ScrollControlContent.Offline`** variant + `of(affordance, typing, isOffline: Boolean =
> false)` (default preserves every existing call site/test unchanged). **`ChatUiState.isOffline`**
> fed from the exact same collector that already computes the reading for the hourglass — zero new
> plumbing, just one more field on an existing `.copy()`. New **`OfflinePill`** composable mirrors
> `TypingPill`'s structure exactly, but deliberately neutral-tinted (`textSecondary`, not the
> conversation accent) since offline signals connectivity, not conversation identity — matches
> iOS's own `contentColor`/`tint` special-casing for the offline branch.
>
> **Surpasses iOS, worth flagging explicitly**: iOS's `ConversationScrollControlsView` fully
> implements and tests the `isOffline` branch, but its ONE call site
> (`ConversationView+ScrollIndicators.swift`) hardcodes `isOffline: false` — the indicator is
> dead code in the shipped iOS app today. Android wires it to a real, live
> `NetworkConditionMonitor` reading, so this is a case where faithfully porting the SDK component's
> tested behavior produces MORE functionality than iOS currently exposes, not less.
>
> **+5 `ScrollControlContentTest`** (offline alone shows the state, unread beats offline, typing
> beats offline, online with nothing else shows Plain not Offline, hidden even while offline) **+ 2
> `ChatViewModelTest`** (`state.isOffline` mirrors the same network reading already tested for the
> hourglass, both offline and online cases). Strings ×4 (`chat_offline`) across EN/FR/ES/PT.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=4 last_run=chat-scroll-offline-indicator`. **streak reaches 4 → the NEXT ANDROID
> run will be the last before the IOS_DETTE bascule (streak=5).**

> On 2026-08-17 **Email notification toggle shipped** (slice
> `settings-email-notification-toggle`, feature-parity's notification-preferences composite line,
> "still open" email-channel-toggle sub-gap). `gh pr list --state open --search "apps/android OR
> apps/ios"` showed two unrelated open PRs (#3180 — Android perf, different files; #3182 — web),
> no collision. `df -h /` showed 6.6 Gi free.
>
> **Found via a fresh Explore agent sweep of `[~]` lines** (no candidate held in reserve from a
> prior run this time — both previously-known candidates, notification swipe-actions and chat
> header presence dot, are now shipped), ranked 3 candidates and chose the smallest: the agent
> also flagged one near-miss worth noting — story reactions' "pending: full picker/animation/heart
> bounce" note is itself **stale**, all three already shipped 2026-08-11 before the note's last
> edit; correctly not proposed as a candidate.
>
> **Re-proved before coding**: `UserNotificationPreferences.emailEnabled` already existed and
> already flowed end-to-end through `NotificationPreferenceSyncBody`/the sync pipeline — the field
> itself was never the gap, only the `SettingsViewModel` intent + `SettingsScreen` row were
> missing. Read iOS `NotificationSettingsView.swift:84-85` directly: `notifToggle(...keyPath:
> \.emailEnabled)` sits right after Push, before Sound/Vibration. Also checked `notifToggle`'s own
> signature (`NotificationSettingsView.swift:326-341`) — it has NO `enabled:`/push-dependency
> parameter for ANY row, unlike Android's existing Sound/Vibration/NewMessage rows (which the
> Android UI itself gates on `pushEnabled`, a pre-existing Android-only refinement not present on
> iOS). Decision: leave the new Email row un-gated, matching iOS exactly and matching the more
> sensible semantics (email is an independent delivery channel from push).
>
> **`SettingsViewModel.setEmailEnabled(enabled)`** — a one-line mirror of `setSoundEnabled`'s
> `updateNotifications { it.copy(...) }` shape; `updateNotifications` already persists the whole
> block to the device-local store instantly then enqueues the durable sync, so this new toggle
> automatically inherits the same offline-queued PATCH behavior with zero new plumbing.
> **`SettingsScreen`** gains one new `NotificationToggleRow` between Push and New-message. +1 test
> (`setEmailEnabled_persists`, mirroring `setVibrationEnabled_persists`). 1 new string
> (`settings_email_notifications`) across EN/FR/ES/PT.
>
> **Process note**: branch created FIRST this run, before any edit — the prior iteration's
> reminder (created the branch only mid-way through, caught before any commit) applied
> immediately.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> **CI incident, unrelated to this diff**: GitHub itself had a ~5h platform-wide outage
> (`githubstatus.com` confirmed `impact: critical`, "Incident with GitHub.com", 13:40→~18:23 UTC)
> that blocked `gh pr create` entirely — every attempt (GraphQL and REST) 503'd until "Git
> Operations" was reported mitigated, at which point PR #3185 finally went through on the first
> retry. Separately, once open, PR #3185's `Test gateway` check came back red — verified this was
> **pre-existing on `main` itself**, not caused by this diff: `git diff origin/main...HEAD --stat`
> confirms zero gateway/TypeScript files touched, and `main`'s own most recent completed CI run
> (commit `782dc3225`) fails the exact same test with a byte-for-byte identical error
> (`personal-history-hiding-surface-guard.test.ts`, a `ConversationBridgeService.ts` drift from an
> unrelated concurrent gateway session). `Android (assemble + unit tests)` — the actual merge gate
> for this routine's PRs — was green throughout; merged in squash despite the red `Test gateway`,
> confirming it isn't a required check for this branch (same pattern as the `Test shared` false
> negative documented earlier this session).
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=3 last_run=settings-email-notification-toggle`.

> On 2026-08-17 **Chat header presence dot shipped** (slice `chat-header-presence-dot`,
> feature-parity's "Live presence dot on a direct conversation's row/header" composite line — the
> last open half, the row dot having shipped earlier this session). `gh pr list --state open
> --search "apps/android OR apps/ios"` showed three unrelated open PRs (#3177/#3179/#3180 — web
> and an Android perf cycle from a concurrent session, none touching `ChatScreen.kt`/
> `ChatViewModel.kt`). `df -h /` showed 15 Gi free.
>
> **Re-confirmed a candidate flagged in a prior iteration's summary but not yet attempted**: grepped
> `ChatScreen.kt`/`ChatViewModel.kt` for "presence" — zero matches, confirming the gap was still
> real. `ConversationListViewModel` already had every reusable piece (`presenceByUserId`,
> `observePresence()`, `presenceStateFor`), built for the row dot earlier this session — this slice
> is a near-verbatim port of that same machinery into `ChatViewModel`, not new design.
>
> **Process note**: started writing this slice's code directly on `ops/android-ios-parity-routine`
> before creating a dedicated branch — caught while drafting the mid-run status note (before any
> push), confirmed via `git log -1`/`git status` that no commit had landed on the ops branch in the
> meantime, then `git checkout -b claude/apps/android/chat-header-presence-dot` carried the
> uncommitted working-tree changes onto the new branch cleanly. No harm done, but a reminder to
> create the branch as literally the first action of a slice, before opening any editor.
>
> **Adaptation from iOS, not a literal port**: iOS's `ConversationView.headerPresenceState` dots
> `ThemedAvatarButton` — Android's chat header has no avatar at all. The existing 10dp circle next
> to the title is a DIFFERENT thing (an unconditional conversation-accent identity marker, present
> on every conversation type) — repurposing it for presence would conflate two meanings in one
> element and be wrong for group chats. Added a separate, small 8dp dot ADJACENT to it instead:
> shown only for a direct conversation, using the central `meeshyPresenceDotColor` mapping (`null`
> = offline = no dot, same rule as every other presence surface in the app).
>
> **`ChatUiState`** gains `directPeerUserId` (computed via `ApiConversation
> .otherParticipantUserId(currentUserId)`, the exact same pure extension the row-dot slice built and
> tested) + `presenceByUserId: Map<String, UserStatusEvent>` + `headerPresence(nowEpochMillis):
> PresenceState?`, a byte-for-byte mirror of `ConversationListUiState.presenceStateFor`.
> **`ChatViewModel.observePresence()`** is the same mirror of `ConversationListViewModel`'s
> identically-named function (subscribes to `MessageSocketManager.userStatus`/`.presenceSnapshot`),
> called eagerly from `init` for the same reason: those are hot `SharedFlow`s with no replay, so a
> late subscriber genuinely misses events.
>
> **+3 `ChatViewModelTest`** (live presence resolves for the other participant in a direct
> conversation, stays null for a group conversation even when live presence data exists for that
> userId, stays null before any presence data has arrived). Required extending the test file's
> `socketManager()`/`harness()` helpers with injectable `userStatus`/`presenceSnapshot` flows — the
> exact same extension `ConversationListViewModelTest.kt` already has, applied to the chat test file
> for the first time.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=2 last_run=chat-header-presence-dot`.

> On 2026-08-17 **Notification swipe actions shipped** (slice `notification-swipe-actions`,
> feature-parity's "Mark read" composite line). First ANDROID run after this session's first
> IOS_DETTE bascule (`android_streak` reset to 0). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed two unrelated open PRs (#3176, #3177 — web cycles, neither
> touching `apps/android`). `df -h /` showed 5.2 Gi free — lower than earlier checks but the
> shared build caches (`apps/ios/Build` 2.2G, `packages/Build` 1.3G, Android module builds ~400M)
> are all normal sizes, not the private-DerivedData bloat pattern from earlier incidents; left
> untouched.
>
> **Re-confirmed a candidate an earlier Explore agent had already ranked #2 of 3** (behind the
> already-shipped `discover-sms-invite`): `NotificationsScreen.kt` had zero `SwipeToDismissBox`,
> and `NotificationRepository.delete(id)` (`DELETE /notifications/{id}`) existed network-side but
> with zero cache mutation and zero callers anywhere in `NotificationsViewModel` — the "ready
> backend, never wired" pattern this routine keeps finding, this time on a method that ALREADY
> existed rather than needing new plumbing. Also caught the composite feature-parity line itself
> was stale on a second count: "mark-all pending" — `markAllRead` was actually already fully
> wired and tested, just never checked off.
>
> **Read iOS `NotificationRowView.swift` directly for the exact shape**: trailing (end-to-start)
> swipe → destructive delete, always offered; leading (start-to-end) swipe → mark-read, offered
> ONLY `if !notification.isRead`. `NotificationListViewModel.deleteNotification`/`markRead` call
> straight through to the shared toast-manager singleton (iOS's cache ownership model); Android's
> `NotificationRepository` owns its own `StateFlow` cache directly, so the equivalent mirror is
> making `delete` optimistic the same way `markAsRead` already is, not reaching for an iOS-specific
> singleton pattern that doesn't exist on this platform.
>
> **`NotificationRepository.delete(id)`** — snapshot the cache, remove the row immediately,
> decrement `unreadCountStream` only when the removed row was unread, roll both back on failure.
> **`NotificationsViewModel.deleteNotification(id)`** — thin delegator, no new state needed (the
> repository cache is already the single source of truth the screen projects).
>
> **UI reused the ONLY existing `SwipeToDismissBox` precedent in the codebase**
> (`ConversationListScreen.kt`'s pin/archive swipe) rather than inventing a new destructive-dismiss
> pattern: `confirmValueChange` always returns `false`, so the swipe box itself never physically
> removes the row — the actual disappearance/re-style comes from the cache mutation flowing back
> through `state.notifications`, exactly like every other repository-driven list in this codebase.
> New `NotificationSwipeBackground` composable (trash icon + error tint for delete, mark-email-read
> icon + indigo tint for mark-read, transparent background when settled or when the leading
> direction has nothing to offer on an already-read row) mirrors `ConversationListScreen`'s
> `SwipeActionBackground` structure. First use of `Icons.Filled.MarkEmailRead` and
> `SwipeToDismissBox`/`rememberSwipeToDismissBoxState` in `:feature:notifications` — confirmed
> compiling via the targeted test run before the full check.
>
> **+3 `NotificationRepositoryTest`** (delete removes optimistically + decrements unread count for
> an unread row, delete on an already-read row leaves the count untouched, rollback on failure)
> **+ 1 `NotificationsViewModelTest`** (delegates to the repository). Strings ×2
> (`notifications_action_delete`/`notifications_action_mark_read`) across EN/FR/ES/PT.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=1 last_run=notification-swipe-actions`.

> On 2026-08-17 **Discover SMS invite shipped** (slice `discover-sms-invite`, feature-parity §J
> "Invite by email; invite by SMS; import phone contacts" composite line). `gh pr list --state
> open --search "apps/android OR apps/ios"` showed zero open PRs for this routine. `df -h /`
> showed 6.7 Gi free, stable.
>
> **Found via a fresh Explore agent sweep of `[~]` lines**, ranked top of 3 candidates for
> smallest/safest scope — the SMS half of the same composite line the previous run's
> `discover-email-invite` slice left "still open," and explicitly the SMALLER of its two halves
> (import-contacts needs `READ_CONTACTS` runtime permission + a multi-select picker, deliberately
> NOT attempted).
>
> **Re-proved before coding**: read iOS `DiscoverTab.swift` (`smsInviteCard`, lines 94-142) and
> `DiscoverViewModel.swift` (`phoneText`, `smsMessage`) directly. Confirmed this is materially
> SMALLER than the email invite it mirrors visually — there's no network call at all. iOS just
> checks `MFMessageComposeViewController.canSendText()` then presents the native SMS composer
> pre-filled with `phoneText` as recipient and a fixed `smsMessage` literal as body; `phoneText`
> is never cleared afterward (the viewer might cancel the native composer), unlike `emailText`
> which clears on a confirmed successful send.
>
> **`DiscoverUiState.phoneText` + `DiscoverViewModel.onPhoneTextChanged`** — trivial state
> holding, no async/network logic needed (unlike `sendEmailInvitation`). **New `SmsInviteCard`
> composable** (`DiscoverTab.kt`, sibling of `EmailInviteCard`): icon + title, `OutlinedTextField`
> (phone keyboard) + `Button`, launches `Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone"))`
> with `putExtra("sms_body", SMS_INVITE_MESSAGE)` on tap. **Reused an existing guarded-launch
> idiom rather than inventing one**: `runCatching { context.startActivity(...) }`, the exact
> pattern `ChatLinkOpener.openExternally` already uses for a missing handler — Android's platform
> equivalent of iOS's `canSendText()` pre-check, degrading to a silent no-op instead of a toast
> (Android's Discover module still has zero toast/snackbar infra, same constraint the email slice
> hit). The invite message itself is a plain Kotlin `private const val`, deliberately **not**
> wired through `stringResource()`/localized — faithful to iOS's own `smsMessage`, which is a
> hardcoded literal never wrapped in `String(localized:)`, not an oversight to "fix" while
> porting.
>
> **+1 test** (`onPhoneTextChanged updates the phone field`) — the actual SMS-intent launch is
> thin Composable glue (`TDD-COVERAGE.md`'s documented exemption: push testable decisions out of
> the Composable, cover those; a `context.startActivity` side effect has no decision left to
> extract). Also confirmed via this run that `Icons.Filled.Sms` (material-icons-extended, already
> on the classpath through `libs.bundles.compose`) compiles — never used anywhere in the repo
> before this slice. Strings ×4 across EN/FR/ES/PT (`contacts_discover_sms_title/placeholder/
> send/send_a11y`).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=5 last_run=discover-sms-invite`. **streak reaches 5 → the NEXT iteration
> bascules to IOS_DETTE.** Per the note left in iOS-debt Run #14, `tasks/ios-debt-routine-
> progress.md` (well over ~1500 lines) should be archived FIRST, before choosing a new iOS item.

> On 2026-08-17 **Reply @-mention auto-prefill shipped** (slice `reply-mention-prefill`,
> feature-parity's `Threaded comments` composite line, "still open" reply-composition sub-gap).
> `gh pr list --state open --search "apps/android OR apps/ios"` showed two unrelated open PRs
> (#3156, #3167 — web/gateway cycles, neither touching `apps/android`). `df -h /` showed 8.9 Gi
> free, stable.
>
> **Found via the "read feature-parity.md directly for a `[~]` line with a named sub-gap" strategy**
> (an Explore agent's fresh sweep), then independently re-proved before coding: read
> `PostCommentsViewModel.beginReply(commentId)` directly — it only sets the "Replying to…" chip
> (`composer.value = ReplyTarget(parentId, name)`), never touches the composer draft. Read the iOS
> reference `FeedCommentsSheet.beginReply(to:)` (`apps/ios/.../FeedCommentsSheet.swift:1765`) in
> full and grepped every `prefilledMention`/`replyingTo = nil` site in the file to confirm the exact
> algorithm and its edges: the cancel-reply "X" chip button (line 1396) and the post-send reset
> (line 1822) neither touch `prefilledMention` nor `composerText` — only `beginReply` itself
> strips/injects. Confirmed this is genuinely the small half of the candidate (no oversized hidden
> scope, unlike `PostRepository.requestTranslation`/the notification category-filter-bar deferred
> in earlier runs this session).
>
> **New pure `ReplyMentionPrefill.apply(currentText, previousMention, replyToParentId,
> authorUsername)`** (`:feature:feed`) — takes primitives, not SDK models, so it needs no fixture
> construction in tests. Injects `@username ` only when `replyToParentId` is non-blank (the
> *targeted* comment is itself a reply — flat 2-level threading reparents the new reply to the
> root, so without the mention the addressed person is never notified, only the thread's root
> author would be) and the author has a non-blank username; strips the exact previously-injected
> prefix when retargeting to a different reply (idempotent re-tap — no double prefix on repeat
> taps); an edited-away prefix (text no longer starts with it) is left alone, mirroring iOS's
> `hasPrefix` guard exactly. `beginReply` gained `private var prefilledMention: String? = null` and
> calls the helper right after positioning `composer.value`, folding the result into
> `composerDraft`. `cancelReply` deliberately left untouched — matches iOS, which also never
> touches `composerText`/`prefilledMention` on cancel.
>
> **+8 `ReplyMentionPrefillTest`** (pure: inject on reply-to-reply, no inject on top-level target,
> no inject on blank parentId, no inject without a username, strip-old-inject-new on retarget,
> strip-to-nothing when retargeting to top-level, idempotent re-tap, edited-away prefix left alone)
> **+ 3 `PostCommentsViewModelTest`** (prefill on reply-to-reply, no prefill on top-level, retarget
> replaces the previous prefill).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green before push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time → advances to `lane=ANDROID
> android_streak=4 last_run=reply-mention-prefill`.

> On 2026-08-17 **Notification list pagination shipped** (slice `notifications-pagination`,
> feature-parity §M). `gh pr list --state open --search "apps/android OR apps/ios"` showed one
> unrelated open PR (#3156, wrong branch naming for this routine, untouched). `df -h /` showed
> 10 Gi free, stable.
>
> **Re-proved the candidate's own scope before coding, not just its checklist wording**: the note
> grouped "pagination/unread-only filter" as one item, but reading the real iOS reference
> (`NotificationListViewModel.swift`) directly revealed the `unreadOnly` published property is
> genuinely DEAD CODE on iOS itself — `refreshFromAPI`/`loadMore` both hardcode `unreadOnly: false`
> in the actual request; the real "Non lues" experience is 100% client-side filtering
> (`filteredNotifications`) as ONE of **11** category chips (all/unread/messages/reactions/
> mentions/social/contacts/groups/calls/translations/system, each with its own icon/color/type-match
> predicate). That's a materially bigger UI feature than "wire a server query param" — correctly
> split off as a separate future item rather than force-fit into this run. Only pagination (the
> genuinely small half) was ported.
>
> **Found the right primitive already built and unused**: `pagedApiCall` (`core/network/ApiCall.kt`)
> — a `apiCall` variant that PRESERVES the envelope's `pagination.hasMore` instead of discarding it
> — already existed, with zero callers in `NotificationRepository` (which used the plain `apiCall`
> everywhere, silently dropping pagination metadata on every request). Also confirmed
> `ApiResponse.pagination: Pagination?` already carries `hasMore`/`offset`/`limit`/`nextCursor` — no
> new wire format needed.
>
> **`NotificationRepository.loadMore()`**: fetches the page after the current cache size, dedupes
> by id (mirrors `prependLive`'s established precedent), refreshes a new `hasMoreStream:
> StateFlow<Boolean>` from the server-authoritative `pagination.hasMore` (not a heuristic like
> "page size == limit"). A no-op before the first page has loaded (nothing to paginate from) or once
> the server has already said there's no more; a failure leaves the cache and `hasMoreStream`
> untouched so the next scroll simply retries. `revalidateNotifications` (the existing first-load/
> refresh path) switched from `apiCall`/`list()` to `pagedApiCall` directly, so `hasMoreStream` is
> correctly seeded on every fresh load too.
>
> **`NotificationsViewModel.loadMore()`** mirrors the re-entrancy-guarded shape already established
> twice this session (`StatusesViewModel.loadMoreIfNeeded`, `PostCommentsViewModel.loadMore`) —
> guard on `isLoadingMore`/`hasMore`, delegate, silent failure (next scroll retries). UI:
> `NotificationsScreen`'s `LazyColumn` switched from `items` to `itemsIndexed` to fire `loadMore()`
> when the LAST row appears (mirror of iOS's trailing `ProgressView().onAppear`), with a spinner
> shown while `isLoadingMore`.
>
> **+9 tests**: `NotificationRepositoryTest` (6 — page appended in order, dedup against the existing
> cache, `hasMoreStream` flips false when the server says so, no-op before any page has loaded,
> no-op once the server reported exhaustion, cache/`hasMoreStream` untouched on a failed page).
> `NotificationsViewModelTest` (3 — delegates when a page is available, inert when exhausted, a
> second concurrent call while one is in flight is a no-op, verified via a held-open
> `CompletableDeferred`).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. Diff confirmed `apps/android`-only (5 files, `sdk-core` + `:feature:notifications`, no
> resources touched — no new strings needed).
>
> **Still open**: the 11-category client-side filter bar (including "Non lues") — noted above as a
> separate, larger UI feature, deliberately not attempted this run.

> On 2026-08-17 **Live presence dot on conversation-list rows shipped** (slice
> `conversation-list-presence-dot`, feature-parity §B). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed three unrelated open PRs (#3113, #3156, #3160 — all wrong
> branch naming for this routine, other agents' work, untouched). `df -h /` showed 10 Gi free,
> stable.
>
> **The "backend never wired" heuristic is now genuinely exhausted** — a dedicated Explore agent
> swept all ~140 public methods across `sdk-core`/`core/*` and found nothing. Pivoted to a new
> strategy: reading `feature-parity.md` directly for `[~]` (partially-done) lines whose own notes
> name a small, still-open sub-gap. A second Explore agent surfaced 3 candidates; the strongest
> (`PostRepository.requestTranslation` never wired) turned out **bigger than assessed on
> re-proof** — unlike the chat message twin (`MessageRepository.requestTranslation`, a direct
> client-side translate + cache-merge), the post version fires a request server-side and the
> translation arrives back via a `post:translation-updated` socket event that isn't wired on
> Android's `SocialSocketManager` AT ALL — a 3-part system (socket event + cache merge + UI across
> 2 ViewModels), not a thin slice. Correctly deferred rather than force-fit into one run.
>
> **Picked the genuinely small candidate instead**: `- [~] Live presence dot on a direct
> conversation's row/header` — its own note from the 2026-08-12 foundation slice
> (`conversation-list-live-presence`) says plainly "UI wiring... is NOT done this run", with the
> ViewModel-side plumbing (`ConversationListUiState.presenceStateFor(conversation, now):
> PresenceState?`, already gated to direct-only, already 5 dedicated tests) fully ready to consume.
>
> **The wiring turned out to be pure parameter-threading, no new logic**: `MeeshyAvatar` (`:sdk-ui`)
> already accepts a `presence: PresenceState?` parameter and already RENDERS the dot overlay when
> given one — this capability shipped with the avatar atom itself and was simply never fed a live
> value from the conversation list (the Contacts tab's own presence dot predates this parameter and
> renders a separate `Surface`, an older pattern — not what I copied). Threaded `presence` through
> `ConversationRow` → `ConversationRowContent` → the existing `MeeshyAvatar(...)` call (3 Composable
> signatures, one new argument each), with `state.presenceStateFor(conversation, System
> .currentTimeMillis())` computed once at the list's row-builder closure.
>
> **Zero new tests** — deliberate, not an oversight: `TDD-COVERAGE.md` explicitly exempts
> `@Composable` parameter-threading/layout glue from the JVM red-first gate ("push all testable
> decisions out of the Composable into a pure function or the ViewModel, then cover that"). The one
> testable decision here, `presenceStateFor`, already carries its 5 dedicated
> `ConversationListViewModelTest` cases from the foundation slice — nothing new to decide, only to
> wire.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. Diff is a single file, 6 lines, `apps/android`-only.
>
> **Still open**: the chat header's own presence dot (a separate call site, iOS's
> `ConversationView` header) — not attempted this run, noted for a future slice.

> On 2026-08-17 **Mood status view/impression tracking shipped, closing feature-parity §G's
> last open clause** (slice `status-view-tracking`). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed two unrelated open PRs (#3113, #3156 — both wrong branch
> naming for this routine, other agents' work, untouched). `df -h /` had dropped to 3.0 Gi free
> (this worktree's own `apps/ios/Build` DerivedData from the prior iOS-debt item — 7.5 Gi,
> fully regenerable — deleted, restoring 10 Gi free before starting this slice).
>
> **Seventh candidate found via the "ready backend, never wired to UI" heuristic — but this time
> the heuristic itself came up EMPTY on a dedicated Explore agent pass.** A systematic sweep of
> all ~140 public methods across every `sdk-core`/`core/*` repository confirmed the codebase is
> now near-fully wired after 6 prior slices; the one live lead (`PostRepository.getPostViews`,
> flagged as a candidate by the previous run) was independently re-killed — not only zero Android
> call sites, but **zero iOS call sites either** (`PostViewersResponse`/`getPostViews` exist only
> in `PostService.swift` + its mock; no "who viewed this post" screen exists anywhere in the iOS
> app), so it has no parity reference and falls outside this routine's mandate entirely.
>
> **Pivoted to reading `feature-parity.md`'s remaining unchecked lines directly** (build order:
> the checklist itself, not another heuristic pass) and found `- [ ] Mood status create, react,
> delete; 21h expiry + viewer tracking` (§G) — a compound line where 4 of 5 clauses were already
> shipped in earlier slices, leaving only "viewer tracking" genuinely open. Reading iOS
> `StatusViewModel.swift` directly (not just the checklist wording) surfaced its own doc comment:
> "un mood EST un post… la barre de moods était le seul contenu du produit dont la portée restait
> à zéro" — a mood status carries `impressionCount`/`viewCount` exactly like a regular post, but no
> Android surface fed either.
>
> **Zero new mechanism invented — both building blocks already existed from this session's own
> earlier slices**: the pill's on-screen appearance now calls the new `StatusesViewModel
> .trackImpression(statusId)`, which delegates to the SAME `ImpressionBatcher` class the feed
> already uses (`source = "status"` this time, mirroring iOS's own per-surface `ImpressionBatcher
> (source: "status", ...)` instance — iOS uses one batcher per SwiftUI view too, not a shared
> singleton). Opening a status's popover — a single, per-viewer-deduplicated VIEW, distinct from
> the batched impression — now calls the new `markStatusViewed(statusId)`, whose body is the exact
> fire-and-forget shape of `PostDetailViewModel.recordView` from the `post-detail-reach-stats`
> slice two runs ago (launch, try/catch, silently swallow — best-effort analytics, matches iOS's
> `try?`).
>
> **Wiring point required zero extra gating logic**: `StatusBarView.kt`'s cell model already splits
> `StatusBarCell.MyStatus` (the viewer's own pill) from `StatusBarCell.Pill` (everyone else's) as
> two separate `when` branches — so adding the tracking calls only to the `Pill` branch naturally
> excludes the viewer's own status exactly as iOS's `viewModel.statuses.filter { $0.id !=
> viewModel.myStatus?.id }` does explicitly. `impressionBatcher.flushNowAsync()` wired into
> `onCleared()`, mirroring `FeedViewModel`'s own already-established pattern (not a new Compose
> `DisposableEffect`, even though iOS ties the flush to the SwiftUI view's `.onDisappear` — Android's
> established precedent for this exact need is ViewModel-level, so followed that instead of
> introducing a second pattern for the same problem).
>
> **+3 tests** (`StatusesViewModelTest`): a view is recorded exactly once when a status opens, a
> blank status id never hits the network, and a failed view record doesn't disturb the loaded bar.
> `trackImpression`'s own debounce/batch/retry logic is already fully covered by the existing
> `ImpressionBatcherTest` suite, so no duplicate ViewModel-level test was added — matching the
> precedent set by `FeedViewModel.trackImpression`, which also carries zero VM-level tests for the
> identical reason.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. No new strings needed (no new UI text — the pill/popover UI is unchanged, only its
> tracking side-effects). Diff confirmed `apps/android`-only via the working-tree diff (3 files,
> Kotlin only, no resources touched).
>
> **feature-parity.md §G line now fully checked** — all five clauses (create/react/delete/expiry/
> viewer-tracking) verified shipped with evidence, no longer a compound partial-credit line.

> On 2026-08-17 **Post view recording + author-only reach stats shipped** (slice
> `post-detail-reach-stats`, feature-parity §F). `gh pr list --state open --search "apps/android
> OR apps/ios"` showed one unrelated open PR (#3113, branch `claude/keen-hamilton-sqq310` — wrong
> naming convention for this routine, a different agent's iOS work, left untouched). `df -h /`
> showed 12 Gi free, stable.
>
> **Sixth candidate found via the "ready backend, never wired to UI" heuristic** — a dedicated
> Explore agent's OTHER suggestion from the previous run (`feed-comment-delete`), explicitly
> flagged there as needing a check before committing: `PostRepository.getPostViews` looked like it
> might overlap with the just-shipped `ImpressionBatcher`/`recordImpressions`. Read both iOS
> `PostService.swift` call sites directly to resolve the ambiguity: `viewPost` (`POST
> /posts/{id}/view`) records a single deduplicated per-viewer view and is fired from many iOS
> surfaces [Feed, ProfileUserPostsList, Reels, Statuses, PostDetail, Bookmarks];
> `recordImpressions` (`POST /posts/impressions/batch`) is a wholly separate batched engagement
> metric. No overlap — `viewPost` was a genuine, distinct, still-unwired gap.
>
> **Avoided shipping a dead end**: wiring `viewPost` alone would be invisible — nothing on Android
> reads or displays view counts. iOS pairs the write with a read: `PostDetailView.authorRevealView`
> shows an author-only "@pseudo · 👁 views · 📊 impressions" line via the pure `PostReachFormatter`.
> Shipped both halves together as one coherent vertical slice, matching how iOS itself scopes the
> feature — this is why the diff is larger than the last several single-field slices.
>
> **`PostDetailViewModel.recordView()`** fires `postRepository.viewPost(postId)` once from `init`
> (alongside the existing `loadInitial()`/`observeRealtime()`), fire-and-forget, failure silently
> swallowed — direct mirror of iOS's `.task { try? await PostService.shared.viewPost(...) }`, which
> fires regardless of whether the post GET itself succeeds (not gated on `loadInitial`'s success
> branch).
>
> **New pure `PostReachFormatter`** (`:feature:feed`): `compact(Int)` (1.2k/3.4M, faithfully ported
> including the `999_999 → "1000.0k"` boundary quirk baked into iOS's own `>= 1_000_000` check
> order — not "fixed", faithfully mirrored) and `components(username, isAuthor, viewCount,
> impressionCount)` (author-only gate: a non-author sees only `@pseudo`, never the counts).
>
> **`FeedPostPresentation`** gained `authorUsername`/`viewCount`/`impressionCount`/`isAuthor`
> (derived in `FeedPostBuilder.build(currentUserId:)`, same additive-trailing-param pattern used
> for `CommentPresentation.isOwn` in the previous slice — every other call site [`FeedViewModel`,
> `BookmarksViewModel`, `UserPostsViewModel`] defaults to `currentUserId = null` → `isAuthor =
> false`, harmless since only `PostDetailScreen` renders the reach line). New `ApiPost
> .impressionCount` field alongside the pre-existing `viewCount` (`:core:model`, already a real
> gateway field per the iOS `APIPost` decoder, just never modeled on Android).
>
> **New `PostReachLine` composable** in `PostDetailScreen.kt`, rendered beneath the author
> name/timestamp column, gated on `reach.pseudo != null || reach.views != null` (mirror of iOS's
> own gate) — a completely blank post carries neither.
>
> **+14 tests**: `PostReachFormatterTest` (6 — compact below/at-boundary/millions, author/non-author
> components, blank-username pseudo). `FeedPostBuilderTest` (5 — null-coerced counts, pass-through
> counts, raw username exposure, isAuthor true/false/no-author/no-current-user). `PostDetailViewModelTest`
> (3 — view recorded exactly once on open, blank postId never records, a failed record doesn't
> disturb the already-loaded post) + 2 more folded into the existing isAuthor-projection coverage.
> One pre-existing direct `FeedPostPresentation(...)` constructor call (`FeedMediaGalleryTest`, not
> going through `FeedPostBuilder.build`) updated with the four new fields.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. EN/FR/ES/PT strings added (`feed_post_reach_a11y`). Diff confirmed `apps/android`-only via
> the working-tree diff.
>
> **Still open**: iOS also renders this same reach line in a second spot (`PostDetailView`'s
> collapsed floating-header reveal, sharing the same `PostReachFormatter` call) — Android's
> `PostDetailScreen` has no collapsing-header treatment yet, so only the inline placement was
> ported. Dwell-time tracking (noted in the previous impression-batching slice) remains open too.

> On 2026-08-17 **Viewer-initiated comment delete shipped** (slice `feed-comment-delete`,
> feature-parity §F). `gh pr list --state open --search "apps/android OR apps/ios"` showed zero
> open PRs. `df -h /` showed 9.0 Gi free, stable.
>
> **Fifth candidate found via the "ready backend, never wired to UI" heuristic**, this time via a
> dedicated Explore agent (the previous four obvious candidates were exhausted). It searched every
> public method across `sdk-core`/`core-*` repositories for zero call sites in `feature`/`app`,
> cross-checked against tests and an iOS reference. `PostRepository.deleteComment(postId,
> commentId)` was the strongest hit: fully implemented, unlike its already-wired siblings
> `likeComment`/`unlikeComment` in the exact same repository. The agent's other candidate
> (`PostRepository.getPostViews`) was set aside — plausible overlap with the just-shipped
> `ImpressionBatcher`/`recordImpressions` needs checking server-side before committing to it, left
> for a future run.
>
> **Read the iOS reference directly rather than trusting the checklist line**: `FeedCommentsSheet
> .deleteHandler(for:)` gates the delete option to `c.authorId == me` — no confirmation dialog, a
> single tap on the destructive-role menu item fires the delete immediately with optimistic removal
> and full rollback on failure (`deleteComment` in the same file, lines ~2012-2058).
>
> **Reused the existing socket-driven removal transition instead of duplicating it**: `PostCommentsViewModel`
> already had a private `onCommentDeleted(commentId)` wired to the live `comment:deleted` socket event
> — top-level comment removed + its reply thread purged, or a reply removed + its parent's `replyCount`
> decremented. The new public `deleteComment(commentId)` snapshots `thread.value`/`replies.value` (both
> plain immutable data classes, so a snapshot is just holding the old reference), calls the SAME
> `onCommentDeleted(commentId)` for the optimistic removal, then either confirms silently on success or
> restores both snapshots + surfaces `status.error` on failure/exception. Zero duplicated removal logic.
>
> **New `CommentPresentation.isOwn: Boolean`**, derived in `CommentProjection.build(currentUserId:)`
> by comparing `comment.author?.id` to the signed-in user's id (passed from `PostCommentsViewModel
> .project()`'s already-available `inputs.user?.id`). The existing `CommentProjectionTest` call sites
> were untouched — `currentUserId` defaults to `null` (never own), a purely additive trailing param.
>
> **New `CommentDeleteButton`** (trash icon, same minimalist pill style as the existing like/reply
> buttons), wired ONCE inside the shared `CommentRow` composable and gated on `comment.isOwn` — since
> `ReplyThread` already reuses `CommentRow` for its reply rows, this single wire point covers both
> top-level comments and replies with no duplication.
>
> **+9 tests**: `CommentProjectionTest` — `isOwn` true when the author id matches, false for a
> mismatched/missing author or a null current user id. `PostCommentsViewModelTest` — top-level delete
> (state updates + repository call verified), reply delete (parent `replyCount` decrements), rollback +
> `errorMessage` on a network failure, and three inert guards (blank postId, blank commentId, an unknown
> comment id — all zero network calls). Mirrors the existing socket-path `onCommentDeleted` test suite's
> exact scenarios, proving the two paths converge on identical outcomes.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. EN/FR/ES/PT strings added (`post_comments_delete_action`). Diff confirmed `apps/android`-only
> via the working-tree diff (not `main...HEAD`, which carries unrelated commits from other PRs merged
> to `main` in this shared repo since this branch point).

> On 2026-08-17 **Invite by email shipped** (slice `discover-email-invite`, feature-parity §J).
> `gh pr list --state open --search "apps/android OR apps/ios"` showed zero open PRs. `df -h /`
> showed 9.2 Gi free, stable.
>
> **Picked up the strongest candidate the previous slice's Explore agent had surfaced but
> deliberately deferred**: `FriendRepository.sendEmailInvitation(email) → NetworkResult<
> EmailInvitationResponse>`, fully implemented and tested at repository level, zero call sites
> anywhere in `apps/android`. Fourth slice this session found via the "ready backend, never
> wired to UI" heuristic (after `PostApi.recordImpressions`, `CachePolicy.Notifications`,
> `PostRepository.pinPost`).
>
> **Corrected a stale conclusion from an earlier session**: a prior search for an iOS reference
> had only checked `InviteFriendsSheet.swift` (a conversation-scoped share-link sheet) and
> concluded no clear iOS counterpart existed. The real reference is
> `Features/Contacts/DiscoverViewModel.swift`'s `sendEmailInvitation()` +
> `DiscoverTab.swift`'s `emailInviteCard` — a dedicated email-invite card at the top of the
> Discover tab, entirely separate from `InviteFriendsSheet`.
>
> **Ported the exact iOS state shape**: `DiscoverUiState` gained `emailText`/`isSendingInvite`/
> `inviteErrorMessage` (mirrors `@Published var emailText`/`isSendingInvite`); `sendEmailInvitation()`
> trims, guards non-empty, guards against a second call while one is in flight, clears the field
> on success, and keeps the address for retry on failure — same as iOS's
> `try await friendService.sendEmailInvitation(email:)` do/catch.
>
> **Deliberately narrower than iOS**: iOS shows a toast (`FeedbackToastManager.shared.showSuccess/
> showError`) on both outcomes. Android's Discover module has **zero** toast/snackbar
> infrastructure — confirmed via an exhaustive grep across `apps/android/feature` for
> `successMessage`/`SnackbarHost`/`showSuccess`/`Toast.`/`MeeshySnackbar`/`SnackbarHostState`
> (zero matches). Rather than inventing new toast infra for this slice (scope discipline),
> success feedback is implicit (field clears + Send button disables) and failure surfaces as an
> inline `Text` beside the card via the new `inviteErrorMessage` field. This is deliberately NOT
> the existing `errorMessage` field on `DiscoverUiState` — that one drives a full-screen
> `ErrorState` composable that would wrongly hijack the whole Discover tab for a transient invite
> failure.
>
> **New `EmailInviteCard` composable** in `DiscoverTab.kt`: icon + title row, `OutlinedTextField`
> (email keyboard, no autocorrect/autocapitalize) + `Button` (disabled when
> `emailText.isEmpty() || isSendingInvite`, with an accessibility label), inline error `Text`
> below when `inviteErrorMessage != null`. Sits above the search field, matching iOS's
> `inviteSection` position at the top of the Discover scroll.
>
> **+4 tests** (`DiscoverViewModelTest`): trimmed address sent + field cleared on success; blank
> address never hits the network; error surfaces + address kept for retry; a second call while
> one is in flight is a no-op (verified via a `CompletableDeferred` held open across both calls).
>
> **Verified**: RED confirmed for the right reason (compile errors — the 4 new tests referenced
> members that didn't exist yet), GREEN after implementation, then `./apps/android/meeshy.sh
> check` (assembleDebug + testDebugUnitTest, all modules) green. EN/FR/ES/PT strings added (5
> keys: title, placeholder, send, send accessibility label, error).
>
> **Still open, left for a future slice**: SMS invite and phone-contacts import — no Android
> SMS-compose or contacts-permission surface exists yet; the checklist line covers all three but
> only email was in scope here.

> On 2026-08-17 **Post pin (own posts) shipped** (slice `feed-pin-own-post`, feature-parity §F).
> `gh pr list --state open --search "apps/android OR apps/ios"` showed three concurrent PRs
> (#3123, #3096, #3108), none touching `apps/android`. `df -h /` showed 10 Gi free, stable.
>
> **Found via the same "ready backend, never wired" heuristic that worked twice already this
> session** — this time via an Explore agent search across every `sdk-core` repository for
> public methods with zero call sites anywhere in `apps/android/feature`/`apps/android/app`.
> Returned several candidates; `PostRepository.pinPost`/`unpinPost` was the strongest: small
> scope, an existing tested hook point (`PostActionMenu`, already pure and covered), and a real
> user-visible action (not an internal-only endpoint). The agent also surfaced and I independently
> rejected: the entire `CommunityRepository` (zero screens exist for Communities at all — a whole
> sub-app, far too large), `UserService.getProfileByPhone`'s Android analogue (needs a dial-pad
> tab that doesn't exist), and `FriendRepository.sendEmailInvitation` (needs real new UI on the
> Discover screen — medium, kept as a candidate for a future run, not chosen this time).
>
> **RE-PROVED before assuming symmetry**: the checklist line says "pin-unpin" together, so the
> first assumption was a toggle (Pin ↔ Unpin, mirroring `Bookmark`/`Unbookmark`). Reading the
> iOS reference directly disproved this — `unpinPost` exists in `PostService` (the SDK protocol)
> but has **zero call sites anywhere in the iOS app** (`grep` confirmed). `onPin` is wired
> exactly like `onDelete` — `isOwnPost ? {...} : nil`, unconditional on the post's current pinned
> state, no unpin counterpart. Ported this exactly rather than inventing a more "complete" toggle
> UX iOS itself doesn't have — `PostAction.Pin` is a single, always-available (for own posts)
> action, and `PostRepository.unpinPost` stays unwired.
>
> **Reused the existing pure `PostActionMenu` hook point rather than a new mechanism**: `Post
> Action.Pin` slots in right before `Delete` (own-post actions), `PostActionMenuTest`'s existing
> exhaustive `containsExactly(...).inOrder()` assertion for the own-post case updated to include
> it — a source-guard-style test that would have failed loudly if the new action landed in the
> wrong position. `FeedViewModel.pinPost(postId)` mirrors `repost()`'s/`deletePost()`'s exact
> established shape (`NetworkResult.Success` → `postRepository.refresh()`; `Failure` →
> `errorMessage`) rather than inventing a new pattern for the third time.
>
> **+5 tests**: `PostActionMenuTest` — own-post ordering now includes `Pin` (was previously
> exactly Share/CopyLink/Repost/Bookmark/Delete, now has Pin before Delete), someone-else's post
> never offers Pin (new test, locks the own-post-only gate). `FeedViewModelTest` — `pinPost`
> delegates + refreshes on success, surfaces the error without refreshing on failure.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green. EN/FR/ES/PT strings added (`feed_action_pin`), matching the existing 4-locale
> baseline for every other action in the same menu.
>
> **Still open, noted honestly rather than silently left unchecked**: comment pin-unpin (a
> separate surface from post pin, not investigated this slice); quote-repost's own composer UI —
> `PostRepository.repost` already accepts `isQuote`/`content`, but `FeedScreen`'s current
> `onRepost` always calls the plain repost path; whether a quote-composer UI exists anywhere else
> in the app wasn't confirmed, left as a genuinely open question for a future run.

> On 2026-08-17 **Notification stale-while-revalidate cache shipped** (slice
> `notification-cache-first-stream`, feature-parity §M), closing the "still open" item left by
> the earlier `notification-realtime-socket` slice the same day. `gh pr list --state open
> --search "apps/android OR apps/ios"` showed three concurrent PRs (#3096, #3108, #3123), none
> touching `apps/android`. `df -h /` showed 9.0 Gi free, stable.
>
> **Found via a genuinely strong signal, not a guess**: grepped for the existing
> `CachePolicy.Notifications` constant (`freshFor` 60s, `keepFor` 24h) and confirmed ZERO usages
> anywhere in the codebase — someone had already anticipated this exact gap and left the policy
> ready to wire, which is exactly what this slice does.
>
> **`NotificationRepository.notificationsStream()` is a direct mirror of `PostRepository
> .feedStream()`** — same in-memory L1 `MutableStateFlow` cache, same `CacheResult.Empty/Fresh/
> Stale/Syncing` shape, same background-revalidate-on-staleness `combine().distinctUntilChanged()
> .transformLatest{}` chain. `NotificationsViewModel` is now a thin projector of this stream
> (plus the new `unreadCountStream`) rather than owning its own copy of the list.
>
> **A real, previously-undiscovered bug fixed as a genuine consequence of the refactor, not a
> bolt-on**: `unreadCount` had been dead since before this routine even started —
> `NotificationApi.unreadCount()` existed, was fully wired at the repository level, and was never
> once called (confirmed via `grep`, zero call sites). Once the stream became the single source
> of truth, populating it from the real server count was the natural design, not a separate fix.
>
> **A design decision forced by moving state ownership, caught during design rather than after
> shipping a bug**: once the ViewModel stopped holding its own copy of the notification list,
> `markAsRead`/`markAllAsRead`'s existing optimistic local-state mutation would have gone stale —
> a live socket arrival re-triggering the shared repository stream would have silently REVERTED
> an optimistic "marked as read" back to unread, since the repository's own cache never learned
> about the mutation. Fixed by moving the optimistic mutation (+ rollback-on-failure) INTO the
> repository itself, mirroring `PostRepository.toggleLike`'s exact established pattern. The
> real-time `prependLive` handler moved to the repository for the same reason — it needs to
> mutate the SAME cache every other write already does.
>
> **+10 tests** (`NotificationRepositoryTest`, new file, mirrors `PostRepositoryTest`'s Turbine
> harness): empty→fresh stream sequencing; refresh populates both the list cache and the unread
> count; `prependLive` prepends + bumps unread / doesn't bump when arriving pre-read / dedupes a
> duplicate id; `markAsRead` flips optimistically + decrements unread, with rollback-on-failure;
> `markAllAsRead` flips every entry + zeroes unread, with rollback-on-failure.
> **`NotificationsViewModelTest` rewritten** (9 tests) to match what the ViewModel actually still
> owns after the refactor — projecting each `CacheResult` variant into UI state, reflecting the
> unread-count stream, delegating `load`/`markAsRead`/`markAllRead`/a live arrival to the
> repository — since the dedup/rollback logic itself moved to (and is now tested at) the
> repository layer, duplicating those assertions at the ViewModel layer would just re-test the
> same behaviour through an extra layer of mocking.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green — confirmed no other call site of `NotificationRepository` outside
> `NotificationsViewModel`/`PushTokenHandler` (the latter untouched, `registerDeviceToken` only)
> regressed from the signature/behaviour changes.
>
> **Still open**: pagination / unread-only filter on the stream (serves the first page only,
> matching `list()`'s existing `limit=20` default) — not attempted, a separate item.

> On 2026-08-17 **Feed impression batching shipped** (slice `feed-impression-batching`,
> feature-parity §F). `gh pr list --state open --search "apps/android OR apps/ios"` showed two
> concurrent PRs (#3096, #3108), neither touching `apps/android`. `df -h /` showed ~10 Gi free,
> stable.
>
> **Picked after a targeted scan for a narrower candidate** — the previous two runs' toast
> orchestrator sub-slice needs a "which conversation/post is on screen" signal Android doesn't
> have yet (its own separate slice). Re-proof here found the network HALF of this checklist line
> already fully built and dormant: `PostApi.recordImpressions`/`PostRepository
> .recordImpressions(postIds, source)` existed end-to-end, tested, with zero call sites — a
> ready-made backend for a client that never used it.
>
> **`ImpressionBatcher` is a faithful port of iOS's real `ImpressionBatcher.swift`**, not a
> reinterpretation: impressions are counted per APPEARANCE (deliberately never deduplicated —
> `record` just appends, matching the gateway's own batch-`updateMany` semantics), a 3s debounce
> window that resets on every `record` (so continuous scrolling never flushes until it settles),
> `flushNow`/`flushNowAsync` for the "leaving the screen" case, and a failed send reinserts the
> batch at the FRONT so a retry sends the oldest occurrences first.
>
> **A real correctness bug caught before it shipped, not after**: the first draft passed
> `viewModelScope` into the batcher so `onCleared()` could call a suspend `flushNow()`. That
> races Android's own teardown order — `viewModelScope` is cancelled right after `onCleared()`
> returns, so a coroutine launched from inside `onCleared()` on that same scope has no
> guaranteed window to complete. Fixed by giving `ImpressionBatcher` its OWN default scope
> (`SupervisorJob() + Dispatchers.IO`, matching the exact pattern `SdkModule.kt`'s preference
> stores already use for their own independent scopes) plus a `flushNowAsync()` fire-and-forget
> entry point for the non-suspend `onCleared()` call site.
>
> **A build hiccup, not a design one**: `StandardTestDispatcher(...)` used as a TYPE annotation
> (`dispatcher: StandardTestDispatcher`) failed to resolve — it's a top-level FACTORY FUNCTION
> returning `TestDispatcher`, not a class; the constructor-call USAGE elsewhere in the same file
> compiled fine, only the type position broke. Fixed by typing the parameter `TestDispatcher`.
>
> **Wired into the existing composition-lifecycle hook already used for pagination**:
> `FeedScreen`'s `items(state.posts, key = { it.id })` block already had a
> `LaunchedEffect(post.id, state.posts.size) { viewModel.loadMoreIfNeeded(post.id) }` sibling —
> added `LaunchedEffect(post.id) { viewModel.trackImpression(post.id) }` right next to it rather
> than inventing a new visibility-detection mechanism.
>
> **+9 tests** (`ImpressionBatcherTest`): debounced flush fires after the delay / not before;
> records within the window group into one batch; repeat appearances aren't deduped; a blank id
> is a no-op; `flushNow` sends immediately and cancels the pending timer; `flushNow` on an empty
> batch is inert; `flushNowAsync` sends without being awaited; a failed flush keeps the batch
> pending for the next retry (verified end-to-end: fail once, then a second `record` + flush
> sends BOTH the retried and the new post together).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green. No `FeedViewModel`-level test added for the one-line `trackImpression`
> delegation — the real behaviour is already fully covered by `ImpressionBatcherTest`; adding a
> duplicate assertion at the ViewModel layer would just re-test the same logic through an extra
> layer of mocking.
>
> **Deliberately narrower than iOS's own three safety nets**: app-backgrounding flush and
> kill-survival persistence (UserDefaults replay on relaunch) are NOT ported — no equivalent
> Android wiring point exists yet for either. **Dwell-time tracking is untouched and separately
> scoped**: iOS's `EngagementTracker` is a materially bigger system (durable SQLite outbox,
> session pause/resume, qualification thresholds, its own `/posts/engagement/batch` endpoint) —
> a future slice, not attempted here.

> On 2026-08-17 **Notification toast decision core shipped** (slice
> `notification-toast-policy`, feature-parity §M), the second of the 3 sub-slices identified
> for "In-app real-time notification toast" (the real-time data feed, sub-slice 1, landed
> earlier the same day). `gh pr list --state open --search "apps/android OR apps/ios"` showed
> two concurrent PRs (#3096, #3108), neither touching `apps/android`. `df -h /` showed
> 10-11 Gi free, stable.
>
> **Deliberately trimmed mid-investigation after discovering the full port was bigger than
> expected.** Read iOS's real reference (`UserNotificationPreferences+Filter.swift`) in full:
> the per-type gate (`isTypeEnabled`) is an 80-case switch over `MeeshyNotificationType`, and
> two of its buckets (`callsEnabled`, `friendContentEnabled`) reference iOS-only preference
> fields that don't exist on Android's `UserNotificationPreferences` at all — porting it
> faithfully would mean inventing new preference toggles (+ their sync/persistence/Settings UI),
> real separate work, not something to smuggle into "the toast orchestrator." Cut the slice down
> to what's genuinely self-contained: active-screen suppression, dedup, and the push+DND gate —
> all three either brand-new pure logic or reuse of already-existing pure predicates, zero new
> preference fields, zero new Settings UI.
>
> **`NotificationToastPolicy.decide(...)` is a genuine extraction, not a straight port** — iOS's
> own `handleNewNotification` is an impure guard-chain (side effects and decision-making
> entangled), so there was no isolated pure Swift function to mirror 1:1; the Kotlin version is
> a first-time factoring of that logic into something testable. Precedence order matches iOS
> exactly: active-conversation/post suppression wins over EVERYTHING (even a duplicate delivery
> or push-disabled), then dedup, then push+DND.
>
> **The dedup check stays outside the pure function on purpose**: "was this notification id
> already shown in the last 2 seconds" is inherently a comparison against PRIOR calls (state),
> which doesn't belong in a single-call decision function — `decide()` takes a precomputed
> `isDuplicateDelivery: Boolean` instead, pushing the actual window-tracking to whichever
> stateful orchestrator wires this up next.
>
> **+8 tests** (`NotificationToastPolicyTest`): shows by default; suppresses when the
> conversation is already open; suppresses when the post is already open; a DIFFERENT open
> conversation does not suppress; deduplicates a duplicate delivery; blocks when push is
> disabled; blocks inside the DND window; active-screen suppression wins over both a duplicate
> flag AND push-disabled simultaneously (precedence proof).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green. Pure `:core:model` addition — no Robolectric/Hilt/Compose surface touched.
>
> **Still open**: the STATEFUL orchestrator wiring this pure core into
> `MessageSocketManager.notificationReceived` (dedup-window bookkeeping, 7s dismiss timer, a
> Hilt-singleton `CoroutineScope`, `onConversationOpened/Closed`/`onPostOpened/Closed` hooks —
> Android has no equivalent to iOS's `ConversationSocketHandler.init`/`deinit` lifecycle today,
> so wiring those hooks into `ChatViewModel`/post-detail is itself real work); the per-type
> toggle resolver (needs either the 80-case switch or a new raw-string→toggle mapping, plus
> possibly 2 new preference fields to reach full iOS parity); and sub-slice 3 (toast UI mount +
> tap-to-navigate, atom already exists unused in `:sdk-ui`).

> On 2026-08-17 **Real-time notification socket wiring shipped** (slice
> `notification-realtime-socket`, feature-parity §M). `gh pr list --state open --search
> "apps/android OR apps/ios"` showed three concurrent PRs (#3096, #3106, #3108), none touching
> `apps/android`. `df -h /` showed 9.0-11 Gi free, stable.
>
> **Landed after two rejected candidates, both re-proved fresh and found to be multi-slice
> epics rather than one-shots** — documented in `feature-parity.md` rather than silently
> dropped: "Code attachment viewer" (§P) needs ~30-language detection + a hand-rolled tokenizer
> + 2 themes + 3 UI surfaces (compact card, preview, fullscreen+copy), AND has no "file
> attachment" UI hook to attach to yet (the neighbouring "Document viewer" item is also `[ ]`);
> "In-app real-time notification toast" (§M) turned out to be exactly 3 sub-slices — data feed,
> dedup+dismiss+suppression orchestrator, UI mount+navigation — of which only the FIRST was
> genuinely bounded for one run. Chose to ship that first sub-slice on its own rather than force
> the whole epic or walk away with nothing.
>
> **The wiring itself mirrors an already-proven pattern exactly**: `MessageSocketManager`
> already has 26 listened events behind one generic `listen<T>(event, flow)` helper — adding
> `notification:new` was mechanical (`buf<ApiNotification>()`, expose as `SharedFlow`, one
> `listen(...)` line in `attach()`). Confirmed the gateway's socket payload (`NotificationService
> .ts`: `{ ...formatted, title, subtitle }` via `emitWithSeq`) is a strict superset of the
> already-existing `ApiNotification` REST shape (extra `title`/`subtitle`/`_seq` fields exist
> only for iOS's toast) — `MeeshyApi.json`'s `ignoreUnknownKeys = true` makes decoding straight
> into `ApiNotification` safe, so no separate wire-only type was needed.
>
> **`NotificationsViewModel` had zero live-update path before this** — `load()` was a one-shot
> REST call, `unreadCount` was never even populated from the server (still true after this
> slice — out of scope, not touched). Now `observeRealtime()` collects the new flow and
> prepends fresh notifications, deduping by id (a REST-list race or duplicate delivery is a
> no-op) and only bumping `unreadCount` when the incoming row isn't already read.
>
> **New test file, not a backfill**: `MessageSocketManager` has no existing test suite at all
> despite 26 events (unlike `SocialSocketManagerTest`/`CategorySocketManagerTest`, which do
> exist) — added `MessageSocketManagerNotificationTest` scoped to ONLY the new event, following
> `SocialSocketManagerTest`'s established Robolectric+Turbine harness pattern, rather than
> either skipping coverage or scope-creeping into the other 25 untested events.
>
> **+4 tests total**: `MessageSocketManagerNotificationTest` (payload decode);
> `NotificationsViewModelTest` ×3 (prepend+unread-bump, already-read doesn't bump, duplicate id
> is a no-op — extended the existing 3-test file's constructor call sites for the new
> `MessageSocketManager` dependency).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all
> modules) green.
>
> **Still open on this item**: SWR cache for the notification list (today's `list()` is plain
> REST, no `CacheResult`/Room layer) and pagination/unread-only filter; the toast UI itself
> (dedup+dismiss+suppression orchestrator + mount) — 2 of the 3 sub-slices identified above.

> On 2026-08-17 **Share-target lot 2 (image/video attachments) shipped** (slice
> `share-target-media-attachments`), closing out the Android Share-Sheet receiver started by the
> previous run's lot 1. `gh pr list --state open --search "apps/android OR apps/ios"` showed
> three concurrent PRs (#3096, #3106, #3108), none touching `apps/android`. `df -h /` showed
> 9.0 Gi free, stable.
>
> **RE-PROVED the previous run's own "needs the TUS upload pipeline" note before touching
> anything — it did not survive contact with the real code.** An Explore agent traced the actual
> chat-attachment send path (`ChatViewModel.sendFileAttachment`, the code the composer's own
> photo/video picker calls) and found it enqueues through `MediaUploadQueue.enqueue(item)` with a
> **`null`** `TusUploadContext` — the doc-comment on `MediaUploadQueue.enqueue` says this uploads
> via `MediaRepository`/`POST /attachments/upload`, never TUS. Android's TUS pipeline
> (`TusUploadRepository`/`TusApi`) is scoped to post/story/status/comment media only; message
> attachments never touched it on either platform — iOS's own `ShareSender.swift` has zero
> TUS/attachment code (`grep` empty), confirming the earlier note was a mis-citation of a *product
> intention* from `apps/ios/CLAUDE.md`, not a verified technical constraint. This flips the slice
> from "blocked on an unbuilt pipeline" to "a same-day extension of lot 1."
>
> **Reused the exact existing chat-attachment shape rather than inventing a parallel one.**
> `ShareTargetActivity`'s manifest gained two more `ACTION_SEND` intent-filters (`image/*`,
> `video/*`) alongside the existing `text/plain` one; the inbound `Intent.EXTRA_STREAM` Uri is
> read into bytes off the main thread (`withContext(Dispatchers.IO)` inside a `LaunchedEffect` in
> `ShareTargetScreen`, so a large shared video never blocks the screen from drawing) via
> `readPickedAttachment(context, uri)` — the SAME helper `ChatScreen.kt`'s own system-picker
> callback already used, flipped from `private` to `internal` so `ShareTargetScreen.kt` (same
> module, different file) can call it directly instead of duplicating the ContentResolver glue.
> `ShareTargetViewModel.loadAttachment(bytes, fileName, declaredMimeType)` mirrors
> `sendFileAttachment`'s own mime-resolution (`MimeTypeResolver.resolve`) and `sendTo` mirrors its
> send shape exactly: `MediaUploadQueue.enqueue` → `MessageRepository.sendOptimistic` with
> `messageType`/`attachmentUploadCmids`/`attachments` populated from `AttachmentMessageType.forMime`.
>
> **A share with only an attachment and no text is no longer inert** — `sendTo`'s guard changed
> from "blank text → inert" to "blank text AND no attachment → inert," since an image/video share
> commonly carries no caption at all.
>
> **+4 tests** (`ShareTargetViewModelTest`): an attachment upload+send carries the correct
> `messageType`/`attachmentUploadCmids`; an attachment with blank shared text still sends; mime
> resolves from the file extension when the platform declares none (`declaredMimeType = null`);
> empty bytes (`loadAttachment`) are a no-op, mirroring `sendFileAttachment`'s own empty-bytes
> guard.
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> green. `:app:compileDebugKotlin` checked explicitly (manifest + `ShareTargetActivity`'s
> `IntentCompat.getParcelableExtra` wiring live there). One build hiccup caught and fixed before
> the check run: a KDoc comment that literally wrote `` `image/*` `` triggered Kotlin's nested
> block-comment parsing (`/*` inside a `/** */` doc IS a nested comment start in Kotlin, unlike
> Java) → "Unclosed comment" — rewritten to avoid a bare `/*` sequence in prose.
>
> **Still open: `ACTION_SEND_MULTIPLE`** (several images/videos shared at once from a gallery
> multi-select) — deliberately deferred, not investigated in detail; single-item share (by far the
> common case) is now fully covered by lots 1+2.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (unchanged from before this PR's CI wait,
> `streak=1`, no race) → advances to `lane=ANDROID android_streak=2
> last_run=share-target-media-attachments`.

> On 2026-08-17 **Share-target lot 1 (text/URL) shipped** (slice `share-target-text-url`) —
> Android's counterpart to iOS's own `MeeshyShareExtension`, from a fresh section scan
> (`§O Links`) rather than re-attacking the four candidates the previous run had already
> documented as rejected/ambiguous (`gh pr list --state open --search "apps/android OR
> apps/ios"` showed 4 concurrent PRs, none touching `apps/android`; `df -h /` showed 8.4 Gi free,
> stable after the previous run's proactive cleanup).
>
> **Chosen after scanning "I. Communities" (entirely `[ ]`, 7 items — a whole unbuilt sub-app,
> too large) and "N. Search" (Global/local FTS search — both `[ ]`, need query-routing across 3
> domains — also too large) before landing on "O. Links"**, which turned out almost entirely
> `[x]` already (the share-link management vertical is complete) except for one genuinely
> well-scoped, high-value gap: "Generic in-app share picker / Android Share-Sheet receiver".
>
> **Re-proved against both the iOS reference AND Android's own existing infrastructure before
> writing anything.** `apps/ios/CLAUDE.md` documents `MeeshyShareExtension` in detail, including
> its own explicit phased scope: "Portée lot 1 : texte + URL" — images/video are iOS's OWN
> deferred lot 2, giving this slice a scope boundary to mirror rather than invent. Confirmed
> Android has ZERO share-target capability (`grep` for `ACTION_SEND` across the whole app found
> only OUTBOUND uses — the app sharing OUT via other apps' share sheets — never an inbound
> `<intent-filter>`).
>
> **Deliberately simpler than the iOS reference, and the PROGRESS entry says why**: iOS's
> extension is a separate PROCESS (a genuine app extension target) that cannot see the main app's
> in-memory session, so it reads an App Group Keychain session directly and relays a failed send
> through its own dedicated `ShareSender`/`SharePendingSendConsumer` queue. Android's share target
> is just another `Activity` in the SAME process/APK — no App Group equivalent needed, and no new
> offline-relay machinery either: `MessageRepository.sendOptimistic` (already used by the whole
> rest of the app) already durably queues through the existing outbox on a failed send, for free.
>
> **Reused two pieces of existing infrastructure wholesale rather than reinventing them**: the
> conversation picker's filtering rule is `ForwardTargets.of(...)` — the EXACT pure SSOT
> `ChatViewModel`'s own message-forward sheet already uses (a source conversation id of `""`
> simply never matches any real conversation, so nothing gets excluded) — and the send call is
> the same `MessageRepository.sendOptimistic` every other send path in the app uses. Zero new
> pure-logic types were needed beyond the `ShareTargetUiState`/`ShareTargetViewModel` shell
> itself.
>
> **Picks exactly ONE conversation and finishes** (`isFinished` closes the Activity) — unlike the
> in-app forward sheet, which is deliberately multi-target ("forward one message to several
> conversations in one sitting"). A share arriving from another app is a single-shot platform
> convention (matching both Android's own share-sheet UX expectations and iOS's own single-target
> extension), so no multi-select state was carried over from `ForwardUiState`.
>
> **+7 tests** (`ShareTargetViewModelTest`): picker populates from the cache-first conversation
> stream; query filters by title; a successful send marks the target sent, clears the sending
> flag, and sets `isFinished`; a second target while the first send is in flight is a no-op;
> blank shared text never hits the network; no signed-in user never hits the network; a failed
> send surfaces the error and clears the sending flag without finishing.
>
> **Verified**: Android SDK available in this container — `./apps/android/meeshy.sh check`
> (assembleDebug + testDebugUnitTest, all modules) green before any push. `:app:compileDebugKotlin`
> checked explicitly too (the new Activity/manifest wiring lives there, outside the usual
> `:feature:*` test scope).
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (unchanged from before this PR's CI wait,
> `streak=0`, no race) → advances to `lane=ANDROID android_streak=1 last_run=share-target-text-url`.

> On 2026-08-16 **No code shipped — the four remaining named candidates were re-proved and each
> found genuinely too large, too ambiguous, or non-functional even on iOS, documented here so a
> future run doesn't repeat the same investigation** (streak was 4, this was meant to be the 5th
> Android slice before alternation). `gh pr list --state open --search "apps/android OR
> apps/ios"` showed three concurrent PRs (#3096, #3106, #3108), none touching `apps/android`.
> `df -h /` confirmed 11 Gi free (stable since the earlier disk-full incident, not re-triggered).
>
> **"Conversation info sheet" §C, re-scoped this time as instructed — still too large.** Read
> iOS `ConversationInfoSheet.swift` (1291 lines) directly: 4 tabs (`.members`/`.media`/`.plus`/
> `.preferences`), and **every tab's underlying capability already exists on Android in a
> different shape** — `.members` → the `ConversationMembersSheet` this routine already built
> (roster + promote/demote/remove/ban); `.media` → the existing `ConversationMediaGallery`;
> `.preferences` → `ConversationPreferencesTab.swift` turns out to be exactly customName +
> reaction + tags + pin + mute + archive, ALL already shipped standalone in earlier slices
> (`conversation-custom-name`, `conversation-favorite-reaction`, `conversation-tags-preference`).
> The only tab with a genuine Android gap is `.plus` (`ConversationDashboardView`, an analytics
> dashboard — itself unexplored, potentially its own large item). **The real remaining work is
> the CONTAINER** — a hero header + tab-navigation shell aggregating pieces that already exist —
> which doesn't decompose into a smaller *useful* slice: a hero header alone renders nothing
> without tabs to sit above, and a tab shell alone has nothing to switch between without content.
> Left open; a future attempt should scope it as "the container screen, wiring already-built
> pieces" as ONE deliberately-UI-heavy slice, not a logic-TDD slice like most of this routine's
> other work — different risk/testing profile, worth a dedicated run.
>
> **"Invite by email; invite by SMS; import phone contacts" (§J) — scope is genuinely ambiguous,
> not just large.** Traced the only iOS file matching "invite" (`InviteFriendsSheet.swift`, 733
> lines) and found it is a **conversation-scoped share-link sheet** (`CreateShareLinkRequest
> .conversationId: String`, required) presented via the native `UIActivityViewController` share
> sheet — email/SMS are just share-sheet TARGETS, not dedicated composers (`grep` for
> `MFMailComposeViewController`/`MFMessageComposeViewController` found zero iOS call sites).
> Android **already has this exact feature** (`ShareLinkRepository`, `LinkApi`, `ShareLink`
> model — confirmed built). So the checklist line under "J. Contacts & Friends" cannot mean
> conversation share links; it must mean a distinct "invite a new person to the app" flow
> (referral-style), for which no Android OR clearly-identified iOS reference was found in the
> time available. Needs product clarification before it's a re-attackable item — noted rather
> than guessed at.
>
> **Voice-profile management (§K) — confirmed genuinely unbuilt, confirmed genuinely large.**
> Android has only the `VoiceProfile` model (`:core:model`), zero ViewModel/repository/screen.
> iOS's reference is two full screens (`VoiceProfileWizardView` + `VoiceProfileManageView`) with
> real audio recording (≥3 samples, 18+ age gate, GDPR delete-all) — needs microphone access this
> container cannot exercise meaningfully in a JVM unit test. Left for a dedicated slice.
>
> **"Transcription" settings section (§L) — investigated down to the wire, and the wire wasn't
> there.** Traced `prefs.audio.autoTranscribeIncoming` (the toggle's backing field,
> `packages/MeeshySDK/Models/PreferenceModels.swift`) with a `grep` across the WHOLE iOS+SDK tree:
> it is read/written **only** by the settings toggle itself — nothing in the transcription
> pipeline ever reads it to gate real behaviour. The "engine" row beneath it is `EmptyView()`
> content — also decorative. Porting this section would replicate a non-functional iOS toggle,
> not real feature parity; not pursued. (Would otherwise have been a clean win — Android's
> established per-domain `DataStore` pattern, `PrivacyPreferencesStore.kt`, was ready to mirror
> almost verbatim for a hypothetical wired preference.)
>
> **Decision**: rather than force a low-value or speculative change onto one of these, or lower
> this run's bar for what counts as a "bounded, re-proved, valuable" slice, this run closes with
> documentation only — the same discipline the `IOS_DETTE` lane's Run #6/#10 already established
> for exactly this situation. `tasks/lane-cursor.md` → `lane=ANDROID android_streak=5
> last_run=android-backlog-reverification-2026-08-16` — streak explicitly advanced to the
> alternation threshold anyway (an investigation-only run still consumed an Android-lane
> iteration, and the alternation rule's own escape hatch, "lane Android bloquée", already applies
> here) — **the next run switches to `IOS_DETTE`.**

> On 2026-08-16 **Member ban shipped** (slice `conversation-member-ban`). `gh pr list --state
> open --search "apps/android OR apps/ios"` showed three concurrent PRs (#3096, #3105, #3106),
> none touching `apps/android` — no collision.
>
> **The previous run's own note — "ban/unban: iOS doesn't wire them in this view either" — was
> re-checked rather than trusted, and turned out half-wrong.** `grep -rln "banParticipant"
> apps/ios/Meeshy` found `MemberManagementSection.swift`, a SECOND, independent member-management
> surface (embedded in `ConversationInfoSheet`'s settings sheet, not `ParticipantsView` —
> confirmed by tracing `@ObservedObject var viewModel: ConversationSettingsViewModel` to its
> declaration, which — surprisingly — lives in `packages/MeeshySDK/Sources/MeeshyUI/Conversation/
> ConversationSettingsView.swift`, not `apps/ios`) that DOES wire a one-tap ban action. iOS
> genuinely has two parallel, non-identical member-management screens; the previous note only
> checked the one Android had already ported. Confirmed `unbanParticipant` exists as a fully
> wired SDK method with **zero** call sites anywhere in `apps/ios` — that half of the note holds.
>
> **Chose to extend the existing `ConversationMembersSheet` rather than port the second iOS
> screen.** Android already collapsed iOS's `ParticipantsView` + `MemberManagementSection` into
> one sheet; re-splitting them to exactly mirror iOS's own (arguably redundant) duplication would
> add a screen with no Android-side reason to exist. Ban fits as a fourth row action alongside the
> three already there.
>
> **The rank gate is genuinely stricter than removal's, and the tests prove it rather than assert
> it once**: iOS's ban guard is `currentUserRole > targetRole && currentUserRole.hasMinimumRole(
> .admin)` — an admin may remove ANY non-creator member (existing `canRemove` behaviour, unchanged)
> but may only ban someone STRICTLY below their own rank, so an admin cannot ban a peer admin.
> `MemberModeration.canBan` ranks by `.level`, not Kotlin's default enum `Comparable` (which
> follows declaration order — `CREATOR` first — backwards from the actual hierarchy); a docstring
> in the source explains why, so a future reader doesn't reach for `>` on the enum directly.
>
> **No confirmation dialog on iOS for either expel or ban** (`Button(role: .destructive)` fires
> immediately) — Android's own `removeMember` already confirms first, an existing Android-side
> safety margin beyond the iOS reference. Ban gets the same treatment for consistency within
> Android's own UI rather than reproducing the gap.
>
> **+6 tests**: `MemberModerationTest` ×5 (self-ban blocked, creator bans everyone below,
> admin-cannot-ban-admin — the one that actually distinguishes this from `canRemove` — admin can
> ban moderators/members, moderator and plain member can ban nobody);
> `ConversationMembersViewModelTest` ×3 (optimistic drop + send, refusal rollback, the viewer-role
> gate offering ban on moderators but not peer admins).
>
> **Verified**: `./apps/android/meeshy.sh check` (assembleDebug + testDebugUnitTest, all modules)
> run before any push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (unchanged from before this PR's CI wait,
> `streak=3`, no race) → advances to `lane=ANDROID android_streak=4
> last_run=conversation-member-ban`. **At streak=4, one more Android run before the alternation
> rule fires — the NEXT slice after this one switches to `IOS_DETTE`.**
>
> A mid-run disk-full incident (root `/` hit 0 bytes free, blocking even the Bash tool's own
> output writes) was resolved by asking the user to clear `~/Library/Developer/Xcode/
> DerivedData` + this worktree's own `apps/ios/Build` via the `!` shell-escape prefix — no code
> or diff impact, noted here only because it's the second such disk-contention incident this
> session's memory record knows about.

> On 2026-08-16 **"Add member" shipped, closing the last open gap in conversation member
> moderation** (slice `add-participant-sheet`). `gh pr list --state open --search "apps/android
> OR apps/ios"` showed one concurrent PR (#3096, realtime/gateway+iOS+web) not touching
> `apps/android` — no collision. With all three room-join follow-ups closed by the previous run,
> re-proved the two candidates that PROGRESS.md itself had named as still-open: "Conversation
> info sheet" §C (a large multi-tab containing screen — deferred, too big for one slice without
> its own decomposition) and "Add member" (named by `conversation-members-roster` as its own
> follow-up, already scoped to one concrete iOS reference file) — chose the latter.
>
> **Re-proved the gap and the exact shape before writing anything.** `ConversationApi`/
> `ConversationRepository` had `participants`/`updateParticipantRole`/`removeParticipant` but no
> `addParticipant` — confirmed by reading the interface directly, not assuming from the checklist
> line. Read the gateway route (`routes/conversations/participants.ts`, `POST
> /conversations/:id/participants`, body `{userId}`, `addMemberRoles =
> ['creator','admin','moderator']`) and the iOS reference (`AddParticipantSheet.swift`) directly
> rather than trusting the feature-parity paraphrase — confirmed the exact search shape (debounced,
> `/users/search?q=&limit=20`, 2-char floor), the add flow (`POST .../participants` with
> `{userId}`, track added ids locally, `onAdded()` callback to refresh the caller), and the
> visibility gate (`ParticipantsView.canManageMembers = isAdmin || isModerator`, `isAdmin` itself
> `hasMinimumRole(.admin)` — so moderator-or-above, matching the gateway's own role list exactly).
>
> **Reused existing infrastructure rather than reinventing it**: `UserRepository.searchUsers`
> (built in an earlier `user-search-pagination` slice) needed no changes: the debounce/floor
> shape is a direct copy of `NewConversationViewModel`'s already-established pattern, and
> `MemberRole.hasMinimumRole` (already existed, named identically to the iOS reference) is the
> visibility gate — zero new pure-logic types were needed beyond the two DTOs
> (`AddParticipantRequest`, `AddParticipantRow`/`AddParticipantUiState`).
>
> **The "Add" button per row is deliberately not multi-select** (unlike `NewConversationViewModel`,
> which IS multi-select for starting a group) — matches iOS exactly: each tap fires its own
> request immediately, tracked per-user (`isAdding`/`isMember`) so a double-tap mid-flight is a
> no-op and a refusal rolls that one row back to offering the button again with the server's
> message surfaced, without disturbing any other row's state.
>
> **+8 tests**: `ConversationRepositoryTest` ×2 (forwards ids, folds a refusal into a Failure —
> same shape as the existing `removeParticipant`/`updateParticipantRole` pairs);
> `AddParticipantViewModelTest` ×6 (debounced search populates rows, a sub-floor query never hits
> the network, an existing member is flagged and never offered the button, a successful add marks
> the row a member and fires `onAdded`, a refused add rolls back and surfaces the error, a repeat
> tap while the first call is in flight is a no-op).
>
> **Verified**: Android SDK available in this container — `./apps/android/meeshy.sh check`
> (assembleDebug + testDebugUnitTest, all modules) run before any push.
>
> `tasks/lane-cursor.md` → re-read fresh at merge time (see the recurring note on this pattern in
> the `reels-realtime-room` entry further below) → unchanged from before this PR's CI wait
> (`streak=2`), so this run advances it cleanly to `lane=ANDROID android_streak=3
> last_run=add-participant-sheet`.
>
> **`Test shared` failed on this PR's CI too — 3rd consecutive Android run** — same root cause
> as the previous two: `focus-curve.test.ts` (Focal curve-math), confirmed broken on `main`'s own
> CI across multiple consecutive commits during this PR's wait (`d87f59b34`, `0612c8caac`, both
> `conclusion: failure`) — an actively-in-progress concurrent Focal tuning session (the numeric
> assertion targets themselves kept shifting between runs), not a one-off regression. Landed for
> real between this PR opening and merging (`packages/shared/utils/focus-curve.ts` touched again
> by the merge of PR #3102). `Android` (the actual merge gate) was green all three times — noting
> this explicitly a third time in case the pattern is worth a future dedicated look (e.g. should
> `Test shared` even run on an `apps/android`-only diff at all?), not because it blocked anything.

