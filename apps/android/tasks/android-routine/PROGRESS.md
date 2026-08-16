# Progress — state & what to do next

> On 2026-08-16 **Reel-viewer realtime room shipped** (slice `reels-realtime-room`) — the first
> of the three follow-ups the previous slice (`post-detail-realtime-room`) explicitly deferred,
> taken up deliberately rather than re-grepping for a fresh candidate: this routine's own standing
> rule is to build on the prior run, and that run left a named, scoped, three-item list.
>
> **The gap is worse here than it was in post detail, and the gateway says so itself.**
> `ReelsViewModel` had NO realtime handling of any kind — no `post:join`, no listener, its like
> counter moved only through `toggleLike`'s optimistic arithmetic and never healed. Post detail at
> least half-worked by incidental fallback (comments dual-broadcast to friend-feed rooms); the reel
> viewer has no such luck, because `getReels` ranks by **affinity** and deliberately serves reels
> from authors the viewer does *not* follow — so there is no friend feed room to fall back to, and
> `post:liked`/`post:unliked` target `ROOMS.post` exclusively (`PostReactionHandler.ts`). Re-read
> the gateway before writing anything, and its `commentBroadcastRooms` doc comment names the
> occupant outright: « la post room (`ROOMS.post`) où se trouvent les viewers du détail / **reel
> viewer** qui ne sont PAS amis de l'auteur ». Android's reel viewer was the one client that never
> showed up.
>
> **`setCurrentReel(reelId: String?)` mirrors iOS `ReelsViewModel.currentId`'s `didSet`** —
> leave the reel scrolled away from, join the one landed on. Idempotent (re-settling on the same id
> is a no-op) and blank-safe (`""`/`null` leaves without joining), so it is safe to call on every
> settle. The cursor lives in a plain private field, not in `ReelsUiState`: it is a subscription
> cursor, not something the UI renders. `onCleared()` leaves the last room, matching
> `PostDetailViewModel`'s own precedent.
>
> **Live like state reuses the established `mine: Boolean?` convention** rather than inventing one:
> `likesCount` is the gateway's ABSOLUTE post-mutation count so applying it unconditionally *heals*
> optimistic drift, while `isLiked` moves only when `event.userId` is the viewer's own id (another
> user's like moves the number, never the heart). Same shape as `PostDetailViewModel.LiveOverlay`
> and `FeedRealtimeHead.like`. Events naming a reel outside the loaded thread are inert for free —
> `updateReel` maps by id.
>
> **`ReelsScreen` drives it from `snapshotFlow { pagerState.currentPage }`** (the `ChatScreen`
> precedent for pager/list-geometry → ViewModel), keyed on the reel **ids** and not on
> `state.reels`: the state list is a fresh instance on every optimistic like, so keying the
> `LaunchedEffect` on it would restart the effect on every heart tap. `List<String>` structural
> equality restarts it exactly when the thread actually changes.
>
> **Deliberately still scoped**: iOS also joins this room from `StoryViewerView` and
> `FeedCommentsSheet`. Those remain the last two of the deferred three, re-recorded in
> `feature-parity.md` rather than quietly absorbed — each has its own current-item lifecycle.
>
> **+12 tests — the `:feature:reels` module's FIRST test file** (it shipped with the test
> dependencies declared and zero tests): join on settle; leave-then-join in order on a page change;
> no re-join on re-settle; a blank/null id never joins; `null` after a join still leaves; a
> viewer-own like/unlike moves count and heart; another user's like moves count only; a live
> absolute count heals an optimistic toggle's drift; a live like touches only the reel it names;
> an out-of-thread event is inert; a negative absolute count is clamped; an anonymous viewer never
> has a like attributed to them.
>
> **Verified**: local Gradle is **unavailable in this container** (`dl.google.com` → `CONNECT
> tunnel failed, response 403`, re-confirmed this run — `sdkmanager` cannot bootstrap, so no Gradle
> task can run at all). Per `ROUTINE.md` §CI reality the **Android** check is the compiler for this
> run; the gate is CI-green, recorded below, and nothing was merged before it.
>
> **Merge conflict resolved BY HAND while this PR sat in CI** — `main` gained 9 commits, two of
> them Android-lane runs from concurrent sessions (`datastore-test-deterministic-scheduler` →
> streak=5, `feed-thumbhash-placeholder` → streak=6). Production code and `feature-parity.md`
> auto-merged cleanly; the three conflicts were all tracking files and all the classic
> simultaneous-prepend/append shape, so **both sides were kept** in every case (`PROGRESS.md`:
> this entry first, being the later merge; `NOTES.md`: this run's three lessons appended after the
> other session's, per its oldest-first convention).
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=7 last_run=reels-realtime-room`.
> **Note the counter arithmetic, since three Android runs landed the same day**: taking this run's
> own draft value (`5`) would have *regressed* `main`'s `6` and silently erased another session's
> increment. The streak counts consecutive ANDROID runs, so the merge continues it rather than
> restating it. It is well past the alternation threshold (≥ 5) either way — the NEXT run switches
> to `IOS_DETTE`.

> On 2026-08-16 **the DataStore test flake was closed at its mechanism, not at its threshold**
> (slice `datastore-test-deterministic-scheduler`) — a **test-only** slice, taken because this
> routine's own throughput was paying for it: the flake had recurred **five** times across the two
> preceding slices, on **four different files**, and `rerun-failed-jobs` is 403 for this token on
> `android.yml`, so every occurrence cost a fresh push rather than a retry.
>
> **Chosen over a feature slice deliberately, and the choice is the one `NOTES.md` already
> prescribed.** Three consecutive entries there root-caused the flake and each one closed by naming
> the same follow-up — *"remove wall-clock time from the assertion; inject the dispatcher/scope so
> the test drives a controlled scheduler"* — and each one deferred it for the same reason: it was a
> refactor of files the slice under way did not own. Making it *the* slice removes that objection
> entirely. It is also the one shape of unverifiable-Kotlin risk this container can honestly take:
> the diff is test sources only, and the Android CI check is both the compiler and the very system
> whose stability is under repair.
>
> **What was actually wrong.** Every `DataStore*Store` publishes
> `dataStore.data.map { … }.stateIn(scope, SharingStarted.Eagerly, DEFAULT)`, and every durable test
> built that scope as `CoroutineScope(SupervisorJob() + Dispatchers.IO)`. An assertion shaped
> `first { predicate }` therefore could not complete until the sharing coroutine was *scheduled on a
> real thread pool* — on a runner executing the whole monorepo matrix at once, an unbounded wait.
> `withTimeout(15_000)` did not bound that wait, it only priced it. The price was raised once
> (`5_000` → `15_000`) and lost anyway, including on two files that had **always** been at the
> higher value and had never flaked. The constant was never the mechanism.
>
> **The fix removes the scheduling rather than budgeting for it.** New test-only
> `me.meeshy.sdk.testing.TestDataStores` hands out an `UnconfinedTestDispatcher` plus a scope built
> on it; the DataStore write actor and the `stateIn` collector then run **eagerly and inline on the
> test thread**, so there is nothing to be starved of CPU and no wall-clock bound is needed. Every
> `withTimeout(15_000)` is deleted — 19 occurrences, zero remaining in `sdk-core/src/test`.
> `runTest`'s own 60 s net (4× the bound it replaces) is what now catches a genuine hang.
>
> **The store scope is deliberately NOT the `TestScope`.** `TestDataStores.scope` carries its own
> unparented `SupervisorJob`, so the never-completing DataStore actor and `stateIn` collector are
> not children of the test coroutine and `runTest` cannot wait on them at teardown. That is the one
> way this pattern hangs, and it is designed out rather than hoped away. `@After` cancels the scope.
>
> **Swept all EIGHT files that drive a real DataStore, not just the four observed flaky.**
> `theme`, `media`, `notification`, `privacy`, `language`, `category` (the six that carried
> `withTimeout`) plus `chat/ConversationDraftStoreTest` and `session/AnonymousSessionStoreTest` —
> the latter two had never flaked *and had no timeout at all*, which makes them worse, not better:
> the same `Dispatchers.IO` exposure with a hang instead of a failure as the symptom. A partial
> sweep would have reproduced exactly the reasoning `NOTES.md` has now falsified three times
> ("these files are fine, they've never flaked").
>
> **Behaviour is untouched**: no production Kotlin in the diff, no test deleted, no assertion
> weakened, no coverage floor moved — 324 insertions / 465 deletions is the boilerplate
> (`newDataStore` helper, scope construction, `try`/`finally`, timeout wrappers) collapsing into one
> shared harness.
>
> **Verified**: local Gradle unavailable in this container (no Android SDK; `dl.google.com` returns
> `CONNECT tunnel failed, response 403`), so per `ROUTINE.md §CI reality` the **Android** check is
> the compiler and the gate. See the run log below for its result.
>
> **Next slice candidates (not attempted this run)**: `feature-parity.md` §C "Conversation info
> sheet" (hero/direct headers, members/media/stats/options tabs) — the members tab landed with
> `conversation-members-roster`, so the sheet itself is now the containing gap; and "Add member"
> (named by that slice as its own natural follow-up, still unchecked).
>
> **Two integrations of `main` while this PR sat in CI**, both resolved by hand. The first (7
> commits, iOS/SDK/web/gateway from the concurrent realtime cycle) touched not one file this diff
> touches and merged clean. The second brought a concurrent session's `post-detail-realtime-room`
> (PR #3092) and produced the now-familiar simultaneous-prepend conflict in this very file — both
> entries kept, this one placed first since it merged later chronologically, exactly as the
> `user-search-pagination` entry below records having done. `NOTES.md` and `feature-parity.md`
> auto-merged (verified: no corrupted lines).
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=5 last_run=datastore-test-deterministic-scheduler`
> — re-read at merge time, not at slice-selection time (it said 3 when this slice was chosen and 4
> by the time CI resolved). **At 5, rule 2(b) fires: the next run switches to the `IOS_DETTE`
> lane.** That is the intended behaviour, not an accident of the race — five consecutive Android
> slices is precisely the condition the alternation rule exists to interrupt.
>
> **The flake did not recur once across this PR's three CI cycles** (runs 31954283468, 31954583393,
> 31955399022) — the first Android CI in three PRs needing no rerun. Three green runs is evidence,
> not proof; the real test is the next dozen slices.

> On 2026-08-16 **First ThumbHash Coil placeholder wired — a month-old, fully-tested, zero-caller
> codec finally gets a consumer** (slice `feed-thumbhash-placeholder`) — advances §P's "ThumbHash
> blur placeholders for all media" line, discovered while scanning for the next well-scoped
> candidate (avoided PR #3093's territory — a concurrent session's Reels-side
> `post:join`/`post:leave` follow-up to my own `post-detail-realtime-room` slice; confirmed via
> `gh pr list` before picking anything post-room-related).
>
> **The gap, re-proved before starting**: `ThumbHash.encode`/`.decode` (`:core:model`) are both
> fully ported (Evan Wallace's reference algorithm), fully tested (34 existing tests), and their
> own doc comments explicitly reference "feature-parity §P" — yet an exhaustive grep found **zero
> call sites anywhere in the app**, for either direction. `ApiPostMedia.thumbHash: String?`
> already exists on the wire model too — but `FeedPostBuilder.build()`'s image projection silently
> dropped it, so even a caller reading the PROJECTED `FeedPostImage` (the type every feed
> Composable actually sees) had no way to reach the wire field at all. Three layers of "modeled
> but never wired," stacked.
>
> **New `ThumbHash.decodeBase64(String?): ThumbHashImage?`** (`:core:model`, pure) — base64-decodes
> the wire string and calls the existing `decode`, folding a blank/null value AND anything `decode`
> itself would throw on (malformed base64, a hash too short for its own header) into a plain
> `null` — the blur-placeholder call site should degrade to the existing flat-tint fallback, never
> crash on a bad hash. **New `rememberThumbHashPainter(base64): Painter?`** (`:sdk-ui`,
> `component/media/`, alongside the existing `MediaCollage`) — the ONE piece that has to touch
> `android.graphics.Bitmap` (manual ARGB packing from the raw `rgba` `ByteArray` — Compose has no
> built-in RGBA-buffer-to-`ImageBitmap` path), `remember`-cached per hash string, wrapped in
> `BitmapPainter`. Pure JVM logic (base64 + guards) stays in `:core:model`, so no new
> `testImplementation(libs.robolectric)` needed in `:sdk-ui` — only the genuinely
> Android-framework-touching sliver is UI glue, exempt per `TDD-COVERAGE.md`.
>
> **Wired into `FeedScreen`'s two image call sites** (`PostImageGrid`'s single-image path,
> `CollageTile`'s multi-image grid) as Coil `AsyncImage`'s `placeholder` parameter — no new Coil
> integration pattern needed, `placeholder: Painter?` is already a first-class `AsyncImage` param.
>
> **Scoped to feed post images only, everything else documented as a real follow-up, not silently
> dropped**: iOS's `CachedAsyncImage`/`MeeshyAvatar`/`StorySlideRenderer` all already consume
> ThumbHash for avatars, message attachments, and story slides — each a distinct call site needing
> its own wiring pass. Slide-level **generation** (encode → upload during story composition, the
> OTHER checklist line, §story composer) is a genuinely separate scope — write path vs. this
> slice's read path — not touched here.
>
> **+4 tests**: `ThumbHash.decodeBase64` round-trips through `encode` for a well-formed hash,
> returns `null` for null/blank, returns `null` for malformed base64 rather than throwing, returns
> `null` for a hash too short to decode rather than throwing; `FeedPostBuilder.build` carries
> `thumbHash` through the image projection (a genuine pre-existing test gap — `FeedPostBuilderTest`
> had zero image-projection coverage before this).
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 41s (970 actionable tasks,
> matching prior slices — no build-graph regression; the DataStore flake that recurred twice on the
> two prior PRs today did NOT reappear, consistent with the concurrent session's PR #3091 root-cause
> fix having merged in between), zero regressions.
>
> **A real merge conflict while this PR sat in CI**: the concurrent `datastore-test-deterministic-
> scheduler` slice (entry above) merged in between, bumping the cursor to `android_streak=5` and
> — per its own entry — arming rule 2(b) (`>= 5` switches the NEXT run to `IOS_DETTE`). This
> slice's own choice was made and its code written while the cursor legitimately read `4`, before
> that PR existed; discarding finished, tested, green work over a lane-counting race would be
> pure waste, so it ships as this run's ANDROID-lane completion — matching this file's own
> established precedent for exactly this class of race (see the `user-search-pagination` and
> `post-detail-realtime-room` entries below). The switch itself isn't skipped, only deferred one
> slice: the NEXT iteration reads the cursor fresh, sees `>= 5`, and bascules to `IOS_DETTE`.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=6 last_run=feed-thumbhash-placeholder`
> (re-read fresh at merge time, continuing the `datastore-test-deterministic-scheduler` entry's own
> count rather than the `4` this slice was chosen under).

> On 2026-08-16 **Post-detail room real-time subscriptions shipped** (slice
> `post-detail-realtime-room`) — closes `feature-parity.md`'s §"Post-detail room real-time
> subscriptions" line, discovered while scanning for the next well-scoped candidate after
> `user-search-pagination` (avoided duplicating the concurrent session's `conversation-members-
> roster`/`datastore-test-deterministic-scheduler` PRs — checked `gh pr list` first).
>
> **Genuine dead-but-half-wired gap, same shape as the day's earlier slices**: Android had
> ZERO `post:join`/`post:leave` anywhere (exhaustive grep), yet `PostDetailViewModel`'s own doc
> comment already claimed its comment-count badge was "kept honest by the same realtime room" —
> re-read the gateway to check whether that claim was even true. It only half was: the
> gateway's `SocialEventsHandler` dual-broadcasts `comment:added`/`comment:deleted` to BOTH
> `ROOMS.post` AND friend-feed-rooms (confirmed by the handler's own test name), so Android's
> listener worked by incidental fallback for a FRIEND's comment — but would silently miss a
> non-friend's, and would ALWAYS miss `post:liked`/`post:unliked`, since `PostReactionHandler`
> targets `ROOMS.post` exclusively with no feed-room fallback. `PostDetailViewModel` had zero
> like-related socket handling at all.
>
> **`SocialSocketManager.joinPostRoom`/`.leavePostRoom`** mirror iOS's `SocialSocketManager`
> exactly (`socketManager.emit("post:join"/"post:leave", {postId})`) — same `emit`+`JSONObject`
> pattern already established by `CallSignalManager`'s `call:join`/`call:leave` (mirrored, not
> invented). `PostDetailViewModel` now calls `joinPostRoom` from `observeRealtime()` (guarded on
> a non-blank route id, same guard already covering the comment listeners) and `leavePostRoom`
> from a new `onCleared()` override — the latter has no dedicated test, matching this codebase's
> own precedent (`ChatViewModel.onCleared()`'s `stopTypingEmission()` isn't unit-tested either;
> `protected` makes it awkward without reflection, and the join call already covers the
> behaviourally-interesting half).
>
> **Generalised the existing single-field live overlay into a small struct**: `liveCommentCount:
> Int?` → `LiveOverlay(commentCount, likeCount, isLiked)`, so a live `post:liked`/`post:unliked`
> resyncs `likeCount` unconditionally and `isLiked` ONLY when `event.userId` is the viewer's own
> id — mirroring `FeedViewModel`/`FeedRealtimeHead.like`'s already-established `mine: Boolean?`
> convention (`null` = someone else's action, count-only; a concrete value = the viewer's own
> echo, safe to overwrite). A `combine()` call can't cleanly grow past 5 flows without the
> array-based overload, so the struct keeps `init{}`'s `combine(rawPost, currentUser, activeCode,
> status, liveOverlay)` at 5 args instead of 6.
>
> **Deliberately scoped to `PostDetailScreen` only**: iOS's `joinPostRoom`/`leavePostRoom` are
> ALSO called from `ReelsViewModel`, `StoryViewerView`, and `FeedCommentsSheet` — each a distinct
> screen with its own current-item lifecycle (reels/stories track a "currently visible" id that
> changes on swipe, unlike post-detail's fixed route param). Documented as real, separate
> follow-ups in `feature-parity.md` rather than silently dropped — same judgment already applied
> twice today (`reaction`'s deferred autocomplete corpus, `tags`'s deferred `allTags` fetch).
>
> **+9 tests**: 2 `SocialSocketManagerTest` (`joinPostRoom`/`leavePostRoom` emit with the postId,
> `slot<JSONObject>()` capture — the established pattern from `CallSignalManagerTest`, since
> `org.json.JSONObject` has no `equals()` override so a captured-value assertion is required, not
> a direct `verify(eq(...))`), 7 `PostDetailViewModelTest` (joins on load; a blank route never
> joins; a viewer-own like/unlike updates count+`isLiked`; another user's like updates count
> only; a live like event for a different post is inert; a refresh drops the live overlay for
> fresh server truth).
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 35s (970 actionable
> tasks, matching prior slices — no build-graph regression), zero regressions.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=4 last_run=post-detail-realtime-room`
> (re-read at merge time, per the caution this file's own recent entries now record twice).

> On 2026-08-16 **User search pagination shipped, closing another dead-but-half-wired gap**
> (slice `user-search-pagination`) — same defect shape as `customName`/`reaction`/`tags` this same
> day, found on a totally different screen (the "new conversation" picker, not conversation
> preferences): `UserRepository.searchUsers(query, limit=20, offset=0)` already accepted
> `limit`/`offset`, the gateway's `GET /users/search` already computed a real
> `pagination.hasMore = offset + resultCount < total`, and a `pagedApiCall`/`PagedResult<T>` helper
> already existed in `:core:network` specifically to preserve that block instead of discarding it
> (the plain `apiCall` does) — but `NewConversationViewModel.runSearch` called the discarding
> variant and never exposed a "load more" trigger, so the picker permanently showed only the first
> 20 matches for any query.
>
> **RE-PROUVED before choosing this slice**: `feature-parity.md`'s "Conversation info sheet" /
> "Paginated member list" / "Member moderation" lines are already being closed by a concurrent
> session's open PR #3083 — checked its diff first to avoid duplicating work. "Conversation lock"
> (PIN entry UI + unlock flow) was assessed and correctly left alone: it's flagged in this file's
> own history as needing "its own scoping pass" (new screens, not a wiring gap), and forcing it into
> one run would violate the mechanical/bounded-risk bar the other candidates met. Scanned
> `feature-parity.md`'s shortest unchecked lines (a proxy for "single, atomic capability" vs.
> "multi-clause epic") and found `User search (paginated)` — confirmed the search itself already
> works (debounced, wired to `NewConversationScreen`) and only the "(paginated)" qualifier was the
> real gap, via the same three-file trace (repository → gateway route → paginator helper) already
> proven productive earlier this session.
>
> **Deliberately narrow, additive change — not a `searchUsers` signature change**:
> `UserRepository.searchUsers` has three OTHER call sites (`SuggestionsRepository`, `MentionSearch`,
> `DiscoverViewModel`, each with its own substantial test suite) that only ever need page one and
> have no use for `hasMore`. Added `searchUsersPaged` as a new, separate method instead of touching
> the existing one — zero blast radius on those three call sites' tests.
>
> **`NewConversationViewModel.loadMoreIfNeeded(userId)` mirrors an ALREADY-ESTABLISHED in-repo
> pattern** (`CallHistoryViewModel.loadMoreIfNeeded`) rather than inventing a new one: a plain,
> idempotent, non-suspend guard function called once per visible row during composition
> (`viewModel.loadMoreIfNeeded(user.id)` inside the `LazyColumn`'s `items{}` body, exactly like
> `CallHistoryScreen`'s own call site) — near-the-end-of-list threshold (`LOAD_MORE_THRESHOLD = 5`,
> same constant value), guarded on `hasMore`/`isLoadingMore` so it's safe to call on every
> recomposition of every row. Private `rawResults`/`nextOffset`/`currentQuery` ViewModel fields
> (not part of published `_state`) track the accumulator, mirroring `CallHistoryViewModel`'s own
> `pagedRecords`/`nextCursor` shape.
>
> **+7 tests**: 2 `UserRepositoryTest` (`searchUsersPaged` forwards query/offset and preserves the
> pagination block; folds a failed envelope into `Failure`), 5 `NewConversationViewModelTest`
> (a fresh search resets `hasMore`/offset; `loadMoreIfNeeded` appends the next page for a row near
> the end; is a no-op with no more data; is a no-op for a row far from the end) — the 7 pre-existing
> tests in this file were updated in place (their `searchUsers` stubs → `searchUsersPaged`, since
> `runSearch` now calls the paged method too, to know `hasMore` from page one).
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 31s (970 actionable tasks,
> matching prior slices — no build-graph regression), zero regressions.
>
> **Real merge conflict while this PR sat in CI** — a concurrent session's `conversation-members-
> roster` (PR #3083) merged to `main` first; resolved by hand in this file (classic simultaneous-
> prepend conflict, both entries kept, this one placed first since it merged later
> chronologically) — `feature-parity.md` and the production diff itself auto-merged cleanly
> (verified: no corrupted lines). Re-ran the full local gate after the merge (green, 50s) before
> re-pushing.
>
> **The already-documented DataStore timeout flake (`datastore-test-timeout-flake`, PR #3058)
> recurred TWICE on this PR's CI, on two DIFFERENT files each time** (1st:
> `MediaDownloadPreferencesStoreTest`/`NotificationPreferencesStoreTest`; 2nd: `ThemeStoreTest`) —
> both already carry `withTimeout(15_000)` (confirmed by grep before either rerun, not assumed),
> and neither file has any relation to this PR's diff. `gh run rerun --failed` resolved it both
> times. **Not yet at the "3+ recurrences" threshold** the earlier fix's own lesson sets for
> re-investigating (compare every DataStore test's timeout, not just the 6 already bumped) — but
> two occurrences on ONE PR's CI, each on a different file, is a stronger signal than the
> occasional single flake this fix was meant to close. Flagging as a genuine open question for a
> future run to watch: is 15s still enough headroom on the CI runner's current load, or does the
> fix need a wider sweep / a larger constant? Not investigated further this run — the two reruns
> resolved it, no code in this PR was implicated, and forcing an investigation here would have
> meant working on files this slice never touched.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=3 last_run=user-search-pagination`
> (re-read at merge time, not at slice-selection time — this run's own choice of ordering
> confirms the caution the concurrent `conversation-members-roster` entry below records:
> streak had already moved to 2 by the time this PR's CI resolved, so this entry lands at 3).

> On 2026-08-16 **Paginated conversation member list + role moderation shipped** (slice
> `conversation-members-roster`) — advances two adjacent `feature-parity.md` §C lines at once
> ("Paginated member list (infinite scroll + search)" → `[~]`, "Member moderation:
> promote/demote, expel, ban, add member" → `[~]`), the Android port of iOS `ParticipantsView`.
>
> **RE-PROVED before starting, and the re-proof changed the plan.** The prior run's own "Next
> slice candidates" list still nominated *"Change email / phone (two-step verification) — no UI
> screen consumes it anywhere"*. That is **stale**: `AccountContactViewModel` +
> `AccountContactViewModelTest` are live in `:feature:settings` and exercise `changeEmail` /
> `verifyEmailChange` / `resendEmailChangeVerification` / `changePhone` / `verifyPhoneChange`
> end-to-end. Yet another confirmation of the standing rule — a "Next slice" note is a
> hypothesis, not a fact. Re-scanned §C instead and found the genuine gap below.
>
> **Three independent symptoms of one hole**, each verified against real code before writing
> anything: (1) `PaginatedParticipant` / `PaginatedParticipantsResponse` /
> `PaginatedParticipantsPagination` were modelled in `:core:model` with **zero references
> anywhere** in the app; (2) `MessageSocketManager` listened to `participant:role-updated`,
> `conversation:participant-left` and `conversation:participant-banned` — three flows with **no
> consumer**; (3) a group member on Android simply could not see who else was in the
> conversation. The wire contract had been ported ahead of the screen, and the screen never
> landed.
>
> **Pure logic (`:core:model`)**: `MemberRoster` — an immutable cursor-page accumulator
> (`withFirstPage`/`withNextPage`/`withoutUser`/`withRole`/`displayCount`). Two rules it encodes
> that the **iOS reference leaves open**: it deduplicates ids repeated across pages (cursor
> pagination over a roster mutating underneath legitimately repeats a row), and it normalises
> `hasMore && nextCursor != null` — a server answering `hasMore: true, nextCursor: null` would
> otherwise make the list re-request page one forever. `MemberModeration` — `canRemove` /
> `roleActions`, a faithful port of `ParticipantsView.canRemoveParticipant` +
> `contextMenuItems`, mirroring the gateway's own checks in `routes/conversations/
> participants.ts` so no affordance is offered that would come back 403.
> `PaginatedParticipant.displayLabel`/`.role`/`.matches` port iOS's `name` fallback chain and
> identity matching.
>
> **Wire + repository**: `ConversationApi.participants` / `updateParticipantRole` /
> `removeParticipant`. `participants` deliberately stays **off** the shared `ApiResponse<T>`
> envelope — this route answers with a root-level *cursor* `pagination`
> (`nextCursor`/`hasMore`/`totalCount`) that the offset-shaped shared `Pagination` cannot
> express, and the gateway's own source comment records that changing it is a coordinated
> breaking change for iOS and web. The repository adapts it onto `apiCall` so transport/HTTP/
> parse failures fold into `NetworkResult.Failure` exactly like every other call. The role
> travels as `MemberRole.wireValue`, never a hand-written string.
>
> **ViewModel + UI**: `ConversationMembersViewModel` (load, debounced search at 300 ms,
> `loadMore`, optimistic role change, optimistic removal — both rolling back to the exact prior
> roster on refusal, per ARCHITECTURE.md §5; iOS applies only after the server answers) +
> `ConversationMembersSheet` reachable from a new **group-only** header action. Rebinding to a
> different conversation cancels the previous one's collectors, so a stale socket event can
> never mutate the new roster. Strings in all 4 locales (en/fr/es/pt).
>
> **+55 tests**: 14 `MemberRosterTest`, 14 `MemberModerationTest` (the full actor × target ×
> isSelf matrix for both removal and role changes, plus a guard that no offered action targets a
> role the gateway does not accept), 7 `PaginatedParticipantDisplayTest`, 11 new
> `ConversationRepositoryTest`, 20 `ConversationMembersViewModelTest`. No coverage floor
> lowered; the two `@Composable` files are UI glue, exempt per `TDD-COVERAGE.md`.
>
> **Cleanup carried in the same diff**: the five near-identical `ConversationApi` test fakes
> (~165 lines of copy-pasted stubs) now extend one `StubConversationApi` base answering "not
> wired" for everything, so each fake overrides only the call it is about — the next interface
> method costs one line instead of one per fake. Every stub a test actually exercises was
> checked before defaulting it.
>
> **Verified**: local `./apps/android/meeshy.sh check` **could not run** — this container has no
> Android SDK and the egress policy denies `dl.google.com` (403 on the `sdkmanager` bootstrap),
> the case `ROUTINE.md §CI reality` documents. CI's **Android (assemble + unit tests)** check is
> the compiler and the gate for PR #3083; not merged on anything less than green.
>
> **Next slice candidates (not attempted this run)**: **add member** (the natural follow-up —
> needs a user-search surface of its own, iOS reference is `AddParticipantSheet`) and
> **ban/unban** (`PATCH .../ban`/`.../unban` are live on the gateway and unwired on BOTH
> platforms — iOS does not wire them in `ParticipantsView` either, so this is a genuine
> both-platforms gap rather than an Android debt); conversation lock PIN-entry UI + hiding
> locked conversations from the list (storage foundation + logout wipe already shipped);
> ~~per-conversation reaction emoji / tags~~ — **both halves shipped in parallel while this slice
> sat in CI**: reaction emoji by `conversation-favorite-reaction` (PR #3082) and tags by
> `conversation-tags-preference` (PR #3085), which closes that `feature-parity.md` line entirely.
> Struck through rather than deleted: the candidate was real when written, and the pace at which it
> was overtaken is itself the lesson recorded below; on-device transcription for the Feed audio attachment (still the standing
> candidate, needs its own foundation).
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=2 last_run=conversation-members-roster`.
> **The cursor moved FOUR times under this run while it sat in CI** — the sharpest caution this run
> produced: it read `streak=4` at slice selection; `conversation-favorite-reaction` (PR #3082) took
> it to 5; an `IOS_DETTE` run (`ios-debt-backlog-reverification-2026-08-16`) then performed the
> `>= 5` bascule and reset it to **0**; and `conversation-tags-preference` (PR #3085) took it back
> to 1. So the bascule this entry originally predicted was claimed by another run, and this slice
> lands at **2**, not the 5/6 first written here. **Read `tasks/lane-cursor.md` at merge time, never
> from the value read at slice-selection time** — on a repo with concurrent routine runs the cursor
> is live state, and a CI wait long enough to absorb four flaky/queued runs is long enough for two
> other slices to ship. The same applies to every "Next slice candidate" this file records: two of
> the three this entry originally listed were shipped by other runs before it merged.

> On 2026-08-16 **Per-conversation tags shipped — closes the "Per-conversation preferences" line**
> (slice `conversation-tags-preference`) — the box is now checked: pin/category/mute/mentions-only
> (PR #3054), custom name (PR #3079), reaction (PR #3082) and now tags are all wired. Re-proved
> against real code before starting: unlike `customName`/`reaction`, NEITHER model field existed on
> Android at all yet — `ApiConversationPreferences.tags` and `ConversationPreferencesUpdate.tags`
> both had to be added from scratch (the gateway already supported `data.tags` on the write side —
> `services/gateway/src/routes/conversation-preferences.ts:440`).
>
> **iOS reference read in full**: `ConversationOptionsViewModel.setTags`/`.addTag`/`.removeTag`
> (`prefs.tags: [String]?`), rendered by `ConversationPreferencesTab`'s `TagInputField`, backed by
> `PreferenceService.getMyConversationTags()` — which has **no dedicated gateway endpoint**: it calls
> the existing `GET /user-preferences/conversations?limit=200` list and aggregates `tags` across
> every row client-side into a deduped, sorted autocomplete corpus (`allTags`).
>
> **Scope decision, made explicit rather than silently dropped**: implementing the full corpus-fetch
> + typeahead autocomplete in the same slice would have meant a second new REST integration path
> AND a new Compose autocomplete component — a materially bigger lift than `customName`/`reaction`
> (which only needed to wire ALREADY-modeled fields). Rather than force it into one run or skip
> `tags` again, shipped the CORE write path (repository → outbox → ViewModel → UI, no dead end) with
> a plain add/remove chip editor and explicitly deferred the autocomplete corpus as a documented
> follow-up — same judgment call already applied to `reaction` (iOS's own "Favori" submenu uses a
> small FIXED set, not its full categorized `EmojiFullPicker`, so matching iOS's simpler surface was
> correct there too, not corner-cutting).
>
> **No null-vs-empty-string sentinel needed** (unlike `customName`/`reaction`): tags is a `List<String>`
> field. `explicitNulls = false` only drops a Kotlin `null`; `[]` is a real, non-null JSON array value
> that always serializes — so `ConversationRepository.setTagsOptimistic` needs no clear-semantics
> workaround, just a normalize step (trim, drop blanks, `.distinct()` — first occurrence wins,
> matching iOS's own exact-match `contains` dedup rule).
>
> **Pure `ConversationTagsEditor.add`/`.remove`** (`feature/conversations`, mirrors
> `ConversationCategoryReassignment`'s placement precedent — app-side product logic, not an SDK
> atom) — the ONLY testable decision extracted out of the new dialog Composable per
> `TDD-COVERAGE.md`. UI: a "Tags" context-menu item opening an `AlertDialog` with a `TextField` +
> add `IconButton`, and a `FlowRow` (stable, already used elsewhere e.g.
> `RegistrationScreen`'s username-suggestion strip) of removable `InputChip`s (Material3, new to this
> codebase — trailing `Close` icon wired to `ConversationTagsEditor.remove`). Used
> `Icons.AutoMirrored.Filled.Label` (not the deprecated `Icons.Filled.Label`) for the menu item.
>
> **+9 tests**: 5 `ConversationTagsEditorTest` (add trims, add-blank no-ops, add-duplicate no-ops,
> remove drops, remove-absent no-ops), 3 `ConversationRepositoryTest` (sets + queues a snapshot with
> the normalized/deduped set, no-op when unchanged, clearing to `[]` sends a real empty JSON array —
> asserts the raw `"tags":[]` payload string), 1 `ConversationListViewModelTest` (`setTags` forwards
> the full set). The new dialog/chip UI is glue, exempt per `TDD-COVERAGE.md`.
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 59s (970 actionable tasks,
> matching prior slices — no build-graph regression), zero regressions.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=1 last_run=conversation-tags-preference`.

> On 2026-08-16 **Per-conversation favorite reaction shipped, fixing a genuinely dead filter tab**
> (slice `conversation-favorite-reaction`) — re-proved against real code before starting: the prior
> slice's own `PROGRESS.md`/`feature-parity.md` notes claimed "iOS has no real UI for `reaction`
> either", which turned out to be **wrong** on closer reading — `ConversationPreferencesTab.swift`
> has a real "Reaction" settings row (emoji picker sheet) and, more importantly,
> `ConversationListView+Overlays.swift` has a "Favori" context-menu submenu (fixed 8-emoji set
> ⭐️❤️🔥💎🎯✨🏆💡ﾠ+ "Retirer le favori", both routed through the same `setFavoriteReaction` →
> `store.apply(.setReaction(emoji))` mutation as the settings-tab picker — one field, two entry
> points). Corrected the stale note in place rather than silently overwriting it.
>
> **A second, stronger justification surfaced mid-investigation**: `ConversationFilter.FAVORITES`
> already exists as a user-visible filter chip on Android (`ConversationFilters.kt`), gated on
> `prefs?.reaction != null` — but grepping every write site found **zero** callers ever setting
> `ApiConversationPreferences.reaction`. The tab was live in the UI and permanently, silently empty
> for every user on every account — not a missing-feature gap but an active dead end, matching the
> orchestrator's "no dead ends, no orphan code" principle even more directly than a plain parity
> gap would.
>
> **Repository → outbox → flush pipeline**, mirroring `setCustomNameOptimistic`'s exact shape:
> `ConversationRepository.setReactionOptimistic(id, emoji: String?)` stores `emoji.orEmpty()` — a
> `null` argument (clear) becomes an explicit `""`, never a Kotlin `null`, for the same
> `explicitNulls = false` reason documented on `customName`. `ConversationPrefsPayload.reaction`
> (new field, doc-commented) threads through `OutboxFlushWorker`'s `UPDATE_CONVERSATION_PREFS`
> sender into `ConversationPreferencesUpdate.reaction` (already modeled on the wire, unused until
> now).
>
> **Read-side fix required by the same clear-as-empty-string convention**:
> `ConversationFilters.kt`'s `FAVORITES` branch changed from `prefs?.reaction != null` to
> `!prefs?.reaction.isNullOrBlank()` — otherwise a cleared favorite (`reaction = ""`) would have
> kept matching the filter, since `""` is non-null. Same blank-means-absent convention already
> established for `customName`.
>
> **UI**: a "Favorite" section in the context menu (between Rename and Move-to-category, matching
> iOS's Rename → Favori → Déplacer vers ordering) — 8 fixed emoji chips (identical set to iOS, for
> cross-platform consistency) + a conditional "Remove favorite" row shown only once one is set. No
> full categorized emoji picker (`sdk-ui`'s `EmojiFullPicker`) needed — iOS itself uses a small
> fixed set for this feature, not its full picker, so mirroring the SIMPLER iOS shape was the
> correct call, not a shortcut. Strings added in all 4 locales (en/fr/es/pt).
>
> **+6 tests**: 1 `ConversationFiltersTest` (blank reaction ≠ favorite), 3 `ConversationRepositoryTest`
> (sets + queues a snapshot, no-op when unchanged, clearing sends an explicit `"reaction":""` — same
> raw-JSON-payload assertion pattern as the `customName` clear test), 2 `ConversationListViewModelTest`
> (`setReaction` forwards an emoji / forwards `null` to clear). The new context-menu rows are UI
> glue, exempt per `TDD-COVERAGE.md`.
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 32s (970 actionable tasks,
> matching prior slices — no build-graph regression), zero regressions.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=5 last_run=conversation-favorite-reaction`
> — streak reaches 5: **next iteration bascules to the IOS_DETTE lane** per the alternation rule.

> On 2026-08-16 **Per-conversation custom name (rename) shipped** (slice
> `conversation-custom-name`) — advances `feature-parity.md`'s "Per-conversation preferences: custom
> name, reaction emoji, pin, category, tags, mute, mentions-only" line (still unchecked: reaction
> emoji and tags remain genuinely open on both platforms). Re-proved against real code before
> starting: `ApiConversationPreferences.customName`/`ConversationPreferencesUpdate.customName` were
> already modeled on the wire, but `ConversationPrefsPayload` (the outbox-lane snapshot payload)
> only carried `isPinned`/`isMuted`/`isArchived`/`mentionsOnly`/`categoryId` — `customName` never
> reached `OutboxFlushWorker`'s `ConversationPreferencesUpdate(...)` construction, so setting it
> locally would never have reached the server.
>
> **Clear-semantics gap resolved, not blocked**: an earlier finding this session flagged that
> `MeeshyApi.json`'s app-wide `explicitNulls = false` makes a Kotlin `null` field indistinguishable
> from "untouched" on the wire, which looked like it would make clearing an existing name
> inexpressible. Re-traced the actual read path and found `ConversationFilter.kt:69`
> (`resolvedPreferences?.customName?.takeIf { it.isNotBlank() }`) and `ApiConversation.displayTitle`
> (`ConversationAccent.kt:34`, same blank-check) already treat a blank `customName` the same as
> absent — so the write side never needs Kotlin `null` for "clear": `setCustomNameOptimistic` stores
> `name.trim()` verbatim, including an explicit `""` on clear, which the encoder does NOT drop
> (`explicitNulls` only suppresses actual `null`, not empty strings) and the gateway's
> `data.customName !== undefined` patch guard applies as a real clear.
>
> **Repository → outbox → flush pipeline**: `ConversationRepository.setCustomNameOptimistic(id, name)`
> (mirrors `setCategoryOptimistic`'s shape via the existing `updatePreferencesOptimistic` private
> helper) → `ConversationPrefsPayload.customName` (new field, doc-commented with the same
> null-vs-empty-string trick already documented on `categoryId`) → `OutboxFlushWorker`'s
> `UPDATE_CONVERSATION_PREFS` sender now threads `prefs.customName` into
> `ConversationPreferencesUpdate(...)`. Every prefs snapshot (pin/mute/archive/mentions/category)
> now also carries whatever `customName` happens to be cached, matching the established
> full-snapshot design already used for the other fields (not a per-field diff).
>
> **ViewModel + UI**: `ConversationListViewModel.setCustomName(id, name)` (via the existing
> `runPrefMutation` helper, same shape as `toggleMentionsOnly`). New context-menu action "Rename
> conversation" (between Archive and the category picker) opens an `AlertDialog` with a single-line
> `TextField` pre-filled with the conversation's current custom name (empty if none — placeholder
> shows the resolved display title), Save/Cancel. Strings added in all 4 locales (en/fr/es/pt).
>
> **+4 tests**: 3 `ConversationRepositoryTest` (sets+queues a snapshot carrying the trimmed name,
> no-op when unchanged, clearing to blank sends an explicit `"customName":""` — asserts the raw
> JSON payload string to prove the value isn't silently dropped by the `explicitNulls=false`
> encoder), 1 `ConversationListViewModelTest` (`setCustomName` forwards the trimmed name to the
> repository). The new context-menu item/dialog is UI glue, exempt per `TDD-COVERAGE.md`.
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 25s (970 actionable tasks,
> matching prior slices — no build-graph regression), zero regressions.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=4 last_run=conversation-custom-name`.

> On 2026-08-16 **Conversation "delete for everyone" (creator-only) shipped** (slice
> `conversation-delete-for-all`) — closes `feature-parity.md`'s "Leave / archive / delete-for-me /
> delete-for-all conversation" item; re-proved against real code before starting (per convention):
> `leave`/`deleteForMe`/`setArchivedOptimistic` were already live, `delete-for-all` was the one
> genuine gap (verified by grepping the gateway for a matching route and finding none under that
> name — the real endpoint is the plain creator-gated `DELETE /conversations/:id` in
> `routes/conversations/core.ts`, ported from iOS's `ConversationSettingsView.deleteConversationForAll`
> → `ConversationService.delete(conversationId:)`).
>
> **REST + repository + ViewModel**, mirroring the `leave`/`deleteForMe` shape exactly:
> `ConversationApi.deleteForAll` (`@DELETE("conversations/{id}")`) → `ConversationRepository.
> deleteForAll` → `ConversationListViewModel.deleteConversationForAll`. Gated client-side (server
> already enforces creator-only) via a new pure `ApiConversation.currentUserRole(currentUserId):
> MemberRole` extension (`:core:model`) — looks up the caller's own `ApiParticipant.role` in the
> conversation's roster, defaulting to `MEMBER` when absent, so no separate member-list fetch is
> needed to show/hide the menu item.
>
> **Real-time purge for every participant, not just the actor** — the genuinely new piece beyond a
> plain REST port: the gateway broadcasts `conversation:closed` (not `conversation:deleted`, which
> is `delete-for-me`-only and scoped to the caller's own devices) to the WHOLE roster. Android had
> zero handling of this event before this slice, even though iOS already wires it
> (`MessageSocketManager.conversationClosed` in `packages/MeeshySDK`). Added: `ConversationClosedSocketEvent`
> (`:core:model`, mirrors `ConversationDeletedSocketEvent`'s shape), a new `MessageSocketManager.
> conversationClosed` flow (`listen("conversation:closed", ...)`, same pattern as the 27 other
> listened events), `ConversationPurge.onConversationClosed` (pure, mirrors `onConversationDeleted`),
> and a `ConversationListViewModel` subscription purging + refreshing on receipt — without this,
> shipping the REST call alone would have been a dead end for every participant EXCEPT the actor
> (and even the actor's other devices).
>
> **New UI**: a third context-menu action "Delete for everyone", shown only when `isCreator`, with
> its own confirmation dialog (same shape as leave/delete-for-me's). Strings added in all 4 locales
> (en/fr/es/pt, matching the existing translation-complete convention for this screen).
>
> **+13 tests**: 4 `ConversationCurrentUserRoleTest` (creator/member/absent-user/not-in-roster), 2
> `ConversationPurgeTest` (`onConversationClosed` id-vs-blank), 4 `ConversationListViewModelTest`
> (`deleteConversationForAll` success/failure + `conversationClosed` purge/blank-inert — mirrors the
> existing `conversationDeleted` pair), 2 `ConversationRepositoryTest` (`deleteForAll` forwards
> id/folds failure), plus the 4 `ConversationApi` test fakes (`FakeConversationApi`/
> `RecordingSettingsApi`/`RecordingLeaveApi`/`RecordingDeleteForMeApi`) each updated with the new
> interface method and a new `RecordingDeleteForAllApi` added, mirroring `RecordingDeleteForMeApi`.
>
> **No coverage floor lowered**: all new pure logic (`currentUserRole`, `onConversationClosed`) has
> dedicated tests; the new `@Composable` menu item/dialog is UI glue, exempt per `TDD-COVERAGE.md`.
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 48s (970 actionable tasks,
> matching prior slices — no build-graph regression), zero regressions.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=3 last_run=conversation-delete-for-all`.

> On 2026-08-16 **`feature:feed`'s `ComposerLanguagePickerDialog` migrated to the shared
> `LanguagePickerDialog`** (slice `feed-composer-language-picker-shared`) — the explicit follow-up
> left open by the prior slice (`sdk-ui-language-picker-dialog`, PR #3070): the third and last of
> the three near-identical picker dialogs. `FeedComposerSheet.kt`'s own doc comment already said
> this dialog "mirrors `SettingsScreen`'s own `RegionalLanguageDialog` shape" — re-proved against
> the real code before starting: same `AlertDialog` + search field + scrollable radio-row-list
> shape, differing only in trivial layout details (a `Spacer` vs a `Text` start-padding for the
> row's inter-element gap — visually identical) and a case-insensitive `isSelected` match
> (`info.code.equals(currentCode, ignoreCase = true)`, vs the Settings pickers' exact match) —
> preserved verbatim by computing `isSelected` at the call site before handing options to the
> shared component, which stays agnostic of how a caller decides selection.
>
> **Behaviour-preserving, no new pure logic**: `ComposerLanguagePickerDialog` now builds a
> `List<LanguagePickerOption>` from `LanguageStepSelection.filter(query)` (already-tested pure
> catalogue/filter core, unchanged) and delegates rendering to `:sdk-ui`'s `LanguagePickerDialog`.
> The original had no empty-state text for a no-match search (unlike the regional picker) — not
> introduced here either (`emptyStateText` left unset, matching the shared component's designed
> fallback of an empty scrollable column, byte-for-byte the prior behaviour). Seven now-genuinely-
> unused imports removed from `FeedComposerSheet.kt` (`AlertDialog`, `RadioButton`,
> `heightIn`, `verticalScroll`, the `Search` icon, `Role`, `role`) — each checked file-wide for
> remaining uses before removal (`rememberScrollState`/`Icon`/`OutlinedTextField`/`semantics`/
> `contentDescription` all still used elsewhere in this large composer file and correctly kept).
>
> **All three near-identical language-picker dialogs are now unified** on the one `:sdk-ui`
> component (Settings' interface + regional pickers from the prior slice, Feed's composer picker
> this slice) — the standing candidate from the routine's backlog is fully closed.
>
> **No new tests**: `@Composable` UI glue exempt (`TDD-COVERAGE.md`); the logic this dialog renders
> (`LanguageStepSelection.filter`) already has its own tests, unchanged and still green.
>
> **Verified**: `./apps/android/meeshy.sh check` → `BUILD SUCCESSFUL` in 12s (incremental, most
> modules unaffected), zero regressions.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=2 last_run=feed-composer-language-picker-shared`.

> On 2026-08-16 **Shared `LanguagePickerDialog` extracted to `:sdk-ui`** (slice
> `sdk-ui-language-picker-dialog`) — first ANDROID slice after the IOS_DETTE bascule (streak
> reset to 0 following the critical Focal/Lentille iOS build-break fix, see
> `tasks/ios-debt-routine-progress.md`). Picked from the standing candidate noted in the prior
> ANDROID run's log ("a shared `:sdk-ui` `LanguagePickerDialog` (3 near-identical picker UIs now
> exist)") — re-proved against real code before starting (per convention): `feature:settings`'s
> `InterfaceLanguageDialog` and `RegionalLanguageDialog` (`SettingsScreen.kt`) both hand-rolled the
> same `AlertDialog` + scrollable radio-row-list shape, sharing the private `LanguageOptionRow`
> between them; `feature:feed`'s `ComposerLanguagePickerDialog` is the confirmed third
> near-identical dialog (its own doc comment explicitly says it "mirrors `SettingsScreen`'s own
> `RegionalLanguageDialog` shape") but is **deliberately left untouched this slice** — migrating
> three call sites across three feature modules in one pass was judged oversized for "one slice";
> the Settings pair (same file, same module, easiest safe first step) proves the shared component
> out with a real production consumer, and Feed's dialog is a natural, well-scoped follow-up.
>
> **New `LanguagePickerDialog` + `LanguagePickerOption`** (`:sdk-ui/component/`), matching the
> established SDK-purity convention already set by `LanguageQuickStrip`/`LanguageQuickOption` in
> the same package: opaque parameters only (a pre-formatted `label: String`, a nullable `code:
> String?` so a "use device default" sentinel option needs no SDK-side special-casing, and
> `isSelected: Boolean`), zero knowledge of `AppLanguage`/`RegionalLanguageOption`/any app model.
> Search is opt-in (`searchQuery`/`onSearchQueryChange` both nullable — omitted ⇒ plain list,
> present ⇒ search field + empty-state text), matching the real split between the two migrated
> call sites. Filtering itself stays exactly where it already lived (`RegionalLanguageSelection`,
> app-side pure object) — the SDK component never decides "how to filter", only renders whatever
> `options` it is handed, per the grain test.
>
> **Behaviour-preserving refactor, no new pure logic** — the two call sites now build a
> `List<LanguagePickerOption>` from the exact same source data (`AppLanguage.supportedLanguages` +
> a synthetic system option; `RegionalLanguageSelection.build(...).options` mapped 1:1) and pass it
> to the shared dialog; `RegionalLanguageDialog`'s `onSelect: (String) -> Unit` is bridged to the
> SDK's nullable `(String?) -> Unit` via `{ code -> code?.let(onSelect) }` (regional options never
> carry a null code in practice, so this is a safe, non-lossy bridge). `LanguageOptionRow` retired
> (its only two callers are gone). Two now-genuinely-unused imports removed (`RadioButton`,
> `heightIn`) — every other import touched by the diff was checked for remaining uses elsewhere in
> the (large, multi-section) `SettingsScreen.kt` file before removal, not assumed unused.
>
> **No new tests**: `@Composable` UI functions are exempt from the coverage rubric
> (`TDD-COVERAGE.md`) and this slice adds no new pure logic — the existing `SettingsViewModel`/
> `RegionalLanguageSelection` tests already cover 100% of the logic the dialog renders, and stay
> green unchanged (the refactor only moves *how* the same data gets drawn).
>
> **Verified**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** in 49s, all existing
> tests green, zero regressions. Reviewer (`REVIEWER.md`) self-run: **PASS** — diff is exactly 2
> files, both under `apps/android` (`git diff --stat main...HEAD`); SDK purity confirmed (opaque
> parameters, no singleton/domain-model coupling); SSOT respected (reuses
> `AppLanguage`/`RegionalLanguageSelection`, zero re-implementation); no coverage floor lowered, no
> test weakened.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=1 last_run=sdk-ui-language-picker-dialog`.

> On 2026-08-16 **DataStore-Flow test timeout flake fixed** (slice `datastore-test-timeout-flake`,
> PR #3058, merged `88997097c`) — this session's 5th ANDROID slice in a row, closing out the
> streak before the streak≥5 bascule to IOS_DETTE. Escalated from "flag as systemic" (prior run's
> wording, after the 4th occurrence) to an actual fix this run, rather than continuing to pay a
> ~3-minute rerun per affected PR indefinitely.
>
> **Root cause, confirmed via git history, not guessed**: `ThemeStoreTest`, `CategorySnapshotStoreTest`,
> `NotificationPreferencesStoreTest`, `InterfaceLanguageStoreTest` all assert on real
> DataStore-Flow collection (`runBlocking` — real wall-clock time, not `runTest`'s virtual clock)
> via `withTimeout(5_000)`. `git log -p` on `MediaDownloadPreferencesStoreTest`/
> `PrivacyPreferencesStoreTest` (this session's other two flake occurrences) showed they were
> authored from day one with `withTimeout(15_000)` for the IDENTICAL pattern and have never
> flaked. The remaining 4 files were written with the tighter `5_000` and have (severally)
> flaked. Bumped all 19 occurrences across the 4 files to `15_000`, matching the value this exact
> codebase already validated as sufficient — not an arbitrary guess.
>
> **No production code touched, so the usual TDD red→green didn't apply in its normal shape**:
> no new behavior, no assertion changed — only a safety-net timeout constant. Verification instead
> consisted of (1) confirming zero remaining `withTimeout(5_000)` occurrences repo-wide (grep), (2)
> re-running all 4 affected test classes locally post-bump (all green — consistent with the flake
> being CI-load-specific, never reproduced locally), (3) reasoning that raising a timeout can only
> give a genuinely-passing-but-slow assertion more time, never mask a truly broken one.
>
> **Result, observed live**: CI on this very PR ran the full `android.yml` + `ci.yml` matrix
> clean on the FIRST attempt — no `Android (assemble + unit tests)` retry needed, unlike every one
> of the 4 prior PRs this session that touched Android. Not proof the flake is gone forever (CI
> load is variable), but a strong first signal the fix addresses the actual mechanism.
>
> **Verified**: `./apps/android/meeshy.sh check` green locally (970 tasks, `BUILD SUCCESSFUL`); CI
> green on the first pass (16 checks pass/skip, PR #3058, zero reruns).
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=5 last_run=datastore-test-timeout-flake`
> — per the documented rule (`android-parity-ios-debt-agent-prompt.md`: "run ANDROID effectué →
> lane=ANDROID, android_streak += 1"), the ANDROID run itself always writes `lane=ANDROID`; the
> bascule to IOS_DETTE is a decision the NEXT run's Étape 0 makes upon reading `android_streak >= 5`,
> not something this run writes preemptively. Matches the exact state directly observed at the start
> of this session's prior bascule (`lane=ANDROID android_streak=5 last_run=conversation-lock-listview-scoping`
> going into `ios-debt-bubblegrid-displayscale`) — an earlier `PROGRESS.md` entry
> (`guest-join-web-deep-link`) phrased this differently (`lane=IOS_DETTE android_streak=0` written
> immediately), which contradicts both the documented rule and the directly-observed precedent;
> not corrected retroactively (out of scope for this slice), but not repeated here.


> On 2026-08-16 **Delete-for-me shipped** (slice `conversation-delete-for-me`, PR #3057, merged
> `ebabd7bde`) — three quarters of `feature-parity.md`'s "Leave / archive / delete-for-me /
> delete-for-all conversation" line now wired (archive/leave already shipped). Chosen as the
> natural continuation of `conversation-leave`: checked the gateway route
> (`routes/conversations/delete-for-me.ts`) first rather than assuming symmetry, and confirmed it
> shares the exact same client-side shape *despite* the route itself being considerably more
> complex server-side (creator-ownership transfer, empty-DM closing, successor promotion) — none
> of that complexity reaches the client. The route's final write emits `conversation:deleted`
> (`SERVER_EVENTS.CONVERSATION_DELETED`) to `ROOMS.user(userId)` — every one of the caller's own
> devices — with the exact payload shape `ConversationPurge.onConversationDeleted` already
> consumes (already wired for the socket/delete-for-all case). So, same as `leave`: **zero new
> purge logic**, just `ConversationApi.deleteForMe` (`DELETE conversations/{id}/delete-for-me`) +
> `ConversationRepository.deleteForMe` (direct `NetworkResult<Unit>`, mirrors `leave` exactly) +
> `ConversationListViewModel.deleteConversationForMe`. UI: a second context-menu item ("Delete for
> me", `DeleteForever` icon) with its own `AlertDialog` confirmation, right after "Leave" —
> message clarifies it only removes the conversation from the caller's own devices, other
> participants keep it (matches the route's actual semantics, not a generic "delete" wording that
> would misdescribe a personal-only removal).
>
> **TDD**: RED confirmed via compile failure (`deleteForMe` unresolved) before either the
> interface or the repository method existed. GREEN: 2 new `ConversationRepositoryTest` cases +
> 2 new `ConversationListViewModelTest` cases, same shape as `leave`'s.
>
> **CI flake — 4th occurrence this session, same signature.** The Android check failed on its
> first run: `NotificationPreferencesStoreTest.dataStore_hydratesAlreadyPersistedChoiceOnConstruction`,
> `kotlinx.coroutines.TimeoutCancellationException` — a file this diff never touches (the diff is
> entirely `ConversationApi`/`ConversationRepository`/`ConversationListViewModel`/
> `ConversationListScreen`, zero DataStore involvement). Same exact shape as the 3 prior
> occurrences this session (`ThemeStoreTest`, `MediaDownloadPreferencesStoreTest`,
> `PrivacyPreferencesStoreTest`, all `dataStore_*`-pattern tests under CI load). `gh run rerun
> <run-id> --failed` resolved it on the first retry, as it has every prior time. **This is now a
> 4/4 pattern in one session — worth escalating from "flag as systemic" (prior wording) to an
> actual dedicated backlog item**, since a fifth occurrence is likely and the routine keeps paying
> a full rerun (~3 min) per affected PR rather than fixing the root cause (a shared test
> helper's timeout too tight for a loaded CI runner, or a coroutine dispatcher difference — still
> unconfirmed, still not investigated).
>
> **Verified**: `./apps/android/meeshy.sh check` green locally (970 tasks, `BUILD SUCCESSFUL` —
> the local run never hit the flake, consistent with it being a CI-load-specific timing issue);
> CI green after the one rerun (16 checks pass/skip, PR #3057).
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=4 last_run=conversation-delete-for-me` —
> one more ANDROID slice before the streak≥5 bascule rule triggers IOS_DETTE.


> On 2026-08-16 **Leave conversation shipped** (slice `conversation-leave`, PR #3055, merged
> `32475f49f`) — one quarter of `feature-parity.md`'s "Leave / archive / delete-for-me /
> delete-for-all conversation" line (archive already existed; delete-for-me/delete-for-all remain
> open, separate scope — each likely needs its own endpoint and confirmation UX, not assumed to be
> a quick follow-up without checking first).
>
> **Chose this over completing `mentionsOnly`'s siblings** (customName/reaction/tags, flagged open
> at the end of the previous run): investigated all three first and found a genuine, confirmed
> blocker for customName/reaction — the shared network `Json` (`MeeshyApi.json`) sets
> `explicitNulls = false`, so a Kotlin `null` in `ConversationPreferencesUpdate.customName`/
> `.reaction` is OMITTED from the request body, indistinguishable from "field never touched." The
> gateway's patch logic (`conversation-preferences.ts`) treats a field as "leave alone" via
> `data.customName !== undefined` — meaning an explicit "clear my custom name" (a real iOS
> affordance: `setCustomName` maps an empty text field to `nil`) could **never reach the server**
> through the existing coalesced-snapshot outbox path (`ConversationPrefsPayload` →
> `ConversationPreferencesUpdate`, the same mechanism `conversation-mentions-only-preference` used
> successfully — booleans don't have this ambiguity, nullable strings do). `tags` is additionally
> not even present anywhere in the Kotlin model chain yet (unlike mentionsOnly, which only needed
> wiring — the field already existed everywhere). All three left open with this finding recorded,
> rather than risking a "looks-optimistic, silently-never-persists" clear path.
>
> **Chose `leave` instead** after confirming (gateway `routes/conversations/leave.ts` +
> `MessageSocketManager`/`ConversationPurge`) that the removal mechanism was **already fully built
> for the opposite direction**: `ConversationPurge.onParticipantLeft` already drops a conversation
> from the local list when `conversation:participant-left` names the CURRENT user — a path already
> exercised whenever another of this account's own devices leaves. The gateway's leave route
> broadcasts that exact event back to the leaver's own devices too (`audience = [...remaining,
> {id: participant.id, userId}]`), so the Android slice needed **zero new purge logic** — just the
> REST call. `ConversationApi.leave` (`POST conversations/{id}/leave`) + `ConversationRepository
> .leave` (direct `NetworkResult<Unit>` pass-through, mirrors `updateSettings`'s shape exactly, no
> outbox — a destructive action shouldn't silently retry offline) +
> `ConversationListViewModel.leaveConversation` (surfaces failure via `errorMessage`). UI: the
> context menu gains a "Leave" item behind an `AlertDialog` confirmation (title + message naming
> the conversation + Leave/Cancel), reusing the `Icons.AutoMirrored.Filled.Logout` icon that was
> imported but dead in this file before this slice.
>
> **TDD**: RED confirmed via compile failure (`leave` unresolved on both the interface and the
> repository) before either existed. GREEN: 2 new `ConversationRepositoryTest` cases (forwards the
> id + Success; folds an unsuccessful envelope into Failure) + 2 new
> `ConversationListViewModelTest` cases (calls the repository and clears any prior error; surfaces
> the error on failure).
>
> **Verified**: `./apps/android/meeshy.sh check` green (970 tasks, `BUILD SUCCESSFUL`); CI green
> independently (16 checks pass/skip, PR #3055).
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=3 last_run=conversation-leave`.


> On 2026-08-15 **Mentions-only per-conversation notification preference shipped** (slice
> `conversation-mentions-only-preference`, PR #3054, merged `b38764af0`). Picked instead of
> resuming `ConversationLock`'s swipe-action UI: investigated that UI mechanism first and found a
> concrete, platform-level reason it isn't a quick follow-up even now that the reactive state
> (previous slice) exists — Android's swipe surface is Material3 `SwipeToDismissBox`, which is
> hard-capped at exactly **two** directions (already spoken for: pin/archive), unlike iOS
> `SwipeableRow`'s arbitrary-length `leadingActions`/`trailingActions` array. Adding lock as a
> third swipe action isn't possible without redesigning the swipe surface itself (multi-action
> reveal drawer, or moving it to the long-press menu instead) — a genuine design decision, not a
> mechanical port, so left it for a dedicated pass rather than forcing it into one increment again.
>
> Picked `mentionsOnly` instead after confirming (via `feature-parity.md`'s "Per-conversation
> preferences" line + the Prisma schema) that the **data model and outbox-mutation infrastructure
> already fully supported it** — `ApiConversationPreferences.mentionsOnly` and
> `ConversationPrefsPayload.mentionsOnly` both already existed, unused. Added
> `ConversationRepository.setMentionsOnlyOptimistic` (mirrors `setMutedOptimistic` exactly, zero
> outbox/coalescing changes needed) and `ConversationListViewModel.toggleMentionsOnly` (mirrors
> `toggleMute`). UI: the conversation-list context menu (`DropdownMenu`, NOT the full "Conversation
> info sheet" — that's a separate, still-unbuilt `feature-parity.md` item — iOS's mentions-only
> toggle actually lives inside that sheet's `ConversationPreferencesTab`, which Android doesn't
> have yet) gains a "Mentions only" item threaded through 4 composable levels, shown only while
> `!isMuted` — parity with iOS's `isEnabled: !isMuted` gate on the same `Toggle`, hidden rather
> than disabled since this menu has no established disabled-row pattern (conditional visibility is
> already used here for `hasUnread`/`hasDraft`). New strings in all 4 locales (en/fr/es/pt).
>
> **TDD**: RED confirmed via compile failure before either method existed. GREEN: 2 new
> `ConversationRepositoryTest` cases (flips the pref + queues a snapshot; no-op when already in the
> target state) + 1 new `ConversationListViewModelTest` case (toggle calls the repository with the
> flipped value).
>
> **Verified**: `./apps/android/meeshy.sh check` green (`assembleDebug` + `testDebugUnitTest`, 970
> tasks, `BUILD SUCCESSFUL`); CI green independently (16 checks pass/skip, PR #3054).
>
> **Still open**: `feature-parity.md`'s "Per-conversation preferences" line stays `[ ]` — custom
> name, reaction emoji, and tags remain unwired (the model fields exist, same as mentionsOnly did);
> `ConversationLock`'s swipe-action UI / PIN sheets remain deferred, now with a documented reason.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=2 last_run=conversation-mentions-only-preference`.


> On 2026-08-15 **`ConversationLock`'s fourth slice — reactive state plumbing into
> `ConversationListViewModel` — shipped** (slice `conversation-lock-list-state-plumbing`, PR #3053,
> merged `80e87ed0d`). Picks up exactly where the previous run's deferred investigation left off:
> read `ConversationListView+Rows.swift`'s `Equatable` extension in full before designing the
> Compose shape, per that run's explicit note. Confirmed the iOS mechanism: the list observes
> `ConversationLockManager` (an `ObservableObject` with `@Published lockedConversationIds`)
> *directly*, so a lock/unlock re-evaluates every row; `ConversationRowItem.==` then compares the
> resulting swipe-action *icons* (not just counts) to catch the state change through the equatable
> gate. Ported the Kotlin-idiomatic equivalent of the `@Published` half of that mechanism — the
> reactive *source*, not the row-level render gate (Compose's own recomposition model handles the
> render side differently once state is actually read at the right level; that's slice (2)/(3)'s
> problem, not this one's).
>
> `ConversationLockStore` gained `lockedConversationIdsFlow: StateFlow<Set<String>>`, implemented
> in both `InMemoryConversationLockStore` (backed by a `MutableStateFlow`, updated on every mutation)
> and `EncryptedConversationLockStore` (same shape, seeded + recomputed from the encrypted prefs —
> no dedicated test, same documented Robolectric/AndroidKeyStore constraint as its sibling methods).
> `ConversationListUiState` gained `lockedConversationIds: Set<String>`, kept in sync via a new
> `viewModelScope.launch { lockStore.lockedConversationIdsFlow.collect { ... } }` block in `init` —
> the exact same shape as the existing `presenceByUserId`/`observePresence()` plumbing-only
> precedent, reused deliberately rather than inventing a new pattern.
>
> **TDD**: RED confirmed via compile failure (`Unresolved reference 'lockedConversationIdsFlow'`)
> before either the interface member or the ViewModel constructor param existed. GREEN: 5 new tests
> in `InMemoryConversationLockStoreTest` (initial-empty, setLock/removeLock/removeAllLocks/
> resetForLogout all reflected in the flow's `.value`), 2 new tests in `ConversationListViewModelTest`
> (a store emission and a removal reflected in `state.value.lockedConversationIds`, mirroring
> `a_live_user_status_event_is_stored_in_presence_by_user_id`'s exact shape).
>
> **Verified**: `./apps/android/meeshy.sh check` green locally (`assembleDebug` + `testDebugUnitTest`,
> 970 actionable tasks, `BUILD SUCCESSFUL`) — this session's JDK 21 (`/opt/homebrew/opt/openjdk@21`)
> and the pre-bootstrapped Android SDK were both available, so the local gate ran directly (CI was
> also green independently: `Android (assemble + unit tests)` + the unrelated `ci.yml` matrix, PR
> #3053, all 16 checks pass/skip).
>
> **Still open**: swipe-action UI (icon swap, recomposition-correctness per the iOS reference),
> the PIN entry sheet(s), the unlock flow itself. `feature-parity.md`'s "Conversation lock" line
> stays `[ ]` — this slice is data plumbing only, same as its predecessor.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=1 last_run=conversation-lock-list-state-plumbing`.


> On 2026-08-15 **`ConversationLock`'s third slice (UI/`ConversationListViewModel` wiring)
> investigated, deferred — no code shipped this run.** Scan of reprise clean (one unrelated open
> PR). Checked the iOS reference (`ConversationListView+Rows.swift`) before scoping a Compose
> equivalent, and found a genuine, non-obvious complexity signal that the two prior storage/logout
> slices didn't surface:
>
> iOS's row `Equatable` conformance carries an explicit, commented workaround —
> `ConversationLockManager`/`BlockService` are singletons NOT folded into the row's
> `renderFingerprint`, so a plain state-count comparison would freeze a stale "Unlock"/"Unblock"
> swipe-action icon behind the equatable gate. The fix compares the swipe actions' rendered ICONS
> (`lock.fill` ⇄ `lock.open.fill`) rather than a count, and the list itself observes both singletons
> directly so a lock/unlock re-evaluates every row. This is exactly the class of bug root
> `CLAUDE.md`'s "Zero Unnecessary Re-render" principle exists to prevent, and Compose's own
> recomposition-skipping (stable/equals-based, conceptually parallel to SwiftUI's `Equatable`) is
> susceptible to the identical failure mode if a lock-state read isn't threaded through whatever
> Compose uses to decide a row is unchanged.
>
> **Why not attempted this run**: the full "consumer" slice bundles at least three distinct pieces —
> (1) exposing per-conversation locked state from `ConversationListViewModel` (507 lines already,
> reactive `StateFlow`-based), (2) swipe-action UI with the same recomposition-correctness
> requirement iOS's comment documents, (3) the PIN entry sheet(s) themselves. Only (1) is genuinely
> foundation-shaped; (2) and (3) are real UI design work this routine's TDD-first, one-increment
> discipline isn't suited to rushing. Attempting a partial version of just (1) without first
> designing how Compose will read that state in (2) risks shipping a data shape that has to be
> reworked once the recomposition-correctness requirement is actually confronted.
>
> **For the next run picking this up**: read `ConversationListView+Rows.swift`'s `Equatable`
> extension in full (not just the excerpt above) before designing the Compose data shape — the
> exact re-render failure mode should inform whether `isLocked` belongs on each row item directly
> (letting Compose's structural equality catch it naturally) or needs its own explicit
> recomposition key, mirroring which of iOS's two mitigations (icon-based comparison vs. direct
> singleton observation) maps more cleanly onto Compose's model.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=5 last_run=conversation-lock-listview-scoping`
> — same convention as the `feature-parity-stale-checkbox-sweep`/`tracked-link-resolution-audit`
> runs: this counts as a real iteration (a genuine investigation with a documented, actionable
> finding), not a skip. Streak reaches 5 — next run's Étape 0 triggers the IOS_DETTE bascule.


> On 2026-08-15 **`ConversationLockStore` wired into the logout-time wipe** (slice
> `conversation-lock-logout-wiring`, PR #3048, merged `f651681d9`) — the second, small
> foundation-then-consumer slice off `conversation-lock-store-foundation` (previous run).
> `ConversationLockStore.resetForLogout()` existed on the interface but nothing called it: a second
> account signing in on the same device would have inherited the previous account's master PIN and
> conversation locks — the exact cross-account leak `SessionTeardown`'s own doc comment already
> describes for every other on-device store, and the exact seam that comment explicitly anticipated
> ("this seam is where that clear would land once one exists").
>
> Wired into `DefaultSessionTeardown.wipe()` (called alongside the existing Room/category/draft
> clears), new Hilt provider `providesConversationLockStore` mirroring `providesTokenStore`'s
> `EncryptedTokenStore(context)` pattern exactly. Two tests via the SAME `InMemoryConversationLockStore`
> fake `conversation-lock-store-foundation` already shipped — no new test infrastructure.
>
> **CI flake pattern — now 3 occurrences in one session, worth flagging as systemic**: `Android`
> failed on its first CI run for THIS PR too, exactly like the previous slice — but on a THIRD
> different, unrelated DataStore test this time (`ThemeStoreTest` → `MediaDownloadPreferencesStoreTest`
> → now `PrivacyPreferencesStoreTest`, all `dataStore_set*_isReflectedInTheFlow`, all
> `kotlinx.coroutines.TimeoutCancellationException`). `gh run rerun --failed` resolved it again on
> the first retry. Three different files, same exact test-name pattern and same exception class, in
> the same session — this reads like a genuine, systemic CI-runner timing issue affecting DataStore
> Flow-collection tests broadly (not a random one-off), not three independent flaky tests. **Worth a
> dedicated future item**: investigate why `dataStore_set*_isReflectedInTheFlow`-shaped tests
> specifically time out under CI load (a shared test helper's timeout too tight for a loaded runner?
> a coroutine dispatcher difference between local/CI?) rather than continuing to pay a rerun per
> affected PR indefinitely.
>
> **Still open**: PIN entry UI, `ConversationListViewModel` wiring (hide locked conversations from
> the list), the unlock flow itself. `feature-parity.md`'s "Conversation lock" line stays `[ ]`.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=4 last_run=conversation-lock-logout-wiring`.


> On 2026-08-15 **`ConversationLockStore` foundation shipped** (slice
> `conversation-lock-store-foundation`, PR #3045, merged `498a33ca4`) — the storage primitive for
> the `ConversationLock` gap scoped at the previous run (zero PIN/biometric infra existed on
> Android). Port of iOS `ConversationLockManager`'s storage logic ONLY, no UI/wiring — foundation-
> then-consumer, same precedent as `chat-composer-prefill-draft` → `widget-quick-reply`.
>
> `ConversationLockStore` (interface) + `InMemoryConversationLockStore` (volatile, mirrors
> `TokenStore.kt`'s pattern) in `sdk-core`; `EncryptedConversationLockStore` — real implementation
> via `EncryptedSharedPreferences`/Android Keystore, structurally identical to `EncryptedTokenStore`
> (already shipped in production). 6-digit master PIN gates unlocking, each locked conversation
> carries its own 4-digit PIN, both SHA-256-hashed, never plaintext. `removeMasterPin()` no-ops
> while any conversation is still locked; `forceRemoveMasterPin()` bypasses that guard for
> unlock-all/logout. `lockedConversationIds` derives from which lock keys exist rather than a
> separately persisted list (iOS keeps Keychain + a parallel UserDefaults list that could
> theoretically desync — this sidesteps that class of bug rather than porting it).
>
> **Two CI surprises, both resolved, both worth recording**:
> 1. **`EncryptedSharedPreferences`/`MasterKey` cannot be unit-tested via Robolectric in this
>    setup** — `MasterKey.Builder` requires the `AndroidKeyStore` security provider, which
>    Robolectric's JVM does not supply. All 6 `EncryptedConversationLockStoreTest` cases failed with
>    `NoSuchAlgorithmException`/`KeyStoreException`, confirmed live in CI. This explains, after the
>    fact, why `EncryptedTokenStore` — the pattern this class mirrors — has shipped in production
>    with zero dedicated tests all along: not an oversight, a constraint of this Robolectric setup.
>    Removed the Robolectric test file; `InMemoryConversationLockStoreTest` (18 cases, plain JVM)
>    already carries the full interface contract, and `EncryptedConversationLockStore` is a
>    structural port of the exact same logic onto real storage. Documented the constraint directly
>    on the class so a future run doesn't rediscover it from scratch.
> 2. **A DataStore/coroutine flake hit the `Android` CI check twice in a row, on two different,
>    unrelated tests** (`ThemeStoreTest`, then `MediaDownloadPreferencesStoreTest` — both
>    `dataStore_set*_isReflectedInTheFlow`, both `TimeoutCancellationException`). Neither test is
>    anywhere near `me.meeshy.sdk.lock`; this session's own conversation-lock tests were green both
>    times. `gh run rerun <run-id> --failed` resolved it on the first retry (cheaper than a wasted
>    re-push — worth trying before assuming `rerun-failed-jobs` being 403-for-the-bot, documented
>    for a different run, blocks this path too; it didn't).
>
> **Deliberately out of scope, deferred to future slices**: UI (PIN entry screens, lock/unlock
> flows), `ConversationListViewModel` wiring (filtering/hiding locked conversations from the list),
> the `AuthManager`-logout hook (`resetForLogout()` exists on the interface but nothing calls it
> yet). `feature-parity.md`'s "Conversation lock" line stays `[ ]` — this is the foundation, not the
> feature.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=3 last_run=conversation-lock-store-foundation`.


> On 2026-08-15 **2 more stale Phase B checkboxes corrected, `ConversationLock` scoped as a real,
> substantial gap for a future decomposed run** (no code shipped again this run — but unlike the
> `tracked-link-resolution-audit` run, this one produced two verified `[x]` upgrades plus a properly
> scoped finding, not just a deferral).
>
> **RE-PROUVÉ before starting**: scan of reprise clean. Sampled `feature-parity.md`'s unchecked
> boxes outside the already-corrected Phase 5 block (134 → 131 remaining) for plausible stale
> entries — `Story tray + per-conversation story rings` and `In-app dashboard` (Phase B, lines
> 1718-1719) turned out to duplicate work already shipped and documented elsewhere:
> - **Story tray**: `StoryTray.kt` is wired as the conversation list's `header` in `MeeshyApp.kt`
>   (`StoryTray(...)` at the call site) — and was ALREADY fully documented under the `:feature:stories`
>   Phase 5 bullet (ring gradient/grey/badge semantics). This was a duplicate leftover line, not a
>   second deliverable.
> - **In-app dashboard**: `DashboardScreen.kt` (292 lines) exists, is wired in `MeeshyApp.kt`, and
>   covers everything the checklist item names — unread total via the shared `totalUnreadCount()`
>   SSOT, `DASHBOARD_RECENT_COUNT` recent conversations, a `QuickActionRow`, share-link stats.
>
> **`ConversationLock` checked next (line 2693) — confirmed a REAL, substantial gap, NOT stale**:
> grepped for `ConversationLock`/`BiometricPrompt`/`AppLock`/`PinCode`/`PinEntry` across all of
> `apps/android` — zero hits. There is currently **no PIN/biometric/app-lock infrastructure at all**
> on Android, not even a partial primitive to build on. The iOS reference
> (`ConversationLockManager.swift` + `ConversationLockSheet.swift`, 560 lines combined, wired into
> 5 more files — `SecurityView.swift`, `ConversationListView(+Overlays/+Rows)`,
> `ConversationContextMenuView.swift`) confirms this is genuinely a multi-file feature (master PIN
> setup/change/remove, per-conversation 4-digit lock, list filtering/hiding of locked
> conversations, unlock-all flow, context-menu wiring) — not a mechanical port candidate for one
> increment. Needs the same decomposition treatment as `tracked-link-resolution-audit`
> (foundation — secure PIN storage via Android Keystore — then consumer slices), not attempted
> here.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=2 last_run=conversations-phase-b-stale-checkbox-and-lock-scoping`.


> **Candidat déposé le 2026-08-15 — 3ᵉ instance vérifiée du défaut « générateur de lien sans
> récepteur », NON livré, trop large pour un incrément unique.** Suite explicite du run
> `guest-join-web-deep-link` (« a systematic grep for every `https://meeshy.me/` string literal
> across `core:model` would be the way to close this out completely, not attempted here »). Ce grep
> a trouvé un 3ᵉ générateur : `MessageTextParser.kt` (`m+TOKEN` tapé dans un message →
> `https://meeshy.me/l/<TOKEN>`, un « Meeshy link » tracké, rendu cliquable par `RichMessageText.kt`/
> `MessageBubble.kt`). Ni `/l/` dans le manifest, ni route `l/{token}` dans `MeeshyApp.kt` — un
> Meeshy link tapé dans une conversation ouvre un navigateur au lieu de l'app, exactement comme les
> deux instances précédentes.
>
> **Pourquoi PAS livré ce run, contrairement aux deux précédents** : `/u/{username}` et
> `/join/{identifier}` étaient des mappings DIRECTS 1:1 vers un écran existant (aucune résolution,
> juste un deuxième `navDeepLink` sur une route déjà là). `/l/{token}` est structurellement
> différent — port iOS `DeepLinkRouter.resolveTrackedLink` (`case "l"`, 4 sites) : un appel réseau
> ASYNC résout le token en `{kind, targetType, targetId}` (`TrackedLinkService.resolve`), enregistre
> le clic (`recordClick`), PUIS route vers l'une de 5 destinations différentes selon `targetType`
> (`CONVERSATION` → flow de join existant même si le token n'est pas un vrai linkId de conversation ;
> `STORY`/`PROFILE`/`REEL`/`POST`/`STATUS` → détail correspondant ; inconnu/expiré → repli join). Un
> simple `navDeepLink { uriPattern }` NE PEUT PAS exprimer ceci — il faut un écran/ViewModel
> résolveur intermédiaire (chargement bref → redirection).
>
> **État de l'infrastructure Android, vérifié ce run** : `TrackingLink.kt` (`core:model`) existe
> mais ce sont les modèles CRUD de la feature marketing « mes liens trackés » (`TrackingLinksView`/
> `TrackingLinkDetailView` côté iOS) — PAS le service de résolution client-side dont
> `resolveTrackedLink` a besoin ; aucun équivalent Android de `TrackedLinkResolving`/
> `TrackedLinkService.resolve(token:)` n'existe. Côté gateway, `GET /l/:token`
> (`services/gateway/src/routes/tracking-links/tracking.ts:46`) est un endpoint de **redirection
> HTTP 302** (capture analytics, renvoie `Location: originalUrl`) — PAS une réponse JSON
> `{targetType, targetId}` exploitable pour un routage in-app sans suivre la redirection. La forme
> exacte de la résolution JSON qu'utilise iOS (`TrackedLinkService.resolve`) n'a pas été retrouvée
> côté gateway ce run — **question ouverte pour la prochaine reprise** : soit un autre endpoint
> existe (non trouvé par ce grep), soit iOS suit la redirection 302 et parse la destination
> autrement (`Location` header ? réponse enrichie sur `Accept: application/json` ?) — à élucider
> AVANT de concevoir le client Android, pas à deviner.
>
> Prochain run qui reprend ce candidat : (1) élucider le contrat de résolution JSON côté gateway/iOS
> (lire `TrackedLinkService.swift` complet, tracer son appel réseau exact), (2) concevoir le
> repository/API Android correspondant, (3) un écran résolveur minimal (spinner → redirection),
> (4) le manifest + `navDeepLink` `l/{token}` vers cet écran. Probablement 2 sous-slices distincts
> (fondation résolution + câblage nav), pas un seul incrément.

> On 2026-08-15 **conversation invite links (`https://meeshy.me/join/{identifier}`) now actually
> open the app** (slice `guest-join-web-deep-link`, PR #3039, merged `7c9293002`) — the SAME
> defect class as `profile-share-link-receiver` (just above), found by deliberately checking
> whether other link generators shared the pattern instead of assuming that one instance was
> isolated. `CreatedShareLink.joinUrl(webOrigin)` / `MyShareLink.joinUrl(webOrigin)` (`core:model`)
> build `{webOrigin}/join/{identifier}` — the URL shown on the create-link success sheet and the
> "my share links" list, meant to be pasted into SMS/WhatsApp/email for someone who does **not**
> have the app open. Only `meeshy://join/{identifier}` had a `navDeepLink`; the plain web URL these
> two helpers actually produce opened a browser instead. **Arguably higher-impact than the profile
> fix**: invite links are the primary mechanism for bringing a new person into a conversation,
> where the profile-share link is a secondary, opt-in feature.
>
> Same shape as the previous slice: `meeshy://join/{identifier}` needed no manifest change (already
> covered by the scheme-only, no-host `<data android:scheme="meeshy" />` filter); only the
> `https://meeshy.me/join/{identifier}` App Link was missing, added alongside the existing
> `GUEST_JOIN` route/`navDeepLink` with no new resolution logic (`GuestJoinViewModel` already reads
> the same `{identifier}` `SavedStateHandle` argument regardless of which pattern matched). New
> `GuestJoinShareDeepLinkTest` asserts the web pattern with `{identifier}` substituted equals what
> `CreatedShareLink.joinUrl` actually generates — same contract-test shape as
> `ProfileShareDeepLinkTest`.
>
> **Verified**: CI `Android` green, full `ci.yml` matrix (17 checks) green.
>
> **Genuinely still open, not touched this run**: whether ANY other `core:model` share-link/URL
> generator carries the same defect — this run checked exactly the two known generators
> (`ProfileShareLink`, `CreatedShareLink`/`MyShareLink`'s `joinUrl`); a systematic grep for every
> `https://meeshy.me/` string literal across `core:model` would be the way to close this out
> completely, not attempted here (scope discipline: one slice, not an open-ended sweep).
>
> `tasks/lane-cursor.md` → `lane=IOS_DETTE android_streak=0 last_run=guest-join-web-deep-link`
> (streak 4→5, alternation rule triggered — bascule to IOS_DETTE next run). Commit séparé, poussé
> directement sur `main`, précédent établi par `9b59bd06c`/`475b869b8`/`e0f10c4a1`/`396b7c608`.

> On 2026-08-15 **profile share links (`meeshy://u/{username}`, `https://meeshy.me/u/{username}`)
> now actually open the app** (slice `profile-share-link-receiver`, PR #3036, merged `5e11449de`).
> `ProfileShareLink` (`core:model`) has generated both shapes since the `profile-share` slice
> (2026-07-11, "share profile" + QR code) — **nothing received either one**: no
> `https://meeshy.me/u/*` intent-filter in the manifest, no `navDeepLink` for either shape on the
> profile route. A shared link or a scanned QR code opened nothing on Android — the browser for
> the web link, no matching app at all for the custom scheme (well, almost: see below).
>
> **RE-PROUVÉ before starting**: this was found while looking for a genuine follow-up to the
> previous stale-checkbox run — checked whether `feature-parity.md`'s Phase 6 "Navigation graph +
> deep links (`meeshy://`, `https://meeshy.me`)" bullet was ALSO stale like the last one, the same
> way. It wasn't uniformly stale: `meeshy://` custom-scheme routing is extensive (conversations,
> chat, profile, story, magic-link, join, guest — 9+ distinct hosts wired), but `https://meeshy.me`
> App Links cover exactly ONE path (`/auth/magic-link`) despite `ProfileShareLink`'s doc comment
> explicitly promising `/u/{username}` as a Universal Link. Grepped `MeeshyApp.kt` for any
> `meeshy.me`/`"u/`" reference: zero hits — confirmed the gap was real, not assumed.
>
> **The custom-scheme half turned out to be a smaller fix than expected**: the manifest already
> has a scheme-only `<data android:scheme="meeshy" />` filter with **no host restriction**, so
> `meeshy://u/{username}` was already reaching the app at the OS level — it just had no matching
> `navDeepLink` to route it to `ProfileScreen` once there (silently swallowed / fell through to
> whatever the NavHost's default matching produced, functionally the same as "opened nothing
> useful"). Re-verifying this saved a redundant, wasted manifest edit.
>
> **No new resolution logic needed**: `ProfileViewModel.loadProfile(userId)` already calls
> `userRepository.getProfile(id)` → `UserApi.getProfile(idOrUsername)`, and the gateway endpoint
> already resolves either shape. The two new `navDeepLink` patterns route straight to the existing
> `PROFILE_USER` route/`ProfileScreen`, reusing `{userId}` as the argument name for what is, on
> this path, actually a username value — confirmed safe by tracing `ProfileScreen`'s downstream
> callbacks (`onReport`/`onViewPosts`): they read from `state.user` (populated from the API
> response, whose `.id` is always the real canonical id), never from the raw route arg directly, so
> a username in that slot only affects the initial lookup call.
>
> New `Routes.PROFILE_SHARE_APP_DEEP_LINK`/`PROFILE_SHARE_WEB_DEEP_LINK` build their pattern from
> `ProfileShareLink.APP_SCHEME`/`WEB_HOST`/`USER_SEGMENT` (cross-module `const val` template
> reference — same established pattern as `CONVERSATION_DRAFT_DEEP_LINK`'s `ChatViewModel.*`
> references in this same file) rather than re-hardcoding the same strings, so generator and
> receiver structurally cannot drift apart again.
>
> **Verified**: 3 new contract tests (`ProfileShareDeepLinkTest`) assert the nav pattern with
> `{userId}` substituted exactly equals what `ProfileShareLink.appLink`/`webLink` produce — no
> Robolectric/`TestNavHostController` precedent exists in this module for exercising Compose
> Navigation's own URI-matching machinery (checked first; none found), so this tests the invariant
> that broke rather than re-verifying framework internals. CI: `Android` green, full `ci.yml`
> matrix (17 checks) also triggered and green — same finding as the last two Android PRs.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=4 last_run=profile-share-link-receiver`
> (streak 3→4, still under the streak≥5 IOS_DETTE threshold — stays ANDROID next run). Commit
> séparé, poussé directement sur `main`, précédent établi par `9b59bd06c`/`475b869b8`/`e0f10c4a1`.

> On 2026-08-15 **`feature-parity.md`'s Phase 5 "Pending" bullets were stale — no code
> shipped this run, checklist corrected instead.** Scan of reprise clean (`gh pr list` empty).
> Re-fetched `origin/main` (only 6 commits behind, unrelated gateway work — the 742-commit gap
> from the run before this one was a one-off worktree-reconciliation campaign, already closed).
>
> Picking a slice from the 134 unchecked `feature-parity.md` boxes, RE-PROUVÉ four of the
> Phase 5 section's overlapping/duplicated "Pending: ..." bullets against the real tree before
> touching anything — every single item they listed already exists and is wired:
> - **Calls slice**: `apps/android/feature/calls/` has 24 files including `WebRtcCallCoordinator`,
>   `TelecomCallReporter`, `IncomingCallViewModel`, `CallScreen` — not just history, a full live
>   calling stack — wired into `MeeshyApp.kt` navigation and FCM push (`MeeshyFcmService`,
>   `DeclineCallReceiver`).
> - **Feed new-posts banner / post detail**: `NewPostsBanner` (`FeedScreen.kt`),
>   `PostDetailViewModel` (+ test) both exist.
> - **Stories composer/publish**: `StoryComposerScreen` wired at `MeeshyApp.kt:799`,
>   outbox-backed (`StoryRepository.enqueuePublish`, `StoryPublishFailures`).
> - **Stories count-dots / prefetch média / reactions**: `StoryCountDots`, `StoryPrefetchPlanner`,
>   `StoryReactionState` all exist with tests, all wired into `StoryViewerScreen`/
>   `StoryViewerViewModel`.
>
> These bullets were leftover bookkeeping from earlier incremental passes — one (line 237-238 in
> the pre-edit file) was even malformed, an orphaned continuation line duplicating unrelated text
> from the bullet above it. `:feature:feed` and `:feature:stories` upgraded from `[~]` to `[x]`;
> `:feature:calls` added as its own `[x]` line (it never had one — only ever mentioned inside
> other bullets' "Pending" lists). Three duplicate stale bullets removed outright.
>
> **Why this counts as the run's slice rather than a skip**: the routine's own RE-PROUVER
> discipline treats a verified stale-checklist finding as real, delivered work — same precedent
> as the iOS-debt lane's "Ad-hoc blocking text translation already shipped" run. No code changed;
> nothing to verify against a compiler. `tasks/lane-cursor.md` still advances (this is a genuine
> ANDROID-lane run, not a skip), and the streak counts toward the IOS_DETTE bascule same as any
> other.
>
> **Genuinely still open** (not touched, not claimed done): everything else under the 134
> unchecked boxes — Phase 6 integration items (`Navigation graph + deep links`, adaptive
> tablet/foldable layouts, live integration test vs gateway, final diff audit), the earlier
> architectural items (`build-logic/` convention plugins, E2EE, SQLCipher). None RE-PROUVÉ this
> run; the next run picking one of these should re-verify fresh rather than trust this note.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=3 last_run=feature-parity-stale-checkbox-sweep`
> (commit séparé, poussé directement sur `main`, précédent établi par `9b59bd06c`/`475b869b8` —
> même commit que cette mise à jour de `PROGRESS.md`/`NOTES.md`/`feature-parity.md`, les trois
> fichiers de suivi vivant sous `apps/android/` mais ne modifiant aucun code compilé).

> On 2026-08-15 **`StoryCacheSource.revalidate()` no longer deletes stories past page 1**
> (slice `story-cache-pagination-truncation`, PR #3034, merged `52aec5b0e`) — the candidate
> `docs(android/routine)` deposited on 2026-08-12 (`d10c751ad`, from the iOS/gateway routine's
> PR #2870) and parked ever since for exactly the missing toolchain the CI-gate run above just
> fixed. **RE-PROUVÉ before starting**: read `StoryCacheSource.kt` fresh — `revalidate()` still
> fetched one `STORIES_PAGE_SIZE=50` page (`storyApi.list(null, 50)`) and read neither
> `pagination.hasMore` nor `pagination.nextCursor`; `persist()` still called
> `storyDao.deleteNotIn(rows.map { it.id })` against that single page — beyond 50 stories the
> truncation didn't omit rows, it deleted them from Room. Also confirmed `StoryRepository.list()`
> (the OTHER API surface losing pagination) is called only from `StoryViewerViewModel`'s on-demand
> fetch, not feeding a `deleteNotIn` — genuinely a separate, non-destructive concern, left out of
> scope as the deposited note suggested.
>
> **No local Android toolchain in this container** (`sdkmanager`/`adb` not found, no
> `ANDROID_HOME` — and this time no JRE at all: `./gradlew` itself failed with "Unable to locate a
> Java Runtime"), so every line was written against static verification only: cross-checked the
> `null`+`any()` MockK matcher pattern against `PostRepositoryTest.kt`'s existing precedent before
> trusting it in new tests, and the `pagination?.hasMore ?: false` idiom against `PostRepository`'s
> own established usage, rather than inventing an unverified shape. The `Android` CI check (added
> by the run above) was the actual compiler — first PR to really exercise it since its own
> bootstrap run.
>
> **Design, decided fresh for Android rather than copied from iOS's PR #2867**: pages up to 6
> requests (300 stories, same tray budget as iOS) following `nextCursor` while `hasMore` holds; a
> response with no `pagination` block at all is treated as one complete page (preserves every
> existing single-page test unmodified — confirmed by tracing `pagination?.hasMore ?: false`
> against a `null` pagination before writing any new test). `persist()` only prunes when the window
> is PROVEN complete (`hasMore = false`) — reaching the 6-page budget while the server still claims
> more remains upserts what was fetched but never authorizes a delete: an unproven partial window
> may add, never subtract. Any page failing (including the first) throws without persisting
> anything — the INVERSE of iOS's choice, and for a reason specific to Android: Room already holds
> a complete prior tray here, so replacing it with an unproven partial one on a later-page failure
> is strictly worse than serving the stale one a beat longer. New `pagedApiCall` (`ApiCall.kt`)
> mirrors `apiCall` but preserves the envelope's `pagination` block, which `apiCall` discards by
> design — a sibling, not a modification, so every other `apiCall` caller is untouched.
>
> **Verified**: 3 new TDD tests in `StoryRepositoryTest.kt` (multi-page follow + prune-on-complete,
> never-prune-on-budget-exhaustion, throw-and-leave-cache-untouched-on-later-page-failure) plus all
> pre-existing single-page tests, unmodified. CI: `Android (assemble + unit tests)` green (10m56s),
> full `ci.yml` matrix also triggered on this `apps/android`-only diff (confirms finding #3 of the
> CI-gate run again) and all 16 checks passed.
>
> **Deliberately deferred**: `StoryRepository.list(cursor, limit)` still drops `pagination` too —
> a second, separate call site of the same underlying API, non-destructive, used only by the story
> viewer's on-demand fetch. Worth inventorying alongside its web/iOS siblings some day, not urgent.
>
> `tasks/lane-cursor.md` → `lane=ANDROID android_streak=2 last_run=story-cache-pagination-truncation`
> (commit séparé, poussé directement sur `main`, cf. `ROUTINE.md` §Choix de la lane — même commit
> que cette mise à jour de `PROGRESS.md`/`NOTES.md`, précédent établi par `9b59bd06c`).

> On 2026-08-12 **`apps/android` got its first CI gate ever** (run `android-ci-workflow`,
> PR #2905). This is the follow-up `ROUTINE.md` §"CI reality" had been tracking explicitly as
> needing its own run because it touches `.github/` rather than `apps/android`. **RE-PROVEN before
> starting**: interrupted-run scan clean (one open PR, #2903, on an unrelated branch); the
> `dl.google.com` denial was re-confirmed live in this container, not taken from the note — `curl`
> returns `CONNECT tunnel failed, response 403` and the proxy status endpoint records the refusal
> under `recentRelayFailures`. Also probed the neighbours so the write-up would be exact:
> `maven.google.com` (301), `repo1.maven.org` (200), `services.gradle.org` (200),
> `plugins.gradle.org` (200) are all reachable — it is specifically the SDK *platform packages*
> that are unreachable, not the Maven artifacts, which is why "just use a mirror" is not an option.
>
> **Shipped**: `.github/workflows/android.yml`, mirroring `./apps/android/meeshy.sh check` exactly
> (`assembleDebug` → `testDebugUnitTest`, nothing stricter — a gate harder than the documented
> local one would block slices on unmeasured lint debt). Plus the two documents that described the
> pre-CI world: `ROUTINE.md` §CI reality (what the gate is, what it deliberately omits, and that a
> containerised run should push and treat the **Android** check as its compiler rather than write
> unverified Kotlin) and `REVIEWER.md` §5 (which demanded a green local `meeshy.sh check` —
> unsatisfiable in these containers, and an unsatisfiable gate invites a caveat instead of a
> verdict; it now accepts a green CI check *provided* the log says the local gate was unavailable
> rather than skipped, and states that unverified is a FAIL, never a PASS-with-caveat).
>
> **Evidence — the gate is green**: run #4 (`31630690093`), `BUILD SUCCESSFUL in 2m 10s`, 665
> actionable tasks, `assembleDebug` and `testDebugUnitTest` both passing, 636 test-report files
> uploaded. **This is the first time the 21-module Android graph has ever been compiled and
> unit-tested in CI**, by anyone. Everything the routine has merged to date rested on a local
> `check` that no container could reproduce.
>
> **Four findings the gate produced on its first four runs**:
> 1. **`compileSdk = 37` has no bare `platforms;android-37` package.** Run #1 died in 45 s on
>    `Failed to find package 'platforms;android-37'`. Since the minor SDK releases (36.1, 37.0,
>    37.1 …) an API level is no longer guaranteed to publish under `android-N`: the catalogue holds
>    `android-37.0`, `android-37.1`, `37.2-beta1/2`. Deriving the coordinate as `android-$major` is
>    wrong *by construction*, on any channel. The workflow now pre-warms best-effort and lets **AGP**
>    resolve the platform, because AGP is the authority on that mapping and we are not. All 21
>    modules pin 37 and it does build — the API level was never the problem, the package name was.
> 2. **One non-reproducing failure, root cause NOT captured.** Run #3's test task failed with a
>    Gradle-internal exception (`LoadPreviousExecutionStateStep`/`HandleStaleOutputsStep`), and
>    `--stacktrace` buried the actual `What went wrong` under 100+ lines of executor internals.
>    Run #4 passed the same tests on the same tree. Do NOT record this as "flaky tests" — it was
>    not shown to be a test assertion at all. It is an open question, and the reason the workflow
>    now (a) drops `--stacktrace` and (b) parses the JUnit XML on failure to print each failing
>    case inline. If it recurs, the next run will be able to read it.
> 3. **`ci.yml` really does run its full matrix on an `apps/android`-only diff** — no path filter,
>    16 checks. This corroborates what PR #2868 found for a `packages/MeeshySDK`-only diff. Never
>    predict the check list; read it off the PR.
> 4. **`ci.yml`'s Python jobs are flaky on infrastructure, not on code.** `uv python install 3.10`
>    intermittently fails to fetch CPython from GitHub releases (`http2 error: stream error
>    received: refused stream`). Observed rotating between jobs across rounds: `Test Python` failed
>    then passed, `Audio Pipeline`/`TTS-STT` failed then passed, `Voice API` passed then failed —
>    all in the same 20 minutes. `ci.yml` run #9710 on `83b5c160` (this branch's base) was fully
>    green, so this is a window of GitHub-side flakiness, not a regression. Worth a retry/mirror on
>    that setup step as its own item; note that `rerun-failed-jobs` is **403 for the bot**, so a
>    flake costs a full re-push.
>
> **Next slice — now unblocked and highest value**: the `StoryCacheSource.revalidate()` pagination
> truncation deposited at the top of this file on 2026-08-12. It was parked for exactly this
> missing toolchain, it is the harmful variant already fixed on iOS (PR #2867) and web, and Android
> is the last platform carrying it. It can now be written TDD-first and *verified* before merge.

> **Candidat déposé le 2026-08-12 par la routine iOS/gateway (PR #2870) — défaut VÉRIFIÉ, non
> livré, faute de toolchain.** `StoryCacheSource.revalidate()`
> (`:sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryCacheSource.kt:55`) demande **une** page de
> 50 stories (`storyApi.list(null, STORIES_PAGE_SIZE)`) et ne lit **ni** `pagination.hasMore` **ni**
> `pagination.nextCursor`. Or `persist()` fait `storyDao.deleteNotIn(rows.map { it.id })` : au-delà
> de la 50ᵉ story, la troncature ne se contente pas d'OMETTRE, elle **SUPPRIME** les lignes du cache
> Room. C'est la variante nuisible du même défaut, corrigée sur iOS au cycle 80 (PR #2867 — chemin
> complet qui écrasait le tray) et sur le web au cycle 81. **Android est la dernière plateforme qui
> le porte encore** ; vérifié le 2026-08-12 : zéro occurrence de `hasMore`/`nextCursor`/`cursor`
> dans `StoryCacheSource.kt`.
>
> Ce qui joue en votre faveur : l'enveloppe `ApiResponse` décode **déjà**
> `pagination.hasMore`/`nextCursor` (`:core:model/ApiResponse.kt`) — aucun changement de type DTO
> nécessaire. Le seul obstacle réel est que `apiCall()` (`:core:network/ApiCall.kt`) **jette**
> le bloc `pagination` : il ne rend que `data`. Il faut donc un frère (`pagedApiCall` rendant
> data + pagination) ou passer par `rawApiCall`. À trancher sur place.
>
> Trois décisions de conception, transposées de ce qui a été appris sur iOS — à re-décider, pas à
> recopier :
> 1. **Budget de pages** (iOS : 6 = 300 stories, tray borné 24 h). L'atteindre alors que le serveur
>    annonce encore du reste ne doit **jamais** autoriser le `deleteNotIn` : une fenêtre non prouvée
>    complète peut upserter, jamais élaguer — sinon le correctif recrée le défaut qu'il corrige.
> 2. **Échec d'une page ≥ 2** : ici, contrairement à iOS, Room détient déjà un tray complet
>    précédent. Jeter la passe (`throw StorySyncException`, cache intact) est donc probablement
>    MEILLEUR que de persister une fenêtre partielle — l'inverse du choix iOS, et pour une raison
>    qui tient au support, pas au goût.
> 3. `StoryRepository.list(cursor, limit)` (ligne 73) est un passe-plat qui perd aussi la
>    pagination — deux usages divergents de la même API à inventorier, comme sur le web.
>
> **Pourquoi non livré** : `dl.google.com` est bloqué par le proxy de ce conteneur (`CONNECT tunnel
> failed, 403`), donc l'AGP 8.13.0 ne résout pas et **aucun test Android ne peut tourner ici** —
> et ce dépôt n'a pas de workflow CI Android. Écrire du Kotlin non vérifié dans le seul chemin dont
> le métier est de SUPPRIMER des lignes de cache aurait été irresponsable. À reprendre par une
> session dont le `:app:assembleDebug` passe.


> On 2026-08-12 **conversation-list live-presence data plumbing landed** (slice
> `conversation-list-live-presence`, feature-parity §B "Conversations list" — the "conversation-
> participant presence" candidate the prior slice's own note explicitly flagged as now-unblocked).
> **RE-PROUVEN before starting**: `git branch -r`/`gh pr list --state open --search "apps/android
> OR apps/ios"` found no interrupted run (3 unrelated PRs at scan time, none matching this
> routine's naming). Confirmed the gap for real before coding: grepped `presenceState`/
> `PresenceState`/`isOnline` under `:feature:conversations`/`:feature:chat` and found zero hits —
> unlike Contacts (which at least had stale REST `isOnline` data to overlay onto), conversation
> rows/the chat header have ZERO presence indication whatsoever, since `ApiConversation.
> participants` carries no `isOnline`/`lastActiveAt` fields at all. Checked iOS's own
> `ConversationListView.swift`: `presenceManager.presenceState(for: conversation.
> participantUserId ?? "")` confirms iOS resolves this from a GLOBAL `PresenceManager` singleton
> keyed by userId, not from the conversation payload either — validating that a live-socket-only
> resolution (no REST fallback) is the correct, parity-matching approach on Android too, not a
> workaround. **Shipped (production, all `apps/android`)**: new `ApiConversation.
> otherParticipantUserId(currentUserId): String?` (`:sdk-core/theme/ConversationAccent.kt`) —
> refactored the existing `otherParticipantName` to share a new private `otherParticipant(
> currentUserId): ApiParticipant?` lookup (the direct-type gate moved from `displayTitle`'s own
> call site into this shared helper, a behavior-preserving refactor — `displayTitle`'s own 9
> pre-existing tests re-ran green, unchanged, confirming no regression) rather than duplicating the
> participant-matching logic a second time. `ConversationListViewModel.observePresence()` (new,
> called from `init`) collects the exact SAME `MessageSocketManager.userStatus`/`.presenceSnapshot`
> flows the prior slice's Contacts wiring already established and fixed the wire-contract of —
> mirrors `ContactsListViewModel.observePresence()` almost verbatim (same eager-start rationale:
> hot `SharedFlow`s, no replay). New `ConversationListUiState.presenceByUserId: Map<String,
> UserStatusEvent>` + `presenceStateFor(conversation, nowEpochMillis): PresenceState?` (resolves
> the other participant's id, looks up the live map, derives `PresenceState` via the existing
> `UserPresence.state()` SSOT — the same one `FriendRequestUser.presenceState()` already uses).
> **Deliberate, documented scope cut — the actual UI wiring is NOT done this run**: unlike the
> Contacts slice (where `ContactsListTab.kt` already rendered a presence dot from stale data, so
> feeding it live data was the entire job), `ConversationRow`/`ConversationRowContent` in
> `ConversationListScreen.kt` render NO presence dot at all yet, and are deeply parameterized
> across 2+ Composable layers (`ConversationRow` → `ConversationRowContent`) plus their top-level
> list-rendering call site — threading a new `presenceState: PresenceState?` parameter through
> would have materially widened this slice's diff/risk beyond the data-plumbing piece. Scoped this
> run to the ViewModel-side foundation only, mirroring the `chat-composer-prefill-draft` →
> `widget-quick-reply` foundation-then-consumer split that worked well two runs ago. **+9 new
> tests** (`ConversationAccentTest`: resolves the other participant's id for a direct conversation,
> null for group, null with no other participant, null when a participant has no userId;
> `ConversationListViewModelTest`: a live status event is stored in the map, a snapshot populates
> every user in one pass, `presenceStateFor` resolves live presence for the other participant, is
> null for a group conversation even with matching live data present, is null when nothing has
> arrived yet). **Mutation-proven**, two axes: neutralizing `otherParticipant`'s direct-type gate
> (`if (type.lowercase() !in directConversationTypes) return null` removed) fails **exactly** the
> group-conversation test (12 others green); neutralizing the snapshot merge in
> `observePresence()` (the `.copy(presenceByUserId = ...)` replaced with a no-op) fails **exactly**
> the snapshot-population test (46 others green). Both applied via a scratch `cp`-backed edit
> (never `git checkout --`), restored via `cp`, diffed clean against the backup afterward.
> **Process note, stated honestly** (same pattern as the prior slice): the `ConversationListUiState`
> additions and `observePresence()` wiring were written before their own tests for this small,
> mechanical piece — proven via the mutation pass above rather than a strict prior RED run; the
> `otherParticipantUserId` extraction WAS written test-first (`ConversationAccentTest.kt` edited
> before `ConversationAccent.kt`). **Gate**: `./apps/android/meeshy.sh check` → **`BUILD
> SUCCESSFUL`** (970 tasks, matching every prior slice — no build-graph regression; zero test
> failures across every module's XML reports). Reviewer **PASS** (diff `apps/android` only — 4
> files, confirmed via `git status --short`; SDK purity — `otherParticipantUserId` lives in
> `:sdk-core` (a pure data extension, correct), the presence-overlay state/collection lives in
> `:feature:conversations`'s ViewModel (product decision, correct per the established `Contacts`
> precedent); SSOT — reuses `UserPresence.state()`, `MessageSocketManager`'s existing flows, the
> now-corrected `UserStatusEvent`/`PresenceSnapshotEvent` DTOs, zero re-implementation; no coverage
> floor lowered; no tautological tests). **Not attempted this run** (compile+test-only; no
> simulator/emulator session). **Next slice candidates (not attempted this run)**: the UI wiring
> this slice deliberately deferred — thread `presenceStateFor`'s result into `ConversationRow`'s
> avatar (a dot overlay, mirroring `ContactsListTab.kt`'s own `meeshyPresenceDotColor(...)` usage)
> and/or the chat header (`ChatScreen`'s toolbar, matching iOS's `ConversationView` presence
> display); a SECOND, small opportunistic fix noticed but not actioned: `directConversationTypes`
> is independently duplicated as a `private val` in BOTH `:sdk-core/theme/ConversationAccent.kt`
> and (separately) the `:app/widget` widget presentations — not unified this run (cross-module,
> `:app` already depends on `:sdk-core` so this IS fixable, but out of scope for this slice); mark-
> read widget action; Google Assistant App Actions; on-device transcription for the Feed audio
> composer; Voice-cloning onboarding wizard; map/search/reverse-geocoding; PiP; Conversation lock;
> the onboarding carousel — per the orchestrator's guidance these remain documented, real gaps.

> On 2026-08-11 **live contact presence sync landed, plus a real wire-contract bug fix**
> (slice `presence-live-contacts-overlay`, feature-parity §"Contacts list" — the previously-
> deferred "presence-cache foundation for conversation participants" candidate, investigated and
> right-sized down to its first real, self-contained consumer rather than built as unconsumed
> infrastructure). **RE-PROUVEN before starting**: `git branch -r`/`gh pr list --state open
> --search "apps/android OR apps/ios"` found no interrupted run (2 unrelated `apps/ios`/`apps/web`
> PRs at scan time). Investigated what a "presence-cache foundation" would actually need before
> writing any code: grepped for `PresenceState`/`UserPresence` usage, found
> `MessageSocketManager` already declares and `.attach()`-es listeners for `user:status` and
> `presence:snapshot` — **but grepping every call site of both flows found zero consumers
> anywhere in the app**, dead-but-wired infrastructure exactly like the earlier
> `outbox-message-lane-discovery`/email-phone-change slices' own pattern. **A deeper bug found
> before wiring a consumer**: `UserStatusEvent`/`PresenceSnapshotEvent` (`:core:model`) don't even
> match the real gateway payload — checked `packages/shared/types/socketio-events.ts`'s
> `UserStatusEvent`/`PresenceSnapshotEventData` (`{userId, username, isOnline, lastActiveAt}` /
> `{users: [...]}`) against the Android DTOs (`status: String`/`lastSeenAt`/flat
> `onlineUserIds: List<String>`) — zero matching field names. Confirmed the gateway genuinely
> emits these events for real (`SERVER_EVENTS.USER_STATUS` in `MeeshySocketIOManager.ts`'s
> `_broadcastUserStatus`, not a dead/unused constant) before concluding this was a real, fixable
> bug rather than dead code on both ends. **Shipped (production, all `apps/android`)**: fixed both
> DTOs' field names/types to match the real gateway contract (`PresenceSnapshotEvent` now reuses
> `UserStatusEvent` per entry rather than duplicating an identical nested shape). Found the
> concrete first consumer by checking where presence is ALREADY rendered from stale data:
> `ContactsListTab.kt`'s `friend.presenceState(System.currentTimeMillis())` reads straight off the
> roster's last full `/friends` REST fetch (`presence-away-indicator`, 2026-07-04) — never updated
> live, frozen until the next reload. New pure `PresenceOverlay` (`:feature:contacts`, mirrors the
> placement of the package's existing `ContactList`/`ContactFilterCounts` pure helpers)
> `applyStatus`/`applySnapshot` merge a live event onto the roster by `userId`, leaving every other
> row untouched. `ContactsListViewModel.observePresence()` (new, called from `init` alongside the
> existing `observeFriendshipCache()`) collects both `MessageSocketManager` flows — **started
> eagerly, not lazily**: `MessageSocketManager`'s own doc comment warns its flows are hot
> `SharedFlow`s with no replay, so a late subscriber genuinely misses events, matching the
> existing `observeFriendshipCache()` precedent's own eager `init`-time start. **+15 new tests**
> (`UserStatusEventTest`, `:core:model`: decodes a real status broadcast, an offline frame with
> privacy-hidden `lastActiveAt`, a snapshot's nested user list, an empty snapshot; `PresenceOverlayTest`:
> matching-friend update, other-friends untouched, unknown-userId no-op, snapshot multi-update,
> friend-absent-from-snapshot untouched, empty-snapshot no-op; `ContactsListViewModelTest`: a live
> status event updates presence without a full reload — asserted via `coVerify(exactly = 1)` on
> `receivedRequests` to prove no extra refetch fires, a snapshot updates matching friends
> likewise, a status event for a userId not in the roster is a no-op). **Mutation-proven**, two
> axes: neutralizing `PresenceOverlay.applyStatus`'s id match (`friend.id == event.userId` →
> `true`) fails **exactly** the 2 tests asserting isolation (unknown-id no-op at both the pure and
> VM level; 28 others green); neutralizing the DTO field mapping itself (renaming `isOnline` to a
> non-matching `isOnlineFlag` backing property, reproducing the exact class of bug fixed) fails
> **exactly** the 2 decode tests asserting a live `true`/populated value (2 others — the `false`/
> empty-default cases — stay green, since they can't distinguish a correct decode from a silent
> fallback-to-default). Both applied via a scratch `cp`-backed edit (never `git checkout --`),
> restored via `cp`, diffed clean against the backup afterward. **Process note, stated honestly**:
> the DTO field-rename and the `ContactsListViewModel.observePresence()` wiring were written
> before their own tests (implementation-first for these two small, mechanical pieces), then
> proven via the mutation pass above rather than a strict prior RED run — the core
> `PresenceOverlay` merge logic itself WAS written test-first (RED confirmed: `PresenceOverlay`
> didn't exist when `PresenceOverlayTest.kt` was written, compile failure until the object was
> added). **Gate**: `./apps/android/meeshy.sh check` → **`BUILD SUCCESSFUL`** (970 tasks, matching
> every prior slice — no build-graph regression; zero test failures across every module's XML
> reports). Reviewer **PASS** (diff `apps/android` only — 6 files, confirmed via `git status
> --short`; SDK purity — `PresenceOverlay`'s pure merge lives in `:feature:contacts` (a product
> decision about how the Contacts screen paints presence, not yet a proven-reusable atom — single
> consumer so far, correctly app-side per "duplicate until a 3rd call site" for this class of
> glue), the DTO fix lives in `:core:model` (a pure data-shape correction, not orchestration);
> SSOT — reuses `MessageSocketManager`'s existing (already-`.attach()`-ed) socket infrastructure
> and the existing `UserPresence.state()`/`FriendRequestUser.presenceState()` rendering pipeline
> unchanged, zero re-implementation; no coverage floor lowered; no tautological tests). **Not
> attempted this run** (compile+test-only per the local JVM gate; no simulator/emulator session —
> a future run should install-and-verify against the live gateway with the shared `atabeth`
> account, confirming a second device/session toggling online/offline actually repaints the
> Contacts row live without leaving/re-entering the screen). **Deliberate, documented scope cut**:
> conversation-participant presence (the original "favorite-contacts status badge" gap noted in
> the widget slice) is NOT wired this run — this slice fixed the shared wire-contract bug and
> proved it out on the ALREADY-EXISTING Contacts consumer first (smaller, safer, immediately
> useful blast radius); a future slice can now reuse the corrected `UserStatusEvent`/
> `PresenceSnapshotEvent` DTOs directly for conversation participants without redoing this
> investigation. **Next slice candidates (not attempted this run)**: conversation-participant
> presence (foundation now unblocked by this slice); mark-read widget action (still
> deprioritized); Google Assistant App Actions; on-device transcription for the Feed audio
> composer; Voice-cloning onboarding wizard; map/search/reverse-geocoding for the location
> attachment; PiP (calls + media); Conversation lock (needs its own scoping pass); the onboarding
> carousel (needs a design pass) — per the orchestrator's guidance these remain documented, real
> gaps warranting planning/decomposition passes rather than bare re-grepping.

> On 2026-08-11 **a stale `feature-parity.md` checkbox was found and corrected** (slice
> `feature-parity-stale-checkbox-audio-translate` — a broad-sweep RE-PROUVER pass after the
> home-screen widget epic wrapped up at 4/4 widgets, per the orchestrator's standing "continue the
> broad sweep" guidance rather than tunneling further into the same area). **RE-PROUVEN before
> starting**: `git branch -r`/`gh pr list --state open --search "apps/android OR apps/ios"` found
> no interrupted run (empty result). Investigated "Ad-hoc blocking text translation" (unchecked)
> as a candidate slice: read iOS's `MessageLanguageDetailView.translateTo` in full — it calls
> `TranslationService.shared.translate(messageId:)`, and its own doc comment explains that passing
> `messageId` routes the gateway's `/translate-blocking` endpoint into a "retranslation" branch
> that both persists AND broadcasts via `message:translation` (no separate socket call needed).
> Before writing any Android code for this, grepped for an existing Android equivalent —
> found `ChatViewModel.onExplorerRetranslate(messageId, code)` (wired from
> `MessageDetailExplorer`'s per-language retranslate affordance, the exact same long-press →
> "Explore languages" sheet root `CLAUDE.md` documents as the sole translation-exploration entry
> point) already calling `MessageRepository.requestTranslation(messageId, targetLanguage)` — a
> real, synchronous REST call that persists its result, matching iOS's "blocking" semantics
> exactly. Confirmed fully tested, not a stub: 7 `MessageRepositoryTest` cases + ~10
> `ChatViewModelTest` cases covering success/failure/idempotency/in-flight-guard/edge cases. **No
> code change needed** — checked the box and documented the finding in `feature-parity.md` in
> place, matching the `settings-two-factor-auth` slice's own precedent of fixing stale checkboxes
> discovered while re-proving an item. **Also investigated and explicitly DEFERRED (not
> attempted, too large for a single slice without decomposition)**: "Conversation lock" (master
> PIN setup/change/remove + per-conversation 4-digit lock + unlock-all) — confirmed a genuine,
> unshipped gap (zero Android hits for `ConversationLock`/`masterPin` outside an unrelated
> `ConversationDraftStore` false-positive; iOS has 5+ files: `ConversationLockSheet.swift`,
> `SecurityView.swift`, plus context-menu/row/overlay wiring) — a real security feature needing its
> own scoping pass (PIN storage, biometric unlock, per-conversation vs master-PIN interaction),
> not a mechanical port; "First-run onboarding carousel with live feature demo + animated step
> backgrounds" — confirmed zero Android implementation (`onboarding`/`Onboarding` greps hit only
> the registration wizard, an unrelated flow) but is heavily animation/visual-design-driven with
> thin testable logic (likely just "which page index is active"), a poor fit for this routine's
> TDD-evidence rhythm without a dedicated design pass first. **Gate**: `./apps/android/meeshy.sh
> check` → **`BUILD SUCCESSFUL`** (970 tasks — no code touched, so trivially unchanged from the
> prior run's count). Reviewer **PASS** (diff `apps/android` only — a single line in
> `feature-parity.md`; no tests needed since no production logic changed; the box being checked is
> itself evidence-backed by the 17 existing tests cited above, not a bare assertion). **Next slice
> candidates (not attempted this run)**: mark-read widget action (still deprioritized — thin
> glue, low test value); Google Assistant App Actions (`shortcuts.xml`) for the voice-triggered
> half of the shortcuts epic — needs external Assistant indexing/review; a presence-cache
> foundation for conversation participants; on-device transcription for the Feed audio composer;
> Voice-cloning onboarding wizard; map/search/reverse-geocoding for the location attachment; PiP
> (calls + media); Conversation lock (needs its own scoping/decomposition pass, per this run's
> finding above); the onboarding carousel (needs a design pass before a slice can TDD it
> meaningfully) — per the orchestrator's guidance these all remain documented, real gaps warranting
> planning/decomposition passes rather than bare re-grepping.

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

