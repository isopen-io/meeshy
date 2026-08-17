# Progress — state & what to do next

> Older entries archived in `PROGRESS-archive-2026-08.md` (prepend/newest-first, same convention).

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

