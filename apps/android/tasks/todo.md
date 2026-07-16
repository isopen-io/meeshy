# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Chat) — slice `chat-large-paste-detection` ✅
**Large-paste detection → clipboard-content preview.** Advances the §Chat "Large-paste detection →
clipboard-content attachment" line to detection+preview done. Ships `:feature:chat` pure `LargePasteDetector`
(fires when composer text grows past 2000 chars **and** jumps >250 chars in one edit — readable port of iOS
`handleClipboardCheck`'s `delta = 2·growth` heuristic) + clock-injected `ClipboardContent` value type
(`of(text, nowMillis)` → id / charCount / 200-char truncated preview; surpasses iOS's twin `Date()` reads +
id-only equality). Wired real (exempt glue): `ChatViewModel.onDraftChange` folds a captured paste into
`ChatUiState.clipboardContent` + clears the draft; `removeClipboardContent` discards it; `ChatComposer` shows an
accent-tinted `ClipboardContentPreview` chip (en/fr/es/pt). +24 tests (detector 13, model 8, VM 3), mutation-checked
(growth boundary `>`→`>=` fails exactly the boundary test). Full `assembleDebug testDebugUnitTest` green (UTF-8-daemon
recipe, 5m14s), APK produced, diff = `apps/android/feature/chat` only. Reviewer PASS. Next: send the captured content
as a real clipboard_content attachment (gated on the attachment send pipeline), or live-location socket wiring, or
the in-app browser / rich-card image loading link-preview follow-ups.

## Prior loop (Phase: Chat) — slice `chat-overlay-preview-bubble` ✅
**Floating preview-bubble overlay layout law — pure SSOT + real lifted hero.** Completes the §Chat "Long-press
overlay menu" line (all four parts now done: quick-reactions + action-grid + drag-to-detail + preview bubble). Ships
`:feature:chat` `MessageOverlayLayout.compute(...)` — a faithful port of the iOS `MessageOverlayMenu` "native-lean"
`nl*` geometry: stacks `[emoji bar]·gap·[preview hero]·gap·[action menu]` into a `MessageOverlayCluster` (scale +
preview rect + emoji/menu anchor points), with a two-stage scale cascade (height cap at 320px/floor 0.55 → fit
squeeze/floor 0.4, band floored at 160), a trailing/leading unclamped hero anchor, a safe-area cluster-top clamp,
and independent emoji/menu X clamps. +17 tests, mutation-checked (swap anchor branches → exactly 3 red; the check
caught a symmetric-at-scale-1.0 anchor blind spot in the first draft → fixed by testing on a scaled preview). Wired
for real in `ChatScreen` (exempt glue): each row's window frame captured via `onGloballyPositioned` into a plain
`bubbleFrames` map; on long-press a new `MessageOverlayPreviewHero` Popup lifts a scaled copy of the tapped
`MessageBubble` above the action sheet, positioned by the law (frame-miss skips gracefully). Full `assembleDebug
testDebugUnitTest` green (UTF-8-daemon recipe), APK produced, diff = `apps/android/feature/chat` only. Reviewer PASS.
Next: universal composer / voice-recording pill (waveform core already exists), or the in-overlay audio/video preview.

## Prior loop (Phase: Chat) — slice `chat-composer-effects-picker` ✅
**Composer effects picker — pure presentation SSOT + real send wiring.** The whole pure effects pipeline
(`MessageEffectsResolver`/`Editor`/`Encoder`/`RenderPlanner`) and the effects-ready `sendOptimistic` already
existed, but nothing armed or sent effects — the composer had no picker. Ships `:core:model`
`MessageEffectsPickerPresenter.build(effects)` (+ `MessageEffectOption`/`MessageEffectSection` catalog): a pure
derivation of the whole sheet state the iOS `EffectsPickerView` recomputes inline (per-chip `isActive`, ephemeral
`showEphemeralDuration`/`isSelected` under flag authority, `activeCount` popcount, `showSummary`). +16 tests,
mutation-checked (force `showEphemeralDuration=true` → exactly 3 fail). Wired for real in `:feature:chat`:
`ChatUiState.pendingEffects`/`isEffectsPickerOpen`, ViewModel intents (`toggleEffect`/`selectEphemeralDuration`/
`clearEffects`/`open`/`dismiss` — dismiss keeps the selection), `send()` stamps `pendingEffects` onto
`sendOptimistic(effects=…)` then disarms; `ChatComposer` AutoAwesome button opens the `EffectsPickerSheet` (exempt
Compose glue, accent chips, en/fr/es/pt). +7 ViewModel tests. Full `assembleDebug testDebugUnitTest` green, APK
produced, diff = `apps/android` only. Reviewer PASS. Next: propagate the already-decoded `ApiMessage.effects` into
`BubbleContent` so `Modifier.messageEffects` fires on received messages; or the one-shot appearance rendering.

## Prior loop (Phase: Media §P) — slice `media-thumbhash-decode` ✅
**ThumbHash decoder pure core** — the decode beneath the app-side blur placeholder. Pure `:core:model`
`me.meeshy.sdk.model.media.ThumbHash`: faithful port of Evan Wallace's `thumbHashToRGBA` /
`thumbHashToAverageRGBA` / `thumbHashToApproximateAspectRatio` (`averageColor`, `approximateAspectRatio`,
`hasAlpha`, `isLandscape`, `decode`→`ThumbHashImage(w,h,rgba)`) — YCoCg→RGB inverse-DCT over primitives, no
Android `Bitmap`. Surpasses the reference: rejects a hash too short for the region it reads
(`IllegalArgumentException` vs silent OOB) + clamps the raster to ≥1×1 (no zero-sized image from a degenerate
header). +21 tests. `:core:model` tests green; `:app:assembleDebug` → BUILD SUCCESSFUL, APK produced.
Two-mutation RED check (flip YCoCg blue reconstruction + drop portrait aspect scale) failed exactly the 4
relevant tests. Reviewer PASS, diff = `apps/android` only. Full-tree tests show only 2 pre-existing flaky
`:sdk-core` DataStore-timeout failures (pass on retry; unrelated module). The raster→`Bitmap` wrap + Coil
placeholder wiring + ThumbHash *encoder* (slide generation) remain app-side/next. Next: raster→`Bitmap` + Coil
placeholder consuming `ThumbHash.decode`; ThumbHash encoder; app-side Bitmap re-encode consuming
`ImageCompressionPlan`; or app-side voice recorder pill consuming the waveform core.

## Prior loop (Phase: Media §P) — slice `media-waveform-interpolation` ✅ (merged PR #1896)
**Live-waveform pure core** — the metering→amplitude→resampling math beneath the app-side voice-note waveform,
shared by the recorder pill and the audio-message player. Pure `:core:model` `me.meeshy.sdk.model.waveform`:
`AudioLevelNormalizer.normalize` (dB→`0..1`, ports iOS `AudioRecorderManager.normalizeLevel`, +upper-clamp +NaN
guard), `WaveformLevelWindow` (immutable 15-sample rolling ring, ports `levelHistory` + initial 15-zero fill),
`WaveformInterpolator.interpolate` (levels→`barCount` linear-blend strip in one pass, ports
`UniversalComposerBar.interpolatedLevel`, degenerate cases pinned). +28 tests (normalizer 7, window 11,
interpolator 10). `:core:model` waveform tests green (28/28); full `assembleDebug` + all-module tests green, APK
produced. Two-mutation RED check (drop normalizer upper clamp + zero the interpolator high-sample blend) failed
exactly the 4 relevant tests. Reviewer PASS, diff = `apps/android` only. The `MediaRecorder` capture + Compose
`Canvas` paint remain app-side glue.

## Prior loop (Phase: Settings §L) — slice `settings-open-source-licenses` ✅ (merged PR #1894)
**Open-source licenses** — the last §L static screen (§L static screens now complete). Port of iOS `LicensesView`
over an **Android-accurate** curated catalog (Compose/AndroidX/Material/Hilt/Coroutines/Serialization/Coil/OkHttp/
Retrofit/Media3/Room/Timber/ZXing/Firebase/Socket.IO-java/WebRTC-android) — the libs that actually ship, not iOS's
Swift deps. Pure `:core:model` SSOTs (`me.meeshy.sdk.model.licenses`): `OpenSourceLicenseType` (MIT/APACHE_2_0/BSD/
OTHER, decl order = render order), `OpenSourceLicenseResolver.resolvable` (launchability gate, `http(s)://` only —
narrowed vs Support's `mailto:`), `OpenSourceLicensePresentationBuilder.build` (**surpasses iOS's flat list**:
groups by type in enum order, sorts each group by name case-insensitively, drops empty groups, excludes
non-launchable up front), `OpenSourceLicenseCatalog` (curated list + `groups()`). `LicensesScreen` glue:
accent-coded per-family section cards, tappable repo rows via `ACTION_VIEW`. Wired a new **Open source licenses**
row in Settings → About (`Routes.LICENSES`). +26 tests (resolver 9, builder 8, catalog 7). Full `:app:assembleDebug`
+ all-module tests green (6m36s, APK produced); two-mutation RED check (break sort + widen resolver to `mailto:`)
failed exactly the 3 relevant tests. Reviewer PASS, diff = `apps/android` only, EN/FR/ES/PT. **⚠ Merge held:**
PR #1894 CI is red only on a pre-existing, unrelated gateway failure (`calls-routes.test.ts`, 3 tests) that also
fails on main's own push CI (sha `6d0b17d`) — can't fix without touching gateway prod logic (out of scope), and
hard rule = never merge past red CI. Will squash-merge once main's gateway suite is green. Next: chat media view
consuming `MediaAutoDownloadDecider`; §K crop/resize/compress before upload; or a §K row (device-sessions / 2FA /
voice-cloning / blocked-users).

## Prior loop (Phase: Settings §L) — slice `settings-legal-documents` ✅
**Terms of Service + Privacy Policy** — port of iOS `TermsOfServiceView` + `PrivacyPolicyView`, **unified**
into one data-driven screen keyed by `LegalDocumentKind`, wiring the two previously **dead-end** Settings → About
rows. Pure `:core:model` SSOTs (`me.meeshy.sdk.model.legal`): `LegalDocumentKind` (route `arg` + `fromArg` parser,
null on blank/unknown), `LegalSectionKey` (9 ToS + 7 Privacy), `LegalDocumentCatalog.sections`/`.numbered`
(ordered keys + iOS `index + 1` numbering). `LegalDocumentScreen` glue: numbered Info-blue cards, content resolved
app-side across values-* → **automatic EN/FR/ES/PT**, surpassing iOS's manual fr/en picker. +14 tests
(catalog 7 order/numbering/partition invariants, kind 7 parse/case/trim/null). `:app:assembleDebug` + all-module
`testDebugUnitTest` green; one-mutation RED check (drop `TOS_CONTACT`) failed exactly the order+partition tests.
Reviewer PASS, diff = `apps/android` only. Next: remaining §L static screens (Help & Support; open-source
licenses — Android-accurate curated catalog), the chat media view consuming `MediaAutoDownloadDecider`, or §K
crop/resize/compress before upload.

## Prior loop (Phase: Profile §K) — slice `profile-avatar-banner-upload` ✅
**Avatar + banner upload** — port of iOS `AttachmentUploader` + `UserService.updateAvatar`, generalised to a
banner (iOS uploads only a single compressed JPEG avatar). Four pure `:core:model` SSOTs: `ImageUploadTarget`
(AVATAR/BANNER + per-target `maxBytes` 8/12 MiB), `ImageUploadValidator` (priority gate empty → non-image →
oversize → Accepted; MIME parsed before `;` + case-folded; a 10 MiB image passes as banner, fails as avatar),
`AvatarBannerUpload.firstUploadedUrl` (first non-blank URL else null), `AvatarBannerApply` (optimistic-paint
merge mirroring `ProfileEditApply`). Dedicated `AvatarBannerUploadViewModel` validates (reject → typed
`ImageUploadError`, no network) → uploads via the existing `MediaRepository`/`MediaApi` → optimistic session
paint → confirms via existing `UserRepository.updateAvatar`/`updateBanner` → adopts server user / rolls back on
failure; single-flight + cancellation-safe. `ProfileScreen`: tappable edit-mode avatar (Indigo camera badge +
spinner) via `PickVisualMedia` + "Change cover photo" banner button, snackbar errors, EN/FR/ES/PT; added
`androidx.activity.compose` to the module. +36 tests (validator 14, apply 4, url-select 4, VM 14); one-mutation
RED check on the size branch confirmed the size tests. Full `assembleDebug` + all-module tests green, diff =
`apps/android` only. Next: crop/resize/compress before upload (§K polish); live `ConnectivityManager` monitor
(§L); or another §K/§L row (crash diagnostics, static pages, device-sessions/2FA/voice-cloning).

## Prior loop (Phase: Settings §L) — slice `settings-media-cache` ✅
**Media cache management** — port of iOS `DataStorageView` + `CacheCoordinator.clearAll`, **surpassing iOS**: iOS
shows **no sizes** and offers only a single "clear all" (its own audit flags a size readout as a future TODO;
`estimatedDiskBytes()` is unused); Android shows the **total + every per-category size** and clears **per-category
or all**. Two pure `:core:model` SSOTs: `ByteSizeFormatter` (binary KB/MB/GB, adaptive 1-decimal, negatives→0,
sub-KB still in KB — ports the shared iOS `ByteCountFormatter` convention) + `MediaCacheReport`/`MediaCacheCategory`
(per-category bytes, `of` normalisation + clamp, derived `totalBytes`/`isEmpty`/`nonEmptyCategories`, optimistic
`withCleared`). `:feature:settings` pure `MediaCacheScanner` (recursive `walkTopDown` size + content-wipe-keep-dir,
missing-dir = 0/no-op, tested on real temp dirs), `MediaCacheStore`/`AndroidMediaCacheStore` (4 categories →
`cacheDir/image_cache` [Coil default, populated today] + `cacheDir/media/{audio,video,thumbnails}` [pipeline-ready];
`Dispatchers.IO`), `MediaCacheViewModel` (init scan, SWR refresh, optimistic per-/all-category clear with snapshot
rollback, single-flight guard, SCAN/CLEAR mapping, cancellation-safe) + `MediaCacheScreen` (amber info card, Indigo
total card, per-category rows with inline clear, destructive clear-all behind an `AlertDialog`). Wired the two
previously no-op Settings → Data rows ("Clear media cache" + "Storage used") to `Routes.MEDIA_CACHE`. +43 tests
(ByteSizeFormatter 15, MediaCacheReport 10, MediaCacheScanner 6, VM 12); full `assembleDebug` + all-module tests for
verification, diff = `apps/android` only, EN/FR/ES/PT. Next: live `ConnectivityManager` monitor + first pipeline
consumer of the media policy engine; avatar/banner upload (§K); or another §L row (crash diagnostics, static pages).

## Prior loop (Phase: Settings §L) — slice `settings-data-export` ✅
**GDPR data export** — port of iOS `DataExportView` + `DataExportService`, surpassing iOS twice: iOS shared only
the summary counts (dropping the real payload) and shared truncatable text — Android shares the **full** payload
as a real **file** via FileProvider. Three pure `:core:model` SSOTs: `DataExportRequestBuilder` (always-on
`profile` + `types` order + format token, mirrors gateway `parseTypes`), `DataExportData` (full response model,
timestamps as raw ISO strings → lossless round-trip), `DataExportFileBuilder` (safe fileName from the ISO
`exportDate`; `text/csv` on a non-empty server `csv` map else a JSON re-encode of the whole payload). `:core:network`
`DataExportApi` (`GET me/export`); `:sdk-core` `DataExportRepository` online + session-gated. `DataExportViewModel`
(double-tap guard; any selection change invalidates a stale artifact; re-select = inert; NETWORK/GENERIC mapping) +
`DataExportScreen` (format picker + content toggles + success card whose Share writes to `cacheDir/exports` and
launches the chooser). Added an app-module FileProvider (`${applicationId}.fileprovider` + `file_paths.xml`), wired
Settings → Data "Export my data" (`Routes.DATA_EXPORT`). +34 tests (RequestBuilder 7, FileBuilder 8, DataDecode 3,
Repository 4, VM 12); `:app:assembleDebug` + touched-module tests green (the 2 sdk-core DataStore-store failures are
the documented parallel-load flake — green in isolation, untouched here), diff = `apps/android` only, EN/FR/ES/PT.
Next: media cache management (§L), live `ConnectivityManager` monitor + first pipeline consumer of the media policy
engine, or avatar/banner upload (§K).

## Prior loop (Phase: Settings §L) — slice `settings-media-auto-download` ✅
**Media auto-download preferences** — port of iOS `MediaDownloadSettingsView` + the
`MediaDownloadPreferences`/`MediaDownloadPolicyEngine`/`NetworkConditionMonitor` trio. Pure `:core:model` SSOTs:
`AutoDownloadPolicy` × `MediaKind` → `MediaDownloadPreferences` (per-kind policy, `policy`/`withPolicy` lenses,
iOS defaults) + corruption-safe JSON codec + `MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition, prefs)`
(4×4 truth table + offline gate) + `NetworkConditionResolver.resolveFromFlags(...)` (flag→condition; iOS's dead
`isExpensive` dropped). Durable `MediaDownloadPreferencesStore` (`:sdk-core`, hydrate + self-heal). `MediaDownload-
ViewModel` mirrors the store → immutable UI state, writes per-kind through the store — base read **inside** the
launch so concurrent kind-edits never clobber, re-select = no-op. `MediaDownloadScreen`: accent-coherent per-kind
`RadioButton` sections, reached from Settings → Data "Auto-download" (`Routes.MEDIA_DOWNLOAD`). +37 tests
(engine 6, resolver 9, prefs/codec 10, store 7, VM 5); `:app:assembleDebug` + touched-module `testDebugUnitTest`
green (sdk-core DataStore flake green on retry/isolation), diff = `apps/android` only, EN/FR/ES/PT.
Next: live `ConnectivityManager` monitor over `NetworkConditionResolver` + first pipeline consumer of the engine,
or avatar/banner upload (§K), or another §L row (Privacy, media cache, GDPR export).

## Prior loop (Phase: Translation §D) — slice `feed-post-language-switch` ✅
**Interactive per-post language switch** — the read-only feed flag strip is now **tappable** (tap a chip →
switch the post's displayed language; tap the active chip → revert to the default Prisme resolution), mirroring
the chat bubble. SSOT: the pure `LanguageFlagTapResolver` was **relocated `:feature:chat` → `:sdk-ui`** so chat
+ feed share one flag-tap rule. `FeedPostBuilder` gained override-aware `build(..., activeLanguageCode)` +
`resolveActiveCode(post, prefs, override)` (pure, tested) driving content + strip highlight; `FeedViewModel`
holds a per-post `activeLanguageOverride` StateFlow kept **outside** the cache stream (choice survives every
refresh — instant-app) + `onPostFlagTap`; `FeedScreen` chips are `.clickable`. +19 tests (+8 `FeedPostBuilderTest`,
+5 `FeedViewModelTest`, 10 relocated `LanguageFlagTapResolverTest`); `:sdk-ui`+`:feature:feed`+`:feature:chat`
`testDebugUnitTest` + `:app:assembleDebug` green, diff = `apps/android` only.
Next: interactive `includeTranslatable` arm for posts (tap absent language → on-demand request, needs a
post-translation path), the per-story timeline strip, or persisted translations across cold start (§D offline Prisme).

## Prior loop (Phase: Translation §D) — slice `feed-post-language-strip` ✅
**Per-post Prisme language flag strip** — the feed sibling of the chat `MessageLanguageStrip`. New pure
`:sdk-ui` `PostLanguageStrip.build(...) → List<LanguageChip>` adapts a post's language-keyed
`Map<code, ApiPostTranslationEntry>` into `LanguageResolver.TranslationLike` rows and **delegates to
`MessageLanguageStrip`** (SSOT — one strip algorithm). Read-only default: original + configured languages that
have content; **empty** when the post isn't translated for the viewer (Prisme rule 1), the same predicate
driving `ApiPost.isTranslated`. Wired into `FeedPostBuilder`/`FeedPostPresentation` (`languageStrip`, pure/
tested) and rendered in `FeedScreen` as an accent-coherent chip strip (flag + active native name in the
language colour), replacing the old binary "Translated" label. +15 tests (13 `PostLanguageStripTest`, +2
`FeedPostBuilderTest`); full `assembleDebug` + all-module `testDebugUnitTest` green, diff = `apps/android` only.
Next: interactive `includeTranslatable` arm for posts (tap absent language → on-demand request), the per-story
timeline strip, or persisted translations across cold start (§D "offline Prisme").

## Prior loop (Phase: Translation §D) — slice `chat-message-detail-explorer` ✅
**Per-message language explorer sheet** — the exhaustive Prisme view (iOS `MessageLanguageDetailView`). New
pure `:sdk-ui` `MessageDetailExplorer.build(...) → MessageLanguageExplorer` projects the original-language
banner + one row per explorable language: viewer's **configured** languages first (system → regional →
custom), then the remaining candidates (default `LanguageData.allLanguagesCommonFirst`) — preference-led, not
iOS's fixed 18-entry list. Each `LanguageExplorerRow` has a truncated preview, `hasContent`/`isTranslating`/
`isSelected` + `canRetranslate`. `ChatViewModel` surfaces the in-flight `translatingLanguages` set into state,
projects the model reactively into `ChatUiState.languageExplorer` (off a `latestMessagesFlow` mirror), reuses
`onFlagTap` for select/translate, and adds `onExplorerRetranslate` (force refetch even with content). Entry:
message-actions sheet → "Explore languages" → `MessageLanguageExplorerSheet` (accent-coherent, single-sheet
gesture). +31 tests (21 `MessageDetailExplorerTest`, +10 `ChatViewModelTest`); full `assembleDebug` +
all-module `testDebugUnitTest` green, diff = `apps/android` only.
Next: progressive **audio-voice translation** (`audio:translation-ready` → cloned-voice playback, needs
BubbleAudio UI), or the per-post translation strip.

## Prior loop (Phase: Translation §D) — slice `chat-compose-language-detection` ✅
**Source-language stamping from the composed text (Prisme §D).** `ChatViewModel.send()` stamped
`originalLanguage = user.systemLanguage ?: "fr"` — it ignored the resolution chain (regional/custom-only
users mis-stamped `fr`) and never inspected what was typed. New pure `:core:model`
`ComposeLanguageDetector.detect(text, fallback)` ports the shared web heuristic
(`apps/web/utils/language-detection.ts`: `detectLanguage` script/stopword scoring + `detectComposeLanguage`
guards — strip URLs, require ≥4 letters, best-score-or-fallback). `send()` now stamps
`detect(text, fallback = LanguageResolver.resolveUserLanguage(user))` (system → regional → custom → `fr`,
never device locale); result is always a `LanguageData`-supported code or the fallback. Forward path
untouched. +19 tests (17 `ComposeLanguageDetectorTest`, +2 `ChatViewModelTest`); full `assembleDebug` +
all-module `testDebugUnitTest` green, diff = `apps/android` only.
Next: the message detail explorer sheet (per-language translate/retranslate), or progressive **audio-voice
translation** (`audio:translation-ready` → cloned-voice playback, needs BubbleAudio UI).

## Prior loop (Phase: Translation §D) — slice `chat-on-demand-translate` ✅
**On-demand translation of an absent language** — makes the resolver's `RequestTranslation` arm live. The
inline strip now surfaces the viewer's configured content languages that lack content as **translatable
chips** (`LanguageChip.isTranslatable`, dimmed flag + "＋"), opt-in via `MessageLanguageStrip.build(...,
includeTranslatable)` (default false keeps the read-only projection byte-identical → every prior strip/builder
test green unchanged); `BubbleContentBuilder` opts in. New `:sdk-core` `MessageRepository.requestTranslation(
messageId, target)` blocking-translates the original text (`TranslationApi`), merges via
`MessageTranslationMerge`, no outbox (derived server truth); returns false (inert) on unknown/deleted/blank-
target/blank-result/network-fail/idempotent. `ChatViewModel` wires `RequestTranslation` → request → activate,
with an in-flight guard (no duplicate translate on a second tap). +19 tests (7 `MessageLanguageStripTest`, 1
`BubbleContentBuilderTest`, 7 `MessageRepositoryTest`, 4 `ChatViewModelTest`), `assembleDebug` +
sdk-ui/sdk-core/feature:chat unit tests green, diff = `apps/android` only.
Next: the full detail explorer sheet, or progressive **audio-voice translation** (`audio:translation-ready` →
cloned-voice playback, needs BubbleAudio UI).

## Prior loop (Phase: Chat §C) — slice `chat-typing-in-control` ✅
**Typing folded into the scroll-to-bottom control** — pure `:feature:chat`
`ScrollControlContent.of(affordance, typing)` SSOT (Hidden/Typing/Unread/Plain) with **typing taking priority
over the unread count** (iOS `ConversationScrollControlsView` rule); rendered as an accent `TypingPill`. The
`TypingLabel`→string mapping was extracted to a shared `typingLabelText` reused by the inline `TypingIndicator`
(DRY). Reuses the existing `TypingLabel`/`TypingParticipants` cores — no new roster logic. +10 tests,
`:feature:chat:testDebugUnitTest` green, diff = `apps/android` only.
Next: `chat-typing-header` (typing under the conversation title) or resume Profile/Settings §K/§L
(PROGRESS.md "Next").

## Prior loop (Phase: Settings §L) — slice `settings-notification-prefs-sync` ✅
**Offline-queued notification-preference backend sync** — wires the dead `OutboxKind.UPDATE_SETTINGS`/
`OutboxLanes.SETTINGS` end-to-end (mirrors `edit-profile-optimistic`). Pure `:core:model`
`NotificationPreferenceSyncBody.from(prefs)` (gateway `PATCH /me/preferences/notification` contract SSOT — all
30 fields, drops `extras`, `dndDays` as lowercase tokens); `core/network` `PreferencesApi`; `:sdk-core`
`NotificationPreferencesSyncRepository.enqueueSync` (session-gated, no optimistic flip — store is truth);
`OutboxCoalescer` `UPDATE_SETTINGS` latest-snapshot rule + `OutboxFlushWorker` sender; `SettingsViewModel`
local-first-then-sync funnel (persist → enqueue → wake worker on real `cmid`). +15 tests, `meeshy.sh check`
green, diff = `apps/android` only.

## Prior loop (Phase: Settings §L) — slice `settings-interface-language` ✅
**Persisted interface (UI chrome) language** — mirrors the theme slice one step further. Pure `:core:model`
`AppLanguage` SSOT (`supportedCodes` from `LanguageData.interfaceLanguages` fr/en/es/ar; `fromStorage`/
`storageValue` codec + `resolveInterfaceLocaleTag`; `"system"`/blank/absent/unsupported → `null` = follow
device). Durable DataStore-backed `InterfaceLanguageStore` (`:sdk-core`: `InMemoryInterfaceLanguageStore` +
`DataStoreInterfaceLanguageStore`, hydrates on cold start via `stateIn(Eagerly)`, `@Singleton` in `SdkModule`).
`SettingsViewModel` `setInterfaceLanguage` intent + `SettingsScreen` display-language dialog picker (System +
flags/native names, EN/FR/ES/PT); `MainActivity` re-localises the whole Compose tree live via `LanguageViewModel`
+ a `createConfigurationContext` provider (minSdk-26 safe, no AppCompat). Regional-language row left no-op on
purpose (Prisme content-preference, not app locale). +32 tests (`AppLanguageTest` 18, `InterfaceLanguageStoreTest`
9, `SettingsViewModelLanguageTest` 5). Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle
8.14.3). Diff = `apps/android` only. See PROGRESS.md run log.

### Next
1. **Notification-preference toggles** (§L) — back the `settings_push_notifications` switch (today ephemeral
   `remember` state) with the local-first user-preference store; `UserNotificationPreferences` already exists.
   Same pure-codec + DataStore-store + ViewModel-intent shape.
2. **Regional (content) language preference** (§L) — the still-no-op `settings_regional_language` row; wire it
   through the Prisme *content*-preference / profile path (`LanguageResolver`, optimistic+offline), NOT the
   interface `InterfaceLanguageStore`.
3. Or the tracked **worker drain-list Robolectric test**, or pivot back to **Calls §H** platform-glue.

## Prior loop (Phase: Contacts / outbox hardening) — slice `outbox-lane-map-ssot` ✅
Structural close of the **lane-in-drain-list gotcha** (NOTES 2026-07-04). The `OutboxFlushWorker`
kept a hand-maintained `listOf(...)` of shared lanes to drain, disjoint from the `buildSenders()`
kind→sender registry — a kind could have a sender yet be stranded off the drain list (the BLOCK/FRIEND
bug). This slice makes that impossible: a pure `OutboxLaneMap` (`:sdk-core` `outbox/OutboxModel.kt`)
is the SSOT `OutboxKind → OutboxLaneAssignment` (`PerConversation` | `Shared(lane)`, exhaustive `when`),
and the worker now drains the **derived** `OutboxLaneMap.sharedDrainLanes` (deduped, stable enum order).
Also drops the always-empty `PRESENCE`/`SOCIAL` lanes (no kind maps there) — behaviour-preserving.
+9 pure tests. Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle 8.14.3). Diff =
`apps/android` only (2 prod + 1 test). See PROGRESS.md run log.

### Next
1. **Mood-emoji presence** on friend rows — note: iOS sources it from a separate `StatusViewModel`
   (user mood-status system), so this needs that status feature first (larger, dependency-heavy). The
   **send compose-new UI** (dedicated user-search → connect surface) is the other Contacts gap.
2. Then Profile & Account (§K) or back to Calls platform glue (ConnectionService/WebRTC).

## Prior loop (Phase: Contacts) — slice `presence-away-indicator` ✅
The **three-state presence dot** on the Contacts friend row (iOS parity — `UserPresence.state`).
The `:core:model` `PresenceState`/`UserPresence` were dead code; this slice makes them live. Pure
`UserPresence.state(nowEpochMillis)` is the SSOT: offline → no dot, online → green, online-but-idle
> 5min (300s, iOS parity) → amber **away**; a null/blank/unparseable `lastActiveAt` stays online, an
exactly-at-threshold or future timestamp stays online. Backed by a new nullable
`isoToEpochMillisOrNull` (distinguishes "no reliable timestamp" from the epoch instant — `isoToEpochMillis`
now delegates to it) and the `FriendRequestUser.presenceState(now)` adapter (nullable `isOnline` → offline).
The friend row renders green/amber/none via a pure `presenceDotColor` mapping. +23 tests (8 IsoTime,
10 Presence, 5 FriendPresence). Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle
8.14.3). Diff = `apps/android` only (4 prod + 3 test). See PROGRESS.md run log.

### Next
1. **Mood-emoji presence** on friend rows (last remaining Contacts-list display gap), or the **send
   compose-new UI** (dedicated user-search → connect surface), or the **worker drain-list test** (Robolectric).
2. Then Profile & Account (§K) or back to Calls platform glue (ConnectionService/WebRTC).

## Prior loop (Phase: Contacts) — slice `contacts-filter-counts` ✅
The **per-filter chip counts** on the Contacts list (iOS parity — "All/online chips show counts").
Pure `:core:model` `ContactList.counts(friends, query) → ContactFilterCounts` (all/online/offline sizes
under the active search; online+offline partition all by construction) is the SSOT, exposed on
`ContactsListUiState.filterCounts` and rendered as a `label  count` badge on each chip via
`ContactFilterCounts.forFilter`. **Surpasses iOS**, whose counts ignore the search field. +7 tests
(6 model, 1 VM). `:core:model` + `:feature:contacts` `testDebugUnitTest` + `:app:assembleDebug` green
(system Gradle 8.14.3). Diff = `apps/android` only. See PROGRESS.md run log.

## Prior loop (Phase: Contacts) — slice `contacts-friends-room-cache` ✅
The **friends Room cache for cold-start paint** (iOS `CacheCoordinator.friends`) — the Contacts tab
now paints the last-known friend list instantly on cold launch, surviving process death and working
offline, instead of blocking on the received/sent fetch behind a skeleton. `:core:database`
`FriendEntity`/`FriendDao` (DB v7→8; `sortIndex` preserves `ContactList`'s assembled order verbatim so
the ordering SSOT stays in `:core:model`), `:sdk-core` `FriendListRepository` (`cachedSnapshot` — cold
vs synced-empty via `sync_meta` — + `persist` write-through), and `ContactsListViewModel` rewired
cache-first (paint-from-cache → revalidate → write-through; unfriend prunes and writes through with no
refetch). +14 tests. Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle 8.14.3; wrapper
8.11.1 dist is 403-blocked — see NOTES). Diff = `apps/android` only. See PROGRESS.md run log.

### Next
1. **Suggestions Room cache** for the Discover empty-query suggestions (iOS `CacheCoordinator.userSearch`)
   — the last in-memory-only cache gap; copy the `FriendListRepository` template. Or the **send
   compose-new UI** (dedicated user-search → connect surface).
2. Then Profile & Account (§K) or back to Calls platform glue (ConnectionService/WebRTC).

## Prior loop (Phase: Calls) — slice `call-ended-identity-teardown` ✅
The **identity-aware active-call teardown** — bug fix closing the `call-ended-signal-identity` follow-up.
The gateway fans `call:ended` out to every member USER room, so a busy user (active call + a waiting-call
banner) received the *waiting* call's teardown on the identity-less `events` stream, which the VM folded
blindly into the *active* FSM — tearing down the wrong call. Teardown is now identity-gated end-to-end.
- `core:model` `CallSignalMapper.map` returns `null` for `call:ended`/`call:missed` (off the FSM-facing
  stream). New pure `endedSignal(): CallEndedSignal?` (id + `RemoteHangUp`/`RingTimeout`) is the sole
  teardown decode; blank/absent id or malformed → `null`. New pure `CallEndedSignal(callId, event)`.
- `sdk-core` `CallSignalManager.endedCalls: SharedFlow<CallEndedSignal>` (was `String`) — `listen` routes
  teardown frames through `endedSignal` only.
- `feature:calls` `CallViewModel.onRemoteEnded(CallEndedSignal)` — active id → `dispatch(event)` (FSM
  teardown); waiting id → `RemotelyEnded` (dismiss banner, no `emitEnd`); neither → inert.
- Red→green tests across all three modules (mapper inert + 11 `endedSignal` cases; manager events-silent +
  rich endedCalls; VM active-end / waiting-untouched / missed-ringing / neither-inert / idle-inert). Full
  `assembleDebug` + all `testDebugUnitTest` green (via `/opt/gradle`; wrapper dist is 403-blocked — see
  NOTES). Diff = `apps/android` only (3 prod + 3 test + docs).

### Next
1. Real self-managed `ConnectionService`/`PhoneAccount` + full-screen call UI + foreground service (swaps
   the `LogTelecomCallReporter` `@Binds`); then WebRTC media transport (`stream-webrtc-android`).
2. Follow-up: `SocketManager.reconnectWithToken()` still has no caller (token-refresh re-attach slice).

## Prior loop (Phase: Calls) — slice `incoming-call-deeplink` ✅
The **incoming-call deep-link** — consumes the `MainActivity` launch/full-screen intent extras and routes
them into the NavHost, so a ring tap actually opens the incoming-call screen.
- `:app` pure `LaunchRouter.route(LaunchExtras) → String?` (SSOT): non-blank `callId` → `CallRoute.incoming`
  (call push wins; `isOutgoing=false` + server id ⇒ answerable ring); else non-blank `conversationId` →
  `Routes.chat` (shared message-tap path); else `null`.
- `CallRoute` refactored to a **static `call` path + all-optional query args** (a blank room / peer name
  can never collapse a required path segment → no `navigate()` crash). Added `incoming(...)` +
  `config(callId, incoming)`; outgoing/`redial` behaviour preserved.
- `:app` glue: `MeeshyApp(launchRoute, onLaunchRouteConsumed)` navigates via a `LaunchedEffect` once the
  graph is live + authenticated, then marks consumed; `MainActivity` extracts extras in `onCreate` +
  `onNewIntent`.
- +14 behavioural tests (8 router, 6 route). `assembleDebug` + all `testDebugUnitTest` green.
  Diff = `apps/android` only (6 files; MeeshyApp/MainActivity glue is exempt platform code).

## Prior loop (Phase: Calls) — slice `incoming-call-push-decision` ✅
The **pure incoming-call push decision core** — the brick before the Android Telecom/`ConnectionService`
full-screen-intent plumbing. When the app is backgrounded/killed the socket is down, so the gateway
delivers the ring as a data-only FCM push; this slice is the typed shape + gating that wiring consumes.
- `core:model` `me.meeshy.sdk.model.call.IncomingCallPush` — typed FCM `data`-map / VoIP payload at
  parity with the gateway `CallEventsHandler` (`type:"call"`) + `PushNotificationService` (`type:"voip_call"`):
  `callId`/`conversationId`/`callerUserId`/`callerName`/`isVideo`(string flag)/`iceServers`(JSON) + a
  blank-skipping `displayName`.
- `IncomingCallPushParser.parse(Map<String,String>) → IncomingCallPush?` — total, side-effect-free: a call
  iff `type ∈ {call,voip_call}` AND non-blank `callId`; leniently decodes `iceServers` (missing/malformed
  → `[]`, never drops the push); blank optionals → null.
- `SeenCallRing` — immutable pure port of the iOS `VoIPDedupRing` (capacity 24 / ttl 30s):
  `contains`/`insert`/`remove`, expiry-pruning + capacity-trimming, every mutation returns a new ring.
- `IncomingCallDecider.decide(push, context) → IncomingCallDecision` (`Ring` | `Ignore(reason:
  DUPLICATE/BUSY/SELF_INITIATED)`) — faithful to the iOS `VoIPPushManager`/`reportIncomingVoIPCall`
  ordering: self-fanout → duplicate (active-or-seen) → busy → ring.
- +39 behavioural tests (18 parser, 11 ring, 10 decider). `assembleDebug` + all `testDebugUnitTest` green.
  Diff = `apps/android` only (4 files, 0 production logic outside android).

## Prior loop (Phase: Calls) — slice `realtime-session-coordinator` ✅
The app-level socket-lifecycle caller — turns the whole realtime layer live. `:sdk-core` pure
`RealtimeLifecyclePlan.commandsFor(was, is)` + `@Singleton RealtimeSessionCoordinator`; `AuthViewModel`
drives it at init/login/logout. +16 tests. Diff = `apps/android` only.

## Prior loop (Phase: Calls) — slice `call-initiate-ack` ✅
The ACK-based `call:initiate` — mints the real server `callId` (+ mode / ICE servers / ttl). `core:model`
`SocketIceServer`/`CallInitiateAck`/`CallInitiateResult`/`CallInitiateAckParser`; `:sdk-core`
`CallSignalManager.emitInitiate(conversationId, isVideo)`. +26 tests. Diff = `apps/android` only.

## Prior loop (Phase: Calls) — slice `call-history-list` ✅
The recent/missed-calls **list UI** (`:feature:calls`) over the cache-first journal — pure
`CallHistoryList` + `CallTimeLabel`, UDF `CallHistoryViewModel` (SWR, missed filter, cursor paging,
pull-to-refresh), accent-coherent `CallHistoryScreen`. +30 tests. Diff = `apps/android` only.

## Prior loop (Phase: Calls) — slice `call-history-repository` ✅
The REST + Room cache-first layer under the call journal. `:core:network` `CallHistoryApi`
(`GET calls/history?cursor&limit&filter` → `ApiResponse<List<CallRecord>>`, wired into `MeeshyApi` +
`NetworkModule`); `:core:database` `CallHistoryEntity`/`CallHistoryDao` (DB **v6→v7**, destructive
fallback) + `DatabaseModule` provider; `:sdk-core` `CallHistoryCacheSource` (Room-backed
`SwrCacheSource`, port of `StoryCacheSource`) + `CallHistoryRepository` — cache-first `historyStream()`
(`CachePolicy.CallHistory` fresh 60s / keep 90d), `refresh()`, and cursor-paginated
`fetchPage(cursor, limit, missedOnly) → CallHistoryPage(records, nextCursor, hasMore)`. +17 tests,
`meeshy.sh check` green, diff = `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. The `initiate`-ACK slice (call-id lifecycle) → fold `CallSignalManager.events` into `CallViewModel`.
2. Calls-tab navigation wiring (`:app`) for `CallHistoryScreen`.
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.
