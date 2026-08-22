# Progress — state & what to do next

> Older entries archived in `PROGRESS-archive-2026-08.md` (prepend/newest-first, same convention).

> On 2026-08-22 **share-link entry-decision policy shipped** (slice `sharelink-entry-policy`,
> feature-parity §Chat — "Anonymous-session conversation mode; guest join-via-share-link flow",
> box flipped `[ ]` → `[~]`). This lands the missing "who enters, and how" brain for share-link
> deep links; the umbrella box stays `[~]` because the resolver + `joinAuthenticated` endpoint +
> `MeeshyApp.kt` rewiring are named follow-ups.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the 20 open PRs at
> branch time are all web/shared/gateway/ios/sdk, none android-routine). Branched off latest
> `origin/main` (`685ac5e2`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `platforms;android-37.0`
> recipe worked (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0"
> "platform-tools"`); the local gate is available this run.
>
> **The gap (read-only recon over iOS + Android)**: iOS `ShareLinkEntryPolicy.swift` is a pure
> six-way decision engine that decides HOW a person enters a conversation from a share link.
> Android had ported nearly the whole anonymous-session feature (permission core, session store,
> guest-join form/VM/screen, composer gate, dual-auth) but NOT this entry-decision policy — so
> `MeeshyApp.kt`'s deep-link handler routed EVERY share-link straight to the anonymous guest form,
> wrongly forcing an already-authenticated user, an existing member, or a returning guest into it.
> iOS branches six ways here; Android branched zero.
>
> **`:core:model` `ShareLinkEntryPolicy`** (new, pure SSOT): `intent(ShareLinkEntryFacts) →
> ShareLinkEntryIntent`. `ShareLinkEntryFacts` = five values (conversationId, isAuthenticated,
> isAlreadyMember, linkRequiresAccount, hasStoredGuestSession) — deliberately values, not services:
> the rule looks nothing up itself. `ShareLinkEntryIntent` = sealed interface of six:
> `OpenConversation(id)` / `JoinWithAccount(id)` / `JoinAnonymously` / `ResumeGuestSession` /
> `ChooseIdentity(id)` / `RequiresAccount`. Branch order is a faithful port of iOS `intent(for:)`:
> unauthenticated → (stored guest session ⇒ resume) else (requireAccount ⇒ requiresAccount) else
> joinAnonymously; authenticated → (member ⇒ open) else (requireAccount ⇒ joinWithAccount) else
> chooseIdentity. Two load-bearing precedence rules asserted: stored-guest beats requireAccount
> (unauth), member beats requireAccount (auth). Pure — no I/O, no clock, no state; presentation
> (choice sheets, routing) stays app-side.
>
> **Tests: +11** — `ShareLinkEntryPolicyTest`: joinAnonymously / requiresAccount /
> resumeGuestSession / stored-guest-beats-requireAccount / openConversation / member-beats-
> requireAccount / joinWithAccount / chooseIdentity / stored-guest-does-not-skip-choice-when-auth /
> conversationId-threaded-into-every-conversation-scoped-intent / member-flag-ignored-when-unauth.
> **Mutation (RED proof) ×2**: (a) unauthenticated precedence reordered (requireAccount checked
> before the stored-guest guard) → **exactly** `unauthenticated_storedGuestSession_beatsAccountRequirement`
> fails (1 of 11); (b) authenticated precedence reordered (requireAccount checked before
> isAlreadyMember) → **exactly** `authenticated_alreadyMember_beatsAccountRequirement` fails (1 of
> 11). Both restored; production diff is clean.
>
> **Verified**: `assembleDebug testDebugUnitTest` locally (see run log for result). Reviewer PASS.
> Diff is `apps/android` only (1 new code file in `:core:model` + 1 test + tracking docs). Verdict:
> **PASS** — pure decision-engine addition, behavioural tests through the public API, no production
> logic outside apps/android.
>
> **Next**: continue the same feature toward `[x]` — port `joinAuthenticated` (`POST
> conversations/join/{linkId}`, idempotent) on `ShareLinkApi` + `AnonymousSessionRepository` (or a
> new `ShareLinkJoinRepository`) as the next thin, TDD-friendly slice; then the `:sdk-core`
> `ShareLinkEntryResolver` that assembles the facts; then rewire `MeeshyApp.kt`. Re-scout read-only
> before committing — parity notes are hypotheses.

> On 2026-08-22 **conversation-lock master-PIN change + remove shipped** (slice
> `conversation-lock-master-pin`, feature-parity §Chat — "Conversation lock: master PIN
> setup/change/remove + per-conversation 4-digit lock + unlock-all", flipped `[ ]` → `[x]`). This closes
> the last named arm of the conversation-lock feature; setup / per-conversation lock / open-gate /
> unlock-all were already live from prior slices.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 20 open PRs at branch
> time (#3311/#3310/#3299/#3289/#3281/#3280/#3275/#3270/#3266/#3262/#3259/#3255/#3253/#3250/#3249/#3247/
> #3245/#3243/#3242 …) are all web/shared/gateway/ios/sdk, none android-routine. Branched off
> freshly-fetched `origin/main` (`59aac98c`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `android-37.0` recipe worked
> (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran the full
> `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally, **BUILD SUCCESSFUL**
> (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS `ConversationLockSheet.Mode` has SEVEN modes;
> Android's `LockPinReducer` shipped only five — `changeMasterPin` and `removeMasterPin` (both Settings-level)
> were missing, leaving the box's "master PIN … change/remove" arm unmet. The store already exposed
> `removeMasterPin` (guarded) / `forceRemoveMasterPin` / `setMasterPin`, so no `:sdk-core` change was needed.
>
> **`:feature:chat`… `LockPinReducer`** (pure, extended): `CHANGE_MASTER_PIN` runs verify-current (step 0)
> → new (step 1) → confirm (step 2) → `CommitMasterPin(new)`; a new-pin mismatch rewinds to step 1 (NOT the
> already-passed verify step 0). `REMOVE_MASTER_PIN` verifies once then emits the new `RemoveMasterPin`
> effect. New copy keys map to the sheet's title/subtitle strings (change reuses "Verify master PIN" title
> with a distinct "enter current" subtitle, faithful to iOS). **`ConversationListViewModel`** gains
> `onChangeMasterPin`/`onRemoveMasterPin`, a mirrored `hasMasterPin` (refreshed from the lock store on every
> lock mutation AND after each master-PIN commit/removal), and the `canChangeMasterPin` /
> `canRemoveMasterPin` gates; `applyLockResult` applies `RemoveMasterPin` via the store's **guarded**
> `removeMasterPin`. **`ConversationListScreen`** adds a `LockSecurityMenu` overflow (top bar, visible once a
> PIN exists) offering Change (always) and Remove (only while nothing is locked). Strings en/fr/es/pt.
>
> **SOTA over iOS**: iOS `removeMasterPin` force-clears the PIN even while conversation locks survive —
> orphaning them (a lock can no longer be authorised, and unlock-all silently always fails against a null
> master). Android offers Remove ONLY while nothing is locked and applies it through the guarded store call,
> so an orphan is structurally impossible.
>
> **Tests: +17** — `LockPinReducerTest` +9 (change: length-all-steps / copy-per-step / happy verify→new→
> confirm→commit / wrong-current-keeps-verify / new-mismatch-rewinds-to-step-1-not-0; remove: length / copy /
> correct→RemoveMasterPin+Completed / wrong-flags-and-removes-nothing), `ConversationLockFlowViewModelTest`
> +8 (change: affordance-gated-on-pin / replaces-pin-leaving-locks / wrong-current-keeps-sheet / inert-no-pin;
> remove: affordance-requires-pin-and-no-locks / clears-it / wrong-keeps-it / inert-no-pin / inert-while-locked).
> **Mutation (RED proof) ×2**: (a) change new-pin mismatch `entryStep = 1` → `0` → **exactly**
> `a_mismatched_new_master_pin_resets_to_the_new_entry_step_not_the_verify_step` fails (1 of 38); (b)
> `canRemoveMasterPin` drop the `&& lockedConversationIds.isEmpty()` guard → **exactly**
> `the_remove_affordance_requires_a_pin_and_no_locks` fails (1 of 26). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL. Reviewer PASS. Diff is
> `apps/android` only (reducer + ViewModel + Screen + Sheet in `:feature:conversations`, strings×4, tracking
> docs). Verdict: **PASS** — pure state-machine additions, behavioural tests through the public API, no
> production logic outside apps/android.
>
> **Next**: the conversation-lock feature is now at full parity. Pick the next highest-value unchecked §Chat
> box — the "Conversation info sheet" (hero/direct headers + options tab; members/media/pinned already live)
> or "Anonymous-session conversation mode; guest join-via-share-link flow" (pure session/permission gating,
> TDD-friendly). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **conversation-stats sentiment three-way bar shipped** (slice
> `conversation-stats-sentiment-bar`, feature-parity §Chat — "Conversation stats rings + activity +
> content-type / **sentiment** breakdown", box flipped `[~]` → `[x]`). This closes the last open arm of
> the stats/analysis dashboard; the conversation-analysis surface is now at full iOS parity.
>
> **Step 0**: no open `claude/apps/android/*` slice PR at branch time (the 20 open PRs — #3301/#3299/
> #3298/#3289/#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3255/#3253/#3250/#3249/#3247/
> #3245/#3243 — are all web/shared/gateway/ios/sdk, none android-routine). Prior android iteration
> (`conversation-analysis-personas`, #3287-lineage) already merged. Branched off freshly-fetched
> `origin/main` (`f2ebc819`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Note: `compileSdk = 37` resolves
> to platform hash `android-37`, served by `platforms;android-37.0` (canary `--channel=3`); the FIRST
> gradle invocation raced its own auto-install of `android-37.0` and died with *"Failed to find target
> with hash string 'android-37'"* — a one-shot install race, NOT a real toolchain gap. Re-running once
> the platform finished installing built clean. Ran the full `assembleDebug testDebugUnitTest`
> (= `./apps/android/meeshy.sh check`) locally: **BUILD SUCCESSFUL** (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS `ConversationDashboardView.sentimentSection`
> renders a three-way sentiment split (positive/neutral/negative counts → % columns + a segmented
> success/warning/error bar) computed **client-side** via Apple `NLTagger` over the loaded `messages`
> (±0.15 thresholds, `shuffled().prefix(200)` sampling). Android had `SentimentAnalyzer` (`:core:model`,
> the composer's dictionary scorer from `composer-live-sentiment`) but no three-way projection and no
> stats-sheet consumer. This slice reuses that scorer — **no `NLTagger` equivalent, no new model** — so
> the earlier open question ("does this need an on-device NL model?") is answered: no.
>
> **`:core:model` `SentimentBreakdownProjection`** (new, pure SSOT): `toneOf(score)` collapses the
> seven-bucket `SentimentLevel` SSOT into `SentimentTone.{POSITIVE,NEUTRAL,NEGATIVE}` (reusing
> `SentimentLevel.from` rather than a parallel ±0.15 threshold — one sentiment SSOT, not two);
> `sample(list,max)` is a **deterministic even stride** (`i*size/max`, head-to-tail) — SOTA over iOS's
> RNG `shuffled().prefix(200)`; `breakdown(contents)` trims/drops-blank, samples to `MAX_SAMPLE=200`,
> scores each via `SentimentAnalyzer`, and tallies with `groupingBy().eachCount()`. `SentimentBreakdown`
> exposes `count`/`fraction`/`percent` (truncated, iOS `Int(frac*100)` parity), `segments()`
> (present-tones-only, pos→neu→neg order, zero dropped), and `dominant` (explicit tie-break
> positive ≥ neutral ≥ negative — port of iOS `dominantColor`; null when nothing scored).
>
> **`:feature:chat` `ConversationStatsViewModel`**: `load(conversationId, messageContents)` scores the
> texts on-device at load and stores `sentiment: SentimentBreakdown?` (null when nothing scorable). The
> score is **independent of the `/stats` network fetch** — it seeds the fresh state in `fetch(...)` and
> survives a fetch failure (Error phase still carries the sentiment); `retry()` keeps the already-scored
> value. **`ConversationStatsSheet`** renders it under the language section: three emoji/percent columns
> (😄/😐/😔, success/warning/error tints) + a segmented bar. `ChatScreen` passes the non-deleted message
> texts. Strings en/fr/es/pt.
>
> **Tests: +28** — `SentimentBreakdownProjectionTest` +24 (toneOf: zero / both neutral boundaries / just
> above / just below / strong ±; sample: fits / at-cap / even-stride / first-kept-never-rolls-past-last /
> non-positive-cap; breakdown: mixed-three-tones / drop-blank / trim / MAX_SAMPLE-cap / empty; breakdown
> derived: count / fraction / fraction-zero-total / percent-truncation / percent-zero-total / segments
> order+drop-zero / segments count+fraction / segments-empty / dominant-null / dominant-plurality×3 /
> dominant-tie-cascade), `ConversationStatsViewModelTest` +4 (scores-into-split / null-when-unscorable /
> survives-fetch-failure / retry-keeps-sentiment; the existing 7 still green). **Mutation (RED proof)
> ×2**: (a) `sample` stride → `list.take(max)` → **exactly** `sample strides evenly across an oversized
> list spanning head to tail` fails (1 of 28); (b) `dominant` tie-break arms swapped (neutral before
> positive) → **exactly** `dominant tie resolves positive before neutral before negative` fails (1 of
> 28). Both restored; production diff is clean.
>
> **Verified**: full `assembleDebug testDebugUnitTest` locally, BUILD SUCCESSFUL. Reviewer PASS. Diff is
> `apps/android` only (2 new code+test in `:core:model` + ViewModel/Sheet/ChatScreen wiring + strings×4 +
> tracking docs).
>
> **Next**: the conversation-analysis + stats dashboards are now at full parity — pick the next
> highest-value unchecked §Chat or §Feed box in `feature-parity.md` for the current build-order area.
> Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **AI participant persona profiles + trait bars shipped** (slice
> `conversation-analysis-personas`, feature-parity §Chat — "AI participant persona profiles + trait
> bars", now `[x]`). This closes the second half of the `/analysis` dashboard begun by
> `conversation-analysis-summary`; only the stats sheet's sentiment three-way bar remains on that area.
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 20 open PRs at
> branch time (#3292/#3289/#3288/#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3257/#3255/
> #3253/#3250/#3249/#3247/#3245/#3243) are all web/shared/gateway/ios/sdk, none android-routine. Prior
> android iteration (`conversation-analysis-summary`, #3287) already merged into main. Branched off
> freshly-fetched `origin/main` (`bf1367e4`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). `android-37.0` recipe worked
> (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran the
> full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally, BUILD SUCCESSFUL.
>
> **The gap (read-only recon over iOS + Android)**: iOS's `ConversationDashboardView`
> `agentParticipantProfilesSection` + `traitBarsView` render `ConversationAnalysis.participantProfiles`
> (persona summary, tone, vocabulary, confidence badge, 4 trait axes as score bars, catchphrases,
> topics, emojis) from `GET /conversations/{id}/analysis`. On Android the whole
> `ParticipantProfile`/`ParticipantTraits`/`CommunicationTraits`/… tree in `AgentAnalysis.kt` shipped
> **orphaned** — grep confirmed zero consumers outside the model file. The summary half went real last
> iteration; this slice turns the **persona half** real.
>
> **`:core:model` `ParticipantProfileProjection`** (new, pure SSOT): `traitTier` (≥70 GOOD / ≥40 MID /
> else LOW — faithful port of iOS `traitScoreColor`, which uses `>=` UNLIKE `healthScoreColor`'s `>`),
> `bars(axis)` (present-traits-only, score **clamped 0..100**, **stable** desc sort, top 4 — SOTA over
> iOS's raw-score bar width + unstable Swift sort + `Mirror` reflection extraction), `categories(tree)`
> (the 4 axes in canonical order, empty ones dropped, null tree ⇒ none), `profile()` →
> `ParticipantProfileView` (name = displayName › username › userId as a **single** seed for label AND
> colour — SOTA over iOS's `"?"`-for-label vs userId-for-colour fork; confidence **clamped 0..1** then
> `>0`-gated percent — SOTA over iOS's raw `Int(confidence*100)`; trimmed persona/tone/vocabulary;
> deduped topics/emojis + de-blanked catchphrases capped 3/6/3).
>
> **`:feature:chat` `ConversationAnalysisViewModel`** now projects BOTH halves of the same `/analysis`
> response (added `profiles: List<ParticipantProfileView>`); phase is **Empty only when the summary AND
> the personas are both empty** (backward-compatible — the existing Empty tests carry no profiles).
> **`ConversationAnalysisSheet`** renders the personas **under the summary in the same sheet** (no third
> header button — matches iOS's single dashboard): a per-persona card with an accent stripe, coloured
> seed dot, name, confidence pill, italic persona, tone/vocabulary chips, the trait-bar categories
> (label + fraction bar + tier-coloured score), catchphrases, topics + emojis. Strings en/fr/es/pt.
>
> **Tests: +25** — `ParticipantProfileProjectionTest` +22 (traitTier: ≥70/69/≥40/<40 boundaries;
> bars: present-only / desc / stable-tie / top-4-cap / clamp-out-of-range / empty-axis; categories:
> canonical-order / drop-empty-axis / null-tree; confidence: zero-or-neg-null / floor / clamp>1; name:
> displayName / username-fallback / userId-fallback; text: blank→null / trimmed; lists: catchphrases
> drop-blank+cap3 / topics dedupe+cap3 / emojis dedupe+cap6; profiles: maps-all-incl-empty / empty),
> `ConversationAnalysisViewModelTest` +3 (personas-without-summary Loaded / both-present / — the
> existing 6 still green under the new Empty rule). **Mutation (RED proof) ×2**: (a) `traitTier`
> `>=`→`>` at the GOOD threshold → **exactly** `traitTier at or above seventy is good` fails (1 of 26);
> (b) drop `bars`' `.take(4)` → **exactly** `bars cap at four even when more are present` fails (1 of
> 26). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally this
> run, BUILD SUCCESSFUL. Reviewer PASS. Diff is `apps/android` only (2 new code+test + ViewModel/Sheet
> wiring + strings×4 + tracking docs).
>
> **Next**: the stats dashboard's **sentiment three-way bar**
> (`ConversationDashboardView.sentimentAnalysis` — positive/neutral/negative segmented bar). Note iOS
> computes sentiment on-device via `NLTagger`; the Android equivalent has no bundled NL sentiment
> engine, so re-scout whether the gateway serves a sentiment field or whether this needs an on-device
> model decision before committing. If that's too heavy for one slice, pick the next-highest §Chat or
> §Feed parity box. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-22 **AI conversation-analysis summary card shipped** (slice `conversation-analysis-summary`,
> feature-parity §Chat — "AI conversation analysis (health score, summary, topics, tone, emotions)",
> now `[x]`; only the participant-persona/trait-bars arm of the same endpoint remains).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 18 open PRs at
> branch time (#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3257/#3255/#3253/#3250/#3249/
> #3247/#3245/#3243/#3242) are all web/shared/gateway/ios/sdk, none android-routine. Prior android
> iteration (`conversation-stats-core`) already merged into main. Branched off freshly-fetched
> `origin/main` (`99d0ba1d`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (curl → 200). Pristine `android-37.0` recipe
> worked (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`);
> ran the full `assembleDebug testDebugUnitTest` locally.
>
> **The gap (read-only recon over iOS + Android)**: iOS's `ConversationDashboardView.heroHealthCard`
> renders `ConversationAnalysis.summary` (health score / tone / topics / dominant emotions /
> engagement / conflict / dynamique) fetched from `GET /conversations/{id}/analysis`. On Android the
> whole `ConversationAnalysis` model tree in `AgentAnalysis.kt` shipped **orphaned** — grep confirmed
> zero references outside the model file (no repository, no consumer). The stats half (sibling
> `ConversationMessageStatsResponse`) was turned real last iteration; this slice turns the **AI-summary
> half** real. The AI-persona/trait-bars arm stays a separate open box on the same endpoint.
>
> **`:core:model` `ConversationAnalysisProjection`** (new, pure SSOT): `healthTier` (>70 good / >40
> fair / else poor — faithful port of iOS `healthScoreColor` cut-offs), `conflictTier`
> (case-insensitive high|eleve|fort / medium|moyen|modere keyword match, high wins — parity
> `conflictLevelColor`), `cleanLabels` (trim / drop-blank / case-insensitive dedupe preserving first
> casing + order — **SOTA over iOS**, which renders the raw list so `["Joy","joy"]` doubles),
> `summary()` → a render-ready `AnalysisSummaryView` or **null** (the Empty state) when the summary is
> absent or projects to no content (`hasContent` excludes messageCount as metadata). The health score
> is **clamped 0..100** before the tier derives (SOTA — iOS trusts the raw value); messageCount clamps
> ≥0.
>
> **`:sdk-core` `ConversationAnalysisRepository`**: thin dependency-light sibling of
> `ConversationStatsRepository` (only the API — analysis is an ephemeral drill-down that neither reads
> nor writes Room), `fetchAnalysis(id)` → `NetworkResult` via `apiCall`. New
> `ConversationApi.analysis(id)` (`@GET conversations/{id}/analysis`) — the two existing stub-based
> repo tests (`ConversationRepositoryTest`, `ConversationStatsRepositoryTest`) gained the new override.
>
> **`:feature:chat` `ConversationAnalysisViewModel`** (`StateFlow<ConversationAnalysisUiState>`,
> Loading/Loaded/Empty/Error): fetches once, projects at load; `load` idempotent (re-tries only a
> prior Error), `retry()` re-fetches. **`ConversationAnalysisSheet`** + a new header `AutoAwesome`
> action (any member) render it: health badge (tier-tinted), engagement/conflict chips (tier-tinted),
> tone, topics + emotions chip rows, summary narrative, dynamic. Strings en/fr/es/pt.
>
> **Tests: +23** — `ConversationAnalysisProjectionTest` +17 (healthTier: >70/=70/41..70/=40/≤40;
> conflictTier: high×3-lang / medium×3-lang / low-fallback / high-wins-over-medium; cleanLabels:
> trim+drop-blank / case-insensitive-dedupe-order / empty; summary: null-no-summary / null-all-blank /
> full-projection / clamp-out-of-range-score / no-tier-when-text-only / health-only-surfaces /
> clamp-negative-count), `ConversationAnalysisRepositoryTest` +3 (success forwards id / envelope
> failure / transport failure), `ConversationAnalysisViewModelTest` +6 (loaded projection / no-summary
> Empty / blank-summary Empty / failure Error / idempotent load / retry after failure). **Mutation
> (RED proof) ×2**: (a) drop `summary()`'s `takeIf { it.hasContent }` → **exactly** `summary is null
> when every renderable field is blank or empty` fails (1 of 19); (b) `healthTier` `>`→`>=` at the good
> threshold → **exactly** the two boundary tests asserting 70 is FAIR fail (2 of 19). Both restored.
> Genuine RED was also captured up-front: the first projection-test run BUILD FAILED on `Unresolved
> reference 'HealthTier'/'ConversationAnalysisProjection'` before the impl existed.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally this
> run. Reviewer PASS. Diff is `apps/android` only (3 code + 3 test + ChatScreen/Api wiring + strings×4 +
> tracking docs).
>
> **Next**: the **AI participant persona profiles + trait bars** box (same endpoint, still-orphaned
> `ParticipantProfile`/`ParticipantTraits`/`CommunicationTraits`/… in `AgentAnalysis.kt`) — the other
> half of this dashboard; or the stats dashboard's own **sentiment three-way bar**
> (`ConversationDashboardView.sentimentAnalysis`). Re-scout read-only before committing — parity notes
> are hypotheses.

> On 2026-08-21 **Conversation stats dashboard shipped** (slice `conversation-stats-core`,
> feature-parity §Chat — "Conversation stats rings + activity-over-time + content-type breakdown").
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the 18 open PRs at branch
> time — #3282/#3281/#3280/#3279/#3275/#3270/#3266/#3263/#3262/#3259/#3257/#3255/#3253/#3250/#3249/#3247/
> #3245/#3243/#3242 — are all web/shared/gateway/ios/sdk, none android-routine). Prior android iteration
> (`story-viewer-translation-request`, #3278) already merged into main. Branched off freshly-fetched
> `origin/main` (`1def3504`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (200). One gotcha: `compileSdk = 37` resolves to
> platform hash `android-37`, but the platform AGP 8.13.0 accepts is `android-37.0` (Android 17,
> `AndroidVersion.ApiLevel=37.0`). The first run failed (`Failed to find target … 'android-37'`) because it
> raced the mid-install auto-download; once `android-37.0` finished installing, `compileDebugKotlin`
> resolved it cleanly. Ran the full `assembleDebug testDebugUnitTest` locally this run.
>
> **The gap (read-only recon over iOS + Android)**: iOS reaches a full `ConversationDashboardView`
> (`ConversationMessageStatsResponse` via `GET /conversations/{id}/stats` + `ConversationAnalysis` via
> `/analysis`). On Android the DTOs shipped **orphaned** — `AgentAnalysis.kt` defines
> `ConversationMessageStatsResponse`/`ContentTypeCounts`/`DailyActivityEntry`/… but nothing consumed them
> (confirmed by grep: zero references outside the model file). This slice turns the STATS half real; the
> AI-analysis (sentiment/health/persona) half stays a separate, still-open box.
>
> **`:core:model` `ConversationStatsProjection`** (new, pure SSOT): `contentTypeBreakdown` (server
> `ContentTypeCounts` → non-zero shares, count-desc, canonical tie-break, empty on zero total — **SOTA over
> iOS**, which re-counts the loaded message page and under-counts un-paged content), `activitySeries`
> (trailing-window filter with an **injected `today`** — deterministic, unlike iOS's wall-clock view getter;
> drops unparseable dates, ALL keeps everything, oldest-first), `participantShares`/`languageShares`
> (fraction + stable ordering, zero-total safe), `hourlyBuckets` (fixed 24-slot histogram; ignores
> non-numeric/out-of-range keys, clamps negatives, accumulates dupes).
>
> **`:sdk-core` `ConversationStatsRepository`**: thin dependency-light sibling of `ConversationRepository`
> (only the API — stats is an ephemeral drill-down that neither reads nor writes Room), `fetchStats(id)` →
> `NetworkResult` via `apiCall`. New `ConversationApi.stats(id)` (`@GET conversations/{id}/stats`).
>
> **`:feature:chat` `ConversationStatsViewModel`** (`StateFlow<ConversationStatsUiState>`,
> Loading/Loaded/Empty/Error): fetches once, projects the time-independent sections at load, and exposes the
> activity series as a pure `activity(today)` getter so a **period switch re-derives locally, no refetch**
> (the "pass time in" doctrine the chat header already uses for presence). `load` is idempotent (re-tries only
> a prior Error); `retry()` re-fetches; `selectPeriod` inert on no-op. **`ConversationStatsSheet`** + a new
> header `Insights` action (any member) render it: total pills, content-type bars, an accent activity
> mini-chart with a 7d/30d/All picker, busiest-participant list, language breakdown. Strings en/fr/es/pt.
>
> **Tests: +30** — `ConversationStatsProjectionTest` +20 (content: drop-zero/fractions/order/tie/empty;
> hourly: 24-span/invalid+range/negative-clamp/padded-key; activity: window/cutoff-inclusive/ALL/sort/
> bad-date/empty; participant: fraction/zero-total/order/name-then-id tie/empty; language:
> fraction/order+tie/drop-zero/empty), `ConversationStatsRepositoryTest` +3 (success forwards id / envelope
> failure / transport failure), `ConversationStatsViewModelTest` +7 (loaded projection / empty / error /
> period re-derives without refetch / idempotent load / retry after failure / inert period). **Mutation
> (RED proof) ×2**: (a) drop the `count > 0` filter in `contentTypeBreakdown` → 3 content tests fail
> (zero-count/order/tie); (b) drop the activity cutoff (`date.isBefore(cutoff)`) → **exactly** `activity week
> keeps only points within the trailing window` fails (1 of 24). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) locally this run.
> Reviewer PASS. Diff is `apps/android` only (4 code + 3 test + ChatScreen/Api wiring + strings + tracking docs).
>
> **Next**: the **AI conversation analysis** arm (`GET /conversations/{id}/analysis` → `ConversationAnalysis`
> health score / summary / tone / emotions) — the other half of this dashboard and its own parity box — or
> the **AI participant persona profiles + trait bars** box (same endpoint, `ParticipantProfile`/
> `ParticipantTraits`). Both consume the same still-orphaned `AgentAnalysis.kt` models. Re-scout read-only
> before committing — parity notes are hypotheses.

> On 2026-08-21 **Story on-demand translation shipped** (slice `story-viewer-translation-request`,
> feature-parity's Feed §F Prisme line — the **per-story timeline flag strip** arm, the LAST item on the
> `request-missing-languages` follow-up. The whole follow-up (feed card / post-detail / comments / story) is
> now done).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the open PRs at branch time are
> all web/shared/gateway/ios/sdk — none android-routine). Prior android iteration
> (`feed-comment-translation-request`, #3273) already merged into main. Branched off freshly-fetched
> `origin/main` (`9233e850`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (`curl` → 200). Pristine `android-37.0` recipe worked
> (`sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`); ran the full
> `assembleDebug testDebugUnitTest` locally.
>
> **The gap (read-only recon over iOS + Android)**: the story viewer's language quick bar
> (`StoryViewerViewModel.availableLanguagesFor`) only listed languages ALREADY present in `StoryItem.translations`
> — a configured content language the story had no translation for yet never surfaced, so a viewer could not
> request one. iOS surfaces on-demand story translation via `StoryLanguageDetailView` (a full picker, socket-
> completed `POST /posts/:id/translate`). Android has no story-translation socket consumer, so — exactly as the
> feed post/comment arms did — the faithful move is **pull-translate-and-merge**, surfacing configured-but-absent
> languages as translatable chips directly in the quick bar (no separate picker sheet needed yet).
>
> **`:core:model` `StoryTranslationMerge`** (new, list-keyed sibling of `PostTranslationMerge`):
> `mergeTranslation(item: StoryItem, target, text): StoryItem?` upserts into the `List<StoryTranslation>` — blank
> target/text guard, idempotent (same lang case-insensitive + same content → null), in-place replace preserving
> position & original casing, else append under the trimmed target.
>
> **`:sdk-core` `StoryRepository`**: now injects `TranslationApi`; new stateless
> `translateStory(item, target): StoryItem?` (story-shaped sibling of `PostRepository.translatePost`) — trims
> target, reads `item.content` as source (empty `sourceLanguage` → translator auto-detects; stories carry no
> `originalLanguage`), blocking-translates via `translationApi.translate`, folds via `StoryTranslationMerge`.
> Null on blank target / no source / network failure / blank translation / idempotent.
>
> **`:feature:stories` `StoryViewerViewModel`**: `StoryLanguageOption` gains `isTranslatable`/`isTranslating`;
> `availableLanguagesFor` appends each configured content language (`LanguageResolver.preferredContentLanguages`)
> absent from the present set as a translatable chip — GATED on the story already carrying ≥1 translation (a
> pure-original story never dumps every preferred language) and on a real logged-in viewer (an anonymous viewer
> with no prefs sees only present translations). New `requestStoryTranslation(code)`: in-flight guard via
> `translatingLanguages` (keyed `storyId|lang`), pull-translate-and-merge into `rawItems`, then switch the
> "Exploration" `languageOverride` to the target so the slide re-renders in it even when a higher-priority
> language is already present (Prisme auto-resolution would otherwise keep the primary). Cancellation-safe;
> failure inert (strip retries); `finally` clears the key. **`:sdk-ui` `LanguageQuickStrip`**: `LanguageQuickOption`
> gains the two flags; a translatable chip reads dimmed with a "+" affordance ("…" in flight). **`StoryViewerScreen`**
> routes a translatable tap to `requestStoryTranslation`, a content tap to `toggleLanguageOverride`.
>
> **Tests: +21** — `StoryTranslationMergeTest` +8 (append no-translations / append preserving order / replace
> in place preserving position+casing / blank target / blank text / trims target / idempotent / case-insensitive
> replace), `StoryRepositoryTest` +7 (`translateStory`: translates+merges / forwards source & trims target /
> inert blank target / inert no source / null on failure / null on blank / idempotent), `StoryViewerViewModelTest`
> +6 (translatable surfaces once translated / none when no translations / present language never re-offered /
> requests+merges+switches / failed leaves display / second in-flight no duplicate). **Mutation (RED proof) ×2**:
> (a) drop the VM in-flight guard → **exactly** `a second in-flight request … does not fire a duplicate` fails
> (1 of 50); (b) drop `languageOverride = storyId to target` → **exactly** `requesting a translation … switches
> to it` fails (1 of 50) — the switch test deliberately uses a secondary language (en present, de requested) so
> Prisme auto-resolution cannot mask the missing override. Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → BUILD SUCCESSFUL
> locally this run. Reviewer PASS. Diff is `apps/android` only (5 code + 3 test files + tracking docs).
>
> **Next**: Feed §F Prisme's `request-missing-languages` follow-up is now COMPLETE across every surface. Candidates:
> the Chat `slow`/retry glyph tier (still waits on outbox retry-state plumbing), or the next unchecked Feed/Stories
> parity box. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Comment on-demand translation shipped** (slice `feed-comment-translation-request`,
> feature-parity's Feed §F Prisme line — the **comments** arm of the `request-missing-languages` follow-up.
> Only the per-story timeline flag strip remains on that line).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 14 open PRs at branch
> time (#3270/#3266/#3263/#3262/#3259/#3257/#3255/#3253/#3250/#3249/#3247/#3245/#3243/#3242 web/shared/
> gateway/ios/sdk) are none android-routine. Prior android iteration (`feed-post-detail-translation-request`,
> #3269) already merged into main. Branched off freshly-fetched `origin/main` (`8ddb8bda`).
>
> **SDK bootstrap — `dl.google.com` REACHABLE this run** (`curl` → 200). Pristine `android-37.0` recipe
> worked: `sdkmanager --channel=3 "platforms;android-37.0" "build-tools;35.0.0" "platform-tools"`;
> `local.properties` → `sdk.dir=$HOME/android-sdk`; ran the full `assembleDebug testDebugUnitTest` ONLINE
> with `-Pandroid.builder.sdkDownload=false` after the initial install → BUILD SUCCESSFUL (973 tasks).
>
> **The gap (read-only recon over iOS + Android)**: iOS's `FeedCommentsSheet.onRequestTranslation` routes a
> content-less comment language tap to `PostService.requestCommentTranslation` (REST, socket-completed).
> Android's `PostCommentsViewModel.onCommentFlagTap` carried a **dead** `RequestTranslation -> Unit` arm AND
> `CommentProjection.build` passed no `includeTranslatable`, so a configured-but-absent language never even
> surfaced a chip. Android has no post/comment-translation socket consumer, so the faithful move mirrors the
> post arms: pull-translate-and-merge, NOT iOS's socket path (which would be blocked/cross-cutting).
>
> **`:core:model` `PostTranslationMerge`**: new `mergeTranslation(comment: ApiPostComment, …)` overload; the
> post and comment overloads now share one private `upsert(translations, target, text)` law (blank/idempotent
> guards + in-place-or-append). **`:sdk-core` `PostRepository`**: new stateless
> `translateComment(comment, target): ApiPostComment?` (comment-keyed sibling of `translatePost`); both trim
> the target and delegate to a shared `translateSource(source, sourceLanguage, target): String?` network law
> (the cache-mutating `requestOnDemandTranslation` now delegates to `translatePost`, so all three share one
> translate path).
>
> **`:feature:feed`**: `CommentProjection.build` flips `includeTranslatable = true` (SSOT strip; the tap was
> already wired `PostCommentsSection` → `viewModel::onCommentFlagTap`). `CommentThreadState.retranslated` /
> `CommentRepliesState.retranslated` fold ONLY the merged translations onto the live row (leaving `replyCount`
> etc. untouched, so a concurrent realtime bump is never clobbered), inert for the other collection. The VM's
> `requestCommentTranslation` guards in-flight via new `PostCommentsUiState.translatingLanguages`
> (`commentId|lang`, folded through the projection via a new `ProjectionBundle`), applies both retranslate
> transitions (covers top-level + reply), and points `activeLanguages[commentId]` at the target; cancellation-safe,
> failure surfaces `errorMessage`, `finally` clears the key.
>
> **Tests: +21** — `PostTranslationMergeTest` +6 (comment overload: append / replace-in-place case-insensitive /
> idempotent / blank target / blank text), `PostRepositoryTest` +7 (`translateComment`: translates+returns merged /
> forwards source+langs & trims / inert blank target / inert no source / null on failure / null on blank / idempotent),
> `CommentThreadStateTest` +3 (`retranslated`: replaces only the match / preserves replyCount / inert unknown),
> `CommentRepliesStateTest` +2 (`retranslated`: replaces only the match / inert), `CommentProjectionTest` +1
> (configured-absent language surfaces a translatable chip), `PostCommentsViewModelTest` +4 (translatable tap
> requests & switches to merged / failed leaves display / second in-flight no duplicate / reply translated too);
> 1 obsolete dead-arm test (`content-less language is inert`) rewritten to the new contract (a content-less tap now
> requests + leaves display until it lands). **Mutation (RED proof) ×2**: (a) remove the VM in-flight guard →
> **exactly** `a second in-flight translation tap does not fire a duplicate request` fails (1 of 99); (b) drop
> `activeLanguages.update` → **exactly** the two `switches to the merged translation` tests fail (2 of 99). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → **BUILD SUCCESSFUL**
> (973 tasks) locally this run. Reviewer PASS. Diff is `apps/android` only (6 code + 6 test files + tracking docs).
>
> **Next**: the **per-story timeline flag strip** on-demand request arm (last item on Feed §F Prisme's
> `request-missing-languages` follow-up), or the Chat `slow`/retry glyph tier (still waits on outbox retry-state
> plumbing). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Post-detail on-demand translation shipped** (slice `feed-post-detail-translation-request`,
> feature-parity's Feed §F Prisme line — the post-detail arm of the `request-missing-languages` follow-up;
> only the **comments** arm + the per-story timeline strip remain there).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 14 open PRs at branch
> time (#3268/#3267/#3266/#3263/#3262/#3259/#3255/#3253/#3250/#3249/#3247/#3245/#3243/#3242 web/shared/
> gateway/ios/sdk) are none android-routine. Prior android iteration (`feed-post-translation-request`, #3265)
> already merged into main. Branched off freshly-fetched `origin/main` (`83687db6`).
>
> **SDK bootstrap — `dl.google.com` was REACHABLE this run** (`curl` → 200; unlike prior containers where it
> was 403-blocked). Pristine `android-37.0` recipe worked: `sdkmanager --channel=3 "platforms;android-37.0"
> "build-tools;35.0.0" "platform-tools"`; `local.properties` → `sdk.dir=$HOME/android-sdk`; run online once
> then `-Pandroid.builder.sdkDownload=false`. **Trap re-confirmed**: `--offline` fails a full `assembleDebug`
> when only sdk-core/feature:feed deps were cached by an earlier targeted run — `:app` needs androidx.browser,
> zxing, activity etc. that were never fetched. Run the full `assembleDebug testDebugUnitTest` ONLINE.
>
> **The gap (read-only recon over iOS + Android)**: the feed's flag-strip on-demand request arm (slice
> `feed-post-translation-request`) left `PostDetailViewModel.onFlagTap`'s `RequestTranslation -> Unit` arm
> dead. `FeedPostBuilder.build` already sets `includeTranslatable = true` universally, so the post-detail
> strip *surfaces* a configured-but-absent language as a translatable chip — but tapping it did nothing.
> The feed's own `PostRepository.requestOnDemandTranslation(postId, target)` mutates `_feedCache`, which the
> detail VM does NOT observe (it owns its post in `rawPost` from an independent `getPost` fetch). So the
> faithful move was a **stateless** repository method returning the merged post the caller swaps in.
>
> **Repository (`:sdk-core` `PostRepository`)**: new `translatePost(post: ApiPost, target): ApiPost?` — trims
> target, reads source, blocking-translates via `translationApi.translate`, folds into the post via
> `PostTranslationMerge.mergeTranslation`; returns the merged post or `null` (blank target/no source/network
> failure/blank translation/idempotent). Extracted the shared `translateAndMerge` law and **refactored the
> existing `requestOnDemandTranslation` to delegate to it** (behaviour identical under single-thread — its 8
> tests stayed green), so both surfaces share one translate-then-merge path.
>
> **VM wiring (`:feature:feed` `PostDetailViewModel`)**: `onFlagTap`'s `RequestTranslation` arm now calls a
> new private `requestOnDemandTranslation(target)` — in-flight guard via new `PostDetailStatus.translating`
> (surfaced as `PostDetailUiState.translatingLanguages`, symmetric with `FeedUiState`); `viewModelScope.launch`
> translate → on success `rawPost.value = merged` + `activeCode.value = target` so the card switches once the
> merged post lands; cancellation-safe, failure surfaces `errorMessage`, `finally` clears the in-flight key.
>
> **Tests: +10** — `PostRepositoryTest` +7 (`translatePost`: translates+returns merged / forwards source+langs
> & trims target / inert blank target / inert no source / null on translator failure / null on blank
> translation / idempotent null), `PostDetailViewModelTest` +3 (translatable tap requests & switches to merged
> / failed tap leaves display unchanged / second in-flight tap no duplicate). **Mutation (RED proof) ×2**:
> (a) remove the VM in-flight guard → **exactly** `a second tap while a translation is in flight does not fire
> a duplicate request` fails (1 of 33); (b) drop `activeCode.value = target` → **exactly** `onFlagTap on a
> translatable language requests it and switches to the merged translation` fails (1 of 33). Both restored.
>
> **Verified**: targeted `:sdk-core` + `:feature:feed` `testDebugUnitTest` green; full `assembleDebug`
> `testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → BUILD SUCCESSFUL locally this run. Reviewer PASS.
> Diff is `apps/android` only (4 code/test files + tracking docs).
>
> **Next**: the **comments** on-demand request arm (`PostCommentsViewModel.onCommentFlagTap` still carries the
> dead `RequestTranslation -> Unit` arm) — heavier: comments are `ApiPostComment` translated via their own
> path, so it needs a comment-translation repository method (no `translatePost` reuse). Re-scout the iOS
> comment-translation path first. Otherwise the per-story timeline flag strip, or the Chat `slow`/retry glyph
> tier (still waits on outbox retry-state plumbing). Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Feed on-demand post-translation shipped** (slice `feed-post-translation-request`,
> feature-parity's Feed §F Prisme line — the `request-missing-languages` sub-gap, now `[x]`; only the
> per-story timeline strip + the post-detail/comments request arms remain there).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 12 open PRs at branch
> time (#3263/#3262/#3259/#3255/#3253/#3249/#3247/#3245/#3243/#3242 web/shared/gateway, #3257/#3250 iOS) are
> none android-routine. Prior android iteration (`feed-realtime-comment-count`) already merged. Branched off
> freshly-fetched `origin/main` (`6062746b`).
>
> **SDK bootstrap — the pristine-`android-37.0` recipe is the ONLY one that works on this container (the
> `cp→android-37` patch recipe FAILS here):** `sdkmanager --channel=3 "platforms;android-37.0"` still writes
> malformed metadata (`source.properties` → `ApiLevel=37.0`, "Platform 17"), but AGP 8.13 maps `compileSdk 37`
> → the `android-37.0` **dir** directly and BUILDS GREEN. The intervening notes' `cp -r android-37.0 android-37`
> + sed-to-`android-37` recipe was tried first here and FAILED: AGP's error message reads "compile SDK version
> **37.0**" and it wants the minor-versioned dir, so a hand-made `android-37` (even with perfect metadata) is
> never matched — `Failed to find target with hash string 'android-37'`. Two more traps: (1) a first `./gradlew`
> auto-re-downloads the pristine malformed `android-37.0` on top of your patch → keep auto-download OFF with
> `-Pandroid.builder.sdkDownload=false` after the initial install; (2) `--offline` fails the first ever run
> (AGP 8.13.0 plugin not yet cached) — run online once. `assembleDebug testDebugUnitTest` green after (973 tasks).
>
> **The gap (scout + read-only recon over iOS + Android)**: iOS's feed flag strip routes a content-less
> language tap to a translation request (`FeedPostCard.handleFlagTap` → `PostService.requestTranslation`,
> REST `POST /posts/:id/translate`, completed by a socket event). Android's `FeedViewModel.onPostFlagTap`
> had a **dead** `RequestTranslation -> Unit` arm and the strip passed `includeTranslatable = false`, so a
> configured-but-absent language never even surfaced. Chat already shipped this exact pattern
> (`ChatViewModel.requestOnDemandTranslation` → `MessageRepository.requestTranslation` translate+merge) — the
> faithful, apps/android-only move was to mirror it (NOT iOS's socket path — Android has no post-translation
> socket consumer, which would be blocked/cross-cutting).
>
> **Pure reducer (`:core:model` `PostTranslationMerge`)**: the map-keyed sibling of `MessageTranslationMerge`
> — `mergeTranslation(post, target, translated): ApiPost?`. Blank target/text → null; identical entry already
> present (case-insensitive key match, same text) → null; else upsert (replace in place under the original
> key, else append under the trimmed code). No tombstone guard (ApiPost has no `deletedAt`).
>
> **Repository (`:sdk-core` `PostRepository`)**: gains `translationApi: TranslationApi` (Hilt-provided, as
> `MessageRepository`) + `requestOnDemandTranslation(postId, target): Boolean` — trims target, reads the cached
> post's source text, blocking-translates via `translationApi.translate`, merges into `_feedCache` via
> `PostTranslationMerge`; returns whether stored. Inert (`false`, no network) for unknown post / blank target /
> no source / failure / blank result / idempotent. The old fire-and-forget `requestTranslation` (dead, iOS
> socket-path parity) left untouched.
>
> **VM wiring (`:feature:feed`)**: `onPostFlagTap`'s `RequestTranslation` arm now calls a new
> `requestOnDemandTranslation` (mirror of chat's, keyed per post): in-flight guard via new
> `FeedUiState.translatingLanguages` (`postId|lang`), `viewModelScope.launch` translate → on success
> `activeLanguageOverride += postId→target` so the card switches once the merged post arrives off the cache
> stream; cancellation-safe, failure surfaces `errorMessage`. `FeedPostBuilder` flips `includeTranslatable = true`.
>
> **Tests: +20** — `PostTranslationMergeTest` +8 (append to empty / alongside existing preserving order /
> replace in place / case-insensitive key kept / idempotent no-op / blank target / blank text / trims code),
> `PostRepositoryTest` +8 (stores + reports success / forwards source text+langs & trims / inert unknown post /
> inert blank target / inert no source / translator-failure false / blank-translation false / idempotent false),
> `FeedViewModelTest` +3 (tap translatable → requests & switches to merged / failed leaves language unchanged /
> second in-flight tap no duplicate), `FeedPostBuilderTest` +1 (configured-absent language surfaces as a
> translatable chip). **Mutation (RED proof) ×2**: (a) neuter `PostTranslationMerge`'s idempotence clause →
> **exactly** `is a no-op when the identical translation is already present` fails (1 of 8); (b) neuter the VM
> in-flight guard → **exactly** `a second tap while a translation is in flight does not fire a duplicate request`
> fails (1 of 70). Both restored.
>
> **Verified**: full `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) → **BUILD SUCCESSFUL**
> (973 tasks) locally this run. New suites ran green (PostTranslationMergeTest 8/8, PostRepositoryTest 30/30,
> FeedViewModelTest 70/70, FeedPostBuilderTest 28/28). Reviewer PASS. Diff is `apps/android` only (7 files +
> tracking docs).
>
> **Next**: the same on-demand request arm on the **post-detail + comments** surfaces (`PostDetailViewModel`/
> `PostCommentsViewModel` still carry the dead `RequestTranslation -> Unit` arm — a thin follow-up reusing
> `PostRepository.requestOnDemandTranslation`, though comments translate via their own path — re-scout). Or the
> per-story timeline flag strip (heavier — needs a story translation surface). Otherwise the Chat `slow`/retry
> glyph tier still waits on outbox retry-state plumbing. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Live feed comment-count sync shipped** (slice `feed-realtime-comment-count`,
> feature-parity's Feed §F social-feed realtime block — extends the created/deleted/liked/bookmarked
> overlay family with `comment:added`/`comment:deleted`).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 10 open PRs at branch
> time (#3259/#3255/#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3257/#3250 iOS) are none
> android-routine. Prior android iteration (#3258, conversation-lock-unlock-all) already merged into main
> (`bfd152fe`). Branched off freshly-fetched `origin/main` (`bfd152fe`).
>
> **SDK bootstrap:** dl.google.com reachable in this container (curl → 200). Used the NOTES 2026-08-21
> recipe that finally works cleanly: install a **pristine** `platforms;android-37.0` via
> `sdkmanager --channel=3` and let AGP 8.13 auto-map `compileSdk 37` → `android-37.0` (NO hand-patched
> `android-37` dir, no sed, no symlink). `assembleDebug testDebugUnitTest` green after. Capture gradle
> output to a file and grep for `BUILD FAILED` (a piped `| tail` swallows the exit code).
>
> **The gap (iOS-parity scouted)**: iOS `FeedViewModel` live-updates each feed card's comment count on
> `comment:added`/`comment:deleted` by setting `posts[index].commentCount = data.commentCount` (ABSOLUTE,
> `FeedViewModel.swift:1246`/`:1256`). Android's `FeedViewModel` consumed `commentAdded` only in the
> post-detail/comments VMs — the **feed list card's** comment count was static, never bumped live.
>
> **Pure reducer (`:feature:feed` `FeedRealtimeReducer`)**: new `FeedRealtimeHead.comments: Map<String, Int>`
> overlay + `comment(state, postId, commentCount)` (blank-id inert; `coerceAtLeast(0)` clamp; same-count
> dedup → same instance) + `reconcileComments(state, cachePosts)` (releases overlays the cache has caught
> up to, `null` cache count reads as 0; keeps overlays for posts absent from cache; same-instance when
> unchanged). `clear` auto-resets via `FeedRealtimeHead()`. No viewer-own dimension — a comment count is
> public (unlike like/bookmark).
>
> **Wiring**: `FeedViewModel` collects `commentAdded`/`commentDeleted` → `FeedRealtimeReducer.comment`;
> the projection adds `reconcileComments` to the reconcile chain and `.withCommentOverlays(comments)` to
> both the cache and realtime-head projections (new private helper mirroring `withLikeOverlays`).
>
> **Tests**: **+18** — `FeedRealtimeReducerTest` +12 (records absolute count; blank-id inert; idempotent
> dedup; addition raises / deletion lowers; negative clamp; reconcile release/keep-behind/keep-absent/
> null-cache-as-zero/partial-release; clear drops overlay), `FeedViewModelTest` +6 (comment-added raises /
> comment-deleted lowers the card count live; event for an unknown post inert; overlay survives a stale
> re-emission; a later cache count is respected once reconciled away; refresh drops the overlay — all on the
> real reducer + a mockk `SocialSocketManager`). **Mutation (RED proof)**: removing `coerceAtLeast(0)` fails
> exactly `comment clamps a negative absolute count to zero` (1 of 70, no collateral). Restored.
>
> **Verified**: `:feature:feed:testDebugUnitTest` green (FeedRealtimeReducerTest 70/70, FeedViewModelTest
> 67/67); full `assembleDebug testDebugUnitTest` gate run for the PR. Reviewer PASS. Diff is `apps/android`
> only (4 files: FeedRealtimeHead.kt, FeedViewModel.kt + the two test files, plus tracking docs).
>
> **Next**: the Feed §F remaining apps/android-only boxes — the per-post **flag strip / request-missing-
> languages** on the feed Prisme line (needs an on-demand post-translation request path), or the Feed
> **repost/quote embed cell** polish (`[~]` line ~4357). Otherwise the Chat `slow`/retry glyph tier still
> waits on outbox retry-state plumbing. Re-scout read-only before committing — parity notes are hypotheses.

> On 2026-08-21 **Conversation lock "unlock-all" shipped** (slice `conversation-lock-unlock-all`,
> feature-parity's Conversations `[~]` "Pinned/muted/archived/locked" line — the `unlock-all` sub-gap of
> its "Remaining lock sub-gaps" note, now done; only Settings master-PIN change/remove + swipe-to-lock remain).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 10 open PRs at branch
> time (#3255/#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3251/#3250 iOS) are none
> android-routine. Branched off freshly-fetched `origin/main` (`7f1de533`).
>
> **SDK bootstrap (see NOTES 2026-08-21 latest):** used the ROUTINE-pinned `commandlinetools-linux-11076708`,
> which STILL mis-registers the 37.x preview package (`android-37.0/source.properties` → "Platform 17",
> `ApiLevel=37.0`). The `cp -r android-37.0 android-37` + sed on `source.properties` was NOT enough this run —
> AGP also rejected `android-37/package.xml`'s stale `path="platforms;android-37.0"` + `<api-level>37.0</api-level>`
> ("Failed to find target with hash string 'android-37'"). Full fix: patch BOTH `source.properties` AND
> `package.xml` (path→android-37, api-level→37) in the copy, and remove the malformed `android-37.0` dir so its
> unparseable `ApiLevel=37.0` cannot abort the platform scan. `assembleDebug testDebugUnitTest` green after.
> Container reached `dl.google.com` (curl → 200). Also: `./gradlew … | tail` swallows gradle's exit code — a
> failed build reads as exit 0; capture to a file and grep for `BUILD FAILED` instead.
>
> **The gap**: iOS `ConversationLockSheet.Mode.unlockAll` (Settings) verifies the 6-digit master PIN once, then
> calls `ConversationLockManager.removeAllLocks()` — dropping every per-conversation lock while leaving the
> master PIN set. Android's `LockPinReducer` had setup/lock/unlock/open arms but no unlock-all; the store's
> `ConversationLockStore.removeAllLocks()` already existed but was dead code (only `resetForLogout` used it).
>
> **Pure reducer arm (`:feature:conversations` `LockPinReducer`)**: new `LockPinMode.UNLOCK_ALL` (6-digit
> pinLength, `LockPinCopy.UNLOCK_ALL` header) + `LockPinEffect.RemoveAllLocks` + `completeUnlockAll` — a single
> step: `verifyMasterPin` → `[RemoveAllLocks, Completed]`, else `verifyFailure(MASTER_PIN_INCORRECT)` (buffer
> cleared, sheet stays open). Faithful to iOS: no new error type, master PIN untouched.
>
> **Wiring**: `ConversationListViewModel.onUnlockAll()` (inert unless `lockStore.lockedConversationIds` is
> non-empty — authoritative store read, not the mirrored state, so a stale tap can't open an empty sheet) opens
> the sheet in UNLOCK_ALL mode; `applyLockResult` maps `RemoveAllLocks → lockStore.removeAllLocks()`. New derived
> `ConversationListUiState.canUnlockAll = lockedConversationIds.isNotEmpty()`. `ConversationLockPinSheet` maps
> the new copy → title/subtitle strings + the LockOpen glyph. `ConversationListScreen` renders a top-bar
> `LockOpen` action shown ONLY while `canUnlockAll` (SOTA over iOS: contextual affordance, hidden when no locks;
> iOS buries it in Settings). EN/FR/ES/PT strings ×3.
>
> **Tests**: **+8** — `LockPinReducerTest` +4 (unlock-all is 6-digit; copy is UNLOCK_ALL; correct master →
> `[RemoveAllLocks, Completed]`; wrong master → `MASTER_PIN_INCORRECT`, no effects, buffer cleared),
> `ConversationLockFlowViewModelTest` +4 (`canUnlockAll` reactive to the lock set; correct master drops both
> locks + closes sheet + master PIN stays; wrong master keeps both locks; inert when nothing locked, on a real
> `InMemoryConversationLockStore`). **Mutation (RED proof)**: flipping `verifyMasterPin(state.pin)` → `true`
> fails exactly the wrong-PIN arms (2 failed of 29), restored via `git checkout`.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` (both suites) green; full `assembleDebug
> testDebugUnitTest` gate run for the PR. Reviewer PASS. Diff is `apps/android` only (10 files).
>
> **Next**: the sibling Settings master-PIN **change/remove** arms (scout #2 — `changeMasterPin`/`removeMasterPin`,
> store methods `setMasterPin`/`forceRemoveMasterPin` already present) is the natural follow-on, once an Android
> Settings "Security" surface exists to host them (none today — master-PIN setup is only reachable via the
> conversation context menu). Otherwise the Chat `slow`/retry glyph tier remains (heavier — needs the outbox
> retry-state surfaced through `LocalSendState`). Re-scout read-only before committing.

> On 2026-08-21 **Sub-200ms sending-clock debounce shipped** (slice `chat-send-clock-reveal-debounce`,
> feature-parity's Chat `[~]` "Delivery status" line — the `invisible pre-200ms debounce` half of its
> **Pending** 8-state clause, now shipped; only the finer `slow`/retry glyph tier remains).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 9 open PRs at branch
> time (#3255/#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3251/#3250 iOS) are none
> android-routine. Prior android iteration (#3254, chat-draft-language-persistence) already merged.
> Branched off freshly-fetched `origin/main` (`c138ffe4`, which includes #3254).
>
> **SDK bootstrap — the platform-metadata fight, finally understood (see NOTES 2026-08-21):** since the
> Android *minor* SDK releases (36.1, **37.0**, 37.1…) an API level is no longer published under a bare
> `android-37` name — only `android-37.0`. The prior recipe (`cp -r android-37.0 android-37` + sed
> `source.properties`) is now HARMFUL: the copy keeps `package.xml` (`path="platforms;android-37.0"`,
> `<api-level>37.0</api-level>`), so AGP sees a package claiming to be `android-37.0` living in the
> `android-37` dir → "Observed package id … in inconsistent location" → the whole SDK scan aborts →
> "Failed to find target with hash string 'android-37'". **The fix is to do NOTHING by hand**: install a
> pristine `platforms;android-37.0` via `sdkmanager --channel=3` and let **AGP auto-map `compileSdk 37` →
> `android-37.0`** itself (exactly what CI's setup-android does — `android.yml` even documents this). No
> `android-37` dir, no sed, no symlink, auto-download left ON. `assembleDebug testDebugUnitTest` green
> after. This container **reaches `dl.google.com`** (curl → 200), so the full local gate ran here.
>
> **The gap (re-proved by reading source)**: iOS's `BubbleDeliveryCheck.SendingClockGlyph` debounces the
> **online in-flight clock**: `shouldRevealImmediately(sendStartedAt, now)` keeps the clock hidden for the
> first `revealDelay = 0.2s` of a send, revealed via a self-cancelling `.task`, so a send that round-trips
> in under 200ms never flashes an icon the user has no time to perceive. Android showed the `Schedule`
> clock immediately for a `DeliveryStatus.Pending` bubble — no debounce. The offline hourglass
> (`QueuedOffline`) and settled tiers are NOT debounced on iOS, and stay immediate here.
>
> **Pure core (`:core:model` `SendLifecycleResolver`)**: new
> `shouldRevealSendingGlyph(sendStartedAtMillis: Long?, nowMillis: Long): Boolean` +
> `SENDING_REVEAL_DELAY_MILLIS = 200L` — faithful port: `null` start → `true` (reveal now, nothing to
> debounce); elapsed `>= 200ms` → `true` (iOS's `>=` inclusive boundary); under the window (incl. a
> negative elapsed from device clock skew) → `false`. `resolve()` untouched.
>
> **Wiring (Compose glue, coverage-exempt)**: new `SendingClockRevealPresenter.rememberSendingGlyphRevealed`
> (`produceState` initialised from the pure decision + one-shot `delay(remaining)` then flip to revealed —
> the SAME shape as `rememberBubbleRenderKind`'s tick loop). `MessageBubble` gates ONLY the
> `DeliveryStatus.Pending` clock behind it, reading the send-start from the existing
> `content.createdAtIso` (an optimistic pending bubble's `createdAt` IS its send-start — no new
> `BubbleContent` field, no builder/VM param, no wire change). Every other status renders immediately as
> before.
>
> **Tests**: **+8 `SendLifecycleResolverTest`** — no start → reveal; just-started/100ms/199ms hidden;
> exactly-200ms/5s revealed; future start (clock skew) hidden; the 200ms constant. Mirrors the iOS twin
> `BubbleDeliveryCheckSendingRevealTests` exactly, plus the 199ms exclusive-lower-edge + skew arms.
> **Mutation (RED proof)**: `>=`→`>` fails **exactly** `a send elapsed exactly 200ms reveals the clock`
> (15 run, 1 failed, no collateral). Restored. The `produceState`/`delay` presenter is thin Compose glue,
> exempt per TDD-COVERAGE.
>
> **Verified**: `:core:model:testDebugUnitTest` (SendLifecycleResolverTest) green; `:sdk-ui`
> `compileDebugKotlin` green; full `assembleDebug testDebugUnitTest` gate run for the PR. Reviewer PASS.
> Diff is `apps/android` only.
>
> **Next**: the last piece of the Delivery-status line is the finer `slow`/retry glyph tier (iOS
> `DeliveryStatus.slow` — a warning-tinted clock for a message still in automatic outbox retry after its
> first attempt failed but before the budget is exhausted). That needs the outbox retry-attempt count
> plumbed into the send state → `BubbleContent`, so it is a bigger slice than this one (not a pure
> resolver alone). Otherwise the Chat area's remaining apps/android-only boxes are thin; if the retry-state
> plumbing looks heavy, advance to **Feed (§F)** per build-order. Re-scout read-only before committing —
> parity notes are hypotheses.

> On 2026-08-21 **Manual composer-language draft persistence shipped** (slice `chat-draft-language-persistence`,
> the last open piece of feature-parity's Chat "Draft auto-save/restore" line — now `[x]`).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 8 open PRs at branch time
> (#3253/#3249/#3247/#3245/#3243/#3242 shared/web/gateway, #3251/#3250 iOS) are none android-routine. Prior
> android iteration (#3252, chat-draft-effects-persistence) already merged. Branched off freshly-fetched
> `origin/main` (`f2a2e404`, which includes #3252).
>
> **SDK bootstrap (see NOTES 2026-08-21 later):** the "newer cmdline-tools fix the platform metadata" claim
> did NOT hold this run — `platforms/android-37.0/source.properties` again came out malformed (`Platform 17`,
> `ApiLevel=37.0`), so AGP's `compileSdk 37`→`android-37` hash found no match. Fixed by a real `cp -r
> android-37.0 android-37` + `sed` on `source.properties` (ApiLevel→37). `assembleDebug testDebugUnitTest`
> green after across all modules. This container **reaches `dl.google.com`** (curl → 200) so the full local
> gate ran here.
>
> **The gap**: iOS's app-side `MessageDraft` persists `selectedLanguage` (the composer language pick)
> alongside text/reply/effects, restored in `ConversationView.onAppear` (`if let lang = draft.selectedLanguage
> { composerState.selectedLanguage = lang }`) and re-persisted on `.adaptiveOnChange(of: selectedLanguage)`.
> Android's `ConversationDraft` carried text+reply+effects but not the language — a deliberate language
> override armed but not sent was lost on navigation.
>
> **The key design call — a language is NOT content (faithful iOS port)**: iOS `MessageDraft.isEffectivelyEmpty`
> (persistence) and `hasDraftText` (list badge) BOTH ignore `selectedLanguage`. So on Android I left
> `ConversationDraft.isMeaningful` AND `isWorthPersisting` **unchanged** — a language-only composer neither
> floats/badges a conversation row nor is persisted on its own; the language rides along an otherwise
> worth-persisting draft (text/reply/effects present) and is dropped with it. This is the cleanest match to
> iOS and needed NO new predicate (unlike the effects slice, which added `isWorthPersisting`).
>
> **Manual override only**: Android's `ComposerLanguageState` splits `detected` (auto) from `manualOverride`
> (deliberate pick). Only `manualOverride` is persisted — live detection is redundant (re-derives from the
> restored text). Restore re-applies it via `withManualPick` (wins over detection of the restored text, locks
> analysis) — exactly iOS's override-wins semantics.
>
> **Pure core (`:core:model`)**: `ConversationDraft` gains `selectedLanguage: String? = null` (defaulted →
> legacy blob decodes to no language, back-compat covered by a decode test). `isMeaningful`/`isWorthPersisting`
> untouched.
>
> **Pure reducer (`:feature:chat`)**: `DraftAutosave.resolve` gains `selectedLanguage: String? = null`
> (normalised trim/blank→null; folded into the idempotence clause so a language change on a worth-persisting
> draft → `Save`, identical text+lang → `None`; the blank-guard is untouched so a language on an empty composer
> → `None`, never rescuing it). `DraftRestore` gains `selectedLanguage`; `restore` returns the normalised
> stored language.
>
> **Trivial VM wiring**: `ChatViewModel.persistDraft` reads `_state.value.composerLanguage.manualOverride`;
> `onComposerLanguagePicked` now calls `persistDraft` (iOS `.adaptiveOnChange` parity); the open-time restore
> applies `restored.selectedLanguage?.let { withManualPick(it) }`. Send/clear paths reset `composerLanguage =
> ComposerLanguageState()` before their existing `persistDraft("", null)` → manualOverride null → language
> cleared with the draft (no change needed there).
>
> **Tests**: **+17** — `ConversationDraftTest` +4 (a language pick alone is neither meaningful nor worth
> persisting; a pick riding a real draft leaves both predicates on the content; legacy blob missing
> `selectedLanguage` decodes to null), `DraftAutosaveTest` +10 (7 resolve: language on empty composer → None;
> language-only over no prior → None; text+lang saved; only-the-language-changing → Save; identical text+lang →
> None; trim/blank→null; clearing language while text remains → Save without lang — + 3 restore: returns / trims
> & drops / a text-only draft restores with no language), `ChatViewModelTest` +3 round-trip (picking a
> language persists it alongside the typed draft; a pick on an empty composer persists nothing; a stored
> text+language draft re-applies the manual override on open). **Mutation (RED proof)**: drop the resolve
> `previous.selectedLanguage == language` idempotence clause → **exactly** `only_the_language_pick_changing_on_a_text_draft_still_saves`
> fails while `identical_text_and_language_writes_nothing` stays green (proving the clause is the tested
> behaviour, not a tautology). Restored after.
>
> **Verified**: `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) — **BUILD SUCCESSFUL**
> across every module locally in this run; touched modules also ran explicitly green (`ConversationDraftTest`,
> `DraftAutosaveTest`, `ChatViewModelTest`). Reviewer PASS. Diff is `apps/android` only.
>
> **Next**: the Chat "Draft auto-save/restore" line is now fully `[x]`. Remaining Chat `[◐]`/`[~]` boxes:
> finer send-lifecycle `Slow` tier (needs outbox retry-attempt state plumbed into `BubbleContent`) and the
> edit-history viewer (blocked — needs a gateway endpoint, not apps/android-only). With Chat drafts closed,
> the next high-value area per build-order (`… → Chat → Feed → Stories → Calls`) is the top unchecked Chat
> box that stays apps/android-only, else advance to Feed. Re-scout read-only before committing — parity notes
> are hypotheses.

> On 2026-08-21 **Composer draft effects persistence shipped** (slice `chat-draft-effects-persistence`,
> feature-parity's Chat `[◐]` "Draft auto-save/restore" line — the `effects`/`blur`/`ephemeral` fields its
> **Pending** clause called out, now unblocked because the composer effects picker / ephemeral duration /
> blur / view-once all shipped in later §C slices, so there is finally state to persist).
>
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration — the 6 open PRs at branch
> time (#3249 shared, #3247 web, #3245/#3242 gateway, #3243 shared/gateway, #3241 iOS) are none of them
> android-routine. Prior android iteration (#3248, chat-bubble-a11y-label) already merged. Branched off the
> freshly-fetched `origin/main` (`3e64afaa`, which includes #3248 and #3241). This container **reaches
> `dl.google.com`** (curl → 200), so the full local gate ran here.
>
> **SDK-bootstrap correction (see NOTES 2026-08-21):** the older recipe's `android-37 → android-37.0`
> symlink is now HARMFUL. With cmdline-tools `11076708` the platform mis-registers (metadata "Platform 17"),
> and the symlink makes sdkmanager reject it as an "inconsistent location" → `Failed to find target with hash
> string 'android-37'`. Fix: fetch the newer bundle `commandlinetools-linux-13114758`, `sdkmanager
> --channel=3 "platforms;android-37.0" "build-tools;36.0.0"`, and **no symlink** — AGP 8.13 resolves
> `compileSdk 37` → the `android-37.0` dir directly. `assembleDebug testDebugUnitTest` green after.
>
> **The gap (re-proved by a read-only recon subagent over iOS + Android)**: iOS's app-side `DraftStore`
> (`MessageDraft`) persists the FULL compose state — text, reply, **and** `effectFlags`/`isBlurEnabled`/
> `ephemeralDurationRawValue` (+ `selectedLanguage`). Android's `ConversationDraft` persisted only
> text + `replyToId`; a self-destruct duration or a confetti effect armed on the composer was lost on
> navigation. The recon confirmed via grep that `pendingEffects: MessageEffects` already exists on
> `ChatUiState` (line 160) but was never fed into `DraftAutosave.resolve` nor restored on open — a genuine,
> now-portable gap needing **no** gateway endpoint, **no** wire-DTO change (`ConversationDraft` is a local
> DataStore value type), and **no** timer/instrumentation.
>
> **Faithful two-predicate port (the key design call)**: iOS splits "worth persisting" (`isEffectivelyEmpty`,
> weighs effects/blur/ephemeral) from the conversation-list "Brouillon" badge (`hasDraftText`, text-only).
> Android's shared `ConversationDraft.isMeaningful` already drives FOUR conversation-list surfaces
> (`DraftAwareOrdering` float, `LastMessagePreview` "Brouillon …" line, `DraftDiscard`, `ConversationListScreen`
> `hasDraft` badge). Extending `isMeaningful` to include effects would make an effects-only draft float and
> badge the list — a divergence from iOS. So I added a SEPARATE `ConversationDraft.isWorthPersisting`
> (`isMeaningful || effects.hasAnyEffect`) used ONLY by `DraftAutosave`, leaving all four list surfaces
> byte-for-byte unchanged. An effects-only draft now persists and restores but never floats/badges a row —
> exactly iOS.
>
> **Pure core (`:core:model`)**: `ConversationDraft` gains `effects: MessageEffects = MessageEffects()`
> (defaulted so a legacy blob decodes to an empty selection — back-compat covered by a decode test) folding
> iOS's three separate fields into the single `MessageEffects` SSOT (a set flag bit = armed). New
> `isWorthPersisting` extension. `isMeaningful` unchanged.
>
> **Pure reducer (`:feature:chat`)**: `DraftAutosave.resolve` gains an `effects: MessageEffects = MessageEffects()`
> param — empty composer + armed effect → `Save`; a change in effects alone → `Save`; identical
> text+reply+effects → `None`; clearing the last effect on an empty composer → `Clear` (via
> `isWorthPersisting`). `DraftRestore` gains `effects`; `restore` returns `stored.effects` and gates on
> `isWorthPersisting` (an effects-only stored draft re-arms an idle empty composer).
>
> **Trivial VM wiring**: `ChatViewModel.persistDraft` reads `_state.value.pendingEffects` (every existing
> caller already updates state before calling, so no new params on the 6 call sites); `toggleEffect` /
> `selectEphemeralDuration` / `clearEffects` now call `persistDraft` so an armed/cleared effect is saved
> immediately; the open-time restore applies `pendingEffects = restored.effects` and tracks
> `lastPersistedDraft` via `isWorthPersisting`. Post-send path unchanged (state cleared before the existing
> `persistDraft("", null)` → reads empty effects → `Clear`). **Documented edge (iOS-parity):** `restore`
> guards on text/editing only, not on already-armed composer effects — the load runs in `init` before the
> user can interact, and iOS's `onAppear` restore has the same shape.
>
> **Tests**: **+19** — `ConversationDraftTest` +7 (effects never make a draft list-meaningful;
> `isWorthPersisting` weighs effects / stays false when empty / true for text|reply; legacy blob missing
> `effects` decodes to `MessageEffects()`), `DraftAutosaveTest` +8 (armed effects on empty composer → Save;
> saved draft carries effects; clearing effects → Clear; effects-alone change → Save; identical
> text+reply+effects → None; blank+no-effects+no-prior → None; restore re-arms effects-only + effects
> alongside text/reply), `ChatViewModelTest` +4 round-trip (arming persists to the store; clearing the last
> effect purges; effects-only stored draft re-arms `pendingEffects` on open). **Mutation (RED proof) ×3**:
> (a) drop `isWorthPersisting`'s `|| effects.hasAnyEffect` → **exactly 1** `ConversationDraftTest` fails
> (the list `isMeaningful` tests stay green, proving no leak); (b) drop `resolve`'s `previous.effects ==
> effects` idempotence clause → **exactly 1** `DraftAutosaveTest` fails; (c) drop the empty-guard
> `!effects.hasAnyEffect` → **exactly 1** `DraftAutosaveTest` fails. All restored.
>
> **Verified**: `assembleDebug testDebugUnitTest` (= `./apps/android/meeshy.sh check`) — **BUILD SUCCESSFUL**
> across every module locally in this run; touched modules also ran explicitly green (`ConversationDraftTest`,
> `DraftAutosaveTest` 31, `ChatViewModelTest`). Reviewer PASS. Diff is `apps/android` only.
>
> **Next**: the narrower follow-up `chat-draft-language-persistence` — persist the manual composer language
> pick (`MessageDraft.selectedLanguage` / `ComposerLanguageState.withManualPick`) on `ConversationDraft`,
> restoring the language pill's override. Per iOS a language-only draft is NOT meaningful (so it re-applies
> only atop an otherwise worth-persisting draft) — a clean pure sub-rule + trivial VM wiring, same shape as
> this slice. After that, the Chat `[◐]`/`[~]` boxes still open (finer send-lifecycle `Slow` tier — needs
> outbox retry-attempt state plumbed into `BubbleContent`; edit-history viewer — blocked on a gateway
> endpoint, not apps/android-only). Re-scout read-only before committing; parity notes are hypotheses.

> On 2026-08-21 **Message-bubble accessibility composer shipped** (slice `chat-bubble-a11y-label`).
> **Step 0**: no open `claude/apps/android/*` slice PR from a prior iteration (the 5 open PRs were
> web #3247 / gateway #3242 #3245 / shared #3243 / iOS #3241 — none android-routine). Prior iteration
> #3246 (mood) already merged. Branched off the freshly-fetched `origin/main` (`d3686997`, which
> includes the prior Android mood/story-ring merges). This container **reaches `dl.google.com`** (curl
> → 200), so the full local gate ran here; SDK bootstrapped `platforms;android-37.0` via cmdline-tools
> `11076708` `--channel=3` + the `android-37` alias, Gradle 8.13 by the wrapper.
>
> **First closed a stale marker**: the conversation-row `presence` sub-gap. Grep-verified the dot is
> already wired — `ConversationListScreen.kt:232` passes `presence = state.presenceStateFor(conversation,
> System.currentTimeMillis())` down to the row's `MeeshyAvatar(..., presence = …)` (`:649`), alongside
> `storyRing` and `moodEmoji`. All three avatar affordances coexist (a mood badge suppresses the dot),
> exactly as iOS. The conversation-row "rich last-message preview" line is now **complete** — no new
> slice was needed for presence; feature-parity updated to `presence done`.
>
> **The gap (re-proved by reading source)**: iOS composes ONE spoken VoiceOver label per message bubble
> (`MessageAccessibilityLabelComposer.compose`, itself the port of `BubbleStandardLayout.messageAccessibilityLabel`)
> in a frozen order. Android's `MessageBubble` had no composed label — it relied on default child-merge
> with only per-icon `contentDescription`s (delivery glyphs, starred, translated). A repo-wide grep for
> a bubble a11y composer hit only docs/contacts/auth — never chat. So the composed message label was a
> real, categorical gap.
>
> **Pure core (`:sdk-ui`)**: `MessageBubbleAccessibilityLabel.compose(content, strings, locale, timeText?)`
> — framework-free object over `BubbleContent`, emitting the joined label in the iOS-frozen order
> (sender → reply → text → images → audios → location/files → time → delivery → edited → pinned →
> ephemeral → reactions). Localized wording injected via `BubbleAccessibilityStrings` /
> `BubbleDeliveryA11yStrings` (the `RelativeTimeFormat` injection pattern — zero Android deps, fully
> JVM-testable). A deleted message short-circuits to sender + "deleted". **Assumed deviations vs iOS,
> documented**: no image/video split (one "images" count — Android `BubbleContent` carries no video
> distinction); no "you" reply-author phrasing (Android reply target has no `isMe`); no clock in the
> Android bubble meta-row, so `timeText` is only supplied where a time is actually shown (null here).
>
> **Safe, NON-destructive wiring**: `MessageBubble` gains an opt-in `accessibilityLabel: String? = null`
> applied via `clearAndSetSemantics` — wired ONLY at `MessageOverlayPreviewHero` (the long-press overlay
> hero, documented "Purely decorative and non-interactive — never intercepts input"), where collapsing
> the semantics subtree is provably safe. The interactive **list** bubble keeps the default `null`, so
> its per-element touch targets (reaction taps, image taps, long-press) are untouched — I deliberately
> did NOT merge/clear semantics on the interactive bubble, since collapsing its touch targets would
> regress TalkBack and cannot be verified without an on-device/instrumented run (routine §CI-reality
> caution). Wiring the composed label onto the list bubble is left as a future instrumented-test slice.
> Strings added EN/FR/ES/PT.
>
> **Tests**: **+20 `MessageBubbleAccessibilityLabelTest`** (pure composer — every arm: received sender /
> unknown / blank-name; outgoing never names sender; blank text skipped; reply excerpt / blank-excerpt →
> author-only / unknown author / deleted-target author-only; images+audios counts; location-then-file
> order; unnamed file; time appended / blank-time dropped; delivery after time; all 6 delivery arms;
> edited+pinned+ephemeral order; reactions summary last; deleted short-circuit; bare outgoing).
> **Mutation (RED proof) ×2**: (a) neutering the deleted short-circuit `return` fails **exactly** 1 test
> (20 run, 1 failed); (b) collapsing the reply-excerpt arm to author-only fails **exactly** 2 tests
> (the two excerpt cases). Both restored.
>
> **Verified**: `./apps/android/meeshy.sh check` — `BUILD SUCCESSFUL` (assembleDebug + every module's
> `testDebugUnitTest`) green locally in this run. Reviewer PASS.
>
> **Next**: the natural follow-up is a Roborazzi/instrumented slice to wire and verify the composed
> `accessibilityLabel` on the interactive list bubble WITHOUT regressing per-element touch targets
> (custom accessibility actions for reactions/images under one merged node) — needs the instrumented
> test harness, out of the JVM gate. Otherwise advance to the next Chat `[◐]`/`[~]` box: candidates are
> the finer 8-state send-lifecycle glyphs (slow/invisible pre-200ms debounce; needs send-lifecycle
> timing state) or the edit-history viewer (blocked on a gateway edit-history endpoint — not
> apps/android-only). Prefer a pure-resolver + trivial-value-wiring slice as always; re-scout with a
> read-only recon over iOS + Android before committing, since parity notes are hypotheses not facts.

> On 2026-08-20 **Conversation-row mood badge shipped** (slice `conversation-row-mood`,
> feature-parity's Conversations `[~]` rich last-message-preview line — the `mood` avatar
> affordance, the second of the three sub-gaps `presence/story-ring/mood`; story-ring merged
> #3244 this same day, presence is the last one left). **Step 0**: the open Android PR of the
> PRIOR iteration (#3244, story-ring) was green (Android CI success) and `mergeable_state:clean`
> — squash-merged it to `main` (→ `949bb521`) as the literal first action before branching, per
> the routine's step-0 gate. The other four open PRs at this instant (#3241 iOS, #3242/#3243/#3245
> gateway/shared) are NOT android-routine slices — left untouched. Branched off the freshly-merged
> `origin/main` (`949bb521`). This container **reaches `dl.google.com`** (curl → 200), so the full
> local gate ran here; SDK bootstrapped `platforms;android-37.0` via cmdline-tools `11076708`
> `--channel=3`, aliased `android-37 → android-37.0`; Gradle 8.13 auto-fetched by the wrapper.
>
> **The gap (re-proved by a read-only recon subagent over iOS + gateway + Android)**: "mood" is
> NOT a field on `User` or on conversation participants anywhere in the stack — it is a `moodEmoji`
> string carried on an ephemeral STATUS-type Post, resolved **per-user at render time** via a
> `statusForUser(userId)` lookup against the shared status feed. iOS
> `ConversationListView.conversationMoodStatus(for:)` (`ConversationListView.swift:695`) gates on
> `type == .direct`, resolves the other participant's `userId`, and passes
> `statusViewModel.statusForUser(userId)?.moodEmoji` into `MeeshyAvatar(moodEmoji:)`, which paints
> an emoji badge at the avatar's bottom-trailing corner, replacing the presence dot. Android's
> `MeeshyAvatar` already accepted `moodEmoji: String?` and rendered exactly that (bottom-end
> `Text`, presence dot suppressed when a mood is present) — but no conversation-row caller ever
> supplied it. **No wire/DTO widening** was warranted (would diverge from iOS/gateway, where mood
> never rides the participant payload): every supporting piece — `StatusEntry`, `statusForUser`,
> `ApiPost.moodEmoji`, `StatusBarCache`, the 1h expiry law — was already ported. Contacts
> (`ContactsListViewModel.moodEmojiFor`) is the established precedent this slice mirrors verbatim.
>
> **Pure core (`:feature:conversations`)**: `ConversationMoodStatus.moodEmojiFor(conversation,
> currentUserId, statuses): String?` — direct-only + peer gate via the `otherParticipantUserId`
> SSOT (`null` → no badge, so a group/community/channel/bot row is never decorated), then
> `statuses.statusForUser(peerId)?.moodEmoji?.takeIf { it.isNotBlank() }` (the exact Contacts
> lookup — a blank emoji never surfaces, and because the lookup is keyed by the PEER a self-only
> status is never shown as the peer's badge).
>
> **State plumbing**: `ConversationListUiState.moodStatuses: List<StatusEntry>` new defaulted-empty
> field + `moodEmojiFor(conversation)` state helper delegating to the pure resolver with the state's
> `currentUserId`. `ConversationListViewModel` gains a `StatusBarCache` dep and calls a synchronous
> `paintMoodStatusesFromCache()` at the end of `init` — reads whatever the shared FRIENDS statuses
> bar already holds (`valueOrNull` collapses Fresh/Stale/Syncing; cold `Empty` → no badges), no fetch
> of its own. Decorative affordance, never primary content — mirrors
> `ContactsListViewModel.paintMoodStatusesFromCache` VERBATIM so mood resolution is identical across
> every surface (single source of truth).
>
> **Wiring (Compose glue, coverage-exempt)**: `moodEmoji = state.moodEmojiFor(conversation)` threaded
> through the row call site → `ConversationRow` → `ConversationRowContent` → the existing
> `MeeshyAvatar(..., moodEmoji = …)` param.
>
> **Tests**: **+8 `ConversationMoodStatusTest`** (pure resolver — group never badged; direct with no
> peer → null; peer with no live status → null; non-blank emoji surfaces; blank emoji → null; peer
> picked among several; currentUserId decides which side is the peer; self-only status never surfaced
> as the peer badge) — every branch of `moodEmojiFor` exercised. **+3 `ConversationListMoodStateTest`**
> (state helper delegates with `moodStatuses`+`currentUserId`; empty set → null; identity swap
> resolves the peer from the right side). **+3 `ConversationListViewModelTest`** (the FRIENDS bar
> paints the peer's emoji onto its direct row through `init`; a DISCOVER-only status never decorates a
> row; a cold cache leaves every row without a badge) — proving the `paintMoodStatusesFromCache`
> init glue end-to-end. Two existing VM suites get a `StatusBarCache` (a seeded real cache in
> `ConversationListViewModelTest` via a `FixedClock` helper mirroring Contacts; a relaxed mock
> returning `CacheResult.Empty` in `ConversationLockFlowViewModelTest`).
>
> **RED-proof (mutation × 2)**: (a) dropping `takeIf { it.isNotBlank() }` fails **exactly** 1 test
> (`a peer status with a blank mood emoji yields no badge` — 8 run, 1 failed, no collateral). (b)
> keying the lookup by `currentUserId` instead of `peerId` fails **exactly** 4 tests (the peer-surfaces
> + picked-among-several + currentUserId-decides + self-never-surfaced arms — 8 run, 4 failed). Both
> restored after.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` across all modules green locally. New suites
> ran: `ConversationMoodStatusTest` 8/8, `ConversationListMoodStateTest` 3/3, `ConversationListViewModelTest`
> 73/73 (was 70). Reviewer PASS.
>
> **Next**: `presence` is the last of the three conversation-row avatar sub-gaps. `presenceStateFor`
> already exists on the state AND is already passed into `MeeshyAvatar(presence = …)` at the row call
> site (grep-verified: `ConversationListScreen.kt` passes `presence = state.presenceStateFor(...)`),
> so the dot is ALREADY wired — the `presence` marker on feature-parity:1633 is now stale. Grep-verify
> it renders (a mood badge now suppresses the dot when both are present, matching iOS) and, if truly
> done, close the line with no new slice; otherwise the only remaining gap there is a live presence
> SOURCE for conversation rows (`ApiConversation.participants` carries no `isOnline`/`lastActiveAt`, so
> the dot only lights from live `user:status`/`presence:snapshot` socket frames — a genuinely cold
> row shows none). After the row line closes, advance to the next Conversations `[◐]`/`[ ]` box or the
> next build-order area (Chat).

> On 2026-08-20 **Conversation-row story-ring shipped** (slice `conversation-row-story-ring`,
> feature-parity's Conversations `[~]` rich last-message-preview line — the `story-ring` avatar
> affordance that same line called out as pending). **Step 0**: two open
> `claude/apps/android/*` slice PRs were merged into `main` first — #3238
> (`conversation-row-message-summary-kind`, merged clean) and #3239
> (`chat-composer-attachment-ladder`, closed as redundant after its head landed via a
> resolved-conflict merge commit; both sides of the tracking-file conflicts were kept — my slice's
> paragraph plus the message-summary-kind paragraph, per NOTES-lesson on prepend/newest-first).
> Branched off `origin/main` (`13bedd98`) as the literal first action. This container **reaches
> `dl.google.com`** (curl → 200), so the full local gate ran here; SDK bootstrapped
> `platforms;android-37.0` via cmdline-tools `11076708` on `--channel=3` + the `android-37` symlink
> alias, Gradle 8.13 via the wrapper.
>
> **The gap, re-proved by reading source (scout + independent verify)**: iOS renders a per-row story
> ring on the direct-conversation avatar (`ConversationListView+Rows.swift:275,296` pipe `storyRingState`
> into the row's `AvatarContext`), sourced from `StoryViewModel.storyRingState(forUserId:)`
> (`apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:1351`) via
> `ConversationListView.storyRingState(for:)` (`apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:690`).
> Android's `ConversationListScreen.kt:637` called `MeeshyAvatar(name, containerColor, presence)`
> WITHOUT a `storyRing` argument — the `MeeshyAvatar` parameter existed
> (`sdk-ui/.../MeeshyAvatar.kt:67`) and its `Unread`/`Read`/`None` rendering was already unit-covered,
> but no caller ever fed it a non-`None` value for a conversation row: the ring was cold at every
> row, no matter what the peer had posted. A `StoryRepository.storiesStream()` cache-first flow was
> already in the SDK (`apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/story/StoryRepository.kt`)
> and consumed by `StoriesViewModel`, so the missing plumbing was the *lookup*, not the source.
>
> **Pure core (`:feature:conversations`)**: `ConversationStoryRing.ringFor(userId, groups, nowMillis)`
> — framework-free, 3 first-match arms mirroring iOS EXACTLY: (1) `userId == null` OR no matching
> group OR `StoryGroup.isFullyExpired(now)` → `StoryRingState.None`; (2) `StoryGroup.hasUnviewed()`
> → `Unread`; (3) otherwise (all viewed, still active) → `Read`. Row overload
> `ringFor(conversation, currentUserId, groups, now)` applies the iOS direct-only gate by delegating
> peer-id resolution to the existing `ApiConversation.otherParticipantUserId` SSOT — a group /
> community / channel / bot conversation never carries a ring. Every constant (isFullyExpired
> semantics, hasUnviewed) reuses `me.meeshy.sdk.story.*` — no local re-implementation.
>
> **State plumbing (`:feature:conversations`)**: `ConversationListUiState.storyGroups: List<StoryGroup>`
> new defaulted-empty field; `ConversationListViewModel.observeStoryGroups()` new observer collects
> `storyRepository.storiesStream()` (cache-first `Fresh/Stale/Syncing` yield their value, `Empty`
> yields nothing so the ring rests at the previous groups) and reduces via `toStoryGroups(currentUserId
> = state.value.currentUserId)`. A sync-error is swallowed so a transient network hiccup never wipes
> the rings — parity iOS `StoryViewModel.storyGroups` (a `@Published` that only writes on success).
> `ConversationListUiState.storyRingFor(conversation, now)` delegates to the pure resolver.
>
> **Wiring (Compose glue, coverage-exempt)**: the row callsite (`ConversationListScreen.kt:231`)
> gains `storyRing = state.storyRingFor(conversation, System.currentTimeMillis())`, threaded through
> `ConversationRow` → `ConversationRowContent` → the existing `MeeshyAvatar(..., storyRing = …)`
> parameter. Zero avatar-render churn — the ring painting already existed, only the value was cold.
>
> **Tests**: **+12 `ConversationStoryRingTest`** — per-user rule (null userId → None; missing group
> → None; empty groups → None; fully-expired group with an unviewed story → None *rule 1 outranks
> rule 3*; active + unviewed → Unread; active + all-viewed → Read; mixed one-expired-viewed +
> one-active-viewed → Read *not-fully-expired arm*; multiple groups → the matching one is picked) +
> row rule (direct with peer's Unread group → Unread; group-type conversation → None; direct with no
> other participant → None; direct with peer having no active story → None). **+3
> `ConversationListStoryRingStateTest`** — state helper resolves the peer's ring; empty state yields
> None; state passes its own `currentUserId` so the peer is resolved from the right side (identity
> swap makes "peer" the OTHER, only "me" has a story, yields Read). Every branch of both `ringFor`
> overloads and every arm of the peer-side resolution covered. Compose glue (the row's
> `MeeshyAvatar` param thread) is thin wiring, exempt per TDD-COVERAGE.
>
> **RED-proof (mutation)**: swapping `if (group.hasUnviewed())` for `if (false)` in the pure
> resolver fails **exactly** 3 tests (the two Unread arms — per-user and row — plus the state helper
> "peer's unread ring") — 15 run, 3 failed, no collateral — restored after.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` across all modules green locally
> (973 actionable tasks — `BUILD SUCCESSFUL`). Two existing `:feature:conversations` VM tests
> (`ConversationListViewModelTest`, `ConversationLockFlowViewModelTest`) fed a new mocked
> `StoryRepository` whose `storiesStream(any(), any())` returns `emptyFlow()` — a minimal, honest
> injection: the observer subscribes, the flow completes, no story groups arrive, state stays at
> `storyGroups = emptyList()`, every existing behaviour proof runs unchanged. Reviewer PASS.
>
> **Next**: two Conversations row-preview sub-gaps remain at `feature-parity.md:1594` — `presence`
> (a grep on `ConversationListScreen.kt:231` proves the dot is already wired via
> `state.presenceStateFor(...)` piped into `MeeshyAvatar(presence = …)`, so the note is stale — do
> not spend a slice on it, mark it verified-done in feature-parity) and `mood` (needs a Kotlin
> mirror of iOS `StatusEntry`/`statusForUser(userId:)` on `:core:model` + a `StatusRepository`
> analogue to `StoryRepository` before the same delegation shape can apply). Or advance the Chat
> line: the `[◐] Universal composer` still has sub-gaps beyond the just-shipped attachment-ladder
> (per feature-parity umbrella), the finer send-lifecycle glyph, or the composer's photo-specific
> `PickVisualMedia` launcher noted as candidate in the attachment-ladder slice's Next.

> On 2026-08-20 **Conversation-row message-summary-kind shipped** (slice
> `conversation-row-message-summary-kind`, feature-parity's Conversations "rich last-message
> preview" `[~]` — the `ephemeral / expired / hidden / view-once` sub-gap that same line listed
> as pending alongside the just-shipped `activity-heat`, `tags`, `typing`). **Step 0**: no open
> `claude/apps/android/*` PR to merge first — the six open PRs at this instant are the
> `claude/intelligent-noether-kana7q` iOS-only forward-picker fix (#3236) and five Dependabot
> (`actions/cache`, `framer-motion`, root build-tools group, `setup-android` — the CI-infra
> Android bump, not an android-routine slice — and `gradle/actions`). None on an
> android-routine slice branch. Branched off `origin/main` (`65af14d5`) as the literal first
> action. This container **reaches `dl.google.com`** (curl → 200 slowly), so the full local
> gate ran here.
>
> **A first stale trip found by reading source, not the note**: `PROGRESS.md`'s "Next" line —
> written before the activity-heat slice merged — recommended pursuing the *message-body kinds*
> (ephemeral/expired/hidden/view-once) but warned that "the honest first move there is to
> widen the wire DTO" because "the current `ApiConversationLastMessage` doesn't carry
> `expiresAt`, `deletedAt`, `viewOnce`". Grep across `services/gateway/src/routes/conversations/
> core.ts:971-1010` proved this half-true: the gateway ALREADY spreads the full `msg` object
> onto `lastMessage` via `...msgRest` after stripping only `translations` and `originalLanguage`,
> so `isBlurred`, `isViewOnce`, `expiresAt` all reach the wire today — the Kotlin DTO simply
> doesn't declare them. The widening is 3 defaulted fields, not a wire contract change.
> Lesson: verify the wire before designing a widening slice — a hint that a field "isn't on
> the wire" may just mean the client can't see it.
>
> **The gap, re-proved by reading source**: iOS `MeeshyConversation.lastMessageSummaryKind()`
> (`packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`) classifies the
> preview into 5 kinds and `ThemedConversationRow.lastMessagePreviewView`
> (`apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift:540-610`) renders each
> with a kind-specific icon + italic tint: `expired` → `timer.badge.xmark` textMuted italic,
> `hidden` → `eye.slash` sender-prefixed textSecondary italic, `viewOnce` → `flame` accent
> italic, `ephemeralActive` → standard content + timer badge, `standard` → plain body. Android
> rendered every message with the same non-italic secondary text — expired ephemeral,
> moderated hidden, and view-once messages all indistinguishable from a plain "Salut !".
>
> **Pure core (`:feature:conversations`)**: `MessageSummaryKind` — framework-free enum
> `{ STANDARD, HIDDEN, VIEW_ONCE, EPHEMERAL_ACTIVE, EXPIRED }` + companion `of(message,
> nowMillis) : MessageSummaryKind` that mirrors iOS's priority order EXACTLY: (1) `expiresAt <=
> now` → EXPIRED (inclusive boundary — iOS's `<=` guard, one less way a row flashes old
> content); (2) `isBlurred` → HIDDEN (moderation outranks a live ephemeral so blurred content
> can never leak); (3) `isViewOnce` → VIEW_ONCE; (4) future `expiresAt` → EPHEMERAL_ACTIVE;
> (5) otherwise → STANDARD. Also `SummaryLine(text, kind)` (row's composed preview line) +
> `messageSummaryLine(message, currentUserId, showSender, labels, nowMillis)` that composes
> the kind-appropriate label with the same sender-prefix rule as `lastMessagePreview` for
> HIDDEN/VIEW_ONCE; EXPIRED drops the sender (parity iOS `.expired` arm which renders the
> label alone).
>
> **Sibling SSOT** (`:core:model`): `ApiConversationLastMessage` widened with three defaulted
> fields — `isBlurred: Boolean = false`, `isViewOnce: Boolean = false`, `expiresAt: String? =
> null`. Purely additive wire widening: the gateway already spreads these onto the payload,
> so an older backend/no-flags message keeps decoding to the same defaults it did before.
> Kdoc references the gateway serializer path + iOS SSOT.
>
> **Wiring (Compose glue, coverage-exempt)**: `RowPreview` gains a defaulted `kind:
> MessageSummaryKind = STANDARD`, `conversationRowPreview` gets a second overload that takes
> `SummaryLine` and preserves its kind (typing/draft still supersede and stay STANDARD — their
> styling is the accent flag, not the kind). New private composable
> `ConversationRowPreviewLine(preview, primaryAccent)` picks (icon, tint, italic) per kind
> from a small `RowPreviewKindStyle` data class — HourglassEmpty/textMuted/italic for EXPIRED,
> VisibilityOff/textSecondary/italic for HIDDEN, LocalFireDepartment/accent/italic for
> VIEW_ONCE, Timer/standardColor for EPHEMERAL_ACTIVE, no-icon standard otherwise. Icons at
> 14dp with `MeeshySpacing.xs` gap — same footprint as the pinned/muted/locked title icons.
> Row's `lastMessage` call site swaps `lastMessagePreview` → `messageSummaryLine` with a
> `System.currentTimeMillis()` clock.
>
> **Localization**: 7 new strings per locale × 4 locales (en/fr/es/pt) — 3 body labels
> (`_expired`/`_hidden`/`_view_once`, ported from iOS `Localizable.xcstrings` at
> `message.expired`, `conversation.summary.hidden`, `conversation.summary.view_once`) + 4
> accessibility content descriptions (ephemeral/expired/hidden/view-once). A partial locale
> that ships without them transparently falls through to the standard body path via the
> defaulted `LastMessagePreviewLabels(expired="", hidden="", viewOnce="")` — a blank label
> must never leave the row visually empty.
>
> **Tests**: +14 `MessageSummaryKindTest` — null-message → STANDARD; plain-text → STANDARD;
> future expiresAt → EPHEMERAL; strictly-past expiresAt → EXPIRED; equal-to-now expiresAt →
> EXPIRED (inclusive boundary); blurred → HIDDEN; view-once → VIEW_ONCE; expired outranks
> blurred; expired outranks view-once; blurred outranks view-once; blurred outranks live
> ephemeral; view-once outranks live ephemeral; malformed/blank expiresAt does NOT classify
> as ephemeral; defaults on the DTO are non-ephemeral non-blurred non-view-once. **+12
> `MessageSummaryLineTest`** — standard body direct / group sender prefix; null message →
> "Aucun message"; expired label drops sender; hidden label sender-prefixed in group and
> label-alone in direct; view-once sender-prefixed and "Vous" for me; ephemeral-active
> reuses standard body direct + group; inclusive expired boundary at now; blank
> expired/hidden labels fall through to standard body (partial-locale safety). **+5
> `ConversationRowPreviewKindTest`** — summary kind propagates on the last-message path,
> typing supersedes summary (kind→STANDARD), draft supersedes summary (kind→STANDARD),
> standard summary in secondary colour, ephemeral summary preserves its kind for styling.
> Every branch of `of()`, `messageSummaryLine`, and the kind-aware overload of
> `conversationRowPreview` exercised. Compose glue in `ConversationRowPreviewLine` is thin
> visual mapping, exempt per TDD-COVERAGE.
>
> **RED-proof (mutation × 2)**: (a) swapping `expiresAt <= nowMillis` for `expiresAt <
> nowMillis` fails **exactly** 2 tests (the two inclusive-boundary tests — 28 run, 2 failed,
> no collateral). (b) reversing HIDDEN/VIEW_ONCE below EPHEMERAL_ACTIVE fails **exactly** 2
> tests (`blurred outranks a live ephemeral`, `view-once outranks a live ephemeral` — 28 run,
> 2 failed, no collateral). Restored after each.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` across all modules green locally
> (973 actionable tasks). SDK bootstrapped as `platforms;android-37.0` via cmdline-tools
> `11076708`, aliased `android-37 → android-37.0`; Gradle 8.13 fetched auto by the wrapper.
> Reviewer PASS.
>
> **Next**: the last two Conversations row-preview sub-gaps at `feature-parity.md:1594` are
> avatar affordances — `presence` (already wired via `state.presenceStateFor`, so the note is
> stale — grep-verify before spending a slice on it), `story-ring` (clean single slice:
> `MeeshyAvatar` already accepts `storyRing: StoryRingState` and `StoryTray` exposes per-user
> unread-story state; the missing wire is a lookup key exposed on the row's state), and
> `mood` (needs new SDK model — the wire field lives on User in iOS but no Kotlin type mirror
> yet). Pick story-ring next: it's the shortest path from the pieces already in place.

> On 2026-08-20 **Composer attachment-ladder tray shipped** (slice `chat-composer-attachment-ladder`,
> feature-parity's Chat `[◐] Attachment ladder` sub-gap "an emoji-ladder tray grouping the entries";
> also feeds the umbrella `[ ] Universal composer`). **Step 0**: no open `claude/apps/android/*` slice PR
> to merge first — the open-PR sweep (listed WITHOUT a head filter, per the typing-slice NOTES lesson) held
> only an iOS session (#3236) and five Dependabot; none on an android-routine branch. Branched off
> `origin/main` (`65af14d5`). This container **reaches `dl.google.com`** (200), so the full local gate ran
> here; SDK bootstrapped `platforms;android-37.0` via cmdline-tools `13114758` `--channel=3` + the
> `android-37` symlink alias, Gradle 8.13 curl-fetched (wrapper still 403s through the proxy — same env quirk
> as the last three slices).
>
> **The gap, re-proved by reading source (scout + independent verify)**: iOS's composer opens a "+" carousel
> (`UniversalComposerBar+Attachments.carouselTiles`) offering Photo/Camera/File/Location/Voice/Emoji as
> distinct discs; Android's composer had a **single** `AttachFile` `IconButton` firing `filePicker.launch("*/*")`
> directly (`ChatScreen.kt:2812`) — no grouped tray, no photo/camera/location/voice/emoji distinction. Two
> other composer buttons (`Mic`, effects) sat beside it. The remaining conversation-row gaps
> (ephemeral/view-once/story-ring/mood) were confirmed **backend-wire-blocked** (the gateway conversation
> preview payload excludes deleted/ephemeral/view-once and carries no per-user story state — `emitConversationPreviewUpdate.ts`
> selects `where { deletedAt: null }` and never hoists those flags), so the honest move was this composer
> (outbound-only) slice, not another row micro-tint that would need a new server field.
>
> **Pure core (`:feature:chat`)**: `ComposerAttachmentLadder.tiles(affordances, hasRecentMediaStrip=false,
> showCamera=true, showLocation=true, showVoice=true, showEmoji=true) → List<AttachmentTile>`. Two gate
> families mirror iOS: **permission** off `ComposerAffordances` (Photo+Camera ride `canSendImages ||
> canSendVideos`; File→`canSendFiles`; Location→`canSendLocations`; Voice→`canSendAudios`; Emoji→`canSendText`)
> and **host-capability** off the `show*` flags (iOS gates on `on* != nil`). Photo suppressed under a
> recent-media strip (iOS `onRecentMediaSelected == nil`; Android has no strip, defaulted off, branch kept for
> the day one lands). Order is the iOS carousel order; each `AttachmentTile` carries its iOS gradient hex
> (`9B59B6/F8B500/45B7D1/2ECC71/E74C3C/FF9F43`) so colour parity is a pure, tested fact. Built with an
> immutable `listOfNotNull { takeIf }` — no mutation, order-preserving. **SOTA over iOS**: the tile decision,
> buried in a SwiftUI `View` computed property (untestable without a UI host), is a framework-free SSOT with
> every branch JVM-covered.
>
> **Wiring (Compose glue, coverage-exempt)**: `ComposerAttachmentTray` (new file) renders the resolved tiles
> as a horizontal carousel of circular gradient discs + labels (parity `carouselTile`). The composer's lone
> `AttachFile` button becomes an `Add`/`Close` toggle (`attachmentTrayOpen`) that opens the tray above the
> composer Row (hidden while recording or read-only). Kind→handler map: Photo → `filePicker.launch("image/*")`,
> File → `*/*`, Voice → `requestVoiceRecording()` (the standalone Mic button stays for now — quick access —
> since Voice also lives in the tray). Camera/Location/Emoji host flags are passed **off** at the call site
> (`showCamera=false, showLocation=false, showEmoji=false`) because no handler exists yet — so the resolver
> yields exactly Photo/File/Voice today and never renders a dead-end tile; each flag flips on the day its
> handler lands.
>
> **Tests**: +14 `ComposerAttachmentLadderTest` — full posture (all six in order); recent-strip suppresses
> Photo but keeps Camera; capture arms (both / image-only / video-only / neither); no-file drops File;
> Location/Voice/Emoji each need BOTH permission and host flag (both arms); read-only participant keeps its
> permitted attachment tiles but loses Emoji; fully-denied → empty; partial subset preserves canonical order;
> the live chat-screen posture (camera/location/emoji off) yields Photo/File/Voice; colour parity locked for
> all six. **RED-proof (mutation)**: flipping `canCapture` from `||` to `&&` fails **exactly** 2 tests
> (video-only, image-only) — 15 run, 2 failed, no collateral — restored after.
>
> **Verified**: `assembleDebug` + `testDebugUnitTest` for `:feature:chat` green locally (BUILD SUCCESSFUL);
> full-project gate re-run for the PR. Reviewer PASS.
>
> **Next**: Candidate 2 from the scout — the finer send-lifecycle glyph (sub-200 ms "invisible" reveal +
> "slow" tier) on `:core:model` `SendLifecycleResolver`, driven purely by the local send-start timestamp vs
> `now` (no wire field). iOS source `BubbleDeliveryCheck.swift` (`SendingClockGlyph.shouldRevealImmediately`,
> `revealDelay = 0.2`) has a ready Swift test twin to mirror. Or continue the composer line by landing a real
> photo-specific `PickVisualMedia` launcher so Photo and File become genuinely distinct pickers.

> On 2026-08-20 **Conversation-row activity-heat gradient shipped** (slice
> `conversation-row-activity-heat`, feature-parity's Conversations "rich last-message preview"
> `[~]` — the `activity-heat` sub-gap that same line listed as pending alongside `tags` (just
> merged) and `typing` (merged the same day)). **Step 0**: no open `claude/apps/android/*` PR to
> merge first — the open-PR list held only parallel `claude/brave-archimedes-*` /
> `claude/intelligent-noether-*` sessions, a Jules branch, and five Dependabot; none on an
> android-routine slice branch, and the one Android Dependabot PR (#3139, `setup-android` bump)
> is CI-infra, not this lane. Branched off `origin/main` (`4b6f6342`, the merge of my own
> tag-chips slice #3232) as the literal first action. This container **reaches `dl.google.com`**
> (curl → 200 albeit slow), so the full local gate ran here.
>
> **A first stale trip found by reading source, not the note**: `PROGRESS.md`'s "Next" line —
> written before my tag-chips slice merged — recommended the *presence-dot wiring* as the next
> follow-up, but a grep on `ConversationListScreen.kt` proved the wiring is already
> **line 225 → 615** (`state.presenceStateFor(conversation, System.currentTimeMillis())` fed
> into `MeeshyAvatar(presence = …)`), landed in the earlier `conversation-list-presence-dot`
> slice. Lesson (already logged 2026-08-09): the "Next" hint is a hypothesis, not a fact —
> grep the code before spending a run on it. Real remaining Conversations row-preview gaps
> (`feature-parity.md:1594`): **activity-heat, presence/story-ring/mood** — of which the last
> two are avatar affordances not represented in `ApiConversation` yet, so *activity-heat* — a
> pure closed-form score off signals already on the wire — is the clean next slice.
>
> **The gap, re-proved by reading source**: iOS `ThemedConversationRow.conversationHeat`
> (`ThemedConversationRow.swift:54-70`) computes a `[0,1]` heat as
> `0.40·recency + 0.35·unread + 0.15·members + 0.10·pinned` (muted → floor `0.05`), and
> `heatBackground` (lines 72-85) fades a `topLeading → bottomTrailing` linear gradient from
> `accent.opacity(topOpacity)` to `accentSecondary.opacity(topOpacity*0.25)` — `topOpacity =
> isDark ? (0.03 + heat*0.10) : (0.02 + heat*0.08)`. Android's row rendered a flat glass
> surface — no heat tint, no gradient, so a hot group thread looked identical to a stale
> archived one until the eye caught the unread badge.
>
> **Pure core (`:feature:conversations`)**: `ConversationActivityHeat` — framework-free (no
> Compose, no Android time source), exposes `heat(lastActivityMillis, nowMillis, unreadCount,
> memberCount, isPinned, isMuted): Double`, `of(conversation, nowMillis)` (reads signals off
> the resolved preferences + `ConversationRowTime.epochMillis` SSOT — which already picks the
> last-message → updatedAt → createdAt cascade iOS gets from `conversation.lastMessageAt`),
> plus `gradient(heat, isDark): HeatGradient(topOpacity, bottomOpacity)`. Every constant —
> weights, saturation caps (unread 10, members 50), the four recency bucket boundaries and
> their exclusive `<` edges, the isDark floor/ramp coefficients — mirrors the iOS source.
>
> **Sibling SSOT** (`:sdk-core`): new `ApiConversation.accentColorPalette()` (`ConversationAccent.kt`)
> exposes the full `DynamicColorGenerator.ColorPalette` (primary + secondary + accent), the
> deterministic port of iOS `conversation.colorPalette`; the pre-existing `accentHex()` is now
> its `primary` accessor. The row composes the palette once via `remember(conversation)` and
> reads its two hues into `primaryAccent` / `secondaryAccent` (used by the heat gradient + the
> avatar's `containerColor` + the two accent-tinted labels — 3 previous `hexColor(conversation
> .accentHex())` calls collapsed to one memoized pair).
>
> **Wiring (Compose glue, coverage-exempt)**: the row's inner `Row` (inside `MeeshyGlassSurface`)
> gains a `.background(Brush.linearGradient(listOf(primaryAccent.copy(alpha = topOpacity),
> secondaryAccent.copy(alpha = bottomOpacity))))` under its existing content padding. The
> heat brush layers under the glass fill and above the surface's rounded clip — so a cold row
> stays a plain glass card (top α ≈ 0.02-0.03), and a hot row picks up a subtle
> accent-secondary → accent tint whose intensity tracks the score. Zero new `.dp`, no shape
> change, no clip conflict with the glass surface.
>
> **Tests**: +22 `ConversationActivityHeatTest` — muted short-circuit; 5 recency buckets
> (isolated arms, exact-boundary drops for each of 300/3600/86_400/604_800 s proving the
> exclusive `<` edges); null-last-activity → coldest; future-instant (clock skew) → hottest
> bucket; unread proportional + cap at 10; members proportional + cap at 50; pinned 0.10;
> maxed sum = 1.0 exact; realistic mixed blend; dark gradient floor 0.03→0.13 & light floor
> 0.02→0.10; bottom = ¼ top invariant; `of(conversation, now)` reads every signal off a real
> `ApiConversation`; `of` short-circuits muted; `of` treats a conversation with no parseable
> timestamp as coldest recency. **+3 `ConversationAccentTest`** cover the new palette
> (primary matches `accentHex`, secondary is distinct, deterministic across calls). Every
> branch of `heat` and `gradient` exercised. The Compose Brush/`Modifier.background` threading
> is thin glue, exempt per TDD-COVERAGE. **RED-proof (mutation)**: swapping `WEIGHT_UNREAD` from
> `0.35` to `0.30` fails **exactly** 5 tests (max-sum, realistic-blend, `of`-reads-signals, and
> the two unread arms) — 22 run, 5 failed, no collateral — restored after.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green for the new suite, then
> `assembleDebug` + `testDebugUnitTest` across all modules green locally. SDK bootstrapped as
> `platforms;android-37.0` via newer cmdline-tools `13114758` on `--channel=3`, aliased to
> `android-37`; Gradle 8.13 fetched via curl and invoked directly (the wrapper still 403s
> through the proxy — same env quirk as the two prior slices). Reviewer PASS.
>
> **Next**: continue the Conversations row-preview line — the remaining sub-gaps at
> `feature-parity.md:1594` are the message-body kinds (`ephemeral`/`expired`/`hidden`/
> `view-once`) and avatar affordances (`story-ring`/`mood`). The message-body kinds each need
> a wire field the current `ApiConversationLastMessage` doesn't carry yet (no `expiresAt`,
> no `deletedAt`, no `viewOnce` flag), so the honest first move there is to widen the wire
> DTO, not to guess kinds off the message-type string. Avatar `story-ring` is cleaner as a
> single slice: `StoryTray` already exposes per-user unread-story state and `MeeshyAvatar`
> already accepts `storyRing: StoryRingState`, just like it accepted `presence` before the
> earlier wiring slice — the missing wire is a lookup key exposed on the row state.

> On 2026-08-20 **Conversation-row tag chips shipped** (slice `conversation-row-tag-chips`,
> feature-parity's Conversations "rich last-message preview" `[~]` — the `tags` sub-gap that line
> listed as pending). **Step 0**: no open `claude/apps/android/*` PR to merge first — the open-PR
> list held only parallel `claude/brave-archimedes-*` / `claude/intelligent-noether-*` sessions, a
> Jules branch, and five Dependabot; none on an android-routine slice branch, and the one Android
> Dependabot PR (#3139, `setup-android` bump) is CI-infra, not this lane. Branched off `origin/main`
> (`408a49ea`) as the literal first action. This container **reaches `dl.google.com`** (curl → 200),
> so the full local gate ran here.
>
> **The gap, re-proved by reading source**: Android already lets you *edit* per-conversation tags
> (`ConversationTagsEditor` + the context-menu "Tags" dialog persist a `List<String>` into
> `resolvedPreferences.tags`) but **never displayed them on the row** — a grep for `TagChip`/tag
> rendering under `feature/conversations/` found only the editor dialog. iOS's `ThemedConversationRow`
> renders a tags row at the top of the row via the pure `visibleTagsInfo` (width-based fit with a
> "+N" overflow badge) + `MeeshyConversationTag.estimatedWidth` (`name.count*7+22`, CoreModels.swift).
>
> **Pure core (`:feature:conversations`)**: new `ConversationTagRow` — `estimatedWidth(name)` and
> `fit(tags, availableWidth) → Fit(visible, remaining)`, a faithful port of iOS's algorithm: iterate
> tags accumulating width+spacing(6), reserve the badge width(32)+spacing for any non-final tag,
> stop at the first that doesn't fit, and **always force at least one tag** so a row with tags never
> renders empty. **Placed in `:feature:conversations`, not on the `:core:model` tag type where iOS
> parks `estimatedWidth`** — it's a row-layout heuristic, not a property of the wire model (SDK
> purity: models stay layout-agnostic; a deliberate cleaner-than-iOS placement).
>
> **Wiring (Compose glue, coverage-exempt)**: `ConversationTagsRow(currentTags)` at the top of the
> row content Column, inside a `BoxWithConstraints` so the fit sees the **real** available width —
> an improvement over iOS's hardcoded `availableWidth = 200`. Each chip's colour is the deterministic
> `DynamicColorGenerator.colorForName` SSOT (same tag name → same colour everywhere), rendered as a
> translucent capsule; the "+N" badge is a neutral `textSecondary` capsule. String ×1
> (`conversations_row_tags_overflow` = `+%1$d`, `translatable="false"` — a locale-invariant numeric).
>
> **Tests**: +10 `ConversationTagRowTest` — `estimatedWidth` (chars×7+padding; empty name = padding);
> `fit` empty→nothing; all-fit; force-first-when-none-fits; badge reserved so a later tag hides;
> **final tag exempt from the reserve** (width 79 passes only because the last tag skips the badge
> reserve); stop-at-first-overflow keeps the earlier ones; remainder count for a hidden tail. Every
> branch of `fit` exercised (both spacing arms, both reserve arms, fit/break, force-first). The
> `BoxWithConstraints`/chip rendering is thin Compose glue, exempt per TDD-COVERAGE.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green (10/10 new), then full
> `assembleDebug` + `testDebugUnitTest` across all modules green locally. SDK bootstrapped as
> `platforms;android-37.0` via the newer cmdline-tools `13114758` on `--channel=3`, aliased to the
> `android-37` hash AGP 8.13 wants; the Gradle 8.13 wrapper download 403'd through the proxy so a
> `curl`-fetched distribution was run directly (env notes in NOTES). Reviewer PASS.
>
> **Next**: continue the Conversations row indicators — `presence` dot / `story-ring` / `mood` on the
> avatar, or `activity-heat`. Presence has the biggest UX payoff and its SSOT (`getUserPresenceStatus`
> / `PresenceState`) is already ported; the row `MeeshyAvatar` already accepts a `presence` param but
> the list VM does not yet feed live per-conversation presence — that wiring is the next slice's core.

> On 2026-08-20 **Conversation-row typing preview shipped** (slice `conversation-row-typing-indicator`,
> feature-parity's Conversations "rich last-message preview" `[~]` — the `typing` sub-gap that line
> itself listed as pending). **Step 0 — an open android-routine PR WAS found and merged first**: my
> initial `list_pull_requests --head isopen-io:claude/apps/android` returned `[]` (the head filter is
> too specific to match a `claude/apps/android/<slice>` branch — a lesson logged in NOTES), but reading
> the Actions list surfaced **PR #3228** (`chat-forwarded-badge-source-name`, a parallel session's
> slice) open, green (Android #176 ✅), `mergeable_state: clean`. Per the Step-0 mandate I **squash-merged
> #3228** (main `0a8a1624 → 680fd2b6`) before finishing my own slice — it also carried the fix for the
> stale share-link tests (below), so main's Android CI is green again.
>
> **A pre-existing main breakage, found and attributed by reading source**: the full local gate first
> showed 8 failures — 5 mine (a test-harness bug, below) and **4 stale share-link tests** in
> `:feature:conversations` (`CreateShareLinkViewModelTest`, `MyShareLinksViewModelTest`,
> `ShareLinkDetailViewModelTest`) asserting `…/join/…` while production now yields `…/chat/…`. Root cause:
> main commit `0a8a1624` switched `CreatedShareLinkPresentation`/`MyShareLinkPresentation` to `/chat/` and
> updated the `:core:model` presentation tests but **missed these 3 ViewModel test files** — main was red
> on Android CI as of that commit. **Not fixed inside my slice**: PR #3228 (merged above) already contained
> the identical `/join → /chat` correction, so I restored those 3 files from the merged main and kept my
> slice diff **typing-only** — no redundant re-touch, no double-fix conflict.
>
> **The gap, re-proved by reading source (Explore scout + independent verify)**: a repo-wide grep for
> `[Tt]yping` under `feature/conversations/` returned nothing — the row preview was `draftLine ?:
> lastMessagePreview(...)` only, with **no typing tier**, even though `MessageSocketManager` already
> exposes `typingStarted`/`typingStopped: SharedFlow<TypingEvent>` and `ConversationListViewModel` already
> injects it (collecting six of its flows, not the two typing ones). iOS's `ConversationListViewModel.typers`
> + `ThemedConversationRow` (`if typingUsername != nil { … } else if draft … else lastMessage`) drives a
> **typing → draft → last-message** priority.
>
> **Pure core (`:feature:conversations`)**: `ConversationTypingRoster` — a multi-conversation SSOT
> (`conversationId → userId → ConversationTyper`), the list-analog of `:feature:chat`'s single-conversation
> `TypingParticipants`. `started` (self-excluded, name fallback `displayName → username → userId`, returns
> the same map instance on an inert self/blank start), `stopped` (removes exactly that user — a group row
> stays lit while any other peer types; drops the conversation key on the last stop; inert for an absent
> user), `typingDisplayName` (deterministic `minWith(displayName, userId)` so a re-render never flickers).
> New `ConversationRowPreview` decides the tier: `typingPreview(name, format)` + `conversationRowPreview(
> typing, draft, last) → RowPreview(text, isAccent)` (typing & draft accent-tinted, last-message secondary).
>
> **Wiring**: `ConversationListUiState.typers` + `typingDisplayNameFor(id)`; new `observeTyping()` collects
> both socket flows through the roster, self = the resolved `currentUserId`. **SOTA over iOS parity, kept
> honest**: a per-`(conv,user)` **15 s safety-timeout** job (`armTypingCleanup`) mirrors iOS's
> `scheduleTypingCleanup` — a `typing:start` re-arms it, a real `typing:stop` cancels it — so a lost stop
> frame can't leave a row stuck "… is typing" forever. `ConversationListScreen`'s row threads
> `typingDisplayName` and renders `rowPreview.text`/`.isAccent` (thin, coverage-exempt Compose glue).
> Strings ×1 (`conversations_preview_typing`) EN/FR/ES/PT.
>
> **Tests**: +14 `ConversationTypingRosterTest` (record; displayName>username>userId fallback; self &
> blank-id inert-same-instance; repeated start refreshes in place; two typers both remain + deterministic
> pick; tie-break by userId; per-user stop keeps the row lit; last-stop drops the key; inert stop for
> unknown conv / absent user / empty state; no cross-conversation leak; null when nobody types) +6
> `ConversationRowPreviewTest` (format; null/blank/whitespace name → null; trim; the 3-way priority incl.
> accent flags) +5 `ConversationListViewModelTest` (start surfaces the typer & doesn't leak to c2; self
> never shown; stop clears exactly that user leaving the rest; **15 s timeout force-clears**; a fresh start
> **re-arms** the timeout so an active typer isn't dropped early). Roster/reducer branch coverage total;
> the row/`observeTyping` glue is exempt per TDD-COVERAGE. **Test-harness lesson (RED→GREEN)**: my first 4
> VM tests used `advanceUntilIdle()` after the emit, which fast-forwards virtual time **through the 15 s
> safety timer**, clearing the typer under test — switched to `runCurrent()` (immediate work, no time
> advance) + explicit `advanceTimeBy` for the timeout tests. Lesson logged in NOTES.
>
> **Verified**: `:feature:conversations:testDebugUnitTest` green (all 3 new suites), then full
> `assembleDebug` + `testDebugUnitTest` across all modules green locally (this container reaches
> `dl.google.com`; SDK bootstrapped as `platforms;android-37.0` on `--channel=3` then aliased to the
> `android-37` hash AGP 8.13 wants — env note in NOTES). Reviewer PASS.
> On 2026-08-20 **Forwarded badge names its source conversation shipped** (slice
> `chat-forwarded-badge-source-name`, feature-parity's Chat "Edited / pinned / forwarded indicators"
> composite — the forwarded-source-name residual left open after `chat-forwarded-indicator`). **Step 0**:
> no open `claude/apps/android/*` PR to merge first (open-PR list was 12 — gateway/web `$`-escaping fixes,
> iOS transfer/Jules/audio-ZMQ, shared parity test, five Dependabot; none on an android-routine branch).
> Branched off `origin/main` (`ccc81b25`) clean, branch created as the literal first action before any
> edit. This container **reaches `dl.google.com`** (curl → 200), so the SDK bootstrapped (platform
> `android-37.0` — the bare `android-37` package does not exist since minor SDK releases; CI's best-effort
> provisioning step installs the same `.0` candidate) and the **full local gate ran here**.
>
> **The gap, re-proved by reading source**: `chat-forwarded-indicator` (2026-07-08) shipped a generic
> italic "Transféré/Forwarded" chip gated on `!forwardedFromId.isNullOrBlank()`, but it never **named the
> source conversation**. iOS `BubbleForwardedIndicator` names it via the pure `ForwardBadgePolicy`
> (`apps/ios/.../Bubble/ForwardBadgePolicy.swift`) — a 3-way rule with an explicit twin at
> `apps/web/lib/forward-badge.ts`: name shown for every group type, hidden for `direct`/`bot`, status quo
> for an unknown type, blank name → hidden. The data is already on the wire — the gateway hoists
> `forwardedFromConversation` (`{id,title,identifier,type,avatar}`) onto the message payload
> (`MessageHandler.ts:1209-1210`) — Android's `ApiMessage` simply did not decode it.
>
> **Pure core (`:core:model`)**: new `ForwardBadgePolicy.conversationName(ref: ForwardReference?): String?`
> — a faithful port of the iOS enum (hidden set `{direct, bot}`, `takeIf { isNotEmpty }` for the blank
> guard, unknown type falls through to the name). `ForwardReference` gains `conversationType: String?`
> (the field iOS carries at `CoreModels.swift:1595`).
>
> **Wiring**: `ApiMessage` gains a decoded `forwardedFromConversation: ApiForwardedConversation?`
> (exactly the gateway's selected fields). `BubbleContentBuilder` folds it to a new
> `BubbleContent.forwardedFromName` — building a `ForwardReference(conversationName = title ?: identifier,
> conversationType = type)` (mirrors iOS's `title ?? identifier` fallback) and running the policy; a
> deleted tombstone forces null (same suppress rule as `pinnedAtIso`/`isForwarded`). `MessageBubble`
> renders `bubble_forwarded_from` ("Transféré de {name}") when non-null, else the existing generic
> `bubble_forwarded` chip — same accent-coherent `Icons.AutoMirrored.Filled.Send` glyph. Strings ×1
> (`bubble_forwarded_from`) EN/FR/ES/PT.
>
> **Tests**: +13 `ForwardBadgePolicyTest` (null ref, absent name, blank name → absent; each of the six
> group types → named; `direct`/`bot` → hidden; unknown type → status-quo name; null type → name) + 5
> `BubbleContentBuilderTest` (group forward names the source; titleless public falls back to identifier;
> direct forward stays `isForwarded` but unnamed; a forward with no source-conversation payload is
> unnamed; a deleted forward never names its source). Policy branch coverage total; the `MessageBubble`
> render is exempt Compose glue per TDD-COVERAGE.
>
> **Verified**: `:core:model:testDebugUnitTest --tests ForwardBadgePolicyTest` green (BUILD SUCCESSFUL);
> full `assembleDebug` + `testDebugUnitTest` across all modules green locally before the PR
> (single container, `dl.google.com` reachable, `--max-workers=2` to dodge the proxy 429 burst).
> Reviewer PASS. PR **#3228**.
>
> **CI incident — base branch was red, NOT this diff.** The PR's first Android check failed on 4
> tests in `:feature:conversations` (`CreateShareLinkViewModelTest`, `MyShareLinksViewModelTest`,
> `ShareLinkDetailViewModelTest`) — all `expected …/join/… but was …/chat/…`, none touching the
> forwarded badge. Root cause: **main itself was red**. While this slice was in flight, commit
> `0a8a1624` ("feat: les liens de partage créés pointent sur /chat") landed on `main`, switched the
> share-link `joinUrl` producers to `/chat/` in production, updated the `:core:model` *presentation*
> tests — but **missed the 3 `:feature:conversations` ViewModel tests** (4 assertions) still expecting
> `/join/`. main's own push run `32348038004` was already `failure`. A PR's `pull_request` CI builds
> the merge with the base, so this PR inherited the breakage. **Repair** (still `apps/android` only, no
> production logic): merged the new `main` into the branch (clean, no conflicts) and corrected the 4
> stale ViewModel assertions to `/chat/` — the deliberate, already-merged product decision (the legacy
> `/join/` deep-link receivers `0a8a1624` intentionally kept are untouched). This turns the PR green
> **and** repairs `main` on merge. Lesson logged in NOTES.

> On 2026-08-20 **Composer language pill + picker shipped** (slice `composer-language-pill`,
> feature-parity's Chat "Live sentiment + language detection (smart context zone)" composite — the
> **language-detection half** left open by `composer-live-sentiment`; the composite line is now `[x]`).
> **Step 0**: no open `claude/apps/android/*` PR to merge first (the full open-PR list was 11 — gateway/web
> `$`-escaping fixes, iOS transfer/Jules, five Dependabot; none on an android-routine branch). Branched off
> `origin/main` (`7d23ec0f`) clean, branch created as the literal first action before any edit. This
> container **reaches `dl.google.com`** (curl → 200), so the SDK bootstrapped and the **full local gate ran
> here** — note the platform is now **`android-37`** (not `android-35` as ROUTINE §Env still says); the first
> gate run died with `Failed to find target with hash string 'android-37'` until `sdkmanager "platforms;android-37"`.
>
> **The gap, re-proved by reading source**: a grep showed `ComposeLanguageDetector` (the pure web-heuristic
> port) was already wired ONLY at send-time to stamp `originalLanguage` — there was no live composer language
> pill, no picker override, and no ≥10-word detection lock. iOS drives all three from `TextAnalyzer`
> (`wordCountThreshold`=10, `isLanguageLocked`, `languageOverride`) + `ComposerLanguageResolver.resolve`.
>
> **Pure core (`:core:model`)**: new `ComposerLanguageState(detected, manualOverride, isLocked)`.
> `onDraftChanged(draft)` re-detects each keystroke while unlocked & unoverridden, locks once the draft
> reaches `WORD_LOCK_THRESHOLD`=10 words, and a blank draft releases the lock unless a manual pick holds.
> `display(fallback)` = `manualOverride ?? detected ?? fallback` (iOS `displayLanguage`). `withManualPick`
> overrides + freezes. **Design win over a naive port**: a `NO_DETECTION` sentinel (`""`, a value the
> detector never returns) is passed as the detector fallback so a weak/undetectable draft yields `detected =
> null` instead of pinning the pill to a stale guess — the pill then follows the LIVE fallback at read time.
> This also removes any seed-timing fragility: `display` applies the fallback at read, not at detect.
>
> **Wiring (`:feature:chat`)**: `ChatUiState.composerLanguage` + `composerLanguageSeed` (the viewer's
> `resolveUserLanguage`, seeded from the conversation-load collector) + `composerLanguageCode` getter.
> `onDraftChange` folds `onDraftChanged`; new `onComposerLanguagePicked(code)`. The pill is now
> **authoritative for the stamped `originalLanguage`** on the text AND file send paths — captured before the
> clear via `composerLanguage.display(resolveUserLanguage(user))`, so a manual pick wins over detection —
> replacing the previous per-send `ComposeLanguageDetector.detect(text, …)` (the clipboard/pasted-content
> path keeps its own detection, a distinct signal). Reset to seed on send. `ChatScreen` renders a leading
> `ComposerLanguagePill` (flag glyph + `DropdownMenu` over `LanguageData.commonLanguageCodes`, checkmark on
> the current pick) — thin, coverage-exempt Compose glue. Strings ×1 (`chat_composer_language`) EN/FR/ES/PT.
>
> **Tests**: +18 `ComposerLanguageStateTest` (display precedence; detection surfaces/flips while unlocked;
> undetectable draft never pins & never locks; word-threshold lock freezes further detection; manual
> override suppresses detection; empty releases the lock but keeps a manual pick; released lock re-detects;
> `withManualPick` locks; determinism) + 5 `ChatViewModelTest` (pill follows detection; pill seeds from the
> user's resolved language; a pick overrides live detection; a pick stamps the outgoing message over
> detection; send resets to the seed). Reducer branch coverage total; the pill/`DropdownMenu` are exempt
> Compose glue per TDD-COVERAGE. The two pre-existing send-language tests (detected → es, undetectable → user
> lang) stay green — `display` preserves both behaviours exactly.
>
> **Verified**: `:core:model` + `:feature:chat` suites green individually; full `assembleDebug` +
> `testDebugUnitTest` across all modules green locally before the PR (single container, `dl.google.com`
> reachable). Reviewer PASS.

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
> **Verified**: `assembleDebug` + `testDebugUnitTest` green across all modules locally (single-thread
> to dodge the proxy 429 burst; one `:app` Robolectric run needed its `android-all-instrumented` jar
> re-fetched after a warm — a proxy-throttle transient, not a test failure). **CI incident, my own
> fault, caught by the gate**: the FIRST push (`0d227f3a`) failed the Android check with `Unresolved
> reference 'SentimentLevel'` — I'd added the import to the two consumer files (`ChatScreen`, the
> test) but not to `ChatViewModel.kt`, where the `composerSentiment` getter is declared. Both CI and
> the local serial gate reproduced it identically. Fixed in `c4a5f8e5` (two imports), re-verified
> green locally, re-pushed. Lesson logged in NOTES.

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

