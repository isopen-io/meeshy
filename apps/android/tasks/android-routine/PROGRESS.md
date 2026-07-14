# Progress — state & what to do next

> On 2026-07-14 **conversation media gallery per-page author/date header** landed (slice
> `chat-gallery-page-header`, feature-parity §C — the just-shipped conversation-wide fullscreen gallery
> paged across every image with a per-page caption (`chat-gallery-page-caption`) but showed **no author or
> date**, a visible divergence from iOS `ConversationMediaGalleryView`, whose bottom chrome renders each
> media's **sender name + `sentAt`** ABOVE the message-content caption. This slice ports that author line).
> Extends the pure `:feature:chat` `GalleryPage(url, caption)` with `senderName`/`createdAtIso` resolved
> from the **owning message** (`message.senderName?.trim()?.ifBlank { null }`,
> `message.createdAtIso?.trim()?.ifBlank { null }` — a blank/absent value yields `null` = no line, never a
> blank string), and reshapes `ConversationGallery` with derived `senderNames`/`createdAtIsos` positionally
> aligned with `imageUrls` (so every image of a multi-image message shares its message's author/date, and a
> deleted message contributes none — exactly the iOS `captionMap` keying). **Wired for real (no dead ends):**
> `MeeshyImageViewer` gained optional `authors`/`timestamps: List<String?> = emptyList()` (opaque strings —
> the agnostic `:sdk-ui` block never learns *what* an author/date is); its bottom overlay became a `Column`
> that renders a discreet header line (`author  ·  timestamp`, `labelLarge` white, 1 line ellipsised)
> ABOVE the existing caption, sharing one `Black@0.45` scrim + `navigationBarsPadding`, hidden while
> pinch-zoomed. `ChatScreen` passes `authors = gallery.senderNames` and formats each page's `createdAtIso`
> into the discreet **relative** label via the reused `RelativeTimeFormat.short` + `rememberRelativeTimeStrings`
> + `isoToEpochMillisOrNull` (no new strings — same formatter as the conversation/notification rows),
> `remember`ed per gallery so it never re-formats on recomposition. **+13 tests** on the new derived lists
> (sender→author; blank→null; whitespace-only→null; trimmed; multi-image shares one author; createdAt→
> timestamp; blank createdAt→null; trimmed createdAt; positional alignment of BOTH lists with `imageUrls`
> across messages incl. a null middle message; deleted message contributes neither; both lists always ==
> `imageUrls` length; empty gallery→neither). **Mutation check (RED proof):** forcing `senderName`/
> `createdAtIso` to `null` failed **exactly 7** presence tests (author, trimmed author, multi-image author,
> createdAt, trimmed createdAt, positional, deleted), the 6 null-expecting/length/empty tests stayed green —
> reverted green, the suite is behavioural not tautological. **Verification:** `:feature:chat` gallery suite
> green (33 tests) + full `gradle assembleDebug testDebugUnitTest` across every module → APK produced,
> `:feature:chat`/`:sdk-ui` all green (viewer Column + ChatScreen relative-label glue compile, no module
> regressed). The one red in the sweep was the **pre-existing flaky** `:sdk-core`
> `MediaDownloadPreferencesStoreTest.dataStore_setPreferences_isReflectedInTheFlow` (a DataStore StateFlow
> 15s timeout under parallel load) — a module this diff does not touch; it **passes green in isolation**.
> Env note: built with the container's system Gradle 8.14.3 + the documented UTF-8-daemon recipe
> (`LANG=C.utf8` + `-Pkotlin.daemon.jvmargs=-Dsun.jnu.encoding=UTF-8`) since the wrapper distribution is
> egress-blocked. Reviewer **PASS** (diff `apps/android` only — `:feature:chat` [`ConversationMediaGallery`
> model+builder, `ChatScreen` viewer wiring + relative-label formatting], `:sdk-ui` [`MeeshyImageViewer`
> header overlay], tests, `feature-parity.md`, routine docs; **SDK purity** — the "author/date = owning
> message's sender/sentAt" rule is a pure `:feature:chat` atom, the viewer stays an agnostic opaque-string
> renderer; **SSOT** — reuses `BubbleContent.senderName`/`createdAtIso` + `RelativeTimeFormat`/
> `isoToEpochMillisOrNull`, nothing re-implemented; **instant-app** — pure fn, no state, gallery build path
> unchanged; **UX coherence** — discreet bottom author line at iOS parity above the caption, one shared
> scrim, auto-hidden in zoom; **no coverage floor lowered, no test weakened**). **Next slice:** save-to-gallery
> (`MediaStore` insert on a viewer action), neighbour prefetch ±2 (Coil `ImageLoader.enqueue`), or the still-
> pending message-bubble **contact** attachment (scope the DTO first).

> On 2026-07-13 **conversation media gallery per-page caption** landed (slice `chat-gallery-page-caption`,
> feature-parity §C — the just-shipped conversation-wide fullscreen gallery (`chat-conversation-media-gallery`)
> paged across every image but showed only a bare `n / total` counter, no context. iOS
> `ConversationMediaGalleryView` keeps a `captionMap: [attachmentId: String]` (message content / attachment
> caption) and renders the current media's caption as a bottom overlay under the author info. This slice ports
> the caption half). Ships the pure `:feature:chat` `GalleryPage(url, caption)` and reshapes
> `ConversationGallery` to carry `pages: List<GalleryPage>` (with derived `imageUrls`/`captions`/`isEmpty` so
> every existing caller and test keeps its public surface). `ConversationMediaGallery.of` now resolves each
> page's caption from the **owning message's Prisme-resolved `BubbleContent.text`** — trimmed, `null` when
> blank — so a media-only message shows no overlay and every image of a multi-image message shares that one
> caption (exactly iOS's `captionMap` keying every attachment of a message to the message body). **Wired for
> real (no dead ends):** `MeeshyImageViewer` gained an optional `captions: List<String?> = emptyList()`
> (opaque strings — the agnostic `:sdk-ui` building block never learns *what* a caption is) and renders the
> current page's non-blank caption as a bottom-anchored overlay (scrim `Black@0.45`, `navigationBarsPadding`,
> centred `bodyMedium` white, `maxLines = 4` ellipsised), hidden while the page is pinch-zoomed so it never
> fights the image; `ChatScreen` passes `gallery.captions`. **+10 tests** on `.captions` (text→caption;
> blank→null; whitespace-only→null; trimmed; multi-image shares one caption; positional alignment with
> `imageUrls` across messages incl. a blank middle message→null; deleted message contributes none; length
> always == `imageUrls`; empty gallery→no captions) + the existing `ChatViewModelTest` equality updated to the
> new `pages`/`GalleryPage` shape (not weakened — still asserts full gallery incl. `startIndex`). **Mutation
> check (RED proof):** forcing `caption = null` failed exactly the 5 caption-*presence* tests (text, trimmed,
> multi-image, positional, deleted), the 5 null-expecting tests stayed green as they should — reverted green,
> the suite is behavioural. **Verification:** `:feature:chat:testDebugUnitTest` full suite green (520 tests) +
> `:sdk-ui:compileDebugKotlin` + `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced, viewer glue
> compiles, no module regressed). Env note: no Android CI + the wrapper's Gradle 8.11.1 distribution download
> is org-egress-blocked (github releases 403); built with the container's system Gradle 8.14.3 (`/opt/gradle`)
> online so Maven artifacts resolve — same tasks, same result. Reviewer **PASS** (diff `apps/android` only —
> `:feature:chat` [`ConversationMediaGallery` model+builder, `ChatScreen` 1 line], `:sdk-ui` [`MeeshyImageViewer`
> caption overlay], tests, `feature-parity.md`, routine docs; **SDK purity** — the "caption = message text"
> rule is a pure `:feature:chat` atom, the viewer stays an agnostic opaque-string renderer; **SSOT** — reuses
> the already-Prisme-resolved `BubbleContent.text`, nothing re-parsed; **instant-app** — pure fn, no state,
> gallery build path unchanged; **UX coherence** — discreet bottom caption at iOS parity, scrim for legibility,
> auto-hidden in zoom; **no coverage floor lowered, no test weakened**). **Next slice:** the gallery's author/
> date header per page (iOS shows sender avatar + name + `sentAt` above the caption — extend `GalleryPage`
> with `senderName`/`createdAtIso`), save-to-gallery (`MediaStore`), neighbour prefetch ±2 (Coil
> `ImageLoader.enqueue`), or the still-pending message-bubble **contact** attachment (scope the DTO first).

> On 2026-07-13 **notification-row relative timestamp** landed (slice `notifications-row-relative-time`,
> feature-parity §M/§Q — the notification row previously rendered its arrival time as the *raw absolute
> short date-time* (`shortDateTimeLabel(notification.state.createdAt)`, e.g. "7/13/26, 6:56 AM"), a visible
> divergence from iOS `NotificationRowView`, whose trailing `timestampView` shows
> `RelativeTimeFormatter.shortString(for: notification.createdAt)` — the discreet "5 min" / "2 h" / "3 j"
> relative label. Ships pure `:feature:notifications` `NotificationRowTime.epochMillis(notification)` — the
> SSOT that resolves *which* instant the row formats: the notification's **arrival** time
> (`state.createdAt`, the Android nesting of iOS's top-level `notification.createdAt`), parsed through the
> `isoToEpochMillisOrNull` SSOT so a blank/malformed value returns `null` (the row then shows **no label**
> rather than the previous garbled raw string) and a legitimate unix-epoch instant (0L) is kept, not
> mistaken for "absent". **Wired for real (no dead ends):** the row's trailing timestamp `Text` became a
> null-guarded `notificationRowRelativeTime(notification)?.let { … }` rendering the discreet relative label
> via the reused `:sdk-ui` `RelativeTimeFormat.short` + `rememberRelativeTimeStrings` (the `time_relative_*`
> resources already shipped for the feed/conversation rows) — **no new strings**, the `rememberRelativeTimeStrings`
> read kept before the early return so the composable-call graph stays unconditional. This is the exact
> pattern of the just-shipped `conversations-row-relative-time` slice, applied to the notification surface.
> **+5 tests** on `NotificationRowTime.epochMillis` (arrival-instant from `state.createdAt`; whole- vs
> fractional-second parse parity; blank→null so the row shows no timestamp; unparseable→null; unix-epoch
> instant preserved as 0L not treated as absent). **Mutation check (RED proof):** collapsing the resolver to
> a constant `0L` failed exactly 3 tests (arrival-instant, blank→null, unparseable→null), reverted green —
> the suite is behavioural, not tautological. **Verification:** `:feature:notifications:testDebugUnitTest`
> full suite green + full `gradle assembleDebug testDebugUnitTest` across every module → **BUILD SUCCESSFUL**
> (2m5s, APK produced, notifications Compose glue compiles, no module regressed; the flaky
> `:sdk-core:compileDebugUnitTestKotlin` em-dash/`sun.jnu.encoding` failure surfaced once on a POSIX daemon
> and was cleared by the documented UTF-8-daemon recipe — `--stop` + `LANG=C.utf8` +
> `-Pkotlin.daemon.jvmargs`). Reviewer **PASS** (diff `apps/android` only — `:feature:notifications` [new
> `NotificationRowTime.kt` + test, `NotificationsScreen` 2 import swaps + `notificationRowRelativeTime`
> helper + trailing-timestamp null-guard], `feature-parity.md`, routine docs; no production logic outside;
> **SDK purity** — the "which instant does the row format" rule is a pure `:feature:notifications` atom
> [product orchestration], the pure formatter stays the agnostic `:sdk-ui` building block; **SSOT** —
> parsing via `isoToEpochMillisOrNull`, thresholds/wording via `RelativeTimeFormat.short` — nothing
> re-implemented; **instant-app** — pure fn, no state, list cache path unchanged; **colour/UX coherence** —
> no colour change, replaces a jarring absolute stamp with the discreet Prisme relative label at iOS parity;
> **no coverage floor lowered, no test weakened**). **Next slice:** wire the short formatter into the
> friend-request "requested X ago" line (long form on the contacts surface), port the `context.postCreatedAt`
> "content published" subtitle via a `NotificationDateFormatter` port, or resume the media-wiring hints below.

> On 2026-07-13 **notification-row per-type accent colour** landed (slice `notifications-type-accent-color`,
> feature-parity §M — the notification list previously rendered EVERY row in the brand indigo (`Indigo500`
> hardcoded on the unread background tint, the unread dot, and the avatar), a flat, category-blind surface vs
> iOS `NotificationRowView` which colour-codes each row by `notifType.accentHex`). Ships the pure `:core:model`
> SSOT `notificationTypeAccentHex(type: String): String` — a faithful port of iOS
> `MeeshyNotificationType.accentHex` that maps all ~80 backend `type` strings (both the lowercase current form
> AND the historical uppercase alias the gateway still emits for some events) onto the 10 category colours: blue
> messages/replies/lifecycle (`3498DB`), coral reactions/likes (`FF6B6B`), purple mentions/reposts (`9B59B6`),
> teal friend-graph/conversation (`4ECDC4`), gold community/membership/achievements (`F8B500`), pink calls
> (`E91E63`), green affiliate (`2ECC71`), red security (`EF4444`), cyan translation/voice (`08D9D6`), and brand
> indigo system+friend-new (`6366F1`) — with `else -> "6366F1"` reproducing iOS's `rawValue ?? .system` collapse
> so an unknown/absent type is never a crash or a blank, just the brand fallback. Keyed on the raw string (not
> the enum) because the row holds `notification.type: String` and the `MeeshyNotificationType` enum was
> declared-but-unused — one pure function, no 80-entry enum churn, same colours. **Wired for real (no dead
> ends):** `NotificationsScreen`'s row computes `val accent = hexColor(notificationTypeAccentHex(notification.type))`
> once and drives the unread background tint (`accent.copy(alpha = 0.12f)`, intensity unchanged — only the hue
> now varies by category), the unread dot, and the avatar `containerColor` — matching iOS's `accentColor` on all
> three. **+14 tests** on `notificationTypeAccentHex` (each of the 10 colour families via a representative;
> legacy-uppercase↔lowercase equality for 8 aliases so a row never flips accent by wire-form age; unknown-type→
> indigo; empty-type→indigo; and a `distinct categories never collapse onto one colour` set-size guard that
> catches any future typo merging two families). **Mutation check (RED proof):** collapsing the coral group into
> blue failed exactly 2 tests (`coral family` + `distinct categories`), reverted green — the suite is
> behavioural, not tautological. **Verification:** `:core:model:testDebugUnitTest` +
> `:feature:notifications:testDebugUnitTest` full suites green + `:app:assembleDebug` → **BUILD SUCCESSFUL**
> (5m5s, APK produced, notifications Compose glue compiles, no module regressed). Reviewer **PASS** (diff
> `apps/android` only — `:core:model` [new `NotificationAccent.kt` + test], `:feature:notifications`
> [`NotificationsScreen` 3 imports + accent derivation + 3 call-site swaps], `feature-parity.md`, routine docs;
> no production logic outside; **SDK purity** — pure stateless `type → hex` mapping in `:core:model` alongside
> the enum it ports, no Compose/singletons, the row does the `hexColor` bridge app-side; **SSOT** — colour
> pipeline reuses `hexColor`, mapping owned once; **instant-app** — pure fn, no state, list cache path
> unchanged; **colour/UX coherence** — per-category accent replaces flat indigo, exactly the iOS row semantics,
> Prisme-discreet 0.12 tint intensity preserved; **no coverage floor lowered, no test weakened**). **Next
> slice:** port the companion `MeeshyNotificationType.systemIcon` → per-type leading icon (iOS row draws a
> category glyph badge on the avatar), wire the short relative formatter into the notification-row *arrival*
> timestamp (currently raw `shortDateTimeLabel`, iOS uses `RelativeTimeFormatter.shortString`), or add the
> `context.postCreatedAt` "content published" subtitle via a `NotificationDateFormatter` port.

> On 2026-07-13 **conversation-row relative timestamp** landed (slice `conversations-row-relative-time`,
> feature-parity §B/§Q — the highest-value consumer of the just-shipped short relative-time renderer: the
> conversation list rows previously showed **no timestamp at all**, a visible gap vs iOS
> `ThemedConversationRow`, which renders `RelativeTimeFormatter.shortString(for: conversation.lastMessageAt)`
> on the trailing edge above the unread badge). Ships pure `:feature:conversations`
> `ConversationRowTime.epochMillis(conversation)` — the SSOT that resolves *which* instant a row shows: the
> **last message's `createdAt`** (the true "last activity"), else the conversation's **`updatedAt`**, else its
> **`createdAt`**; each candidate parsed through the `isoToEpochMillisOrNull` SSOT so a blank/malformed value
> transparently falls through to the next rung rather than blanking the row, a legitimate unix-epoch instant
> (0L) is kept (not mistaken for absent), and `null` (nothing parseable) renders **no label** (a brand-new
> conversation with no activity is clean, not a placeholder). **Wired for real (no dead ends):** the row's
> trailing element became a `Column` (timestamp above the unread badge) rendering the discreet relative label
> ("5 min", "2 h", "3 j") via the reused `:sdk-ui` `RelativeTimeFormat.short` + `rememberRelativeTimeStrings`
> (the `time_relative_*` resources already shipped for the feed) — **no new strings**. **Colour follows unread
> state at iOS parity** (`ThemedConversationRow.timestampColor`): error when `unreadCount > 0`, else the
> conversation's deterministic `accentColor` — accent-coherent, semantic on unread. **+10 tests** on
> `ConversationRowTime.epochMillis` (last-message-preferred; updatedAt-when-no-lastMessage; updatedAt-when-
> lastMessage-has-no-createdAt; createdAt-final-fallback; blank-lastMessage→updatedAt; unparseable-lastMessage
> →updatedAt; unparseable-updatedAt→createdAt; null-when-none; null-when-all-unparseable; unix-epoch-is-valid).
> **Two-mutation RED check:** swapping the resolution order (updatedAt before lastMessage) failed exactly 2
> tests; dropping the `createdAt` final fallback failed exactly 2 tests; both reverted green. **Verification:**
> `:feature:conversations:testDebugUnitTest` full suite green + `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK
> produced, conversation-list Compose glue compiles, no module regressed). Reviewer **PASS** (diff `apps/android`
> only — `:feature:conversations` [new `ConversationRowTime.kt` + test, `ConversationListScreen` trailing-column
> wiring + `@Composable conversationRowRelativeTime` helper], `feature-parity.md`, routine docs; no production
> logic outside; **SDK purity** — the instant-resolution rule is a pure `:feature:conversations` atom [product
> orchestration, "which timestamp does a row show"], the pure formatter stays the agnostic `:sdk-ui` building
> block; **SSOT** — parsing via `isoToEpochMillisOrNull`, thresholds via `RelativeTime.classify`, colour via
> `accentColor` — nothing re-implemented; **instant-app** — pure fn, no state, list cache path unchanged;
> **colour/UX coherence** — accent-coherent, semantic error on unread, discreet Prisme framing; **no coverage
> floor lowered, no test weakened**). **Next slice:** wire the short formatter into the **notification-row**
> timestamps (same pattern, `:feature:notifications`), the friend-request "requested X ago" line (long form on
> the contacts surface), or resume the media-wiring / carousel-contact-attachment hints below.

> On 2026-07-13 **relative-time long rendering layer** landed (slice `time-relative-long-format-strings`,
> feature-parity §Q — the *long/detail-surface* rendering half, companion to the just-landed short renderer;
> the consumer the `RelativeTimeLongFormat.label` → `RelativeTimeLongLabel` classifier was waiting for so it
> stops being dead code). Ships pure `:sdk-ui/format` `RelativeTimeLongText.long(epochMillis, referenceMillis,
> zone, locale, strings)` + the `RelativeTimeLongStrings` template bundle — the view-layer wording atop the
> pure calendar-day ladder. Faithful to the iOS `RelativeTimeFormatter.longString` detail form (`maintenant /
> il y a 45s / il y a 5 min / hier / il y a 3j / il y a 2sem / il y a 2mois / date`). **Thresholds are NOT
> re-implemented:** `long` delegates to `RelativeTimeLongFormat.label` (the SSOT) — the `Yesterday` special
> case, the zone-aware calendar-day boundaries, and the future/skew→`Now` collapse are all *inherited*; it only
> maps the returned rung to its localized template. Localized strings are **injected as parameters** (the
> `CallTimeLabel`/`RelativeTimeStrings` pattern) so the formatter has zero Android dependency and is 100%
> JVM-testable; a `@Composable rememberRelativeTimeLongStrings()` binds the `time_relative_long_*` resources
> (EN/FR/ES/PT). **SSOT for the absolute-date rung:** this slice **extracted** the previously-private
> absolute-date rendering out of `RelativeTimeFormat` into a shared internal `formatAbsoluteDate` that *both*
> the short and long formatters now call — so an "older than three months" instant can never read differently
> between the two surfaces (pinned by a cross-formatter equality test). **Wired for real (no dead ends):** the
> **profile-header "last seen" line** now renders the discreet long relative label ("Vu il y a 5 min", "Vu
> hier", "Last seen 3 d ago") beneath the handle. The *when-to-show* rule is baked into the pure, tested
> builder rather than the Composable: `ProfileHeaderBuilder.lastSeenEpochMillis` is **null for an ONLINE user**
> (the live presence dot speaks — no stale line) and carries the parsed `lastActiveAt` epoch for AWAY/OFFLINE
> (null too when absent/unparseable). **+18 tests** — 13 on `RelativeTimeLongText` (under-30s→now; future/skew→
> now; 45s; 5min; same-day 2h; late-evening-seen-next-morning→yesterday-not-hours; 3d; 2wk; 2mo; >3mo same-year
> →date w/o year; >3mo prior-year→date w/ year; substitution uses the real value [7min vs 11min]; the cross-
> formatter absolute-date equality) + 5 on `ProfileHeaderBuilder.lastSeenEpochMillis` (online→null; away→epoch;
> offline→epoch; absent→null; unparseable→null). **Two-mutation RED check:** `Yesterday→now` template failed
> exactly the yesterday test; dropping the builder's `takeIf { presence != ONLINE }` failed exactly the online→
> null test; both reverted green. **Verification:** `:sdk-ui` + `:feature:profile` `testDebugUnitTest` full
> suites green, then `:app:assembleDebug testDebugUnitTest` across every module → **BUILD SUCCESSFUL** (APK
> produced, profile Compose glue compiles, no module regressed — no flaky `:sdk-core` failures this run).
> Reviewer **PASS** (diff `apps/android` only — `:sdk-ui` [new `RelativeTimeLongText.kt` +
> `RelativeTimeLongStringsCompose.kt` + test, extracted `AbsoluteDateFormat.kt`, `RelativeTimeFormat` refactor
> to reuse it, `time_relative_long_*` strings ×4 locales], `:feature:profile` [`ProfileHeaderPresentation`
> +`lastSeenEpochMillis` field + builder derivation, `ProfileScreen` last-seen subtitle, `profile_last_seen`
> strings ×4, fixture +field], `feature-parity.md`, routine docs; no production logic outside; **SDK purity** —
> pure formatter takes opaque injected strings, stays agnostic → `:sdk-ui` building block; the "when to render
> last-seen" orchestration stays app-side in the profile builder; **SSOT** — thresholds owned once by
> `RelativeTimeLongFormat`, absolute-date owned once by `formatAbsoluteDate`, both reused not duplicated;
> **UDF/instant-app** — pure fn, no state, profile cache path unchanged; **colour/UX coherence** — no colour
> change, discreet Prisme framing; **no coverage floor lowered, no test weakened**). **Next slice:** wire the
> *short* formatter into the conversation-row / notification-row timestamps, the friend-request "requested X
> ago" line (long form on the contacts surface), or resume the media-wiring hints below.

> On 2026-07-13 **relative-time short rendering layer** landed (slice `time-relative-format-strings`,
> feature-parity §Q — the *rendering half* of the relative-time SSOT, the consumer the two prior pure
> classifiers (`RelativeTime.classify`, `RelativeTimeLongFormat.label`) were waiting for so they stop being
> dead code). Ships pure `:sdk-ui/format` `RelativeTimeFormat.short(epochMillis, referenceMillis, zone,
> locale, strings)` + the `RelativeTimeStrings` template bundle — the view-layer wording atop the pure ladder.
> The thresholds are **not re-implemented**: `short` delegates to `RelativeTime.classify` (the SSOT) and only
> maps the returned `RelativeTimeUnit` rung to its localized template, so future/skew→`Now`, the exact rung
> boundaries and the `Long`-overflow safety are all *inherited*. Localized strings are **injected as
> parameters** (the established `CallTimeLabel` pattern) — the formatter has zero Android dependency and is
> 100% JVM-testable; a `@Composable rememberRelativeTimeStrings()` binds the `time_relative_*` resources
> (EN/FR/ES/PT) at the call site. Faithful to the iOS `RelativeTimeFormatter` compact form (`maintenant /
> Nmin / Nh / Nj / Nsem`); the three-months-or-older rung falls back to the locale/zone absolute date with
> the year shown only when it differs from the reference year (matching `CallTimeLabel`). **Wired for real
> (no dead ends):** the **feed post timestamp** now renders the discreet relative label ("5 min", "2 h",
> "3 j") in place of the raw absolute `shortDateTimeLabel` — the Prisme "native, discreet" framing — parsing
> via the tested `isoToEpochMillisOrNull` SSOT and falling back to the absolute short label when the instant
> is absent/unparsable (a malformed timestamp never blanks or crashes the row). **+13 tests** (under-30s→now;
> future/skew→now; 30s boundary→seconds rung; 45s substitution; 5min; 59min-still-minutes; 2h; 3d; 2wk; 2mo;
> substitution uses the real value not a constant [7min vs 11min]; >90d same-year→date w/o year; >90d
> prior-year→date w/ year). **Two-mutation RED check:** minutes-rung→`hoursAgo` template + `year != ` →
> `year == ` failed exactly the 5 relevant tests (2 minutes + substitution + 2 absolute-date), reverted green.
> **Verification:** `:sdk-ui:testDebugUnitTest` + `:feature:feed:testDebugUnitTest` full suites green +
> `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced, feed Compose glue compiles). Reviewer **PASS**
> (diff `apps/android` only — `:sdk-ui` [new `RelativeTimeFormat.kt` + `RelativeTimeStringsCompose.kt` + test,
> `time_relative_*` strings ×4 locales], `:feature:feed` [3 imports + one `@Composable postRelativeTime`
> helper + one call-site swap], `feature-parity.md`, routine docs; no production logic outside; **SDK purity**
> — pure formatter takes opaque injected strings, stays agnostic → `:sdk-ui` building block alongside
> `DateTimeLabels`/`CallTimeLabel`; the "when/where to render relative" orchestration stays app-side in feed;
> **SSOT** — thresholds owned once by `RelativeTime`, reused not duplicated; **UDF/instant-app** — pure fn,
> no state, feed cache path unchanged; **colour/UX coherence** — no colour change, discreet Prisme framing;
> **no coverage floor lowered, no test weakened**). **Next slice:** the *long* rendering layer
> (`RelativeTimeLongFormat` → localized `il y a … / hier / date` for contacts/participants/friend-requests/
> message-detail, incl. the `Yesterday` special case + `lastSeen` presence framing), wiring the short
> formatter into the conversation-row / notification-row timestamps, or resume the media-wiring hints below.

> On 2026-07-13 **per-conversation message ordering** landed (slice `chat-message-ordering`, feature-parity
> "Message ordering" — the ordering half of the bundled `seq` sort + gap-detection + server-offset roadmap item).
> Ships the pure `:feature:chat` SSOT `MessageOrdering.order(items, selector) → List<T>` (+ a bare-input overload)
> that lays a message list out in **stable ascending (oldest→newest) timeline order** — the foundation every
> downstream chat computation already trusted implicitly (consecutive `MessageGrouping`, day labels, scroll
> anchoring) but that nothing actually enforced: `toBubbles` rendered messages in whatever order the repository
> handed back, so an out-of-order socket arrival or a merged older-page could jumble the list. The order is a
> total, deterministic projection of two keys via `compareBy`: **send time first** (`createdAtMillis`; a message
> with no parsed timestamp → `Long.MAX_VALUE` = newest, pinned to the bottom, so a freshly-composed local echo
> lands at the end not hoisted above dated history), **`seq` breaks ties** (ascending; a null seq = an un-acked
> optimistic send → `Long.MAX_VALUE` so it trails its acked same-instant sibling), and **server order is the final
> tiebreak** — `sortedWith` is stable, so a fully-tied pair keeps the caller's incoming order rather than being
> reshuffled (this is exactly what keeps the existing all-null-`createdAt` ViewModel test fixtures unperturbed:
> all equal → input order preserved). **Wired for real (no dead ends):** `ChatViewModel.toBubbles` now orders the
> hidden-filtered list *before* grouping/mapping, reusing `isoToEpochMillisOrNull`, so grouping + day labels
> cluster a provably-ascending list. **+16 tests** (empty→∅; single unchanged; already-ascending kept;
> reversed-by-time re-sorted; out-of-order arrival placed by timestamp not position; equal-time→ascending seq;
> equal-time no-seq trails seq'd; full tie preserves input order; no-timestamp sorts after timestamped; two untimed
> fall back to seq then input order; two fully-tied untimed keep input order; negative pre-epoch orders; near-MAX
> timestamps don't overflow; idempotent; `order` returns original items not projected inputs; bare-input overload).
> **Two-mutation RED check:** `?: Long.MAX_VALUE`→`?: Long.MIN_VALUE` on both keys failed exactly the 2 relevant
> tests (no-timestamp-sorts-after + no-seq-trails-seq'd), confirming behavioural not tautological; reverted green.
> **Verification:** `:feature:chat:testDebugUnitTest` full suite + `:app:assembleDebug` → **BUILD SUCCESSFUL**
> (APK produced, no existing chat test regressed by the new `toBubbles` sort). Reviewer **PASS** (diff `apps/android`
> only — `:feature:chat` [new `MessageOrdering.kt` + test, one-line `ChatViewModel` wiring], `feature-parity.md`,
> routine docs; no production logic outside; **SDK purity** — pure ordering in `:feature:chat`, the established home
> for chat reducers/SSOTs alongside `MessageGrouping`; **SSOT** — one ordering owns the timeline every downstream
> computation reads; **UDF/instant-app** — pure fn, cache-first path unchanged; **colour/UX coherence** — no UI
> change; **no coverage floor lowered, no test weakened**). **Next slice:** continuity **gap detection** once a
> `seq` source lands (or add a nullable `seq` to the android `LocalMessage`/DTO first), the app-side relative-time
> rendering layer (maps `RelativeTimeUnit`/`RelativeTimeLongLabel` → 5 app languages), or resume the media-wiring
> hints below.

> On 2026-07-13 **relative-time long framing SSOT** landed (slice `time-relative-long-label`, feature-parity §Q —
> the detail-surface framing, port of iOS `RelativeTimeFormatter.longString`). Companion to the just-landed
> `RelativeTime.classify` flat ladder: where `classify` is a bare `now/5m/2h/3d/…` ladder for dense lists, the
> *long* framing is the `maintenant / il y a 45s / il y a 5 min / hier / il y a 3j / il y a 2sem / il y a 2mois /
> date` form used on contacts, participants, friend-requests and message detail. New `:core:model/time`
> `RelativeTimeLongLabel` — a sealed framing rung (`Now` / `AgoSeconds` / `AgoMinutes` / `AgoHours` / `Yesterday`
> / `AgoDays` / `AgoWeeks` / `AgoMonths` / `AbsoluteDate(epochMillis)`) carrying the numeric value + the *framing
> intent* but **no localized text** (the `time.long.*` wording stays UI-side, exactly as iOS keeps `il y a %@` /
> `hier` in the formatter catalog); `RelativeTimeLongFormat.label(epochMillis, referenceMillis, zoneId)`. The
> sub-hour rungs **reuse `RelativeTime`'s second thresholds** (SSOT — no duplicated constants), then from an hour
> up the ladder switches to **calendar-day** boundaries rather than 24-hour windows — the key divergence from
> `classify`: an event at 23:00 seen at 01:00 the next day is `Yesterday`, not `il y a 2h`. Because the boundary
> is the *user's* midnight, the label needs a `ZoneId`: the very same instant reads `hier` in UTC and `il y a 2h`
> three hours west (pinned by a two-assertion zone test). Future / clock-skew (negative interval) → `Now`, like
> `classify`. **+21 tests** (every rung; both sides of every boundary — 29/30s, 59/60s, 59min, 1h-same-day,
> 23h-same-day-not-yesterday, 2h-across-midnight-IS-yesterday, prev-day, 2/6d, exactly-7d→1week, 29d→4weeks,
> 30d→1month, 89d→2months, 90d→AbsoluteDate carrying the instant; the cross-zone divergence). **Two-mutation RED
> check:** `dayDelta <= 0`→`< 0` (steals the same-day hours rung) + `dayDelta == 1`→`== 2` (steals `Yesterday`)
> failed exactly the 6 calendar-day tests (hours/yesterday/days/zone), reverted green. `:core:model:testDebugUnitTest`
> 21/21 new; `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced). Reviewer **PASS** (diff `apps/android` only
> — `:core:model` [`time/RelativeTimeLongLabel.kt` + test], `feature-parity.md`, routine docs; no production logic
> outside; **SDK purity** — pure framing in `:core:model`, `time.long.*` localized strings + `Locale`-aware
> absolute date stay UI-side; **SSOT** — second thresholds reused from `RelativeTime`, calendar-day framing owned
> once here; **UDF/instant-app** — pure fn, no state/UI; **colour/UX coherence** — no UI in this slice; **no
> coverage floor lowered, no test weakened**). **Next slice:** the app-side Compose/string layer that maps
> `RelativeTimeUnit` (short) + `RelativeTimeLongLabel` (long) + the `lastSeen` presence framing → the five app
> languages, or resume the media-wiring hints below.

> On 2026-07-13 **relative-time classification SSOT** landed (slice `time-relative-classify`, feature-parity §Q —
> "Relative-time classification SSOT"). Ships the pure threshold ladder beneath every conversation-row / feed /
> notification / presence timestamp — a faithful port of iOS `RelativeTime.classify` (the SSOT the iOS
> `RelativeTimeFormatter` builds on), with rendering (localized strings, absolute-date formatting) deliberately
> left UI-side per the grain rule. New `:core:model` package `me.meeshy.sdk.model.time`: `RelativeTimeUnit` — a
> sealed ladder rung (`Now`/`Seconds`/`Minutes`/`Hours`/`Days`/`Weeks`/`Months`/`AbsoluteDate(epochMillis)`)
> carrying the numeric value but no text; `RelativeTime.classify(epochMillis, referenceMillis)` — `Now` (<30s) →
> seconds (<1min) → minutes (<1h) → hours (<1day) → days (<7d) → weeks (<30d) → months (<90d) → absolute date,
> with the thresholds exposed as named `const` (the single source of truth). **Surpasses** the reference on two
> edges iOS leaves implicit: (1) a future / clock-skewed timestamp (negative interval) collapses to `Now` instead
> of emitting a negative count; (2) the whole ladder runs on `Long` arithmetic, so a decades-old timestamp (whose
> elapsed seconds overflow a 32-bit `Int`) still reaches the absolute-date rung rather than wrapping to a spurious
> near rung — pinned by a ~30-year and a unix-epoch test. **+24 tests**: every rung, both sides of every
> threshold boundary (29s→Now vs 30s→Seconds, 59s vs 60s→Minutes, 3599s vs 3600s→Hours, 6d vs 7d→Weeks, 29d vs
> 30d→Months, 89d vs 90d→AbsoluteDate), integer-floor of trailing units (119s→1min, 13d→1week), and the
> future/overflow/epoch edges. A **two-mutation RED check** (`< NOW_THRESHOLD`→`< MINUTE_SECONDS` collapsing the
> seconds rung + `days < WEEK_DAYS`→`days <= WEEK_DAYS` stealing the 7-day boundary) failed exactly the 3 relevant
> tests (30s + 59s seconds rungs + exactly-7-days→weeks), reverted green. `:core:model:testDebugUnitTest` green
> (24/24 new); `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced). Reviewer **PASS** (diff `apps/android`
> only — `:core:model` [new `time/RelativeTime.kt` + test], `feature-parity.md`, routine docs; no production logic
> outside; **SDK purity** — pure classifier in `:core:model`, localized strings + absolute-date `DateFormatter`
> stay app/UI-side exactly as iOS keeps them in the view layer; **SSOT** — thresholds live once here as named
> consts; **UDF/instant-app** — pure function, no state or UI; **colour/UX coherence** — no UI in this slice; **no
> coverage floor lowered, no test weakened**). **Next slice:** the app-side `RelativeTimeFormatter` Compose/string
> layer that maps `RelativeTimeUnit` → the five localized app languages + the `Locale`-aware absolute date (the
> rendering half), the `lastSeen`/`long` framing variants, or resume any of the media wiring hints below.

> On 2026-07-13 **consecutive-sender message grouping** landed (slice `chat-message-grouping`, feature-parity §C —
> the message-list rendering, a WhatsApp/iMessage-style improvement Android now has that **iOS never actually
> implemented** — `MessageListViewController` hardcodes `isLastInGroup: true` and `showAvatar: !direct`, so every
> incoming message re-shows the sender name). Pure `:feature:chat` SSOT `MessageGrouping.positions(messages,
> gapMillis=DEFAULT_GAP_MILLIS) → Map<id, MessageGroupPosition>` clusters the ascending list into consecutive
> same-author runs: two adjacent messages group iff **same author** (both outgoing share one "self" identity; both
> incoming match on equal non-null `senderId`; a null incoming sender never groups; outgoing/incoming never group)
> **and within the time gap** (absolute delta ≤ `gapMillis`=5min, so an out-of-order pair is judged by proximity;
> a missing timestamp skips the time test and rides with the previous same-author message). Each `MessageGroupInput`
> projects `(id, senderId, isOutgoing, createdAtMillis)`; each `MessageGroupPosition(isFirstInGroup, isLastInGroup)`
> exposes `isStandalone`. **Wired for real (no dead ends):** `ChatViewModel.toBubbles` computes positions over the
> **filtered** (hidden-message-excluded) list so they align with what's rendered, derives `showSenderName` from
> `isFirstInGroup` (name shown once per run, replacing the old hardcoded `showSenderName = true` on every incoming),
> and threads `isFirstInGroup`/`isLastInGroup` onto `BubbleContent` (two new fields, default `true` so every
> existing call-site/test is untouched). The exempt `MessageBubble` composable consumes them for spacing — a run
> stacks tightly (top gap only on the first, bottom gap only on the last) while distinct messages keep their 4dp
> breathing room — so header + visual run share **one** SSOT and can't drift. **+15 tests** (empty→∅; single→
> standalone; same-sender within gap → [first,¬last]/[¬first,last]; beyond gap → both standalone; exactly-on-gap
> still groups (`<=`); different incoming senders never group; two outgoing group as self; outgoing→incoming breaks;
> null incoming sender never groups; missing timestamp rides with previous; middle-of-three is neither first nor
> last; a sender change splits two runs; custom gap overrides default; out-of-order uses the absolute delta;
> positions keyed by every id). A **two-mutation RED check** (`<=`→`<` on the gap + `isOutgoing → return false` in
> `sameAuthor`) failed exactly the 2 relevant tests (exactly-on-threshold + two-outgoing-self), confirming they are
> behavioural not tautological; reverted, green again. **Verification:** `assembleDebug` → BUILD SUCCESSFUL (APK,
> all Compose glue incl. `MessageBubble` compiles); `:feature:chat` + `:sdk-ui` `testDebugUnitTest` → **0 failures**
> (MessageGroupingTest 15/15). Full-tree `testDebugUnitTest` shows only the **3 documented pre-existing flaky
> `:sdk-core` DataStore `StateFlow`-timeout tests** (MediaDownload/Notification/PrivacyPreferencesStoreTest — a
> module this `:feature:chat`/`:sdk-ui` slice cannot touch); the count varied 3→1 across runs and each passes on
> isolated retry (see NOTES). Reviewer **PASS** (diff `apps/android` only — `:feature:chat` [new `MessageGrouping.kt`
> + test, `ChatViewModel` wiring], `:sdk-ui` [`BubbleContent` +2 fields, `MessageBubble` spacing], `feature-parity.md`,
> routine docs; no production logic outside; **SDK purity** — pure clustering algorithm in `:feature:chat` (the
> established home for chat reducers ReplyThreads/PinnedMessages/ForwardTargets), the Compose spacing app-side;
> **SSOT** — one grouping owns both the header (`showSenderName`) and the visual run (spacing); **UDF/instant-app** —
> pure function, cache-first path unchanged; **colour/UX coherence** — no colour change, natural tightly-stacked runs;
> **no coverage floor lowered, no test weakened**). **Next slice:** the app-side wiring of the already-shipped media
> pure cores (ThumbHash placeholder via Coil, Bitmap re-encode via `ImageCompressionPlan`, voice recorder pill via the
> waveform cores), the §C carousel/contact bubble attachments, or §B communities carousel + category filter chips.

> On 2026-07-12 **ThumbHash encoder** landed (slice `media-thumbhash-encode`, feature-parity §P —
> "ThumbHash blur placeholders for all media", line 2144; the generation half of the placeholder pipeline,
> companion to the decoder that landed earlier the same day). Ships the pure `ThumbHash.encode(width, height,
> rgba: ByteArray) → ByteArray` in the existing `me.meeshy.sdk.model.media.ThumbHash` object — a faithful port
> of Evan Wallace's canonical `rgbaToThumbHash`: alpha-weighted average colour → RGBA→LPQA transform composited
> atop that average → forward DCT of each channel (via a new private `encodeChannel`/`EncodedChannel`) into a DC
> term plus scale-normalised AC nibbles, with fewer luminance basis bits when an alpha channel is present, exactly
> as `decode` expects. The `p`/`q` colour-difference transform is **derived as the exact algebraic inverse of THIS
> repo's decoder** (`B=l−⅔p`, `R=(3l−B+q)/2`, `G=R−q` ⟹ `l=(r+g+b)/3`, `p=(r+g)/2−b`, `q=r−g`) rather than copied
> from memory — the RED phase caught a channel-swap (green decoded 0.807 instead of 0.4) from the naïve
> `p=(r+b)/2−g`, `q=r−b` and the derivation fixed it. **Surpasses** the reference on its unguarded inputs: rejects
> a non-positive or >100 side and an `rgba` buffer shorter than `width·height·4` with `IllegalArgumentException`
> (the reference reads past the buffer and emits `NaN`-derived garbage). **+13 tests**: hand-derived header bytes
> for a solid grey (`[32,8,2,7,0]`, independent of `decode`); solid-colour round-trip through the independent
> `decode` (average tint + flat corner within 6-bit quantisation); opaque→no-alpha-channel; landscape/portrait/
> square orientation; a left→right luminance gradient decoding brighter on the right (exercises the AC/DCT
> encode + scale-normalisation branch); uniform partial transparency detection + level round-trip; a left→right
> alpha gradient (exercises the alpha 5×5 encode branch); a fully-transparent image (`avgA=0` skip-normalise
> branch); and the three input guards. A **two-mutation RED check** (flip `q=r−g`→`g−r` + force `isLandscape=false`)
> failed exactly the 2 relevant tests (colour round-trip + landscape), confirming they are behavioural not
> tautological. `:core:model:testDebugUnitTest --tests 'me.meeshy.sdk.model.media.*'` green (13 new + 21 decoder
> = 34); full `assembleDebug testDebugUnitTest` across every module → **BUILD SUCCESSFUL** (APK produced, all unit
> tests pass). One environment note (see NOTES 2026-07-12 locale entry): the full-tree test compile needs
> `LANG=C.utf8` because a `:sdk-core` test method name carries an em-dash — under the container's default POSIX
> locale `sun.jnu.encoding` is ASCII and Kotlin throws `InvalidPathException` writing that class file; a UTF-8
> locale (daemon restarted) fixes it. Reviewer **PASS** (diff `apps/android` only — `:core:model` [`ThumbHash.kt`
> +encoder, new `ThumbHashEncodeTest.kt`], `feature-parity.md`, routine docs; no production logic outside; **SDK
> purity** — pure encoder in `:core:model`, the app-side `Bitmap`→`rgba` extraction stays app-side; **SSOT** — one
> object owns both directions of the format so encode and decode can't drift, `p`/`q` derived FROM the decoder;
> **UDF/instant-app** — pure function, no state or UI; **colour/UX coherence** — no UI in this slice; **no coverage
> floor lowered, no test weakened**). **Next slice:** the app-side `Bitmap`→`rgba` extraction + `ThumbHash.encode`
> wired into the upload path to generate the placeholder seed, the app-side raster→`Bitmap` wrap + Coil placeholder
> that consumes `ThumbHash.decode`, the app-side Bitmap re-encode consuming `ImageCompressionPlan`, the voice
> recorder pill consuming the `waveform` cores, or the chat media view consuming `MediaAutoDownloadDecider`.

> On 2026-07-12 **ThumbHash decoder** landed (slice `media-thumbhash-decode`, feature-parity §P —
> "ThumbHash blur placeholders for all media", line 2144; also underpinning the progressive-image
> item at line ~207). Ships the pure decode beneath the app-side blur placeholder. Pure `:core:model`
> SSOTs (package `me.meeshy.sdk.model.media`, alongside the image-compression slice): `ThumbHash` — a
> faithful port of Evan Wallace's canonical `thumbHashToRGBA` / `thumbHashToAverageRGBA` /
> `thumbHashToApproximateAspectRatio`, exposing `averageColor(hash)→ThumbHashColor`,
> `approximateAspectRatio(hash)→Float`, `hasAlpha(hash)`, `isLandscape(hash)`, and `decode(hash)→
> ThumbHashImage(width,height,rgba: ByteArray)` — DC + AC YCoCg→RGB inverse-DCT over primitives, no
> Android `Bitmap`/`Color` (the raster→Bitmap wrap + Compose paint stay app-side per the grain rule).
> **Surpasses** the reference on two counts iOS/JS leave unguarded: (1) it rejects a hash too short for
> the region it must read — `IllegalArgumentException` per surface (`averageColor`/`isLandscape`/
> `approximateAspectRatio`/`decode` each guard their own minimum, `decode` computes the exact required
> AC byte count) instead of a silent out-of-bounds read on a truncated/garbage hash; (2) it clamps the
> decoded raster to at least 1×1 so a degenerate header (e.g. a 0 L-count portrait → aspect 0) can never
> produce a zero-sized image the caller would choke on. **+21 tests** (averageColor 3 — zero header
> r=0/g=1/6/b=2/3, saturated header r=1/g=5/6/b=1/3, alpha DC term 0 vs 1; metadata 2 — hasAlpha bit,
> isLandscape bit; approximateAspectRatio 3 — portrait L/7, landscape 7/L, alpha uses 5; decode
> dimensions 3 — square 32×32, portrait shrinks width to 18, landscape shrinks height to 18; decode
> reconstruction 4 — DC-only (all AC scales 0) flat image byte-exact to the hand-derived average incl.
> flatness at 3 sampled pixels [255,212,85,255], no-alpha channel fully opaque 255, zero alpha DC fully
> transparent 0, every byte a valid unsigned channel; mean invariant 1 — a non-flat decode's per-channel
> mean lands back on `averageColor` within 0.03 because the DCT-II basis integrates to zero over the
> sample grid (cross-checks the full-decode path against the header-only average path with maximal-
> headroom mid-grey so nothing clamps); guards 4 — decode rejects a truncated hash, averageColor rejects
> a 2-byte header + an alpha hash missing its alpha byte, approximateAspectRatio rejects a 4-byte hash;
> degenerate dims 1 — 0-count portrait clamps width to ≥1). Expected values are hand-derived from the
> bit layout + IEEE-754 double math (the flat blue is 85, not a naïve 84: `1 − 2/3 = 0.33333333333333337`,
> `×255 = 85.0000…001`), never copied from the decoder's own output. `:core:model:testDebugUnitTest`
> green (all incl. 21 new); full `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced). A
> **two-mutation RED check** (flip the YCoCg blue reconstruction `l − 2/3·p → l + 2/3·p` + drop the
> portrait aspect scale so width never shrinks) failed exactly the 4 relevant tests (3 blue average/decode
> + portrait-width), confirming they are behavioural not tautological. Reviewer **PASS** (diff
> `apps/android` only — `:core:model` [new `ThumbHash.kt` + test], `feature-parity.md`, routine docs; no
> production logic outside; **SDK purity** — pure decoder in `:core:model`, Bitmap/paint app-side;
> **SSOT** — one decoder owns the format, `decode` derives its dimensions from the same
> `approximateAspectRatio` the public API exposes so screen and transform can't drift; **UDF/instant-app**
> — pure functions, no state machine or UI; **colour/UX coherence** — no UI in this slice; **no coverage
> floor lowered, no test weakened**). Full-tree `testDebugUnitTest` shows only **2 pre-existing flaky
> DataStore `StateFlow`-timeout failures in `:sdk-core`** (NotificationPreferencesStoreTest,
> PrivacyPreferencesStoreTest) — a module this additive `:core:model` slice cannot affect; both pass on
> isolated retry (see NOTES 2026-07-12 locale/flake entry). **Next slice:** the app-side raster→`Bitmap`
> wrap + Coil placeholder wiring that consumes `ThumbHash.decode`, the ThumbHash *encoder* for slide-level
> generation, the app-side Bitmap re-encode that consumes `ImageCompressionPlan`, the app-side voice
> recorder pill consuming `AudioLevelNormalizer`/`WaveformLevelWindow`/`WaveformInterpolator`, or the chat
> media view that consumes `MediaAutoDownloadDecider`.

## Current build-order position

`Auth ✅ → Conversations ✅ → Chat ✅ (+ message-effects lifecycle + honest delivery indicator + rich-text rendering: markdown/mentions/m+/URL/highlight + in-conversation search + @-mention autocomplete & roster display-name resolution + forward + local-only message star/unstar + quoted-reply previews incl. story/mood previews with counts+thumbnails) → Feed ✅ (+ per-post Prisme language flag strip + interactive language switch) → Stories ✅ (rich) → Calls ✅ (pure cores) → Contacts ✅ (near-complete) → **Profile/Settings §K/§L (in progress: header + detail rows + stats dashboard + durable cache + optimistic edit incl. first/last-name + persisted theme + interface language + notification master toggles + DND schedule editor + per-event notification type toggles + offline-queued notification backend sync + regional content language + change-password w/ strength meter + media auto-download prefs + privacy & visibility toggles + privacy backend sync + report-a-user + profile share/QR + account deletion + GDPR data export + media cache management + avatar/banner upload + crash-report diagnostics viewer w/ share)** → rest`

> On 2026-07-12 **waveform interpolation core** landed (slice `media-waveform-interpolation`, feature-parity §P/§O —
> "Universal audio recorder (live waveform …)" line 2113, also underpinning the audio-message-player waveform line
> 2111). Ships the pure decision beneath the app-side live voice-note waveform — the metering→amplitude→resampling
> math that both the recorder pill and the message player consume, with the `MediaRecorder`/`AudioRecord` capture
> and the Compose `Canvas` painting left app-side per the SDK-purity grain rule. Pure `:core:model` SSOTs (new
> package `me.meeshy.sdk.model.waveform`): `AudioLevelNormalizer.normalize(powerDb)` — floors a dB reading at
> `FLOOR_DB=-50`, maps `[-50,0]→[0,1]` linearly, ports iOS `AudioRecorderManager.normalizeLevel` **and surpasses
> it** with an upper clamp to `1f` + a `NaN`→silence guard (byte-identical on every real `averagePower ≤ 0` frame,
> but no bogus/`NaN` frame can produce an out-of-range bar); `WaveformLevelWindow` — an immutable, fixed-capacity
> rolling ring of the most-recent levels (oldest→newest), ports the `levelHistory` append-and-drop-front window +
> the initial `Array(repeating:0,count:15)` via `filled()`, `DEFAULT_CAPACITY=15`, a non-positive requested
> capacity collapses to a permanently-empty (inert-`push`) window so the model never over-allocates;
> `WaveformInterpolator.interpolate(levels, barCount)` — resamples the levels onto exactly `barCount` evenly-spaced
> bars by linear interpolation, ports the per-bar math of iOS `UniversalComposerBar.interpolatedLevel`
> (`position = i*(n-1)/(barCount-1)`, blend of the two bracketing samples) but **returns the whole strip in one
> pass** and pins the degenerate cases iOS left implicit (`barCount≤0`→empty; single sample or single bar→every
> bar = that level; no samples→flat silent strip; endpoints always exact). **+28 tests** (AudioLevelNormalizer 7 —
> 0dB→1, floor→0, midpoint→0.5, below-floor + `-∞`→0, positive→1 clamp, `NaN`→0, monotonic rise at -40/-10;
> WaveformLevelWindow 11 — empty/filled/default-15, append-below-cap, drop-oldest-over-cap, keep-exactly-N-in-order,
> filled-slides-zeros-out, zero-capacity-stays-empty, negative-capacity→0, push-is-immutable, value-equality;
> WaveformInterpolator 10 — non-positive-barCount→empty, no-samples→zeros, single-sample-fills, single-bar→first,
> upsample-midpoints + quarter-points, downsample-aligned, endpoints-exact, non-uniform-neighbours, identity-mapping).
> `:core:model:testDebugUnitTest --tests 'me.meeshy.sdk.model.waveform.*'` green (28/28); full `assembleDebug` +
> all-module `testDebugUnitTest` → BUILD SUCCESSFUL (APK produced). A **two-mutation RED check** (drop the
> normalizer upper clamp + zero out the interpolator's high-sample blend term) failed exactly the 4 relevant tests
> (positive-clamp + the 3 linear-blend tests), confirming they are behavioural not tautological. Reviewer **PASS**
> (diff `apps/android` only — `:core:model` [new `waveform` package: 2 sources + 3 test files], `feature-parity.md`,
> routine docs; no production logic outside; **SDK purity** — pure metering/window/resampler in `:core:model`, the
> Android capture + Canvas paint left app-side; **SSOT** — one normalizer owns the dB→amplitude map, one window owns
> the ring invariant, one interpolator owns the resampling, shared by recorder + player so the two can't drift;
> **UDF/instant-app** — pure functions, no state machine or UI; **colour/UX coherence** — no UI in this slice; **no
> coverage floor lowered, no test weakened**). **Next slice:** the app-side voice recorder pill (`MediaRecorder`
> capture → `AudioLevelNormalizer`/`WaveformLevelWindow` → Compose `Canvas` waveform via `WaveformInterpolator`),
> the audio-message-player waveform that consumes the same core, the app-side Bitmap re-encode that consumes the
> `ImageCompressionPlan`, or ThumbHash blur placeholders (§P).

> On 2026-07-12 **image compression plan** landed (slice `media-image-compression-plan`, feature-parity §P —
> "Image/video compression before upload (context-aware quality)"). Ships the pure decision beneath the
> app-side Bitmap re-encode — the first leg of §P compression. Pure `:core:model` SSOTs (new package
> `me.meeshy.sdk.model.media`): `ImageUploadContext` (per-surface longest-edge ceilings in px, mirroring iOS
> `MediaContext.maxImageDimension` — MESSAGE 1200 / STORY 1080 / FEED_POST 1600 / AVATAR 512 / FULLSCREEN 2048
> — **plus BANNER 1600**, a wide profile hero iOS's enum lacks, so the shipped avatar/banner upload path has a
> compression context; `forUploadTarget(ImageUploadTarget)` is the single bridge mapping the shipped upload
> target → context so the two slices never disagree on the ceiling); `ImageCompressionPlan` (targetWidthPx,
> targetHeightPx, quality, resizeRequired); `ImageCompressionPlanner.plan(context, w, h, quality=80)` — fits the
> longest edge within the ceiling via one uniform aspect-preserving scale, `floor`-rounded exactly like iOS
> `MediaCompressor.targetSize`, marks a resize **only** when the source strictly exceeds the ceiling (`>`, so an
> image sitting exactly on the ceiling is re-encoded but not scaled), clamps quality to the encoder's `1..100`
> band, clamps each target edge to ≥1 (surpasses iOS: a degenerate thin source never rounds to a 0-px edge), and
> treats a non-positive source dimension as a no-op plan. The actual Bitmap decode/scale/JPEG re-encode is the
> app-side glue that consumes the plan (grain rule: pure decision in `:core:model`, the Android-runtime pixel
> work app-side); video compression + "save to Meeshy album" remain pending on the §P line. **+18 tests**
> (ImageCompressionPlanner 15 — smaller-than-ceiling no-resize, exactly-on-ceiling no-resize, just-over-ceiling
> resize, landscape + portrait downscale with aspect preserved, per-context ceiling divergence, default/in-range/
> over-max/zero/negative quality clamp, zero-width + zero-height + negative-dim no-op, thin-portrait + thin-
> landscape target clamp ≥1, uneven-downscale aspect preservation; ImageUploadContext 3 — avatar/banner bridge,
> avatar ceiling < banner ceiling). `:core:model:testDebugUnitTest --tests 'me.meeshy.sdk.model.media.*'` green;
> full `assembleDebug` + all-module `testDebugUnitTest` → **BUILD SUCCESSFUL in 4m21s** (APK produced). A
> two-mutation RED check (boundary `<=`→`<` + drop the `coerceAtLeast(1)` edge clamp) failed exactly the 3
> relevant tests (exactly-on-ceiling no-resize + the 2 thin-edge clamp tests), confirming they are behavioural
> not tautological. Reviewer **PASS** (diff `apps/android` only — `:core:model` [new `media` package: 1 source +
> 2 test files], `feature-parity.md`, routine docs; no production logic outside; **SDK purity** — pure
> context/plan/planner in `:core:model`, Bitmap pixel work left app-side; **SSOT** — one planner owns the fit +
> clamp math, one `forUploadTarget` bridge owns target→context, ceilings defined once on the enum; **UDF/instant-
> app** — pure decision, no state machine or UI; **colour/UX coherence** — no UI in this slice; **no coverage
> floor lowered, no test weakened**). **Next slice:** the app-side Bitmap re-encode that consumes the plan (the
> actual compress-before-upload wired into the avatar/banner + attachment upload paths), ThumbHash blur
> placeholders (§P), or the chat media view that consumes the `MediaAutoDownloadDecider`.

> On 2026-07-12 **open-source licenses** landed (slice `settings-open-source-licenses`, feature-parity §L —
> the last §L static screen; **§L static screens now complete**). Port of iOS `LicensesView`, but over an
> **Android-accurate** curated catalog — the libraries that actually ship (Jetpack Compose, AndroidX, Material
> Components, Dagger Hilt, Kotlin Coroutines/Serialization, Coil, OkHttp, Retrofit, Media3 ExoPlayer, Room,
> Timber, ZXing, Firebase Android SDK, Socket.IO Client Java, WebRTC-Android), not iOS's Swift deps. Pure
> `:core:model` SSOTs (package `me.meeshy.sdk.model.licenses`): `OpenSourceLicenseType` (MIT/APACHE_2_0/BSD/OTHER
> — declaration order = render order); `OpenSourceLicense` + `OpenSourceLicenseGroup`;
> `OpenSourceLicenseResolver.resolvable(licenses)` — the launchability gate porting iOS `licenseCard`'s
> `if let URL(string:)` guard, **narrowed** to `http(s)://` only (unlike Help & Support, licenses only ever open
> repo web pages — never `mailto:`; trim + case-fold, order-preserving, blank/other-scheme dropped);
> `OpenSourceLicensePresentationBuilder.build(licenses)` — **surpasses iOS's flat list** by grouping the
> launchable licenses by type in enum order (not insertion order), sorting each group by name case-insensitively,
> excluding non-launchable entries up front, and dropping empty groups; `OpenSourceLicenseCatalog` (the curated
> list + `groups()`). `LicensesScreen` (`:feature:settings`, coverage-exempt glue): a localized intro line + one
> accent-coded section card per family (MIT=Success green, Apache=Warning amber, BSD=Info blue, Other=Neutral,
> matching the codebase's semantic palette), each row a tappable card (name + author + open-in-new) opening the
> repository via `ACTION_VIEW`. Nav: one `settings/licenses` route reached by `Routes.LICENSES` from a new
> **Open source licenses** row in Settings → About. **+26 tests** (OpenSourceLicenseResolver 9 — http/https/upper/
> padded kept, blank + mailto + schemeless dropped, mixed list keeps only launchable in order;
> OpenSourceLicensePresentationBuilder 8 — empty, single group/entry, enum-order-not-insertion-order, within-group
> case-insensitive sort, empty-groups dropped, non-launchable excluded before grouping, multi-group each sorted,
> distinct same-name entries kept; OpenSourceLicenseCatalog 7 — non-empty, non-blank name/author, every entry
> launchable, no duplicate name/url, `groups()` == builder over raw list, groups cover every license once). Full
> `:app:assembleDebug` + all-module `testDebugUnitTest` → **BUILD SUCCESSFUL in 6m36s** (APK produced). A
> two-mutation RED check (drop the group `.sortedBy` + widen the resolver to accept `mailto:`) failed exactly the
> 3 relevant tests (2 sort tests + the mailto-drop test), confirming they are behavioural not tautological.
> Reviewer **PASS** (diff `apps/android` only — `:core:model` [new `licenses` package], `:feature:settings`
> [screen + 7× strings EN/FR/ES/PT], `:app` nav wiring, `SettingsScreen` one new callback + row; no production
> logic outside; **SDK purity** — pure type/resolver/builder/catalog in `:core:model`, localized labels + accent
> colours + "which screen / launch intent" glue app-side; **SSOT** — one resolver owns launchability, one builder
> owns grouping + ordering, one catalog owns the shipped list, `groups()` defers to the builder so screen and
> tested transform can't drift; **UDF/instant-app** — static content, no state machine; **colour/UX coherence** —
> semantic per-family accents, natural row→screen→back, no dead ends; **no coverage floor lowered, no test
> weakened**). ⚠ **MERGE BLOCKED (not my diff):** PR #1894's CI is red only on a **pre-existing, unrelated**
> gateway failure — `services/gateway/.../calls-routes.test.ts` (3 endCall/leaveCall tests returning
> `success:false`). The **same "Test gateway" job also fails on main's own push CI** (sha `6d0b17d`, run
> 29196093956), so it is a broken gateway test on main from in-flight gateway/calls work, **not** caused by this
> apps/android-only slice (which cannot touch gateway logic). Per the hard rule *never merge past red CI* and the
> scope rule *diff is apps/android only* (so I can't fix gateway prod code), the slice is **held ⚠ blocked at the
> merge gate**; it is code-complete + locally green (full `assembleDebug` + all-module tests) and will squash-merge
> once main's gateway tests go green (maintainer is actively pushing gateway/calls fixes). **Next slice (after
> merge unblocks):** the chat media view that consumes the `MediaAutoDownloadDecider` (the actual auto-DL trigger
> + a manual-download affordance for `SKIP_POLICY`), in-place crop/resize/compress before upload (§K polish), or a
> §K row (device-sessions / 2FA / voice-cloning / blocked-users management).

> On 2026-07-12 **Help & Support** landed (slice `settings-help-support`, feature-parity §L — "Static
> screens: … Help & Support …"). Port of iOS `SupportView`, wiring a new **Help & Support** row in
> Settings → About. Two pure `:core:model` SSOTs (package `me.meeshy.sdk.model.support`):
> (1) `SupportLinkResolver.resolvable(links)` — the launchability gate mirroring iOS `supportLink`'s
> `if let URL(string:)` guard, **widened** to accept `mailto:` alongside `http(s)://` (Help & Support mixes
> web pages and email-compose links, unlike the website-only About screen; scheme match is trim+case-folded,
> order-preserving, drops blank/unsupported schemes); (2) `SupportPresentationBuilder.build(params)` —
> assembles the three launchable-filtered link sections (Get help = help-center + FAQ https pages; Contact =
> `mailto:` support email + Twitter; Report = pre-filled `mailto:` bug + feature compose links) plus the
> Information rows (version = trimmed versionName, `1.0.0` fallback on blank; build = versionCode, `1` fallback
> when ≤0; platform = `Android {release}`, bare `Android` on blank release). Supporting enums
> `SupportSectionKey` (HELP/CONTACT/REPORT/INFO) / `SupportLinkKind` / `SupportInfoKey` + opaque `SupportParams`
> (`PackageInfo`/`Build` facts injected app-side — no Android import in the pure core). `SupportScreen`
> (`:feature:settings`, coverage-exempt glue): accent-coded section cards — Success/Info/Warning for the three
> link sections + Neutral for Information, mirroring iOS's per-section tints — each link a tappable row opening
> via `ACTION_VIEW`, every label resolved app-side to a localized string. Nav: one `settings/support` route
> reached by `Routes.SUPPORT` from the wired row. **+24 tests** (SupportLinkResolver 11 — http/https/mailto
> kept, uppercase-scheme + padded kept, blank + non-launchable (`tel:`) + schemeless dropped, mixed list keeps
> only launchable in order; SupportPresentationBuilder 13 — section order, per-section link identity+order,
> every curated link launchable, info-row order, version trim + blank fallback, build value + zero/negative
> fallback, platform prefix + blank-release). `:app:assembleDebug` **BUILD SUCCESSFUL**; full all-module
> `testDebugUnitTest` **BUILD SUCCESSFUL** (under a UTF-8 locale — see NOTES ⚙ ENVIRONMENT: the fresh
> container's POSIX locale otherwise breaks `:sdk-core` test compile on a pre-existing em-dash test name,
> unrelated to this diff). A two-mutation RED check (drop the `mailto:` scheme from the resolver + drop the
> build `≤0` fallback) failed exactly the 9 relevant tests, confirming they are behavioural not tautological.
> Reviewer **PASS** (diff `apps/android` only — `:core:model` [new `support` package], `:feature:settings`
> [screen + 4× locale strings], `:app` nav wiring, `SettingsScreen` one new callback+row; no production logic
> outside; **SDK purity** — pure resolver/builder in `:core:model`, localized content + "which screen / launch
> intent" glue app-side; **SSOT** — one resolver owns launchability, one builder owns section order + fallbacks,
> no re-implementation; **UDF/instant-app** — static content, no state machine; **colour/UX coherence** —
> per-section accent tints matching iOS, natural row→screen→back, no dead ends; **no coverage floor lowered, no
> test weakened**). **Next slice:** the last §L static screen (open-source licenses — an Android-accurate curated
> catalog, not iOS's Swift deps), the chat media view that consumes the `MediaAutoDownloadDecider`, or in-place
> crop/resize/compress before upload (§K).

> On 2026-07-12 **Terms of Service + Privacy Policy** landed (slice `settings-legal-documents`,
> feature-parity §L — "Static screens: … Terms of Service … Privacy Policy …"). Port of iOS
> `TermsOfServiceView` + `PrivacyPolicyView`, **unified** into one data-driven screen keyed by
> `LegalDocumentKind`, wiring the **two previously dead-end** Settings → About rows ("Terms of Service",
> "Privacy Policy", both `onClick = {}`). Pure `:core:model` SSOTs (package `me.meeshy.sdk.model.legal`):
> `LegalDocumentKind` (enum with a stable route `arg` + `fromArg(raw)` — the case-folded, trimmed parser that
> returns `null` on a blank / absent / unrecognised token so an unknown deep link never silently resolves to the
> wrong document); `LegalSectionKey` (the 9 ToS + 7 Privacy section keys, in iOS order); `LegalNumberedSection`;
> `LegalDocumentCatalog.sections(kind)` (ordered section keys per document) + `.numbered(kind)` (iOS's
> `index + 1`, contiguous 1-based numbering). `LegalDocumentScreen` (`:feature:settings`, coverage-exempt glue):
> a "last updated" line + numbered Info-blue section cards (accent circle number + heading + body), every key
> resolved app-side to a localized string. Nav: one `settings/legal/{doc}` route parsed via `fromArg`
> (defensive fallback to ToS), reached by `Routes.legal(kind)` from the two wired rows. **Surpasses iOS twice:**
> (a) two near-identical iOS views collapse into one catalog-driven screen (one place to add/reorder a section),
> and (b) the document follows the app's content language automatically across values-* (EN/FR/ES/PT — Prisme
> philosophy: content in the user's language with no friction), replacing iOS's manual fr/en `Picker`. **+14
> tests** (LegalDocumentCatalog 7 — per-document order, contiguous 1-based numbering, `numbered↔sections` key
> parity, no intra-doc duplicate, the two docs disjoint, and every `LegalSectionKey` partitioned across exactly
> one document; LegalDocumentKind 7 — token resolution, case-insensitivity, trimming, null-on-blank/unknown,
> arg round-trip). `:app:assembleDebug` **BUILD SUCCESSFUL**; full all-module `testDebugUnitTest` **BUILD
> SUCCESSFUL**. A one-mutation RED check (dropping `TOS_CONTACT` from the TERMS list) failed exactly the order +
> partition tests, confirming they are behavioural not tautological. Reviewer **PASS** (diff `apps/android` only
> — `:core:model` [new `legal` package], `:feature:settings` [screen + 4× `legal.xml` EN/FR/ES/PT], `:app` nav
> wiring, `SettingsScreen` two callbacks; no production logic outside; **SDK purity** — pure kind/catalog in
> `:core:model`, localized content + "which screen / route parse" glue app-side; **SSOT** — one catalog owns the
> section order + numbering, one `fromArg` parses the route, no re-implementation; **UDF/instant-app** — static
> content, no state machine; **colour/UX coherence** — Info-blue numbered cards, natural row→screen→back, no dead
> ends left; **no coverage floor lowered, no test weakened**). **Next slice:** the remaining §L static screens
> (Help & Support; open-source licenses — an Android-accurate curated catalog, not iOS's Swift deps), the chat
> media view that consumes the `MediaAutoDownloadDecider`, or in-place crop/resize/compress before upload (§K).

> On 2026-07-12 **media auto-download decision pipeline** landed (slice `media-auto-download-decider`,
> feature-parity §L). Closes the "next slice" NB the `settings-media-auto-download` slice left open: the live
> `ConnectivityManager` monitor + the **first consumer** of the already-tested `MediaDownloadPolicyEngine`.
> Two pure `:core:model` SSOTs: (1) `MediaKindClassifier.fromMimeType(mime, isAudioTranslation) → MediaKind?`
> — the bridge from an attachment's wire MIME to the policy table: strips the `;`-parameter, trims, case-folds
> (MIME is case-insensitive), `image/`→IMAGE, `video/`→VIDEO, `audio/`→AUDIO or AUDIO_TRANSLATION per the flag;
> a document / blank / absent / bare top-level token (`image` without a subtype) → `null` = *never auto-fetched*
> on the user's data; (2) `MediaAutoDownloadDecider.decide(kind, availability, condition, prefs) →
> AutoDownloadDecision` — the guard chain iOS inlines in `ConversationMediaViews`'s auto-DL `.task`, made a pure
> state machine: `null` kind → SKIP_UNSUPPORTED (short-circuits before any network read), AVAILABLE →
> SKIP_ALREADY_AVAILABLE, DOWNLOADING → SKIP_IN_FLIGHT, NEEDS_DOWNLOAD → the `MediaDownloadPolicyEngine` verdict
> (DOWNLOAD / SKIP_POLICY, the offline gate surfacing as SKIP_POLICY not DOWNLOAD); `decideFor(mime,…)`
> classifies then decides. Supporting enums `MediaAvailability` (AVAILABLE/DOWNLOADING/NEEDS_DOWNLOAD) +
> `AutoDownloadDecision` (with a `shouldDownload` convenience). `:sdk-core` `NetworkConditionMonitor` (interface
> + `InMemoryNetworkConditionMonitor` fake + `AndroidNetworkConditionMonitor` — the `ConnectivityManager` glue
> that maps the default network's `NetworkCapabilities` onto the four flags the pure, already-tested
> `NetworkConditionResolver` consumes, exposed as a `StateFlow<NetworkCondition>` via `callbackFlow`+`stateIn`),
> Hilt-provided `@Singleton` in `SdkModule`. The future chat media view injects the monitor +
> `MediaDownloadPreferencesStore` and calls the pure decider — the "when to actually kick the download / which
> UI cascade" rule stays app-side (grain rule: a component wiring the named Meeshy singletons + a "when to X"
> rule is app-side; the monitor takes opaque `Context` and is agnostic → SDK). **+24 tests**
> (MediaKindClassifier 13, MediaAutoDownloadDecider 11), all green. `:app:assembleDebug` **BUILD SUCCESSFUL**;
> `:core:model:testDebugUnitTest` green; full all-module `testDebugUnitTest` had its **only** failure on the
> documented DataStore-under-parallel-load flake (`NotificationPreferencesStoreTest`, NOTES §DataStore, 1/574
> sdk-core tests) — **green in isolation in 3s**, and this slice adds **no** DataStore store. A two-mutation RED
> check (break the DOWNLOADING gate + break the video branch) failed exactly the 5 relevant tests, confirming
> they are behavioural not tautological. Reviewer **PASS** (diff `apps/android` only — `:core:model` [new file],
> `:sdk-core` [new monitor + `SdkModule` binding], `feature-parity.md`; no production logic outside; **SDK
> purity** — pure classifier/decider in `:core:model`, agnostic `Context`-fed monitor in `:sdk-core`, "when to
> auto-DL" left app-side; **SSOT** — one `MediaKindClassifier` bridges MIME→kind, the decider defers the network
> verdict to the existing `MediaDownloadPolicyEngine` + `NetworkConditionResolver`, no re-implementation;
> **UDF/instant-app** — pure decision, live `StateFlow` condition; **colour/UX coherence** — no UI in this slice
> (decision layer + service); **no coverage floor lowered, no test weakened**). **Next slice:** the chat media
> view that consumes the decider (the actual auto-DL trigger + a manual-download affordance for SKIP_POLICY),
> in-place crop/resize/compress before upload (§K polish), or a §L row (crash-report diagnostics viewer; static
> screens: Help/ToS/Privacy/licenses/About).

> On 2026-07-11 **avatar + banner upload** landed (slice `profile-avatar-banner-upload`, feature-parity §K —
> "Edit profile (avatar + banner upload …)", the last unshipped leg of profile editing). Port of iOS
> `AttachmentUploader` + `UserService.updateAvatar`, generalised to a banner (iOS uploads only a single
> compressed JPEG avatar, no banner). Four pure `:core:model` SSOTs: `ImageUploadTarget` (AVATAR/BANNER with
> per-target `maxBytes` — 8 MiB / 12 MiB), `ImageUploadValidator` (priority-ordered gate: empty → non-image →
> oversize → Accepted; MIME parsed before any `;` param + case-folded, so `video/mp4`/blank are rejected and a
> 10 MiB image passes as a banner yet fails as an avatar), `AvatarBannerUpload.firstUploadedUrl` (first
> non-blank uploaded URL else `null`, so a degenerate response is treated as a failure not a blank link), and
> `AvatarBannerApply.apply` (the optimistic-paint merge SSOT mirroring `ProfileEditApply` — overwrites only the
> targeted `avatar`/`banner` field). Orchestration: a dedicated `AvatarBannerUploadViewModel`
> (`:feature:profile`, UDF immutable `AvatarBannerUploadUiState`) validates the pick (reject → typed
> `ImageUploadError`, **no network touched**) → uploads via the **existing** `MediaRepository`/`MediaApi`
> (reused unchanged) → paints the returned URL optimistically onto the session → confirms with the **existing**
> `UserRepository.updateAvatar`/`updateBanner` PATCH (the "which endpoint" routing is the VM's orchestration,
> not the pure enum) → adopts the server's canonical identity, or rolls the session back to the snapshot on
> failure; a single-flight guard drops a second pick mid-flight and `viewModelScope` work rethrows
> `CancellationException`. `ProfileScreen` glue (coverage-exempt): the edit-mode avatar is tappable (Indigo
> camera badge + spinner overlay while uploading) via `PickVisualMedia` image-only, plus a "Change cover photo"
> banner button; errors surface in the snackbar. Added `androidx.activity.compose` to the profile module for
> the picker. **+36 tests** (ImageUploadValidator 14, AvatarBannerApply 4, AvatarBannerUpload 4,
> AvatarBannerUploadViewModel 14), all green; full `:app:assembleDebug` + all-module `testDebugUnitTest`
> BUILD SUCCESSFUL. A one-mutation RED check (removing the size branch) failed exactly the two size tests,
> confirming they are not tautological. Reviewer **PASS** (diff `apps/android` only — `:core:model`,
> `:feature:profile` [VM + screen glue + build.gradle picker dep + EN/FR/ES/PT strings]; no production logic
> outside; **SDK purity** — pure validator/apply/url-select in `:core:model`, "when to upload / which endpoint
> / cache→confirm cascade" orchestration in the VM, `MediaRepository` reused unchanged; **SSOT** —
> `AvatarBannerApply` mirrors `ProfileEditApply`, one validator gate, `MediaUpload` reused, no re-implementation;
> **UDF/instant-app** — immutable `StateFlow<UiState>`, optimistic URL paint before confirm with snapshot
> rollback; **colour/UX coherence** — Indigo accent camera badge, natural tap-to-change gesture, snackbar
> errors, stays in the edit form so no dead end; **no coverage floor lowered, no test weakened**).
> **Next slice:** the in-place crop/resize/compress step before upload (§K polish), the live
> `ConnectivityManager`-backed `NetworkConditionMonitor` + first media-pipeline consumer of
> `MediaDownloadPolicyEngine` (§L), or another §K/§L row (crash-report diagnostics viewer; static screens:
> Help/ToS/Privacy/licenses/About; §K device-sessions / 2FA / voice-cloning).

> On 2026-07-11 **media cache management** landed (slice `settings-media-cache`, feature-parity §L — "Media
> cache management (clear cached images/audio/video/thumbnails)"). Port of iOS `DataStorageView` +
> `CacheCoordinator.clearAll`, **surpassing iOS**: iOS shows **no sizes** and offers only a single "clear all"
> (its own audit note flags a size readout as a future TODO — `DiskCacheStore.estimatedDiskBytes()` is wired to
> nothing); Android shows the **total + every per-category size** and clears **per-category or all**. Two pure
> `:core:model` SSOTs — (1) `ByteSizeFormatter.format(bytes) → String`: the human-readable cache-size formatter,
> porting the shared iOS `ByteCountFormatter` convention (base **1024**, units KB/MB/GB only — no bytes unit, no
> TB, adaptive ~1 decimal with a trailing `.0` dropped and a space before the unit), negatives clamped to 0 and
> sub-KB still shown in KB; (2) `MediaCacheReport`/`MediaCacheCategory` (IMAGES/AUDIO/VIDEO/THUMBNAILS mirroring
> the iOS `CacheCoordinator` stores): per-category `Long` bytes with `of(map)` normalising every category present +
> negatives clamped, derived `totalBytes`/`isEmpty`/`nonEmptyCategories`, and an optimistic `withCleared(set)`
> projection. `:feature:settings` pure `MediaCacheScanner` — `sizeOf(File)` recursive `walkTopDown` sum (missing
> dir = 0) + `clear(File)` content-wipe-keep-dir (missing dir = no-op), exercised on **real temp directories** in
> the JVM tests. `MediaCacheStore`/`AndroidMediaCacheStore` (coverage-exempt I/O glue) maps the 4 categories to
> `cacheDir/image_cache` (Coil 2's default disk cache, **populated today**) + `cacheDir/media/{audio,video,
> thumbnails}` (pipeline-ready folders — scanning/clearing a not-yet-created folder is a graceful no-op, so the
> feature is honest today and forward-compatible), reads/deletes on `Dispatchers.IO`. `MediaCacheViewModel` (UDF
> immutable `MediaCacheUiState`): init scan; `refresh()` is stale-while-revalidate (keeps the prior report visible
> while re-scanning); a clear is **optimistic** — the target categories are zeroed in state immediately (snapshot
> kept), the disk delete runs, then a re-scan reconciles; clearing an already-empty category is inert, a second
> clear while one is in flight is ignored (single-flight `clearing` guard), any failure rolls the report back and
> raises a targeted `MediaCacheError` (SCAN/CLEAR), and `viewModelScope` work rethrows `CancellationException` so a
> torn-down scope never leaves a spurious error. `MediaCacheScreen` (glue): amber info card (mirroring iOS copy),
> Indigo total card, per-category rows (icon + label + size + an inline destructive clear that becomes a spinner
> while clearing), a destructive `ErrorStrong` clear-all button gated on `canClear` behind an `AlertDialog`
> confirmation (mirroring iOS's confirm). Wired the **two** previously no-op Settings → Data rows ("Clear media
> cache" + "Storage used") to the new `Routes.MEDIA_CACHE`. **+43 tests** (ByteSizeFormatter 15, MediaCacheReport
> 11, MediaCacheScanner 6, MediaCacheViewModel 11), all green; full `assembleDebug` + all-module
> `testDebugUnitTest` run for verification. Reviewer **PASS** (diff `apps/android` only — `:core:model`,
> `:feature:settings` [store/scanner/VM/screen/DI module], `:app` nav wiring, EN/FR/ES/PT strings; no production
> logic outside; **SDK purity** — pure formatter + report in `:core:model`, pure opaque-`File` scanner + product
> orchestration (dir layout, "when to clear", cache→re-scan cascade) in `:feature:settings`, no SDK leakage;
> **SSOT** — one `ByteSizeFormatter` formats every size, one `MediaCacheReport` owns the derivations, no
> re-implementation; **UDF/instant-app** — immutable `StateFlow<UiState>`, SWR refresh keeps data visible, skeleton
> only on cold empty; **colour/UX coherence** — amber storage-info + Indigo total + `ErrorStrong` destructive
> actions, natural row→screen→back, confirmation before the sweep, no dead end; **no coverage floor lowered, no
> test weakened**). **Next slice:** the live `ConnectivityManager`-backed `NetworkConditionMonitor` + first
> media-pipeline consumer of `MediaDownloadPolicyEngine`; avatar/banner upload (media pipeline) for §K profile
> edit; or another §L row (crash-report diagnostics viewer, static screens: Help/ToS/Privacy/licenses/About).

> On 2026-07-11 **GDPR data export** landed (slice `settings-data-export`, feature-parity §L — "GDPR data
> export (JSON/CSV, selectable scope, share/save file)"). Port of iOS `DataExportView` + `DataExportService`,
> **surpassing iOS twice**: iOS's share wrapper dropped the actual profile/messages/contacts payload (shared
> only the summary counts) — Android shares the **full** payload; and it shares a real **file** via
> FileProvider, not truncatable `EXTRA_TEXT`. Three pure `:core:model` SSOTs — (1)
> `DataExportRequestBuilder.build(selection) → DataExportQuery`: the always-on `profile` rule +
> `types` order `profile,messages,contacts` + `format` token, mirroring the gateway `parseTypes`
> (routes/me/export.ts); (2) `DataExportData` (+ `ExportedProfile`/`ExportedMessage`/`ExportedContact`): the
> full response model, timestamps kept as raw ISO strings so the payload re-serialises losslessly to the
> export file; (3) `DataExportFileBuilder.build(data) → ExportArtifact`: fileName from a filesystem-safe stamp
> of the ISO `exportDate` (date part before `T`, `[0-9A-Za-z-]` only, blank/all-illegal → plain base name),
> `text/csv` when the server returned a non-empty `csv` map else an `application/json` re-encoding of the whole
> payload (so a CSV request that came back with no sections is never an empty file). `:core:network`
> `DataExportApi` (`GET me/export`, registered in `MeeshyApi` + `NetworkModule`); `:sdk-core`
> `DataExportRepository` is **deliberately online** + session-gated (the gateway builds the export on demand
> from a live DB read — nothing to defer; no session → inert `null`, never a guaranteed `401`).
> `:feature:settings` `DataExportViewModel` (UDF immutable `DataExportUiState`; `canSubmit` blocks a double-tap;
> `setFormat`/`toggleMessages`/`toggleContacts` **invalidate a stale artifact** so the user can never share a
> file that doesn't match the current scope; re-selecting the current format is inert and keeps a ready artifact;
> failure → NETWORK/GENERIC, no-session → GENERIC defensively) + `DataExportScreen` (glue: Indigo info card,
> format picker, content toggles with profile pinned-on-and-disabled, an export button, and a success summary
> card whose Share action writes the artifact to `cacheDir/exports` and launches the chooser). Added a
> FileProvider (`${applicationId}.fileprovider` + `res/xml/file_paths.xml`) to the app module and wired the
> previously no-op Settings → Data "Export my data" row (`Routes.DATA_EXPORT`). **+34 tests** (RequestBuilder 7,
> FileBuilder 8, DataDecode 3, Repository 4, ViewModel 12), all green; `:app:assembleDebug` BUILD SUCCESSFUL.
> The two `:sdk-core` DataStore-store tests that failed under full-suite parallel load
> (`MediaDownloadPreferencesStoreTest`/`ThemeStoreTest`) are the **documented** pre-existing flake
> (NOTES §DataStore-under-parallel-load, lines 127/283/528) — green in isolation, rotating victim between runs,
> untouched by this slice (it adds no DataStore store). Reviewer **PASS** (diff `apps/android` only —
> `:core:model`, `:core:network`, `:sdk-core`, `:feature:settings`, `:app` nav + manifest FileProvider +
> file_paths.xml, EN/FR/ES/PT strings; no production logic outside; **SDK purity** — pure opaque-param builders
> + response model + file builder in `:core:model`, online session-gated repo in `:sdk-core`, "when to export /
> invalidate" orchestration in the VM, file-write + share intent in the exempt Compose glue; **SSOT** — one
> `DataExportRequestBuilder` drives the query, one `DataExportFileBuilder` drives the artifact, no
> re-implementation; **UDF/instant-app** — immutable `StateFlow<UiState>`, pure transitions; **colour/UX
> coherence** — Indigo brand card + accent-neutral toggles, Success-green ready card, natural row→screen→back,
> Share only shown once an artifact exists so no dead end; **no coverage floor lowered, no test weakened**).
> **Merge status (2026-07-11): ⚠ BLOCKED on a pre-existing `main`-side CI failure — NOT this slice's code.**
> **PR #1870** is open against `main`; local `:app:assembleDebug` + all touched-module tests are green, diff is
> `apps/android` only, reviewer PASS. CI is **red** solely on the **"Test gateway"** job:
> `CallEventsHandler.test.ts` throws `TypeError: Cannot read properties of undefined (reading 'PRESENCE_APP_STATE')`
> at `services/gateway/src/socketio/CallEventsHandler.ts:1275` — `CLIENT_EVENTS.PRESENCE_APP_STATE` is not defined
> in `packages/shared` (the shared events source/dist lacks the constant that `socket-rate-limiter.ts` + the tests
> already reference; likely a missing `packages/shared` build or an un-added constant). **This is reproduced on
> `main`'s own push CI** (run #6992, sha `286e25f8` — its *sole* failed job is "Test gateway"), so it is a
> pre-existing gateway/shared breakage, **not** caused by this PR (`git diff --name-only origin/main...HEAD` = 100%
> `apps/android`, zero TS/gateway/shared files). Per the hard rules the merge is held: **never merge past red CI**,
> and the fix lives in `services/gateway`/`packages/shared` — **production logic outside `apps/android`** this
> slice may not touch. **Next run: re-check PR #1870 — once `main`'s "Test gateway" job is green again (someone
> fixes the gateway/shared `PRESENCE_APP_STATE` constant, outside this Android track), squash-merge #1870, then
> advance.** Do NOT force-merge via `git push origin HEAD:main`, and do NOT fix the gateway bug from an
> `apps/android` slice. The Android code below is done and needs no rework.
> **Next slice (after the merge):** media cache management (§L — clear cached images/audio/video/thumbnails),
> the live `ConnectivityManager`-backed `NetworkConditionMonitor` + first media-pipeline consumer of
> `MediaDownloadPolicyEngine`, or avatar/banner upload (media pipeline) for §K profile edit.

> On 2026-07-11 **account deletion** landed (slice `settings-account-deletion`, feature-parity §L — "Account
> deletion (typed-phrase confirmation + email-confirmation flow)"). Port of iOS `DeleteAccountView` +
> `AccountService.deleteAccount`, wiring the previously no-op Settings → Danger zone "Delete account" row. Pure
> `:core:model` `AccountDeletionConfirmation` SSOT — `REQUIRED_PHRASE = "SUPPRIMER MON COMPTE"` (the gateway
> `z.literal` contract) + a **verbatim** `isConfirmed` gate (no trim/case-fold — a near-miss would be a guaranteed
> server `400`); the wire always carries the canonical literal, never the raw buffer, so gate ⇄ body can't diverge.
> `:core:network` `UserApi.deleteAccount` uses `@HTTP(method="DELETE", hasBody=true)` (Retrofit needs `@HTTP` to
> attach a body to a DELETE); `:sdk-core` `UserRepository.deleteAccount` is online-only (the gateway opens a 90-day
> grace period + mails a confirmation link — not optimistic/offline). `AccountDeletionViewModel` gates the
> destructive submit behind the phrase (double-tap safe), flips `isEmailSent` on success (no logout, mirroring
> iOS's email-confirmation state), and maps `409 → ALREADY_PENDING` / transport → NETWORK / else GENERIC — the
> distinct `ALREADY_PENDING` state surpasses iOS's single generic error. `AccountDeletionScreen` (glue): red
> danger warning card + monospace confirmation field + gated delete button, swapping to a "check your inbox"
> state. **+18 tests** (AccountDeletionConfirmation 8, AccountDeletionViewModel 10), `:app:assembleDebug` BUILD
> SUCCESSFUL. Reviewer **PASS** (diff `apps/android` only; SDK purity — pure gate in `:core:model`, online repo in
> `:sdk-core`, orchestration in the VM; SSOT — one gate drives match + wire literal; UDF; Error-red destructive UX,
> natural row→screen→back, no dead end; no coverage floor lowered, no test weakened). **Next:** media cache
> management (§L — clear cached images/audio/video/thumbnails), GDPR data export (§L), the live
> `ConnectivityManager`-backed `NetworkConditionMonitor` + first media-pipeline consumer of
> `MediaDownloadPolicyEngine`, or avatar/banner upload (media pipeline) for §K profile edit.

> On 2026-07-11 **profile share + QR code** landed (slice `profile-share`, feature-parity §K —
> "Profile QR code display + save/share; share profile via message/email/copy link"). This one
> **surpasses iOS**, which has no profile-share affordance at all. **(1) Pure `:core:model`
> `ProfileShareLink`** — the cross-platform link SSOT, mirroring the iOS `DeepLinkParser` contract
> (`https://meeshy.me/u/{username}` Universal Link + `meeshy://u/{username}` custom scheme, `u` = the
> AASA-claimed user segment) so a QR/link produced on Android resolves in every Meeshy client.
> `canonicalUsername` trims + strips a display-only leading `@` + blank/lone-`@` → `null`; `webLink`/
> `appLink` percent-encode the handle as an RFC 3986 path segment (unreserved passthrough, space→`%20`,
> non-ASCII→uppercase UTF-8 bytes, reserved delimiters→`%XX`) so an unusual handle can never emit a
> malformed URL. **(2) Pure `:feature:profile` `ProfileShareBuilder.build(user) →
> ProfileSharePresentation?`** (precedent `ProfileHeaderBuilder`) — projects `effectiveDisplayName`,
> `@handle` (from the same `canonicalUsername` SSOT, so handle ⇄ link never diverge), and both links;
> `null` when the username yields no shareable handle (share affordance stays hidden, no dead URL).
> **(3) Glue (coverage-exempt)** — `ProfileShareSheet` (ModalBottomSheet: zxing-rendered QR of the web
> link on a white card + `@handle` + link text + Copy-link/Share-chooser buttons), a **Share** app-bar
> action shown on both own and other profiles when a shareable link exists, EN/FR/ES/PT strings. Added
> the `com.google.zxing:core` dep (pure-Java QR encoder) to the profile module + version catalog.
> **+22 tests** (ProfileShareLink 16, ProfileShareBuilder 6), all green; `:app:assembleDebug` BUILD
> SUCCESSFUL. Reviewer **PASS** (diff `apps/android` only — `:core:model` link SSOT, `:feature:profile`
> builder+sheet+nav, version catalog + profile `build.gradle`, EN/FR/ES/PT strings; no production logic
> outside; **SDK purity** — pure opaque-string link primitive in `:core:model`, `MeeshyUser`-shaped
> projection in `:feature:profile`, QR/clipboard/intent orchestration in the exempt Compose glue;
> **SSOT** — one `canonicalUsername` drives handle + both links, link shape matches the iOS deep-link
> contract, no re-implementation; **UDF** — the sheet is derived from `state.user`, no VM change;
> **colour/UX coherence** — QR on a fixed-white card (scannability), accent-neutral outlined action
> buttons, natural bottom-sheet dismiss returns to the profile, Share shown wherever a profile is
> viewable so no dead end; **no coverage floor lowered, no test weakened**). **Next:** avatar/banner
> upload (media pipeline) for §K profile edit, or another §L row (media cache management, GDPR export),
> or the live `ConnectivityManager`-backed `NetworkConditionMonitor` + first media-pipeline consumer of
> `MediaDownloadPolicyEngine`.

> On 2026-07-11 **report a user** landed (slice `report-user`, feature-parity §K — "Block / unblock
> users; report a user (reason + details)", closing that box: block/unblock shipped earlier). Port of
> iOS `ReportUserView`, **corrected to the gateway contract**: iOS sends UPPERCASE `reportType` raw
> values (`"SPAM"`, `"HARASSMENT"`, `"INAPPROPRIATE_CONTENT"`…) that the gateway `createReportSchema`
> zod enum (`spam|harassment|inappropriate|…`) rejects — so an iOS user report is silently a `400`.
> Android's pure `:core:model` `ReportReason` carries the correct **lowercase** wire token per case;
> the pure `ReportRequestBuilder.forUser` SSOT projects (userId + reason + details) into the
> `POST /admin/reports` body — blank id → `null` (inert), details trimmed / blank→null / capped at 500
> (iOS editor-cap parity), null note omitted from the wire (`explicitNulls=false`). `:core:network`
> `ReportApi`; `:sdk-core` `ReportRepository.reportUser` is **deliberately online** (not a durable
> outbox action like block — a report expects an explicit "sent"/error, a silently-deferred one is
> worse UX), **session-gated** so a signed-out caller can't fire a guaranteed `401` (inert `null`).
> `:feature:profile` `ReportUserViewModel` (UDF immutable `ReportUserUiState`; `canSubmit` blocks a
> double-tap and a re-submit after success; failure/inert → retryable error; details cap enforced on
> input so field + wire agree) + `ReportUserScreen` (error-red reason radios + details field + live
> counter), reached from a **Report** app-bar action shown only on **another** user's profile (own
> profile keeps Edit). **+28 tests** (ReportReason 6, ReportRequestBuilder 9, ReportRepository 5,
> ReportUserViewModel 8), all green; `:app:assembleDebug` BUILD SUCCESSFUL; the two `:sdk-core`
> DataStore-store tests that flaked under full-suite parallel load are the **documented** pre-existing
> flake (NOTES §DataStore-under-parallel-load) — each green in isolation, rotating victim between runs,
> and untouched by this slice. Reviewer **PASS** (diff `apps/android` only — `:core:model`,
> `:core:network`, `:sdk-core`, `:feature:profile`, `:app` nav, EN/FR/ES/PT strings; no production
> logic outside; **SDK purity** — pure opaque-param builder in `:core:model`, online repository in
> `:sdk-core`, "when to submit / retryable" orchestration in the VM; **SSOT** — one `ReportReason`
> wire-token map + one `ReportRequestBuilder`, no re-implementation; **UDF** — immutable
> `StateFlow<UiState>`, pure transitions; **colour/UX coherence** — error-red destructive action,
> natural back/dismiss returns to the profile, Report only on foreign profiles so no dead end; **no
> coverage floor lowered, no test weakened**). **Next:** avatar/banner upload (media pipeline) for §K
> profile edit, or Profile QR code / share-profile (§K), or another §L row (media cache management,
> GDPR export), or the live `ConnectivityManager`-backed `NetworkConditionMonitor` + first
> media-pipeline consumer of `MediaDownloadPolicyEngine`.

> On 2026-07-11 **privacy-preferences backend sync** landed (slice `settings-privacy-preferences-sync`,
> feature-parity §L). Follow-up to `settings-privacy-preferences`: the device-local privacy block now
> propagates durably to the gateway (`PATCH /me/preferences/privacy`) through the offline outbox — it
> survives offline + process death instead of an online-first REST call a dropped connection would lose.
> **Key contract call — sync only the editable leg.** The gateway PATCH is a *partial merge*
> (`{...current, ...body}`), so the pure `:core:model` `PrivacyPreferenceSyncBody.from(prefs)` projects
> **only the twelve editable toggles** the user can change on Android (the `PrivacyCatalog` set) and
> deliberately **drops the read-only encryption leg** (`encryptionPreference`/`autoEncryptNewConversations`/
> `showEncryptionStatus`/`warnOnUnencrypted`) + local `extras`. A blind full-block push would have stamped
> the device's default encryption values over whatever the user set on web/iOS; omitting those keys leaves
> the server's encryption prefs untouched — a genuinely better contract than mirroring the notification
> full-block sync. **New `OutboxKind.UPDATE_PRIVACY_SETTINGS`** (not a reuse of notification's
> `UPDATE_SETTINGS`): both share the `SETTINGS` lane, but coalescing is per-kind — a distinct kind means a
> privacy sync can never supersede a pending notification sync for the same user (the collision a naive reuse
> would have caused). Wiring: `core/network` `PreferencesApi.updatePrivacy`; `OutboxLaneMap` assignment;
> `OutboxCoalescer` latest-snapshot replace rule; `OutboxFlushWorker` `UPDATE_PRIVACY_SETTINGS` sender
> (decode → `updatePrivacy` → Success/TransientFailure, bad payload → PermanentFailure); `:sdk-core`
> `PrivacyPreferencesSyncRepository` (session-gated durable enqueue keyed by own user id; inert/`null` with
> no session or blank id — mirrors `NotificationPreferencesSyncRepository`). `PrivacySettingsViewModel.setToggle`
> now persists to the device-local store instantly (UI SSOT) **then** enqueues the sync + wakes the worker on
> a real `cmid`; a no-op re-set neither writes, syncs, nor wakes. The PATCH is idempotent, so a delivery retry
> is harmless (no optimistic flip, no rollback on exhaustion). **+13 tests** (SyncBody 3 — per-field projection,
> encryption/extras dropped from the serialized keys, all-default projection; SyncRepository 5 — lane/kind/target/
> payload, distinct-kind guard, no-session/blank/superseded inert; VM +3 — persist-then-enqueue-then-wake,
> no-op never syncs, superseded/sessionless never wakes; Coalescer +2 — privacy latest-snapshot replace, privacy
> never coalesces a pending notification), all green; touched-module `testDebugUnitTest` + `assembleDebug` BUILD
> SUCCESSFUL. Reviewer **PASS** (diff `apps/android` only; **SDK purity** — pure opaque-param wire body in
> `:core:model`, stateless outbox/API building blocks + durable sync repo in `:sdk-core`, "when to sync / wake"
> orchestration in the VM; **SSOT** — one editable-toggle catalog drives both the local store and the wire body,
> no re-implementation; **UDF/instant-app** — device-local store stays the UI SSOT, sync never gates the repaint;
> **UX coherence** — unchanged accent-coherent switch screen; **no coverage floor lowered, no test weakened** —
> the existing 5 VM tests were kept and hardened with the new deps, +3 added). **Next:** avatar/banner upload
> (media pipeline) for §K profile edit, or another §L row (media cache management, GDPR export), or the live
> `ConnectivityManager`-backed `NetworkConditionMonitor` + first media-pipeline consumer of `MediaDownloadPolicyEngine`.

> On 2026-07-11 **privacy & visibility settings** landed (slice `settings-privacy-preferences`,
> feature-parity §L — "Privacy settings (visibility, contacts, media/data, encryption preference)").
> Port of iOS `PrivacySettingsView` + the editable legs of `PrivacyPreferences`. **Key SSOT call:
> the `PrivacyPreferences` data class already existed** in `:core:model` `Preferences.kt` (the full
> 16-field iOS port, part of the un-persisted `UserPreferences` tree — this slice is its **first**
> persistence consumer, so I built around it rather than redeclaring it; a naive parallel model
> would have collided and re-implemented the SSOT). **(1) Pure `:core:model` catalog + codec** —
> `PrivacyCatalog` (`PrivacyToggle` × `PrivacyCategory` = Visibility [5] / Contacts & groups [3] /
> Media & data [4]) with a per-toggle get/set lens (`isEnabled`/`set` edit exactly one boolean,
> never clobber) + a `sections()` grouped/ordered projection, and a corruption-safe JSON codec
> (`storageValue` / `privacyPreferencesFromStorage` — blank/absent/malformed → defaults, partial
> fills missing fields, unknown keys ignored). The iOS encryption leg is **deliberately not
> catalogued** — those model fields round-trip untouched but stay non-editable (iOS greys the
> section out, product decision 2026-06-14). **(2) Durable store** — `PrivacyPreferencesStore`
> (`:sdk-core`, interface + `InMemory` + `DataStore`-backed, hydrates on cold start, decodes through
> the pure codec so a corrupt value self-heals; Hilt provider on file `meeshy_privacy`). **(3) VM** —
> `PrivacySettingsViewModel` (`:feature:settings`) mirrors the store into an immutable
> `PrivacyUiState` and writes a per-toggle change through the catalog lens — the base is read
> **inside** the `viewModelScope.launch` so back-to-back different-toggle edits serialize and never
> clobber, and a re-set of a toggle's current value is an inert no-op. **(4) Screen + wiring** (glue,
> coverage-exempt) — `PrivacySettingsScreen` renders one accent-coherent section per category with
> Material `Switch` rows + a non-interactive coming-soon Encryption section, reached from a new
> "Privacy & visibility" row at the top of Settings → Privacy (`Routes.PRIVACY`). **+28 tests**
> (catalog/codec 16, store 7, VM 5), all green; `:app:assembleDebug` BUILD SUCCESSFUL; full
> `:core:model`, `:sdk-core`, `:feature:settings` `testDebugUnitTest` suites all green. Reviewer
> **PASS** (diff `apps/android` only — `:core:model` catalog+codec, `:sdk-core` store+DI,
> `:feature:settings` VM+screen, `:app` nav, EN/FR/ES/PT strings; no production logic outside; **SDK
> purity** — pure opaque-param building blocks in `:core:model`, durable store in `:sdk-core`,
> "which toggle / when to write" orchestration in the VM; **SSOT** — reuses the existing
> `PrivacyPreferences`, one catalog shared by screen+VM, no re-implementation; **UDF/instant-app** —
> immutable `StateFlow<UiState>`, cold-start hydration, no spinner; **colour/UX coherence** —
> accent-coherent per-category sections, natural switch taps, back returns to Settings; **no coverage
> floor lowered, no test weakened**). **Next:** a backend-sync path for the server-authoritative
> visibility prefs (analogous to `settings-notification-prefs-sync` — pure sync-body projection +
> `PATCH` + outbox `UPDATE_SETTINGS`-style lane), or the live `ConnectivityManager`-backed
> `NetworkConditionMonitor` + first media-pipeline consumer of `MediaDownloadPolicyEngine`, or
> avatar/banner upload for §K profile edit, or another §L row (media cache management, GDPR export).

> On 2026-07-11 **media auto-download preferences** landed (slice `settings-media-auto-download`,
> feature-parity §L — "Auto-download settings for media by type and connection"). Port of iOS
> `MediaDownloadSettingsView` + the `MediaDownloadPreferences`/`MediaDownloadPolicyEngine`/`NetworkConditionMonitor`
> SDK trio. **(1) Pure `:core:model` SSOTs** — `AutoDownloadPolicy` (always / wifiAndGoodCellular / wifiOnly /
> never) × `MediaKind` (image / audio / audioTranslation / video) → `MediaDownloadPreferences` (one policy per
> kind, iOS defaults [images+audio ride good cellular, audio-translations+video stay Wi-Fi], `policy(kind)` read
> lens + `withPolicy(kind, policy)` copy-lens), a corruption-safe JSON codec (`storageValue` /
> `mediaDownloadPreferencesFromStorage` — blank/absent/malformed/unknown-enum → defaults, partial fills missing
> kinds, unknown keys ignored), `MediaDownloadPolicyEngine.shouldAutoDownload(kind, condition, prefs)` (the 4×4
> policy×condition truth table + the offline gate, reading the per-kind policy), and
> `NetworkConditionResolver.resolveFromFlags(isSatisfied, isConstrained, usesWifi, usesCellular)` (the pure
> connectivity-flag → `NetworkCondition` resolver; iOS's carried-but-unused `isExpensive` arg intentionally
> **dropped** — a dead param isn't "better"). **(2) Durable store** — `MediaDownloadPreferencesStore`
> (`:sdk-core`, interface + `InMemory` + `DataStore`-backed), mirroring the notification store: hydrates the
> persisted block on cold start, decodes through the pure codec so a corrupt value self-heals to defaults; Hilt
> provider added. **(3) VM** — `MediaDownloadViewModel` (`:feature:settings`) mirrors the store into an immutable
> `MediaDownloadUiState` and writes a per-kind change through the store — the base is read **inside** the
> `viewModelScope.launch` so back-to-back different-kind edits serialize and never clobber each other's write (a
> genuine read-modify-write race the VM test caught when the base was read outside the launch), and a re-selection
> of the kind's current policy is an inert no-op. **(4) Screen + wiring** (glue, coverage-exempt) —
> `MediaDownloadScreen` renders one accent-coherent section per kind with a single-choice `RadioButton` policy
> list, reached from a new "Auto-download" row in Settings → Data (`Routes.MEDIA_DOWNLOAD`). **+37 tests**
> (engine 6, resolver 9, prefs/codec 10, store 7, VM 5), all green; `:app:assembleDebug` BUILD SUCCESSFUL; my
> touched-module `testDebugUnitTest` green (the `:sdk-core` full-suite `ThemeStoreTest`/`InterfaceLanguageStoreTest`
> DataStore timeouts are the known parallel-load flake — green on retry [528/528] and in isolation; my new store
> test is green even under full-suite load after a 15s timeout). Reviewer **PASS** (diff `apps/android` only —
> `:core:model` model+engine+codec, `:sdk-core` store+DI, `:feature:settings` VM+screen, `:app` nav; no production
> logic outside; **SDK purity** — pure opaque-param building blocks in `:core:model`, durable store in `:sdk-core`,
> "which policy / when to write" orchestration in the VM; **SSOT** — one preference block + one decision engine,
> no re-implementation; **UDF/instant-app** — immutable `StateFlow<UiState>`, cold-start hydration, no spinner;
> **colour/UX coherence** — accent-coherent per-kind sections, natural single-choice taps, back returns to Settings;
> **no coverage floor lowered, no test weakened**). **Next:** the live `ConnectivityManager`-backed
> `NetworkConditionMonitor` (thin glue over `NetworkConditionResolver`) + the first media-pipeline consumer of
> `MediaDownloadPolicyEngine.shouldAutoDownload` (attachment auto-DL gate), or avatar/banner upload for §K profile
> edit, or another §L row (Privacy settings, media cache management, GDPR export).

> On 2026-07-11 **change password with strength meter + validation** landed (slice
> `settings-change-password`, feature-parity §L). Port of iOS `ChangePasswordView` +
> `PasswordStrengthIndicator`, surpassing it with a SOTA gate iOS lacks (new password must differ from
> current). **(1) Pure `:core:model` SSOTs** — `PasswordStrength.evaluate(password) →
> PasswordStrengthLevel` (the 6-band meter, each of 6 heuristics +1, `min(score,5)`, empty → TOO_WEAK,
> a verbatim port of iOS's char-set/length scoring) and `ChangePasswordForm.validate(current, new,
> confirm) → ChangePasswordValidation` (per-rule flags + composite `canSubmit`). **(2) Online network
> path** — change-password can't be optimistic/offline (the gateway verifies the current password
> against the stored bcrypt hash), so it's a straight `apiCall`: `ChangePasswordRequest`/`Response`
> (`:core:model`), `UserApi.changePassword` (`PATCH /users/me/password`), `UserRepository.changePassword`.
> **(3) VM** — `ChangePasswordViewModel` (`:feature:settings`) derives the live strength + validation off
> the pure SSOTs, submits with a synchronous double-tap guard (`isSaving` set before the launch), clears
> the plaintext buffers on success, and maps failure → a targeted `ChangePasswordError` the screen
> localizes (HTTP 400 → INCORRECT_CURRENT, transport → NETWORK, else GENERIC). **(4) Screen + wiring**
> (glue, coverage-exempt) — `ChangePasswordScreen` (visibility toggles, 5-bar accent-coherent meter,
> per-rule hint rows, gated submit), reachable from a new "Change password" row in Settings → Privacy
> (`Routes.CHANGE_PASSWORD`). **+32 tests** (PasswordStrength 14, ChangePasswordForm 9,
> ChangePasswordViewModel 9), all green; `:app:assembleDebug` + all touched-module `testDebugUnitTest`
> BUILD SUCCESSFUL. Reviewer **PASS**. **Next:** avatar/banner upload (media pipeline) for §K profile
> edit, or another §L row — Privacy settings, auto-download preferences, or media cache management.

> On 2026-07-11 **interactive per-post language switching** landed (slice `feed-post-language-switch`,
> Translation §D — feature-parity.md "Per-post and per-story translation" interactive-switch arm now shipped).
> The 2026-07-10 `feed-post-language-strip` slice rendered a **read-only** flag strip under feed cards; the chat
> bubble's strip was already tappable (switch/revert the displayed language). This slice brings that gesture to
> posts. **(1) SSOT relocation** — the pure `LanguageFlagTapResolver` moved `:feature:chat`
> (`me.meeshy.app.chat.translation`) → `:sdk-ui` (`me.meeshy.ui.component.bubble`), made `public`: it is a
> stateless rule engine (opaque params, no shared singletons) and belongs beside `MessageLanguageStrip` as a
> building block shared by every language-strip surface — so chat **and** feed decode one flag-tap rule, zero
> re-implementation. `ChatViewModel`'s import updated; its resolver test moved to `:sdk-ui` (10 tests, still
> green). **(2) Pure core** — `FeedPostBuilder.build` gained `activeLanguageCode: String?` and a shared
> `resolveActiveCode(post, prefs, override) → String?` (the post sibling of the chat bubble's active-code
> computation): the override wins when it names a language the post carries (a translation or the original),
> else the default Prisme resolution (preferred translation, or original when none). The builder projects both
> the displayed `content` and the strip's `activeCodeOverride`/`showingOriginal` off that one code, so the text
> and the highlighted chip can never disagree. Read-only strip (`includeTranslatable = false`) → every visible
> chip has content → a tap is always Activate/Revert, never RequestTranslation. **(3) Wiring** — `FeedViewModel`
> holds a per-post `activeLanguageOverride: MutableStateFlow<Map<postId,code>>` folded into the feed `combine`
> (4-arg now) so a switch re-projects live; it is kept **outside** the cache stream so the viewer's choice
> **survives every background refresh / re-emit** (instant-app: no reset on sync). `onPostFlagTap(postId, code)`
> resolves against `latestPosts` + the shared resolver and applies Activate → set / Revert → clear on the
> override map; unknown post or blank code is inert. **(4) UI** (glue, coverage-exempt) — `FeedScreen`'s
> `PostLanguageStripRow` chips are now `.clickable { onChipTap(chip.code) }`, threaded through `PostCard` to
> `viewModel::onPostFlagTap`. **+19 tests**: `FeedPostBuilderTest` +8 (null-override → default / override
> switches content+strip to another configured language / override → original shows original & highlights
> original chip / override without content falls back to default / case-insensitive+trim override /
> `resolveActiveCode` override-with-content-wins / falls-back-to-preferred / null → preferred / null-no-preferred
> → original), `FeedViewModelTest` +5 (tap switches displayed language / tap active reverts / unknown post inert
> / blank code inert / override survives a stream re-emission), `LanguageFlagTapResolverTest` 10 relocated
> (unchanged, still green). **RED verified**: the new tests reference `activeLanguageCode`/`resolveActiveCode`/
> `onPostFlagTap` absent on `main` (compile-RED); the switch/revert assertions fail against the read-only
> pre-slice builder. `:sdk-ui` + `:feature:feed` + `:feature:chat` `testDebugUnitTest` → **BUILD SUCCESSFUL**;
> `:app:assembleDebug` → **BUILD SUCCESSFUL**. Reviewer: **PASS** (diff `apps/android` only — a `:sdk-ui` resolver
> relocation + `:feature:feed` builder/VM/screen, `:feature:chat` import-only, no production logic outside;
> **SDK purity** — the resolver is a stateless building block with opaque params now correctly homed in `:sdk-ui`,
> the *when-to-switch* orchestration (override map, "survive re-emit") stays in the feed VM; **SSOT** — one
> `LanguageFlagTapResolver` + `resolveActiveCode` shared by chat & feed, reuses `PostLanguageStrip`/
> `LanguageResolver`, no re-implementation; **UDF/instant-app** — immutable per-post override in state, cache-first
> re-projection, choice survives refresh, no spinner; **colour/UX coherence** — accent-coherent tappable chips,
> one coherent primary-language view (surpasses iOS's two-tier secondary panel), natural tap-to-switch/tap-to-revert
> gesture; **no coverage floor lowered, no existing test weakened**). **Next:** the interactive `includeTranslatable`
> arm for posts (tap a configured-but-absent language → on-demand request; needs a post-translation request path),
> the per-story timeline language strip, or persisted translations across cold start (§D "offline Prisme").

> On 2026-07-10 **the per-post Prisme language flag strip** landed (slice `feed-post-language-strip`,
> Translation §D — feature-parity.md "Per-post and per-story translation" read-only flag-strip arm now
> shipped). The feed card showed a **binary** "Translated" label (icon + text) when a post resolved to a
> translation; it never surfaced *which* languages the post carried or which one the viewer was reading —
> the chat bubble already had the far richer `MessageLanguageStrip`. This slice brings the same Prisme
> strip to posts. **(1) Pure core** — new `:sdk-ui` `PostLanguageStrip.build(originalLanguage,
> translations, preferences, showingOriginal, activeCodeOverride, includeTranslatable) → List<LanguageChip>`,
> the post sibling of `MessageLanguageStrip`. Posts store translations as a language-keyed
> `Map<String, ApiPostTranslationEntry>` (vs. the message list form), so the builder adapts the map into
> `LanguageResolver.TranslationLike` rows and **delegates to `MessageLanguageStrip.build`** — one strip
> algorithm, zero re-implementation (SSOT). The read-only default surfaces the post's original + each
> configured content language that actually has content, and returns **empty** when the post is not
> translated for the viewer (Prisme rule 1 — show the original, nothing to explore), the *same* predicate
> `ApiPost.isTranslated` already uses, so the strip and the translated flag can never disagree. **(2)
> Wiring** — `FeedPostBuilder` computes `languageStrip` into the immutable `FeedPostPresentation` (pure,
> unit-tested), keeping the Compose layer dumb. **(3) UI** (glue, coverage-exempt) — `FeedScreen` renders
> the chips as an accent-coherent strip (a lead-in translate glyph + flag per chip; the active language
> reads its native name in the language accent colour via `LanguageData.colorHex`), replacing the old
> binary label; read-only, mirroring the chat bubble's read-only strip. **+15 tests**: `PostLanguageStripTest`
> 13 (no-map → empty / empty-map → empty / no-preferred → empty [Prisme rule 1] / blank-entry → empty /
> anchors original + marks preferred active / case-insensitive map key / showingOriginal flips active to
> original / activeCodeOverride wins / read-only omits configured-but-absent / includeTranslatable appends
> translatable / no original chip when originalLanguage null / carries LanguageData metadata),
> `FeedPostBuilderTest` +2 (translated post carries strip anchoring original+preferred / untranslated post
> → empty strip). **RED verified**: `PostLanguageStripTest` references a symbol absent on `main`
> (compile-RED); the `FeedPostBuilder` strip assertions fail against the pre-slice presentation (no
> `languageStrip` field). Full `assembleDebug` + all-module `testDebugUnitTest` → **BUILD SUCCESSFUL**
> (the lone `:sdk-core:ThemeStoreTest` DataStore timeout is the known environmental flake — NOTES.md
> 2026-07-06 — green in isolation; my diff never touches `:sdk-core`). Reviewer: **PASS** (diff
> `apps/android` only — `:sdk-ui` builder+test, `:feature:feed` presentation/screen/test, no production
> logic outside; **SDK-purity** — the builder is a stateless building block with opaque params in `:sdk-ui`
> delegating to the `MessageLanguageStrip` SSOT, the *when-to-show* orchestration stays in `FeedPostBuilder`;
> **SSOT** — reuses `LanguageResolver`/`MessageLanguageStrip`/`LanguageData`, no re-implementation; **UDF**
> immutable presentation, pure projection; **instant-app** — computed synchronously in the presentation, no
> spinner; **colour/UX coherence** — accent-coherent chips, coherent with the chat strip; **no coverage
> floor lowered, no existing test weakened**). **Next:** the interactive `includeTranslatable` arm for
> posts (tap a configured-but-absent language → on-demand request, needs a post-translation request path),
> the per-story timeline language strip, or persisted translations across cold start (§D "offline Prisme").

> On 2026-07-10 **live cloned-voice audio translation** landed (slice `chat-live-audio-translation`,
> Translation §D — feature-parity.md "Real-time progressive translation/transcription socket updates" audio-voice
> arm now shipped; the last dead `MessageSocketManager` flow is now wired). A voice note reaches the client in its
> original language; when the translator finishes a **voice-cloned** rendering in a requested language, the gateway
> pushes `audio:translation-ready` and the open audio bubble now plays the viewer's-language cloned voice the
> instant it lands. **Root cause it was dead:** the Android `AudioTranslationEvent` was **flat**
> (`targetLanguage`/`audioUrl`) but the gateway nests the payload under `translatedAudio` with the target language
> at the top-level `language` (shared `AudioTranslationEventData`), so every frame threw `MissingFieldException` at
> decode and was silently dropped — the flow existed but never delivered. **(1) Model** — reshaped
> `AudioTranslationEvent` to the real nested shape (`translatedAudio: TranslatedAudioPayload`, top-level
> `language`), all fields lenient-defaulted so a malformed frame decodes to blanks and is dropped by the merge
> no-op instead of throwing. **(2) Pure core** — new `:core:model`
> `AttachmentAudioTranslationMerge.mergeAudioTranslation(...) → ApiMessage?`, the audio sibling of
> `AttachmentTranscriptionMerge`: upserts the cloned-voice `ApiAttachmentTranslation` (`type="audio"`, url,
> transcription, cloned, quality, ttsModel…) into the target audio attachment's `translations` map (case-
> insensitive key, order preserved). **No-op (→ null)** on a deleted tombstone, blank language, **blank url**
> (never store an unplayable translation), no matching/audio target, or an identical entry already present
> (idempotent — same url + transcription). Target selection mirrors the transcription merge (explicit id → first
> audio attachment). **(3) Projection** — `:sdk-ui` `BubbleContentBuilder.resolveTranslatedAudio` +
> `BubbleAudio.isAudioTranslated`/`audioLanguage`: the played `url` resolves to the preferred-language cloned
> voice (the **original** voice wins when it is the top preference), the cloned-voice `durationMs` overrides the
> original when a translation plays, and it iterates the same preferred order as `resolveTranscription` so the
> played voice and the surfaced transcription line always agree. Android plays the viewer's-language voice by
> default — iOS defaults to the original and requires a manual language pick, so this **surpasses** it. **(4)
> Repo/VM** — `:sdk-core` `MessageRepository.applyAudioTranslation` applies it via `updateCachedMessage` (no
> outbox — inbound server truth); `ChatViewModel` collects `audioTranslationReady` conversation-scoped, next to
> the translation/transcription collectors. **+37 tests**: `AttachmentAudioTranslationMergeTest` 18 (single-audio
> fallback / by-id / unknown-id→no-op / blank-id+no-audio→no-op / blank-language→no-op / blank-url→no-op /
> whitespace-url→no-op / deleted→no-op / identical→no-op / case-insensitive-key idempotent / new-url replaces in
> place under existing key / differing-transcription replaces / new-language appends preserving existing / stamps
> format+cloned+quality+voiceModelId+ttsModel+duration / language-key-trimmed / other-attachments preserved /
> unrelated-fields preserved), `AudioTranslationEventTest` 2 (nested gateway JSON decodes to the flat-consumable
> event / missing-translatedAudio → blank defaults not a throw — locks the wire contract that was broken),
> `BubbleContentBuilderTest` +8 (plays preferred cloned voice / original-is-top-pref keeps original / translation
> with transcription-but-no-url keeps original voice yet shows translated text / blank-url falls back / cloned-
> voice duration overrides / case-insensitive key / highest-priority pref wins / no-translations keeps original),
> `MessageRepositoryTest` +4 (upserts without outbox / single-audio fallback / unknown-message inert / blank-url
> inert), `ChatViewModelTest` +2 (applies in open conversation / ignores elsewhere) + 3 mock-wiring. **RED
> verified**: the new tests reference symbols absent on `main` (`AttachmentAudioTranslationMerge`,
> `applyAudioTranslation`, `isAudioTranslated`, `audioLanguage`, the reshaped `AudioTranslationEvent`) — compile-
> RED; the projection tests fail behaviourally against the old `buildAudio` (which always used `fileUrl` and never
> resolved a translated source). Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL. Reviewer:
> PASS (diff `apps/android` only; **SDK purity** — the merge is a stateless rule engine with opaque params in
> `:core:model`, the projection an opaque-param builder in `:sdk-ui`, the *when-to-apply* orchestration in the VM;
> **SSOT** — reuses `LanguageResolver.preferredContentLanguages` + `updateCachedMessage`, no re-implementation;
> **UDF/instant-app** — live cache-stream re-render, no blocking spinner; **UX coherence** — one natural bubble,
> played voice ↔ transcription line agree; **no coverage floor lowered, no existing test weakened**). **Next:** the
> per-post / per-story translation flag strip (§D "Per-post and per-story translation"), or the audio-translation
> **failed** arm (`audio:translation-failed` → clear the processing spinner + retry affordance), or persisted
> translations/transcriptions/audio across cold start (§D "offline Prisme").

> On 2026-07-10 **the per-message language explorer sheet** landed (slice `chat-message-detail-explorer`,
> Translation §D — feature-parity.md "Message detail: per-language translation explorer + on-demand translate
> / retranslate" now fully shipped). The prior slices left the flag strip tappable and on-demand translation
> live, but there was no exhaustive **explorer** view (iOS `MessageLanguageDetailView`, long-press → per-
> language list). This slice ships it. **(1) Pure core** — new `:sdk-ui` `MessageDetailExplorer.build(...) →
> MessageLanguageExplorer(originalCode, originalInfo, originalPreview, rows)`, a stateless projection (opaque
> params: translations, in-flight codes, selected code — no "when" decision, so it sits beside
> `MessageLanguageStrip` as a building block). Android's deliberate improvement over iOS's fixed 18-language
> table: the viewer's **configured** content languages (system → regional → custom) lead the row order, then
> the remaining `candidates` (default `LanguageData.allLanguagesCommonFirst`) — a preference-led ordering, not
> a hand-curated list. Each `LanguageExplorerRow` carries `info`, a truncated `preview` (null when no content),
> `hasContent`, `isTranslating`, `isSelected`, and `canRetranslate` (content ∧ not-in-flight). The original is
> excluded from the rows and surfaced as the banner; the banner preview is the text content, or the
> transcription when content is blank, or empty. Normalizes/dedups codes (case+trim), matches translations
> case-insensitively, treats blank translations as no-content, and boundary-truncates the preview with a "…".
> **(2) Wiring** — `ChatViewModel` gained `explorerMessageId` + `openLanguageExplorer`/`dismissLanguageExplorer`,
> surfaced the in-flight `translatingLanguages` set into `ChatUiState` (so the sheet's spinners are honest, not
> a dead affordance — refactored the private mutable set to state-backed), and projects the explorer reactively
> into `ChatUiState.languageExplorer` off a new `latestMessagesFlow` mirror + the translating set + the active
> override (rebuilds live when a translation lands). Row select/translate **reuse** `onFlagTap` (SSOT — the
> same Activate/Revert/RequestTranslation resolver); new `onExplorerRetranslate` forces a fresh translate even
> when content already exists (unlike `onFlagTap`, which would only switch) — a differing result re-renders
> live off the cache stream, an identical one is an inert repo no-op, and an in-flight request is not
> duplicated. **(3) UI** (glue, coverage-exempt) — message-actions sheet gained an "Explore languages" action
> opening `MessageLanguageExplorerSheet`: accent-coherent original banner + per-language rows with preview /
> spinner / retranslate icon / "Translate" pill, one natural single-sheet gesture, no dead end (dismiss returns
> to the conversation). **+31 tests**: `MessageDetailExplorerTest` 21 (banner text/transcription/empty fallback,
> original excluded + normalized + unknown-code + blank, configured-first ordering, configured-not-in-candidates,
> content+truncation, exact-boundary-not-truncated, blank→no-content, translatable-not-retranslatable,
> retranslatable, in-flight blocks retranslate, selected normalized/none, dedup, case-insensitive target,
> empty-candidates+empty-prefs→fallback), `ChatViewModelTest` +10 (open closes action sheet, dismiss clears,
> retranslate refetches-even-with-content + switches, unknown/blank inert, second-tap no-dup, failure→error +
> clears marker, explorer projects model, clears on dismiss, marks in-flight language translating). **RED
> verified**: `MessageDetailExplorerTest` references a symbol absent on `main` (compile-RED); the retranslate
> VM test asserts `requestTranslation` is called for an already-translated language — behaviour `onFlagTap`
> never produces (it would resolve to Activate, no network), so it fails against any select-only wiring. Full
> `assembleDebug` + all-module `testDebugUnitTest` → **BUILD SUCCESSFUL**. Reviewer: **PASS** (diff
> `apps/android` only — `:sdk-ui` detector+test, `:feature:chat` VM wiring + Compose sheet + strings, no
> production logic outside; **SDK-purity** — the projection is a stateless building block with opaque params in
> `:sdk-ui`, the *when-to-open / when-to-retranslate* orchestration stays in the VM; **SSOT** — reuses
> `LanguageResolver`/`LanguageData`/`onFlagTap`/`requestTranslation`, no re-implementation; **UDF** immutable
> `StateFlow` model, pure transitions; **instant-app** — the explorer rebuilds live off the cache stream, no
> blocking spinner; **colour/UX coherence** — accent-coherent rows, natural single-sheet gesture, dismissal
> returns to a coherent place; **no coverage floor lowered, no existing test weakened**). **Follow-up:**
> audio-transcription banner for voice messages (needs attachment-transcription plumbing into `ApiMessage`),
> and per-post / per-story explorer parity. **Next:** progressive **audio-voice translation**
> (`audio:translation-ready` → cloned-voice playback, needs BubbleAudio UI), or the per-post translation strip.

> On 2026-07-10 **compose-language detection for outbound stamping** landed (slice
> `chat-compose-language-detection`, Translation §D — feature-parity.md "Source-language stamping from in-app
> prefs" now shipped). `ChatViewModel.send()` stamped `originalLanguage = user.systemLanguage ?:
> LanguageResolver.FALLBACK_LANGUAGE` — **two Prisme bugs in one line**: (1) it bypassed the resolution chain,
> so a user with no `systemLanguage` but a `regionalLanguage`/`customDestinationLanguage` had every outgoing
> message mis-stamped `fr`; (2) it never inspected the composed text, so a French-configured user typing
> Spanish stamped `fr` and readers got a broken auto-translation. **(1) Pure core** — new `:core:model`
> `ComposeLanguageDetector.detect(text, fallback): String`, a faithful port of the shared web heuristic
> `apps/web/utils/language-detection.ts`: `detectLanguage`'s per-language script + stopword regex scoring
> (fr/es/de/it/pt/ru/ar/zh/ja/ko — verbatim table, incl. ASCII `\b` semantics matching JS) wrapped by
> `detectComposeLanguage`'s compose guards — strip `https?://\S+`, require ≥4 `\p{L}` letters else fallback,
> pick the highest-scoring language (earliest-declared wins a tie, matching the web insertion order), and bound
> the result through `LanguageData.info` so it is **always** a supported code or the fallback verbatim. iOS
> uses `NLLanguageRecognizer` and web uses `tinyld`; neither is a pure JVM dependency, so Android ports the
> hand-rolled heuristic that the web source itself ships as the "fallback basique". **(2) Wiring** — `send()`
> now stamps `ComposeLanguageDetector.detect(text, fallback = LanguageResolver.resolveUserLanguage(user))`:
> detection first, sender's **resolved** content language (system → regional → custom → `fr`, NEVER device
> locale — Prisme rule 2) as the fallback. The forward path (line ~794, which preserves the *source* message's
> `originalLanguage`) is deliberately untouched — a forward keeps the original author's language, not the
> forwarder's. **+19 tests**: `ComposeLanguageDetectorTest` 17 (fr/es/de/it/pt/ru/ar/zh/ja/ko detection ×10 /
> blank→fallback / below-min-alpha→fallback / URL-only-stripped→fallback / unrecognized-Latin→fallback /
> case-insensitive / higher-score-wins / detected-code-always-supported invariant), `ChatViewModelTest` +2
> (Spanish text by an `fr` user → stamped `es`; regional-only user + undetectable `"hello"` → stamped `de`, the
> pre-fix `fr` bug). The pre-existing `send_dispatches...` test (`"hello"` → `"fr"`) stays **green unchanged**:
> English is not a scored pattern → `"hello"` scores 0 → detector returns the fallback, which for the
> `systemLanguage="fr"` user resolves to `"fr"` (faithful behaviour, not luck). **RED verified**: the new
> `ComposeLanguageDetectorTest` references a symbol absent on `main` (compile-RED); the two new VM tests fail
> against `main`'s `systemLanguage ?: "fr"` stamp (`fr` ≠ `es`, `fr` ≠ `de`) — behavioural, not tautological.
> Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL. Reviewer: PASS (diff `apps/android`
> only — `:core:model` detector + test, `:feature:chat` VM one-line wiring + 2 tests; **SDK purity** — the
> detector is a stateless rule engine with opaque params `(text, fallback)`, no product decision → `:core:model`
> building block; the *when/what-fallback* decision stays in the VM; **SSOT** — fallback via
> `LanguageResolver.resolveUserLanguage`, supported-set via `LanguageData`, no re-implementation; **no coverage
> floor lowered, no existing test weakened**). **Next:** the message detail explorer sheet (per-language
> translate/retranslate), or progressive **audio-voice translation** (`audio:translation-ready` → cloned-voice
> playback, needs BubbleAudio UI).

> On 2026-07-10 **on-demand translation of an absent language** landed (slice `chat-on-demand-translate`,
> Translation parity §D — feature-parity.md "Original exploration" on-demand-translate now shipped, "Message
> detail explorer" on-demand arm now live). The prior slice left `LanguageFlagTapResolver.RequestTranslation`
> tested but **inert**: the strip only surfaced languages that already had content, so a content-less flag was
> never tappable. This slice makes the arm live end-to-end. **(1) Strip projection** — `MessageLanguageStrip.build`
> gained `includeTranslatable: Boolean = false`: when true, the viewer's configured content languages that have
> **no content yet** are appended as **translatable chips** (`LanguageChip.isTranslatable = true`, never
> `isActive`/`isOriginal`), interleaved in configured-preference order (original → system → regional → custom),
> still bounded to the viewer's own ≤3 configured languages (discrete, not a dump). Default false keeps the
> read-only projection **byte-identical** — every one of the 20 prior strip tests + all builder tests stay green
> unchanged; `BubbleContentBuilder.build` opts in (`includeTranslatable = true`) as the sole interactive caller.
> **(2) Repository** — new `:sdk-core` `MessageRepository.requestTranslation(messageId, targetLanguage): Boolean`:
> reads the cached message (`cachedMessage` helper, outside any transaction), blocking-translates its original
> text via the existing `TranslationApi` (`translate-blocking`), then upserts the result through
> `MessageTranslationMerge` + `updateCachedMessage` — the **same** live re-render path as an inbound
> `message:translated`, **no outbox** (a derived translation is server truth, never a local mutation to replay).
> Returns `false` (inert, nothing stored) on unknown/deleted message, blank target, network failure, a blank
> translator result, or an idempotent no-op (translation already matches cache). `TranslationApi` joins the
> constructor (Hilt already provides it; only the one positional test helper needed updating). **(3) VM** —
> `ChatViewModel.onFlagTap`'s `RequestTranslation` branch now calls `requestOnDemandTranslation`, a
> `viewModelScope` effect that requests the translation then sets `activeLanguageOverride[id]=lang` on success so
> the bubble switches to the freshly-merged language (arriving via the cache stream — the translatable chip
> becomes a live content chip). An **in-flight guard** (`translatingLanguages` set, key `"$id|$lang"`, added
> synchronously before `launch`) drops a duplicate request from a second tap; `CancellationException` rethrown,
> failures caught to `errorMessage`. **(4) UI** — translatable chips render as a dimmed flag + "＋" affordance in
> `MessageBubble.LanguageStrip` (Compose glue, coverage-exempt). +19 tests: `MessageLanguageStripTest` +7
> (includeTranslatable-surfaces / never-active-or-original / content-not-marked-translatable / interleave-order /
> override-never-activates-translatable / original-never-translatable / [existing default-false stays excluded]),
> `BubbleContentBuilderTest` +1 (builder surfaces translatable chip), `MessageRepositoryTest` +7 (stores+success /
> translator-fail→false+nothing-stored / unknown→no-call / deleted→inert+no-call / blank-target→inert+no-call /
> blank-result→ignored / idempotent→false+no-dup), `ChatViewModelTest` +4 (strip offers translatable chip / tap
> requests+switches / failed-request leaves active unchanged / second-tap-in-flight no duplicate). Full
> `assembleDebug` green; the three changed test classes green in isolation (`MessageLanguageStripTest`,
> `BubbleContentBuilderTest`, `MessageRepositoryTest`, `ChatViewModelTest`). The full-suite `testDebugUnitTest`
> surfaces only the **known random DataStore-under-parallel-load timeout flake** (a different `*StoreTest` each run
> — here `NotificationPreferencesStoreTest`, then `ThemeStoreTest`; documented in NOTES, pre-existing, untouched by
> this diff). **RED verified**: stubbing the strip's `includeTranslatable` arm to a no-op + `requestTranslation` to
> `return false` → 6 translatable-projection tests fail (`MessageLanguageStripTest` ×5, `BubbleContentBuilderTest`
> ×1) while the default-false / non-translatable cases stay green (not tautological); restore → all pass. The
> repo/VM tests reference the new `requestTranslation` symbol absent on `main` (compile-RED). Reviewer: PASS (diff
> `apps/android` only, no production logic outside; behaviour-through-public-API `MessageLanguageStrip.build` /
> `BubbleContentBuilder.build` / `MessageRepository.requestTranslation` / `ChatViewModel.onFlagTap`, boundary
> coverage on unknown/deleted/blank-target/blank-result/idempotent/network-fail/in-flight-dup/override-on-
> translatable; **SDK-purity** — the translate-and-merge **service** (opaque params, no product rule) lives in
> `:sdk-core` `MessageRepository`, the *when-to-request* decision stays in the VM (`onFlagTap` → resolver →
> effect); the projection stays in `:sdk-ui`; **SSOT** — reuses `MessageTranslationMerge` + `updateCachedMessage`
> (same merge/no-op-elision as the socket path) and `LanguageResolver.preferredContentLanguages`, no
> re-implementation; **UDF** immutable override map + pure transitions; **instant-app** — the merged translation
> re-renders live off the cache stream, no blocking spinner; **colour/UX coherence** — translatable chip is a
> discrete dimmed "＋" affordance, tap-to-translate-then-switch is one natural gesture, no dead end; **no coverage
> floor lowered, no existing test weakened**). **Next:** the full **detail explorer sheet** (long-press → per-
> language explorer listing every configured language with translate/retranslate), or progressive **audio-voice
> translation** (`audio:translation-ready` → cloned-voice playback, needs BubbleAudio UI).

> On 2026-07-10 **tap-to-switch active language** landed (slice `chat-language-flag-tap-switch`,
> Translation parity §D — feature-parity.md "Original exploration", tap-to-switch now shipped). The prior
> slice rendered the per-message flag strip **read-only**; this one makes it interactive. New pure
> `:feature:chat` `LanguageFlagTapResolver.resolve(tappedCode, activeCode, originalLanguage, translations)
> → Result` — the port of iOS `BubbleLanguageFlagController.handleTap`, adapted to Android's single-primary
> bubble model: where iOS opens a stacked inline **secondary** panel, Android switches the bubble's
> **primary** displayed language (one coherent view, the deliberate "better choice"). It returns
> `Activate(code)` (tap a non-active language that has content), `Revert` (tap the already-active flag → back
> to the default Prisme resolution), `RequestTranslation(code)` (tap a content-less language — inert today,
> consumed by the follow-on on-demand-translate slice), or `None` (blank code). `ChatViewModel.onFlagTap`
> computes the current active code (`activeLanguageOverride[id]` → showingOriginal → preferred → original)
> and applies the outcome to a per-message `activeLanguageOverride: Map<messageId, String>` (a 6th combine
> input threaded through `applyResult`/`toBubbles`). `BubbleContentBuilder.build` gained an optional
> `activeLanguageCode` and `MessageLanguageStrip.build` an `activeCodeOverride`: when set (and the language
> has content) the override wins over the binary `showOriginal`, projecting that language's text + the active
> chip; when unset both fall back to the exact prior read-only behaviour (every existing strip/builder test
> stays green unchanged). Tappable chips wired read-through `MessageBubble.onFlagTap` → `ChatScreen` →
> `viewModel.onFlagTap` (Compose glue, coverage-exempt). +23 tests: `LanguageFlagTapResolverTest` 10
> (activate-non-active / activate-original / revert-active-translation / revert-active-original /
> no-content→request / blank-translation→request / case+trim-normalized / revert-under-case / blank→None /
> null-active-activates), `MessageLanguageStripTest` +3 (override→third-language active / override normalized /
> null override falls back to showingOriginal), `BubbleContentBuilderTest` +4 (override→translation text +
> active chip / override→original text + isShowingOriginal / content-less override ignored / blank override →
> preferred), `ChatViewModelTest` +6 (tap switches text / tap-active reverts / tap-original shows original /
> tap-active-preferred inert / content-less tap unchanged / unknown-message inert). Full `assembleDebug` +
> all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3; wrapper 403-blocked in this
> container — `/opt/gradle`). RED: the new tests reference symbols absent on `main`
> (`LanguageFlagTapResolver`, `activeLanguageCode`, `activeCodeOverride`, `onFlagTap`, `Result.Revert`…), so
> the pre-implementation tree fails to compile — the canonical first RED for a new API; each behavioural case
> then discriminates a distinct resolver arm (a stub that always `Activate`s fails the Revert/None/Request
> cases), so none is tautological. Reviewer: PASS (diff `apps/android` only, no production logic outside;
> behaviour-through-public-API `LanguageFlagTapResolver.resolve` / `BubbleContentBuilder.build` /
> `MessageLanguageStrip.build` / `ChatViewModel.onFlagTap`, boundary coverage on blank/case/no-content/active-
> revert/unknown-message/null-active; **SDK-purity** — the tap→transition **rule** ("when to switch vs revert
> vs request") is a pure `:feature:chat` atom, colocated with the VM exactly as iOS keeps
> `BubbleLanguageFlagController` app-side, while the language→text/chip **projection** stays in `:sdk-ui`
> (opaque `activeLanguageCode`/`activeCodeOverride` params, no product rule) — the correct split; **SSOT** —
> reuses `LanguageResolver.preferredTranslation` for the default active code and the same has-content rule in
> resolver + builder (no re-implemented matcher); **UDF** immutable `StateFlow` override map, transitions
> pure; **colour/UX coherence** — active chip keeps its `LanguageData.colorHex` accent, tap-again-to-revert is
> a natural gesture, no dead end; **no coverage floor lowered**, no existing test weakened). **Next:** the
> `RequestTranslation` outcome — on-demand translate of a language absent from the strip (§D "on-demand
> translate / retranslate"): a `:feature:chat` VM effect that calls a translate endpoint, upserts the returned
> `ApiTextTranslation` via `MessageTranslationMerge`, then activates it — this makes the resolver's
> already-tested `RequestTranslation` arm live. Then the full detail explorer sheet, or progressive
> **audio-voice translation** (`audio:translation-ready` → cloned-voice playback, needs BubbleAudio UI).

> On 2026-07-10 the per-message **translation flag strip** landed (slice `chat-translation-language-strip`,
> Translation parity §D — feature-parity.md "Original exploration" flag-strip and "Message detail:
> per-language translation explorer" strip-projection, both now `[~]`). Now that the `LanguageData`
> metadata SSOT is complete (prior slice), a message's translation state can be projected into a chip
> strip. New pure `:sdk-ui` `MessageLanguageStrip.build(originalLanguage, translations, preferences,
> showingOriginal) → List<LanguageChip>` — the port of iOS `BubbleContentBuilder.buildAvailableFlags`,
> enriched: each entry is a full `LanguageChip` (normalized code + `LanguageData.info` metadata, or null
> metadata for an exotic code that still renders + `isOriginal`/`isActive`), and the **active language is
> kept** in the strip so the UI highlights the current selection rather than hiding it as iOS does. It
> surfaces only the viewer's own languages (original + each configured system/regional/custom that has
> content), never every language the message carries — mirroring iOS's "max 4, deduplicated, user-config
> only" rule so the strip stays a discrete Prisme indicator, not a language dump. Returns **empty** when
> the message is not translated for the viewer (`preferredTranslation` null → nothing to explore, no
> strip), when the matched language's content is blank (Prisme never renders an empty translation —
> reuses `LanguageResolver`), and on a deleted tombstone (guarded in the builder). Codes are trim +
> lowercase normalized for comparison; the original chip is de-duplicated when it is also a configured
> language; a configured language without a translation is not added. Wired into
> `BubbleContent.languageStrip` (new field, default empty) via `BubbleContentBuilder.build`, and rendered
> read-only in `MessageBubble` as a `FlowRow` of flag chips under the bubble text (active chip: language
> native name in its `LanguageData.colorHex` accent via the existing `hexColor` bridge; others flag-only;
> each chip carries a merged `contentDescription` of the language name for VoiceOver parity). +16 tests
> (`MessageLanguageStripTest` 13 — no-translations→empty / none-preferred→empty / original-then-active /
> showing-original-moves-active / metadata-carried / unknown-code-null-meta / normalized-lowercase /
> regional+custom-order / configured-without-translation-excluded / original-not-duplicated /
> blank-content→empty / blank-original-still-shows-active / exactly-one-active; `BubbleContentBuilderTest`
> +4 — translated-strip / showing-original-moves-active / untranslated→empty / deleted→empty). Full
> `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3; wrapper
> 403-blocked in this container — `/opt/gradle`). RED verified by stubbing `build` to `emptyList()` → 12
> behavioural cases fail (the 4 legit "→empty" cases correctly stay green — not tautological), restore →
> all pass. Reviewer: PASS (diff `apps/android` only, no production logic outside; behaviour-through-
> public-API `MessageLanguageStrip.build` + `BubbleContentBuilder.build`, no tautologies, boundary
> coverage on empty/single/unknown/blank/dedup/order/case/active-count; **SDK-purity** — the flag-strip
> projection is a pure `:sdk-ui` atom, the exact analog of iOS `buildAvailableFlags` in `BubbleContentBuilder`;
> it takes opaque params, holds no Meeshy singleton and encodes no "when to do X" product rule, and is
> consumed by `BubbleContentBuilder`, so placing it in `:feature:chat` would invert the module dependency
> — `:sdk-ui` is the correct home despite the earlier "Next" note; **SSOT** — reuses
> `LanguageResolver.preferredTranslation`/`preferredContentLanguages` + `LanguageData.info`, no
> re-implemented matcher; colour/UX coherence — active chip accent from `LanguageData.colorHex`, discrete
> strip, no dead end — the strip renders real available-language info under every translated bubble). The
> read-only display is an honest thin slice: tap-to-switch active language, on-demand translate of a
> missing language, and the full detail explorer sheet are the tracked follow-ons. **Next:** wire
> tap-to-switch (a `:feature:chat` VM `activeLanguageOverride` map keyed by messageId + `onFlagTap`
> handler mirroring iOS `BubbleLanguageFlagController.handleTap`), then on-demand translate-request for a
> language absent from the strip, then progressive **audio-voice translation** (`audio:translation-ready`
> → cloned-voice playback, needs BubbleAudio UI).

> On 2026-07-10 the **language metadata catalog** reached iOS parity (slice `translation-language-catalog`,
> Translation parity §D — feature-parity.md "Per-language flag / native name / colour metadata", now checked).
> `LanguageData` (`:core:model`) was a partial port: it dropped **Catalan** (`ca`), hand-copied the four
> `interfaceLanguages` (a second metadata copy that could silently drift from `allLanguages`), had no
> common-first ordering, and `info(code)` was an exact, case-sensitive, alias-blind `firstOrNull { it.code
> == code }` — so consumers papered over it locally (`ProfileDetailRows` called `info(code.lowercase())`;
> `RegionalLanguageSelection` re-implemented case-insensitive matching via a private `equiv` and did its own
> `allLanguages.firstOrNull { it.code.equiv(code) }?.nativeName` label lookup). This slice makes `LanguageData`
> the single robust SSOT: **+Catalan**; `interfaceLanguages` is now **derived** from `interfaceLanguageCodes`
> (fr/en/es/ar — the shipped UI bundles, unchanged set) over the base table so there is no drift copy;
> `commonLanguageCodes` + `allLanguagesCommonFirst` add a common-first ordering (a **permutation** — nothing
> dropped or duplicated, verified by test); and `info(code: String?)` is **trim + case-insensitive +
> alias-aware** (`fil` → `tl`, iOS's one alias) returning `null` on blank/unknown. Consumers converge onto it:
> `ProfileDetailRows` → `info(code)` (hack removed), `RegionalLanguageSelection` sources options from
> `allLanguagesCommonFirst` and labels via `info(selected)` (its re-implemented lookup deleted), and the
> `ProfileScreen` content-language dropdown leads with the common set. +16 tests (14 `LanguageDataTest`
> covering table uniqueness/lowercase, non-blank metadata, Catalan presence, exact/case/trim/alias/unknown/blank
> lookup, derived-interface-no-drift, and common-first permutation+leading-order+membership; +2
> `RegionalLanguageSelectionTest` for common-first order and alias label). Existing `RegionalLanguageSelectionTest`
> (17) + `ProfileDetailRowsTest` (incl. its uppercase-code case) + `AppLanguageTest` stay green unchanged.
> Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3; wrapper
> 403-blocked in this container — `/opt/gradle`). RED verified by stubbing the ordering to identity and the
> aliases to empty → `commonFirstSurfacesTheCommonCodesFirstInTheirDeclaredOrder` +
> `infoResolvesLegacyBcp47AliasFilToFilipino` fail; restore → all pass. Reviewer: PASS (diff `apps/android`
> only, no production logic outside; behaviour-through-public-API `LanguageData.info`/`allLanguagesCommonFirst`
> + the two pure picker projections, no tautologies, boundary coverage on blank/unknown/alias/case/order/
> permutation; SDK-purity — `LanguageData` is a pure `:core:model` metadata table + lookup, the Compose picker
> edits are exempt glue; SSOT — collapses three local re-implementations of case-insensitive language matching
> onto one `info`, and derives `interfaceLanguages` instead of hand-copying it; colour/UX coherence — flags &
> `colorHex` unchanged, common-first ordering is the natural picker UX; no dead end — every new symbol is
> consumed by a real caller). **Next:** the per-message translation **flag-strip / language explorer** (§D
> "Message detail: per-language translation explorer") — a pure `:feature:chat` core that, given a message's
> translations + the viewer's preferred languages, projects the chip strip (each chip = `LanguageData.info`
> metadata + isActive/isOriginal) now that the metadata SSOT is complete; or progressive **audio-voice
> translation** (`audio:translation-ready` → cloned-voice playback, needs BubbleAudio UI).

> On 2026-07-10 **progressive live transcription** landed (slice `chat-live-transcription-merge`, Translation
> parity §D — feature-parity.md "Real-time progressive translation/transcription socket updates", transcription
> side now checked). The immediate follow-on to the translation merge landed the same day: the
> `MessageSocketManager.transcriptionReady` flow (`transcription:ready`) was decoded but had **zero consumers**
> (`grep -rn transcriptionReady feature/ sdk-core/ | grep -v MessageSocketManager` → empty) — a voice note stayed
> untranscribed in the open bubble until a manual reload even after Whisper finished. Now it is wired end-to-end
> the same way as the translation merge: when the transcription lands the gateway pushes it and Android upserts it
> onto the matching cached audio attachment so the audio bubble shows its transcription **instantly** — the same
> Room-backed `messagesStream` re-emission that makes peer reactions/translations live, no refetch. **Zero UI
> change**: `BubbleContentBuilder.resolveTranscription` already reads `attachment.transcription` under the Prisme,
> so wiring the cache is all a live transcription needed. New pure `:core:model`
> `AttachmentTranscriptionMerge.mergeTranscription(message, attachmentId?, text, language?, confidence?,
> durationMs?) → ApiMessage?` SSOT (sibling of `MessageTranslationMerge`): target = the attachment whose id is
> `attachmentId`, or (blank/absent id) the message's **first audio attachment** (single-voice-note common case);
> the target's `transcription` is replaced in place, list order + every other attachment preserved. Returns
> **null (no-op)** on a blank text (the Prisme never stores an empty transcription — would make the bubble claim
> one exists), a **deleted tombstone** (never re-transcribe a wiped message — mirrors the translation merge), **no
> matching/audio target** (an explicit id that matches nothing, or no audio attachment at all → inert), or an
> **identical** transcription already present (idempotent; language matched case-insensitively, effective text
> read via the `transcribedText ?: text` fallback). `:sdk-core` `MessageRepository.applyTranscription` applies it
> through `updateCachedMessage` with **no outbox** (inbound server truth) and the existing `===`-guard elides the
> Room write on a no-op. `ChatViewModel` collects the flow conversation-scoped (an event for another conversation
> is inert). +23 tests (`AttachmentTranscriptionMergeTest` 17 — single-audio-append / target-by-id / no-match→null
> / blank-id-fallback-to-first-audio / no-audio→null / blank-text→null / whitespace-text→null / deleted→null /
> identical→null / identical-case-insensitive-lang→null / same-text-diff-lang→replace / new-text→replace /
> transcribedText-fallback-in-identical-check / stamps-lang+confidence+duration / blank-lang→null-stored /
> other-attachments-preserved / msg-fields-preserved; `MessageRepositoryTest` +4 — upsert-no-outbox /
> blank-id-fallback / unknown-id-inert / blank-text-ignored; `ChatViewModelTest` +2 — ready-applies /
> ready-elsewhere-ignored). Full `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system
> Gradle 8.14.3; wrapper 403-blocked in this container — `/opt/gradle`); RED verified by stubbing the merge to
> no-op → 9 behavioural `AttachmentTranscriptionMergeTest` cases fail, restore → all pass. Reviewer: PASS (diff
> `apps/android` only; behaviour-through-public-API `mergeTranscription`/`applyTranscription`/VM collector, no
> tautologies, boundary coverage on blank/deleted/no-target/duplicate/case/multi-attachment/fallback; SDK-purity —
> the "how to merge a transcription / which attachment" decision is a pure `:core:model` atom (same layer as
> `MessageTranslationMerge`), the cache write is `:sdk-core`, the "which conversation is open" wiring is the
> `:feature:chat` VM, no exempt Compose glue even touched; SSOT — the blank/deleted rules mirror
> `MessageTranslationMerge`/`LanguageResolver`, the render reuses `BubbleContentBuilder.resolveTranscription`;
> instant-app live re-render; UDF immutable state; no dead end — the transcription lands and the bubble reads it).
> **Next:** progressive **audio-voice translation** (`audio:translation-ready` → upsert the cloned-voice
> `ApiAttachmentTranslation` url onto `attachment.translations`, then a BubbleAudio surface to play the translated
> track — needs UI, a bigger slice), or the per-message translation flag-strip / language explorer (§D).

> On 2026-07-10 **progressive live translation** landed (slice `chat-live-translation-merge`, Translation
> parity §D — feature-parity.md "Real-time progressive translation/transcription socket updates", text side
> now checked). The `MessageSocketManager.translationCompleted`/`translationInProgress` flows
> (`message:translated`/`message:translation`) were emitted but had **zero consumers** — a message arrived in
> its original language and stayed there until a manual reload, defeating the Prisme's "translations arrive
> elegantly, no friction" promise. Now they are wired end-to-end: the translator finishes, the gateway pushes
> the translation, and Android upserts it **in place** into the cached message so the open bubble re-renders in
> the viewer's preferred language **instantly** — the same Room-backed `messagesStream` re-emission that makes
> peer reactions live, no refetch. New pure `:core:model` `MessageTranslationMerge.mergeTranslation(message,
> targetLanguage, translatedContent) → ApiMessage?` SSOT: upsert by language (case-insensitive match, list
> order preserved on replace), append when the language is absent; returns **null (no-op, nothing to persist)**
> when the language or content is blank (the Prisme never stores an empty translation — mirrors
> `LanguageResolver.preferredTranslation`'s blank skip), when the message is a **deleted tombstone** (never
> resurrect a wiped translation — mirrors `deleteOptimistic`/`editOptimistic`), or when an **identical**
> translation is already present (idempotent — a re-emitted event costs nothing). `:sdk-core`
> `MessageRepository.applyTranslation` applies it through `updateCachedMessage` with **no outbox** (inbound
> server truth, never a local mutation), and `updateCachedMessage` gained a `===`-identity guard that **skips
> the redundant Room write + JSON re-encode** when a transform returns its input unchanged (behaviour-preserving
> for every other caller — they all `.copy(...)`, so the guard only ever fires on an inert translation).
> `ChatViewModel` collects **both** flows, conversation-scoped (an event for another conversation is inert);
> in-progress and completed events funnel through the same merge, so partial translations stream in
> progressively and the final one converges without flicker. +23 tests (`MessageTranslationMergeTest` 15 —
> append-empty / stamp-msgid+source / null-source→blank / append-keeps-existing / replace-in-place-order /
> case-insensitive-replace / identical→null / identical-case-insensitive→null / blank-lang→null /
> whitespace-lang→null / blank-content→null / whitespace-content→null / deleted→null / lang-trimmed /
> fields-preserved; `MessageRepositoryTest` +4 — upsert-no-outbox / replace-same-language / unknown-id-inert /
> blank-ignored; `ChatViewModelTest` +3 — completed-applies / completed-elsewhere-ignored /
> in-progress-applies). `:core:model` + `:sdk-core` + `:feature:chat` `testDebugUnitTest` green; RED verified
> by stubbing the merge → 8 behavioural `MessageTranslationMergeTest` cases fail, restore → all pass. Reviewer:
> PASS (diff `apps/android` only; behaviour-through-public-API `mergeTranslation`/`applyTranslation`/VM
> collectors, no tautologies, boundary coverage on blank/deleted/duplicate/case/order; SDK-purity — the "how
> to merge a translation" decision is a pure `:core:model` atom (same layer as `MessagePinToggle`), the cache
> write is `:sdk-core`, the "which conversation is open / when to apply" product wiring is the `:feature:chat`
> VM; SSOT — the blank/deleted rules mirror `LanguageResolver`/`deleteOptimistic`; instant-app live re-render;
> UDF immutable state; no dead end — the translation lands and the bubble reads it). **Next:** progressive
> **transcription**/audio socket updates (`transcription:ready`/`audio:translation-ready`, same merge shape on
> `BubbleAudio`'s transcription), or the per-message translation flag-strip / language explorer (§D).

> On 2026-07-09 the **reply-thread overlay** landed (slice `chat-reply-thread-overlay`, Chat parity §C —
> feature-parity.md "Reply-count pills + **reply thread overlay**", now fully checked). The pills shipped
> earlier (tap → scroll to earliest reply); the overlay is the focused sheet. **Long-pressing** the
> reply-count pill (tap unchanged) opens a `ModalBottomSheet` driven by the new pure `:feature:chat`
> `ReplyThreadOverlay.of(parentId, messages) → ReplyThreadOverlayModel?` SSOT: the parent row plus every
> **live** reply quoting it, earliest-first. The reply-membership predicate is **identical to `ReplyThreads`**
> (not-deleted, trimmed `replyToId == parentId`, no self-reference) so the pill count and the overlay can
> never disagree. A **paged-out parent** (parent not loaded) or a thread with **no live reply** → `null`
> (open is inert — no empty sheet). A **deleted parent** still heads the overlay (its `isDeleted` row shows
> "Message supprimé") with its live replies — mirrors `ReplyThreads` counting replies to a deleted parent.
> Snippet projection is now the shared SSOT `messageSnippetOf(text, hasImage, hasFile) → PinnedSnippet`
> (extracted from `PinnedMessages`' private `snippet()`, behaviour identical — pinned tests unchanged), so a
> thread row and a pinned row describe the same message identically. `ChatUiState.replyThreadOverlay`
> derives **live** from the loaded messages (a new reply appears in an open overlay); a standing invariant in
> `applyResult` auto-closes it when the thread drains (last reply deleted / parent pages out) while open —
> and requires an explicit re-open, never silently resurrecting a dismissed overlay (mirrors the pinned-sheet
> invariant). `onReplyThreadReplyTap` scrolls to a reply and closes (unknown id inert). EN/FR/ES/PT strings.
> +25 tests (`ReplyThreadOverlayTest` 18 — empty/blank-parent/paged-out/no-replies/other-parent/single/
> deleted-reply-excluded/only-deleted→null/self-ref→null/order/whitespace-ref-matches/blank-ref→null/
> deleted-parent-still-shown/blank-sender→null/trim-sender/image+file snippets/text-beats-media+image-beats-file/
> outgoing-flag; `ChatViewModelTest` +7 — long-press-opens/no-thread-inert/close/reply-tap-scrolls+closes/
> unknown-reply-inert/auto-close-on-drain, plus the shared pinned snippet helper stays green).
> `:feature:chat:testDebugUnitTest` + `assembleDebug` green (system Gradle 8.14.3; wrapper 403-blocked in
> this container — `/opt/gradle`). Reviewer: PASS (diff apps/android only; behaviour-through-public-API
> `ReplyThreadOverlay.of` / VM handlers, no tautologies, boundary coverage on paged-out/no-reply/deleted/
> self-ref/order/drain; SDK-purity — the "which messages form the thread / how each row reads" product
> decision is a pure `:feature:chat` atom, the sheet is exempt Compose glue; SSOT — reply membership shared
> with `ReplyThreads`, snippet with `PinnedMessages`; UDF immutable state; accent-coherent; natural long-press
> gesture reusing the existing reaction-chip idiom; no dead end — the overlay reads and jumps into the thread).

> On 2026-07-08 the **forwarded-message indicator** landed (slice `chat-forwarded-indicator`, Chat parity §C —
> feature-parity.md "Edited / pinned / **forwarded** indicators"). Forward shipped the send side (#1730,
> `forwardedFromId`/`forwardedFromConversationId` on `ApiMessage`/`SendMessageRequest`) but the read side
> ignored the wire refs — a forwarded message looked native. Now `BubbleContent.isForwarded` is derived in
> `BubbleContentBuilder.build` as `!isDeleted && !message.forwardedFromId.isNullOrBlank()`: the trigger is a
> **non-blank `forwardedFromId`** (a whitespace-only id or a forward carrying only a `forwardedFromConversationId`
> is **not** flagged), and a **deleted tombstone is never forwarded** (mirrors the existing `pinnedAtIso`
> deleted-suppress rule so metadata never leaks onto a deleted bubble). `MessageBubble` renders a subtle
> top-of-bubble italic chip (`Icons.AutoMirrored.Filled.Send` glyph + "Transféré"/"Forwarded", `onColor`
> alpha 0.6 so it stays accent-coherent on both incoming and outgoing bubbles), placed above the sender name
> / reply preview at iOS parity. New string `bubble_forwarded` in en/fr/es/pt (sdk-ui). +5 tests
> (`BubbleContentBuilderTest`: forwarded-flagged, no-origin→false, blank-id→false, conversation-id-only→false,
> deleted→false) — 37 bubble-builder tests total, 0 failures. `:sdk-ui:testDebugUnitTest` + full
> `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3;
> `/opt/gradle/bin/gradle` — the wrapper download is 403-blocked in this container). Reviewer: PASS (diff
> apps/android only; behaviour-through-public-API `BubbleContentBuilder.build`, no tautologies, boundary
> coverage on blank/whitespace id + conversation-id-only + deleted-suppress; SDK-purity honoured — the
> "is this forwarded" derivation is a stateless building block in `:sdk-ui` `BubbleContentBuilder` (same
> layer as `isEdited`/`pinnedAtIso`), the chip is exempt Compose glue; SSOT — the deleted-suppress rule
> mirrors `pinnedAtIso`; accent-coherent chip, read-only indicator so no dead end). **Next:** reply-thread
> overlay (the `ReplyThreads` grouping is already the SSOT) or a starred/bookmarked messages list.

> On 2026-07-08 the **pinned-message banner** landed (slice `chat-pinned-banner`, Chat parity §C —
> feature-parity.md "Pin/unpin message"). The gateway fully supports message pinning (REST pin/unpin +
> `GET /pinned-messages` + socket `message:pinned`/`message:unpinned`, wire `pinnedAt`/`pinnedBy`) but
> Android ignored all of it. Now `ApiMessage` carries `pinnedAt`/`pinnedBy`, `BubbleContent.pinnedAtIso`
> maps it (null on a deleted message or blank instant), `MessageSocketManager` gains
> `messagePinned`/`messageUnpinned` streams that `refresh` the open conversation (so any client's pin
> appears live), and the pure `:feature:chat` `PinnedMessages.of(messages) → PinnedBanner?` SSOT features
> the **newest** live pin (parsed instant; equal-instant & unparseable ties keep the earliest in list
> order via a stable max), with the total `count` and a `PinnedSnippet` (trimmed text › Image › File ›
> Empty). `ChatUiState.pinnedBanner` derives it; `onPinnedBannerTap` scrolls to the newest pin.
> `ChatScreen` renders a tappable accent `PinnedBannerStrip` above the list. +28 tests. Reviewer PASS. The
> pin/unpin **action** (optimistic outbox toggle) is the next slice.

> On 2026-07-08 the **pin/unpin action** landed (slice `chat-pin-toggle`, Chat parity §C — feature-parity.md
> "Pin/unpin message"), completing the pin feature end-to-end on Android alone (the banner read side shipped
> earlier the same day). The pure `:core:model` `MessagePinToggle.resolve(isDeleted, pinnedAtIso) → PinAction`
> SSOT (Pin | Unpin | Unavailable) decides the long-press action: a message is *pinned* when its `pinnedAt` is
> non-blank (the **same** rule `PinnedMessages` reads, so toggle and banner never disagree), pinning is **not**
> owner-restricted and has **no** window (parity with the gateway, which only checks conversation access — unlike
> edit/delete), so the sole gate is that a deleted tombstone → `Unavailable`. `ChatViewModel.togglePin` resolves
> the action, dismisses the sheet, and (when actionable) calls `MessageRepository.setPinnedOptimistic(messageId,
> pin)` which flips the cached `pinnedAt` **instantly** (set to now on pin, cleared on unpin — banner reacts at
> once; `pinnedBy` left for the socket refresh), refuses an unsent bubble (requireSynced), and enqueues a durable
> `PIN_MESSAGE`/`UNPIN_MESSAGE` row on the new shared `pin` lane carrying a `PinPayload(conversationId)`. The
> coalescer routes both through the generalized `terminalToggle` (renamed from `blockToggle`, now shared by
> block/unblock **and** pin/unpin): a pin+unpin of the same message annihilates, a repeat supersedes. The
> `OutboxFlushWorker` gains `messageApi.pin`/`unpin` (PUT/DELETE `conversations/{cid}/messages/{mid}/pin`)
> senders and an `onExhausted` branch that decodes the payload and `messageRepository.refresh(conversationId)`
> so a hard-dead flip reconciles with server truth. `ChatScreen`'s `MessageActionsSheet` shows a `PushPin`
> "Épingler"/"Retirer" row (gated off only for `Unavailable`). EN/FR/ES/PT strings. +31 tests
> (`MessagePinToggleTest` 9 — isPinned null/empty/whitespace/non-blank, resolve live-pin/live-unpin/live-blank/
> deleted-unpinned/deleted-pinned; `OutboxCoalescerTest` +5 — pin↔unpin annihilate both ways, repeat-pin
> supersede, first-pin enqueue, different-message-no-coalesce; `OutboxLaneMapTest` +1 — pin lane; `MessageRepository`
> +3 — pin stamps+queues PIN on the pin lane with conversationId payload, unpin clears+queues UNPIN, refuses unsent;
> `ChatViewModelTest` +5 — pin-not-pinned→setPinned(true)+enqueue+dismiss, unpin-pinned→setPinned(false),
> deleted-inert, unknown-inert, repo-failure→errorMessage). `:core:model` + `:sdk-core`(isolated) + `:feature:chat`
> `testDebugUnitTest` green, `:app:assembleDebug` green (system Gradle 8.14.3; the pre-existing
> `InterfaceLanguageStoreTest` DataStore timeout flakes only under parallel load — passes in isolation, unrelated
> to this diff). Reviewer: PASS (diff apps/android only; behaviour-through-public-API `MessagePinToggle.resolve` /
> coalescer / `setPinnedOptimistic` / `togglePin`, no tautologies, boundary coverage on blank/deleted/unknown/
> annihilate/supersede; SDK-purity honoured — the "can/how to toggle" decision is a pure `:core:model` atom, the
> optimistic cache flip + outbox is `:sdk-core`, the "when to toggle" product wiring is the `:feature:chat` VM, the
> sheet is exempt Compose glue; SSOT — pin-meaning shared with the banner; instant-app optimistic flip; UDF
> immutable state; accent-coherent, natural long-press gesture, no dead end — the action pins/unpins live).

> On 2026-07-08 the **who-reacted breakdown sheet** landed (slice `chat-reaction-who-reacted-sheet`, Chat parity §C —
> feature-parity.md "reaction detail breakdown (who-reacted sheet)"). Reactions were add/remove-only; long-pressing a
> reaction chip did nothing. iOS opens a sheet listing who reacted, grouped by emoji. New pure `:feature:chat`
> `ReactionBreakdown.of(response: ReactionSyncResponse, currentUserId) → ReactionBreakdown(tabs)` SSOT: each non-blank
> emoji group with an effective count > 0 becomes a `ReactionTab.Emoji(emoji, count, reactors)` — count is the server
> `count` when positive else the reactor size (so a truncated-reactor group keeps an honest total with an empty list
> rather than lying); tabs sort by count **descending**, ties preserving original group order (Kotlin `sortedByDescending`
> is stable). Within each tab the current user floats to the top (once per emoji) and is flagged `isSelf`; the rest keep
> incoming order; duplicate reactor ids within a group collapse to the first; `username` trimmed→`userId` fallback,
> `avatar` blank→null. A leading `ReactionTab.All(sumCount, reactorsConcatenatedInTabOrder-selfFirst)` appears **only
> when ≥2 emoji tabs** (redundant for a single emoji). A blank `currentUserId` flags nobody. `ReactionDetailsUiState`
> (messageId, isLoading, breakdown, selectedTabIndex) carries a `withSelectedTab(index)` that is **inert out of range**
> and a derived `selectedTab`. Wired cache-first: `ChatViewModel.openReactionDetails` shows the sheet **immediately**
> (empty + loading) then fills from `reactionRepository.fetchDetails` (also refreshing `ownReactions`); a **failed fetch
> leaves an empty, non-loading sheet** (never a crash); a stale response for a since-changed target is ignored.
> `selectReactionTab`/`closeReactionDetails` complete the UDF. `MessageBubble` gains an `onReactionLongPress`
> (`combinedClickable` on each chip); `ChatScreen` renders a `ModalBottomSheet` — accent-tinted tab pills (LazyRow) +
> a reactor `LazyColumn` (`MeeshyAvatar` + name/"Vous" + emoji), a spinner only while loading-empty, an empty label
> otherwise. EN/FR/ES/PT strings. +24 tests (`ReactionBreakdownTest` 19 — empty/blank-emoji/no-reactors-drop, single-tab
> no-All, blank-username→id, trim, self-flag, blank-currentUser, self-float-order, count-desc order, stable ties, All
> summed count + concatenation order + self-float-across-tabs, count-fallback-to-size, positive-count-empty-list,
> dup-collapse, avatar carry, blank-avatar→null; `ChatViewModelTest` +5 — immediate-loading, fetch-fills+self-float,
> failed-fetch-empty, tab-select+out-of-range-inert, close-clears). `assembleDebug` + `:feature:chat`/`:sdk-ui`
> `testDebugUnitTest` green (system Gradle 8.14.3; a **pre-existing** `:sdk-core` `InterfaceLanguageStoreTest` DataStore
> timeout flakes under parallel load — passes in isolation, outside this apps/android-chat/sdk-ui diff). Reviewer: PASS
> (diff apps/android only; behaviour-through-public-API `ReactionBreakdown.of`, no tautologies, boundary coverage on
> the count fallback / stable ties / self-float / out-of-range select; SDK-purity honoured — the "how to group / order /
> whom to float" product decision is a pure atom in `:feature:chat`, the sheet is exempt Compose glue; UDF immutable
> state; accent-coherent; natural long-press gesture; no dead end — the chip now opens the sheet).

> On 2026-07-07 the **header typing-avatar chips** landed (slice `chat-typing-header-avatars`, Chat parity §C —
> feature-parity.md "Typing indicators … avatar chips"). The header showed only a "X is typing…" label; iOS shows
> overlapping avatars of who is composing. New pure `:feature:chat` `TypingAvatarStack.of(participants,
> maxVisible = MAX_TYPING_AVATARS = 3) → TypingAvatarStack(visible: List<TypingAvatarChip>, overflow: Int)` SSOT:
> the first `maxVisible` typers become chips in roster order; anyone beyond the cap folds into a `+N` overflow
> (empty → empty/0, at-cap → all/0, over-cap → truncated/overflow, zero/negative cap → nothing visible + everyone
> in overflow). `TypingParticipant` gained a roster-resolved `avatarUrl` (the `typing:start` socket payload carries
> none) — trimmed, blank→null — threaded through `TypingParticipants.started`. `ChatViewModel` builds an
> `avatarByUserId` map from the conversation participants and resolves each start event's avatar; `ChatScreen`
> overlaps accent-tinted `MeeshyAvatar` chips (surface-ring separated) with a `+N` pill beside the subtitle. +20
> tests (`TypingAvatarStackTest` 9 branches, `TypingParticipantsTest` +5, `ChatViewModelTest` +2). `assembleDebug`
> + full `testDebugUnitTest` green (system Gradle 8.14.3). Reviewer: PASS (diff apps/android only;
> behaviour-through-public-API, no tautologies, boundary coverage on the cap; SDK-purity honoured — the
> "how-many-chips / overflow" product decision is a pure atom in `:feature:chat`, the overlap render is exempt
> Compose glue; accent-coherent, degrades to initials, no dead code).

> On 2026-07-07 the **swipe-to-reply gesture** landed (slice `chat-swipe-to-reply`, Chat parity §C —
> feature-parity.md "Reply … swipe"). Reply was reachable only through the long-press action sheet; iOS opens
> the reply composer with a horizontal bubble swipe (`MessageListView.dragGesture` + `BubbleSwipeResistance`).
> New pure `:feature:chat` `SwipeToReply` SSOT (`ReplyDirection` FromIncoming(+1) / FromOwn(−1) — incoming bubbles
> reply on a rightward drag, own on a leftward): `resolveOffset(translationX, direction)` tracks the finger 1:1
> toward the reply direction up to a `RUBBER_BAND_ZONE` (72) then compresses further travel by
> `RUBBER_BAND_RESISTANCE` (0.15), and clamps any drag *away* from the reply direction to a dead 0; `isArmed`
> lights once the directed offset reaches `COMMIT_THRESHOLD` (66); the `onDrag` reducer over `SwipeReplyState`
> returns `armedHaptic` **only on the transition into armed** so a held drag never re-fires and re-arming after
> relaxing fires again; `onRelease` commits the reply iff released while armed. Wired: `ChatScreen`'s new
> `SwipeToReplyContainer` wraps every `MessageBubble` — `detectHorizontalDragGestures` accumulates the raw
> translation into the reducer, an `animateFloatAsState` offset renders the drag (spring-back on release), a
> reveal-alpha reply glyph sits behind it (accent-tinted), the arm haptic fires once mid-drag, and a committed
> release fires a success haptic + the existing `viewModel.startReply(messageId)` (no new state path, no dead
> end). +23 tests (`SwipeToReplyTest`: direction gating both ways, zero-translation, in-zone 1:1 both signs,
> zone-edge boundary, past-zone rubber-band compression both signs, below/at/above commit threshold, wrong-
> direction never-armed, arm-fires-haptic-once, held-no-refire, disarm-no-haptic, re-arm-refire, short-drag-inert,
> release commit/cancel/untouched, own-bubble commit). `:app:assembleDebug` + full `testDebugUnitTest` green
> (system Gradle 8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-public-API, no tautologies,
> boundary coverage on both the zone and the commit threshold; SDK-purity honoured — the "when to arm / when to
> commit / how far to rubber-band" product decision is a pure atom in `:feature:chat`, the gesture/animation is
> exempt Compose glue; natural-gesture UX, accent-coherent reveal glyph, reuses the existing reply entry point).

> On 2026-07-07 the **scroll-to-bottom control with unread badge + preview** landed (slice
> `chat-scroll-to-bottom-control`, Chat parity §C — feature-parity.md "Scroll-to-bottom control"). The FAB was a
> bare `!isNearBottom` visibility toggle — no unread awareness, no preview. iOS's `ConversationScrollControlsView`
> shows a live unread count and a compact preview of the newest unread message, resetting both when the reader
> jumps back down. New pure `:feature:chat` `ScrollAffordance.next(previous, messages, isNearBottom) →
> ScrollAffordanceState`: while the reader sits at the bottom every message is acknowledged and the control hides;
> the moment they scroll away the acknowledged anchor freezes and each subsequent **incoming (non-own, undeleted)**
> message grows the unread badge and refreshes the `UnreadPreview` (sender + text + kind: Text/Image/File);
> scrolling back down clears the badge + preview. History paged out from the top never resurrects as unread, and a
> lost anchor re-baselines to the newest rather than counting the whole history (defensive against a misleading huge
> badge). Wired: `ChatScreen` maps `state.messages` → `AffordanceMessage`s via `BubbleContent.toAffordanceMessage()`
> (kind derived: image beats file beats text), holds the reduced state, and renders a `BadgedBox` FAB (badge caps at
> `99+`) with a tappable preview pill above it; tapping either acknowledges (via `next(..., isNearBottom = true)`) and
> animates to the latest. +19 tests (`ScrollAffordanceTest` 14 — near-bottom acknowledge/hide, empty, return-clears,
> scrolled-away-no-badge, one/several incoming, own/deleted excluded, mixed, preview-kind, fresh baseline, pruned-anchor
> rebaseline, top-prune tail count, single-message boundary; `AffordanceMessageMappingTest` 5 — identity/direction/text,
> deleted passthrough, image/file kind, image-wins-over-file). `assembleDebug` (app) + full `testDebugUnitTest` (896
> tasks) green (system Gradle 8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-public-API, no
> tautologies; SDK-purity honoured — the "when to show / what counts as unread" product decision is a pure atom in
> `:feature:chat`, the render is Compose glue; UDF immutable state, pure transition; accent-coherent visuals; no dead
> code — the reducer + mapper are both consumed by `ChatScreen`).

> On 2026-07-06 the **group all-or-nothing delivery semantics** landed (slice `chat-delivery-status-group-semantics`,
> Chat parity §C — feature-parity.md "Delivery status checkmarks"). The bubble's own-message indicator promoted to
> ✓✓-delivered / ✓✓-read as soon as a **single** recipient received / read it — correct for a 1:1 but **misleading
> in a group**: the sender saw the indigo "read" the instant one of ten members opened the conversation. New pure
> `:core:model` `DeliveryStatusResolver.resolve(deliveredCount, readCount, recipientCount, deliveredToAllAt?,
> readByAllAt?) → DeliveryTier` (Sent | Delivered | Read), a faithful port of the iOS `MeeshySDK.DeliveryStatusResolver`:
> for `recipientCount > 1` (group) the delivered / read tier lights up only once **every** recipient has received /
> read (`count >= recipientCount`), trusting the unambiguous `readByAllAt` / `deliveredToAllAt` "all" markers ahead of
> the counters so a live update never transiently regresses to a single check; for `recipientCount <= 1` (direct /
> unknown denominator) the legacy "any recipient ⇒ done" behaviour is preserved. Wired: `BubbleContentBuilder.build`
> gains a `recipientCount: Int = 0` param (default keeps the 1:1 behaviour) and maps the resolved `DeliveryTier` →
> `DeliveryStatus`; `ChatViewModel` computes `recipientCount` (distinct participant `userId`s excluding self) in the
> conversation collector and threads it reactively through the message `combine` (5th source → `BubbleInputs`), so
> bubbles rebuild when either the messages or the roster change. +21 tests (`DeliveryStatusResolverTest` 15 — every
> group/direct/marker/boundary branch incl. stale-delivered-counter-still-reads and read-marker-wins-over-delivered-marker;
> `BubbleContentBuilderTest` +4 — direct-read/group-one-read-stays-sent/group-all-delivered/group-all-read;
> `ChatViewModelTest` +2 — group one-of-many read stays Sent, direct peer-read shows Read). `assembleDebug` + full
> `testDebugUnitTest` green (system Gradle 8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-public-API;
> SDK-purity/SSOT honoured — the resolver is a stateless pure atom in `:core:model`, the tier→status mapping is in the
> `:sdk-ui` builder, and the "who counts as a recipient" product decision lives in the `:feature:chat` ViewModel; no
> dead code — the resolver's single public `resolve` is consumed by the builder).

> On 2026-07-06 the **tap-a-quoted-reply → scroll-to-original** landed (slice `chat-reply-jump-to-original`,
> Chat parity §C — feature-parity.md "Reply … jump"). The quoted-reply preview inside a bubble was a **dead-end
> visual**: it rendered the quoted sender + snippet but a tap did nothing, whereas iOS scrolls to the original.
> New pure `:feature:chat` `ReplyJumpResolver.resolve(tappedMessageId, messages: List<ReplyLink>) → ReplyJump`
> SSOT (`Scroll(targetMessageId)` | `TargetNotLoaded` | `None`): looks up the tapped message, trims/blank-guards
> its `replyToId`, guards a self-reference, and returns `Scroll` **only when the original is currently loaded** —
> a paged-out original is reported distinctly (`TargetNotLoaded`, inert, never an absent-index crash) rather than
> silently mis-scrolling. `ReplyLink(id, replyToId)` is an opaque SDK-agnostic projection so the decision stays
> fully JVM-testable. Wired: `BubbleContent`/`BubbleContentBuilder` now carry `replyToId` (from `message.replyTo
> ?.id`); `MessageBubble.ReplyPreview` gains an optional `onClick` (clickable **only** when `replyToId != null`);
> `ChatViewModel.onReplyPreviewTap(messageId)` resolves + sets a consumable `scrollToMessageId`, and
> `onScrollHandled()` clears it; `ChatScreen` adds a `LaunchedEffect(scrollToMessageId)` mirroring the existing
> search-jump (find index → `animateScrollToItem` → consume). +15 tests (`ReplyJumpResolverTest` 9 — every branch:
> unknown-tapped / non-reply / blank / self / loaded-scroll / paged-out / trim / empty / dup-first-wins;
> `ChatViewModelTest` +4 — loaded→scroll, paged-out inert, non-reply inert, consume clears; `BubbleContentBuilderTest`
> +2 — replyToId carried / null when no reply). `assembleDebug` + full `testDebugUnitTest` green (system Gradle
> 8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-public-API; SDK-purity/SSOT honoured — pure
> decision in `:feature:chat`, data carriers in `:sdk-ui`, render/scroll orchestration in the exempt Screen glue;
> UDF consumable state; no dead end — the preview now navigates, gracefully inert when the target is paged out).

> On 2026-07-06 the **in-conversation message search + search-highlight wiring** landed (slice
> `chat-search-highlight-wiring`, Chat parity §C — feature-parity.md "In-conversation message search" +
> the search-highlight half of "Rich text rendering"). The bubble already accepted a `highlightTerm` and the
> pure `MessageTextParser.highlightRanges` was tested, but no `ChatViewModel` fed a live term and there was no
> search UI. New pure `:feature:chat` `ChatSearch` SSOT over an opaque `SearchableMessage(id, texts)`:
> `matchIds(messages, query)` is a trimmed/case-insensitive `contains` across **every** text of a message — so
> the displayed translation *and* the stored original both match (**translation-match aware**, at iOS parity) —
> preserving display order and de-duping a message that matches on several texts. A pure reducer over
> `ChatSearchState(isActive, query, matchIds, activeIndex)` — `activated` (clean slate), `deactivated` (inert
> reset), `withQuery` (recompute + focus first hit), `reconciled` (recompute on a fresh message stream, **keeping
> the focused hit on the same message** when it survives, else falling to the first; inert while inactive),
> `movedToNext`/`movedToPrev` (wraparound, inert on an empty match set) — plus derived `matchCount`/`hasMatches`/
> `activeMessageId`/one-based `currentPosition`/`highlightTerm` (the trimmed query, only while active & non-blank).
> `ChatViewModel` gains `search: ChatSearchState` in its `UiState`, five intents
> (`openSearch`/`onSearchQueryChange`/`nextSearchMatch`/`previousSearchMatch`/`closeSearch`), and reconciles
> search in the message collector after `applyResult` (deleted / body-less image-only bubbles carry no searchable
> text → never matched). `ChatScreen` renders an accent-coherent search `TopAppBar` (transparent-field cursor in
> `accentColor`, live `x / y` / "no matches" counter, up/down match nav) that replaces the normal bar while
> active, jumps the `LazyColumn` to the focused hit via `animateScrollToItem`, and threads `highlightTerm` into
> every `MessageBubble` (reusing the tested `highlightRanges`). EN/FR/ES/PT strings. Local match is instant — no
> artificial debounce (surpasses iOS's debounced online-only search). +29 tests (`ChatSearchTest` 24 — every
> match / blank / no-text / wraparound / single / empty / reconcile-keep / reconcile-fallthrough / reconcile-empty
> branch; `ChatViewModelTest` +5 — open+query highlight, next/prev nav, close-clears, stream-reconcile-keeps-focus,
> deleted-never-matched). `assembleDebug` + full `testDebugUnitTest` green (system Gradle 8.14.3). Reviewer: PASS
> (diff apps/android only; behaviour-through-public-API; SDK-purity/SSOT honoured — pure search core + reducer in
> `:feature:chat`, render/scroll orchestration in the exempt `ChatScreen` glue; reuses `highlightRanges` SSOT).

> On 2026-07-06 the **rich-text rendering** landed (slice `chat-rich-text-segments`, Chat parity §C
> "Rich text rendering — markdown, mentions, m+ links, URLs, search highlight"). The bubble rendered the body as
> a plain `Text` — no markdown, no tappable mentions/links, no search highlight. New pure `:core:model`
> `MessageTextParser` (port of the iOS `MessageTextRenderer` SSOT): `parse(text, mentionDisplayNames?) →
> List<MessageSegment>` runs one **earliest-match-wins** pass over a priority rule pipeline — markdown
> **bold**/*italic*/~~strike~~/`__underline__` (recursive nesting unions `TextStyles`), `@username` mentions with
> optional **display-name resolution** that wins over the bare-username fallback, `m+TOKEN` share links, and a
> pure O(n) `http(s)` URL matcher — plus `highlightRanges` (case-insensitive, non-overlapping), `extractUrls`
> (meeshy→mention→http order), and `resolvedLinkUrl` (tracked-link gateway redirect with trailing-punctuation
> trim; display stays the raw URL). Rendered via a new `:sdk-ui` `RichMessageText` composable (exempt glue) that
> maps segments → `AnnotatedString` with `LinkAnnotation.Url`/`withLink` (real taps via `LocalUriHandler`, no
> extra plumbing) and washes the highlight against the **rendered** plain text (no marker-drift — surpasses iOS).
> Wired into `MessageBubble`'s non-emoji text path; three optional params (`mentionDisplayNames`/`highlightTerm`/
> `trackedLinks`) thread through for `ChatScreen` to feed later. +34 tests. `:app:assembleDebug` + full
> `testDebugUnitTest` green (system Gradle 8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-
> public-API; SDK-purity/SSOT honoured — pure segmenter in `:core:model`, render orchestration in `:sdk-ui`).

> On 2026-07-06 the **honest all-or-nothing delivery indicator** landed (slice `delivery-status-resolver`,
> Chat parity — `feature-parity.md` "Delivery status checkmarks"). The sender-side 1→2→2-check indicator was
> **lying in groups**: `BubbleContentBuilder` classified `readCount > 0 → Read` / `deliveredCount > 0 →
> Delivered` with **no recipient denominator**, so one reader in a group of five showed "read by all". New pure
> `:core:model` `DeliveryStatusResolver` (port of the iOS SSOT of the same name): `resolve(base, deliveredCount,
> readCount, recipientCount, deliveredToAllAt?, readByAllAt?) → DeliveryState` applies the **WhatsApp-style
> all-or-nothing** rule — Delivered/Read only when **every** recipient received/read; `recipientCount <= 1`
> trusts the `> 0` threshold (1:1 / unknown denominator); the unambiguous `deliveredToAllAt`/`readByAllAt`
> markers **win** over the counts (denominator-independent, race-free live signal, `readByAll` > `deliveredToAll`);
> negative counts clamped; the send cycle (Pending/Failed) returned verbatim. It **never over-reports** — an
> upstream Read is honestly downgraded to Delivered/Sent when the group counts are only partial. Wired with **no
> DB migration** (`ApiMessage.deliveredToAllAt` rides the JSON payload, mirroring `readByAllAt`):
> `BubbleContentBuilder` gains a `recipientCount` param (default 1 = backward-compatible 1:1) and re-resolves via
> the SSOT (mapping `DeliveryState → DeliveryStatus`); `ChatViewModel` threads `memberCount - 1` from the
> conversation stream into the bubble `combine` (reactive `MutableStateFlow` — the check refreshes when either the
> counts or the member list arrives). **Also restored `isoToEpochMillisOrNull` in `:core:model` `IsoTime.kt`** —
> the `main` force-reset (see NOTES 2026-07-06) had dropped the slice that added it, but the just-merged
> message-effects `ChatScreen.kt` references it, so `main` was **uncompilable for Android** (the monorepo CI does
> not build Android, so it went undetected). +24 tests (`DeliveryStatusResolverTest` 18 — every group boundary /
> 1:1 / marker / clamp / downgrade branch; `BubbleContentBuilderTest` +4; `ChatViewModelTest` +2 group
> threading). `assembleDebug` + full `testDebugUnitTest` green (system Gradle 8.14.3). Surpasses the previous
> Android behaviour and matches iOS's honest indicator. Reviewer: PASS (diff `apps/android` only;
> behaviour-through-public-API; SDK-purity/SSOT honoured — pure decision in `:core:model`, render orchestration in
> `:sdk-ui`/`:feature:chat`).

> On 2026-07-06 the **message-effects lifecycle** landed (slice `message-effects-lifecycle`, Chat
> parity — ephemeral / blurred / view-once messages, feature-parity.md §"Rich message features"): the rich
> `MessageEffects` model was dead code (decoded nowhere, rendered nowhere). This slice makes it live and
> centralises — as an Android SSOT — the lifecycle logic iOS scatters across its message views. Pure `:core:model`
> `MessageLifecyclePresentation.of(effects, createdAtMillis, nowMillis, revealed, viewCount) → MessageLifecycle`
> is the total, side-effect-free decision over three independent axes: **ephemeral** (`Inactive` when not
> ephemeral / no-or-non-positive duration; `Counting(remainingMillis,totalMillis)` counting down from send time,
> clamping future/skewed send times to the full window and an unknown send time to just-started; `Expired` at or
> past the deadline), **blur** (`None`/`Concealed`/`Revealed` — tap-to-reveal), and **view-once** (`None`/
> `Available(remaining)`/`Consumed`, default max 1, non-positive max coerced to 1, over-consumed → `Consumed`,
> negative view counts clamped) plus stable-bit-order `appearance`/`persistent` effect lists. Ported the 3
> missing iOS `MessageEffects` accessors (`hasLifecycleEffect`/`hasAppearanceEffect`/`hasPersistentEffect` +
> `isEphemeral`/`isBlurred`/`isViewOnce`/`has`). Wired end-to-end with **no DB migration** (`ApiMessage.effects`
> rides the existing JSON `MessageEntity.payload`): `BubbleContentBuilder` carries `effects` onto `BubbleContent`
> (dropped on a deleted message, mirroring attachments); `ChatScreen` renders a compact accent-coherent lifecycle
> badge under the bubble — a 1 Hz clock that ticks **only while an ephemeral message is on screen**, a natural
> tap-to-reveal for blurred/view-once (local `mutableStateList` reveal set), and EN/FR/ES/PT strings. +35 tests
> (`MessageLifecyclePresentationTest` 25, `MessageEffectsTest` 8, `BubbleContentBuilderTest` +2 carry/deleted-drop).
> `:app:assembleDebug` + full `testDebugUnitTest` green (system Gradle 8.14.3). Surpasses iOS, which recomputes
> these states ad hoc per view. Reviewer: PASS (diff apps/android only; behaviour-through-public-API; SDK-purity/
> SSOT honoured — pure decision in `:core:model`, render orchestration in `:feature:chat`).

> On 2026-07-06 the **first/last-name profile-edit fields** landed (slice `edit-profile-name-fields`, §K):
> the `firstName`/`lastName` legs of the already-name-aware `ProfileEditApply`/`UpdateProfileRequest` are now
> reachable from the editor UI (before this, only displayName/bio/languages were). `ProfileEditRequestBuilder.build`
> gained `firstName`/`lastName` buffers with the same trim + blank→null degrade (a blank name is a `PATCH`
> omit-null server no-op, never an accidental clear); `ProfileViewModel` seeds/reads them via two new
> `ProfileUiState` buffers + `onFirstNameChange`/`onLastNameChange` intents, with `withBuffersFrom` mapping a
> user that has no names to *blank* buffers (never the literal "null"); `ProfileScreen` renders First name /
> Last name `OutlinedTextField`s (Words capitalization) above Display name. Everything else — the optimistic
> republish, the durable `UPDATE_PROFILE` outbox row, the worker-woken-only-on-`cmid`, the mid-edit
> buffer-clobber guard — is reused untouched; **no new store, no new outbox kind, no coalescer change**.
> +6 tests (`ProfileEditRequestBuilderTest` +3 first/last trim·blank→null·carry-through, `ProfileViewModelEditTest`
> +3 seed·blank-when-nameless·intents; the existing save-enqueue and cancel-restore cases were hardened to
> assert the name legs too, not just displayName). `assembleDebug` + full `testDebugUnitTest` green (system
> Gradle 8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-public-API; SDK-purity/SSOT/
> optimistic-UDF/instant-app honoured). Only avatar/banner upload now remains in the §K profile-edit box.

> On 2026-07-06 the **regional (secondary content) language preference** landed (slice
> `settings-regional-content-language`, §L) — the last no-op Settings language row is now live. Unlike
> the interface language (device-local UI chrome), the regional language is a **Prisme content preference**
> resolved via `LanguageResolver`, stored on the backend profile (`User.regionalLanguage`). Pure core:
> `:feature:settings` `RegionalLanguageSelection.build(regionalCode, systemCode, query) →
> RegionalLanguagePresentation` — the picker SSOT. Options are the full content-language set
> (`LanguageData.allLanguages`, NOT the 4 interface languages); the current choice is marked
> (trimmed/case-insensitive), with a robust case-insensitive `selectedLabel` lookup (blank/absent/unknown →
> no label, no crash); the **primary (system) language is hidden** so a user can never pick their primary as
> their secondary — *unless* it is the stored choice (a `regional == system` data inconsistency never hides
> the active selection); a trimmed case-insensitive search spans English name / native name / code
> (empty/whitespace → every option; no match → empty list). Wiring reuses the `edit-profile-optimistic`
> machinery with **no new store**: `SettingsViewModel.setRegionalLanguage(code)` →
> `UserRepository.enqueueProfileEdit(UpdateProfileRequest(regionalLanguage=code))` — the session repaints
> instantly (optimistic), a durable `UPDATE_PROFILE` row survives offline, and the flush worker is woken only
> on a real `cmid` (a sessionless/superseded enqueue is inert). A UI-only `setRegionalLanguageQuery` drives
> the search and never writes. `SettingsScreen` renders a searchable flag+native-name Material3 dialog
> (mirrors the notification-type search) with the current native name as the row detail (EN/FR/ES/PT).
> +24 tests (18 `RegionalLanguageSelectionTest` pure-core, 6 `SettingsViewModelRegionalLanguageTest`).
> `:app:assembleDebug` + full `testDebugUnitTest` green (system Gradle 8.14.3). Surpasses iOS, whose
> regional-language write is online-only. Reviewer: PASS (diff apps/android only; behaviour-through-public-API;
> SDK-purity/SSOT/optimistic-UDF/instant-app honoured).

> On 2026-07-06 the **offline-queued notification-preference backend sync** landed (slice
> `settings-notification-prefs-sync`, §L): the previously-declared-but-dead `OutboxKind.UPDATE_SETTINGS` /
> `OutboxLanes.SETTINGS` are now wired end-to-end so a device-local notification toggle debounce-syncs to the
> gateway (`PATCH /me/preferences/notification`), offline-durable, mirroring `edit-profile-optimistic`. Pure
> core: `:core:model` `NotificationPreferenceSyncBody.from(prefs)` — the gateway-contract SSOT projecting the
> block into the wire body (all 30 `NotificationPreferenceSchema` fields, the local-only `extras` map dropped,
> `dndDays` riding as the lowercase enum tokens). Seams: `core/network` `PreferencesApi.updateNotification`
> (idempotent PATCH → `ApiResponse<Unit>`, the device store stays UI-authoritative so the response is ignored);
> `:sdk-core` `NotificationPreferencesSyncRepository.enqueueSync` (session-gated durable enqueue keyed by own
> user id — inert `null` with no session / blank id, no optimistic session flip since the store already holds
> the value); an `OutboxCoalescer` `UPDATE_SETTINGS` latest-snapshot rule (an offline toggle burst collapses to
> one PATCH) + an `OutboxFlushWorker` `UPDATE_SETTINGS` sender (bad payload → permanent, network fail →
> transient/retry; no rollback on exhaust — the PATCH is idempotent and the local store is truth). Wiring:
> `SettingsViewModel.updateNotifications` — the single funnel every persisted toggle flows through — now paints
> the local store instantly (UI SSOT) **then** enqueues the sync and wakes the flush worker only on a real
> `cmid`; the UI-only search query never syncs. +15 tests (4 body, +3 coalescer, 4 repo, 4 VM). `assembleDebug`
> + full `testDebugUnitTest` green (system Gradle 8.14.3). Surpasses iOS, whose preference write is online-only.
> Reviewer: PASS (diff apps/android only; behaviour-through-public-API; SDK-purity/SSOT/instant-app honoured).

> On 2026-07-05 the **persisted interface (UI chrome) language** landed (slice `settings-interface-language`,
> §L — mirrors the theme slice one step further): the pure `:core:model` `AppLanguage` helpers are the SSOT —
> `supportedCodes`/`supportedLanguages` derived from `LanguageData.interfaceLanguages` (fr/en/es/ar),
> `fromStorage`/`storageValue` (trim/case-insensitive codec; `"system"` token, blank, absent, unsupported →
> `null` = follow device), and `resolveInterfaceLocaleTag` (the effective tag to force, or `null` to leave the
> device locale). Durable seam: DataStore-backed `InterfaceLanguageStore` (`:sdk-core` — `InMemoryInterfaceLanguageStore`
> for tests + `DataStoreInterfaceLanguageStore` decoding through the pure codec, hydrating on cold start via
> `stateIn(Eagerly)`, `@Singleton` in `SdkModule` over `preferencesDataStoreFile("meeshy_language")`). Wiring:
> `SettingsViewModel` mirrors the store into `SettingsUiState.interfaceLanguage` + a `setInterfaceLanguage`
> intent; `SettingsScreen`'s display-language row now shows the current choice and opens a Material3 dialog
> (System + flags/native names, EN/FR/ES/PT strings); `MainActivity` re-localises the *whole Compose tree* live
> via a `LanguageViewModel` + a `LocalizedContent` wrapper that provides a `createConfigurationContext`-localised
> `LocalContext`/`LocalConfiguration` (minSdk-26 safe, no AppCompat dependency, works on every supported API).
> The **regional** language row stays a no-op on purpose — it is a Prisme *content*-preference (backend profile /
> content store), not the app UI locale. +32 tests (`AppLanguageTest` 18, `InterfaceLanguageStoreTest` 9,
> `SettingsViewModelLanguageTest` 5). `assembleDebug` + full `testDebugUnitTest` green (system Gradle 8.14.3).
> Reviewer: PASS (diff apps/android only; behaviour-through-public-API; SDK-purity/SSOT/UDF/instant-app honoured).

> On 2026-07-05 the **persisted light/dark/system theme** landed (slice `settings-theme-mode`, §L — the
> first Settings §L slice, opening the area): the pure `:core:model` `AppTheme` helpers are the SSOT —
> `AppThemeMode.resolveDarkMode(systemInDark)` (LIGHT→false, DARK→true, AUTO→system), `storageValue`
> (stable `@SerialName` token), `next()` (tap-to-cycle AUTO→LIGHT→DARK→wrap), and `appThemeModeFromStorage`
> (trim/case-insensitive, `"system"` alias, corrupt/blank/unknown → AUTO so a legacy value never breaks the
> appearance). The durable seam is a DataStore-backed `ThemeStore` (`:sdk-core` — `InMemoryThemeStore` for
> tests + `DataStoreThemeStore` that decodes through the pure codec, hydrates the persisted choice on cold
> start via `stateIn(Eagerly)` so there's no flash of the wrong theme, provided as a `@Singleton` in
> `SdkModule` over `preferencesDataStoreFile("meeshy_theme")`). Wiring: `SettingsViewModel` mirrors the store
> into `SettingsUiState.themeMode` and drives it through `setThemeMode`/`cycleTheme`; `SettingsScreen` renders
> an Appearance section with a Material3 segmented System/Light/Dark picker (EN/FR/ES/PT); `MainActivity`
> re-themes the whole app live via a `ThemeViewModel` that folds `resolveDarkMode(isSystemInDarkTheme())` into
> `MeeshyTheme(darkTheme=…)`. No dead ends — every derived value has a live consumer. +23 tests
> (`AppThemeTest` 12, `ThemeStoreTest` 6, `SettingsViewModelThemeTest` 5). `assembleDebug` + full
> `testDebugUnitTest` green (system Gradle 8.14.3). Surpasses iOS whose theme is a plain enum toggle — here the
> codec is corruption-proof and the store is a reusable durable building block. Reviewer: PASS (diff
> apps/android only; behaviour-through-public-API tests; SDK-purity/UDF/instant-app honoured).

> On 2026-07-05 the **optimistic + offline profile edit** landed (slice `edit-profile-optimistic`, §K): the
> already-declared `OutboxKind.UPDATE_PROFILE` (lane `PROFILE`, drained but with no sender) is now wired
> end-to-end. Pure cores: `:core:model` `ProfileEditApply.apply(user, request)` — the edit-merge SSOT with
> `PATCH /users/me` omit-null parity (null field = absent → unchanged, non-null overwrites) so the optimistic
> paint equals the server result; `:feature:profile` `ProfileEditRequestBuilder.build(...)` — trims the
> editor buffers and degrades blank→null (a blank edit is a server no-op, never an accidental clear); and the
> `OutboxCoalescer` `UPDATE_PROFILE` rule (latest full-snapshot wins, keyed by the own user id). Wiring:
> `SessionRepository.applyProfileEdit` (optimistic republish of the merged identity, inert with no session),
> `UserRepository.enqueueProfileEdit` (optimistic flip + durable profile-lane enqueue, `null`/blank session
> inert — mirrors `BlockRepository.setBlockedDurably`), an `OutboxFlushWorker` `UPDATE_PROFILE` sender
> (decode → `updateProfile` → `adopt(server user)`) + an `onExhausted` `sessionRepository.refresh()` revert to
> server truth. `ProfileViewModel` carries the three content-language buffers, saves through the
> optimistic/offline path (editor closes instantly, worker woken only on a real `cmid`, a local-enqueue
> failure reopens the editor + surfaces the error), and guards the editor buffers from a background session
> emission mid-edit; `ProfileScreen` renders three `LanguageData`-backed content-language dropdowns
> (flag + name) in the edit form (EN/FR/ES/PT). +31 tests (`ProfileEditApplyTest` 7, `ProfileEditRequestBuilderTest`
> 6, `OutboxCoalescerTest` +3, `SessionRepositoryTest` +2, `UserRepositoryTest` 4, `ProfileViewModelEditTest` 9).
> `assembleDebug` + `testDebugUnitTest` (full) green. Surpasses iOS, whose profile edit is online-only.
> Reviewer: PASS (diff apps/android only; behaviour-through-public-API tests; optimistic/UDF/SDK-purity honoured).

> On 2026-07-05 the **profile stats/timeline Room cache** landed (slice `profile-stats-room-cache`, §K): the
> profile dashboard now paints instantly from Room on cold start / offline, closing the last cache gap in
> §K (iOS `CacheCoordinator.stats`/`.timeline`). New `:core:database` `ProfileStatsCacheEntity`
> (`profile_stats_cache`, keyed JSON store) + `ProfileStatsCacheDao` (DB **v9→v10**, destructive fallback) +
> `DatabaseModule` provider; new `:sdk-core` `ProfileStatsCacheRepository` (stateless Room building block) —
> `cachedStats(userId)`/`persistStats` (keyed per-user, isolated) and `cachedTimeline()`/`persistTimeline`
> (me-only constant key). Cold vs synced-empty is carried by **row presence** (absent → `null` cold; present
> `[]` → `emptyList` synced-empty, so an empty 30-day window never re-reads as cold — no `sync_meta` needed);
> a payload that fails to decode is a cache **miss** (`null`), never a crash. `ProfileViewModel` rewired
> cache-first for both surfaces: paint the cached projection immediately, then revalidate over the network and
> write-through on success (network is truth — it overwrites the cached paint; a failed fetch keeps the cached
> paint; no write-through on failure). SDK purity kept — the projection SSOT stays in the `:feature:profile`
> builders, the repo holds no projection logic. +20 tests (11 Robolectric repo, 6 VM cache-first behaviour,
> +3 existing VM tests hardened to cold-cache). `assembleDebug` + all `testDebugUnitTest` green (system Gradle
> 8.14.3). Diff = `apps/android` only (5 prod + 4 test + docs).

> On 2026-07-05 the **30-day activity timeline** landed (slice `profile-stats-timeline`, §K): the me-only
> `UserApi`/`UserRepository` `getUserStatsTimeline(days=30)` (`/users/me/stats/timeline`, `days` clamped to
> the gateway `7..90` window) feeds the pure `:feature:profile` `StatsTimelineBuilder.build(points) →
> StatsTimelinePresentation?` (precedent `UserStatsBuilder`) — empty→`null` (nothing to chart), non-empty
> all-zero→a flat inactive presentation (no divide-by-zero), negative counts floored, peak-normalized
> `0f..1f` bars, input order preserved (oldest→newest), `DD/MM` labels ported from iOS `shortDate`, plus
> total/rounded-average/active-days. `ProfileViewModel` fetches it once for the **own** profile only
> (me-only endpoint), failure-inert; `ProfileScreen` renders an accent-coherent line+area sparkline (Canvas)
> with an empty-state label (EN/FR/ES/PT). +17 tests. `assembleDebug`+`testDebugUnitTest` green.

> On 2026-07-05 the **stats projection SSOT** landed (slice `profile-stats-presentation`, §K): the pure
> `:feature:profile` `UserStatsBuilder.build(stats) → UserStatsPresentation` (precedent `ProfileHeaderBuilder`)
> projects `UserStats` into six ranked/compact-formatted counter tiles + defensively-reconciled achievement
> badges (progress clamped `0..100`, `isUnlocked` recomputed from `current >= threshold`, negatives floored,
> ranked unlocked→progress→current→id) + an unlocked summary, plus a boundary-safe `formatCompactCount`
> (K/M/B, no `1000.0K` artifact). `ProfileViewModel` fetches `getUserStats` once per resolved user and is
> failure-inert (a stats error never clobbers the profile); `ProfileScreen` renders the read-only tile grid +
> "N of M unlocked" achievements list (EN/FR/ES/PT). +35 tests. `assembleDebug`+`testDebugUnitTest` green.

> On 2026-07-05 the **profile-header enrichment** landed (slice `profile-header-presentation`,
> §K): the pure `:feature:profile` `ProfileHeaderBuilder.build(user, now) → ProfileHeaderPresentation`
> (precedent `FeedPostBuilder`) is the tested SSOT projecting a `MeeshyUser` into the read-only header —
> the display-name ladder (reuses `MeeshyUser.effectiveDisplayName`), the `@handle` (null on a blank
> username), blank→null degradation of every optional text field (bio/avatar/languages/country), the
> three-state presence (reuses the `UserPresence.state` SSOT — offline/unknown → no dot, online → green,
> idle > 5min → amber), the completion % clamped into `0..100` (a malformed server value can never
> over/under-fill the ring), the E2EE flag (`signalIdentityKeyPublic` present & non-blank), and the
> member-since epoch (reuses `isoToEpochMillisOrNull`, null on absent/garbage `createdAt`). The existing
> `ProfileScreen` read-only view now consumes it: an accent-coloured `ProfileCompletionRing` Canvas arc
> around the avatar, a bordered green/amber presence dot overlaid bottom-right, an E2EE lock badge, a
> "Profile N% complete" label and a localized "member since" line (EN/FR/ES/PT). No orphan code — every
> derived field has a live consumer in the header. +22 behavioural tests. `assembleDebug` +
> `testDebugUnitTest` (full) green. This opens the §K Profile area (all pure, richly branch-covered).

> Calls kicked off 2026-06-30 with the pure call-lifecycle FSM (`core:model`
> `me.meeshy.sdk.model.call` — `CallState`/`CallEndReason`/`CallEvent`/`CallStateMachine`). On
> 2026-07-01 the `:feature:calls` module landed its real consumer (slice `calls-viewmodel-screen`):
> a UDF `CallViewModel` (`StateFlow<CallUiState>`) driving the FSM via accept/decline/hang-up/mute/
> camera intents + signalling events, a pure `CallPresenter` projecting the UI state, and a minimal
> accent-coherent call screen reachable from audio/video buttons in the chat header. On 2026-07-01 the
> **signalling event models + socket mapping** landed (slice `call-signalling-events`): `@Serializable`
> inbound `call:*` payload types + a total pure `CallSignalMapper.map(eventName, rawJson) → CallEvent?`
> at parity with the iOS `MessageSocketManager` listen table. On 2026-07-01 the **socket subscription +
> outbound emit table** landed (slice `call-signal-manager`): `:sdk-core` `CallSignalManager` listens to
> all 8 inbound `call:*` frames → `CallSignalMapper` → `SharedFlow<CallEvent> events`, and exposes the
> fire-and-forget outbound emits (`join`/`leave`/`end`/`toggle-audio`/`toggle-video`/`signal`) at
> iOS-exact payload keys. On 2026-07-01 the **call-journal model** landed (slice `call-history-model`):
> `core:model` gains `CallDirection` (raw-degrades to incoming), `CallMediaType` (audioOnly/audioVideo),
> `@Serializable` `CallHistoryPeer` + `CallRecord` mirroring the gateway `CallHistoryItem` REST contract
> field-for-field (ISO-8601 timestamps as strings, keeping the module date-dependency-free), with pure
> display accessors (`directionKind`/`isMissed`, `mediaType`, four-tier `displayName`, `avatarUrl`,
> `durationLabel`, `dataLabel`) as the single tested SSOT a future missed/recent-calls list renders.
> On 2026-07-01 the **call-history repository** landed (slice `call-history-repository`): `:core:network`
> `CallHistoryApi`, `:core:database` `CallHistoryEntity`/`CallHistoryDao` (DB v6→v7), and `:sdk-core`
> `CallHistoryRepository` — a cache-first SWR `historyStream()` (via `CallHistoryCacheSource`, port of
> `StoryCacheSource`) plus a cursor-paginated `fetchPage → CallHistoryPage`. On 2026-07-01 the
> **recent/missed-calls list UI** landed (slice `call-history-list`): a UDF `CallHistoryViewModel`
> over `historyStream()` — SWR flags (skeleton only on cold empty), a client-side missed-only filter,
> cursor-paged infinite scroll via `fetchPage` (de-dup, cursor advance, `hasMore`/re-entrancy/failure
> gating), and pull-to-refresh that resets paging — backed by the pure `CallHistoryList` (combine+filter)
> and `CallTimeLabel` (ISO → relative label), rendered by an accent-coherent `CallHistoryScreen`.
> On 2026-07-01 the **ACK-based `call:initiate`** landed (slice `call-initiate-ack`): `core:model` gains
> `SocketIceServer` (+ `IceServerUrlsSerializer` normalising single-string-or-array `urls`),
> `CallInitiateAck`, the sealed `CallInitiateResult` (`Success`/`ServerError`/`Malformed`/`Timeout`) and
> the total pure `CallInitiateAckParser.parse`, plus `:sdk-core` `CallSignalManager.emitInitiate(
> conversationId, isVideo)` — the suspend emit that mints the real `callId` (+ mode / ICE servers / ttl)
> every outbound emit is keyed by, at parity with the iOS `emitCallInitiate` (10s ACK budget). The
> `callId` lifecycle now exists.
> On 2026-07-01 the **VM-fold** landed (slice `call-viewmodel-signal-fold`): `CallViewModel` now folds
> `CallSignalManager.events` in `viewModelScope` (each mapped `CallEvent` reduced through the FSM), an
> outgoing `start` mints the real `callId` via `emitInitiate` (optimistic ring, then `Ended(Failed)` on
> ACK failure), and accept/decline/hang-up/mute/camera fan out to `emitJoin`/`emitEnd`/`emitToggleAudio`/
> `emitToggleVideo` keyed by the known `callId` (inert until one exists). The call screen is now a real
> two-way endpoint over the socket.
> On 2026-07-02 the **realtime session binding** landed (slice `realtime-session-coordinator`): the whole
> realtime layer was previously dead — nothing called `SocketManager.connect()` and no manager's `attach()`
> ran, so `CallSignalManager.events` (and every `message:*`/social frame) never flowed. A new
> `:sdk-core` `RealtimeSessionCoordinator.onAuthenticatedChanged(isAuthenticated)` is the one bridge from
> the auth session to the socket: on sign-in it `connect()`s the socket **then** attaches all three feature
> managers (message/social/call), on sign-out it `disconnect()`s, and it acts only on genuine auth edges
> (no double-connect on a redundant signal). The ordering + edge invariants live in the pure
> `RealtimeLifecyclePlan.commandsFor(was, is)`; **attach is paired with every connect** (not once ever) so a
> logout→login cycle re-attaches on the new socket. `AuthViewModel` drives it at init (restored token),
> login success, and logout. +11 tests (5 plan, 6 coordinator) + 5 AuthViewModel wiring tests.
> On 2026-07-02 the **outgoing-call room threading** landed (slice `call-nav-conversation-thread`): the
> `:app` CALL route dropped the `conversationId`, so `CallViewModel.start` → `emitInitiate("", …)` fired
> into an empty room (every outgoing call dead-on-arrival). A new pure `me.meeshy.app.navigation.CallRoute`
> (SSOT: `PATTERN`, `path(...)`, `config(conversationId?, peerName?, isVideo?) → CallConfig`) now owns the
> route; the CHAT `composable` threads its own `conversationId` nav-arg into `Routes.call(...)`, and the
> CALL `composable` decodes the args through `CallRoute.config`. Outgoing calls now initiate into the real
> room. +8 tests (first `:app` test source set).
> On 2026-07-02 the **Calls bottom-nav tab** landed (slice `calls-tab-nav`): `CallHistoryScreen` was
> reachable-by-nobody dead UI — no route pointed at it. A new `Routes.CALLS` tab (`Call` icon, placed
> Messages · Feed · **Calls** · Activity · Profile) mounts it in the `NavHost`, and tapping a journal row
> re-dials via the new pure `CallRoute.redial(record)` — the natural "tap a past call to call back" gesture,
> threading the record's conversation, resolved `displayName` and media straight into the outgoing-call
> route (identical to a call from the chat header). +4 `CallRouteTest` cases (conversation/name/media round
> trip, displayName-over-username resolution + reserved-char encoding, audio-only, peer-absent group
> fallback). `assembleDebug` + `:app:testDebugUnitTest` green.
> On 2026-07-02 the **incoming-call push decision core** landed (slice `incoming-call-push-decision`): the
> pure `core:model` brick before the Android Telecom/`ConnectionService` full-screen-intent plumbing.
> `IncomingCallPush` (typed FCM `data`-map / VoIP payload at gateway parity) + total
> `IncomingCallPushParser.parse` (call iff `type ∈ {call,voip_call}` + non-blank `callId`; lenient
> `iceServers`) + immutable `SeenCallRing` (pure port of iOS `VoIPDedupRing`, cap 24 / ttl 30s) + pure
> `IncomingCallDecider.decide` (`Ring` | `Ignore(DUPLICATE/BUSY/SELF_INITIATED)`, ordering faithful to
> `VoIPPushManager`/`reportIncomingVoIPCall`). +39 behavioural tests. The SSOT the FCM-service routing +
> full-screen notification will consume.
> On 2026-07-02 the **FCM call-push routing** landed (slice `fcm-call-push-route`): the pure
> `IncomingCallPushRouter.route(data, context) → IncomingCallPushRoute` (`NotACallPush` | `Ring(push,
> updatedSeen)` | `Suppress(reason)`) folds the parser + decider + ring-insert into the single total
> decision the FCM service delegates to — the dedup ring is advanced **only** on a `Ring` outcome, so a
> retried VoIP push is caught next time while a suppressed (self / busy / duplicate) push never poisons a
> future legitimate ring. The app-layer `@Singleton IncomingCallRingStore` is the sole owner of the live
> `SeenCallRing` (synchronized `route`/`forget`; self-user id threaded from `SessionRepository`), and
> `MeeshyFcmService.onMessageReceived` now routes each push by kind: a `Ring` fires a full-screen,
> CATEGORY_CALL / `PRIORITY_MAX` notification on the new `meeshy_calls` channel (`setFullScreenIntent` →
> `MainActivity` with `callId`/`conversationId`/`callerName`/`isVideo` extras), a `Suppress` drops
> silently, and a `NotACallPush` falls through to the existing message-notification + outbox-flush path.
> +19 behavioural tests (11 router, 8 store). `:app:assembleDebug` + `testDebugUnitTest` green.
> On 2026-07-02 the **incoming-call deep-link** landed (slice `incoming-call-deeplink`): the call
> full-screen intent + message notification set extras on `MainActivity`, but `MainActivity` ignored them
> — a ring tap opened the app on the conversation list, never the call. The new pure
> `me.meeshy.app.navigation.LaunchRouter.route(LaunchExtras) → String?` is the SSOT: a non-blank `callId`
> deep-links into the incoming-call screen via `CallRoute.incoming(...)` (a call push **wins** over a
> message push — a ring is the urgent intent — and the route carries `isOutgoing=false` + the server
> `callId` so the screen **answers** rather than re-initiates), else a non-blank `conversationId` opens
> that chat (`Routes.chat`, the shared message-tap path), else `null` (start dest stands). `CallRoute` was
> refactored from a path-arg route to a **static `call` path + all-optional query args** so a blank room
> or peer name can never collapse a required path segment and crash `navigate()` (Compose Navigation
> requires non-empty path segments) — strictly more robust, outgoing/redial behaviour preserved.
> `MainActivity` extracts the extras (thin glue) and calls `LaunchRouter` in `onCreate` + `onNewIntent`;
> `MeeshyApp` navigates via a `LaunchedEffect` once the graph is live **and** the user is authenticated
> (an unauthenticated cold launch defers the route across the login gate), then marks it consumed so a
> recomposition never re-navigates. +14 behavioural tests (8 `LaunchRouterTest`, 6 new `CallRouteTest`).
> `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-02 the **live in-call duration timer** landed (slice `call-duration-timer`): the pure
> `CallDuration.clock(seconds)` in `:core:model` is now the SSOT for call-length formatting (reused by
> `CallRecord.durationLabel`), `CallViewModel` runs a 1-Hz timer via an injected `CallSecondsTicker` flow
> seam while connected/reconnecting, and `CallPresenter` derives `CallUiState.durationLabel` — `"0:00"` on
> connect, ticking through a reconnect, frozen at the final length on the ended screen, `null` for a call
> that never connected. The connected screen shows the running clock; the ended screen appends the final
> length. +18 tests.
> On 2026-07-02 the **call-audio decision core** landed (slice `call-sound-policy`): the pure
> `core:model` `CallSoundPolicy` is the SSOT mapping call lifecycle → sound — the Android analogue of the
> iOS `RingbackTonePlayer` call sites collected into one total function. `loopFor(state)`
> (`CallSound.None/Ringback/Ringtone`) plays the caller **ringback** through the whole pre-answer wait
> (`Ringing(outgoing)` + `Offering`) and stops it the instant the answer lands (`Connecting`) — tighter
> than iOS, which drags it to `.connected` — and the callee **ringtone** while `Ringing(incoming)`;
> `cueFor(prev,next)` fires `CallCue.Connected` on every entry into `Connected` (first connect **and**
> reconnect-success) and `CallCue.Ended` only when a *live* call ends (`prev.isActive`, mirroring iOS
> `if wasActive`), so a phantom `Idle→Ended`/idempotent `Ended→Ended` stays silent; `plan(prev,next)`
> bundles both per edge. The `:feature:calls` `CallToneController` seam (thin `ToneGenerator`/
> `RingtoneManager` glue behind an interface, `@Binds AndroidCallToneController`) is folded into
> `CallViewModel.dispatch` — each FSM edge drives the loop (switched only on a genuine change, so an inert
> event never restarts the ringback) + fires the cue, released on `onCleared`. +28 tests (19 policy, 9
> VM-fold via a recording fake). `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-03 the **telecom-connection decision core** landed (slice `call-telecom-state-plan`): the pure
> `core:model` `TelecomCallPolicy` is the SSOT mapping call lifecycle → the OS telecom reports a
> self-managed `ConnectionService` must make — the Android analogue of the `CXProvider.reportCall(...)` /
> `report(_:endedAt:)` calls the iOS `CallManager` makes to CallKit, collected into one total function.
> `connectionStateFor(state)` keys purely on `CallState` (no direction leak): outgoing ring/`Offering` →
> `Dialing`, incoming ring → `Ringing`, **answered = `Active`** (`Connecting`/`Connected`/`Reconnecting`
> collapse onto `Active` so an ICE restart never tears the system call down), `Ended` → `Disconnected`,
> `Idle` → none. `disconnectCauseFor(reason)` maps every `CallEndReason` (lost/failed → `Error`).
> `plan(prev,next)` reports **only on a genuine transition** — dedupes an already-active edge, a phantom
> `Idle→Ended` (no connection ever created, mirroring `CallSoundPolicy`'s `prev.isActive` guard), an
> idempotent `Ended→Ended`, and a settle `Ended→Idle` all to `null`. The `:feature:calls`
> `TelecomCallReporter` seam (thin `LogTelecomCallReporter` interim glue behind an interface, `@Binds` into
> a Hilt module) is folded into `CallViewModel.dispatch` (report each genuine edge; released on
> `onCleared`). +35 tests (28 policy, 7 VM-fold via a recording fake). `assembleDebug` + all
> `testDebugUnitTest` green.
> On 2026-07-03 the **connection-quality core + indicator** landed (slice `call-quality-level`): the pure
> `core:model` `VideoQualityLevel` (5-tier `CRITICAL<POOR<FAIR<GOOD<EXCELLENT`, port of iOS
> `VideoQualityLevel`/`QualityThresholds`) classifies live stats via `from(rttMs, packetLoss)`
> (worse-of-two-axes, strict `>`) + `from(availableOutgoingBitrateBps)` and carries each tier's sender
> caps for the future adaptive-bitrate ladder; the four-tier `ConnectionQuality` collapses it
> (`CRITICAL→POOR`, parity with iOS `connectionQualityLabel`) with `bars`/`isWeak`. A `CallQualitySampler`
> stats seam (interim `NoopCallQualitySampler`) is folded into `CallViewModel` exactly while media flows
> (a `qualityJob` mirroring the duration ticker), projected by `CallPresenter` into
> `CallUiState.connectionQuality`, and rendered as an accent-coherent 4-bar signal indicator on the call
> screen (error hue on a weak link). +37 tests (24 core, 6 VM-fold, 3 presenter, +4 strings×4 locales).
> `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-03 the **video-survival auto-disable policy** landed (slice `call-video-survival-policy`, #1387):
> the pure `core:model` `VideoSurvivalPolicy.reduce(state, level, nowSeconds, userWantsVideo)` drops
> outbound video to audio-only after a sustained ≥6 s `POOR`/`CRITICAL` streak and resumes after a
> sustained ≥10 s `EXCELLENT`/`GOOD` streak (duration-based hysteresis on a monotonic clock, `FAIR` holds
> the recovery window). +19 tests. The actuator seam is deferred to the WebRTC layer.
> On 2026-07-03 the **WebRTC-plumbing emits** landed (slice `call-webrtc-plumbing-emits`): `:sdk-core`
> `CallSignalManager` gains the five remaining outbound call frames at iOS payload-key parity —
> `emitRequestIceServers`/`emitHeartbeat`/`emitQualityReport`/`emitReconnecting`/`emitReconnected`. The
> `call:quality-report` `stats` shape is decided once by the pure `core:model` `CallQualityReport.
> statsFields()` (base five metrics always present; `availableOutgoingBitrateBps`/`jitterMs` appended only
> when strictly positive, iOS parity), with `ConnectionQuality.wireValue` as the `level` SSOT and `Long`
> byte counters (surpasses iOS's 32-bit `Int` — no overflow on a marathon call). The outbound emit table
> for the whole call domain is now complete; only the **app-side driver seams** (heartbeat/quality-report
> timers, ICE-restart controller) that *call* these emits remain, and land with the WebRTC media
> transport. +16 tests (10 report, 6 manager). `assembleDebug` + all `testDebugUnitTest` green.
> On 2026-07-03 the **identity-aware active-call teardown** landed (slice `call-ended-identity-teardown`):
> a bug fix closing the `call-ended-signal-identity` follow-up. `call:ended`/`call:missed` no longer ride the
> identity-less `CallSignalManager.events` (they now map to `null` in `CallSignalMapper.map`); the single pure
> `CallSignalMapper.endedSignal → CallEndedSignal(callId, event)` decode is the sole teardown path, carried on
> `endedCalls: SharedFlow<CallEndedSignal>`. `CallViewModel.onRemoteEnded` gates on identity — the active
> call's id reduces its FSM, the waiting call's id only dismisses the banner, neither is inert — so a waiting
> call's teardown fanned out to a busy user's rooms can no longer tear down the active call.
> **Next:** the real self-managed `ConnectionService`/`PhoneAccount` registration + full-screen call UI +
> foreground service (the platform glue that swaps the `LogTelecomCallReporter` `@Binds` for a real
> reporter and owns the audio session), then the actual WebRTC media transport (`stream-webrtc-android`).
> Follow-up: `SocketManager.reconnectWithToken()`
> still has no caller (token-refresh re-attach slice — deferred until a token-rotation trigger exists).
> See the run log + `feature-parity.md §H`.

Stories so far: tray (ring carousel) + cross-group viewer playback engine +
quick-reaction strip + swipe gestures + realtime reaction socket deltas +
who-viewed sheet + Room-backed tray SWR + comments overlay + segmented
count-dots + adjacent-slide media prefetch + auto-advance media-load gate +
text composer + durable-outbox publish shipped earlier loops; this loop makes
the **tray optimistic** — a just-queued story shows instantly as a `pending_*`
self-ring derived from the live durable outbox (`StoryRepository.pendingPublishes`
building block + pure `StoryOptimisticTray` product rule), so it survives process
death, **rolls back** automatically if the publish exhausts, and hands off to the
real story on delivery (the VM refreshes when a publish vanishes from the queue).
Surpasses iOS's in-memory optimism (which evaporates on a kill). The
`story-publish-retry` loop closed the failure gap (exhausted publish → a
"Couldn't post your story" Retry/Discard strip). Latest loop
(`story-composer-media`) gives the composer **real media**: the system
photo/video picker (`ActivityResultContracts.PickVisualMedia`) feeds the chosen
file to `StoryComposerViewModel.onMediaPicked`, which uploads it via the
`media-upload-api` foundation and **appends** the returned media to the draft
(`StoryComposerUiState.attachments` preview + `draft.mediaIds`); `publish()`
carries `mediaIds` into the same durable-outbox flow. A **media-only** story
(no caption) is now publishable. Uploads are re-entrancy-guarded, gate
`canPublish` while in flight, and fail gracefully (message, draft intact).
Latest loop (`story-composer-media-cap`) enforces the iOS **≤10 media cap**: the
pure draft gains `MAX_MEDIA`/`isWithinMediaLimit`/`remainingMediaSlots`/`isMediaFull`
(and `canPublish` now also requires the media limit), `onMediaPicked` truncates a
pick to the free slots and is inert-with-a-warning once full, and the composer's
Add button disables + shows an `n/10` count at the cap. Latest loop
(`story-composer-multipick`) lets a user grab **several media in one go**: a pure
`StoryMediaPicker.modeFor(remainingSlots)` routes the Add button to the single- or
multi-item system picker (`PickMultipleVisualMedia(MAX_MEDIA)`), falling back to
the single picker at exactly one free slot so the multi-picker's `maxItems > 1`
requirement never throws, and launching nothing when full. The VM's existing
free-slot truncation still caps the batch, so the ≤10 invariant holds end-to-end.
Latest loop (`outbox-produced-id-writeback`) closed the **second half** of the durable
upload→publish chain: a prerequisite that delivers a `SendResult.SuccessWithId(realId)`
now **grafts** that real id into every still-queued dependent publish's payload
(placeholder = the prerequisite's own `cmid`) before its gate opens — via the pure
`PublishMediaWriteBack.graft` and the generic `OutboxRepository.rewriteDependents`. A
media story queued **offline, before its upload finished** will publish with the
correct id (once the producer half — a durable `MEDIA`-lane upload sender — lands).
Latest loop (`media-blob-store`) lands the **first brick of that producer half**: a
durable file-bytes store. The shared outbox carries a `String` payload, so an
`UPLOAD_MEDIA` row can't hold raw bytes — the new `MediaBlobEntity`/`MediaBlobDao`
(Room, DB v5→v6 via the existing destructive fallback) plus the `MediaBlobStore`
building block (`put`/`get`/`remove`, keyed by the upload row's cmid, reusing
`MediaUploadItem` as the single bytes shape) persist the file so a media attachment
queued **fully offline** survives process death. Latest loop (`media-upload-sender`)
lands the **rest of the producer half at the SDK layer**: a new
`OutboxKind.UPLOAD_MEDIA`, a pure `MediaUploadSender.send(item, upload)` mapping the
four delivery outcomes (blob gone → permanent; offline → transient; empty result →
permanent; real id → `SuccessWithId(realMediaId)`), a `MediaUploadQueue.enqueue(item)`
building block that writes the bytes to `MediaBlobStore` then queues an `UPLOAD_MEDIA`
row on the `MEDIA` lane (blob + row share one `cmid`, returned as the dependency key),
and the `OutboxFlushWorker` wiring: a `MEDIA`-lane sender (reads the blob, uploads via
`MediaRepository`, `remove`s the bytes once no longer retryable), `MEDIA` drained
**before** `STORY`, and `onExhausted` dropping the blob so a dead upload never leaks
bytes. The whole durable offline upload→publish chain now functions end-to-end at the
SDK layer. Latest loop (`story-composer-offline-media`) wires the **last brick** — the
composer now **falls back to the durable chain** when a synchronous media upload fails
transiently: a single picked media whose upload returns offline / 429 / 5xx (the pure
`MediaUploadRetryPolicy.isQueueable` product policy) is instead `MediaUploadQueue.enqueue`d
and staged as a single `PendingMediaUpload` placeholder in the draft (its `cmid` rides in
`draft.mediaIds`, counts toward the ≤10 cap, renders an "Offline" preview tile). `publish()`
then enqueues the `PUBLISH_STORY` row with `dependsOn = pendingUpload.cmid` (via the new
`StoryRepository.enqueuePublish(request, dependsOn)` param), so the drainer holds the publish
until the upload delivers, then grafts the real id. A **permanent** failure (4xx), a
**multi-item** offline pick, or a pick **while one upload is already pending** still surfaces
the error (single-pending constraint keeps the single-`dependsOn` chain correct). Surpasses
iOS, which drops a pick on an offline upload. Latest loop (`media-upload-cancel`) closes the
**orphan-leak gap**: removing the offline placeholder now `MediaUploadQueue.cancel`s its durable
`UPLOAD_MEDIA` row + blob (row discarded first so the drainer stops picking it up, then the bytes;
unknown cmid inert), so no orphaned upload streams bytes to a media the story never references. The
UI clears optimistically; the durable cancel is best-effort & cancellation-safe. Latest loop
(`outbox-flush-retry-on-blocked`) closes the **cross-pass gating gap**: the `OutboxFlushWorker`
previously rescheduled (WorkManager `Result.retry()`) only when a lane stopped on a **transient**
failure, ignoring a lane that stopped on a **blocked dependency**. Because lanes drain in a fixed
order, a dependent (a media story/message) can be `BLOCKED` early in a pass while its prerequisite
`UPLOAD_MEDIA` row is delivered *later in the very same pass* — leaving a now-satisfiable dependent
sitting until an unrelated trigger fired. A new pure `OutboxFlushPlan.outcome(reports)` building
block decides the pass outcome — `RETRY` when **any** lane stopped on a transient failure **or** a
blocked dependency — and the worker delegates to it. Forward progress is guaranteed: each retry
either delivers the dependent or cascade-exhausts it once the prerequisite gives up (`EXHAUSTED`
flips the verdict to `FAILED`, never `BLOCKED`), so the loop always terminates. Latest loop
(`outbox-multi-dependency`) generalises the `dependsOn` gate from **one** prerequisite to a
**set**: a new pure `OutboxDependencyKey` (encode/decode/`likePattern`) round-trips the set through
the single `dependsOn` column (wrapped-delimited, `_`-escaped membership `LIKE`), `OutboxMutation.dependsOn`
is now a `Set<String>`, and `OutboxDependencies.verdictAll` gates a dependent on **all** prerequisites
(any `EXHAUSTED` ⇒ cascade-exhaust; else any still-queued ⇒ hold). `findDependents` became a membership
query so a delivered producer grafts its real id into a dependent waiting on several uploads, and
`StoryRepository.enqueuePublish` now takes a `List<String>`. This is the provably-correct SDK half of
"several media queued offline"; the composer adopts the list contract but keeps single-pending UI (the
multi-pending UX is the next slice). Surpasses iOS, which has no durable offline upload chain at all.
Latest loop (`story-composer-multi-pending`) closes that chain **end-to-end from the UI**: the composer's
`pendingUpload?` became `pendingUploads: List<PendingMediaUpload>`, so every transient-failed pick is
appended (and a single offline pick carrying **several** items now stages each one), `publish()` gates the
story on **all** pending cmids (`enqueuePublish(.., dependsOn = pendingUploads.map { cmid })`), per-tile
remove cancels only that durable row, and the preview renders N "Offline" tiles. `queueDurably` stages one
item at a time so partial progress survives a mid-batch enqueue failure. Surpasses iOS, which drops a pick
on an offline upload. Latest loop (`story-composer-slide-deck`) makes the **multi-slide model real in the
composer**: `StoryComposerUiState` carries a `deck: StorySlideDeck`, the VM mints slide ids and exposes
add/duplicate/remove/move/select intents (the editor binds to the selected slide's text, each slide keeps
its own caption via pure `updateSelectedText`), publish stays **lossless** — `publishRequests` emits one
story per non-blank slide in order (first carries whole-story media + offline `dependsOn`), `canPublish`
gates on the **whole deck** (an off-screen over-long slide blocks publish), and `StoryComposerScreen`
renders a `SlideStrip` mini-preview (numbered selectable chips, Duplicate/Remove on the selected chip,
"+" add chip capped at 10). The single-slide path stays byte-identical to before. Latest loop
(`slide-drag-reorder`) closes that loop's **deferred drag-reorder gesture**: a horizontal drag on a
slide chip now reorders it. A new pure `SlideReorderResolver.targetIndex(fromIndex, dragPx,
slotWidthPx, slideCount)` converts the accumulated drag pixels + the measured slot width (chip width
+ spacing) into how many whole slots the chip crossed — a sub-half-slot drift rounds to zero (no
accidental reorder), the result is clamped to the deck bounds, and a non-positive slot width / empty
deck / out-of-range origin all degrade safely. `SlideStrip` binds `detectHorizontalDragGestures` on
each chip and hands the resolved target to the already-tested `onMoveSlide`, so the move math lives
in one pure, unit-tested place and the Composable stays glue. Latest loop (`story-slide-media`) moves
media **onto the slide it was added to** (not the whole story): the deck is the single source of truth
(`addMediaToSelected`/`removeMedia`/`hasMedia`/`isWithinMediaLimit`/`selectedRemainingMediaSlots`, ≤10
**per slide**) and `draft` mirrors the selected slide for media just as it does for text, so the single-
slide path stays byte-identical. The preview shows only the selected slide's media, publish emits one
story **per publishable slide** (text **or** media — a media-only slide now publishes) carrying that
slide's media and `dependsOn` only that slide's offline uploads, and removing a slide reclaims its media
(prunes the preview pools + cancels its durable rows). Surpasses iOS, which drops an offline pick.

## Next slice (pick one for the next run)

**Just shipped (2026-07-13): `chat-gallery-page-caption`** — per-page caption overlay in the conversation
media gallery (port of iOS `ConversationMediaGalleryView.captionMap`); pure `:feature:chat` `GalleryPage`
carries each page's Prisme-resolved message text as its caption, rendered by the now caption-aware
(opaque-string) `:sdk-ui` `MeeshyImageViewer` as a bottom overlay. See run log 2026-07-13.
**Recommended next (highest value):**
- **Media gallery author/date header** (same §C line): iOS shows sender avatar + name + `sentAt` above the
  caption — extend `GalleryPage` with `senderName`/`createdAtIso` (both already on `BubbleContent`) and a
  per-page header overlay. Pure model add + exempt overlay; a natural continuation of this slice.
- **Media gallery follow-ups** (same §C line): neighbour prefetch ±2 (Coil `ImageLoader.enqueue`) and
  save-to-gallery (`MediaStore`) — each a thin add on top of the shipped `ConversationGallery`.
- **Message bubble contact attachment** (§C, still pending) — share-a-contact card; the wire has no
  dedicated fields yet, so scope the DTO first.
- **§B "Communities carousel + category filter chips"** (feature-parity.md line ~309, still `[ ]`).

---

**Earlier (2026-07-09): `chat-bubble-audio`** — audio (voice-message) bubble attachment (§C line ~533,
`carousel / audio / location / contact` list — **audio now done**; carousel + contact remain). Port of iOS
`AudioPlayerView` message-bubble context, surpassing it on the Prisme Linguistique. An `audio/…`-mime
attachment becomes a pure `BubbleAudio` (`:sdk-ui`) instead of being mis-bucketed as a generic file:
`url` (resolved via `mediaBaseUrl`, null until downloadable → download affordance), `durationSeconds`
(explicit `duration` → fallback `transcription.durationMs/1000`), `sizeBytes`, and a **Prisme-resolved
transcription** (`transcriptionText`/`transcriptionLanguage`/`isTranscriptionTranslated`). The pure
`BubbleContentBuilder.resolveTranscription` applies Prisme rule 1: for each preferred language in order,
the original transcription wins when already in that language, else a non-blank `translations[lang]
.transcription` (case-insensitive key match); with no preferred match it falls back to the **original**
transcription (never an arbitrary one), and null when no non-blank transcription exists — so the viewer
sees the transcription in their language by default (iOS defaults to `orig` + a manual selector).
`BubbleAudio.formattedDuration` renders `m:ss` (iOS `%d:%02d`; null on unknown/negative). Rendered by the
exempt `AudioBubble` composable (play/download glyph + duration-or-size + transcription line, accent-coherent
`onColor`); tapping a playable clip hands its URL to the host (`ChatScreen` → `LocalUriHandler`, mirrors the
location wiring). Strings `bubble_audio_play` in en/fr/es/pt. **+25 tests** (RED-verified — the audio
projection returned an empty `audios` list before the builder change): `BubbleAudioTest` 12
(duration 0/single-digit/over-a-minute/>59-min/unknown/negative; playable url/null/blank; transcription
present/blank/null), `BubbleContentBuilderTest` +13 (audio-not-file bucketing; duration fallback;
already-preferred→untranslated; translated-wins; case-insensitive key; no-match→original; blank-translation
skipped; no-transcription→null; blank-original→null; transcribedText-preferred; deleted-hides; emoji-only
disabled; no-file-url→null url). Reviewer: PASS. See run log. **Lesson:** a `` `audio/*` `` in a KDoc opens a
nested block comment (`/*`) that swallows the rest of the file → "Unclosed comment" reported only in
*referencing* files, not the broken one. Avoid `/*`/`*/` sequences inside KDoc backticks.
**Recommended next (highest value):**
- **Message bubble carousel / contact attachments** (feature-parity §C line ~533, now "carousel / contact
  pending"). **Carousel** extends the image grid into a swipeable pager (pure page-model + exempt pager).
  **Contact** (share a contact card) is smaller but the wire has no dedicated fields yet.
- **§B "Communities carousel + category filter chips"** (feature-parity.md line ~309, still `[ ]`).
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-09): `chat-bubble-location`** — location message-bubble attachment (§C line ~533,
`carousel / audio / location / contact` list — **location now done**). Port of iOS
`BubbleAttachmentView.location`: a mime `application/x-location` attachment becomes a pure `BubbleLocation`
(`:sdk-ui`, nullable lat/lon, `placeName ← originalName`, locale-safe `geoUri`) rendered as a tappable pin
card → `geo:` URI opened in the OS maps app via `LocalUriHandler` (`:feature:chat` `ChatScreen`), no longer
mis-bucketed as a generic file. +16 tests (RED-verified). See run log.
**Recommended next (highest value):**
- **Message bubble audio / carousel / contact attachments** (feature-parity §C line ~533, still `[~]`,
  now "carousel / audio / contact pending"). **Audio** is the highest-value port (voice messages are core to
  Meeshy; the pipeline already lands transcription + translated audio on the wire — `ApiMessageAttachment`
  carries `duration`/`transcription`/`translations`): a pure `BubbleAudio` projection (duration formatting,
  transcription-preferred-language resolution via `LanguageResolver`) + an exempt player composable. **Contact**
  (share a contact card) is smaller but the wire has no dedicated fields yet. **Carousel** extends the existing
  image grid to a swipeable pager.
- **§B "Communities carousel + category filter chips"** (feature-parity.md line ~309, still `[ ]`) — a
  horizontal community rail + category chips over the conversation list (a larger §B slice: pure section/
  filter model + a rail composable).
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-09): `chat-story-reply-preview`** — the last pending half of §C "Quoted-reply
previews incl. story-reply previews (counts, thumbnails)", **§C quoted-reply previews now complete**. New
`ApiPostReplyTarget` DTO (`:core:model`) decoded from `postReplyTo`/legacy `storyReplyTo` + bare
`storyReplyToId` on `ApiMessage`. `BubbleContentBuilder` projects a pure `BubbleStoryReply` (`:sdk-ui`) —
mood (emoji + text) vs story (reaction/comment/share counts + resolved thumbnail) vs bare metadata-less
story; message-reply precedence + deleted-suppress. `MessageBubble`'s new `StoryReplyPreview` renders it.
+11 tests (RED-verified). See run log.
**Recommended next (highest value):**
- **§B "Communities carousel + category filter chips"** (feature-parity.md line ~309, still `[ ]`) — a
  horizontal community rail + category chips over the conversation list (a larger §B slice: pure section/
  filter model + a rail composable).
- **Message bubble carousel / audio / location / contact attachments** (feature-parity §C line ~533, `[~]`,
  "carousel / audio / location / contact pending") — pick one attachment kind (e.g. a location preview
  projection + map-thumbnail render) as a thin vertical slice.
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-09): `conversations-purge-on-removed`** — real-time conversation removal + star
hygiene (§B). The orphan `MessageSocketManager.conversationDeleted` / `participantLeft` streams (declared +
listened, **zero consumers**) are now wired through the pure `:feature:conversations` `ConversationPurge` SSOT
(`onConversationDeleted` → id / blank-inert; `onParticipantLeft(event, currentUserId)` → id **only when the
current user is the leaver**). `ConversationListViewModel.purge()` clears the conversation's dangling stars
via the shared `@Singleton StarredMessagesStore.removeConversation` (synchronous, local-only) then silently
`repository.refresh()`es to drop the vanished row. Closes the tracked `removeConversation` follow-up from
`chat-star-toggle`. +12 tests. See run log.
**Recommended next (highest value):**
- **Story-reply previews (counts, thumbnails)** — the remaining half of §C line 530: iOS decodes
  `APIPostReplyTarget` (`postReplyTo`/legacy `storyReplyTo`) with `thumbnailUrl`/`previewText`/`reactionCount`/
  `commentCount`/`moodEmoji`. Add the DTO + a `storyReplyToId`/quoted-post preview render (a distinct block
  from the message quoted-reply). Larger — likely its own pure projection + a dedicated preview composable.
- **§B "Communities carousel + category filter chips"** (feature-parity.md line ~309, still `[ ]`) — a larger
  §B slice (a horizontal community rail + category chips over the conversation list).
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-09): `chat-starred-messages-list`** — the dedicated starred-messages **list screen**,
the last pending half of Chat §C "Pin/unpin message; **starred/bookmarked messages list** with
navigate-to-conversation" — **§C is now complete**. Reachable from Settings (new "Chats" section → "Starred
messages" row → `Routes.STARRED`). The pure `:feature:chat` `StarredMessagesUiState.of(StarredMessages)` SSOT
projects every star **newest-first** (ordering delegated to `StarredMessages.sortedByStarredAtDesc` — the same
pure SSOT the bubble indicator reads, so list and bubble can never disagree) into a `StarredMessageRow` carrying
the shared `PinnedSnippet` preview (reuses `messageSnippetOf`: a media-only star reads Photo/Attachment exactly
like the pinned list / reply-thread overlay). `StarredMessagesViewModel` (@HiltViewModel, injects
`StarredMessagesStore`) is **cache-first** — the initial value is projected synchronously from the store's
hydrated snapshot (instant paint, no spinner) and `stateIn(Eagerly)` re-derives on every star change anywhere —
and exposes `unstar` (delegates straight to the durable store; no network, no outbox). `StarredMessagesScreen`
renders the list (each row taps into `Routes.chat(conversationId)` — the snapshot already carries id/name/accent
so no re-fetch; trailing star removes the bookmark in place) or an iconified empty state; avatar tint is
accent-coherent (snapshot `conversationAccentColor` → name-hash `DynamicColorGenerator` fallback). EN/FR/ES/PT
strings (5 chat + 2 settings keys × 4 locales). +12 tests (`StarredMessagesViewModelTest`: `of` orders desc /
empty→isEmpty / Text-trim / Image-only / File-only / text-beats-attachment / blank→Empty; VM initial-hydrated /
reacts-to-new-star / unstar-removes-via-store / unstar-unknown-inert). `:app:assembleDebug` +
`:feature:chat:testDebugUnitTest` + `:feature:settings:testDebugUnitTest` green (system Gradle 8.14.3 at
`/opt/gradle`; wrapper download 403-blocked in this container). Reviewer: PASS (diff apps/android only;
behaviour-through-public-API `StarredMessagesUiState.of` + VM handlers, no tautologies, boundary coverage on
empty/blank-preview/media-only/unknown-unstar; SDK-purity — ordering+projection is a pure `:feature:chat` atom
reusing `:core:model` `StarredMessages` + `messageSnippetOf`, the screen is exempt Compose glue; SSOT — ordering
shared with the bubble indicator, snippet shared with pinned/reply-thread; instant-app cache-first hydration;
UDF immutable state; accent-coherent; natural back/tap-into-conversation gesture; no dead end — the list reads
and jumps into each conversation).
**Recommended next (highest value):**
- **Quoted-reply previews incl. story-reply previews (counts, thumbnails)** — `feature-parity.md` line 494,
  still `[ ]` — enrich the in-bubble quoted-reply preview with a thumbnail / media badge.
- **`removeConversation` dangling-star cleanup** — hook `StarredMessagesStore.removeConversation` on
  conversation leave/clear so a star can't outlive its conversation (the store method exists and is tested).
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-09): `chat-star-toggle`** — local-only star/unstar of a message (iOS parity: the
gateway has no message-star endpoint, iOS' `StarredMessagesStore` is UserDefaults-only). Pure `:core:model`
`StarredMessages` SSOT (snapshot set: star/unstar/toggle/isStarred/removeConversation + sortedByStarredAtDesc,
same-instance-when-unchanged) + durable `:sdk-core` `StarredMessagesStore` (SharedPrefs JSON, synchronous
hydrated `StateFlow`) + `ChatViewModel.toggleStar` (snapshots the bubble, no network — mirrors `deleteForMe`) +
`BubbleContent.isStarred` glyph + a Star/Unstar sheet row. +31 tests. See run log.
**Recommended next (highest value, Chat §C):**
- **starred-messages list screen** — the remaining pending half of §C: a dedicated screen (reachable from
  settings, mirror `SettingsScreen`'s `onOpenProfile` wiring + a new `Routes.STARRED`) listing every starred
  message newest-first (`StarredMessagesStore.starred.sortedByStarredAtDesc` — already the SSOT), each row
  navigating to `Routes.chat(conversationId)`. The `StarredMessage` snapshot already carries conversation
  name/accent, sender, preview, and attachment kind so no re-fetch is needed. Add a `removeConversation` hook
  on conversation-leave/clear so stars don't dangle (the store method exists and is tested).
- **Quoted-reply previews incl. story-reply previews (counts, thumbnails)** — `feature-parity.md` line 494,
  still `[ ]` — enrich the in-bubble quoted-reply preview with a thumbnail / media badge.
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-09): `chat-reply-thread-overlay`** — the focused reply-thread sheet, completing §C
"Reply-count pills + **reply thread overlay**". Long-pressing the reply-count pill opens a `ModalBottomSheet`
driven by pure `:feature:chat` `ReplyThreadOverlay.of(parentId, messages)` (parent + live replies,
membership identical to `ReplyThreads`; paged-out/no-reply → inert; deleted parent still shown; snippet via
the shared `messageSnippetOf`). `ChatUiState.replyThreadOverlay` derives live + auto-closes on drain. +25
tests. See run log.
**Recommended next (highest value, Chat §C):**
- **starred/bookmarked messages list** — the remaining unchecked half of §C "Pin/unpin message;
  starred/bookmarked messages list with navigate-to-conversation" (`feature-parity.md` line 433, still `[~]`,
  "**Pending:** starred/bookmarked messages list"). Needs a star/bookmark toggle + a list; a distinct feature
  from pins with its own outbox lane (mirror the pin-toggle slice).
- **Quoted-reply previews incl. story-reply previews (counts, thumbnails)** — `feature-parity.md` line 494,
  still `[ ]` — enrich the in-bubble quoted-reply preview with a thumbnail / media badge.
- Or move into **Profile/Settings §K/§L** follow-ups (the current build-order tail).

**Earlier (2026-07-08): `chat-forward-message`** — the last missing verb of §C "send, edit, delete,
reply, **forward**". Pure `:feature:chat` `ForwardTargets.of` SSOT (port of iOS `filteredConversations`) +
nullable `forwardedFromId`/`forwardedFromConversationId` on `SendMessageRequest`/`ApiMessage` (`:core:model`)
+ `MessageRepository.sendOptimistic` forward params (retry-safe) + `ChatViewModel.openForward`/`forwardTo`
optimistic send into a picked conversation + a cache-first `ForwardPickerSheet`. +21 tests. See run log.
**Recommended next (highest value, Chat §C):**
- **forwarded-message indicator** — the read side of forward: show a "Transféré" / "Forwarded" badge on a
  bubble whose `forwardedFromId` is set (feature-parity §C "Edited / pinned / **forwarded** indicators"). The
  wire field is now on `ApiMessage`, so this is a thin `BubbleContent` flag + an exempt badge composable.
- **reply thread overlay** — a focused reply-thread sheet listing a parent's replies (the `ReplyThreads`
  grouping is already the SSOT; mirror the pinned-messages-sheet wiring).
- **starred/bookmarked messages list** — a distinct §C feature from pins (needs a star/bookmark toggle).

**Earlier (2026-07-08): `chat-pinned-messages-sheet`** — the pinned-messages **list sheet**, the last
half of Chat §C "Pin/unpin message". Pure `:feature:chat` `PinnedMessagesList.of(messages) →
List<PinnedMessageRow>` SSOT lists every pin newest-first, sharing the banner's exact pin predicate /
snippet / sender projection — `PinnedMessages.of` now derives the banner from `list.first()` + `list.size`
(one filter/sort, banner and sheet can never diverge). `ChatUiState.pinnedMessages`/`isPinnedSheetOpen` +
VM `openPinnedSheet` (inert when empty) / `closePinnedSheet` / `onPinnedMessageTap` (scroll-to + close;
unknown id inert). Banner gains a trailing "see all" affordance (count > 1) opening a `ModalBottomSheet`
list; each row jumps to its pin. +20 tests. See run log.
**Recommended next (highest value, Chat §C):**
- **`chat-forward-message`** — the remaining half of §C send/edit/delete/reply/forward: pure forward-target
  validation + optimistic send into a chosen conversation.
- **reply thread overlay** — a focused reply-thread sheet listing a parent's replies (the `ReplyThreads`
  grouping is already the SSOT; mirror this slice's sheet wiring).
- **starred/bookmarked messages list** — a distinct §C feature from pins (needs a star/bookmark toggle).

**Earlier (2026-07-08): `chat-pin-toggle`** — the pin/unpin **action**, completing message pinning
end-to-end on Android. Pure `:core:model` `MessagePinToggle.resolve → PinAction` (Pin | Unpin | Unavailable;
pinned = non-blank `pinnedAt`, not owner/window-gated, deleted → Unavailable) drives a long-press
"Épingler"/"Retirer" sheet action → `ChatViewModel.togglePin` → `MessageRepository.setPinnedOptimistic`
(instant `pinnedAt` flip, refuses unsent) + durable `PIN_MESSAGE`/`UNPIN_MESSAGE` outbox row on the shared
`pin` lane (block/unblock's `terminalToggle` coalescer generalized: annihilate opposite / supersede same) +
`MessageApi.pin`/`unpin` worker sender + `onExhausted` conversation refresh. +31 tests. See run log.
**Recommended next (highest value, Chat §C):**
- **pinned-messages list sheet** — a `GET /pinned-messages`-backed sheet listing every pin (the banner
  shows one at a time); tapping a row jumps to it. Only remaining half of §C "Pin/unpin message".
- **`chat-forward-message`** / §C forward (the remaining half of send/edit/delete/reply/forward) — pure
  forward-target validation + optimistic send into the chosen conversation.
- **reply thread overlay** — the remaining half of §C "Reply-count pills + reply thread overlay": a
  focused reply-thread sheet listing a parent's replies (the `ReplyThreads` grouping is already the SSOT).

**✅ MERGED (2026-07-08): `chat-reaction-who-reacted-sheet` — PR [#1663](https://github.com/isopen-io/meeshy/pull/1663) merged to `main`** (verified: `merged: true`, merged_at 2026-07-08T10:54:40Z).

**Just shipped (2026-07-08): `chat-reply-count-pills`** — an accent-tinted reply-count pill under any
message that has quoted replies, driven by the pure `:feature:chat` `ReplyThreads.of(messages)` SSOT
(group by trimmed/non-self/non-deleted `replyToId` → `ReplyThread(parentId, count, firstReplyId=earliest
live reply)`; a parent whose every reply is deleted/absent has no thread). Tapping the pill
(`ChatViewModel.onReplyCountTap`) scrolls to the earliest reply (reuses `scrollToMessageId`; a no-reply
message is inert). +16 tests. See run log. **Recommended next (highest value, Chat §C):**
- **`chat-message-pin`** / §C "Pin/unpin message; starred/bookmarked messages list" — pure pin-rule +
  optimistic toggle + a pinned-messages strip (larger, rich pure core).
- **`chat-forward-message`** / §C forward (the remaining half of send/edit/delete/reply/forward) — pure
  forward-target validation + optimistic send into the chosen conversation.
- **reply thread overlay** — the remaining half of §C "Reply-count pills + reply thread overlay": a
  focused reply-thread sheet listing a parent's replies (the `ReplyThreads` grouping is already the SSOT).
- **`chat-forward-message`** / §C forward (the remaining half of send/edit/delete/reply/forward).

**Earlier — `conversations-section-model`** — the conversation-list pinned/others
section split, previously scattered `filter { isPinned }` / `filterNot` glue inside
`ConversationListScreen`, is now the pure `:feature:conversations` `ConversationSections.of()` SSOT
(`ConversationSection(kind: PINNED|ALL, items)` — Pinned first, then All, each preserving the incoming
draft/filter order). An **empty section is omitted**, fixing a real wart: an all-pinned account no longer
renders a phantom empty "Mes conversations" header. The screen renders `ConversationSections.of(state.
conversations)` via the existing `CollapsibleSection` (its collapse state stays its own saved UI state);
kind→title/icon/color are three tiny exempt mapping helpers. +9 tests. See run log. **Recommended next:**
`conversations-communities-carousel` / §B "Communities carousel + category filter chips" (larger), the
**collapsible user categories** follow-on to this slice (needs category-name metadata), or move into
Profile/Settings §K/§L follow-ups.

**Earlier — `conversations-draft-discard` (2026-07-08)** — a contextual "Discard draft" action
(long-press menu, offered only on a draft-bearing row) backed by a pure `DraftDiscard.isDiscardable`/
`afterDiscard` SSOT + optimistic `ConversationListViewModel.discardDraft` (instant state removal,
`draftStore.clear`, rollback on failure). The row loses its "Brouillon : …" preview and sinks out of the
floated group immediately; the reactive `observeAll` collector reconciles the durable store. +12 tests.
See run log. **Recommended next:** `conversations-communities-carousel` / §B "Communities carousel +
category filter chips" (larger), or move into Profile/Settings §K/§L follow-ups.

**Earlier — `conversations-cold-start-error-card`** — the conversation-list empty arms
(Error / FilteredEmpty / ColdEmpty) rendered as a bare `CenteredMessage` (secondary label + plain retry
button); iOS shows an iconified card (glyph + title + subtitle + Réessayer). New pure
`:feature:conversations` `EmptyStateVisual.of(content): EmptyStateVisual?` SSOT maps each non-list
`ConversationListContent` arm → `{glyph: EmptyStateGlyph, title: EmptyStateCopy, subtitle:
EmptyStateSubtitle?, cta: EmptyStateCopy?}`. Copy is enum-keyed (`EmptyStateCopy` → `R.string` resolved in
the screen) so the copy/icon decision stays pure and JVM-testable, free of Android resource ids; only the
dynamic server error text travels as a `Literal` — **trimmed**, and a **blank/empty** message falls back to
a generic `Resource(ErrorSubtitle)` while staying retryable. The two list-bearing arms (Populated / Skeleton)
have no card → `null`. Wired: `ConversationListScreen` collapses the three `CenteredMessage` arms into a
single `EmptyStateCard(EmptyStateVisual.of(content))` — a `MeeshyGlassSurface` card with the glyph in a
tinted disc (error → `MeeshyPalette.Error`, others → accent Indigo), title + subtitle, and an optional retry
`Button` wired to `viewModel::refresh`; `CenteredMessage` removed (no other caller). Icons: `CloudOff` /
`SearchOff` / auto-mirrored `Chat`. 4 new strings × 4 locales (en/fr/es/pt). +8 tests (`EmptyStateVisualTest`:
error-literal / trim / blank→fallback / empty→fallback / filtered / cold / populated-null / skeleton-null).
`:feature:conversations:testDebugUnitTest` + `:app:assembleDebug` green (system Gradle 8.14.3; wrapper
download is 403-blocked in this container — use `/opt/gradle` directly). Reviewer: PASS (diff apps/android
only; behaviour-through-public-API `EmptyStateVisual.of`, no tautologies, boundary coverage on the trim/
blank/empty error-subtitle branches + all five arms; SDK-purity honoured — the "what does an empty arm look
like" copy/icon product decision is a pure atom in `:feature:conversations`, the glass card is exempt Compose
glue; cache-first preserved (Populated still wins upstream), accent-coherent palette, no dead end — the card
retries).

**Recommended next candidates (highest value first):**
- **`conversations-draft-list-mutation`** — surface the draft *mutation* end-to-end (a draft typed in Chat then
  sent/cleared re-orders the list) + a "swipe-to-discard-draft" affordance (pure discard rule + optimistic clear).
- **`conversations-communities-carousel`** / §B "Communities carousel + category filter chips" — larger.

---

**Earlier — `conversations-empty-state-content`** — the conversation-list empty/loading/error/
filtered decision is now a pure, fully-covered `ConversationListContent.of(state)` sealed SSOT (checks parity §B
"Cold-start skeletons + error-with-retry empty state"). Cache-first: populated data wins over a stale skeleton flag
or a background error. The screen renders straight from the reducer; +11 tests. See run log.

**Recommended next candidates (highest value first):**
- **`conversations-cold-start-error-card`** — the retry empty state is a bare centred `Button`. iOS shows an
  iconified error card (glyph + title + subtitle + Réessayer). Pure `EmptyStateVisual.of(content)` mapping the
  `ConversationListContent` arms (Error/FilteredEmpty/ColdEmpty) → {icon, title, subtitle, cta?} so the copy/icon
  choice is testable, then a coherent `MeeshyGlassSurface` card. Natural follow-on to this slice.
- **`conversations-draft-list-mutation`** — surface the draft *mutation* end-to-end (a draft typed in Chat then
  sent/cleared re-orders the list) + a "swipe-to-discard-draft" affordance (pure discard rule + optimistic clear).
- **`conversations-communities-carousel`** / §B "Communities carousel + category filter chips" — larger.

**Earlier — `conversations-draft-aware-ordering` (2026-07-07)** — the conversation list now floats
draft-bearing rows to the top (parity §B "drafts float to top") and shows an accent "Brouillon : …" preview. Pure
`:feature:conversations` `DraftAwareOrdering.apply` (float by `ConversationDraft.isMeaningful`, sort by draft
`updatedAt` desc, stable, non-drafts keep order) + `draftPreview`; `ConversationDraft.isMeaningful` extracted as the
`:core:model` SSOT (now consumed by `DraftAutosave` too); `ConversationDraftStore.observeAll()` added to `:sdk-core`
(InMemory StateFlow + DataStore prefix-scan, corrupt-omitted); `ConversationListViewModel` collects the drafts and
applies the ordering in `withVisible` after the filter; the screen's Épingles-first split stays above (Épinglés >
brouillons > reste). +23 tests. See run log.

**Recommended next candidates (highest value first):**
- **`conversations-draft-list-mutation`** — surface the draft *mutation* end-to-end so a draft typed in Chat and a
  send/clear immediately re-orders the list. `observeAll()` already makes it reactive; verify the round-trip and add
  a "swipe-to-discard-draft" affordance on a draft-bearing row (pure discard rule + optimistic clear via the store).
- **`conversations-cold-start-skeleton`** — parity §B "Cold-start skeletons + error-with-retry empty state": the
  skeleton flag exists (`showSkeleton`), but the error state has no retry CTA. Pure `EmptyStateContent.of(state)`
  → {Skeleton | Error(retry) | Filtered-empty | Cold-empty} and an error card with a Réessayer button.
- **`chat-draft-language-effects`** — the remaining draft-autosave gap (§C "text + reply + language + effects + blur
  + ephemeral"): once those composer features exist on Android, persist them in `ConversationDraft`.

**Earlier — `chat-draft-reply-ref` (2026-07-07)** — the persisted draft now carries its reply reference so a
half-typed (or freshly-armed) reply survives leaving and reopening the conversation (iOS app-side `DraftStore`
reply-reference parity). `ConversationDraft` gained a nullable `replyToId`. Pure `:feature:chat` `DraftAutosave`
was extended: a draft is now *meaningful* when it holds text **or** an armed reply, so a reply armed on an empty
composer is persisted (rather than dropped) and cancelling that reply on an empty composer purges the draft; the
reference is normalised (trim/blank→null); `resolve` still writes nothing when text **and** reply are both
unchanged. `restore` now returns a `DraftRestore(text, replyToId)` snapshot (null = leave the composer untouched)
that re-arms a reply-only draft with empty text or a half-typed reply with both — still idle-guarded (never
clobbers an in-flight edit or already-typed text). `ChatViewModel` persists the reply on `startReply`/`cancelReply`
(alongside the existing `onDraftChange`/`send` writes) and re-arms `replyingToMessageId` on open; the durable
DataStore store round-trips the reference. +16 tests (`DraftAutosaveTest` +10 reply-branch: armed-empty / text+reply
/ trim+blank-drop / only-reply-changes / identical-none / cancel-clears-reply-only / drop-reply-keeps-text +
restore re-arm / both / trim+blank / neither→null; `ChatViewModelTest` +5: arm persists ref, type-under-reply
persists text+ref, stored reply re-arms on open, cancel-on-empty purges, send purges; `ConversationDraftStoreTest`
+1 durable reply round-trip). `assembleDebug` + full `testDebugUnitTest` green (system Gradle 8.14.3; the lone
`InterfaceLanguageStoreTest` DataStore-timeout flake passed on isolated re-run — unrelated to drafts). Reviewer:
PASS (diff apps/android only; behaviour-through-public-API, no tautologies, boundary coverage on the meaningful/
identical/normalise branches; SDK-purity honoured — the "when a reply counts as a draft" product decision is a pure
atom in `:feature:chat`, the model carrier is `:core:model`, the bytes are `:sdk-core`; UDF immutable snapshot on
restore, cache-first re-arm on open, no dead end — the re-armed reply is sendable/cancellable).

**Earlier — `chat-draft-autosave` (2026-07-07)** — per-conversation text draft auto-save/restore is now
live (Chat parity §C "Draft auto-save/restore"). The orphan `ConversationDraft` model is wired end-to-end: pure
`:feature:chat` `DraftAutosave` (blank purges / non-blank saves raw / unchanged writes nothing; restore seeds an
idle empty composer only, never clobbering an in-flight edit or already-typed text) + durable `:sdk-core`
`ConversationDraftStore` (DataStore, per-conversation key, corrupt→miss; port of iOS `ConversationDraftManager`).
`ChatViewModel` restores on open, auto-saves on `onDraftChange` (guarded off during edit, coalesced
last-write-wins), purges on send — composer already binds `state.draft` so no `ChatScreen` change. +32 tests. See
run log. **Pending draft follow-ups:** reply-ref persistence (iOS app-side `DraftStore`) and
language/effects/blur/ephemeral (those composer features are not built on Android yet).

**Recommended next candidates:**
- **`chat-draft-reply-ref`** — extend the draft to carry `replyToId` so a half-typed reply survives navigation
  (iOS `DraftStore` stores the reply reference alongside the text). Composer already carries
  `replyingToMessageId`; needs a `replyToId` field on the persisted draft + restore that re-arms the reply pill.
  Small, pure-core-rich follow-up to this slice.
- **`chat-draft-list-ordering`** — surface the draft in the Conversations list (parity §B "Draft-aware ordering:
  drafts float to top" + a "Draft: …" preview). Needs the draft store read from `:feature:conversations` and a
  pure ordering rule (draft-bearing conversations sort above by draft `updatedAt`).

**Earlier — `chat-edit-time-window` (2026-07-07)** — the 2-hour edit window is now enforced (Chat parity
§C — feature-parity "send, edit, delete … 2h window"; iOS `ConversationScreen` offers Edit only while
`Date().timeIntervalSince(createdAt) < 2h`). Android's `startEdit`/Edit action had **no** window: any own
SYNCED message stayed editable forever. New pure `:core:model` `MessageEditability.canEdit(isOwn,
createdAtMillis, nowMillis, windowMillis = EDIT_WINDOW_MILLIS(=2h)) → Boolean` SSOT (placed beside
`DeliveryStatusResolver`): editable iff own AND `nowMillis - createdAtMillis < window`; a future-dated
createdAt (client/server clock skew) is treated as just-created (still editable, iOS negative-elapsed parity);
an **unknown/unparseable createdAt cannot be windowed → stays editable** (refusing an edit merely because the
wire omitted a timestamp is a worse gap; iOS never has a null `createdAt`). Wired: `ChatViewModel` injects the
already-Hilt-provided `CacheClock` and gates `startEdit` on `canEdit(isOwn = senderId == currentUserId,
createdAtMillis = isoToEpochMillisOrNull(message.createdAt), now = clock.nowMillis())` — now also enforces
authorship (previously unchecked); `ChatScreen` computes the same predicate over `BubbleContent.createdAtIso`
+ `System.currentTimeMillis()` and hides the Edit sheet action once the window has passed (Delete stays
available, at iOS parity). +13 tests. See run log.
**Just shipped (2026-07-07): `chat-typing-header-avatars`** — the last piece of the typing item is now live:
overlapping avatar chips of who is composing sit beside the header subtitle (iOS shows avatars, not just the
name). New pure `:feature:chat` `TypingAvatarStack.of(participants, maxVisible = MAX_TYPING_AVATARS = 3) →
TypingAvatarStack(visible, overflow)` SSOT: the first `maxVisible` typers become `TypingAvatarChip`s in
roster order and anyone beyond the cap folds into a `+N` overflow count (empty → empty/0; at-cap → all/0;
over-cap → truncated/overflow; a zero or negative cap → nothing visible, everyone in overflow). `TypingParticipant`
now carries a roster-resolved `avatarUrl` (the `typing:start` socket payload has none), normalised blank→null and
trimmed at `TypingParticipants.started`. `ChatViewModel` builds an `avatarByUserId` map from the conversation
participants and threads the resolved avatar into `started`; `ChatScreen` renders overlapping accent-tinted
`MeeshyAvatar` chips (surface-ring separated) + a `+N` pill beside the subtitle. +20 tests (`TypingAvatarStackTest`
9 — empty/single/null-avatar/at-cap/over-cap/order/zero-cap/negative-cap/cap-of-one; `TypingParticipantsTest` +5 —
avatar carry-through/blank→null/trim/refresh/default-null; `ChatViewModelTest` +2 — roster avatar resolved on
typing:start, absent avatar → null). `assembleDebug` + full `testDebugUnitTest` (896 tasks) green (system Gradle
8.14.3). Reviewer: PASS (diff apps/android only; behaviour-through-public-API, no tautologies, boundary coverage on
the cap; SDK-purity honoured — the "how many chips / overflow count" product decision is a pure atom in
`:feature:chat`, the overlap/ring render is exempt Compose glue; accent-coherent visuals, degrades to initials, no
dead code — the stack + chip are consumed by `ChatScreen`).

**Just shipped (2026-07-07): `chat-delete-for-me-vs-everyone`** — the delete action split into iOS's two paths.
Android previously had ONE delete (unconditional server-delete, own only). Now: pure `:core:model`
`MessageDeletability.canDeleteForEveryone(isOwn, createdAtMillis, nowMillis, windowMillis=2h)` SSOT (port of iOS
`ConversationCommandHandler.canDeleteForEveryone`; **inclusive `<=`** window — boundary instant still deletable —
unlike the exclusive edit window; future/unknown createdAt permissive, non-own → false), and pure `:sdk-core`
`LocallyHiddenMessages` value object (`hide`/`isHidden`/`visible`; `hide` idempotent + blank-guarded, returns the
same instance on no-op so persistence skips redundant writes) backed by the durable
`SharedPrefsLocallyHiddenMessagesStore` (`putStringSet`, port of iOS `LocallyHiddenMessagesStore` UserDefaults set)
provided via `SdkModule`. Wired: `ChatViewModel.deleteForEveryone` keeps the server round-trip; `deleteForMe` hides
locally with zero network; the hidden set is `.combine`d into the message-stream so `filterNot { hidden.isHidden(id) }`
drops the bubble the instant it is hidden. `ChatScreen` gates "Delete for everyone" on own+window and offers
"Delete for me" on any delivered message. Shipping both halves together avoided the regression of window-gating the
server-delete while leaving old own-messages with no delete option. +23 tests. See run log.

**Recommended next candidates:**
- **`chat-read-status-sheet`** — tap the delivery checks → a "seen by / delivered to" breakdown sheet
  (iOS `onShowReadStatus` → detail sheet "Vues" tab). Needs a per-recipient read model on the wire; **deferred** —
  the Android wire carries only `deliveredCount`/`readCount`/`readByAllAt` (counts, no per-recipient breakdown),
  so a faithful sheet is not yet buildable app-side.
Then resume **Profile/Settings §K/§L** (only avatar/banner upload remains in §K).

**Earlier recommendation (2026-07-06, after `chat-mention-autocomplete`):** the remaining highest-value Chat
follow-ups now that rich-text + in-conversation search + mentions (local roster) are live —
1. ~~**`chat-search-highlight-wiring`**~~ ✅ shipped 2026-07-06 — see run log.
2. ~~**`chat-mention-display-names`**~~ ✅ folded into `chat-mention-autocomplete` (2026-07-06) — `ChatViewModel`
   builds the roster from the conversation participants via `MentionRoster` and threads `mentionDisplayNames`
   into every `MessageBubble`, so `@username` resolves in-bubble.
3. ~~**`chat-mention-autocomplete`**~~ ✅ shipped 2026-07-06 — see run log. Pure `:feature:chat` `ChatMention`
   SSOT (`extractQuery`/`filterCandidates`/`insertMention` + `MentionAutocompleteState` reducer) + `MentionRoster`
   candidate builder + `ChatViewModel` intents (`onMentionSelected`, recompute on draft change, reset on send) +
   a neutral accent-avatar suggestion strip. +40 tests.
4. **`chat-mention-backend-suggestions`** — the debounced `/mentions` API merge over the local roster (online
   enrichment: author + commenters + contacts, deduped by username against the local candidates). Needs a
   `MentionApi`/repository + a cancellation-safe debounce in `ChatViewModel`.
5. ~~**`chat-quoted-reply-preview`**~~ — the quoted-reply preview *surface* (sender + snippet + accent bar) was
   already rendered in `MessageBubble.ReplyPreview`; the genuinely-missing half was **tap-to-jump**, shipped
   2026-07-06 as `chat-reply-jump-to-original` (see run log). Still open under §C: the *media thumbnail* on the
   preview (needs an attachment/media field on `ApiMessageReplyPreview` — deferred until the wire shape carries it)
   and **swipe-to-reply** gesture.
6. Or **`chat-quoted-reply-thumbnail`** — extend `ApiMessageReplyPreview` with the quoted message's first-image
   thumbnail (parity §C "Quoted-reply previews … thumbnails") once the gateway payload is confirmed to carry it.
Then resume **Profile/Settings §K/§L** (only avatar/banner upload remains in §K; §L worker drain-list test).

---

**Pivoted to Profile/Account (`feature-parity.md §K`) 2026-07-05.** Contacts (§J) is now
cache-complete + mutation-complete + list-display-complete (only mood-emoji presence remains, which
needs a `moodEmoji` field the roster record doesn't carry yet — deferred until a mood/status model
lands). The routine advanced to the next-richest area with untapped pure cores. The **profile-header
enrichment** landed first (`profile-header-presentation`): pure `ProfileHeaderBuilder` →
`ProfileHeaderPresentation` (presence · completion-ring % · E2EE · member-since), then the **secondary
identity rows** landed (`profile-details-rows`, 2026-07-05): pure `ProfileDetailRows.build(header)`
projecting language (flag+name via `LanguageData`) · country (ISO→regional-indicator flag) · timezone
into a tested list, with case-insensitive dup-language collapse; consumed by the read-only `ProfileScreen`.
**Next highest-value §K slices (all pure-core-rich):**
1. ~~**`profile-details-rows`**~~ ✅ shipped 2026-07-05 — see run log. `timezone` added to the header
   presentation. +14 tests.
2. ~~**`profile-stats-model`**~~ ✅ shipped as `profile-stats-presentation` (2026-07-05) — the raw
   `UserStats`/`Achievement` models + `UserApi.getUserStats` + `UserRepository.getUserStats` already
   existed (online-only, untested), so the slice delivered the genuinely additive part: the pure
   `UserStatsBuilder → UserStatsPresentation` projection SSOT (six ranked/formatted counter tiles +
   defensively-reconciled achievement badges + boundary-safe `formatCompactCount`), wired into
   `ProfileViewModel` (fetch-once per resolved user, failure-inert) and rendered as a read-only
   dashboard section in `ProfileScreen`. +35 tests. See run log.
3. ~~**`profile-stats-timeline`**~~ ✅ shipped 2026-07-05 — see run log. `UserApi`/`UserRepository`
   `getUserStatsTimeline(days=30)` (me-only) + the pure `StatsTimelineBuilder → StatsTimelinePresentation?`
   (empty→null, all-zero flat, negative-floor, peak-normalized bars, order-preserved, `DD/MM` labels,
   total/average/active-days) wired into `ProfileViewModel` (own-profile-only, failure-inert) and rendered
   as an accent-coherent line+area sparkline in `ProfileScreen`. +17 tests.
4. ~~**`profile-stats-room-cache`**~~ ✅ shipped 2026-07-05 — the durable **Room stats/timeline cache**
   (cache-first cold paint, iOS `CacheCoordinator.stats`/`.timeline`). New `:core:database`
   `ProfileStatsCacheEntity`/`Dao` (DB v9→v10) + `:sdk-core` `ProfileStatsCacheRepository` (per-user stats
   key + me-only timeline key; cold-vs-synced-empty by row presence; undecodable payload → miss), and
   `ProfileViewModel` rewired cache-first (paint cached → revalidate → write-through). +20 tests. See run log.
   This closes the last §K cache gap.
5. ~~**`edit-profile-optimistic`**~~ ✅ shipped 2026-07-05 — the `UPDATE_PROFILE` outbox kind (already
   declared, lane `PROFILE`, drained but senderless) wired end-to-end. Pure cores: `ProfileEditApply`
   (`:core:model` edit-merge SSOT, `PATCH` omit-null parity), `ProfileEditRequestBuilder` (`:feature:profile`
   trim/blank→null), and the `OutboxCoalescer` `UPDATE_PROFILE` latest-snapshot rule. Wiring:
   `SessionRepository.applyProfileEdit` (optimistic republish), `UserRepository.enqueueProfileEdit`
   (optimistic flip + durable enqueue, mirrors `setBlockedDurably`), `OutboxFlushWorker` `UPDATE_PROFILE`
   sender (`updateProfile` → `adopt`) + `onExhausted` `refresh()` rollback. `ProfileViewModel` gains the three
   content-language buffers + optimistic/offline save (editor closes instantly, worker woken on a real `cmid`,
   enqueue-failure reopens the editor) + a mid-edit buffer-clobber guard; `ProfileScreen` renders three
   `LanguageData` dropdowns. +31 tests. See run log. **First/last-name fields shipped** as
   `edit-profile-name-fields` (2026-07-06, +6 tests — see run log); only avatar/banner upload now remains.
6. Or **pivot back to Calls §H platform-glue** (`ConnectionService`/Telecom + WebRTC transport) — the
   remaining non-pure work, or advance **Settings §L** (theme persistence is a clean pure-core start).

**Recommended next:** Settings §L theme ✅, interface-language ✅, **notification master toggles ✅** and
**DND schedule editor ✅** shipped (`settings-theme-mode`, `settings-interface-language`,
`settings-notification-prefs`, `settings-dnd-schedule`, 2026-07-05 — see run log). The next clean pure-core §L
slices, in value order:
1. ~~**DND schedule editor**~~ ✅ shipped 2026-07-05 as `settings-dnd-schedule` — pure `:core:model` `DndWindow`
   SSOT (`isActive` enable-gate/midnight-wrap/per-day-gating/corrupt-time-safe, `parseMinuteOfDay`/
   `formatTimeOfDay`/`toggleDay`, `DndDay`↔`DayOfWeek`) + `SettingsViewModel` enable/start/end/toggle-day intents
   + `SettingsScreen` master toggle + 24h TimePicker rows + Mon→Sun chips + a live "quiet hours active now"
   status. +32 tests. See run log. Reused the notification store — no new store.
2. ~~**Per-event notification type toggles**~~ ✅ shipped 2026-07-06 as `settings-notification-type-toggles` —
   pure `:core:model` `NotificationTypeCatalog` SSOT: 17 per-event types (reply/mention/reaction/conversation,
   missed-call/voicemail, post-like/comment/repost/story-reaction/comment-reply/comment-like,
   contact-request/group-invite/member-joined/member-left, system) each with a `get`/`set` lens over the
   matching `UserNotificationPreferences` boolean; `toggle`/`isEnabled` (edit exactly one, never clobber),
   `sections(prefs, query, label)` grouping into 5 ordered `NotificationCategory` sections with a locale-aware
   injected-label case-insensitive/trimmed search that omits empty categories. `SettingsViewModel`
   `setNotificationTypeEnabled`/`setNotificationTypeQuery`; `SettingsScreen` search field + accent category
   headers + push-gated per-type switches. +14 tests. See run log. Reused the notification store — no new store.
3. ~~**Backend sync of notification prefs**~~ ✅ shipped 2026-07-06 as `settings-notification-prefs-sync` —
   the dead `OutboxKind.UPDATE_SETTINGS`/`OutboxLanes.SETTINGS` wired end-to-end: pure
   `NotificationPreferenceSyncBody` (gateway `PATCH /me/preferences/notification` contract SSOT, drops `extras`),
   `PreferencesApi`, session-gated `NotificationPreferencesSyncRepository`, an `UPDATE_SETTINGS` coalescer
   latest-snapshot rule + `OutboxFlushWorker` sender, and `SettingsViewModel` local-first-then-sync wiring.
   +15 tests. See run log. Closes the "online-only vs device-local" gap. **Next up (highest value):** #4 regional
   (content) language preference — the last no-op Settings row.
4. ~~**Regional (content) language preference**~~ ✅ shipped 2026-07-06 as
   `settings-regional-content-language` — the last no-op Settings language row is now live. Pure
   `:feature:settings` `RegionalLanguageSelection.build(regionalCode, systemCode, query)` SSOT (options =
   full `LanguageData.allLanguages`; primary/system language hidden — you can't pick your primary as your
   secondary — unless it *is* the stored choice; trimmed case-insensitive selection-marking + label lookup;
   trimmed case-insensitive search over name/nativeName/code; empty/whitespace query → all; blank/absent/
   unknown code → no label + no crash). Wired through the existing `edit-profile-optimistic` machinery — NO
   new store: `SettingsViewModel.setRegionalLanguage(code)` → `UserRepository.enqueueProfileEdit(
   UpdateProfileRequest(regionalLanguage=…))` (optimistic session repaint, durable `UPDATE_PROFILE`, worker
   woken only on a real `cmid`; sessionless/superseded enqueue inert) + a UI-only `setRegionalLanguageQuery`;
   `SettingsScreen` renders a searchable flag+native-name dialog (mirrors the notification-type search) with
   the current native name as the row detail (EN/FR/ES/PT). +24 tests (18 pure-core, 6 VM). See run log.
   Surpasses iOS, whose regional-language write is online-only. **Next up:** #5 the worker drain-list test.
5. Or the tracked **worker drain-list Robolectric test** (asserts every `OutboxLanes.*` with a registered
   sender is drained — would have caught the historic BLOCK/FRIEND omission, now also covers `PROFILE`).

---
_Historical Contacts/Calls backlog below._

**Pivoted to Contacts (`feature-parity.md §J`) 2026-07-04.** The Calls area's remaining work is
WebRTC/Telecom/FCM platform glue with no more pure testable cores, so the routine advanced to the
next-richest area already in progress. The **friendship/relationship SSOT** landed
(`friendship-relationship-resolver`): pure `UserRelationshipRules` + `FriendshipStatus`/
`UserRelationshipState` in `:core:model`, the `@Singleton FriendshipCache` store + `UserRelationshipResolver`
in `:sdk-core`, wired into `ContactsViewModel`. The **Contacts list** now landed too
(`contacts-list-friends`, 2026-07-04): the Contacts tab renders the online-first friend list with
filter chips + search + presence dots, reconciling against the `FriendshipCache`. **Next highest-value
Contacts slices:**
1. ~~**Contacts list data slice**~~ ✅ shipped as `contacts-list-friends` (2026-07-04) — pure
   `:core:model` `ContactList` (assemble from accepted requests, online-first sort, filter+search,
   cache reconcile), `ContactsListViewModel` over `FriendRepository` + `FriendshipCache`, and the
   `ContactsListTab` Compose UI. **Follow-up:** ~~a persistent Room `friends` cache for cold-start
   paint (iOS `CacheCoordinator.friends`)~~ ✅ shipped as `contacts-friends-room-cache` (2026-07-04) —
   `:core:database` `FriendEntity`/`FriendDao` (DB v7→8, `sortIndex` preserves `ContactList`'s order),
   `:sdk-core` `FriendListRepository` (`cachedSnapshot`/`persist`, cold vs synced-empty via
   `sync_meta`), `ContactsListViewModel` rewired cache-first (instant cold paint + write-through +
   prune-through on unfriend). +14 tests. See run log. **Still open:** per-filter counts + mood-emoji
   presence.
2. ~~**Send friend request offline-queue + `cmid` idempotency**~~ ✅ shipped as
   `friend-request-outbox-idempotency` (2026-07-04) — new `OutboxKind.SEND_FRIEND_REQUEST` on the
   new `OutboxLanes.FRIEND` lane, a `FriendRequestPayload` (optional greeting; receiver is the
   `targetId`), an `OutboxCoalescer` dedup (repeated send to the same receiver superseded — latest
   wins), the pure `FriendRequestSend.classify` delivery-outcome classifier (409/blank-id →
   idempotent AlreadyExists, other 4xx → permanent Rejected + rollback, 5xx/offline → Retry),
   `FriendRepository.enqueueSendFriendRequest` (durable enqueue), an `OutboxFlushWorker` sender that
   grafts the real request id over the placeholder on delivery + `onExhausted` `FriendshipCache`
   rollback, and `DiscoverViewModel.connect` rewired to the durable optimistic path (instant Pending
   flip even offline, keyed by the outbox cmid). **Also fixed a latent bug:** `OutboxLanes.BLOCK`
   (and now `FRIEND`) were absent from the worker's shared-lane drain list, so block/unblock rows
   never delivered — both lanes now drained. +26 tests. See run log. **Follow-up:** the send
   **compose-new** UI (a dedicated user-search → connect entry point beyond the Discover tab).
3. ~~**BlockRepository + `BlockStatusProvider` binding**~~ ✅ shipped as `contacts-blocked-list`
   (2026-07-04) — pure `:core:model` `BlockedUser` + `resolvedName`; `:core:network` `BlockApi`;
   `:sdk-core` `@Singleton BlockCache` (blocklist SSOT) + `BlockRepository`; `:feature:contacts`
   `BlockedListViewModel` + `BlockedTab` (confirm-to-unblock + optimistic rollback). The block seam
   is now bound — `DiscoverViewModel`'s `BlockStatusProvider` reads the live `BlockCache`. +29 tests.
   See run log. **Next Contacts pure cores:**
   - ~~**Durable offline unblock/block**~~ ✅ shipped as `block-outbox-durable` (2026-07-04) — new
     `OutboxKind.BLOCK_USER`/`UNBLOCK_USER` on a `OutboxLanes.BLOCK` lane, an `OutboxCoalescer.blockToggle`
     rule (block+unblock annihilate; repeat superseded), two `OutboxFlushWorker` senders + `onExhausted`
     `BlockCache` rollback, `BlockRepository.setBlockedDurably` (optimistic flip + enqueue), and
     `BlockedListViewModel.unblock` rewired to the durable path. +12 tests. See run log. **Follow-up:**
     wire the ready `setBlockedDurably(.., true)` half into a future profile/report block surface.
   - **Send friend request offline-queue + `cmid` idempotency** (#2 above).
4. ~~**Discover suggestions + live user search**~~ ✅ fully shipped — live search + inline connect
   (`discover-user-search`) **and** the empty-query cache-first suggestions
   (`discover-suggestions-cache-first`, 2026-07-04: pure `DiscoverSuggestions.snapshot` +
   `@Singleton SuggestionsRepository` in-memory SWR + `DiscoverViewModel.loadSuggestions()` on appear).
   +23 tests. See run log. **Follow-up:** ~~a persistent Room suggestions cache for cross-launch
   cold-start paint (iOS `CacheCoordinator.userSearch`)~~ ✅ shipped as `discover-suggestions-room-cache`
   (2026-07-04) — `:core:database` `SuggestionEntity`/`SuggestionDao` (DB v8→9), a Room-backed
   `RoomSuggestionsSource` (`SwrCacheSource`) replacing the in-memory one; the Discover tab now paints
   suggestions cold, before any network call. 11 tests. See run log.

**Three-state presence dot shipped** (`presence-away-indicator`, 2026-07-04): the previously-dead
`:core:model` `PresenceState`/`UserPresence` are now live — pure `UserPresence.state(now)` (offline → no
dot, online → green, online-but-idle > 5min → amber away, iOS `UserPresence.state` parity) reached via a
new `FriendRequestUser.presenceState(now)` adapter and a new nullable `isoToEpochMillisOrNull` helper
(so an absent timestamp stays online but an ancient one goes away); the friend row renders green/amber/none.
+23 tests. See run log. The **last Contacts-list display gap is mood-emoji presence**.

**Recommended next (highest value):** the **send compose-new UI** — a dedicated user-search → connect
surface (a "+ add friend" entry point beyond the Discover tab), now that the durable send half is done
(`friend-request-outbox-idempotency`) and every Contacts **cache** is durable (friends + suggestions
cold-paint), every Contacts **durable-mutation** gap is closed (block/unblock + friend-request send), and
the Contacts list is now filter/search/presence(**3-state**)/**counts** complete
(`presence-away-indicator` + `contacts-filter-counts`, 2026-07-04).
It is more Compose-glue-heavy with less new pure core, so a smaller alternative TDD slice is the tracked
**worker drain-list test** (a Robolectric test asserting every `OutboxLanes.*` with a registered sender
is drained — would have caught the BLOCK/FRIEND lane-omission bug; see NOTES 2026-07-04). With Contacts
(`§J`) now cache-complete + mutation-complete + list-display-complete (only mood-emoji presence remains),
the routine may also **pivot to the next parity area** — revisit the Calls platform-glue slices (`§H`:
`ConnectionService`/Telecom + WebRTC media transport) or advance Settings/Profile (`§K`).

---
_Historical Calls backlog below (revisit only for the platform-glue slices)._

**Now in the Calls area** (`feature-parity.md §H`). The pure FSM (`core:model`
`me.meeshy.sdk.model.call`) landed 2026-06-30; the `:feature:calls` consumer landed 2026-07-01
(slice `calls-viewmodel-screen`). Ordered by value:
1. ~~**`:feature:calls` `CallViewModel` + minimal call screen**~~ ✅ shipped as `calls-viewmodel-screen`
   (2026-07-01) — new `:feature:calls` module with a UDF `CallViewModel` (`StateFlow<CallUiState>`)
   folding accept/decline/hang-up/mute/camera intents + signalling events through `CallStateMachine.reduce`,
   a pure `CallPresenter` (`CallState × CallConfig × CallMedia → CallUiState`) owning every affordance
   decision, and a minimal accent-coherent Compose screen (ringing/connecting/connected/ended) reachable
   from audio/video call buttons in the chat header; dismissal returns to chat. +34 tests. See run log.
2. ~~**Call signalling event models + socket mapping**~~ ✅ shipped as `call-signalling-events`
   (2026-07-01) — `@Serializable` inbound payload types (`CallInitiatedPayload`/`CallSignalEnvelope`/
   `CallParticipantPayload`/`CallEndedPayload`/`CallMissedPayload`/`CallMediaTogglePayload`/
   `CallErrorPayload`/`CallAlreadyAnsweredPayload`) + a total pure `CallSignalMapper.map(eventName, rawJson)`
   → `CallEvent?` routing every `call:*` frame into the FSM vocabulary (offer/ice/media-toggle/malformed
   inert → `null`). +22 tests. See run log. **Next:** wire the mapper into a socket subscription that
   folds mapped events into `CallViewModel`, and mirror the **outbound** emit table
   (`call:initiate`/`:join`/`:signal`/`:toggle-audio`/`:toggle-video`/`:end`).
3. ~~**`CallDirection` (incoming/outgoing/missed, raw-degrades to incoming) + `CallMediaType`
   (audioOnly/audioVideo) + call-history row model**~~ ✅ shipped as `call-history-model` (2026-07-01) —
   the pure call enums from iOS `CallModels.swift`/`WebRTCTypes.swift` + `@Serializable` `CallHistoryPeer`
   and `CallRecord` mirroring the gateway `CallHistoryItem` REST contract (`GET /api/v1/calls/history`)
   field-for-field, with pure display accessors (`directionKind`/`isMissed`, `mediaType`, four-tier
   `displayName`, `avatarUrl`, `durationLabel`, `dataLabel`) as the SSOT a missed/recent-calls list
   renders. +22 tests. See run log. The **repository** ✅ shipped as `call-history-repository`
   (2026-07-01) — `:core:network` `CallHistoryApi`, `:core:database` `CallHistoryEntity`/`CallHistoryDao`
   (DB v6→v7), and `:sdk-core` `CallHistoryRepository` (cache-first SWR `historyStream()` via
   `CallHistoryCacheSource` + cursor-paginated `fetchPage → CallHistoryPage`). +17 tests. See run log.
   The **list UI** ✅ shipped as `call-history-list` (2026-07-01) — a UDF `CallHistoryViewModel` over
   `historyStream()` (SWR flags, client-side missed-only filter, cursor-paged infinite scroll via
   `fetchPage`, pull-to-refresh) backed by pure `CallHistoryList` (combine+filter) and `CallTimeLabel`,
   rendered by an accent-coherent `CallHistoryScreen`. +30 tests. See run log.
   **Next:** fold `CallSignalManager.events` into `CallViewModel` once the `initiate`-ACK call-id
   lifecycle lands; wire `CallHistoryScreen` into a Calls tab (`:app`).
4. ~~**Socket subscription → VM wiring**~~ ✅ the **subscription half** shipped as `call-signal-manager`
   (2026-07-01) — `:sdk-core` `CallSignalManager` (parity with `MessageSocketManager`/`SocialSocketManager`)
   listens to all 8 inbound `call:*` frames, routes each through `CallSignalMapper`, and republishes the
   mapped `CallEvent` on `SharedFlow<CallEvent> events`; outbound fire-and-forget emit table
   (`join`/`leave`/`end`/`toggle-audio`/`toggle-video`/`signal`) at iOS-exact payload keys. +18 tests.
   See run log. **VM-fold half now shipped** (see #6).
5. ~~**`call:initiate` ACK slice**~~ ✅ shipped as `call-initiate-ack` (2026-07-01) — `core:model`
   `SocketIceServer` (+ `IceServerUrlsSerializer` normalising single-string-or-array `urls`),
   `CallInitiateAck` (`callId`/`mode`/`iceServers`/`ttlSeconds`), the sealed `CallInitiateResult`
   (`Success`/`ServerError`/`Malformed`/`Timeout`) and the total pure `CallInitiateAckParser.parse`,
   plus `:sdk-core` `CallSignalManager.emitInitiate(conversationId, isVideo)` — the suspend transport
   that emits `call:initiate`, awaits the ACK (10s, iOS parity), delegates the body to the parser, and
   maps a missing/non-object ACK to `Timeout`. +26 tests. See run log.
6. ~~**VM-fold slice**~~ ✅ shipped as `call-viewmodel-signal-fold` (2026-07-01) — `CallViewModel` folds
   `CallSignalManager.events` in `viewModelScope` (each mapped `CallEvent` reduced through the FSM); an
   outgoing `start` mints the real `callId` via `emitInitiate` (optimistic ring, then `Ended(Failed)` on
   `ServerError`/`Timeout`/`Malformed`, the gateway message surfaced); accept/decline/hang-up/mute/camera
   fan out to `emitJoin`/`emitEnd`/`emitToggleAudio`/`emitToggleVideo` keyed by the known `callId`
   (outgoing minted, incoming from `CallConfig.callId`, inert until one exists). +14 tests. See run log.
7. ~~**App-level socket-lifecycle caller**~~ ✅ shipped as `realtime-session-coordinator` (2026-07-02) —
   the whole realtime layer was dead (nothing called `SocketManager.connect()` / any `*.attach()`), so
   `CallSignalManager.events` never flowed. `:sdk-core` `RealtimeSessionCoordinator.onAuthenticatedChanged`
   is the auth→socket bridge (connect **then** attach message/social/call on sign-in; disconnect on
   sign-out; edge-only, no double-connect), ordering + edges owned by the pure `RealtimeLifecyclePlan`
   (attach paired with **every** connect so logout→login re-attaches). Driven by `AuthViewModel` at
   init/login/logout. +16 tests. See run log.

**Next (highest value):** ~~a Calls-tab nav entry threading the real `conversationId` into the outgoing
`CallConfig`~~ ✅ the **conversationId threading** shipped as `call-nav-conversation-thread` (2026-07-02)
— pure `:app` `CallRoute` (`PATTERN`/`path`/`config`) owns the route, the CHAT composable threads its
nav-arg `conversationId`, outgoing calls now `emitInitiate` into the real room. +8 tests. Remaining: a
dedicated **Calls tab** in the bottom nav wiring `CallHistoryScreen` (`:app`). Then the heavier
WebRTC/Telecom/FCM plumbing.

Then the heavier WebRTC/Telecom/FCM-full-screen-intent plumbing (glue-heavy; push every testable
decision into pure helpers/the VM). The **ringback/ringtone/cue** decision core shipped as
`call-sound-policy` (2026-07-02), the **telecom-connection** decision core as `call-telecom-state-plan`
(2026-07-03), and the **connection-quality classification + indicator** as `call-quality-level`
(2026-07-03) — all pure `core:model` SSOTs folded into `CallViewModel`, leaving only the real
self-managed `ConnectionService`/`PhoneAccount` registration + foreground-service call UI (which swaps the
`LogTelecomCallReporter` `@Binds`) and the WebRTC media transport (`stream-webrtc-android`) as the
remaining platform glue.

**Next testable pure cores in Calls** (highest value first):
1. ~~**Video-survival auto-disable policy**~~ ✅ shipped as `call-video-survival-policy` (2026-07-03) —
   the pure `core:model` `VideoSurvivalPolicy` (port of iOS `VideoSurvivalPolicy`): `reduce(state, level,
   nowSeconds, userWantsVideo) → VideoSurvivalDecision(state, action)`. A sustained `POOR`/`CRITICAL`
   streak of ≥6 s while sending yields `Suspend` (drop to audio-only); a sustained `EXCELLENT`/`GOOD`
   streak of ≥10 s while suspended yields `Resume`; `FAIR` **holds** the recovery timer (a brief dip
   doesn't restart the window) while `POOR`/`CRITICAL` wipes it; a good/fair sample while sending clears
   the degraded streak. Duration-based hysteresis (monotonic-seconds, cadence-independent), fixed-size
   `VideoSurvivalState` (O(1) over a marathon call), user camera-off resets to `INITIAL`. Two survival
   thresholds added to `CallQualityThresholds` at iOS parity. +19 tests. See run log. **Next:** the
   WebRTC actuator seam that consumes `Suspend`/`Resume` (app-side orchestration).
2. ~~**Call-waiting banner**~~ ✅ shipped as `call-waiting-banner` (2026-07-03) — a second incoming call
   while one is active. The pure `core:model` decision core (`WaitingCall` + `WaitingCall.from(payload)`,
   `CallWaitingState`, total `CallWaitingReducer` — Offered/Rejected/Accepted/RemotelyEnded) is the SSOT,
   folded into `CallViewModel` end-to-end: a new `CallSignalManager.incomingOffers` surfaces the identity
   of each `call:initiated` frame (which the FSM-facing `events` discards), the VM routes a *second* offer
   (different callId, while `CallState.isActive`) to the banner, and a `CallWaitingTimer` seam auto-dismisses
   after 15s **as a reject** (frees the caller, iOS parity). `rejectWaiting()` ends the waiting call keyed by
   its own id (active call untouched); `acceptWaitingSwap()` hangs up the active call, settles, and
   re-presents the waiting call as a fresh incoming (iOS `endCurrentAndAnswerPending`). Accent-coherent
   top banner in `CallScreen` (error-hue reject + peer-accent answer, a11y-labelled). +35 tests. See run log.
   The `RemotelyEnded` driver ✅ shipped as `call-ended-signal-identity` (2026-07-03) — the pure
   `CallSignalMapper.endedCallId(eventName, rawJson)` decodes the `callId` from a `call:ended`/`call:missed`
   frame (blank/absent/malformed → `null`), a new `CallSignalManager.endedCalls: SharedFlow<String>`
   republishes it alongside the identity-less `events` (same parallel-stream pattern as `incomingOffers`),
   and `CallViewModel.onRemoteEnded` folds it into `CallWaitingEvent.RemotelyEnded` — auto-dismissing the
   banner (and cancelling its 15s auto-reject timer) **only** when the ended id is the *pending* call's,
   with **no** `emitEnd` (the caller already hung up), leaving the active call untouched. +15 tests.
   See run log. The **identity-aware active-call teardown** ✅ shipped as `call-ended-identity-teardown`
   (2026-07-03) — closed that known follow-up: `call:ended`/`call:missed` now route to `null` in
   `CallSignalMapper.map` (never the identity-less `events`) and are decoded once by the new pure
   `CallSignalMapper.endedSignal → CallEndedSignal(callId, event)`, so `CallSignalManager.endedCalls` is
   now `SharedFlow<CallEndedSignal>` (was `String`) — the **sole** teardown path. `CallViewModel.onRemoteEnded`
   gates on identity: the *active* call's id → reduce the FSM by the carried `RemoteHangUp`/`RingTimeout`;
   the *waiting* call's id → dismiss the banner (no `emitEnd`); neither → inert. A waiting call's teardown
   fanned out to a busy user's rooms can no longer tear down the active call. +new tests. See run log.
3. ~~**Adaptive sender-cap plan**~~ ✅ shipped as `call-sender-cap-plan` (2026-07-03) — the pure
   `core:model` `VideoSenderCapPlan` turning a `VideoQualityLevel` + `ThermalState` into the concrete RTP
   sender parameters (`maxBitrateBps`/`maxFramerate`/`scaleResolutionDownBy`). Network ladder picks the
   target (CRITICAL floored to 360p15 @ 100 kbps, never a zero encoder / never an upscale); an independent
   `ThermalCeiling` (port of iOS `VideoThermalProfile`, `NOMINAL` a no-op) sheds encode load on a hot device;
   the more conservative value wins per axis. +17 tests. See run log. **Next:** the app-side WebRTC actuator
   seam that (a) maps Android `PowerManager.THERMAL_STATUS_*` → `ThermalState`, (b) folds `VideoSenderCapPlan`
   + `VideoSurvivalPolicy` on the stats tick, and (c) applies the cap to the live RTP video sender — plus the
   debounce/change-detection that only re-applies when the cap actually changes (iOS
   `qualityLevelDebounceSeconds`), all real WebRTC glue behind a testable seam.

--- Stories backlog (area is rich; revisit only if Calls stalls) ---
Ordered by value:
0aa. ~~**8 photo filters with intensity**~~ ✅ shipped as `story-photo-filters` (this run) — pure
   `StoryFilterMatrix` (Compose-agnostic `StoryColorMatrix` + per-preset `baseMatrix` + intensity-blended
   `effectiveMatrix` + `StoryFilter.wireValue`), per-slide `StorySlide.filter`/`filterIntensity` deck
   reducers, live `ColorFilter` on the canvas + None/8-chip + strength `Slider` Effets tile, carried into
   publish on `storyEffects.filter`. See run log. **Emoji stickers** ✅ shipped as `story-sticker-elements`
   (this run) — on-canvas `StoryStickerElement` (drag/pinch/rotate/remove) + Contenu "Sticker" tile +
   emoji-grid picker, serialised to `storyEffects.stickerObjects`. **Next real Effets tiles:** on-canvas
   **freehand drawing**, then **backgrounds** (pastel / gradient / image), then the timeline. The
   **categorised + searchable** sticker picker ✅ shipped as `story-sticker-picker-search` (this run) —
   pure `StickerCatalog` (8 categories, keyworded search, `search(query, category?)`) + pure
   `StickerPickerState` reducer (a non-blank query searches across **all** categories, iOS parity);
   the dialog is now a search field + `FilterChip` tabs + filtered grid + empty-state. Replaces the
   flat `STORY_STICKER_EMOJIS`. +22 tests. See run log.
0. ~~**Z-order management (front/back, forward/backward)**~~ ✅ shipped as `story-text-element-zorder`
   (this run) — pure `StorySlideDeck.reorderTextElement(id, StoryZOrder)` restacks an element within its
   slide's paint order (list order = z-order), inert at the extremes / unknown id / single element;
   4-button z-order row in the floating toolbar. See run log.
   **Next composer-richness:** a single unified long-press context menu consolidating
   edit/duplicate/reorder/delete; then on-canvas **sticker / drawing** elements and the real **Effets
   tiles** (filters / drawing / timeline).
0b. ~~**Snap-to-guide + out-of-bounds warning**~~ ✅ shipped as `story-canvas-snap-guides` —
   pure `StorySnapResolver` (per-axis nearest-guide snap + safe-zone verdict) reused through the existing
   element-drag path, with an accent guide-line overlay + warning border. See run log.
1. **Canvas toolbar/FAB** — the bottom-band toolbar (Contenu/Effets) grouping add-text / add-media;
   glue-heavy, keep any mode decision in a pure helper or the VM.
2. ~~**Per-element transform handles**~~ ✅ shipped as `story-text-element-transform` (this run) — but
   as a **direct pinch/rotate gesture** (more natural than discrete chips, per CLAUDE.md UX rule).
3. ~~**Canvas toolbar/FAB**~~ ✅ shipped as `story-composer-band` (this run) — the two-FAB
   (Contenu/Effets) bottom band, the pure value-type port of iOS `BandStateMachine`. Pure
   `ComposerBandState` (Hidden | Tiles(category)) + `tapFab`/`swipeDown`/`swipeHorizontal` owns the
   navigation; Contenu drawer = Texte/Médias tiles, Effets drawer = visibility chips. **Next refinement:**
   real **Effets tiles** (filters / drawing / timeline) once those features land — currently Effets only
   surfaces visibility. Then the on-canvas **sticker / drawing** elements.
4. ~~**Per-element transform handles**~~ ✅ shipped as `story-text-element-transform` — as a
   **direct pinch/rotate gesture** (more natural than discrete chips, per CLAUDE.md UX rule).
   `StoryTextElement.scale`/`rotationDeg` + pure `transformed()` + `transformTextElement` reducer +
   `onTextElementTransform` VM intent + `graphicsLayer`/`detectTransformGestures` glue. Wire carries
   `scale`/`rotation`. **Per-element duplicate** ✅ shipped as `story-text-element-duplicate` (this run) —
   pure `StorySlideDeck.duplicateTextElement` clones every styled field as a fresh id just after the
   source on its slide, nudged by a small clamped offset, inert on unknown/collision/cap;
   `onDuplicateTextElement` selects the copy + warns at the cap; a `ContentCopy` handle in the floating
   `TextStyleToolbar`. **Next composer-richness refinement:** a unified multi-element context menu +
   z-order **reorder** (per-element delete already exists).
5. After Stories richness is sufficient, advance to the **Calls** area
   (`feature-parity.md` §"Calls").

(`story-floating-toolbar` ✅ shipped 2026-06-29 — this run; **the style toolbar now floats in-place**
over the canvas instead of a fixed bottom band. A pure `StoryToolbarPlacement.resolve(...)` →
`ToolbarPlacement(topPx, ToolbarSide)` decides the anchor: BELOW the selected element when the toolbar
fits beneath it, otherwise ABOVE, clamped into the canvas (boundary-exact, degenerate-canvas safe).
The composer applies `imePadding` so the measured canvas already excludes the soft keyboard (the
keyboard-aware shift), and `StoryCanvasSurface` measures the selected element's half-height + the
toolbar height and offsets the floating `TextStyleToolbar` to the resolved Y. +9 placement tests; no
new strings. Surpasses iOS's fixed bottom style bar. See run log.)

(`story-text-element-styling` ✅ shipped 2026-06-29 — this run; **on-canvas text elements are now
styleable**. A pure `StoryTextStyle.typography()` mapping (the single source of truth for how each of
the five iOS faces renders) returns Compose-agnostic tokens — `StoryTextTypography`
(`fontWeight`/`italic`/`family`/`letterSpacingEm`/`glow`) over the new `StoryTextFontFamily` enum
(SANS/SERIF/MONOSPACE/CURSIVE) — so the canvas Composable stays glue and the rendering decision is
unit-tested in one place. Three one-line VM intents
`onTextElementStyle`/`onTextElementColor`/`onTextElementAlign` wrap `deck.updateTextElement` (inert on
unknown id, selection/editing untouched). `TextElementLayer` now renders weight/slant/family/tracking
+ a neon glow `Shadow`; a `TextStyleToolbar` (shown while editing an element) offers five style chips,
the L/C/R alignment toggle, and a colour-swatch row. +8 typography tests, +8 VM tests; +8 strings × 4
locales. See run log.)

(`story-text-elements` ✅ shipped 2026-06-29 — this run; **on-canvas text elements are real**. A pure
`StoryTextElement` (id/text/`StoryTextStyle`/hex colour/`StoryTextAlign`/normalised x,y) with the canvas
clamp in one place (`normalised`/`nudged`) + a `toTextObject(lang)` gateway-wire mapper. The deck mirrors
the media reducer per-slide (`addTextElementToSelected`/`removeTextElement`/`updateTextElement`/
`moveTextElement`, ≤5/slide cap, `selectedRemainingTextSlots`, `isWithinTextElementLimit`); a
text-element-only slide now publishes. `StoryComposerDraft.toCreateStoryRequest` serialises publishable
elements into `storyEffects.textObjects` (blanks dropped). The VM adds add/select/deselect/move/remove
intents and routes the single text field to the selected element **or** the slide caption
(`editorText`/`isEditingTextElement`); switching slides ends element editing. `StoryCanvasSurface` renders
each element centred-at-fraction, draggable/tappable/removable, with a background tap to deselect. +41
tests (10 element, 16 deck, 5 draft, 10 VM). See run log.)

(`story-canvas-transform` ✅ shipped 2026-06-29 — this run; **the 9:16 canvas is now real with
pinch-zoom + drag-pan**. A pure per-slide `StoryCanvasTransform` (scale clamped 1–4×, offset clamped
to the scaled-content overflow) owns the gesture math: `apply(pan,zoom,canvasW,canvasH)` multiplies
scale by the gesture zoom then clamps translation to the **new** scale's bounds (pinch-out tightens +
re-clamps toward centre; a 0px canvas collapses the range without div-by-zero), and `clampedTo` re-clamps
on resize. The transform is part of the slide's identity (`StorySlide.transform`, carried by `duplicate`),
persisted via `StorySlideDeck.updateSelectedTransform`, driven by `StoryComposerViewModel.onCanvasTransform`,
and rendered by a glue `StoryCanvasSurface` (selected slide's first media as a 9:16 `graphicsLayer`
background under `detectTransformGestures`). +16 transform tests, +3 deck tests, +3 VM tests. See run log.)

(`story-slide-media` ✅ shipped 2026-06-29 — this run; **per-slide media**. Media now belongs to the
slide it was added to, not the whole story. The deck is the single source of truth
(`StorySlideDeck.addMediaToSelected`/`removeMedia`/`hasMedia`/`isWithinMediaLimit`/
`selectedRemainingMediaSlots`, ≤10 media **per slide**); `draft` mirrors the selected slide for media
exactly as it already does for text, so the single-slide path stays byte-identical and most existing
tests pass unchanged. `onMediaPicked` attaches to the selected slide (online ids or offline
placeholders), the preview shows only the selected slide's media
(`selectedSlideAttachments`/`selectedSlidePending`), publish emits one story **per publishable slide**
(text **or** media) carrying that slide's media and `dependsOn` only that slide's offline uploads, and
removing a slide reclaims its media (drops preview entries + cancels its durable rows). +13 deck tests,
+10 VM tests. See run log.)

(`slide-drag-reorder` ✅ shipped 2026-06-29 — this run; the deferred **drag-reorder gesture** from
the slide-deck loop. New pure `SlideReorderResolver.targetIndex` maps accumulated horizontal drag px
+ measured slot width to the clamped landing slot (sub-half-slot drift → no move; bounds-clamped;
div-by-zero/empty/out-of-range safe), and `SlideStrip` binds `detectHorizontalDragGestures` on each
chip to feed the already-tested `onMoveSlide`. +11 behavioural tests. See run log.)

(`story-composer-slide-deck` ✅ shipped 2026-06-29 — this run; the multi-slide model is now **real in
the composer**. `StoryComposerUiState.deck: StorySlideDeck`, the VM mints slide ids and exposes
`onAddSlide`/`onDuplicateSelectedSlide`/`onRemoveSlide`/`onMoveSlide`/`onSelectSlide` (editor bound to
the selected slide's text via pure `updateSelectedText`), publish stays **lossless** — one story per
non-blank slide in order (first carries whole-story media + deps), `canPublish` gates on the whole deck,
and `StoryComposerScreen` renders a `SlideStrip` mini-preview. Drag-reorder gesture deferred. See run log.)

(`story-composer-multi-pending` ✅ shipped 2026-06-28 — this run; the composer's offline staging is now
**multi-pending**: `StoryComposerUiState.pendingUploads: List<PendingMediaUpload>`, every transient-failed
pick (and each item of an offline batch) is durably queued + appended, `publish()` gates on **all**
placeholder cmids, per-tile remove cancels only that durable row, and the preview renders N "Offline"
tiles. Closes the multi-dependency chain end-to-end from the UI. See run log.)

(`outbox-multi-dependency` ✅ shipped 2026-06-28 — this run; the `dependsOn` gate now expresses a
**set** of prerequisites via the new pure `OutboxDependencyKey` (encode/decode/likePattern) +
`OutboxDependencies.verdictAll`. `OutboxMutation.dependsOn: Set<String>`, the drainer gates on all
and cascade-exhausts on any failure, `findDependents` is a `LIKE` membership query so a producer
grafts its id into a dependent waiting on several uploads, and `enqueuePublish` takes a `List<String>`.
The composer adopts the list contract but keeps single-pending UI — the multi-pending UX is the next
slice. See run log.)
(`outbox-flush-retry-on-blocked` ✅ shipped 2026-06-28 — this run; the `OutboxFlushWorker` now
reschedules (WorkManager `Result.retry()`) when any lane stopped on a **blocked dependency**, not
only a transient failure, via the new pure `OutboxFlushPlan.outcome(reports)` building block.
Closes the cross-pass gating gap so a dependent held early in a pass is auto-retried once its
prerequisite is delivered later in the same/next pass. See run log.)
(`media-upload-cancel` ✅ shipped 2026-06-28 — this run; removing the offline placeholder now
`MediaUploadQueue.cancel`s its durable `UPLOAD_MEDIA` row + blob (row discarded first, then
bytes; unknown cmid inert), closing the orphan-leak gap left by `story-composer-offline-media`.
UI clears optimistically; the durable cancel is best-effort & cancellation-safe. See run log.)
(`story-composer-offline-media` ✅ shipped 2026-06-28 — this run; the composer's offline
fallback: a single transient-failed media pick is durably queued + staged as a pending
placeholder, and `publish()` gates the story on it via `enqueuePublish(.., dependsOn)`. The
durable offline upload→publish chain is now reachable from the UI. See run log.)
(`media-upload-sender` ✅ shipped 2026-06-28 — this run; the rest of the producer half
at the SDK layer — `OutboxKind.UPLOAD_MEDIA`, the pure `MediaUploadSender` outcome map,
the `MediaUploadQueue.enqueue` building block, and the `OutboxFlushWorker` `MEDIA`-lane
sender drained before `STORY` with blob cleanup on delivery / exhaustion. The durable
offline upload→publish chain now works end-to-end at the SDK layer. See run log.)
(`media-blob-store` ✅ shipped 2026-06-28 — see run log; the durable file-bytes store,
first brick of the producer half.)
(`outbox-produced-id-writeback` ✅ shipped 2026-06-27 — this run; a prerequisite's
`SendResult.SuccessWithId(producedId)` now grafts the real id into every still-queued
dependent's payload (placeholder = the prerequisite cmid) before the gate opens, via
the pure `PublishMediaWriteBack.graft` + the generic `OutboxRepository.rewriteDependents`.
The second half of the durable upload→publish chain. See run log.)
(`outbox-dependency-gating` ✅ shipped 2026-06-27 — this run; the drainer now
honours the persisted `dependsOn` cmid: a dependent holds its lane while the
prerequisite is queued, runs once it succeeds, cascade-exhausts if it gives up.
The durable upload→publish chain primitive. See run log.)
(`story-composer-multipick` ✅ shipped 2026-06-27 — this run; the Add button now
routes to the multi-item system picker, with a pure single/multi/none decision so
the multi-picker's `maxItems > 1` requirement never throws. See run log.)
(`story-composer-media-cap` ✅ shipped 2026-06-27 — see run log; enforced the iOS
≤10 media cap end-to-end. See run log.)
(`story-composer-media` ✅ shipped 2026-06-27 — PR #979 squash-merged this run
after confirming the sole red CI job (`Test gateway`) is a pre-existing
duplicate-`jwt`-import breakage on `main` itself, with zero gateway files in the
`apps/android`-only diff. See run log.)
(`media-upload-api` ✅ shipped 2026-06-27 — see run log; upload foundation.)
(`story-publish-retry` ✅ shipped 2026-06-27 — see run log; closed the
"failed publish disappears silently" follow-up.)
(`story-composer-optimistic-tray` ✅ shipped 2026-06-27 — see run log.)
(`story-composer` ✅ shipped 2026-06-26 — see run log.)
(`story-autoadvance-media-gate` ✅ shipped 2026-06-23 — see run log.)
(`story-media-prefetch` ✅ shipped 2026-06-23 — see run log.)
(`story-tray-count-dots` ✅ shipped 2026-06-23 — see run log.)

Note: server-side `currentUserReactions` seeding of `mine` on load, the
app-wide `SocialSocketManager.attach()` lifecycle wiring (no caller yet — affects
ALL social events, touches `:app`), and realtime `story:viewed` append to the
viewers list (socket payload lacks the viewer's name/avatar to render a row —
needs a richer gateway event or a user lookup) all remain tracked follow-ups.

After Stories richness is sufficient, advance to the **Calls** area
(`feature-parity.md` §"Calls").

## Run log

### 2026-07-13 — slice `conversations-row-relative-time` ✅ impl + reviewer PASS → PR + merge
- **Branch:** `claude/apps/android/conversations-row-relative-time` (off latest `main` `c4e9c2c`).
- **Housekeeping first (routine rule 0):** no open `claude/apps/android/*` PR — the prior Android slice
  (`time-relative-long-format-strings`) was already merged as **#1936**; nothing to reconcile. `main` fetched clean.
- **What:** feature-parity §B/§Q — the conversation list's rows carried **no timestamp**, a visible gap vs iOS
  `ThemedConversationRow` (trailing `RelativeTimeFormatter.shortString(for: conversation.lastMessageAt)`). This
  slice adds it by consuming the already-shipped `:sdk-ui` `RelativeTimeFormat.short` — the natural next step
  after the short renderer landed with only the feed as a consumer.
- **Added (production):**
  - `:feature:conversations` `ConversationRowTime.kt` — pure `object ConversationRowTime.epochMillis(conversation):
    Long?`. Resolution order `lastMessage.createdAt ?: updatedAt ?: createdAt`, each via the `isoToEpochMillisOrNull`
    SSOT; `null` when none parse. Blank/malformed candidates fall through; unix-epoch (0L) kept as valid.
  - `ConversationListScreen.kt` — trailing element of the row became a `Column(End, spacedBy xs)`: the discreet
    relative label (via new `@Composable conversationRowRelativeTime` helper → `RelativeTimeFormat.short` +
    `rememberRelativeTimeStrings`) above the existing unread `Badge`. Colour = `MeeshyTheme.tokens.error` when
    `unreadCount > 0` else `hexColor(conversation.accentHex())` (iOS `timestampColor` parity). No new strings
    (`time_relative_*` already shipped for the feed).
- **Tests (+10, RED→GREEN):** `ConversationRowTimeTest` — last-message-preferred; updatedAt-when-no-lastMessage;
  updatedAt-when-lastMessage-has-no-createdAt; createdAt-final-fallback; blank-lastMessage→updatedAt; unparseable-
  lastMessage→updatedAt; unparseable-updatedAt→createdAt; null-when-none; null-when-all-unparseable; unix-epoch-valid.
  **Branch sweep:** every rung of the `?:` chain + each fall-through arm + the null terminal + the 0L-not-absent
  boundary is hit. **Two-mutation RED:** (1) resolution order swapped (updatedAt before lastMessage) → 2 failures;
  (2) `createdAt` fallback dropped → 2 failures; both reverted, suite green.
- **Verification:** system Gradle 8.14.3 (`/opt/gradle`; wrapper download 403-blocked in this container).
  `:feature:conversations:testDebugUnitTest` full suite green + `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK
  produced; conversation-list Compose glue compiles; no module regressed).
- **Reviewer verdict: PASS.** Diff is `apps/android` only (3 code/doc files: new `ConversationRowTime.kt` + test,
  `ConversationListScreen` wiring, plus `feature-parity.md` + routine docs); no web/ios/gateway/shared/translator
  touched. Behaviour-through-public-API (`ConversationRowTime.epochMillis` + the composable helper), no tautologies,
  boundary + fall-through + null coverage, two-mutation RED confirms non-tautological. SDK purity — resolution rule
  is a pure `:feature:conversations` atom (product "which timestamp"), the formatter stays the agnostic `:sdk-ui`
  block. SSOT — parsing/thresholds/colour all reused, none re-implemented. Instant-app cache path unchanged.
  Colour/UX coherence — accent-coherent, semantic error on unread, discreet Prisme relative label. No coverage
  floor lowered, no test weakened, no secrets/`local.properties`.

### 2026-07-13 — slice `time-relative-long-label` ✅ impl + reviewer PASS → PR + merge
- **Branch:** `claude/apps/android/time-relative-long-label` (off latest `main` `819fcd9`).
- **Housekeeping first (routine rule 0):** the prior-iteration Android PR **#1902** (`chat-conversation-media-gallery`,
  `apps/android`-only) was open, CI green (run `29228329978` success), reviewer re-verified **PASS** — but its base had
  fallen behind `main` (#1904/`time-relative-classify` merged after) so the rebase re-conflicted on the `PROGRESS.md`
  run-log head. Rebased #1902 onto `main` `819fcd9` resolving the run-log adjacency by **keeping both** entries (code
  files auto-merged, byte-identical), force-pushed (`54adc22`); CI re-ran green and #1902 merged to `main` before this
  slice's PR. No production logic touched by either.
- **What:** feature-parity §Q — the *long* (detail-surface) relative-time framing, port of iOS
  `RelativeTimeFormatter.longString` (`maintenant / il y a 45s / il y a 5 min / hier / il y a 3j / il y a 2sem /
  il y a 2mois / date`), companion to the flat `RelativeTime.classify` ladder that shipped earlier the same day.
- **Added (production):**
  - `:core:model` `time/RelativeTimeLongLabel.kt` — `RelativeTimeLongLabel` sealed framing rung
    (`Now`/`AgoSeconds`/`AgoMinutes`/`AgoHours`/`Yesterday`/`AgoDays`/`AgoWeeks`/`AgoMonths`/`AbsoluteDate(epochMillis)`,
    value + framing intent, no text); `RelativeTimeLongFormat.label(epochMillis, referenceMillis, zoneId)`. Sub-hour
    rungs **reuse `RelativeTime`'s second thresholds** (SSOT), then switch to **calendar-day** boundaries (local-date
    delta via the injected `ZoneId`): `dayDelta <= 0` → `AgoHours`; `== 1` → `Yesterday`; `<7` → `AgoDays`; `<30` →
    `AgoWeeks`; `<90` → `AgoMonths`; else `AbsoluteDate`. Future/skew (negative interval) → `Now`.
- **Divergence from `classify` (the point of the slice):** from an hour up the ladder is calendar-day, not 24-hour —
  23:00→01:00-next-day (2h) reads `Yesterday`; and the boundary is the *user's* midnight, so the same instant reads
  `hier` in UTC vs `il y a 2h` three hours west (both pinned by tests).
- **Tests (+21, RED→GREEN):** every rung; both sides of every boundary (29/30s, 59/60s, 59min, 1h-same-day,
  23h-same-day-still-hours, 2h-across-midnight-IS-yesterday, prev-day, 2/6d, exactly-7d→1week, 29d→4weeks, 30d→1month,
  89d→2months, 90d→AbsoluteDate carrying the exact instant); the cross-zone divergence (one instant → `Yesterday` in
  UTC, `AgoHours(2)` at UTC−3). **Two-mutation RED check:** `dayDelta <= 0`→`< 0` + `dayDelta == 1`→`== 2` failed
  exactly the 6 calendar-day tests (hours/yesterday/days/zone), reverted green.
- **Verification (local, `LANG=C.utf8`, system Gradle 8.14.3):** `:core:model:testDebugUnitTest` green (21/21 new);
  `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced, ~74 MB).
- **Reviewer PASS:** diff `apps/android` only (`:core:model` [`time/RelativeTimeLongLabel.kt` + `RelativeTimeLongLabelTest.kt`],
  `feature-parity.md`, PROGRESS/NOTES docs); no production logic outside; behaviour-through-public-API, no tautologies
  (mutation-proven); **SDK purity** — pure framing in `:core:model`, the `time.long.*` wording + `Locale`-aware
  absolute date stay UI-side exactly as iOS keeps them in the formatter catalog; **SSOT** — second thresholds reused
  from `RelativeTime`, the calendar-day framing owned once here; **UDF/instant-app** — pure fn, no state/UI;
  **colour/UX coherence** — no UI in this slice; no coverage floor lowered, no test weakened.

### 2026-07-13 — slice `time-relative-classify` ✅ impl + reviewer PASS → PR + merge
- **Branch:** `claude/apps/android/time-relative-classify` (off latest `main` `c93fa81`).
- **Housekeeping first (routine rule 0):** two prior-iteration Android PRs were open. Merged **#1900**
  (`chat-message-grouping`, `apps/android`-only, `mergeable_state: clean`) → `main` (squash `c93fa81`). **#1902**
  (`chat-conversation-media-gallery`) then went `dirty` (both touch `ChatViewModel`/`ChatScreen`); rebased it
  onto the new `main` resolving the only conflict (a `PROGRESS.md` run-log adjacency) by keeping **both** entries,
  built `:feature:chat`+`:sdk-ui` green — but a concurrent session (`session_01Cx8…`) had already rebased/pushed
  the same result (`a81fd8c`) and its CI was `in_progress`, so #1902 is left to that session to merge on green
  (cannot merge past a pending check; hard rule). No production logic touched by either.
- **What:** feature-parity §Q — the relative-time classification SSOT, port of iOS `RelativeTime.classify` (the
  threshold source of truth the iOS `RelativeTimeFormatter` builds on). Underpins every conversation-row / feed /
  notification / presence timestamp.
- **Added (production):**
  - `:core:model` new package `me.meeshy.sdk.model.time` — `RelativeTimeUnit` sealed ladder
    (`Now`/`Seconds`/`Minutes`/`Hours`/`Days`/`Weeks`/`Months`/`AbsoluteDate(epochMillis)`, value but no text);
    `RelativeTime.classify(epochMillis, referenceMillis)` with thresholds as named `const` (SSOT): `Now`<30s →
    seconds<1min → minutes<1h → hours<1day → days<7d → weeks<30d → months<90d → absolute date. Rendering
    (localized strings + `Locale`-aware absolute date) stays UI-side, exactly as iOS keeps it in the view layer.
- **Surpasses iOS** on two implicit edges: future/skew (negative interval) → `Now` (no negative counts); `Long`
  arithmetic throughout → a decades-old timestamp reaches the absolute-date rung without 32-bit `Int` overflow.
- **Tests (+24, RED→GREEN):** every rung; both sides of every boundary (29/30s, 59/60s, 3599/3600s, 6/7d, 29/30d,
  89/90d); integer-floor of trailing units (119s→1min, 13d→1week); future, far-future, ~30-year (overflow), and
  unix-epoch edges. **Two-mutation RED check:** `< NOW_THRESHOLD`→`< MINUTE_SECONDS` + `days < WEEK_DAYS`→`days <=
  WEEK_DAYS` failed exactly the 3 relevant tests (30s + 59s seconds rungs + exactly-7-days→weeks); reverted green.
- **Verification (local, `LANG=C.utf8`, system Gradle 8.14.3):** `:core:model:testDebugUnitTest` green (24/24 new);
  `:app:assembleDebug` → **BUILD SUCCESSFUL** (APK produced, 74 MB).
- **Reviewer PASS:** diff `apps/android` only (`:core:model` [`time/RelativeTime.kt` + `RelativeTimeTest.kt`],
  `feature-parity.md`, PROGRESS/NOTES docs); no production logic outside; behaviour-through-public-API, no
  tautologies (mutation-proven); SDK purity — pure classifier in `:core:model`, presentation UI-side; SSOT —
  thresholds once as named consts; UDF/instant-app — pure fn, no state/UI; colour/UX coherence — no UI in slice;
  no coverage floor lowered, no test weakened.

### 2026-07-13 — slice `chat-conversation-media-gallery` ✅ impl + reviewer PASS → PR #1902, rebased on `main` after #1900 merged
- **Branch:** `claude/apps/android/chat-conversation-media-gallery` (branched off `e0027ae`, then rebased
  cleanly onto `main` `c93fa81` once #1900 merged — only a `PROGRESS.md` run-log conflict, resolved by
  keeping both entries; `ChatViewModel` auto-merged, different region than #1900's `toBubbles`).
- **Housekeeping (routine rule 0):** the previous iteration's PR **#1900** (`chat-message-grouping`) was
  open, `apps/android`-only (8 files), `mergeable_state: clean`, reviewer re-verified **PASS** — but its
  **CI run `29219800275` was stuck `queued`** for 30+ min (shared GitHub-Actions runner backlog, not a PR
  defect). Cannot merge past a non-green check (hard rule), so #1900 is left open to merge the moment CI
  goes green; #1900 has since merged to `main` (`c93fa81`) and this slice was rebased on top.
- **What:** feature-parity §C — the fullscreen media gallery, port of iOS `ConversationMediaGalleryView`.
  Tapping an image no longer opens a viewer scoped to the tapped message; it opens a gallery that spans
  **every image in the conversation**, in order, starting on the tapped one.
- **Added (production):**
  - `:feature:chat` `ConversationMediaGallery.kt` — pure SSOT `of(messages, messageId, imageIndex)` →
    `ConversationGallery(imageUrls, startIndex)`. Flattens each non-deleted bubble's images in conversation
    order; `startIndex` = running image count before the tapped message + `imageIndex` clamped into that
    message's own bounds; unknown/deleted/imageless tapped message → falls back to the start; empty → the
    inert `EMPTY`.
- **Changed (production):**
  - `ChatViewModel`: `openImageViewer` now builds the conversation-wide gallery via the pure SSOT and stores
    it (`imageViewer: ConversationGallery?`, `null` when there is nothing to show); removed the old
    single-message `ImageViewerTarget`.
  - `ChatScreen`: renders `MeeshyImageViewer` (unchanged `:sdk-ui` building block — pinch-zoom + `n/total`
    counter already there) over `gallery.imageUrls` at `gallery.startIndex`.
- **Tests (+14, RED→GREEN):** `ConversationMediaGalleryTest` 12 (empty; imageless→empty; single→0; later
  index within a message; spans-all-messages in order; imageless messages skipped without shifting start;
  out-of-range index clamps to the message's last image *with a trailing message present* so the per-message
  clamp is genuinely exercised; negative index clamps to first; unknown id → whole gallery from 0; deleted
  message contributes no images; tapping a deleted message → start; matched-but-imageless → start).
  `ChatViewModelTest` +2 (tap builds conversation-wide gallery with correct `startIndex` + dismiss clears;
  tap on an imageless message opens no gallery). **Two-mutation RED check:** dropping the per-message
  `coerceIn` clamp + the `isDeleted` skip failed exactly the negative-clamp + 2 deleted tests (the
  out-of-range test was then strengthened with a trailing message so the clamp isn't masked by the final
  global clamp).
- **Verification (local, `LANG=C.utf8`):** `gradle assembleDebug testDebugUnitTest` → `assembleDebug`
  **SUCCESSFUL**; `:feature:chat` (`ConversationMediaGalleryTest` 12/12, `ChatViewModelTest` 166/166) +
  `:sdk-ui` green. Full-tree run: only failure is the **known pre-existing `:sdk-core`
  `PrivacyPreferencesStoreTest` DataStore `StateFlow`-timeout flake** (untouched module; passes on isolated
  retry — re-run green). **Env note:** the system-Gradle daemon must launch under `LANG=C.utf8` or
  `:sdk-core:compileDebugUnitTestKotlin` dies with `InvalidPathException` on the em-dash in
  `ActiveCallRepositoryTest`'s method name (`sun.jnu.encoding` fallback) — `gradle --stop` then re-run with
  the UTF-8 locale exported.
- **Reviewer:** **PASS** — diff `apps/android` only; behaviour-through-public-API (`ConversationMediaGallery.of`
  + VM `openImageViewer`), no tautologies, boundary coverage (empty/single/clamps/unknown/deleted); **SDK
  purity** — the "which media, starting where" decision is a pure `:feature:chat` atom, the fullscreen viewer
  stays the generic stateless `:sdk-ui` `MeeshyImageViewer` (opaque url list); **SSOT** — one flatten owns
  ordering + start resolution; **instant-app/UDF** — pure function + immutable `StateFlow` state, `null` when
  empty (no blank viewer); **UX coherence** — natural tap-to-open / swipe-across / dismiss-back, no dead end;
  no coverage floor lowered, no test weakened.

### 2026-07-13 — slice `chat-message-grouping` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/chat-message-grouping` (off latest `main` `e0027ae`).
- **Housekeeping first (routine rule 0):** no open Android PR from a prior iteration (the two open PRs were an
  unrelated gateway async-safety fix #1897 and a dependabot #1842). Nothing to merge before starting.
- **What:** feature-parity §C — consecutive-sender message grouping (WhatsApp/iMessage-style runs). A genuine
  improvement over iOS, whose `MessageListViewController` hardcodes `isLastInGroup: true` + `showAvatar: !direct`
  (every incoming message re-shows the sender name).
- **Added (production):**
  - `:feature:chat` `MessageGrouping.kt` — `MessageGroupInput(id, senderId, isOutgoing, createdAtMillis?)`,
    `MessageGroupPosition(isFirstInGroup, isLastInGroup)` (+`isStandalone`), `object MessageGrouping`
    (`DEFAULT_GAP_MILLIS`=5min, `positions(list, gapMillis)`): same-author (self for outgoing / equal non-null
    `senderId` for incoming, null sender never groups) AND absolute-delta ≤ gap; missing timestamp rides with prev.
  - `:sdk-ui` `BubbleContent` +`isFirstInGroup`/`isLastInGroup` (default `true`).
- **Wired:** `ChatViewModel.toBubbles` computes positions over the hidden-filtered list, derives `showSenderName`
  from `isFirstInGroup` (was hardcoded `true`), threads first/last onto the bubble; `MessageBubble` (exempt Compose)
  stacks a run tightly — top gap only on first, bottom gap only on last — distinct messages keep 4dp.
- **Tests (+15, RED→GREEN):** MessageGroupingTest 15 (empty, single-standalone, within/beyond/exactly-on gap,
  different senders, two-outgoing-self, outgoing→incoming break, null sender, missing-timestamp-rides, middle-of-
  three, sender-change split, custom gap, out-of-order abs-delta, keyed-by-every-id). Branches swept: both arms of
  `sameAuthor` (isOutgoing mismatch / self / null sender / equal id), both arms of `withinGap` (null-either → true,
  `<=` boundary), first/last edges (no prev / no next), middle (neither).
- **Two-mutation RED proof:** `<=`→`<` on the gap + `if (a.isOutgoing) return false` in `sameAuthor` → exactly 2
  tests failed (`a_gap_exactly_on_the_threshold_still_groups`, `two_outgoing_messages_group_as_the_same_self_sender`);
  reverted, green again.
- **Verification:** `assembleDebug` BUILD SUCCESSFUL (APK; MessageBubble spacing compiles); `:feature:chat` +
  `:sdk-ui` `testDebugUnitTest` → 0 failures (MessageGroupingTest 15/15). Full-tree run had only the 3 documented
  pre-existing flaky `:sdk-core` DataStore timeout tests (Media/Notification/PrivacyPreferencesStoreTest) — count
  varied 3→1 across runs, each green on isolated retry; not in the two modules this slice touches.
- **Reviewer PASS:** diff `apps/android` only (6 files: `:feature:chat` [MessageGrouping.kt + test + ChatViewModel],
  `:sdk-ui` [BubbleContent + MessageBubble], feature-parity/PROGRESS/NOTES docs); no production logic outside;
  SDK purity — pure clustering in `:feature:chat` (home of ReplyThreads/PinnedMessages/ForwardTargets), Compose
  spacing app-side; SSOT — one grouping owns header + run; UDF/instant-app — pure fn, cache-first path unchanged;
  colour/UX coherence — no colour change, natural tightly-stacked runs; no coverage floor lowered, no test weakened.

### 2026-07-12 — slice `settings-about-screen` ✅ impl + reviewer PASS → merged
- **Branch:** `claude/apps/android/settings-about-screen` (off latest `main` `32df95a`, i.e. after the
  `settings-crash-diagnostics` PR #1884 was merged at the start of this run).
- **Housekeeping first (routine rule 0):** the previous iteration's PR #1884
  (`settings-crash-diagnostics`) was open with green CI (SHA `78e22d85` → success), `apps/android`-only
  (26 files) and `mergeable_state: clean` → squash-merged to `main` (`32df95a`) before starting this slice.
- **What:** feature-parity §L — the About screen. Port of iOS `AboutView`.
- **Added (production):**
  - `:core:model` `about/` (package `me.meeshy.sdk.model.about`) — `AboutModels.kt` (`AboutInfoKey`,
    `AboutInfoRow`, `AboutLinkKind`, `AboutLink`, `AboutFeatureKey`, `AboutParams`, `AboutPresentation`),
    `AppVersionFormatter` (pure `"name (build)"` fragment; blank name → `1.0.0`, non-positive code → `1`),
    `AboutLinkResolver` (keeps only non-blank http(s) links, order-preserving), `AboutPresentationBuilder`
    (assembles version label + 3 blank-safe info rows + full feature list + launchable canonical links).
  - `:feature:settings` `AboutScreen.kt` — Compose glue (brand-gradient header, Indigo section cards,
    info/feature rows, `ACTION_VIEW` links); reads version/platform facts from `PackageInfo`/`Build`.
  - `:feature:settings` EN/FR/ES/PT strings (`about_*`).
- **Wired:** `SettingsScreen` gained `onOpenAbout`; the previously-dead Settings → About "Version" row now
  navigates to `Routes.ABOUT`; `MeeshyApp` registers `composable(Routes.ABOUT) { AboutScreen(...) }`.
- **Tests (+27, RED→GREEN):** AppVersionFormatter 7, AboutLinkResolver 9, AboutPresentationBuilder 11.
  Branches swept: version blank/empty/padded name × zero/negative/positive code + both-degraded; link
  https/http/uppercase-scheme/padded kept, blank/non-http/schemeless dropped, mixed-order preserved, empty;
  builder version-label delegation, platform prefix vs bare-Android (blank release), appId trim vs default,
  sdk trim vs default, info-row fixed order, features = all keys, links = launchable-only canonical.
- **Two-mutation RED proof:** leak non-positive build code (`build = versionCode.toString()`) + always-prefix
  platform (`"$PREFIX $release"`) → exactly 4 tests failed (`format_zeroCode…`, `format_negativeCode…`,
  `format_bothDegraded…`, `build_blankRelease_platformRowIsBareAndroid`); reverted, green again.
- **Verification:** `:app:assembleDebug` BUILD SUCCESSFUL; `:core:model` + `:feature:settings`
  `testDebugUnitTest` green.
- **Reviewer PASS:** diff `apps/android` only (14 files: `:core:model` [4 new + 3 test], `:feature:settings`
  [AboutScreen + SettingsScreen + 4 strings], `:app` nav wiring, feature-parity/PROGRESS/NOTES docs); no
  production logic outside; **SDK purity** — pure formatter/resolver/builder in `:core:model` (no Android
  import), the "read PackageInfo / which icon / open URL" glue app-side; **SSOT** — one `AppVersionFormatter`
  owns the version string, one `AboutLinkResolver` the launchability gate, no re-implementation;
  **UDF/instant-app** — pure synchronous `remember`ed projection, no network/spinner; **colour/UX coherence**
  — Indigo brand-gradient header + Indigo section headers + Info-coloured links, natural row→screen→back,
  no dead end (the version row was previously inert); **no coverage floor lowered, no test weakened**.
- **Next slice:** the remaining §L static screens (Help & Support, Terms of Service, Privacy Policy,
  open-source licenses — the licenses screen has a genuinely testable pure core: parse/group/sort an
  auto-generated licenses manifest), or the chat media view that consumes the `MediaAutoDownloadDecider`.

### 2026-07-12 — slice `settings-crash-diagnostics` ✅ merged to `main` (PR #1884, squash `32df95a`, CI green)
- **Branch:** `claude/apps/android/settings-crash-diagnostics` (off latest `main` `4d341f2`).
- **What:** feature-parity §L — the crash-report diagnostics viewer with share. Port of iOS
  `CrashDiagnosticsManager` + `CrashReportSheet`; Android-honest capture via
  `Thread.setDefaultUncaughtExceptionHandler` (analogue of iOS `NSSetUncaughtExceptionHandler`, chains to the
  previous handler).
- **Added (production):**
  - `:core:model` `diagnostics/` — `CrashKind`(+`CrashSeverity`) severity/wire-token SSOT, `CrashDiagnostic`
    (`@Serializable`), `CrashDiagnosticFactory.fromThrowable` (throwable→diagnostic, id/ts injected),
    `CrashReportFormatter` (share text, port of `formatAllReports()`), `CrashReportRetention`
    (sort-newest-first + cap 50 + overflow GC, port of `decodeAllReports()`), `CrashReportCodec`
    (`storageValue`/`crashReportsFromStorage`, corruption-safe, skips bad elements).
  - `:feature:settings` — `CrashDiagnosticsStore` (interface) + `FileCrashDiagnosticsStore` (exempt I/O glue,
    `@Synchronized` sync `record`), `CrashDiagnosticsRecorder` (installer), `CrashDiagnosticsModule` (Hilt
    binding), `CrashReportViewModel` (UDF), `CrashReportScreen` (glue), SettingsScreen "Diagnostics" row.
  - `:app` — `Routes.DIAGNOSTICS` + composable + SettingsScreen callback; `MeeshyApplication` installs the
    recorder in `onCreate`.
- **Tests (RED→GREEN):** +42 — CrashKind 5, CrashDiagnosticFactory 5, CrashReportFormatter 5,
  CrashReportRetention 12, CrashReportCodec 6, CrashReportViewModel 9. Branches swept: severity/wire per kind;
  null-message placeholder; cause-in-details; formatter empty/single/multi/order/ISO; retention
  empty/single/newest-first/tie-break/under-cap/at-boundary/over-cap/cap≤0/overflow; codec
  roundtrip/blank/malformed/non-array/skip-corrupt/unknown-keys; VM load success+failure, empty+shareContent,
  optimistic clear+rollback+inert+in-flight guard+cancellation.
- **Verification:** `:app:assembleDebug` BUILD SUCCESSFUL; `:core:model` + `:feature:settings` diagnostics
  tests green. Full all-module `testDebugUnitTest`: only failure = documented DataStore flake
  `NotificationPreferencesStoreTest` (1/576 sdk-core, green in isolation in 4s, NOTES §DataStore) — this slice
  adds no DataStore store and touches no sdk-core code. Two-mutation RED proof: misclassify DISK severity +
  drop the retention cap → exactly 3 relevant tests fail (`severity_mapsInfoKinds`,
  `retained_overCap_dropsOldestBeyondCap`, `retained_capZeroOrNegative_isEmpty`); reverted.
- **Reviewer:** PASS. Diff `apps/android` only (`:core:model` new `diagnostics/` files, `:feature:settings`
  new store/recorder/module/VM/screen + SettingsScreen row + EN/FR/ES/PT strings, `:app` nav + Application
  install); no production logic outside `apps/android`. SDK purity — pure classify/format/retain/codec in
  `:core:model`, "when to record / on-disk layout / cache→UI" orchestration in `:feature:settings`. SSOT — one
  formatter/retention/codec, no re-implementation. UDF/instant-app — immutable `StateFlow<UiState>`, skeleton
  only on cold empty, optimistic clear with rollback. Colour/UX — severity badges from `MeeshyPalette`
  (Error/Warning/Info), natural back nav, share + confirmed clear, no dead end. No coverage floor lowered, no
  test weakened.
- **Env note:** the gradle **wrapper** dist download is proxy-blocked (403 on services.gradle.org→github);
  use the pre-installed `/opt/gradle/bin/gradle` (8.14.3, compatible with AGP 8.7.3). See NOTES §Gradle.
- **Next:** the chat media view that consumes the `MediaAutoDownloadDecider` (auto-DL trigger + manual-download
  affordance for SKIP_POLICY); in-place crop/resize/compress before avatar/banner upload (§K); or the §L
  static screens (Help/ToS/Privacy/licenses/About).

### 2026-07-12 — slice `media-auto-download-decider` ✅ impl + reviewer PASS + MERGED
- **Branch:** `claude/apps/android/media-auto-download-decider` (off latest `main`).
- **What:** feature-parity §L — the live `ConnectivityManager` network monitor + the first consumer of
  `MediaDownloadPolicyEngine`. Closes the NB the `settings-media-auto-download` slice left open.
- **Added (production):**
  - `:core:model` `MediaAutoDownload.kt` — `MediaKindClassifier.fromMimeType(mime, isAudioTranslation) →
    MediaKind?` (defensive MIME parse: strip `;`-param, trim, case-fold; image/video/audio→kind, else `null`);
    `MediaAvailability` (AVAILABLE/DOWNLOADING/NEEDS_DOWNLOAD); `AutoDownloadDecision`
    (DOWNLOAD/SKIP_UNSUPPORTED/SKIP_ALREADY_AVAILABLE/SKIP_IN_FLIGHT/SKIP_POLICY + `shouldDownload`);
    `MediaAutoDownloadDecider.decide(…)` (the availability-gated wrapper over the policy engine) + `decideFor(…)`.
  - `:sdk-core` `NetworkConditionMonitor` (interface + `InMemoryNetworkConditionMonitor` fake +
    `AndroidNetworkConditionMonitor` `ConnectivityManager` glue over `NetworkConditionResolver`, `StateFlow`);
    `SdkModule` `@Provides @Singleton` binding.
- **Tests (RED→GREEN):** +24 — `MediaKindClassifierTest` 13 (image/video/audio, translation flag routing +
  ignored-for-non-audio, case-fold, `;`-param strip, whitespace trim, null/blank/non-media/bare-token → null,
  trailing-slash boundary), `MediaAutoDownloadDeciderTest` 11 (unsupported short-circuit incl. all-availability
  sweep, already-available, in-flight, needs+allows, needs+denies, offline→SKIP_POLICY, per-kind policy read,
  `decideFor` classify-then-decide, unclassifiable→unsupported, translation-flag routes to the AT policy).
- **Verification:** `:app:assembleDebug` BUILD SUCCESSFUL; `:core:model:testDebugUnitTest` green (958 total, my
  24 pass). Full all-module run: only failure = documented DataStore flake `NotificationPreferencesStoreTest`
  (1/574 sdk-core, green in isolation in 3s, NOTES §DataStore-under-parallel-load) — this slice adds no
  DataStore store. Two-mutation RED proof: break DOWNLOADING gate + video branch → exactly 5 relevant tests
  fail; reverted.
- **Reviewer:** PASS. Diff `apps/android` only (`:core:model` new file, `:sdk-core` monitor + `SdkModule`
  binding, `feature-parity.md`). SDK purity, SSOT, UDF, no coverage floor lowered.

### 2026-07-11 — slice `settings-account-deletion` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/settings-account-deletion` (off latest `main`).
- **What:** feature-parity §L "Account deletion (typed-phrase confirmation + email-confirmation flow)" — port of
  iOS `DeleteAccountView` + `AccountService.deleteAccount`. Wires the previously no-op "Delete account" row in
  Settings → Danger zone.
- **Added (production):**
  - `:core:model` `AccountDeletionConfirmation` — the typed-phrase gate SSOT. `REQUIRED_PHRASE =
    "SUPPRIMER MON COMPTE"` is the gateway `z.literal` contract (delete-account-schemas.ts); `isConfirmed(typed)`
    is a **verbatim** match (no trim, no case-fold — a near-miss that cleared the client gate would be a
    guaranteed server `400`). The wire always carries the canonical `REQUIRED_PHRASE`, never the raw buffer.
  - `:core:model` `DeleteAccountRequest`/`DeleteAccountResponse`; `:core:network` `UserApi.deleteAccount`
    (`@HTTP(method="DELETE", path="me/delete-account", hasBody=true)` — Retrofit needs `@HTTP` to attach a body to
    a DELETE); `:sdk-core` `UserRepository.deleteAccount` (online-only `apiCall` — the gateway opens a 90-day grace
    period + mails a confirmation link, so it cannot be optimistic/offline; mirrors `changePassword`).
  - `:feature:settings` `AccountDeletionViewModel` (+ `AccountDeletionUiState`, `AccountDeletionError`) — gates the
    destructive submit behind the verbatim phrase, double-tap safe (`isDeleting` set synchronously before the
    launch), flips `isEmailSent` on success (no logout — matches iOS's email-confirmation state), maps failure →
    `409` = ALREADY_PENDING / transport = NETWORK / else GENERIC.
  - `:feature:settings` `AccountDeletionScreen` (glue, coverage-exempt) — red danger warning card (irreversible +
    5 loss bullets) + monospace confirmation field with an inline check when confirmed + gated Error-red delete
    button; swaps to a "check your inbox" (MarkEmailRead + OK-pops-back) state on success. `app`
    `Routes.DELETE_ACCOUNT` + composable + `SettingsScreen.onOpenDeleteAccount` (wired the dead danger-zone row).
  - EN/FR/ES/PT strings (18 keys ×4 locales).
- **Tests (RED→GREEN):** +18 — `AccountDeletionConfirmationTest` 8 (exact match, empty, different phrase, lowercase,
  leading/trailing whitespace, partial prefix, and the `REQUIRED_PHRASE` ⇄ gateway-literal contract pin),
  `AccountDeletionViewModelTest` 10 (initial not-confirmed, exact-phrase enables, near-miss disabled, not-confirmed
  submit inert, success flips `isEmailSent` + sends the canonical phrase, 409/network/generic mapping, edit clears
  error, in-flight double-tap guard). All 0 failures. RED-verified: the tests reference symbols absent on `main`.
- **Verification:** `:app:assembleDebug` BUILD SUCCESSFUL; new suites green (`AccountDeletionConfirmationTest` 8/8,
  `AccountDeletionViewModelTest` 10/10). The full `assembleDebug testDebugUnitTest` gate's lone red was
  `:sdk-core MediaDownloadPreferencesStoreTest.dataStore_hydrates…` (`TimeoutCancellationException` 15 s) — the
  documented DataStore-under-parallel-load flake (NOTES 2026-07-10), green on isolated `--rerun-tasks` (BUILD
  SUCCESSFUL 28 s); my `:sdk-core` change is a one-line `deleteAccount` passthrough that never touches DataStore.
- **Reviewer:** **PASS** — diff is `apps/android` only (pure `:core:model` gate SSOT + request/response models +
  interface/repo method + feature VM/screen/strings + one `app` route + the dead-row wiring); no production logic
  outside; **SDK purity** — the verbatim gate is a stateless `:core:model` building block, the online deletion is
  a low-level `:sdk-core` repo service, the "when to submit / success→email / error mapping" orchestration stays
  in the feature VM; **SSOT** — one `AccountDeletionConfirmation` drives the gate *and* the wire literal, matching
  the gateway `z.literal`, no re-implementation; **UDF** — immutable `StateFlow<UiState>` with pure derived
  `isConfirmed`/`canSubmit`; **UX coherence** — Error-red destructive affordance, natural danger-row → screen →
  back gesture, success swaps to a coherent "check inbox" state (no dead end, no surprise logout); **no coverage
  floor lowered, no existing test weakened**.

### 2026-07-11 — slice `settings-change-password` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/settings-change-password` (off latest `main`).
- **What:** feature-parity §L "Change password with strength meter + validation" — port of iOS
  `ChangePasswordView` + `PasswordStrengthIndicator`, surpassing it with the "new must differ from current"
  gate iOS lacks.
- **Added (production):**
  - `:core:model` `PasswordStrength.evaluate(password) → PasswordStrengthLevel` — the 6-band strength meter
    (length≥8, length≥12, upper, lower, digit, symbol; `min(score,5)`; empty → TOO_WEAK). Verbatim port of the
    iOS char-set/length scoring; `MAX_SCORE = 5` bars.
  - `:core:model` `ChangePasswordForm.validate(current, new, confirm) → ChangePasswordValidation` — per-rule
    flags (`isCurrentPresent`/`isNewLongEnough`/`passwordsMatch`/`isNewDifferent`) + composite `canSubmit`;
    `MIN_LENGTH = 8` matches the gateway contract.
  - `:core:model` `ChangePasswordRequest`/`ChangePasswordResponse`; `:core:network` `UserApi.changePassword`
    (`PATCH /users/me/password`); `:sdk-core` `UserRepository.changePassword` (online-only `apiCall` — the
    gateway verifies the current password against the stored bcrypt hash, so it cannot be optimistic/offline).
  - `:feature:settings` `ChangePasswordViewModel` (+ `ChangePasswordUiState`, `ChangePasswordError`) — derives
    the live strength + validation off the pure SSOTs, submits with a synchronous double-tap guard, clears the
    plaintext buffers on success, maps failure → HTTP 400 = INCORRECT_CURRENT / transport = NETWORK / else GENERIC.
  - `:feature:settings` `ChangePasswordScreen` (glue, coverage-exempt) — per-field visibility toggles, 5-bar
    accent-coherent strength meter, per-rule hint rows, gated submit; reached via a new "Change password" row in
    Settings → Privacy. `app` `Routes.CHANGE_PASSWORD` + composable + `SettingsScreen.onOpenChangePassword`.
  - EN/FR/ES/PT strings (22 keys ×4 locales).
- **Tests (RED→GREEN):** +32 — `PasswordStrengthTest` 14 (each band boundary + each char-class contribution +
  cap + hyphen/bracket-as-symbol + space-not-symbol + ordinal scores), `ChangePasswordFormTest` 9 (each rule +
  MIN_LENGTH boundary + differ-gate + empty-new inert), `ChangePasswordViewModelTest` 9 (buffer→strength,
  validation, invalid-submit inert, success clears buffers, 400/network/generic mapping, edit clears error,
  in-flight double-tap guard). All 0 failures. RED-verified: the tests reference symbols absent on `main`
  (compile-RED).
- **Verification:** `:app:assembleDebug` BUILD SUCCESSFUL; `:core:model` + `:feature:settings` + `:core:network`
  + `:sdk-core` `testDebugUnitTest` green (the lone `:sdk-core ThemeStoreTest.dataStore_setThemeMode_…` failure
  under the parallel run is the known DataStore IO-contention flake — NOTES.md 2026-07-05/06; my diff never
  touches `:sdk-core`; green on isolated `--rerun-tasks`). `UserRepositoryTest` (4/4) confirms the new
  `UserApi.changePassword` interface method broke no existing fake (it's a relaxed mockk).
- **Reviewer:** **PASS** — diff is `apps/android` only (2 pure `:core:model` SSOTs + interface/repo method +
  feature VM/screen/strings + one `app` route); **SDK purity** — strength/validation are stateless building
  blocks in `:core:model`, the online change-password is a low-level repo service, the "when to submit / how to
  map errors" orchestration stays in the feature VM; **SSOT** — one `PasswordStrength` + one `ChangePasswordForm`
  reused by VM & screen, the request mirrors the gateway Zod contract; **UDF** — immutable `StateFlow<UiState>`
  with pure derived `strength`/`validation`/`canSubmit`; **UX coherence** — accent-coherent meter (Indigo submit,
  semantic Success/Warning/Error), natural row→screen→back gesture, no dead end (success pops back), plaintext
  never retained; **no coverage floor lowered, no existing test weakened**.

### 2026-07-09 — slice `chat-bubble-audio` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/chat-bubble-audio` (off latest `main`, `#1776` gateway realtime merged).
- **What:** audio (voice-message) message-bubble attachment (`feature-parity.md` §C line ~533, the
  `carousel / audio / location / contact pending` list — **audio now done**). Port of iOS `AudioPlayerView`
  message-bubble context, surpassing it on the Prisme Linguistique (iOS defaults the transcription to `orig`
  and requires a manual language pick; Android resolves the preferred-language transcription at build time).
- **Added (production):**
  - `BubbleAudio` (`:sdk-ui` `BubbleContent.kt`) — `attachmentId`, nullable `url`, `durationSeconds`,
    `sizeBytes`, `transcriptionText`/`transcriptionLanguage`/`isTranscriptionTranslated`; pure getters
    `isPlayable` (non-blank url), `hasTranscription` (non-blank text), `formattedDuration` (`m:ss`, iOS
    `%d:%02d`; null on unknown/negative). `BubbleContent.audios: List<BubbleAudio>`.
  - `BubbleContentBuilder` — `isAudio` (mime `audio/…`), an `audios` bucket, and `files` now excludes audio
    so a voice message is no longer mis-bucketed as a generic file. `buildAudio` resolves the URL via
    `mediaBaseUrl`, the duration (`attachment.duration` → fallback `transcription.durationMs/1000`), and the
    transcription via the pure `resolveTranscription`: Prisme rule 1 — per preferred language in order the
    original wins if already in that language, else a non-blank `translations[lang].transcription`
    (case-insensitive key); no match → the **original** transcription (never an arbitrary one); null when no
    non-blank transcription exists. `transcribedText` is preferred over the raw `text` field.
  - `MessageBubble` — exempt `AudioBubble` composable (play/download glyph + `formattedDuration`-or-size +
    transcription line, all on accent-coherent `onColor`), rendered from `content.audios`; taps a playable
    clip via `onAudioClick`. `hasAttachments` includes audios (emoji-only treatment correctly suppressed).
  - `ChatScreen` — `onAudioClick` hands `audio.url` to `LocalUriHandler` (mirrors the location wiring).
  - Strings `bubble_audio_play` in en/fr/es/pt.
- **Tests (+25, RED-verified):** the audio-projection builder tests fail before the `buildAudio` change
  (empty `audios`); `formattedDuration` tests are pure-getter behaviour.
  - `BubbleAudioTest` 12 — duration 0→`0:00` / 5→`0:05` / 65→`1:05` / 3661→`61:01` / null / negative;
    `isPlayable` url/null/blank; `hasTranscription` present/blank/null.
  - `BubbleContentBuilderTest` +13 — audio→bubble-audio-not-file; duration fallback to transcription;
    already-preferred→untranslated; preferred translation wins over original; case-insensitive key match;
    no preferred match→original untranslated; blank translation skipped→original; no transcription→null;
    blank original + no usable translation→null; `transcribedText` preferred; deleted hides audio;
    audio disables emoji-only; no file url→null url still surfaced.
- **Edge cases covered:** empty/single audio; unknown & negative duration; blank/null/missing url;
  blank/null/missing transcription; case-insensitive translation keys; deleted tombstone; original-language
  passthrough vs preferred-language translation; duration source fallback.
- **Verify:** `:sdk-ui:testDebugUnitTest --tests me.meeshy.ui.component.bubble.*` → BUILD SUCCESSFUL
  (`BubbleAudioTest` 12/0/0, `BubbleContentBuilderTest` 77/0/0); full `assembleDebug` + all-module
  `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3 at `/opt/gradle`; the wrapper is 403-blocked
  in this container).
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API (`BubbleContentBuilder.build`
  with `preferences` + the `BubbleAudio` getters), no tautologies, boundary coverage on
  unknown/negative/blank/deleted/case-insensitive/fallback; SDK-purity — the projection + Prisme resolution
  is a stateless `:sdk-ui` building block (same layer as location/image), the player is exempt Compose glue,
  the "when to open the URL" wiring is the app-side `ChatScreen`; SSOT — language order via `LanguageResolver
  .preferredContentLanguages`; accent-coherent `onColor`; natural tap gesture, no dead end (tap plays the
  clip; the transcription reads inline).
- **Lesson:** a `` `audio/*` `` inside a KDoc opens a nested block comment (`/*`) that swallows the file to
  EOF → "Unclosed comment" is reported **only in files that reference the broken symbols**, never in the
  broken file itself. Cost ~4 build cycles chasing a phantom cascade. Avoid `/*`/`*/` in KDoc backticks.

### 2026-07-09 — slice `chat-bubble-location` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/chat-bubble-location` (off latest `main`, `#1769` story-reply-preview merged).
- **What:** location message-bubble attachment at iOS parity (`feature-parity.md` §C line ~533, the
  `carousel / audio / location / contact pending` list — **location now done**). Port of iOS
  `BubbleAttachmentView.location` / `LocationMessageView`. A message attachment with mime
  `application/x-location` was previously dropped into the generic **file** bucket (an "attachment" row with
  no name); now it becomes a first-class location preview.
- **Added (production, all `:sdk-ui`):**
  - `BubbleLocation` value type (`BubbleContent.kt`) — pure: `attachmentId`, nullable `latitude`/`longitude`,
    `placeName`; computed `hasCoordinates` and a **locale-safe** `geoUri` (`geo:lat,lon?q=lat,lon(label)`;
    `Double.toString()` is always dot-decimal so the URI is correct even under a comma-decimal locale; a
    blank `placeName` drops the `(label)` suffix). `BubbleContent.locations: List<BubbleLocation>`.
  - `BubbleContentBuilder`: new `isLocation` (mime `== application/x-location`) — location attachments are
    projected into `locations` and **excluded** from the file bucket (`filterNot { isImage || isLocation }`);
    `placeName ← originalName` (blank→null), coords passed through (nullable), suppressed on a deleted message
    (mirrors images/files). Emoji-only treatment already off when any attachment is present.
  - `MessageBubble`: `LocationPreview` composable (pin glyph + place name / "Shared location" fallback +
    coordinate line when present) + `onLocationClick` callback (gated on `hasCoordinates`); `hasAttachments`
    now includes locations so a caption-less location bubble doesn't render an empty text slot. EN/FR/ES/PT
    strings (`bubble_location_shared`, `bubble_location_open`).
  - `:feature:chat` `ChatScreen` wires `onLocationClick` → `LocalUriHandler.openUri(geoUri)` (wrapped in
    `runCatching` — no crash if no maps app handles `geo:`), so the tap opens the point in the device maps app
    (no dead end). This is the app-side product-orchestration half; the projection/render stays in `:sdk-ui`.
- **Tests (+16, RED→GREEN):**
  - `BubbleLocationTest` (9): `hasCoordinates` both-present / missing-lat / missing-lon; `geoUri` with
    label / without label / blank-label→no-suffix / trimmed-label / no-coords→null / **FRANCE-locale still
    dot-decimal**.
  - `BubbleContentBuilderTest` (+7 → 64): location→`BubbleLocation` not a file; blank `originalName`→null
    `placeName`; location without coords still surfaced (not a file); image+file+location each in its own
    bucket; deleted message hides its location; location disables emoji-only; no-location→empty list.
- **Edge cases covered:** missing one/both coordinates (placeholder path), blank/whitespace place name,
  deleted-suppress, mixed attachment kinds partitioned, locale-dependent decimal formatting, no-maps-app tap
  (graceful `runCatching`).
- **Verify:** `:sdk-ui:testDebugUnitTest` → 9/9 + 64/64 (BUILD SUCCESSFUL 4m38s). Full
  `assembleDebug + testDebugUnitTest` (all modules) → BUILD SUCCESSFUL (5m16s). `:app:assembleDebug +
  :feature:chat:testDebugUnitTest` (covers the `ChatScreen` wiring) → BUILD SUCCESSFUL, chat 133/133.
  (system Gradle 8.14.3 at `/opt/gradle`; wrapper download 403-blocked in this container.)
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API (`BubbleContentBuilder.build`
  producing `locations`, `BubbleLocation.geoUri`/`hasCoordinates`), no tautologies, boundary coverage on
  missing coords / blank name / deleted / locale / mixed buckets; SDK-purity — the "detect + project a
  location" derivation is a pure `:sdk-ui` building block (same layer as image/file projection), the "when
  tapped, open the OS maps app" decision is the `:feature:chat` `ChatScreen` (app-side orchestration), the
  preview composable is exempt Compose glue; SSOT — reuses the existing attachment-partition pattern; UDF
  immutable content; accent-coherent (`onColor`-tinted card); natural tap→maps gesture; no dead end.

### 2026-07-09 — slice `chat-story-reply-preview` ✅ impl + reviewer PASS · ✅ merged (PR #1769)
- **⚠ Merge status:** PR #1769 open. CI is red **only** because the monorepo's Python jobs (`TTS/STT Integration`,
  `Audio Pipeline Tests`, `Test Python (translator)`) hit repeated `503 Service Unavailable` from
  `download.pytorch.org` while `uv` fetches torch-family wheels (`matplotlib-inline`, `lazy-loader`) — a
  pytorch.org package-mirror outage, entirely external and unrelated to this **apps/android-only** Kotlin diff.
  All JS/TS checks are green (`Quality (bun)`, `Security`, `Test web/gateway/shared/agent`, `Prisma`), and the
  **real Android gate is green locally** (`assembleDebug` + all `testDebugUnitTest`). `rerun_failed_jobs` is 403
  for this integration; an empty re-trigger commit hit the same mirror outage. Do NOT merge past red — merge once
  pytorch.org recovers (re-trigger with an empty commit or a rebase on `main`), CI is green, and the diff is still
  apps/android-only.
- **Rule #0 first:** the open PRs (#1768 web/gateway realtime, #1767 ios-calls, #1765 gateway-delivery,
  #1764 web-calls) are all **other sessions'** branches touching production logic — not Android, not mine to
  merge. No open Android PR. Branched clean off latest `origin/main` (`4c7f071`, "fix(gateway/calls)… #1766").
- **Parity:** §C "Quoted-reply previews incl. story-reply previews (counts, thumbnails)" — the last pending
  half (feature-parity.md was `[~]` "Pending: story-reply previews (counts/thumbnails via `APIPostReplyTarget`)").
  Investigated iOS first: `APIMessage` decodes `postReplyTo` (legacy `storyReplyTo`) into `APIPostReplyTarget`
  (id/type/reaction·comment·shareCount/createdAt/thumbnailUrl/previewText/moodEmoji) and, in `toMessage`,
  projects it to a `ReplyReference` — a **mood** branch (`moodEmoji` set → emoji + previewText) and a **story**
  branch (title "Story" + counts + thumbnail), plus a bare `storyReplyToId` → metadata-less story. Android's
  `ApiMessage` dropped all of it, so a reply to a story/status rendered nothing.
- **Core (`:core:model`):** new `ApiPostReplyTarget` DTO (all counts default 0 for wire-robustness; `previewText`
  defaults ""). Wired `postReplyTo: ApiPostReplyTarget?` (with `@JsonNames("storyReplyTo")` for the legacy key —
  first `@JsonNames` use in the module, `@OptIn(ExperimentalSerializationApi::class)`) + `storyReplyToId: String?`
  onto `ApiMessage`.
- **Projection (`:sdk-ui`, same stateless-building-block layer as `isForwarded`/`ReplyMediaKind`):** new
  `BubbleStoryReply` value (previewText, reaction/comment/shareCount, thumbnailUrl, moodEmoji; derived `isMood`
  = moodEmoji != null, `hasMetrics` = any count > 0). `BubbleContentBuilder` derives `storyReply` via
  `buildStoryReply`: **precedence** — a message `replyTo` wins (→ null), a **deleted** tombstone → null (mirrors
  the `pinnedAtIso`/`isForwarded` suppress rule); else a non-blank trimmed `moodEmoji` → mood preview (no metrics/
  thumbnail), else a story preview (counts + `thumbnailUrl` run through the shared `resolveMediaUrl`, a blank
  thumbnail dropped), else a bare non-blank `storyReplyToId` → empty `BubbleStoryReply()`, else null.
- **Render (`:sdk-ui`, exempt Compose glue):** new `StoryReplyPreview` composable — mood shows emoji + preview
  text; story shows a `PhotoCamera` glyph + "Story" label + 32dp accent-clipped `AsyncImage` thumbnail + a
  metric row (`Favorite`/`ChatBubble`/`Share` icon + count, each rendered only when > 0, with an accessibility
  `contentDescription`). Wired into `MessageBubble` right after the message reply-preview slot (mutually
  exclusive by the builder's precedence). EN/FR/ES/PT strings (`bubble_reply_story` + 3 metric plurals).
- **Tests (TDD red→green, `:sdk-ui` via public `BubbleContentBuilder.build`):** +11 in `BubbleContentBuilderTest`
  (57 total, was 46) — no-post-reply→null, story-snapshot projects metrics+resolved-thumbnail, story-no-engagement→
  !hasMetrics+null-thumb, absolute-thumb-unchanged, blank-thumb-dropped, mood projects emoji+text+!hasMetrics+null-thumb,
  blank-mood-emoji→falls-back-to-story, bare-storyReplyToId→metadata-less, blank-storyReplyToId→null,
  message-reply-precedence-over-post-reply, deleted-message→null.
- **RED verified:** forcing `storyReply = null` in the builder fails exactly the 6 positive-projection tests
  (the 5 null-expecting ones stay green) — the tests exercise the real branch, not a tautology.
- **Verify:** `:core:model:testDebugUnitTest` + `:sdk-ui:testDebugUnitTest` green; full `assembleDebug`
  + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3 at `/opt/gradle`; wrapper download
  403-blocked in this container, so `meeshy.sh check` — which uses the wrapper — can't run here).
- **Reviewer:** PASS — diff `apps/android` only (no web/ios/gateway/shared/translator); behaviour-through-public-API
  `BubbleContentBuilder.build`, no tautologies (RED-verified), boundary coverage (mood vs story, blank/absolute
  thumbnail, blank-emoji fallback, bare/blank story id, message-reply precedence, deleted-suppress); **SDK-purity** —
  the "is this a mood or a story, which metrics/thumbnail" derivation is a pure `:sdk-ui` building block, the DTO
  is `:core:model`, the preview strip is exempt Compose glue; **SSOT** — reuses `resolveMediaUrl`, one story-reply
  model; **UDF** immutable fields; **accent-coherent** thumbnail clip + icon/label tint; natural read-only preview,
  no dead end (the story reply now reads with its counts + thumbnail).

### 2026-07-09 — slice `conversations-purge-on-removed` ✅ impl + reviewer PASS
- **Rule #0 first:** the only open PR (#1758) is an **iOS** camera/composer PR by another author — not Android,
  not mine. No open Android PR for my branch. Branched clean off latest `origin/main` (`9b4102b2`, "fix(gateway/
  mentions)… #1757").
- **Parity:** §B real-time conversation handling. Investigated first: `MessageSocketManager` **declares and
  listens** to `conversation:deleted` (`conversationDeleted`) and `conversation:participant-left`
  (`participantLeft`) but **nothing consumed them** (`grep` for consumers outside `sdk-core/src/main` + `/test`
  → empty). So a conversation deleted for everyone, or left by the current user, lingered in the Android list,
  and — the tracked follow-up from `chat-star-toggle` — its bookmarked messages **dangled forever**
  (`StarredMessagesStore.removeConversation` existed + was unit-tested but had no caller).
- **Pure core (TDD red→green, `:feature:conversations`):** `ConversationPurge` SSOT decides which removal an
  event owns. `onConversationDeleted(event) → String?` = the id, blank id → null (inert).
  `onParticipantLeft(event, currentUserId) → String?` = the id **only when `currentUserId` is non-blank AND
  equals `event.userId` AND the conversation id is non-blank** — a third party leaving, an unknown/blank
  current user, or a blank id is inert. Kept store/repo-free so the decision is fully JVM-testable.
- **Wiring (`ConversationListViewModel`):** injects the `@Singleton` `StarredMessagesStore` (shared with
  `ChatViewModel`), adds two socket collectors that route each event through `ConversationPurge` → `purge(id)`.
  `purge` runs `starredStore.removeConversation(id)` **first + synchronously** (local-only — a bookmark can't
  outlive its conversation even if the refresh fails) then launches `repository.refresh()` to drop the vanished
  row; a failed background refresh is **swallowed silently** (SWR keeps the last good cache, no error banner),
  `CancellationException` rethrown.
- **Tests (TDD, +12):** `ConversationPurgeTest` (7, through the public object): deleted-id / blank-delete-inert /
  self-left→id / other-participant-inert / null-current-user-inert / blank-current-user-inert /
  self-left-blank-conv-inert. `ConversationListViewModelTest` (+5, behaviour through the VM + a real
  `InMemoryStarredMessagesStore`): a deleted conversation sheds only its own stars + refreshes; a blank delete
  touches neither stars nor network; the current user leaving sheds its stars + refreshes; another participant
  leaving leaves my stars + list untouched (no refresh); the star cleanup survives a **throwing** `refresh()`
  with no crash and no surfaced error. The `socketManager()` test helper now stubs the two new flows
  (non-relaxed mockk) and `session(userId)` builds a `MeeshyUser` so the self-left path is drivable.
- **Verify:** `:feature:conversations:testDebugUnitTest` → BUILD SUCCESSFUL (all VM + pure tests green);
  `:app:assembleDebug` → BUILD SUCCESSFUL (Hilt resolves the new `StarredMessagesStore` ctor dependency).
  System Gradle 8.14.3 at `/opt/gradle` (wrapper download 403-blocked in this container).
- **Reviewer:** PASS — diff `apps/android` only (no web/ios/gateway/shared/translator); behaviour-through-
  public-API (`ConversationPurge` object + VM collectors observed via the store/state), no tautologies,
  boundary coverage on blank ids / self-vs-other leaver / unknown-user / failing-refresh; **SDK-purity** — the
  "which removal do I own" decision is a pure `:feature:conversations` atom, the durable store stays in
  `:sdk-core`, the socket collectors are thin VM glue; **SSOT** — reuses the existing `StarredMessages.
  removeConversation` + `MessageSocketManager` streams, no re-implementation; **instant-app** — star cleanup is
  synchronous/local, refresh is silent SWR; **UDF** immutable state, `viewModelScope` work is cancellation-safe;
  **UX coherence** — a vanished conversation now leaves no dangling bookmark and drops from the list live, no
  dead end.

### 2026-07-09 — slice `chat-reply-preview-media` ✅ impl + reviewer PASS
- **Rule #0 first:** two open PRs (#1750 gateway-delivery, #1751 ios-calls) but both are **other sessions'**
  branches touching production logic — **not** Android, not mine to merge. No open Android PR for my branch.
  Branched clean off latest `origin/main` (`1142cc58`, "feat(android/chat): starred-messages list screen #1749").
- **Parity:** §C "Quoted-reply previews incl. story-reply previews (counts, thumbnails)" (feature-parity.md,
  still `[ ]`). Investigated first: iOS `APIMessageReplyTo` carries `attachments`, but Android's wired
  `ApiMessageReplyPreview` dropped them (a slim `id`/`content`/`senderDisplayName`/`deletedAt` DTO), so a
  reply to a **photo/file-only** message rendered a **blank** quote. A richer-but-**dead** duplicate
  `ApiMessageReplyTo` (with `attachments`) existed unused — the classic two-models-one-concept wart.
- **Change:** added `attachments: List<ApiMessageAttachment>? = null` to the **wired** `ApiMessageReplyPreview`
  (`:core:model`), removed the dead `ApiMessageReplyTo` (SSOT — one reply-preview model). `BubbleContentBuilder`
  (`:sdk-ui`, same stateless-building-block layer as `isEdited`/`isForwarded`) derives two new `BubbleContent`
  fields: `replyToMediaKind` (`ReplyMediaKind` None|Image|File — `firstOrNull { isImage }` wins, else any
  attachment → File, else None) and `replyToThumbnailUrl` (image `thumbnailUrl` ?: `fileUrl`, run through the
  shared `resolveMediaUrl`; **a deleted reply target suppresses both**, mirroring the existing content-suppress).
  `MessageBubble`'s `ReplyPreview` (exempt Compose glue) shows a 32dp accent-clipped `AsyncImage` thumbnail when
  present, else a media icon + a localized "Photo"/"Attachment" placeholder when the quoted message is
  media-only (blank content); a text reply is unchanged. EN/FR/ES/PT strings (`bubble_reply_photo`,
  `bubble_reply_attachment`).
- **Tests (TDD red→green, `:sdk-ui` through public `BubbleContentBuilder.build`):** +9 in
  `BubbleContentBuilderTest` (46 total, 0 fail) — text-only→None/no-thumb, image→Image+resolved-thumbnail,
  image-no-thumbnail→fileUrl-fallback, image-no-urls→Image+null-thumb, non-image→File+no-thumb,
  file+image-any-order→prefers-image-thumb, deleted-target→suppressed, no-reply→None, absolute-url→unchanged.
- **Verify:** `assembleDebug testDebugUnitTest` (all modules) → BUILD SUCCESSFUL (system Gradle 8.14.3;
  wrapper 403-blocked in container — `/opt/gradle`). `BubbleContentBuilderTest` 46/0.
- **Reviewer:** PASS — diff `apps/android` only (no web/ios/gateway/shared); behaviour-through-public-API
  `BubbleContentBuilder.build`, no tautologies, boundary coverage (all 3 media kinds + thumbnail-fallback
  chain + deleted-suppress + no-reply + absolute-vs-relative url); **SDK-purity** — the "is this reply media,
  which thumbnail" derivation is a pure `:sdk-ui` building block, the DTO field is `:core:model`, the thumbnail
  strip is exempt Compose glue; **SSOT** — one reply-preview model (dead duplicate removed), reuses
  `resolveMediaUrl`/`isImage`; **instant-app** thumbnail via Coil `AsyncImage` (cache-first); **UDF** immutable
  fields; **accent-coherent** thumbnail clip + icon tint; **no dead end** — a media reply now reads, the tap
  still jumps to the original.

### 2026-07-09 — slice `chat-star-toggle` ✅ impl + reviewer PASS
- **Rule #0 first:** no open Android PR (`list_pull_requests state=open` → `[]`). Branched clean off latest
  `origin/main` (`236f8ca6`, "fix(web/mentions)…iter 151").
- **Parity:** §C "Pin/unpin message; **starred/bookmarked messages list**…" — the pending half. Investigated
  first: the gateway has **no** message-star endpoint (only `PostBookmark` for feed posts) and iOS'
  `StarredMessagesStore` is explicitly **local-only** (UserDefaults). So Android matches iOS: durable
  local-only starring, no network. This slice ships the star/unstar **action + persistence + in-bubble
  indicator**; the dedicated list screen is the next slice (mirrors how pins shipped incrementally).
- **Pure core (TDD, `:core:model`):** `StarredMessage` (frozen snapshot: messageId, conversationId,
  conversationName/accent, senderName, contentPreview, `StarredAttachmentKind?` image/file, `starredAtMillis`,
  `sentAtIso` — port of iOS `StarredMessageSnapshot`, epoch-millis for parse-free ordering) + `StarredMessages`
  value object (SSOT for membership/order: `star`/`unstar`/`toggle`/`isStarred`/`removeConversation` +
  `sortedByStarredAtDesc`; every mutator returns the **same instance** when unchanged so persistence skips
  redundant writes; blank-id star inert; idempotent star keeps the first snapshot; `ids` computed once).
  +16 tests (`StarredMessagesTest`: empty, star/keep-snapshot, others-unstarred, idempotent-same-instance+
  keep-first, blank-id-noop, accumulate, unstar-removes, unstar-absent-same-instance, toggle both ways,
  toggle-ignores-snapshot-on-unstar, sort-desc, sort-stable-ties, sort-empty, removeConversation-selective,
  removeConversation-none-same-instance).
- **Durable store (`:sdk-core`):** `StarredMessagesStore` (interface + `InMemory` + `SharedPrefsStarred…`)
  mirrors `LocallyHiddenMessagesStore` — SharedPrefs JSON list under one key, **synchronous hydrated
  `StateFlow`** (cache-first; combines cheaply into the message stream), corrupt blob → empty set, redundant
  writes skipped on the value object's referential check. DI provider in `SdkModule` (`json` injected). +8
  tests (`SharedPrefsStarredMessagesStoreTest`, Robolectric: fresh-empty, toggle-stars, toggle-twice-unstars,
  survives-fresh-construction, unstar-removes, removeConversation-selective, corrupt-blob→empty,
  idempotent-no-op-same-flow-value).
- **Wiring (`:feature:chat`):** `ChatViewModel.toggleStar` snapshots the bubble (conversation metadata from
  state, `StarredAttachmentKind` image>file, `clock.nowMillis()`) and delegates to `starredStore.toggle`
  (local-only, no viewModelScope — mirrors `deleteForMe`); inert on deleted/unknown (only the sheet closes).
  `starredStore.starred.ids` combined into the message flow → each `BubbleContent.isStarred` set live.
  `MessageBubble` renders a subtle accent bookmark glyph in the meta row of a starred bubble; the long-press
  `MessageActionsSheet` gains a Star/Unstar row (filled vs outline bookmark, gated on an actionable bubble).
  EN/FR/ES/PT strings (`chat_action_star`/`_unstar`, `bubble_starred`). +7 `ChatViewModelTest` (stars+snapshot+
  closes, unstars-on-second-toggle, reflected-on-bubble, inert-deleted-closes-sheet, inert-unknown).
- **Verify:** `assembleDebug` + all-module `testDebugUnitTest` → BUILD SUCCESSFUL (system Gradle 8.14.3;
  wrapper 403-blocked in container — `/opt/gradle`). `StarredMessagesTest` 16/0/0.
- **Reviewer:** PASS — diff `apps/android` only (no web/ios/gateway/shared); behaviour-through-public-API
  (`StarredMessages.*` / store / `toggleStar`), no tautologies, boundary coverage (empty/blank-id/idempotent/
  same-instance/deleted/unknown/corrupt/ties); **SDK-purity** honoured — membership/order rule is a pure
  `:core:model` atom, durability is `:sdk-core`, the "when to star / snapshot shape" product wiring is the
  `:feature:chat` VM, sheet+glyph are exempt Compose glue; **SSOT** — one star predicate shared by store and
  bubble; **instant-app** synchronous hydrated flow → optimistic in-bubble indicator; **UDF** immutable state;
  accent-coherent glyph; natural long-press gesture reusing the pin idiom; **no dead end** — starring is
  immediately visible on the bubble (the list screen is the tracked next slice).

### 2026-07-08 — slice `chat-forward-message` ✅ impl + reviewer PASS
- **Rule #0 first:** no open Android PR (`list_pull_requests state=open` → `[]`). `main` had been
  **force-updated** (`7f46adb2…→1f82a0d5`); branched clean off `origin/main` and verified a recent symbol
  (`PinnedMessages.kt`) present before coding.
- **Parity:** §C "…reply, forward" — the last missing verb (forward). iOS `ForwardPickerSheet` lets the user
  pick a target conversation and re-sends the message carrying `forwardedFromId`/`forwardedFromConversationId`;
  Android had nothing.
- **Pure core (TDD, `:feature:chat`):** `ForwardTargets.of(conversations, sourceConversationId, query,
  currentUserId) → List<ForwardTarget>` — port of iOS `filteredConversations`: the source conversation is
  never a target; a blank/whitespace query keeps every other conversation; a non-blank query is trimmed then
  matched case-insensitively against the **resolved `displayTitle`** (what the user sees — the other
  participant for a DM); input order preserved; each target carries the deterministic `accentHex` and a
  blank-avatar→null projection. +11 tests (`ForwardTargetsTest`: empty, source-only, all-except-source,
  whitespace-blank, case-insensitive match, trim-before-match, no-match, order-preserved, DM-title-resolves+
  searchable, blank-avatar→null/present-carried, accent+memberCount+type projection).
- **Model (`:core:model`):** `SendMessageRequest` and `ApiMessage` gained nullable `forwardedFromId` /
  `forwardedFromConversationId` (mirrors the gateway `SendMessageBodySchema`; no DB migration — `ApiMessage`
  serializes into the JSON payload column, lenient decode tolerates older rows).
- **Repository (`:sdk-core`):** `MessageRepository.sendOptimistic` gained the two forward params (default null)
  — set on both the optimistic bubble and the queued `SendMessageRequest`; `retrySend` rebuilds them from the
  cached `ApiMessage` so a forward survives an outbox exhaust. The existing `SEND_MESSAGE` worker sender
  re-sends the payload verbatim → no worker change. +3 tests (`MessageRepositoryTest`: forward stamps bubble+
  request, non-forward carries none, retry preserves refs).
- **VM + state:** `ChatUiState.forward: ForwardUiState?` (null = closed) + `openForward` (dismisses the action
  sheet, paints targets cache-first), `onForwardQueryChange`, `forwardTo` (one in-flight at a time; an
  already-forwarded or unknown/unsent source is inert; only a `SYNCED` source is forwardable — an unsent
  bubble has no gateway id; optimistic send into the target + wake the flush worker; failure surfaces
  `errorMessage` and clears the sending flag), `closeForward`; a `conversationsStream()` collector feeds the
  target list live (no-op `onSyncError`, so a conversations revalidation never disturbs the chat). +7 tests
  (`ChatViewModelTest`: open-lists-except-source, query-filters, forward-sends+marks-sent+flush, already-sent
  inert, unknown-source inert, unsent-source refused, failure surfaces+clears, close-dismisses).
- **Wiring (exempt Compose glue):** `MessageActionsSheet` gains a "Forward" action (shown for an actionable
  message) → `openForward`; a `ForwardPickerSheet` `ModalBottomSheet` (search field, accent-tinted avatar
  rows, per-target Send→spinner→check state, empty state). EN/FR/ES/PT strings.
- **Verify:** `:app:assembleDebug` green; `ForwardTargetsTest` 11/11, `MessageRepositoryTest` (0 failures),
  `ChatViewModelTest` (all pass) — full `testDebugUnitTest` green except the **documented** DataStore-timeout
  flakes (`InterfaceLanguageStoreTest`, `ThemeStoreTest`) which **pass in isolation** on a warm-cache re-run
  (`--tests "*InterfaceLanguageStoreTest*" "*ThemeStoreTest*" --rerun-tasks` → BUILD SUCCESSFUL). +21 tests.
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API (`ForwardTargets.of`,
  `sendOptimistic` forward params, `openForward`/`forwardTo`), no tautologies, boundary coverage on
  source-exclusion/blank-vs-query/trim/no-match/order + unknown/unsent/already-sent/failure; SDK-purity
  honoured — "who can I forward to / how does it match" is a pure `:feature` atom, the model carrier is
  `:core:model`, the optimistic send + outbox is `:sdk-core`, the "when to forward" wiring is the VM, the
  picker is exempt Compose glue; instant-app cache-first target list; UDF immutable state; accent-coherent
  rows; natural long-press → sheet gesture; no dead end (every row forwards, checkmark confirms).

### 2026-07-08 — slice `chat-pinned-messages-sheet` ✅ impl + reviewer PASS
- **Rule #0 first:** the one open Android PR, **#1722** (`conversations-draft-aware-ordering`), was
  `mergeable_state: dirty` with **no CI run** (branched off a pre-pin `main`). Investigation showed it is
  **fully superseded**: `DraftAwareOrdering.kt` and `sdk-core/ConversationDraftStore.kt` on `main` are
  byte-identical to the branch, and `main` additionally carries `discardDraft` + `DraftDiscard.kt` (a later
  slice). Merging it would have *removed* `discardDraft` — a regression — so it was **closed as superseded**
  (comment + close), not merged. No content lost; `main` left green.
- **Parity:** §C "Pin/unpin message" — the pinned-messages **list sheet** (the banner shows one at a time;
  the sheet lists every pin, tap-to-jump). iOS parity; Android had only the single-pin banner.
- **Pure core (TDD, `:feature:chat`):** `PinnedMessagesList.of(messages) → List<PinnedMessageRow>` — every
  non-deleted, non-blank-`pinnedAt` message, ordered newest-pin first (`sortedByDescending` on parsed epoch;
  **stable** so equal instants keep list order and an unparseable instant sinks to the end via `Long.MIN_VALUE`).
  Refactor unifies the SSOT: `PinnedMessages.of` (banner) now = `list.firstOrNull()` featured + `list.size`
  count, reusing one shared `toRow()`/`snippet()` (trimmed text › Image › File › Empty; blank sender → null).
  The old `maxByStable` is gone — `sortedByDescending(...).first()` is provably equal (stable sort keeps the
  first max-key element). Existing `PinnedMessagesTest` (banner) stayed green, proving behaviour preserved.
  +14 tests (`PinnedMessagesListTest`: empty, no-pin, blank-pin, deleted-excluded, single-field-map, newest-
  first order, stable ties, unparseable-sinks, text>media, image>file, file-only, empty-preview, blank-sender
  →null, banner==first+size cross-check).
- **VM + state:** `ChatUiState.pinnedMessages` (derived) + `isPinnedSheetOpen`; `openPinnedSheet` (inert when
  nothing pinned — no empty sheet), `closePinnedSheet`, `onPinnedMessageTap` (scroll-to + close; an id not
  among the pins is inert, never a crash). +6 tests (`ChatViewModelTest`: list-newest-first, open-with-pins,
  open-empty-inert, tap-row-scrolls+closes, tap-unknown-inert, close-dismisses).
- **Wiring (exempt Compose glue):** `PinnedBannerStrip` gains a trailing "see all" `IconButton` (shown only
  when `count > 1`) → `openPinnedSheet`; a new `PinnedMessagesSheet` `ModalBottomSheet` lists the rows (accent
  pin glyph, sender, snippet, tap → jump), dividers between rows, `heightIn(max = 420.dp)`. New string
  `chat_pinned_sheet_title` × en/fr/es/pt. Banner tap still jumps to the newest pin (unchanged).
- **Verify:** `:feature:chat:testDebugUnitTest` — `PinnedMessagesListTest` 14/14, `ChatViewModelTest` 111/111,
  0 failures; `:app:assembleDebug` green (system Gradle 8.14.3). +20 tests total.
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API (`PinnedMessagesList.of`,
  `openPinnedSheet`/`onPinnedMessageTap`), no tautologies, boundary coverage on empty/blank/deleted/stable-tie/
  unparseable/unknown-id/empty-sheet; SDK-purity honoured — the "which pins / how ordered / which preview"
  product decision is a pure `:feature` atom, the sheet is exempt Compose glue; **SSOT** — banner and sheet
  derive from one `PinnedMessagesList`; UDF immutable state; accent-coherent; natural tap gesture; no dead end
  (every row jumps).

### 2026-07-08 — slice `chat-pinned-banner` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/chat-pinned-banner` (off latest `origin/main`).
- **Step 0:** no open Android PR (only Dependabot PRs open); prior slice `chat-reply-count-pills`
  already merged. Branched fresh off `origin/main`.
- **Slice:** the **pinned-message banner** (Chat parity §C "Pin/unpin message …") — the read side of
  message pinning. The gateway fully supports it (`POST`/`DELETE /conversations/:id/messages/:messageId/pin`,
  `GET /pinned-messages`, socket `message:pinned`/`message:unpinned`, wire carries `pinnedAt`/`pinnedBy`),
  but Android ignored all of it. Now:
  - `:core:model` — `ApiMessage.pinnedAt`/`pinnedBy`; `MessagePinnedEvent`/`MessageUnpinnedEvent`.
  - `:sdk-core` — `MessageSocketManager` `messagePinned`/`messageUnpinned` streams (`listen("message:pinned"/…)`).
  - `:sdk-ui` — `BubbleContent.pinnedAtIso` (builder maps `message.pinnedAt`, trimmed; **null on a deleted
    message or a blank instant**).
  - `:feature:chat` — pure `PinnedMessages.of(messages) → PinnedBanner?` SSOT: filters live (non-deleted,
    non-blank `pinnedAtIso`) pins, features the **newest** by parsed instant (equal-instant & unparseable
    ties keep the earliest in list order via a stable max), carries the total `count` and a `PinnedSnippet`
    (trimmed text › Image › File › Empty). `ChatUiState.pinnedBanner` derives it from `messages` (adapter
    `BubbleContent.toPinnable()`); `onPinnedBannerTap` scrolls to the newest pin (`scrollToMessageId`
    reuse); socket pinned/unpinned collectors `refresh(conversationId)` so any client's pin appears live.
  - `ChatScreen` — accent-tinted tappable `PinnedBannerStrip` above the list (PushPin glyph + count/title +
    sender:snippet). EN/FR/ES/PT strings.
- **Tests (+28):** `PinnedMessagesTest` 17 (empty/no-pin/blank-instant → null; single→banner; deleted
  excluded + dropped from count; newest featured + total count; equal-instant tie → earliest; unparseable
  never outranks + still counts; all-unparseable → first; image/file/image-beats-file/text-wins/empty
  snippet; text trimmed; blank-sender→null + outgoing carried). `ChatViewModelTest` +8 (banner surfaces /
  absent, tap→newest + clear, tap-inert-when-none, pinned & unpinned socket → refresh, both elsewhere →
  ignored). `BubbleContentBuilderTest` +3 (pinned instant carried, blank dropped, deleted never pinned).
- **Verification:** `:feature:chat:testDebugUnitTest` + `:sdk-ui:testDebugUnitTest` green; `:app:assembleDebug`
  green; full `testDebugUnitTest` (all modules) green (system Gradle 8.14.3, `/opt/gradle`; wrapper download
  403-blocked in this container).
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API `PinnedMessages.of`, no
  tautologies, boundary coverage on the tie/unparseable/deleted/blank/media-kind branches + both socket
  conversation arms; SDK-purity honoured (the "which pin anchors the banner / what does the preview say"
  product decision is a pure atom in `:feature:chat`; the model carrier is `:core:model`, the socket bytes
  `:sdk-core`, the strip exempt Compose glue); SSOT (parses via `isoToEpochMillisOrNull`); accent-coherent;
  natural tap-to-jump gesture; no dead end — live cross-client pins render and jump.
- **Next:** `chat-pin-toggle` — the optimistic pin/unpin **action** (long-press "Épingler"/"Retirer",
  durable outbox `PIN_MESSAGE`/`UNPIN_MESSAGE` kind + coalescer + worker sender + `MessageApi.pin/unpin`),
  then a pinned-messages list sheet.

### 2026-07-08 — slice `chat-reply-count-pills` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/chat-reply-count-pills`
- **Step 0:** verified PR #1663 (`chat-reaction-who-reacted-sheet`) is already **merged** to `main`
  (`merged: true`, merged_at 2026-07-08T10:54:40Z); no open PRs; synced local `main` to `origin/main`.
- **What:** reply-count pills (parity §C "Reply-count pills + reply thread overlay"). A message with
  quoted replies now shows an accent-tinted, bubble-side-aligned "N réponses" pill; tapping it jumps to
  the earliest reply in the thread. (iOS shows a reply-count affordance; Android's grouping is a pure SSOT.)
- **Added (production):**
  - `ReplyThreads.kt` (`:feature:chat`, pure SSOT) — `ReplyThreads.of(messages: List<ReplyLink>)` groups
    the loaded messages by their reply target into `ReplyThread(parentId, count, firstReplyId)`. A message
    counts only when it is a reply: `replyToId` is non-blank (**trimmed**), not equal to its own id (a
    self-reference is inert), and the reply itself is **not deleted** (a deleted reply never inflates the
    count). `firstReplyId` is the **earliest live reply in list order** (the jump anchor). A reply to a
    paged-out parent is still grouped under that parent id (the consumer just never reads an off-screen
    parent's thread); a parent whose every reply is deleted/absent has no thread. `threadFor(id)` /
    `size` / `EMPTY`.
  - `ReplyLink` (in `ReplyJump.kt`) gained `isDeleted: Boolean = false` (default keeps every existing
    `ReplyJumpResolver` caller working); reused so the reply projection stays a single SDK-agnostic atom.
  - `ChatViewModel.onReplyCountTap(messageId)` — builds `ReplyThreads` from the current messages, looks up
    the thread, and sets `scrollToMessageId = thread.firstReplyId` (reuses the existing reply-jump scroll
    plumbing + `onScrollHandled`); a message with no thread is **inert** (early return, never a crash).
  - `ChatScreen` — a `remember(state.messages)` `ReplyThreads`, and a `ReplyCountPill` composable
    (accent-tinted rounded pill, `Icons.AutoMirrored.Filled.Reply` glyph + `pluralStringResource`, aligned
    to the bubble's own side) rendered under any bubble whose message has a thread; `onClick →
    onReplyCountTap`. `chat_reply_count` plural in en/fr/es/pt.
- **Tests (+16):**
  - `ReplyThreadsTest` (new, 13): empty → no threads; no-replies → none; single reply → count 1 on parent;
    several replies accumulate; earliest-in-order kept as anchor; distinct parents → distinct threads;
    self-reference ignored; blank target ignored; padded target trimmed; deleted reply excluded from count
    + anchor; parent whose only reply is deleted has no thread; reply to a paged-out parent still grouped;
    looking up a message with no replies → null.
  - `ChatViewModelTest` (+3): tapping the pill scrolls to the first reply; a no-reply message is inert;
    a parent with several replies anchors on the earliest.
- **Edge cases covered:** empty/single/many collections; self-reference (inert); blank & padded reply
  targets; deleted replies (excluded); all-replies-deleted parent (no thread); paged-out parent id;
  no-thread lookup (null); no-reply tap (inert, no scroll).
- **Verify:** `gradle :app:assembleDebug testDebugUnitTest` (system Gradle 8.14.3 — the wrapper 403s via the
  proxy) → **BUILD SUCCESSFUL** (full `assembleDebug` + every module's JVM unit tests); targeted
  `:feature:chat:testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only (feature/chat + tracking docs; no web/ios/gateway/shared);
  behaviour-through-public-API `ReplyThreads.of` + `onReplyCountTap`, no tautologies, boundary coverage on
  the trim/self/deleted/all-deleted/first-anchor branches; SDK-purity — the "how to group / count / which
  reply anchors" product decision is a pure atom in `:feature:chat`, the pill is exempt Compose glue;
  single source of truth (`scrollToMessageId` reuse, one `ReplyLink` projection); UDF + immutable `UiState`;
  accent-coherent visuals, natural tap gesture, no dead end (the pill jumps to the reply).

### 2026-07-08 — slice `conversations-section-model` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/conversations-section-model`
- **Parity:** §B "Sectioned list … pinned section". The conversation list already split into a
  Pinned section + an "All" section, but the split lived as scattered `filter { isPinned }` /
  `filterNot` glue directly inside the `ConversationListScreen` Composable — untestable, and it
  rendered a **phantom empty "Mes conversations" header** whenever every conversation was pinned
  (the `section-all` `item` had no `isNotEmpty` gate, unlike the pinned one).
- **Added (production):**
  - `ConversationSections.kt` (`:feature:conversations`, pure SSOT) — `ConversationSectionKind`
    (`PINNED` | `ALL`), `ConversationSection(kind, items)`, and `ConversationSections.of(
    conversations) → List<ConversationSection>`: partitions on `resolvedPreferences?.isPinned`,
    Pinned section first then All, each preserving the incoming (draft-floated / filtered) order,
    and **omits any empty section** (no phantom All header on an all-pinned account; no phantom
    Pinned header on a pin-free one).
  - `ConversationListScreen` — the inline `pinned`/`others` split is gone; the `LazyColumn` now
    iterates `ConversationSections.of(state.conversations)` and renders each via the existing
    `CollapsibleSection`. Three tiny private mapping helpers (`ConversationSectionKind.titleRes()`
    / `.icon()` / `.containerColor()`) keep the header visuals (Épingles → red PushPin, Mes
    conversations → indigo Chat) exactly as before. No string/resource changes.
- **Tests:** +9 `ConversationSectionsTest` — empty→no sections; no-pinned→single ALL in order;
  all-pinned→single PINNED, no phantom ALL (the wart fix); mixed→PINNED then ALL; interleaved
  input preserves each group's relative order; single pinned; single non-pinned; pin resolved from
  `userPreferences[0]`; no-preferences row treated as not pinned.
- **Edge cases covered:** empty / single each side / all-pinned / pin-free / interleaving order;
  both preference sources (`preferences` optimistic override + `userPreferences`); absent prefs.
- **Verify:** `:feature:conversations:testDebugUnitTest` (`ConversationSectionsTest`) green, then full
  `assembleDebug` + `testDebugUnitTest` across all modules → **BUILD SUCCESSFUL** (system Gradle
  8.14.3; wrapper download 403-blocked in this container — used `/opt/gradle` directly).
- **Reviewer:** PASS — diff `apps/android` only (only `:feature:conversations`); behaviour through
  the public `ConversationSections.of` API, no tautologies, near-total branch coverage on both
  partition arms + both empty-omission branches + order preservation; SDK-purity honoured (the
  "how the list sections" product decision is a pure atom in `:feature:conversations`; the render is
  exempt Compose glue); single source of truth (the split no longer duplicated in the Composable);
  UDF preserved; accent-coherent headers unchanged; no dead code (the reducer + three helpers are
  all consumed by the screen; the wart-fix is user-visible).

### 2026-07-08 — slice `conversations-draft-discard` ✅ impl + reviewer PASS
- **Branch:** `claude/apps/android/conversations-draft-discard`
- **Parity:** §B draft lifecycle — the conversation list floated draft-bearing rows and
  showed a "Brouillon : …" preview, but a stale/unwanted draft could only be cleared by
  reopening the conversation and deleting the text. Added a **discard-draft** affordance so a
  draft can be thrown away straight from the list, and verified the draft *mutation* round-trip
  (a draft cleared in the store re-orders the list reactively via the existing `observeAll`
  collector).
- **Added (production):**
  - `DraftDiscard.kt` (`:feature:conversations`, pure SSOT) — `isDiscardable(id, draftsById)`
    (offer the action **only** when the row holds a *meaningful* draft — the shared
    `ConversationDraft.isMeaningful` rule that also floats/previews it) + `afterDiscard(id,
    draftsById)` (removes the entry when present, returns the **same instance** when absent so a
    no-op discard never forces a recomposition; removes even a persisted non-meaningful entry).
  - `ConversationListViewModel.discardDraft(id)` — snapshot → gate on `isDiscardable` (inert
    otherwise) → optimistic `afterDiscard` + `withVisible` (row loses its preview and sinks out
    of the floated group instantly) → `draftStore.clear(id)` in `viewModelScope`
    (`CancellationException` rethrown; a failed clear rolls the optimistic removal back and
    surfaces `errorMessage`). `draftStore` promoted to a stored field.
  - `ConversationListScreen` — long-press context menu gains a **"Discard draft"** item
    (`DeleteSweep` glyph), rendered only when `draft?.isMeaningful == true`; threaded
    `onDiscardDraft` + `hasDraft` down through `ConversationRow`/`ConversationRowContent`.
    4 new strings × 4 locales (en/fr/es/pt).
- **Tests:** +8 `DraftDiscardTest` (discardable: meaningful text / reply-only armed; not
  discardable: absent / blank-non-reply; afterDiscard: removes only that entry / same-instance
  when absent / removes persisted non-meaningful / last-draft→empty) ; +4
  `ConversationListViewModelTest` (discard clears preview + sinks the row + clears the durable
  store; optimistic feedback before the store settles; inert on a non-meaningful draft — store
  untouched, no error; unknown conversation id changes nothing).
- **Edge cases covered:** empty / single / last-entry maps; absent + unknown ids (inert);
  meaningful vs blank vs reply-only; idempotent no-op discard (same instance); optimistic
  update + rollback-on-failure; cancellation-safe `viewModelScope` work.
- **UX note (deviation, justified):** iOS surfaces discard via swipe, but the list's two swipe
  directions are already committed to pin (StartToEnd) / archive (EndToStart) — the primary list
  swipes. Rather than overload a swipe, discard lives in the existing long-press context menu
  (also a natural gesture), shown contextually only for draft-bearing rows. Coherent with the
  pin/mute/archive/mark-read menu already there; no swipe-direction conflict.
- **Verify:** `:feature:conversations:testDebugUnitTest` green; full `assembleDebug` +
  `testDebugUnitTest` across modules → all green **except** the documented
  `NotificationPreferencesStoreTest.dataStore_setPreferences_isReflectedInTheFlow` DataStore
  5s-timeout flake (in `:sdk-core`, untouched by this diff), which passes on isolated re-run
  (`BUILD SUCCESSFUL in 4s`).
- **Reviewer:** PASS — diff `apps/android` (only `:feature:conversations`) only; behaviour
  through the public API, no tautologies, near-total branch coverage on the pure rule + both
  gate/rollback VM paths; SDK-purity honoured (the "when can you discard / what remains" product
  decision is a pure atom in `:feature:conversations`; the `ConversationDraftStore.clear` byte
  op stays the `:sdk-core` seam; the menu render is exempt Compose glue); single source of truth
  (`isMeaningful`); Instant-App (optimistic removal + rollback, no spinner); UDF immutable state,
  pure transitions; accent-coherent list, natural long-press gesture, no dead end (discard leaves
  a coherent, draft-free row).

### 2026-07-08 — slice `conversations-empty-state-content` ✅ impl + reviewer PASS (merged)
- **Parity:** §B "Cold-start skeletons + error-with-retry empty state". Both renders (skeleton + error+retry card)
  already existed, but the *decision* of which body region to show lived as a scattered `when` inside
  `ConversationListScreen` — untestable Composable glue, with a redundant `conversations.isEmpty() &&` guard on the
  filtered-empty and cold-empty arms (already implied by the branch order). No pure coverage of the decision.
- **Pure core (TDD):** `ConversationListContent.of(state)` (`:feature:conversations`) — a sealed SSOT
  (`Populated | Skeleton | Error(message) | FilteredEmpty | ColdEmpty`). **Cache-first (ARCHITECTURE.md §4):** a
  populated list wins first, so a stale `showSkeleton` flag **or** a background sync `errorMessage` never hides data
  already on screen (an improvement over the old screen, which tested `showSkeleton` before the list). Only an empty
  visible list falls through: `showSkeleton` → `errorMessage` (carries the message for the retry card) →
  `isFilteredEmpty` (reuses the existing derived predicate — no re-implementation) → `ColdEmpty`. +11 tests
  (`ConversationListContentTest`): data→Populated, cache-first data-over-skeleton, cache-first data-over-error,
  cold-skeleton, empty+error carries message, skeleton-over-error precedence, error-over-active-filter precedence,
  filter-narrows-to-nothing→FilteredEmpty, non-blank-search→FilteredEmpty, blank-search-on-ALL→ColdEmpty boundary,
  bare-empty→ColdEmpty.
- **Wiring:** `ConversationListScreen`'s body `when` now switches on `ConversationListContent.of(state)` and renders
  each arm (Compose glue, exempt); the redundant `conversations.isEmpty() &&` guards are gone. No VM/state-shape
  change, no new strings, no DI change.
- **Verify:** `gradle assembleDebug testDebugUnitTest` (system Gradle 8.14.3) — BUILD SUCCESSFUL (943 tasks). +11 tests.
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API, no tautologies; every branch + both
  cache-first overrides + the two precedence orderings + the blank-search boundary covered; SDK-purity honoured (the
  "which region" product decision is a pure `:feature` atom, the render stays exempt screen glue); UDF, cache-first,
  single-source (reuses `isFilteredEmpty`), no dead end.

### 2026-07-07 — slice `conversations-draft-aware-ordering` ✅ impl + reviewer PASS
- **Parity:** §B "Draft-aware ordering (drafts float to top)" + the draft row preview. iOS floats a conversation
  the user has started (unsent) composing to the top of the list and shows an accent "Draft: …" preview; Android
  ordered purely by backend recency and never surfaced the draft.
- **Pure cores (TDD):**
  - `ConversationDraft.isMeaningful` (`:core:model`) — the shared SSOT for "a draft worth surfacing/persisting"
    (non-blank text **or** an armed, non-blank reply). `DraftAutosave` (`:feature:chat`) was refactored to consume
    it in both `resolve` (the had-draft/clear branch) and `restore` (the inert-draft guard) — one definition of
    "meaningful", not three. +4 tests (`ConversationDraftTest`).
  - `DraftAwareOrdering.apply(conversations, draftsById)` (`:feature:conversations`) — floats every conversation
    whose id has a *meaningful* draft to the top, ordered by draft `updatedAt` desc (a null timestamp sorts last
    within the floated group; the sort is stable so equal/absent timestamps and every non-draft row keep their
    incoming order). Empty drafts / drafts for absent conversations are no-ops. +10 tests (`DraftAwareOrderingTest`:
    empty list, no-drafts identity, single float, relative-order preserved, updatedAt-desc, null-timestamp-last,
    stable-ties, inert-no-float, reply-only-floats, ghost-id-ignored).
  - `draftPreview(draft, labels)` (`:feature:conversations`) — the accent "Brouillon : …" row line (trimmed text),
    or the prefix + "…" for a reply-only draft, or `null` (→ falls back to `lastMessagePreview`). +4 tests.
- **Seam + wiring:** `ConversationDraftStore.observeAll(): Flow<Map<String, ConversationDraft>>` (`:sdk-core`) —
  InMemory now StateFlow-backed (reactive), DataStore maps over `data` scanning the `draft:` key prefix and omitting
  a corrupt entry. +4 tests (2 InMemory, 2 DataStore incl. corrupt-omitted). `ConversationListViewModel` injects
  the store (already in the Hilt graph — zero DI change), collects `observeAll()` into `state.drafts`, and
  `withVisible` now applies `DraftAwareOrdering` after `ConversationFilters`. `ConversationListScreen` threads the
  per-row draft and renders the accent draft preview (Compose glue, exempt). +1 VM test (draft floats to top). New
  string `conversations_preview_draft_prefix` in en/fr/es/pt.
- **Coherence:** the screen's Épingles-first split stays above the floated group → **Épinglés > brouillons > reste**,
  a coherent hierarchy; the draft preview reuses the conversation `accentColor` (no hardcoded colour).
- **Verify:** `gradle assembleDebug testDebugUnitTest` (system Gradle 8.14.3) — green. +23 tests total.
- **Reviewer:** PASS — diff `apps/android` only; behaviour-through-public-API, no tautologies; boundary coverage on
  the float/sort/meaningful branches; SDK-purity honoured (the "when to float / how to sort" product rule is a pure
  `:feature` atom, the store is a stateless `:sdk-core` seam, the model predicate is `:core:model` SSOT); UDF
  immutable state, cache-first (no spinner), no dead end.

### 2026-07-07 — slice `chat-draft-reply-ref` ✅ impl + reviewer PASS · ⚠ merge blocked-on-infra (PR #1633 open)
- **Merge status:** implementation complete, reviewer PASS, local `assembleDebug testDebugUnitTest` green. **Merge is
  blocked by an external GitHub-hosted-runner incident**, not by this diff: every CI job that `sudo apt-get update`s
  (Voice API Tests, Test Python (translator)) aborts with exit 100 because `packages.microsoft.com` serves an
  invalid/unsigned `InRelease` (`Clearsigned file isn't valid, got 'NOSPLIT'` / `is no longer signed`) — a
  fleet-wide apt-mirror signing failure that would break the same jobs on `main`. The JS/TS + Android-relevant
  checks (Security, Quality (bun), Test web/gateway/shared/agent, Prisma) all pass. The maintainer merged `main`
  into the branch (cfea06e); a subsequent empty-commit re-trigger (47dc4c0) hit the identical apt error, so the
  incident is still ongoing. A ~19-min probe cron re-triggers CI and will squash-merge (re-verifying apps/android
  scope) the moment the apt step recovers; if a probe ever fails for a reason implicating this diff it stops and
  reports. **Do not merge past the red apt jobs.**
- **Slice:** persist the reply reference alongside the per-conversation draft (Chat parity §C "Draft
  auto-save/restore … + reply"; iOS app-side `DraftStore` stores the reply reference next to the text). After
  `chat-draft-autosave` only the text survived navigation — a reply armed (or half-typed under a reply) was lost.
  Now the reply survives leaving and reopening the conversation, and the composer re-arms the reply pill on open.
- **Model (`:core:model`, `ConversationDraft.kt`):** added `replyToId: String? = null` (serialised, back-compat —
  a legacy payload with no field decodes to `null`).
- **Pure core (`:feature:chat`, `DraftAutosave.kt`):** `resolve` gained a `replyToId` param and now treats a
  draft as *meaningful* when `rawText.isNotBlank() || reply != null` — so a reply armed on an **empty** composer is
  `Save`d (text `""` + reference) instead of dropped, and cancelling a reply on an empty composer `Clear`s a
  reply-only stored draft; the reference is normalised (trim, blank→`null`); the idempotent `None` now requires
  **both** text and reply unchanged. `restore` return type changed `String?` → `DraftRestore(text, replyToId)?`
  (null = leave the composer untouched): re-arms a reply-only draft (empty text + reply) or a half-typed reply
  (both), normalising the stored reference; still idle-guarded (never clobbers an in-flight edit or already-typed
  text; a draft with neither text nor reply → `null`). New `data class DraftRestore`.
- **Wiring (`:feature:chat`, `ChatViewModel`):** `persistDraft(rawText, replyToId)` now threads the armed reply;
  `startReply` persists after arming (only on the found-message success path), `cancelReply` persists after
  clearing, `onDraftChange`/`send` pass the current/`null` reply. `init` restore sets both `draft` and
  `replyingToMessageId` from the `DraftRestore` snapshot; `lastPersistedDraft` seed now counts a reply-only stored
  draft as meaningful. The composer reply pill derives reactively from `replyingToMessageId` + loaded messages, so
  no `ChatScreen` change — the pill re-appears once messages load (non-dead-end).
- **Tests (+16):** `DraftAutosaveTest` (+10) — reply arms: armed-empty-persisted, text+reply-persisted,
  trim+blank-drop, only-reply-changes-still-saves, identical-text+reply-None, cancel-on-empty-clears-reply-only,
  drop-reply-keeps-text; restore: re-arm-reply-only, both-text-and-reply, trim+blank-ref, neither→null. (Existing
  text-only `resolve`/`restore` tests ported to the richer API, none weakened.) `ChatViewModelTest` (+5) —
  arming-persists-ref, typing-under-reply-persists-text+ref, stored-reply-re-arms-on-open, cancel-on-empty-purges,
  send-purges-reply-draft. `ConversationDraftStoreTest` (+1) — durable DataStore round-trips the reference.
- **Verify:** system `gradle assembleDebug testDebugUnitTest` (943 tasks) green. One flake
  (`InterfaceLanguageStoreTest` DataStore `TimeoutCancellationException` under full parallel load) passed on
  isolated re-run — unrelated to this diff (interface-language store, not drafts). Reviewer gate: **PASS** — diff
  `apps/android` only; behaviour through the public API; no tautologies; boundary coverage on the meaningful /
  identical / normalise branches; SDK-purity honoured (decision in `:feature:chat`, carrier in `:core:model`,
  bytes in `:sdk-core`); UDF immutable restore snapshot; cache-first re-arm.

### 2026-07-07 — slice `chat-draft-autosave` ✅ (reviewer PASS)
- **Slice:** per-conversation text draft auto-save/restore (Chat parity §C "Draft auto-save/restore"; iOS
  `ConversationDraftManager` save/draft/clear + `ConversationScreen.persistDraft` empty-purge-on-blank +
  restore-in-`onAppear`). Android had an orphan `ConversationDraft` model and no persistence at all: a composer
  half-typed then navigated-away was lost. Now the draft survives navigation and process death, restores the
  instant the conversation opens (cache-first, no flash), and self-purges when emptied or sent.
- **Pure core (`:feature:chat`, `DraftAutosave.kt`):** `object DraftAutosave` (the app-side "when" decision).
  `resolve(conversationId, rawText, nowIso, previous): DraftPersist` → `Save(ConversationDraft)` /
  `Clear(conversationId)` / `None`: blank text over a stored non-blank draft → `Clear`; blank over nothing (or an
  already-blank stored) → `None` (no redundant write); non-blank identical to stored → `None` (idempotent);
  non-blank differing → `Save` with the **raw** text preserved (leading/trailing whitespace kept so a restore
  returns exactly what was typed), timestamped `nowIso`. `restore(stored, currentDraft, isEditing): String?` →
  the text to seed the composer, or `null` to leave it: restores only into an **idle empty** composer — never
  clobbers an in-flight edit (`isEditing`) nor text already typed while the async load was in flight; a
  blank-text stored draft is ignored.
- **Durable store (`:sdk-core`, `ConversationDraftStore.kt`):** stateless building block (port of iOS
  `ConversationDraftManager`). `interface ConversationDraftStore { suspend load/save/clear }` + `InMemory…`
  (tests/previews) + `DataStoreConversationDraftStore` (Preferences DataStore, SOTA over SharedPreferences;
  per-conversation key `draft:<id>`, `ConversationDraft` JSON via the shared `Json`; a corrupt/legacy payload
  decodes to `null` = cache miss, never crashes the composer). Provided via
  `SdkModule.providesConversationDraftStore` (own `meeshy_conversation_drafts` DataStore file), mirroring the
  theme/language/notification store providers.
- **Wiring (`:feature:chat`, `ChatViewModel`):** injects `ConversationDraftStore`; an `init` launch loads the
  stored draft and `DraftAutosave.restore`s it into state (composer already binds `value = state.draft`, so it
  paints with **no** `ChatScreen` change — non-dead-end). `onDraftChange` now calls `persistDraft`: guarded off
  while `isEditing` (edit content is not a draft — proven by a test that edits without overwriting the stored
  new-message draft), resolves the decision, and applies it through a single coalescing `draftPersistJob`
  (last-write-wins; `CancellationException` rethrown; write failures swallowed — persistence is best-effort and
  never disrupts composing). `send()` purges the stored draft after clearing the composer (non-edit path only).
  `updatedAt` = `Instant.ofEpochMilli(clock.nowMillis())` ISO (injected `CacheClock`, no wall-clock in logic).
- **Tests (+32):** `DraftAutosaveTest` (13) — every `resolve` arm (save-raw / whitespace-preserved / differ /
  identical-None / clear / whitespace-only-clear / blank-no-prev-None / blank-over-blank-None) + every `restore`
  arm (idle-restore / null / blank-stored-ignored / typed-not-clobbered / editing-not-clobbered).
  `ConversationDraftStoreTest` (13) — InMemory (miss / seed / round-trip / replace / per-conversation isolation /
  targeted clear / absent-clear no-op) + DataStore (miss / round-trip / fresh-wrapper-reads-persisted /
  targeted clear / corrupt→miss). `ChatViewModelTest` (+6) — restore-on-open, empty-on-open, typing-auto-saves,
  clearing-purges, sending-purges, editing-never-overwrites-the-stored-draft.
- **Verify:** system `gradle assembleDebug testDebugUnitTest` (943 tasks) green — new suites green, whole JVM
  suite green.
- **Reviewer:** PASS — diff `apps/android` only (`:sdk-core` + `:feature:chat`); behaviour-through-public-API
  (decision object + store + VM state/store side-effects), no tautologies, full branch sweep incl. the
  idempotent `None` arms and the restore-guard paths, plus the corrupt-payload failure path; SDK-purity/SSOT
  honoured — the durable store is a stateless building block in `:sdk-core` (like `ThemeStore`), the "when to
  save / what to restore" product decision is a pure atom in `:feature:chat`, and the composer render is exempt
  Compose glue that needed no change; instant-app cache-first restore, UDF immutable state, best-effort
  cancellation-safe persistence; no floor lowered, no test weakened.

### 2026-07-07 — slice `chat-delete-for-me-vs-everyone` ✅ (reviewer PASS)
- **Slice:** split delete into iOS's two paths (Chat parity §C "send, edit, delete … for-me / for-everyone").
  Android had ONE delete: an unconditional server-delete, offered only for own messages with no window. iOS
  offers "Delete for everyone" (own + within 2h → server round-trip) **and** "Delete for me" (WhatsApp-style
  local-only hide, any message, never reaches the server). Shipped both halves together on purpose: window-gating
  the server-delete without a local-hide would strand old own-messages with no delete option (a regression).
- **Pure core (`:core:model`, `MessageDeletability.kt`):** `object MessageDeletability` beside
  `MessageEditability`. `const DELETE_FOR_EVERYONE_WINDOW_MILLIS = 2h`; `canDeleteForEveryone(isOwn,
  createdAtMillis: Long?, nowMillis, windowMillis) → Boolean`: `!isOwn → false`; `createdAtMillis == null → true`
  (window unprovable + server enforces its own); else `nowMillis - createdAtMillis <= windowMillis` — **inclusive
  `<=`** per iOS `ConversationCommandHandler.canDeleteForEveryone`, unlike the exclusive `<` edit window, so the
  exact boundary instant is still deletable. Future createdAt (clock skew) → still deletable.
- **Pure core (`:sdk-core`, `LocallyHiddenMessagesStore.kt`):** `data class LocallyHiddenMessages(ids: Set<String>)`
  — `isHidden(id)`, `visible(ordered): List<String>` (order-preserving filter), `hide(id)` (blank-guarded +
  idempotent, returns `this` on no-op so a persistence layer can skip a redundant write on a referential check —
  mirrors iOS's `guard inserted else return`). Store interface + `InMemory…` (tests) + `SharedPrefs…`
  (`putStringSet`, durable, port of iOS `LocallyHiddenMessagesStore` UserDefaults set), mirroring
  `EmojiUsageStore`. Provided via `SdkModule.providesLocallyHiddenMessagesStore`.
- **Wiring:** `ChatViewModel` injects `LocallyHiddenMessagesStore`; the message-stream 5-combine is
  `.combine(locallyHiddenStore.hidden)` and `toBubbles` runs `filterNot { hidden.isHidden(it.message.id) }` before
  building bubbles, so hiding a message drops its bubble at once. `deleteMessage` → `deleteForEveryone` (unchanged
  server round-trip). New `deleteForMe(id)` = `locallyHiddenStore.hide(id)` + close the sheet, zero network.
  `ChatScreen` computes `canDeleteForEveryone` alongside `canEdit` (shared `nowMillis`/`createdAtMillis`), shows
  "Delete for everyone" when `isOutgoing && isActionable && canDeleteForEveryone` and "Delete for me" when
  `isActionable` (any delivered message, own or others'); both `MeeshyPalette.Error`. Strings replaced
  `chat_action_delete` with `chat_action_delete_for_everyone` / `_for_me` across en/fr/es/pt.
- **Tests (+23):** `MessageDeletabilityTest` (10) — window constant, moments-ago deletable, at-boundary still
  deletable (inclusive), one-ms-past not, well-past not, someone-else never, future-createdAt deletable,
  null-createdAt own deletable, null-createdAt other not, caller window override. `LocallyHiddenMessagesTest`
  (10) — empty hides nothing, hide marks, others stay visible, idempotent same-instance, blank no-op
  same-instance, accumulate two, visible filters+order, visible over empty, visible none-hidden identity, visible
  keeps unhidden duplicates. `ChatViewModelTest` (+3) — `deleteForMe` local-hides with no `deleteOptimistic`
  round-trip + closes sheet, a pre-hidden id never appears in the bubble list, `deleteForEveryone` delegates +
  closes sheet.
- **Verify:** system `gradle assembleDebug testDebugUnitTest` (943 tasks) green — new suites green, whole JVM
  suite green.
- **Reviewer:** PASS — diff `apps/android` only (`:core:model` + `:sdk-core` + `:feature:chat`);
  behaviour-through-public-API (predicate + value object + VM state), no tautologies, full branch sweep incl. the
  inclusive boundary and the same-instance no-op paths; SDK-purity/SSOT honoured (stateless predicate in
  `:core:model`, pure set value + durable store in `:sdk-core` like `EmojiUsageStore`, "when to offer which
  delete" product decision in the exempt Compose glue); UX coherence (two clearly-labelled destructive actions,
  no dead end — an old own-message keeps "Delete for me"); no floor lowered, no test weakened.

### 2026-07-07 — slice `chat-edit-time-window` ✅ (merged, reviewer PASS)
- **Slice:** enforce the 2-hour message-edit window (Chat parity §C "send, edit, delete … 2h window"; iOS
  `ConversationScreen` offers Edit only while `Date().timeIntervalSince(createdAt) < 2h`). Android's
  `startEdit` + Edit sheet action had no window and no authorship check — any own SYNCED, non-deleted message
  stayed editable forever.
- **Pure core (`:core:model`, `MessageEditability.kt`):** `object MessageEditability` beside
  `DeliveryStatusResolver`. `const EDIT_WINDOW_MILLIS = 2h`; `canEdit(isOwn, createdAtMillis: Long?, nowMillis,
  windowMillis = EDIT_WINDOW_MILLIS) → Boolean`: `!isOwn → false`; `createdAtMillis == null → true` (window
  unprovable, stays editable — iOS never has a null createdAt, and refusing an edit merely because the wire
  omitted a timestamp is a worse gap); else `nowMillis - createdAtMillis < windowMillis`. A future createdAt
  (clock skew) yields a negative elapsed `< window` → still editable (iOS negative-`timeIntervalSince` parity);
  the boundary is strict (`elapsed == window` → not editable).
- **Wiring:** `ChatViewModel` injects the already-Hilt-provided (`SdkModule.providesCacheClock`) `CacheClock`
  and gates `startEdit` — `isOwn = message.senderId != null && senderId == currentUser.id` (authorship now
  enforced), `createdAtMillis = isoToEpochMillisOrNull(message.createdAt)` (SSOT parse), `now =
  clock.nowMillis()`; refuses when not editable. `ChatScreen` computes the same predicate over
  `BubbleContent.createdAtIso` + `System.currentTimeMillis()` and shows the Edit sheet action only when
  `bubble.isOutgoing && isActionable && canEdit`; the Delete action was split out of the shared block so it
  stays available regardless of the edit window (iOS keeps delete).
- **Tests (+13):** `MessageEditabilityTest` (10) — window constant, moments-ago editable, just-inside-window
  editable, exactly-at-boundary not editable, past-window not editable, someone-else never editable,
  future-createdAt editable, null-createdAt own editable, null-createdAt other not editable, caller window
  override. `ChatViewModelTest` (+3) — inside-window `startEdit` opens the editor + fills the draft,
  past-window `startEdit` is blocked (editingMessageId stays null, draft empty), non-own `startEdit` refused.
  Harness now injects a fixed `CacheClock` (FIXED_NOW = 2026-07-07T12:00:00Z); existing edit tests (m1 has a
  null createdAt → editable) stay green.
- **Verify:** system `gradle assembleDebug testDebugUnitTest` (896 tasks) green — `MessageEditabilityTest`
  10/10, the 3 new `ChatViewModelTest` cases green, whole JVM suite green.
- **Reviewer:** PASS — diff `apps/android` only (`:core:model` + `:feature:chat`); behaviour-through-public-API
  (`MessageEditability.canEdit` + VM state), no tautologies, full branch sweep incl. the boundary and both
  null-createdAt authorship cases; SDK-purity/SSOT honoured (stateless rule in `:core:model` like
  `DeliveryStatusResolver`, clock injected via the existing Hilt binding, ISO parse via `isoToEpochMillisOrNull`
  SSOT, render gate is exempt Compose glue); UX coherence (Edit hidden after the window, Delete preserved — no
  dead end); no floor lowered, no test weakened.

### 2026-07-07 — slice `chat-typing-header` ✅ (merged, reviewer PASS)
- **Slice:** surface the typing roster in the conversation header (Chat parity §C "Typing indicators (header +
  inline)"; iOS `ConversationHeaderState` typing-dot phase). The inline indicator + scroll-control pill were
  live, but the header showed only a static title — no "X is typing…" and no group member subtitle.
- **Pure core (`:feature:chat`, `Typing.kt`):** `sealed interface ChatHeaderSubtitle { None; Members(count);
  Typing(label) }` + `of(memberCount, isGroup, typing)` — the header-subtitle SSOT. Decision order: typing
  present → `Typing(TypingLabel.of(...))` (supersedes the count — iOS parity); else a group with `memberCount
  > 0` → `Members(count)`; else `None`. Reuses the existing `TypingLabel` SSOT — no new roster logic. A
  non-positive count (not-yet-loaded roster) yields `None`, never "0 members".
- **Wiring/render:** `ChatViewModel` derives `memberCount` (= `conversation.memberCount`) and `isGroup`
  (`type != "direct"`) in the conversation collector and exposes them on `ChatUiState`. `ChatScreen` wraps the
  header title `Row` in a `Column` and renders `ChatHeaderSubtitleRow(ChatHeaderSubtitle.of(...))` beneath it:
  typing text (reusing `typingLabelText`) in the conversation `accentColor`, the member count (new
  `chat_header_members` EN/FR/ES/PT string) in `textSecondary`, single-line ellipsized; `None` renders nothing.
- **Tests (+11):** `ChatHeaderSubtitleTest` (9) — direct+idle→None, group+idle→Members(n), group-of-1→
  Members(1) boundary, group+0→None boundary, group+negative→None boundary, typing-beats-members in a group,
  typing in a direct chat, Two/Many label propagation. `ChatViewModelTest` (+2) — group exposes memberCount=3 +
  isGroup=true; direct exposes memberCount=2 + isGroup=false. Full branch sweep of `of`.
- **Verify:** `gradle assembleDebug testDebugUnitTest` (896 tasks) green — `ChatHeaderSubtitleTest` 9/9, the two
  new `ChatViewModelTest` cases green, whole suite green.
- **Reviewer:** PASS — diff `apps/android/feature/chat` only; behaviour-through-public-API (`ChatHeaderSubtitle.of`
  + VM state), no tautologies, every `of` branch + count boundaries (0/1/negative) exercised; SDK-purity/SSOT
  honoured (pure decision in `:feature:chat` reusing `TypingLabel`, render exempt Compose glue); accent/nav
  coherence (typing subtitle in the conversation `accentColor`); no dead code — the subtitle is consumed by the
  header.

### 2026-07-07 — slice `chat-typing-in-control` ✅ (merged, reviewer PASS)
- **Slice:** fold the typing roster into the scroll-to-bottom control (Chat parity §C "Typing indicators …
  inside the control"; iOS `ConversationScrollControlsView`, whose documented rule is **"typing indicator
  takes priority over count"**). Before this the control only ever showed the unread count/preview; a peer
  typing while you were scrolled away was invisible until you returned to the bottom.
- **Pure core (`:feature:chat`, `ScrollAffordance.kt`):** `sealed interface ScrollControlContent { Hidden;
  Typing(label); Unread(count, preview); Plain }` + `of(affordance, typing)` — the render SSOT. Decision order:
  not visible → `Hidden` (regardless of typing/unread); else typing present → `Typing(TypingLabel.of(...))`
  (suppresses the count — the iOS priority rule); else unread → `Unread(count, preview)`; else `Plain`. Reuses
  the existing `TypingLabel`/`TypingParticipants` cores — no new roster logic.
- **Wiring/render:** `ScrollToBottomControl` now takes `typingParticipants`, computes `ScrollControlContent.of`,
  and renders a `TypingPill` (accent edit-icon + `typingLabelText`) for `Typing`, the existing `UnreadPreviewPill`
  + badge for `Unread`, and a bare FAB for `Plain`; the badge count comes from the `Unread` variant only, so
  typing hides it. The label→string mapping was extracted to a shared `@Composable typingLabelText(label)` reused
  by the inline `TypingIndicator` (removes the duplicated `when` over `TypingLabel`).
- **Tests (+10):** `ScrollControlContentTest` — at-bottom→Hidden even with typing / even with unread; one/two/
  three typists→Typing(One/Two/Many); typing-beats-unread priority; unread-only→Unread(count, preview);
  unread-missing-preview→Unread(count, null); nothing→Plain; empty-typing falls through. Full branch sweep of
  `of`.
- **Verify:** `gradle :feature:chat:testDebugUnitTest` (146 tasks, `ScrollControlContentTest` 10/10) +
  `:feature:chat:assembleDebug` both green.
- **Reviewer:** PASS — diff `apps/android/feature/chat` only; behaviour-through-public-API, no tautologies, every
  `of` branch exercised incl. the visibility-wins-over-typing arms; SDK-purity/SSOT honoured (pure decision in
  `:feature:chat`, render exempt Compose glue); DRY win (shared `typingLabelText`); accent/navigation coherence
  unchanged (`TypingPill` uses the conversation `accentColor`). No dead code — the new content type is consumed
  by the control.

### 2026-07-07 — slice `chat-typing-participants-core` ✅ (merged, reviewer PASS)
- **Slice:** the inline typing indicator (Chat parity §C "Typing indicators"). The incoming-typing roster was
  built ad-hoc in `ChatViewModel` keyed by **displayName** (`typingUsers: List<String>`, `(list - name) + name`),
  and the 1/2/N label lived untested inside the `TypingIndicator` Composable. Two real bugs: two distinct users
  who share a display name collapsed into one entry, and stopping one removed the other (remove-by-name).
- **Pure cores (`:feature:chat`, new `Typing.kt`):**
  - `TypingParticipant(userId, name)` + `object TypingParticipants` — keyed SSOT. `started(current, userId, name,
    selfId?)`: blank/self userId inert, blank name → `userId` fallback, dedup by userId with refresh-to-tail
    (most-recent-last); `stopped(current, userId)`: remove exactly that userId. Port of iOS
    `ConversationSocketHandler` typing book-keeping, fixing the same-name collapse/removal bugs.
  - `sealed interface TypingLabel { None; One(name); Two(a,b); Many(count) }` + `of(participants)` — presentation
    SSOT so the Composable only maps a variant to a string resource (per TDD-COVERAGE "push decisions out of the
    Composable").
- **Wiring:** `ChatUiState.typingUsers: List<String>` → `typingParticipants: List<TypingParticipant>`; the
  `typing:start`/`typing:stop` collectors call `TypingParticipants.started/stopped` (self-id from
  `sessionRepository.currentUser`); `removeTypingUser(userId)` (name arg dropped); the 5 s cleanup job re-keyed by
  userId. `ChatScreen.TypingIndicator(participants)` renders via `TypingLabel.of`.
- **Tests (+21):** `TypingParticipantsTest` 12 (add/append/refresh-to-tail/same-name-distinct/self-exclude/
  self-id-admits-others/blank-name-fallback/blank-userId-inert; stop matching/only-matching-not-same-named/
  unknown-inert/empty), `TypingLabelTest` 5 (none/one/two-in-order/three→many/five→many), `ChatViewModelTest` +4
  (peer start populates, other-conversation ignored, two same-named both show & stop leaves the other, 5 s expiry).
- **Verify:** `gradle assembleDebug testDebugUnitTest` green (896 tasks, system Gradle 8.14.3).
- **Reviewer:** PASS — diff `apps/android/feature/chat` only; behaviour-through-public-API, no tautologies,
  full branch sweep incl. the inert arms; SDK-purity/SSOT honoured (pure roster+label cores in `:feature:chat`,
  gesture/render exempt Compose glue); UDF immutable state; no dead code (both cores consumed). Fixes two real
  same-name defects. **Lesson captured** (NOTES.md): mockk stub `every { this@mockk.flowProp }` must qualify when
  an outer test field shares the name; `advanceUntilIdle()` fires the 5 s typing-cleanup `delay` — use
  `runCurrent()` to assert the pre-timeout roster.

### 2026-07-07 — slice `chat-swipe-to-reply` ✅ (impl done, reviewer PASS)
- **Slice:** swipe-to-reply gesture on message bubbles (Chat parity §C "Reply … swipe"). Pure `:feature:chat`
  `SwipeToReply` SSOT — `ReplyDirection` (FromIncoming +1 / FromOwn −1); `resolveOffset` (1:1 in the
  `RUBBER_BAND_ZONE`=72, then `RUBBER_BAND_RESISTANCE`=0.15 compression, wrong-direction clamped to 0); `isArmed`
  at `COMMIT_THRESHOLD`=66; `onDrag` reducer over `SwipeReplyState` returning a one-shot `armedHaptic`; `onRelease`
  → Commit/Cancel. Port of iOS `MessageListView.dragGesture` + `BubbleSwipeResistance`.
- **Wiring:** `ChatScreen.SwipeToReplyContainer` wraps each `MessageBubble` — `detectHorizontalDragGestures`
  accumulates raw translation into the reducer, `animateFloatAsState` renders the drag (spring-back on release),
  an accent-tinted reply glyph reveals behind (alpha = progress to threshold), arm-haptic fires once mid-drag,
  committed release fires a success haptic + the existing `viewModel.startReply(messageId)` (no new state path).
- **Tests:** +23 `SwipeToReplyTest` (direction gating both ways, zero, in-zone/at-edge/past-zone both signs,
  below/at/above threshold, wrong-direction never-armed, haptic once/held/disarm/re-arm, short-drag inert,
  commit/cancel/untouched/own-commit).
- **Gate:** `:app:assembleDebug` + full `testDebugUnitTest` BUILD SUCCESSFUL (system Gradle 8.14.3). Diff
  `apps/android` only (SwipeToReply.kt, SwipeToReplyTest.kt, ChatScreen.kt + tracking docs). Reviewer: PASS —
  behaviour-through-public-API, no tautologies, boundary coverage on both thresholds, SDK-purity (pure decision in
  `:feature:chat`, gesture/animation in exempt Compose glue), natural-gesture UX reusing the existing reply entry.

### 2026-07-06 — slice `chat-mention-autocomplete` ⚠ blocked-on-infra (impl done, reviewer PASS, PR #1580 open)
- **Status:** implementation complete, locally green (+40 tests, `:feature:chat:testDebugUnitTest` +
  `:app:assembleDebug` BUILD SUCCESSFUL), diff `apps/android`-only, reviewer PASS. **NOT merged** — held at the
  routine hard gate "never merge past red CI".
- **CI blocker (external, unrelated to the diff):** the monorepo `ci.yml`'s four `services/translator` Python
  jobs — `Test Python (translator)`, `Voice API Tests`, `TTS/STT Integration`, `Audio Pipeline Tests` — all fail
  at the identical step **"Install Python dependencies (CPU backend for CI)"** with
  `error: Failed to fetch torch-2.6.0+cpu…whl.metadata → received fatal alert: HandshakeFailure` (a PyTorch wheel
  CDN `download-r2.pytorch.org` TLS outage). **Deterministic across two runs** (SHA `4a070870` run #6176 and the
  empty-commit re-trigger SHA `6f035fe8` run 28814248914). Every JS/TS job is green on both runs (Security,
  Quality-bun, Prisma, Test agent, Test shared, Test web). The GitHub integration lacks `rerun-failed-jobs`
  permission (403), and an `apps/android`-only diff cannot touch the translator deps, so this is unfixable from
  here — it clears when the PyTorch CDN recovers.
- **Unblock path (one action):** once the CDN is back, re-run the 4 failed translator jobs (or re-trigger CI) on
  PR #1580; when they go green, squash-merge to `main`. No code change is needed — the slice itself is complete
  and reviewer-approved. Mark this entry ✅ shipped after the merge.

### 2026-07-06 — slice `chat-mention-autocomplete` (implementation detail; ⚠ merge pending CI — see above)
- **Step 0 (housekeeping):** no Android slice PR was open (the board carried only unrelated dependabot PRs
  and one non-Android `fix(calls)` PR #1579 on a `claude/loving-*` branch — out of scope, left untouched).
  `origin/main` already contained the prior `chat-search-highlight-wiring` merge (#1577). Branched
  `claude/apps/android/chat-mention-autocomplete` off latest `origin/main`. Env: Android SDK bootstrapped
  (`platforms;android-35` + `build-tools;35.0.0`); Gradle **wrapper** still 403s through the proxy → built
  with system **Gradle 8.14.3** (`/opt/gradle/bin/gradle`), per NOTES.
- **Why this slice:** the recommended §C Chat follow-up (PROGRESS "Next" #2/#3). `MentionCandidate` existed in
  `:core:model` but was **dead code** — no autocomplete, and `MessageBubble.mentionDisplayNames` (added by
  `chat-rich-text-segments`) was never fed, so in-bubble `@username` never resolved to a display name. This
  makes mentions real end-to-end and closes the "member roster → `mentionDisplayNames`" pending item.
- **Pure core (`:feature:chat` `ChatMention.kt`):** the composer-mention SSOT ported from the pure logic of iOS
  `MentionComposerController`. `extractQuery(text)` — trailing `@fragment` past the last `@` (bare `@` → `""`
  = show the full roster; a space past the last `@` → `null` = inactive; no `@` → `null`). `filterCandidates` —
  trimmed, case-insensitive substring over username **or** display name; blank query → every candidate, order
  preserved. `insertMention` — rewrite the trailing fragment to `@username ` (trailing space), inert when there
  is no active fragment. Plus a pure reducer over `MentionAutocompleteState(activeQuery, suggestions,
  draftMentions)`: `onTextChange` (recompute or clear), `cleared` (**idempotent** — returns the same instance
  when already inert; preserves draft mentions), `select` (rewrite text + record the draft mention + dismiss),
  `reset` (full wipe, for send). `MentionRoster.fromParticipants` builds candidates from the conversation
  participants — excludes self (`excludeUserId`), drops blank/absent usernames, degrades a blank/absent display
  name to the username, falls back to the participant id when `userId` is absent — and `displayNames` projects
  the `username → displayName` map.
- **Wiring:** `ChatViewModel` builds the roster in the conversation-stream collector (self excluded via the
  session user id), exposes `state.mentionDisplayNames` (threaded into every `MessageBubble`, so received
  `@username` resolves in-bubble), recomputes `state.mention` on `onDraftChange`, adds `onMentionSelected`
  (rewrites the draft + records the mention + dismisses the panel), and `reset`s the mention on send.
  `ChatScreen` renders a **neutral** (input-assistance chrome, not accent-tinted — matches the iOS decision)
  accent-avatar suggestion strip above the composer, capped at 200dp and scrollable.
- **Verification:** `gradle :feature:chat:testDebugUnitTest` → **BUILD SUCCESSFUL** (`ChatMentionTest` 26,
  `MentionRosterTest` 9, `ChatViewModelTest` +5 = **+40 tests**, 0 failures), then `gradle :app:assembleDebug`
  → **BUILD SUCCESSFUL** (Compose glue compiles). Diff = `apps/android` only (2 new src + 2 new test +
  `ChatViewModel.kt`/`ChatScreen.kt`/`ChatViewModelTest.kt` modified + these docs).
- **Branches covered:** `extractQuery` no-`@`/trailing-fragment/bare-`@`/space-after/mid-space/multi-`@`/glued;
  `filterCandidates` blank/whitespace/username-hit/displayName-hit/no-match/empty-roster; `insertMention`
  replace/bare-`@`/no-`@`/space-inert/prefix-preserved; `onTextChange` activate/clear-keeps-draft/bare-`@`;
  `cleared` idempotent-same-instance/clears-keeps-draft; `select` rewrite+record+dismiss/accumulate; `reset`;
  `MentionRoster` map/exclude-self/drop-blank-username/degrade-null-name/degrade-blank-name/id-fallback/avatar/
  empty/displayNames; VM roster-populates-display-names/at-query-activates-excluding-self/clear-deactivates/
  select-rewrites-and-dismisses/send-resets.
- **Reviewer gate:** PASS — diff `apps/android` only, no production logic elsewhere; behaviour-through-public-API
  tests (drive intents/reducers, assert emitted state), no tautologies, no floor lowered; SDK purity (the pure
  mention core + roster builder live in `:feature:chat` product-orchestration, not the SDK — they encode the
  "don't @-mention yourself / trailing-`@`-is-active" product rules; the strip is exempt Compose glue), SSOT
  (one `ChatMention` owns query/filter/insert, one `MentionRoster` owns candidate derivation, reuses the
  existing `MessageBubble.mentionDisplayNames`), UDF (immutable `MentionAutocompleteState`, pure transitions),
  instant-app (all-local, no spinner/network), colour/UX coherence (neutral strip = input chrome, accent avatar,
  natural tap-to-insert, no dead end). No orphan code: `draftMentions` is recorded on select and cleared on send;
  `mentionDisplayNames` is the live consumer of the roster. Surpasses iOS: the local roster is filtered instantly
  (no artificial 300ms debounce for the on-device list; the debounced backend `/mentions` merge is the tracked
  follow-up).

### 2026-07-06 — slice `chat-rich-text-segments` ✅ shipped
- **Step 0 (housekeeping):** no Android PR was open (only unrelated web/gateway/translator/dependabot PRs on
  the board). `origin/main` = `7cc5a627` (last Android merge, the delivery-status indicator #1568). Branched
  `claude/apps/android/chat-rich-text-segments` off it. Environment: bootstrapped the Android SDK
  (`platforms;android-35` + `build-tools;35.0.0`) per ROUTINE; the Gradle **wrapper** download 403s through the
  proxy, so built with the preinstalled **system Gradle 8.14.3** (`/opt/gradle/bin/gradle`) — recorded in NOTES.
- **Why this slice:** Chat parity §C "Rich text rendering (markdown, mentions, m+ links, URLs, search
  highlight)". The message bubble rendered the body as a **plain `Text`** — no markdown, no tappable mentions/
  links, no search highlight. iOS centralises this in `MessageTextRenderer` (a single-pass, priority-rule
  segmenter). Android had **no rich-text core at all**. This ports the pure segmentation SSOT and renders it.
- **Pure core (`:core:model` `MessageTextParser.kt`):** the Android SSOT ported from iOS `MessageTextRenderer`.
  `parse(text, mentionDisplayNames?) → List<MessageSegment>` — one earliest-match-wins pass over a priority-
  ordered rule pipeline: markdown **bold** (`**`) / *italic* (`*`, `(?<!\*)…(?!\*)` so `**` is consumed first) /
  ~~strike~~ (`~~`) / underline (`__`) with **recursive nesting** (inner emphasis unions the outer `TextStyles`);
  `@username` mentions (`(?<![a-zA-Z0-9])@…`) → `meeshy.me/u/<user>`, with **display-name resolution** (`@John
  Doe` when a `username→"John Doe"` map is supplied — sorted longest-first, skips names equal-to-username / empty
  / whitespace-less, and **wins over the bare-username fallback at the same position** since it registers first
  and ties keep the earlier rule); `m+TOKEN` share links → `meeshy.me/l/<token>`; and a pure O(n) `http(s)` URL
  regex (no `NSDataDetector` analogue — same trade-off iOS took to dodge its recursion crash). Plus
  `highlightRanges(text, term)` (case-insensitive, non-overlapping, bounds-guarded), `extractUrls` (meeshy →
  mentions → http order, for future OG/link-preview), and `resolvedLinkUrl(raw, trackedLinks)` (gateway redirect
  with trailing-punctuation-trimmed key fallback; the DISPLAY stays the raw URL). Markdown recursion drops
  display-name resolution (mirrors iOS) but still linkifies `@username`. RED-first (`MessageTextParserTest`, 34):
  every rule, nesting/style-union, both lookbehind rejections (`foo@bar`, `xhttps://…`, `xm+…`), earliest-match
  priority, all three display-name filter branches + the recursion fallback, every highlight branch (empty/
  absent/single/case-insensitive/multi-non-overlapping), extract order + empties, and all five `resolvedLinkUrl`
  branches (null/empty/exact/trim/no-match/no-trailing-punct).
- **Render glue (`:sdk-ui` `RichMessageText.kt`, exempt per TDD-COVERAGE):** a `@Composable` that `remember`s the
  parse and maps segments → `AnnotatedString` — `SpanStyle` for emphasis, `LinkAnnotation.Url` + `withLink`
  (Compose 1.7 → real taps via `LocalUriHandler`, **zero extra plumbing**), and a highlight wash applied against
  the **rendered plain text** (markers already stripped, so it never drifts off the visible chars — strictly
  better than iOS's raw-offset approach). Wired into `MessageBubble`: the non-emoji text path now renders
  `RichMessageText` (emoji-only path unchanged); three optional params (`mentionDisplayNames`/`highlightTerm`/
  `trackedLinks`, all null-default) thread through, so the search-highlight + display-name-mention surface is
  ready for `ChatScreen`/`ChatViewModel` to feed a term/roster later without a re-plumb.
- **Verification:** `gradle :sdk-ui:assembleDebug :app:assembleDebug` → **BUILD SUCCESSFUL**, then full
  `gradle testDebugUnitTest` → **BUILD SUCCESSFUL** (all modules, system Gradle 8.14.3). +34 new tests. Diff =
  `apps/android` only (2 new src + 1 new test + `MessageBubble.kt` modified + these docs).
- **Reviewer gate:** PASS — diff `apps/android` only, no production logic elsewhere; behaviour-through-public-API
  tests, no tautologies, no floor lowered; SDK purity (pure segmenter/highlight/extract/resolve in `:core:model`;
  the AnnotatedString mapping + tap wiring is `:sdk-ui` render glue — no product orchestration in the SDK), SSOT
  (one `MessageTextParser` owns every text treatment, read by the bubble and any future search/preview consumer),
  UDF unaffected, instant-app (parse is pure + `remember`-memoized, no I/O), colour/UX coherence (link runs use
  the bubble's on-colour + underline, highlight uses the amber warning wash, real gesture = tap-to-open via the
  platform handler, no dead end). No orphan code: the renderer is the live consumer of every segment kind, and
  the three bubble params feed straight into it. Surpasses iOS: highlight aligns to visible chars (no
  marker-drift), and the whole treatment vocabulary is one tested pure core instead of a view-embedded renderer.

### 2026-07-06 — slice `settings-notification-type-toggles` ✅ shipped
- **Step 0 (housekeeping):** the prior iteration's Android PR **#1517 (`settings-dnd-schedule`)** was still open
  from the last run — merged it first (`mergeable_state: clean`, diff apps/android-only, reviewer PASS recorded).
  The only red CI on `main` is the unrelated `Test Python (translator)` job (an apps/android-only diff touches
  none of the JS/TS/Python stack; the real Android gate is local). Re-synced `origin/main` (now `1fdc4931`) and
  branched `claude/apps/android/settings-notification-type-toggles` off it.
- **Why this slice:** the §L "Recommended next" #2 — the `UserNotificationPreferences` block carries ~17
  per-event booleans (reply/mention/reaction/conversation, missed-call/voicemail, the six social/feed types,
  the four group/contact types, system) but only push/new-message/sound/vibration + DND were surfaced. This
  slice exposes the rest as a grouped, searchable section over the existing durable store (no new store).
- **Pure core (`:core:model` `NotificationTypeCatalog.kt`):** `NotificationType` (17) + `NotificationCategory`
  (MESSAGES→CALLS→SOCIAL→GROUPS→SYSTEM display order). Each type has a `NotificationTypeDescriptor` carrying its
  category + a `get`/`set` lens over the matching boolean (the toggle SSOT). `isEnabled`/`toggle` (read-modify-
  write exactly one field, never clobber the block); `sections(prefs, query, label)` groups matching types into
  ordered category sections, each item carrying its live enabled state — blank/whitespace query keeps all,
  otherwise a case-insensitive/trimmed `contains` over the **injected locale-aware label** drops non-matching
  types and omits emptied categories. Search stays pure: the label fn is injected so no string resources leak
  into `:core:model`. RED first (`NotificationTypeCatalogTest`, 10: every-type toggle round-trip, no-clobber,
  full grouping/order, within-category order, enabled-state derivation, blank + whitespace = no filter,
  case-insensitive match with empty-category omission, no-match → empty, injected-label match).
- **Wiring (`:feature:settings`):** `SettingsViewModel` gains `notificationTypeQuery` in `UiState`,
  `setNotificationTypeEnabled(type, enabled)` (through the existing `updateNotifications { NotificationTypeCatalog
  .toggle(...) }` read-modify-write) and `setNotificationTypeQuery(query)` (view-only, never mutates the block).
  `SettingsScreen` renders, under the notifications section after DND, a `NotificationTypesEditor`: a titled
  `OutlinedTextField` search (Search icon), and for each surviving section an accent-primary category header +
  push-gated per-type `NotificationToggleRow`s (disabled when push is off), with an empty-state label when the
  query matches nothing. Labels/headers localized EN/FR/ES/PT (22 new strings ×4). `SettingsViewModelNotification
  TypesTest` (4: enable persists+surfaces, no-clobber of other toggles/top-level, re-enable a default-off type,
  query updates UI state only without touching the block).
- **Verification:** `gradle :core:model:testDebugUnitTest :feature:settings:testDebugUnitTest` green, then full
  `gradle :app:assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all modules, system Gradle 8.14.3). +14
  new tests (catalog 10, VM 4). Diff = `apps/android` only (2 new + 6 modified + this doc + feature-parity).
- **Reviewer gate:** PASS — diff `apps/android` only, no production logic elsewhere; behaviour-through-public-API
  tests, no tautologies, no floor lowered; SDK purity (pure catalog/lens/grouping in `:core:model`; the "which
  intent / query-in-state / label lookup" product orchestration in `:feature:settings`), SSOT (one
  `NotificationTypeCatalog` owns the type↔boolean mapping + grouping, read by the editor and any future
  notification-gating consumer; `.copy` merge preserves the block), UDF (immutable `StateFlow<UiState>`),
  instant-app (edits instant + durable via the shipped store), colour/UX coherence (accent-primary category
  headers, natural search + switch gestures, push-gated toggles, no dead end — empty-state label). No orphan
  code: every descriptor lens has a live consumer via `toggle`/`sections`. Surpasses iOS, which lists the same
  toggles without an in-section search filter.

### 2026-07-05 — slice `settings-dnd-schedule` ✅ shipped
- **Step 0 (housekeeping):** no open Android PR from a prior iteration — the open PRs (#1516/#1515/#1513/
  #1510/#1498) are all non-Android gateway/web/calls fixes by other sessions. Branched
  `claude/apps/android/settings-dnd-schedule` off the freshly-fetched `origin/main` (`930f4811`).
- **Why this slice:** the §L "Recommended next" #1 — the `UserNotificationPreferences` block already carried
  `dndEnabled`/`dndStartTime`/`dndEndTime`/`dndDays` (persisted losslessly by the shipped codec + store from
  `settings-notification-prefs`), but nothing exposed them. This slice adds the pure quiet-hours SSOT + the
  editor, reusing the existing durable seam (no new store).
- **Pure core (`:core:model` `DndWindow.kt`):** port of iOS `UserNotificationPreferences.isInDoNotDisturbWindow`.
  `isActive(prefs, dayOfWeek, minuteOfDay)` — enable gate → per-day gating (empty `dndDays` = every day) →
  parse both `HH:mm` → same-day `[start, end)` **or** midnight-wrap `>= start || < end`; a corrupt time or a
  gated-out day ⇒ never active (never crashes). `isActive(prefs, LocalDateTime)` convenience derives
  weekday+minute. `parseMinuteOfDay` (rejects malformed shape / out-of-range → null), `formatTimeOfDay`
  (range-clamped, zero-padded), `toggleDay` (canonical Mon→Sun order, dedup), `DndDay`↔ISO-`DayOfWeek`
  mapping. RED first (`DndWindowTest`, 20: parse bounds/trim/malformed/out-of-range, format pad/clamp/
  round-trip, toggle add/remove/order/dedup, day-mapping round-trip, enable gate, same-day inclusive-start/
  exclusive-end + degenerate empty window, wrap-around both sides + midday gap, empty-days=every-day + gated-
  out day, corrupt-time → false, LocalDateTime overload time + day gating).
- **Wiring (`:feature:settings`):** `SettingsViewModel` gains `setDndEnabled`/`setDndStart(hour,minute)`/
  `setDndEnd(hour,minute)`/`toggleDndDay(day)` — all through the existing `updateNotifications { copy(...) }`
  read-modify-write so DND edits never clobber the other toggles; start/end format via `DndWindow.formatTimeOfDay`,
  day via `DndWindow.toggleDay`. `SettingsScreen` renders the DND rows under the notifications section: a master
  toggle (disabled when push is off), and when enabled — a **live "quiet hours active now / off right now"
  status** computed from `DndWindow.isActive(prefs, LocalDateTime.now())`, Material3 24h `TimePicker` from/until
  rows (seeded from the stored `HH:mm` via `parseMinuteOfDay`), and a Mon→Sun `FilterChip` day selector showing
  "Every day" when empty. EN/FR/ES/PT strings for all new labels. `SettingsViewModelDndTest` (6: enable persists+
  surfaces, start/end format into stored token, toggle add-then-remove, canonical multi-day order, no-clobber of
  other toggles).
- **Verification:** `gradle :core:model:… :feature:settings:testDebugUnitTest` green, then full
  `gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (0 failures, system Gradle 8.14.3). +32 new
  tests (DndWindow 20, VM 6, +the LocalDateTime/day-mapping cases). Diff = `apps/android` only (3 new + 6
  modified: SettingsScreen/SettingsViewModel + 4 strings; feature-parity doc).
- **Reviewer gate:** PASS — diff `apps/android` only, no production logic elsewhere; behaviour-through-public-API
  tests, no tautologies, no floor lowered; SDK purity (pure predicate/codec in `:core:model`; the "which intent /
  when to show the status / picker cascade" product orchestration in `:feature:settings`), SSOT (one `DndWindow`
  read by both the editor status and future notification gating; `.copy` merge), UDF (immutable
  `StateFlow<UiState>`), instant-app (edits are instant + durable, no flash), colour/UX coherence (accent-tinted
  active-status label via `colorScheme.primary`, natural TimePicker + chip gestures, no dead end). No orphan code:
  `isActive` has a live consumer in the DND status label. Surpasses iOS whose editor has no live-status readout.

### 2026-07-05 — slice `settings-notification-prefs` ✅ shipped
- **Step 0 (housekeeping):** the prior iteration's Android PR **#1508 (`settings-interface-language`)** was
  still open from the last run — merged it first (`mergeable_state: clean`, diff apps/android-only, reviewer
  PASS documented), squash → `main` `7e7b554`. The other open PRs are non-Android gateway/web/calls fixes.
  Then branched `claude/apps/android/settings-notification-prefs` off the freshly-merged `origin/main`.
- **Why this slice:** the §L "Recommended next" #2 — the `settings_push_notifications` switch was ephemeral
  `remember { mutableStateOf(true) }` (lost on recompose/relaunch). Backing it with a durable store closes a
  visible data-loss gap and mirrors the theme/language pattern. The `UserNotificationPreferences` model
  already existed in `:core:model` (30+ fields, untested, unused) — this slice makes it real.
- **Pure core (`:core:model` `NotificationPreferencesCodec.kt`):** since the block is a whole record (not an
  enum token), it round-trips as JSON. `UserNotificationPreferences.storageValue` (`encodeDefaults` so every
  field survives) + `notificationPreferencesFromStorage(raw)` (blank/absent/malformed/wrong-shape → safe
  defaults via `runCatching`, partial token fills missing with defaults, unknown keys ignored). RED first
  (`NotificationPreferencesCodecTest`, 10: full-toggle round-trip, defaults round-trip, non-empty-JSON token,
  null/blank/whitespace/corrupt/wrong-shape → defaults, partial-fill, unknown-keys-ignored).
- **Durable store (`:sdk-core` `notification/NotificationPreferencesStore.kt`):** interface +
  `InMemoryNotificationPreferencesStore` (tests/previews) + `DataStoreNotificationPreferencesStore` (decodes
  through the pure codec, hydrates on cold start via `stateIn(Eagerly)`). `@Singleton` in `SdkModule` over
  `preferencesDataStoreFile("meeshy_notifications")`. `NotificationPreferencesStoreTest` (7: in-memory
  default/seed/update; DataStore default-empty, set-reflected, hydrate-already-persisted, **corrupt-stored-
  value → defaults**). Reused the one-DataStore-per-file-per-process hydration pattern (see NOTES).
- **Wiring:** `SettingsViewModel` mirrors `notificationPreferencesStore.preferences` into
  `SettingsUiState.notifications` + four per-toggle intents (`setPushEnabled`/`setSoundEnabled`/
  `setVibrationEnabled`/`setNewMessageEnabled`) that read-modify-write the whole block through a private
  `updateNotifications { copy(...) }` — a single toggle never clobbers the others.
  `SettingsScreen` replaces the ephemeral switch with a reusable `NotificationToggleRow` driven by state; push
  is the **master** toggle (the three sub-toggles disable + dim when push is off — coherent UX, no dead end).
  EN/FR/ES/PT strings added for the three new rows. The two existing VM test factories got the new ctor arg
  (no assertion touched). `SettingsViewModelNotificationTest` (8: default-block, reflects-persisted,
  set-push-persists+surfaces, set-sound-preserves-others, set-vibration, set-new-message, successive-toggles-
  compose-without-clobber, toggle-streams-into-state).
- **Verification:** `gradle :core:model:… :sdk-core:… :feature:settings:testDebugUnitTest` green, then full
  `gradle assembleDebug testDebugUnitTest` → BUILD SUCCESSFUL (0 failures, system Gradle 8.14.3). +25 new tests
  (codec 10, store 7, VM 8).
- **Reviewer gate:** PASS — diff `apps/android` only (14 files); behaviour-through-public-API tests, no
  tautologies, no floor lowered (two theme/language test factories only gained the required ctor arg); SDK
  purity (pure codec in `:core:model`, stateless store in `:sdk-core`, the "which toggle / master-gates-subs"
  product orchestration in `:feature:settings`), SSOT (one codec, `.copy` merge), UDF (immutable
  `StateFlow<UiState>`), instant-app (cold-start hydration, no wrong-config flash), no dead ends (every toggle
  has a live consumer). Surpasses iOS, whose notification prefs are online-only server round-trips — here the
  toggle is instant + durable device-side (backend sync is a tracked follow-up).

### 2026-07-05 — slice `settings-interface-language` ✅ shipped
- **Step 0 (housekeeping):** the prior iteration's Android PR **#1504 (`settings-theme-mode`)** was still open
  from the last run — merged it first (CI all-green, diff apps/android-only, reviewer PASS documented, clean),
  squash → `main` `968550a`. The other open PRs are non-Android gateway/web/shared fixes. Then branched
  `claude/apps/android/settings-interface-language` off the freshly-merged `origin/main`.
- **Why this slice:** the §L "Recommended next" #1 — persisted interface (UI chrome) language. Mirrors the
  theme slice one step further (a picker dialog + an app-wide locale application), still a clean high-branch
  pure core with no media/upload dependency.
- **Pure core (`:core:model` `AppLanguage.kt`):** `supportedCodes`/`supportedLanguages` (from
  `LanguageData.interfaceLanguages` — the SSOT, fr/en/es/ar), `isSupported`, `fromStorage`/`storageValue`
  (trim+lowercase codec; `"system"`/blank/absent/unsupported → `null` = System), `resolveInterfaceLocaleTag`
  (effective tag or `null`), `info`. RED first (`AppLanguageTest`, 18 cases: supported set + order, codec both
  directions incl. round-trip, null/blank/system/unsupported/garbage arms, case/whitespace, resolver, info).
- **Durable store (`:sdk-core` `language/InterfaceLanguageStore.kt`):** `InterfaceLanguageStore` interface +
  `InMemoryInterfaceLanguageStore` (normalises seeds through the codec) + `DataStoreInterfaceLanguageStore`
  (decodes via the pure codec, hydrates on cold start with `stateIn(Eagerly)`). `@Singleton` in `SdkModule`
  over `preferencesDataStoreFile("meeshy_language")`. `InterfaceLanguageStoreTest` (9: in-memory default/seed/
  garbage-seed/update/unsupported-set; DataStore default-empty, set-reflected, hydrate-already-persisted,
  **corrupt-raw-token → System**). Reused the theme slice's one-DataStore-per-file-per-process hydration
  pattern (see NOTES).
- **Wiring:** `SettingsViewModel` mirrors `interfaceLanguageStore.languageCode` into
  `SettingsUiState.interfaceLanguage` + `setInterfaceLanguage` intent (`SettingsViewModelLanguageTest`, 5:
  default-System, reflects-persisted, set-persists-and-surfaces, set-null-returns-to-System, streams-into-state;
  the existing `SettingsViewModelThemeTest` factory got the new constructor arg, no assertion touched).
  `SettingsScreen` display-language row shows the current choice and opens a Material3 `AlertDialog`
  (System + flag/native-name radio options); EN/FR/ES/PT strings added. `MainActivity` + new `:app`
  `LanguageViewModel` re-localise the whole Compose tree live via `LocalizedContent` — a
  `createConfigurationContext`-localised `LocalContext`/`LocalConfiguration` provider gated by the pure
  `resolveInterfaceLocaleTag` (minSdk-26 safe, no AppCompat). **Regional** language row deliberately left
  no-op (it's a Prisme content-preference, not the app locale — tracked as next-slice #2).
- **Verification:** `gradle :core:model:… :sdk-core:… :feature:settings:testDebugUnitTest` green, then full
  `gradle assembleDebug testDebugUnitTest` green (0 failures, system Gradle 8.14.3). +32 new tests.
- **Reviewer gate:** PASS — diff `apps/android` only (15 files: 5 new + 10 modified, incl. docs/tests);
  behaviour-through-public-API tests, no tautologies, no floor lowered (theme test only gained the required
  ctor arg); SDK-purity (pure codec in model, stateless store in sdk-core, orchestration in app/feature), SSOT
  (one `resolveInterfaceLocaleTag`/`LanguageData.interfaceLanguages`, no re-implementation), UDF (immutable
  `StateFlow<UiState>`), instant-app (cold-start hydration, no wrong-language flash), no dead ends.

### 2026-07-05 — slice `settings-theme-mode` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (`list_pull_requests state=open` → the
  five open PRs are all non-Android gateway/web/shared fixes; none `claude/apps/android/*`). Branched
  `claude/apps/android/settings-theme-mode` off latest `origin/main` (`73f5201`).
- **Why this slice:** the §L "Recommended next" — persisted light/dark/system theme. Opens the Settings §L
  area with a clean, high-branch pure core (no media/upload dependency).
- **Pure core (`:core:model` `AppTheme.kt`):** `resolveDarkMode(systemInDark)`, `storageValue`, `next()`,
  `appThemeModeFromStorage(raw)` — all total over the enum, corrupt/blank/unknown/`"system"` → AUTO. RED
  first (`AppThemeTest`, 12 cases: every resolver arm, round-trip codec, null/blank/unknown/case/alias, cycle
  wrap ×3).
- **Durable store (`:sdk-core` `theme/ThemeStore.kt`):** `ThemeStore` interface + `InMemoryThemeStore`
  (tests/previews) + `DataStoreThemeStore` (Preferences DataStore, decodes via the pure codec, hydrates on
  cold start with `stateIn(Eagerly)`). Added `libs.datastore.preferences` to `:sdk-core`; `@Singleton`
  provider in `SdkModule` over `preferencesDataStoreFile("meeshy_theme")`. `ThemeStoreTest` (6: in-memory
  default/seed/update, DataStore default-on-empty, set-reflected, hydrate-already-persisted). Note: DataStore
  enforces one active instance per file per process — the hydration test shares one DataStore across two
  wrappers rather than reopening the file (see NOTES).
- **Wiring:** `SettingsViewModel` mirrors `themeStore.themeMode` into `SettingsUiState.themeMode` + `setThemeMode`/
  `cycleTheme` intents (`SettingsViewModelThemeTest`, 5: default, reflects-persisted, set-persists-and-surfaces,
  cycle-wrap, streams-into-state). `SettingsScreen` Appearance section = Material3 segmented System/Light/Dark
  picker (EN/FR/ES/PT strings). `MainActivity` + new `:app` `ThemeViewModel` re-theme live via
  `MeeshyTheme(darkTheme = mode.resolveDarkMode(isSystemInDarkTheme()))`.
- **Verification:** `gradle :app:assembleDebug` green; full `gradle testDebugUnitTest` green (0 failures;
  touched-module totals: core/model 461, sdk-core 426, feature/settings 5, app 34). +23 new tests.
- **Reviewer gate:** PASS — diff `apps/android` only (9 modified + 6 new, incl. docs/tests); behaviour-through-
  public-API tests, no tautologies, no floor lowered; SDK-purity (pure codec in model, stateless store in
  sdk-core, orchestration in app/feature), SSOT (one `resolveDarkMode`, reused by MainActivity), UDF (immutable
  `StateFlow<UiState>`), instant-app (cold-start hydration, no wrong-theme flash), no dead ends.

### 2026-07-05 — slice `profile-stats-timeline` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (`list_pull_requests state=open` → `[]`).
  Branched `claude/apps/android/profile-stats-timeline` off latest `origin/main` (`d94be65`).
- **Why this slice:** the §K "Next #3" (`profile-stats-timeline`) — the 30-day activity timeline. The
  `TimelinePoint` model already existed; the genuinely additive, pure, richly-coverable work was the
  timeline projection SSOT + the me-only fetch wiring + the sparkline.
- **Added / changed (production, `apps/android` only):**
  - `core/network` `UserApi.kt` — `getUserStatsTimeline(days) → ApiResponse<List<TimelinePoint>>`
    (`GET users/me/stats/timeline`, the me-only gateway route; the only per-user stats route is
    `/users/:id/stats`, so the timeline is never keyed by a viewed id).
  - `sdk-core` `UserRepository.kt` — `getUserStatsTimeline(days = 30)`, `days` clamped to the
    gateway-accepted `7..90` window.
  - `feature/profile` `StatsTimeline.kt` (new) — pure `StatsTimelineBuilder.build(points) →
    StatsTimelinePresentation?` (precedent `UserStatsBuilder`): **empty → `null`** (nothing to chart,
    mirrors iOS `if !timeline.isEmpty`); non-empty **all-zero → a flat presentation** with
    `hasActivity=false` (no divide-by-zero on a zero peak); **negative counts floored** so a malformed
    payload can't invert a bar/peak; each `TimelineBar.normalized` = count/peak (`0f..1f`); **input order
    preserved** (gateway emits oldest→newest); a `DD/MM` axis label via the internal `shortDate` ported
    from the iOS `StatsTimelineChart` (malformed date → raw string); plus `total`, rounded `averagePerDay`
    over every day (incl. silent ones), `activeDays`, `hasActivity`.
  - `ProfileViewModel.kt` — `ProfileUiState.timeline: StatsTimelinePresentation?`; `loadTimelineOnce()`
    fetches the timeline **once, own-profile only** (me-only endpoint — the other-profile branch never
    calls it), failure-inert exactly like `loadStatsOnce` (Cancellation rethrown; Failure/throw swallowed).
  - `ProfileScreen.kt` — a read-only `ProfileTimelineSection`: an "Activity" header + "N / day" average,
    then an accent-coherent **line + area sparkline** (Canvas, `colorScheme.primary`) when `hasActivity`,
    else a localized empty-state label. Pure rendering — every decision is upstream in the builder. 3 new
    strings × 4 locales (EN/FR/ES/PT). Compose glue only (coverage-exempt).
- **Tests (red → green):** +11 `StatsTimelineBuilderTest` (empty→null, single full-height bar, peak
  normalizes to 1 + proportional shorter days, all-zero flat/inactive no-divide-by-zero, negative floor,
  total+activeDays count only active days, average round-down 3.33→3, average round-half-up 2.5→3, order
  preserved, ISO→`DD/MM`, malformed date→raw) + 6 `ProfileViewModelTimelineTest` (own-profile success
  projection, Failure keeps timeline null + profile intact + no error, throw swallowed, loads exactly once
  across repeated session emissions, no load while session user absent, other-profile never loads). All
  behavioural through the public API (`build()` result, VM `state`); every `when`/`if` arm exercised.
- **Verification:** full `gradle assembleDebug testDebugUnitTest` (`meeshy.sh check`) **green** (system
  Gradle 8.14.3; wrapper dist still 403-blocked — see NOTES). Diff = `apps/android` only (3 prod edits +
  1 new prod + 4 res + 2 test).
- **Reviewer verdict:** **PASS** — pure projector in `:feature:profile` (product-side, consumes the
  existing `TimelinePoint` SSOT, no re-implementation), UDF VM + immutable `StateFlow`, cancellation-safe,
  me-only endpoint correctly gated, near-total branch coverage incl. empty/all-zero/negative/rounding
  boundaries + failure paths, UI kept dumb, colour via `MaterialTheme.primary` accent. No prod logic
  outside android.

### 2026-07-05 — slice `profile-stats-presentation` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The two open PRs (#1488 gateway/iOS
  calls, #1487 web utils) are unrelated work by another author — left untouched. Branched
  `claude/apps/android/profile-stats-presentation` off latest `origin/main`; the designated
  `claude/fervent-darwin-ceep4x` was exactly at main.
- **Why this slice:** the §K "Next #2" (`profile-stats-model`). The raw `UserStats`/`Achievement` models,
  `UserApi.getUserStats` and `UserRepository.getUserStats` already existed (online-only, untested), so the
  genuinely additive, pure, richly-coverable work was the **stats projection SSOT** + a real consumer.
- **Added / changed (production, `:feature:profile` only):**
  - `UserStatsPresentation.kt` (new) — pure `UserStatsBuilder.build(stats) → UserStatsPresentation`
    (precedent `ProfileHeaderBuilder`): six `StatTile`s in fixed dashboard order (negative counts floored);
    `AchievementBadge`s with every server value reconciled defensively — `progressPercent` clamped `0..100`,
    negative `current`/`threshold` floored, `isUnlocked` recomputed from `current >= threshold` when a
    threshold exists (else the server flag is trusted) — then ranked unlocked-first → progressPercent desc →
    current desc → id asc; `unlockedCount`/`totalCount` summary. Plus a pure boundary-safe
    `formatCompactCount(Int)` (`0..999` verbatim, then K/M/B with a dropped `.0`; tier thresholds are the
    pre-rounding magnitudes `999_950`/`999_950_000` so a value just under a tier rolls to `1M`/`1B`, never
    `1000.0K` — the same class of bug web PR #1487 F66 fixed).
  - `ProfileViewModel.kt` — `ProfileUiState.stats: UserStatsPresentation?`; `loadStatsOnce(id)` fetches
    `getUserStats` once per resolved user (own = session id when non-blank; other = `getProfile` result id,
    fallback to the requested id) and projects into state. Stats are a secondary surface: a `Failure` or a
    thrown exception is swallowed (Cancellation rethrown) — it never surfaces an error or clobbers the
    loaded profile.
  - `ProfileScreen.kt` — read-only view renders a 2-wide counter-tile grid (`surfaceVariant` cards, compact
    value + localized metric label) and, when badges exist, an "N of M unlocked" achievements list
    (unlocked names emphasised). 9 new strings × 4 locales (EN/FR/ES/PT). Compose glue only (coverage-exempt).
- **Tests (red → green):** +24 `UserStatsBuilderTest` (tile order/values, negative floor, empty stats,
  progress clamp over/under/mid, current+threshold floor, isUnlocked recompute both directions, no-threshold
  flag trust, unlocked-vs-locked ranking, progress-desc ordering, progress-tie → current → id tiebreak,
  unlocked/total counts, and the full `formatCompactCount` boundary sweep incl. 999/1000, 999_949/999_950,
  999_949_999/999_950_000, 2.1B, negative) + 5 `ProfileViewModelStatsTest` (success projection, Failure keeps
  stats null + profile intact + no error, throw swallowed, own-profile loads exactly once across repeated
  same-id session emissions, no load while session user absent). Behavioural through the public API; every
  `when`/`if` arm exercised.
- **Verification:** full `gradle assembleDebug testDebugUnitTest` (`meeshy.sh check`) **green** in ~3m12s
  (system Gradle 8.14.3; wrapper dist still 403-blocked — see NOTES). Diff = `apps/android` only (2 prod +
  1 new prod + 4 res + 2 test).
- **Reviewer verdict:** **PASS** — pure projector in `:feature:profile` (product-side, consumes existing
  model SSOT, no re-implementation), UDF VM + immutable `StateFlow`, cancellation-safe, defensive clamps
  mirror `ProfileHeaderBuilder`, near-total branch coverage incl. tier boundaries + tie-breaks + failure
  paths, UI kept dumb, colour via `MaterialTheme` tokens. No prod logic outside android.

### 2026-07-05 — slice `profile-details-rows` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1484/#1483/#1481/
  #1480/#1479/#1477/#1476/#1475/#1473) are all unrelated gateway/iOS/web work by another author — left
  untouched. Branched `claude/apps/android/profile-details-rows` off latest `origin/main` (`048e40b`, the
  merged `profile-header-presentation` #1482); the designated `claude/fervent-darwin-n7rvr5` was exactly
  at main.
- **Why this slice:** the #1 recommended §K follow-up — extend the just-landed profile header with its
  **secondary identity rows** (languages · country · timezone). Pure, richly branch-covered, no network.
- **Added / changed (production):**
  - `:feature:profile` `ProfileDetailRows.kt` (new) — pure `ProfileDetailRows.build(header) →
    List<ProfileDetailRow>` + `ProfileDetailKind` enum + `@Immutable ProfileDetailRow(kind, flag?, value)`.
    Rules: languages resolve flag+name from the `LanguageData` SSOT (`info(code.lowercase())`), unknown
    code → `flag=null`, `value=code.uppercase()`; a regional language equal to the system one
    (case-insensitively) is **collapsed**; country → regional-indicator flag iff exactly two ASCII letters
    (else `flag=null`, plain text kept); timezone → flagless raw row. Order: system · regional · country ·
    timezone.
  - `:feature:profile` `ProfileHeaderPresentation.kt` — added `timezone: String?` (blank→null degraded in
    `ProfileHeaderBuilder`, consistent with country).
  - `:feature:profile` `ProfileScreen.kt` — read-only view renders the rows below "member since" via
    `ProfileDetailsSection`/`ProfileDetailRowView` (label↔flag+value, `onSurfaceVariant`); empty list →
    nothing. 4 new label strings × 4 locales (EN/FR/ES/PT).
- **Tests (red → green):** +14 `ProfileDetailRowsTest` (empty, known/uppercase/unknown language, distinct
  vs collapsed-equal regional, regional-without-system, 2-letter country flag, uppercase country, full-name
  country, non-letter 2-char, timezone, full composition order) + 2 extended `ProfileHeaderBuilderTest`
  (timezone blank→null + pass-through, now 22). Test authored first against a non-existent `ProfileDetailRows`
  (compile-RED). Behavioural through the public API; every `when`/branch arm exercised.
- **Verification:** full `gradle assembleDebug testDebugUnitTest` (`meeshy.sh check`) **green** in 3m01s
  (system Gradle 8.14.3; wrapper dist 403-blocked — see NOTES). Diff = `apps/android` only (3 prod + 4 res
  + 2 test + docs).
- **Reviewer verdict:** **PASS** — pure projector in `:feature:profile` (product-side, consuming the header
  SSOT), `LanguageData` reused (no flag/name re-implementation), no prod logic outside android, near-total
  branch coverage incl. unknown-code / case-collapse / non-code-country / empty edges, UI kept dumb.

### 2026-07-05 — slice `outbox-lane-map-ssot` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The four open PRs (#1477/#1476/
  #1475/#1473) are all unrelated gateway/iOS work by another author — left untouched. Branched
  `claude/apps/android/outbox-lane-map-ssot` off latest `origin/main` (`b3c9675`, the merged
  `presence-away-indicator` #1474); the designated `claude/fervent-darwin-izcrp5` was exactly at main.
- **Why this slice:** structural close of the **lane-in-drain-list gotcha** flagged in NOTES 2026-07-04
  (the tracked "worker drain-list test" follow-up). `OutboxFlushWorker` kept a hand-maintained
  `listOf(...)` of shared lanes to drain, **disjoint** from the `buildSenders()` kind→sender registry —
  a kind could have a sender yet be stranded off the drain list (exactly the BLOCK/FRIEND omission that
  silently killed block/unblock + friend-request delivery). Rather than guard the drift with a
  Robolectric test, remove the drift: derive the drain list from a kind→lane SSOT.
- **Added / changed (production):**
  - `:sdk-core` `outbox/OutboxModel.kt` — new pure `OutboxLaneAssignment` (`PerConversation` |
    `Shared(lane)`) + `OutboxLaneMap.assignmentFor(kind)` (SSOT, **exhaustive `when`** over `OutboxKind`
    → a new kind cannot compile without a lane assignment) + derived `sharedDrainLanes` (every distinct
    `Shared` lane, stable enum order, deduped).
  - `:sdk-core` `outbox/OutboxFlushWorker.kt` — replaced the literal `lanes = listOf(...)` with
    `lanes = OutboxLaneMap.sharedDrainLanes`. Behaviour-preserving except it drops the always-empty
    `PRESENCE`/`SOCIAL` lanes (no kind maps there, no enqueue site → draining them was a no-op).
- **Tests (red → green):** +9 `OutboxLaneMapTest` — per-arm mapping (message→PerConversation;
  reaction/block collapse to their shared lane; each remaining kind → its dedicated lane), the
  `entries`-wide non-blank invariant, `sharedDrainLanes` covers every `Shared` kind, the BLOCK/FRIEND
  regression (both present), dedup (BLOCK/REACTION appear once), and per-conversation lanes never leak
  into the shared list. Behavioural through the public API; every `when` arm exercised.
- **Verification:** `assembleDebug` + all `testDebugUnitTest` **green** (system Gradle 8.14.3; wrapper
  dist 403-blocked — see NOTES). Diff = `apps/android` only (2 prod + 1 test + docs).
- **Reviewer verdict:** **PASS** — pure stateless SSOT in `:sdk-core`, worker derives from it (no
  re-implementation), no prod logic outside android, every kind-arm + dedup + regression edge covered,
  a drift-class bug made structurally impossible rather than merely tested.

### 2026-07-04 — slice `presence-away-indicator` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. One open PR (#1473) is unrelated
  iOS story-text work by another author (`claude/text-editor-enhancements`); left untouched. Branched
  `claude/apps/android/presence-away-indicator` off latest `origin/main` (`d40529c`); the designated
  `claude/fervent-darwin-g3xfvo` was exactly at main (0 ahead / 0 behind).
- **Why this slice:** the last Contacts-list display gap that had a genuine **pure testable core**. The
  `:core:model` `PresenceState` (ONLINE/AWAY/OFFLINE) + `UserPresence` were fully **dead code** (no
  non-test caller, no test), while the friend row only rendered a binary green dot from `isOnline` —
  never the iOS three-state green/**amber-away**/none (`PresenceModels.swift` `UserPresence.state`,
  away at lastActive > 5min). Bring the dead SSOT to life and wire it.
- **Added / changed (production):**
  - `:core:model` `IsoTime.kt` — new `isoToEpochMillisOrNull(value): Long?` (null for absent/blank/
    unparseable, the parsed epoch otherwise — the epoch instant `0L` is a **valid** result, not "absent");
    `isoToEpochMillis` now delegates (`?: 0L`), one parse path preserved.
  - `:core:model` `Presence.kt` — pure `UserPresence.state(nowEpochMillis): PresenceState` (offline →
    OFFLINE; online + no reliable `lastActiveAt` → ONLINE; else AWAY iff `now - last > 300_000ms`,
    boundary/future → ONLINE) + `AWAY_THRESHOLD_MS = 300_000L` (iOS 300s parity, clock injected for purity).
  - `:core:model` `friend/ContactList.kt` — `FriendRequestUser.presenceState(now)` adapter (nullable
    `isOnline` → offline, bridges the roster record to the `UserPresence.state` SSOT).
  - `:feature:contacts` `ContactsListTab.kt` — friend row renders green(ONLINE)/amber(AWAY)/none(OFFLINE)
    via a pure `presenceDotColor(state): Color?` mapping + new static `AwayIndicator` (0xFFFBBF24), reading
    `friend.presenceState(System.currentTimeMillis())`. Semantic dot colours kept static per the design system.
- **Tests (red → green):** +23 — `IsoTimeTest` (8: null/blank/unparseable → null, UTC + offset parse,
  epoch-as-zero-not-absent, `isoToEpochMillis` 0L default), `PresenceTest` (10: offline regardless of
  timestamp, online on null/blank/unparseable, recent → online, 300s boundary → online, 300s+1ms → away,
  1h → away, future → online), `FriendPresenceTest` (5: null/false `isOnline` → offline, recent → online,
  stale → away, no-timestamp → online). Behavioural through the public API; boundary + null edges covered.
- **Verification:** `assembleDebug` + all `testDebugUnitTest` **green** (system Gradle 8.14.3; wrapper
  dist 403-blocked — see NOTES). Diff = `apps/android` only (4 prod + 3 test + docs).
- **Reviewer verdict:** **PASS** — pure SSOT in `:core:model`, UI glue in `:feature:contacts`, no prod
  logic outside android, near-total branch coverage on the resolver, boundary/null/future edges tested,
  dead code brought to parity rather than re-implemented.

### 2026-07-04 — slice `contacts-filter-counts` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The five open PRs (#1463–1469)
  are all unrelated non-Android work by others (gateway/iOS/shared). Branched
  `claude/apps/android/contacts-filter-counts` off latest `origin/main` (`65e856d`); the designated
  `claude/fervent-darwin-j6y6z9` was exactly at main (0 ahead/0 behind).
- **Why this slice:** parity `§J` gap — the Contacts filter chips (All/Online/Offline) showed **no
  counts**, but the iOS `ContactFilter` chips do (audit part-01.md:301,310 "All/online chips show
  counts"). A small, pure-core-heavy slice closing a tracked Contacts follow-up ("per-filter counts")
  with a strong testable invariant.
- **Added / changed (production):**
  - `:core:model` `friend/ContactList.kt` — new immutable `ContactFilterCounts(all, online, offline)`
    with `forFilter(filter)` (pass-through filters mirror `All`) + `Zero`; new pure
    `ContactList.counts(friends, query) → ContactFilterCounts` — sizes each chip under the **active
    search query** (`counts(..).online == visible(.., Online, query).size`), with online+offline
    partitioning all by construction (offline = matching − online). **Surpasses iOS**, whose chip
    counts ignore the search field.
  - `:feature:contacts` `ContactsListViewModel.kt` — `ContactsListUiState.filterCounts` derives the
    counts from the roster + query (pure, no new state).
  - `:feature:contacts` `ContactsListTab.kt` — the `FilterRow` chips render `label  count` via
    `counts.forFilter(filter)` (the `when` stays in the pure accessor, composable is thin glue).
- **Tests (TDD red→green, +7):**
  - `ContactListTest` (+6): counts report all/online/offline of the roster; **online+offline partition
    all under any query** (invariant); counts respect the search query (only bob → all 1 / online 0 /
    offline 1); empty roster → all zero; `forFilter` maps each selectable filter; pass-through filters
    (Phonebook/Affiliates) mirror the whole roster.
  - `ContactsListViewModelTest` (+1): `filterCounts` reflects the loaded roster (all 2 / online 1 /
    offline 1) then shrinks correctly when a search query is applied.
- **Edge cases covered:** empty collection (all zero); search-narrowed roster; the partition invariant;
  the two pass-through filters; blank vs non-blank query.
- **Verification:** `gradle :core:model:testDebugUnitTest :feature:contacts:testDebugUnitTest` —
  **BUILD SUCCESSFUL** (both green); `gradle :app:assembleDebug` — **BUILD SUCCESSFUL** (the Compose
  chip change compiles into the APK). Per NOTES, the wrapper's pinned dist is egress-blocked, so used
  system Gradle 8.14.3.
- **Reviewer gate:** **PASS** — diff is `apps/android` only (5 files: 2 prod + 2 test + 1 Compose glue,
  plus tracking docs); TDD behavioural through the public API, no tautologies (the partition test
  asserts a derived invariant, not a set constant), no floor lowered; SDK purity held (the counting
  SSOT is a pure `:core:model` function, the `when` lives in `forFilter` not the composable);
  single-source-of-truth (`counts` reuses `visible`, no re-implemented filter); instant-app + UDF
  preserved (pure derived state, no new mutable field); colour/nav untouched.
- **Follow-up:** mood-emoji presence on rows; the send **compose-new** UI; a worker drain-list test.

### 2026-07-04 — slice `discover-suggestions-room-cache` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the two open PRs, #1463 iOS
  calls + #1464 shared mentions, are unrelated non-Android work by others). Branched
  `claude/apps/android/discover-suggestions-room-cache` off latest `origin/main` (`b532c2c`).
- **Why this slice:** PROGRESS "Recommended next" — the **suggestions Room cache for cold-start paint**,
  the **last in-memory-only cache gap**. `SuggestionsRepository` held its empty-query discover list in a
  `MutableStateFlow` `InMemorySuggestionsSource`, so a cold launch (process death) lost it and showed a
  skeleton until the network answered. This makes it durable (iOS `CacheCoordinator.userSearch` parity),
  mirroring the `FriendEntity`/`CallHistoryEntity` precedents — a pure-core-heavy SWR slice.
- **Added / changed (production):**
  - `:core:database` `entity/SuggestionEntity.kt` (NEW) — `discover_suggestions` table: `userId` PK,
    serialized `UserSearchResult` `payload`, `sortIndex` (preserves the gateway ranking order verbatim —
    never re-derived in SQL), `cachedAt`.
  - `:core:database` `dao/SuggestionDao.kt` (NEW) — `observeAll()` `ORDER BY sortIndex ASC`, `upsertAll`,
    `deleteNotIn`, `clear`.
  - `:core:database` `MeeshyDatabase.kt` — register `SuggestionEntity` + `suggestionDao()`, **version
    8→9**; `DatabaseModule.kt` — Hilt `providesSuggestionDao` (destructive migration, the module's
    standing `fallbackToDestructiveMigration`).
  - `:sdk-core` `friend/SuggestionsRepository.kt` — replaced `InMemorySuggestionsSource` with a
    Room-backed `RoomSuggestionsSource` (`SwrCacheSource`, port of `CallHistoryCacheSource`): `observe()`
    combines `suggestionDao.observeAll()` + `sync_meta` (cold `null` vs synced-empty), `revalidate()`
    fetches `searchUsers("")` and persists (upsert + `deleteNotIn`, or `clear` for empty) stamping
    `sync_meta`; `SuggestionsRepository` gained the DB/DAO deps and constructs the Room source. The
    `suggestionsStream(onSyncError)` public API is byte-identical, so `DiscoverViewModel` is untouched.
- **Tests (TDD red→green, 11 replacing the old 5 in-memory-source tests):**
  - `SuggestionsRepositoryTest` (rewritten, Robolectric + real in-memory Room): revalidate fetches +
    stamps sync time; **`sortIndex` preserves a deliberately non-alphabetical gateway order** over any
    SQL re-sort; cold cache observes `null`; a synced-but-empty list reads back as empty content (not
    cold); `deleteNotIn` drops absentees; a later empty sync clears a populated cache; a cold failure
    throws `SuggestionsSyncException` and leaves the cache cold; a failed revalidation keeps the last
    good list + sync time; `suggestionsStream` emits `Empty` then paints the fetched list (drains the
    transient Room-settle frame); **a pre-seeded cache paints instantly with no cold `Empty`** (the
    cold-start-paint behaviour); a cold failure surfaces via `onSyncError`.
- **Edge cases covered:** empty / populated / synced-empty vs cold `null`; non-alphabetical order
  round-trip; row removal; cold vs warm revalidation failure (throws vs keeps stale); process-death
  cold paint; the transient two-Room-flow settle frame (benign, drained in the assertion).
- **Verification:** `gradle assembleDebug testDebugUnitTest` — **BUILD SUCCESSFUL** (full project, all
  modules' unit tests green; whole-app compile exercises the DB v9 schema + Hilt wiring). Per NOTES, the
  wrapper's pinned Gradle 8.11.1 dist is egress-blocked (github redirect 403) in this container, so
  verification used the preinstalled system Gradle 8.14.3 (forward-compatible).
- **Reviewer gate:** **PASS** — diff is `apps/android` only (6 code files + 3 tracking docs); TDD behavioural through the public
  API, no tautologies, no floor lowered (the 5 removed tests are superseded by 11 stronger Room-backed
  ones); SDK purity held (entity/DAO in `:core:database`, the stateless `SwrCacheSource` in `:sdk-core`,
  orchestration untouched in `:feature:contacts`); single source of truth (ranking SSOT stays
  server-side via `sortIndex`; `CachePolicy.Suggestions` unchanged); instant-app cache-first (cold paint,
  skeleton only on cold empty) + UDF preserved; colour/nav untouched.
- **Follow-up:** the send **compose-new** UI (dedicated user-search → connect surface) — now the main
  remaining Contacts gap; and a worker drain-list test (tracked from the prior slice).

### 2026-07-04 — slice `contacts-friends-room-cache` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (only an unrelated iOS PR
  #1459 was open). Branched `claude/apps/android/contacts-friends-room-cache` off latest
  `origin/main` (`5a7008d8`).
- **Why this slice:** PROGRESS "Recommended next" / parity `§J` follow-up #1 — a **persistent Room
  `friends` cache for cold-start paint** (iOS `CacheCoordinator.friends`). The Contacts tab was
  network-first + in-memory reconciled only: a cold launch showed a skeleton and blocked on the
  received/sent fetch before any friend appeared. This adds a durable cache so the last-known roster
  paints instantly (cache-first, ARCHITECTURE.md §4), surviving process death and working offline.
  Pure-core-heavy SWR slice with a clear iOS precedent; destructive DB migration (v7→8, the module's
  standing `fallbackToDestructiveMigration`).
- **Added / changed (production):**
  - `:core:database` `entity/FriendEntity.kt` (NEW) — `friends` table: `userId` PK, serialized
    `FriendRequestUser` `payload`, `sortIndex` (preserves `ContactList`'s assembled order verbatim —
    ordering SSOT stays in `ContactList`, never re-derived in SQL), `cachedAt`.
  - `:core:database` `dao/FriendDao.kt` (NEW) — `observeAll()` `ORDER BY sortIndex ASC`, `upsertAll`,
    `deleteNotIn`, `clear`.
  - `:core:database` `MeeshyDatabase.kt` — register `FriendEntity` + `friendDao()`, **version 7→8**;
    `DatabaseModule.kt` — Hilt `providesFriendDao`.
  - `:sdk-core` `friend/FriendListRepository.kt` (NEW, `@Singleton`) — a focused, network-free
    persistence brick: `cachedSnapshot()` (null = cold/never-synced, distinguished from a
    synced-but-empty roster via `sync_meta`; else decoded rows in persisted order) + `persist(friends)`
    (write-through: upsert + `deleteNotIn`, or `clear()` for an empty roster, and stamp `sync_meta`).
  - `:feature:contacts` `ContactsListViewModel.kt` — cache-first: `load()` now `paintFromCache()`
    first (instant cold paint; skeleton only on a cold `null` snapshot), then `revalidate()` (the
    existing received/sent fetch → `ContactList` assemble → `FriendshipCache` hydrate) writes the
    roster back through `persist`. A cross-screen unfriend prunes locally **and** writes the pruned
    roster through (no refetch); an addition still triggers one silent refetch.
- **Tests (TDD red→green, +14 net):**
  - `FriendListRepositoryTest` (NEW, Robolectric + real in-memory Room) +8 — cold snapshot is `null`;
    persist→snapshot round-trips order + full payload; **`sortIndex` honoured over any SQL re-sort**
    (an offline contact deliberately ahead of an online one survives); `deleteNotIn` drops absentees;
    an empty persist is synced-empty (not cold); newest write wins; rows observable via the DAO.
  - `ContactsListViewModelTest` +6 — paints the cached roster instantly while the network fetch is
    suspended; keeps the cache and shows no error when the refresh fails; a cold-empty cache shows the
    skeleton until the network answers; persists the assembled roster after a load; a cross-screen
    unfriend writes the pruned roster through **without** a refetch. Existing 13 tests preserved
    (constructor gained the new dep; no assertion weakened).
- **Verification:** `gradle assembleDebug testDebugUnitTest` — **BUILD SUCCESSFUL** (full project, all
  modules' unit tests green; whole-app compile exercises the DB v8 schema + DI wiring). The wrapper's
  pinned Gradle 8.11.1 distribution is egress-blocked (github redirect 403) in this container, so
  verification used the system Gradle 8.14.3 (forward-compatible superset), same as prior slices.
- **Reviewer gate:** **PASS** — diff is `apps/android` only (8 files); TDD behavioural through the
  public API, no tautologies, no floor lowered; edge cases (cold vs synced-empty vs populated; empty
  persist; order preservation; refresh-failure keeps cache; unfriend prune-through) covered; SDK
  purity held (`FriendListRepository` = stateless persistence brick in `:sdk-core`, entity/DAO in
  `:core:database`, orchestration in `:feature:contacts`); ordering SSOT stays in `ContactList`;
  instant-app cache-first (skeleton only on cold empty) + UDF preserved; colour/nav untouched.
- **Follow-up:** the send **compose-new** UI (dedicated user-search → connect surface); a persistent
  Room suggestions cache (iOS `CacheCoordinator.userSearch`) — the last in-memory-only cache gap.

### 2026-07-04 — slice `friend-request-outbox-idempotency` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration; no open PRs at all. Branched
  `claude/apps/android/friend-request-outbox-idempotency` off latest `origin/main` (`fe8c9c6f`).
- **Why this slice:** PROGRESS "Next" #2 / parity `§J` — the **durable friend-request send** was the
  sole remaining Contacts durable-mutation gap. `DiscoverViewModel.connect` was online-first REST
  (`friendRepository.sendFriendRequest`), minting the pending entry only on the gateway's success — a
  dropped connection silently lost the send and left no pending state. This routes it through the
  shared durable outbox so it survives offline + process death, with an idempotent-send dedup and a
  delivery-outcome classifier faithful to the gateway's 409-conflict contract. Pure-core-heavy, **no
  DB migration** (reuses the outbox schema). Surpasses iOS (online-only send).
- **Added / changed (production):**
  - `:sdk-core` `outbox/OutboxModel.kt` — new `OutboxKind.SEND_FRIEND_REQUEST` + `OutboxLanes.FRIEND`
    lane + `@Serializable FriendRequestPayload(message: String?)` (receiver = the row `targetId`).
  - `:sdk-core` `outbox/OutboxCoalescer.kt` — `SEND_FRIEND_REQUEST → replaceSameKind`: a repeated send
    to the same receiver supersedes the pending one (only one request can exist — idempotent, latest
    greeting wins).
  - `:sdk-core` `friend/FriendRequestSend.kt` (NEW) — pure total `classify(NetworkResult<FriendRequest>)
    → FriendRequestDelivery` (`Delivered(id)` / `AlreadyExists` / `Retry` / `Rejected(reason)`): success
    with a real id grafts it back; a 409 or blank-id success is an idempotent already-exists (never
    retried, never rolled back); other 4xx (400/403/404/422) are permanent rejects; 5xx/offline retry.
  - `:sdk-core` `friend/FriendRepository.kt` — `enqueueSendFriendRequest(receiverId, cmid?, message?)`:
    durable enqueue on the FRIEND lane; blank receiver inert (`null`); accepts a caller-supplied `cmid`
    so the row and the optimistic placeholder request id share one key. Injects `OutboxRepository`.
    The online `sendFriendRequest` stays as the building block the worker sender calls.
  - `:sdk-core` `outbox/OutboxFlushWorker.kt` — `SEND_FRIEND_REQUEST` sender (decode payload →
    `friendRepository.sendFriendRequest` → `FriendRequestSend.classify` → graft real id via
    `friendshipCache.didSendRequest` on `Delivered`, `Success` on `AlreadyExists`, `TransientFailure`
    on `Retry`, `PermanentFailure` on `Rejected`) + `onExhausted` `friendshipCache.rollbackSendRequest`.
    Injects `FriendRepository` + `FriendshipCache`.
  - **Latent-bug fix:** `OutboxLanes.BLOCK` (shipped last slice) and the new `FRIEND` were **absent from
    the worker's shared-lane drain list**, so block/unblock rows never delivered. Added both — closes the
    silent gap in `block-outbox-durable` and makes this slice's delivery actually run.
  - `:feature:contacts` `DiscoverViewModel.kt` — `connect` rewired to the durable optimistic path: flips
    `FriendshipCache` (Pending, instant even offline) keyed by the outbox `cmid` placeholder, queues via
    `enqueueSendFriendRequest`, wakes the flush worker only on a real cmid, and rolls the optimistic flip
    back on a **local enqueue failure** (`CancellationException` rethrown). Injects `WorkManager`.
- **Tests (TDD red→green, +26 net):**
  - `FriendRequestSendTest` +9 — full branch sweep: delivered-real-id, blank-id→already-exists,
    409→already-exists, 400/403/404/422→rejected(reason), 5xx→retry, offline(null status)→retry.
  - `OutboxCoalescerTest` +3 — first friend request enqueues, repeated send to same receiver supersedes,
    different receiver not coalesced.
  - `FriendRepositoryTest` (NEW, Robolectric + real in-memory outbox) +5 — durable send queues a
    SEND_FRIEND_REQUEST row on the FRIEND lane keyed by the returned cmid; payload carries the greeting;
    blank receiver inert; a supplied cmid keys the row; a repeated send supersedes (latest payload).
  - `DiscoverViewModelTest` +4 net — connect queues durably + flips Pending optimistically + wakes the
    flusher; a coalesced (`null` cmid) send flips Pending but skips the flush; a **local enqueue throw**
    rolls the optimistic Pending back to Connect + surfaces the error + queues nothing; own-row and
    non-connectable-row inert (assert `enqueueSendFriendRequest` never called).
- **Verification:** `gradle :app:assembleDebug testDebugUnitTest` — **BUILD SUCCESSFUL** (full project,
  all modules' unit tests green). The wrapper's pinned 8.11.1 distribution download is egress-blocked
  (github redirect 403) in this container, so verification used the system Gradle 8.14.3 (forward-
  compatible superset), same as the prior slice.
- **Reviewer gate:** **PASS** — diff is `apps/android` only (10 files); TDD behavioural, no tautologies,
  no floor lowered; edge cases (blank/unknown/own id, coalesce, enqueue-failure rollback, in-flight
  guard, `CancellationException` rethrown, idempotent 409, permanent-vs-transient split) covered; SDK
  purity held (classifier/coalescer/repo = stateless rule + durable enqueue in `:sdk-core`, optimistic
  orchestration in `:feature:contacts`); SSOT = `FriendshipCache`; UDF + instant-app (offline-first
  optimistic flip) preserved; colour/nav untouched.
- **Follow-up:** the send **compose-new** UI (dedicated user-search → connect surface); a persistent
  Room `friends` cache for cold-start paint (iOS `CacheCoordinator.friends`) — the recommended next.

### 2026-07-04 — slice `block-outbox-durable` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The one open PR (#1453) is
  web/gateway work from another session (production logic in `apps/web` + `services/gateway`), left
  untouched. Branched `claude/apps/android/block-outbox-durable` off latest `origin/main` (`6cd1a3c4`).
- **Why this slice:** parity `§J` / PROGRESS "Next Contacts pure cores" — **durable offline
  unblock/block**, the one remaining Contacts durable-mutation gap after Discover closed. The Blocked
  tab's unblock was online-first optimistic REST (a dropped connection silently lost it); this routes
  it through the shared durable outbox so it survives offline + process death (iOS is online-only).
  A pure-core-heavy vertical slice with **no DB migration** (block/unblock carry no payload and reuse
  the existing outbox schema).
- **Added / changed (production):**
  - `:sdk-core` `outbox/OutboxModel.kt` — two new `OutboxKind`s (`BLOCK_USER`, `UNBLOCK_USER`) + a
    dedicated `OutboxLanes.BLOCK` lane (so block mutations coalesce per-target without colliding with
    other social rows sharing a target id).
  - `:sdk-core` `outbox/OutboxCoalescer.kt` — new `blockToggle` branch: a queued **opposite** for the
    same user **annihilates** (block+unblock returns to the last-synced server state, exactly like the
    reaction toggle); else a pending **same-kind** row is **superseded** (a repeated block/unblock is
    idempotent — one terminal state); else enqueue.
  - `:sdk-core` `outbox/OutboxFlushWorker.kt` — two senders (`blockApi.block`/`unblock` →
    `Success`/`TransientFailure`) + an `onExhausted` rollback that flips the `BlockCache` SSOT back
    (a hard-exhausted block/unblock un-does its optimistic flip, so the next `listBlocked` re-hydrates
    truthfully). Injects `BlockApi` + `BlockCache`.
  - `:sdk-core` `friend/BlockRepository.kt` — replaced the online-first `block`/`unblock` with
    `setBlockedDurably(userId, blocked)`: flips `BlockCache` optimistically + enqueues the durable
    mutation. Blank id inert (`null`); returns the cmid, or `null` when the enqueue annihilated a
    pending opposite. `listBlocked` (hydration) unchanged.
  - `:feature:contacts` `BlockedListViewModel.kt` — `unblock` now calls `setBlockedDurably(.., false)`,
    wakes the flush worker **only** on a real cmid (a coalesced-away enqueue schedules nothing), and
    rolls the row back in place on a **local enqueue failure** (cancellation-safe). Injects `WorkManager`.
  - `:feature:contacts/build.gradle.kts` — `implementation(libs.work.runtime)` for the VM's scheduler.
- **Tests (TDD red→green, +12 net):**
  - `OutboxCoalescerTest` +6 — block↔unblock annihilation (both directions), repeated block/unblock
    supersede, first-block enqueue, different-user not coalesced.
  - `BlockRepositoryTest` +4 net (converted to Robolectric for the real in-memory outbox, the
    established enqueue-repo pattern) — durable block/unblock flip+queue the right kind on the BLOCK
    lane, blank id inert (no flip, nothing queued), block-then-unblock cancels out (empty queue, cache
    reflects the net terminal state).
  - `BlockedListViewModelTest` +2 net — durable unblock removes-optimistically + wakes the worker;
    a coalesced-away (`null` cmid) unblock **skips** the flush; a **local enqueue throw** restores the
    row + surfaces the error and queues nothing; unknown-id inert; in-flight double-tap guarded.
- **Verification:** `gradle assembleDebug testDebugUnitTest` — **BUILD SUCCESSFUL** (full project; the
  wrapper's pinned 8.11.1 distribution download is egress-blocked in this container, so verification
  used the system Gradle 8.14.3, a forward-compatible superset — build + all unit tests green).
- **Reviewer gate:** **PASS** — diff is `apps/android` only (9 files); TDD behavioural, no tautologies,
  no floor lowered; edge cases (blank/unknown id, annihilation, enqueue-failure restore, in-flight
  guard, `CancellationException` rethrown) covered; SDK purity held (coalescer/repo = stateless rule +
  SSOT keeper in `:sdk-core`, orchestration in `:feature`); SSOT = `BlockCache`; UDF preserved.
- **Follow-up:** the ready `setBlockedDurably(.., true)` block half awaits a profile/report block
  surface; a persistent Room blocklist cache for cold-start paint (iOS `CacheCoordinator`) still open.

### 2026-07-04 — slice `discover-suggestions-cache-first` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the two open PRs (#1450, #1448)
  are iOS work from other sessions (production logic, not Android), left untouched. Branched
  `claude/apps/android/discover-suggestions-cache-first` off latest `origin/main` (`cdda4598`).
- **Why this slice:** parity `§J` "Next" — the last pending Discover item (`loadSuggestions`, cache-first
  empty-query suggestions). Live search + inline connect already shipped; this closes the empty-query
  surface. A clean pure-core-heavy vertical slice with no DB migration (in-memory cache, consistent with
  the friends-list in-memory precedent; persistent Room deferred as a tracked follow-up).
- **Added (production):**
  - `:sdk-core` `friend/DiscoverSuggestions.kt` — pure `SuggestionsSnapshot` + total
    `DiscoverSuggestions.snapshot(CacheResult<List<UserSearchResult>>) → SuggestionsSnapshot`: cold
    `Empty`/`Syncing(null)` → skeleton (the ONLY loading state); any cached data (`Fresh`/`Stale`/
    `Syncing(data)`) paints without a spinner; a revalidated-empty list is content, not a spinner. Port
    of iOS `loadSuggestions` loadState/searchResults handling.
  - `:sdk-core` `friend/SuggestionsRepository.kt` — `@Singleton SuggestionsRepository` exposing
    `suggestionsStream(onSyncError)` = the shared `cacheFirstFlow(CachePolicy.Suggestions, source)` over
    an internal in-memory `SwrCacheSource` (`InMemorySuggestionsSource`): `revalidate()` hits
    `UserRepository.searchUsers("", 20, 0)` (iOS empty-query = gateway "discover" list), stores the last
    good fetch + sync time, throws `SuggestionsSyncException` on failure (surfaced via `onSyncError`),
    and keeps prior data on a failed revalidation.
  - `:sdk-core` `cache/CachePolicy.kt` — new `Suggestions` policy (fresh 1 min, kept 6 h).
  - `:feature:contacts` `DiscoverViewModel` — `loadSuggestions()` (idempotent while streaming; called on
    tab appear) folds the stream through `DiscoverSuggestions.snapshot` into the existing `rows`/connect-
    control surface, so suggestions get live relationship badges + cross-screen re-derivation for free;
    a search cancels the suggestions job and switches surfaces; `retry` re-runs it. `DiscoverUiState`
    gains `isShowingSuggestions` + derived `isSuggestionsEmpty`; `showEmptyPrompt` now also gates on the
    suggestions surface. `DiscoverTab` loads on appear (`LaunchedEffect`), shows a "Suggestions" list
    header, and a quiet empty state (strings ×4 locales).
- **Tests (+23):** `DiscoverSuggestionsTest` (6 — every `CacheResult` arm incl. empty-list content),
  `SuggestionsRepositoryTest` (5 — revalidate success/cold-failure/failure-keeps-prior; SWR stream
  Empty→Fresh; cold failure via `onSyncError`), `DiscoverViewModelTest` (+12 — paint, cold skeleton,
  revalidated-empty quiet state, failed revalidation surfaces error, connect on a suggestion row,
  cross-screen re-derive, idempotent-while-streaming guard, search cancels+switches, retry re-runs).
- **Edge cases covered:** cold empty (skeleton), stale/expired paint-without-spinner, revalidated-empty
  (content not spinner), network failure (message surfaced, last data kept), idempotent load guard,
  surface switch (suggestions↔search), retry restart, single/empty collections.
- **Verify:** full `assembleDebug` + all module `testDebugUnitTest` → **BUILD SUCCESSFUL** (run with the
  system Gradle 8.14.3 — the wrapper's 8.11.1 distribution download is egress-policy-blocked in this
  container; AGP 8.7.3 runs clean on 8.14.3. CI uses the wrapper's 8.11.1). See NOTES.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no tautologies; SDK purity (the
  cache source + repository + pure projection are stateless building blocks in `:sdk-core`; the "when to
  load / which surface" product rule lives in the `:feature:contacts` ViewModel); single source of truth
  (reuses `cacheFirstFlow`/`CacheResult`/`CachePolicy`, `ConnectAction`, the shared resolver); Instant-App
  (cache-first, skeleton only on cold empty); UDF + immutable `UiState`; accent-coherent rows, no dead end.

### 2026-07-04 — slice `contacts-blocked-list` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the one open PR (#1444,
  `claude/upbeat-euler-s5qysh`) is an iOS a11y annotation change from another session (production
  logic, not Android), left untouched. Branched `claude/apps/android/contacts-blocked-list` off
  latest `origin/main` (`67b70e8f`).
- **Why this slice:** PROGRESS/parity "Next" #3 for Contacts — the last un-bound half of the
  relationship resolver. The `UserRelationshipResolver` shipped with a `BlockStatusProvider` **seam**
  (`{ false }`); this slice supplies the real block data (SSOT + repository + list UI) and binds the
  seam. Port of iOS `BlockService` + `BlockedViewModel`/`BlockedTab`. Also promotes the 4th Contacts
  tab from placeholder → live, so no dead-end tab remains.
- **Added (production, 5 files):**
  - `:core:model` `friend/BlockedUser.kt` — `@Serializable` `BlockedUser` (id/username/displayName/
    avatar/`blockedAt` as raw ISO string, keeping the module date-free) + pure `resolvedName` (display
    name → username, port of iOS `BlockedUser.name`).
  - `:core:network` `net/api/BlockApi.kt` — `GET users/me/blocked-users`, `POST users/{id}/block`,
    `DELETE users/{id}/block` (iOS `BlockService` endpoints) + `BlockActionResponse`; wired through
    `MeeshyApi.blocks` + a `NetworkModule` `@Provides`.
  - `:sdk-core` `friend/BlockCache.kt` — `@Singleton` in-memory blocklist SSOT (port of iOS
    `BlockService.blockedUserIds`): `isBlocked`/`hydrate`(full-replace, blank-skip)/`setBlocked`
    (blank-inert)/`clear`, `currentBlockedIds` defensive snapshot, `version: StateFlow<Int>` bumped
    on every mutation. The `BlockStatusProvider` binds straight onto `isBlocked`.
  - `:sdk-core` `friend/BlockRepository.kt` — over `BlockApi` + `BlockCache`: `listBlocked` hydrates
    the cache on success; `block`/`unblock` flip the single entry on success; a failure never touches
    the cache.
  - `:feature:contacts` `BlockedListViewModel.kt` — UDF VM over `BlockRepository`: `load()` (skeleton
    only on cold empty), `unblock()` optimistic remove + `pendingIds` guard + snapshot rollback on
    failure, `dismissError()`. Pure `showSkeleton`/`isEmpty` derivations.
- **Wired (product UI, `:feature:contacts`):** `BlockedTab.kt` — the Blocked tab (was placeholder)
  renders the blocklist (accent-seeded `MeeshyAvatar` via `DynamicColorGenerator`, name/`@username`),
  an `Unblock` button → `AlertDialog` confirm → optimistic unblock, distinct cold-skeleton /
  error+retry / empty states. `ContactsScreen` mounts it (removed the `ComingSoon` placeholder + its
  now-dead string in all 4 locales; the `when` is now exhaustive over all 4 tabs). `DiscoverViewModel`
  now builds its `BlockStatusProvider` from the shared `BlockCache` (was `{ false }`), so a blocked
  user resolves live to `ConnectAction.Blocked`. +9 strings in all four locales (en/fr/es/pt).
- **Tests (red→green, +29, 0 skips):** 4 `BlockedUserTest` (`resolvedName` present/null/blank/both-
  empty), 9 `BlockCacheTest` (fresh/hydrate/full-replace/blank-skip/setBlocked toggle/blank-inert-no-
  bump/defensive-copy/version-count/clear), 6 `BlockRepositoryTest` (list success hydrates + failure
  untouched; unblock success flips off + failure keeps; block success flips on + failure untouched),
  9 `BlockedListViewModelTest` (load populate/empty-state/error/cold-skeleton-in-flight via a gated
  deferred/optimistic remove/failure rollback/unknown-id inert/in-flight guard via gated deferred/
  dismissError), +1 `DiscoverViewModelTest` (a blocked user → `ConnectAction.Blocked` via the shared
  cache — proves the seam is consumed). Behaviour through the public API; no tautologies.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest
  :feature:contacts:testDebugUnitTest :app:assembleDebug` → BUILD SUCCESSFUL; suites
  BlockedUserTest 4/4, BlockCacheTest 9/9, BlockRepositoryTest 6/6, BlockedListViewModelTest 9/9,
  DiscoverViewModelTest 17/17, module totals core:model 413/0/0, sdk-core 343/0/0, feature:contacts
  51/0/0 (tests/skipped/failures); `:app:assembleDebug` green (Hilt DI wiring compiles end-to-end).
  (Bootstrapped Android SDK + `/opt/gradle` 8.14.3 per NOTES; wrapper dist still 403.)
- **Reviewer verdict:** PASS — diff is `apps/android` only (5 prod + 1 UI + 1 wiring + strings×4 +
  4 test files + these docs), no production logic elsewhere; TDD red→green, behaviour through the
  public API, no tautologies, no weakened floors; SDK purity kept (pure model in `:core:model`,
  stateful store + repository in `:sdk-core`, VM + Compose in `:feature:contacts`); SSOT respected
  (`BlockCache` the one blocklist, `resolvedName` the one name rule, the resolver seam now bound —
  no re-implementation); instant-app (skeleton only cold empty, populated list paints immediately);
  UDF + immutable `StateFlow`; accent-coherent rows + confirm dialog, no dead-end (4th tab now live);
  edges covered (empty blocklist, blank/unknown id inert, in-flight guard, failure rollback, full
  hydrate replace + blank-skip).

### 2026-07-04 — slice `discover-user-search` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the one open PR (#1440,
  `claude/eager-hamilton-x3zdk6`) is an iOS/gateway calls audit from another session (production
  logic, not Android), left untouched. Branched `claude/apps/android/discover-user-search` off latest
  `origin/main` (`6b2a335f`).
- **Why this slice:** PROGRESS/parity "Next" for Contacts — the `UserRelationshipResolver` (#1431)
  and the `FriendshipCache` needed their **read-side consumer**. The Discover tab was still
  `ComingSoon()`; this is the live user-search + inline-connect surface, port of iOS `DiscoverViewModel`
  search path + `ConnectionActionView`.
- **Added (production, 2 files):**
  - `:core:model` `me.meeshy.sdk.model.friend.DiscoverSearch.kt` — two pure SSOTs: `DiscoverSearch.action(raw)
    → DiscoverSearchAction{Clear|Search(trimmed)}` (trim + ≥2-char gate, port of iOS `performSearch`
    guard; the sub-threshold path clears instead of hitting the network), and `ConnectAction.from(state)
    → {Hidden|Connect|Pending|Accept(id)|Contact|Blocked}` — the inline-connect button-decision SSOT
    derived from `UserRelationshipState` (port of the iOS `ConnectionActionView` switch, total over
    all six arms).
  - `:feature:contacts` `DiscoverViewModel.kt` — UDF VM over `UserRepository` + `FriendRepository` +
    `FriendshipCache` + `UserRelationshipResolver` (built in-VM with a `{ false }` block seam, no
    BlockRepository yet). `onQueryChanged` folds through `DiscoverSearch.action` (Clear cancels the job
    + empties rows; Search launches a cancel-the-previous search job); results map to `DiscoverRow`s
    carrying a derived `ConnectAction`; `connect` sends a request (mints the pending entry via
    `didSendRequest` only on success, so the row flips to Pending — parity with iOS) with an in-flight
    `pendingActionIds` guard; `acceptReceived` accepts an inbound request optimistically
    (`didAcceptRequest`) with `rollbackAccept` on failure; a `version`-flow collector re-derives every
    visible row's `ConnectAction` on any cross-screen friendship mutation. Pure `DiscoverUiState`
    derivations: `isSearchActive`/`showEmptyPrompt`/`isNoResults`.
- **Wired (product UI, `:feature:contacts`):** `DiscoverTab.kt` — search field + result `LazyColumn`
  with accent-seeded `MeeshyAvatar` (`DynamicColorGenerator`), name/`@username`, and an inline
  `ConnectControl` switching on `ConnectAction` (Connect `FilledTonalButton` / Accept / disabled
  Pending / Contact check badge / Blocked / hidden-for-self). Distinct loading / error+retry /
  empty-prompt / no-results states. `ContactsScreen` mounts it on the Discover tab (was `ComingSoon`).
  +8 strings in all four locales (en/fr/es/pt).
- **Tests (red→green, +29, 0 skips):** 13 `DiscoverSearchTest` (action: blank/whitespace/1-char/
  exactly-2 boundary/longer/trim/padded-single; `ConnectAction.from` every one of the six arms), 16
  `DiscoverViewModelTest` (sub-threshold clears w/ 0 network calls; searchable query populates rows w/
  Connect; no-results state; failure→error+empty rows; friend→Contact + sent→Pending derivation; self
  row Hidden + inert connect; connect success flips to Pending + mints cache; connect failure surfaces
  error, stays connectable, no cache write; non-connectable connect inert; acceptReceived optimistic
  befriend + clears pending; accept failure rollback; cross-screen change re-derives rows; clear-after-
  search empties + showEmptyPrompt; retry re-runs current query; retry sub-threshold inert; dismissError).
  Behaviour through the public API, no tautologies.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :feature:contacts:testDebugUnitTest
  :app:assembleDebug` → BUILD SUCCESSFUL (DiscoverSearchTest 13/13, DiscoverViewModelTest 16/16, 0
  failures/skips); full `testDebugUnitTest` across all modules → BUILD SUCCESSFUL; `:app:assembleDebug`
  green. (Bootstrapped Android SDK + `/opt/gradle` 8.14.3 per NOTES; wrapper dist still 403.)
- **Reviewer verdict:** PASS — diff is `apps/android` only (2 prod + 1 UI + 4 locale strings + 2 test
  files + these docs), no production logic elsewhere; TDD red→green, behaviour through the public API,
  no tautologies, no weakened floors; SDK purity kept (pure search-gate + button-decision in
  `:core:model`, VM + Compose orchestration in `:feature:contacts`, the resolver/cache reused from
  `:sdk-core`); SSOT respected (`DiscoverSearch` the one search gate, `ConnectAction` the one button
  decision, `UserRelationshipResolver` the one relationship read — no re-implementation); UDF +
  immutable `StateFlow`; accent-coherent rows, no dead-end (self hidden, cross-screen consistency);
  edges covered (empty/boundary query, self row, non-connectable rows, every failure/rollback path,
  in-flight guard, cross-screen re-derive).

### 2026-07-04 — slice `contacts-list-friends` ✅ shipped
- **Step 0 (housekeeping):** the prior iteration's Android PR **#1431** (`friendship-relationship-resolver`)
  was open, apps/android-only, CI green, `mergeable_state: clean` → **squash-merged to `main`** before
  starting. Synced local `main`, branched `claude/apps/android/contacts-list-friends` off it.
- **Why this slice:** PROGRESS "Next" #1 — the friendship SSOT (#1431) needed its consumer. Port of iOS
  `ContactsListViewModel`: the friend graph is exactly the accepted friend requests (no `/friends`
  endpoint), so the list is built from received+sent accepted requests, online-first, reconciled
  against the shared `FriendshipCache` on every cross-screen mutation.
- **Added (production, 3 files):**
  - `:core:model` `me.meeshy.sdk.model.friend.ContactList.kt` — the pure derivation SSOT:
    `ContactFilter` enum (All/Online/Offline/Phonebook/Affiliates, parity with iOS `ContactsShared`),
    the `FriendRequestUser.resolvedName` display-name SSOT (port of iOS `.name`), and `object ContactList`
    with `fromAcceptedRequests(received, sent, currentUserId)` (counterparty pick, dedup by id via
    `LinkedHashMap`, online-first then most-recently-active sort), `visible(friends, filter, query)`
    (filter + trimmed case-insensitive username/name search), and `reconcile(current, cacheFriendIds)`
    → `ContactReconcile(friends, needsRefetch)` (drop non-cache friends locally, flag one refetch for
    unknown additions — port of iOS `reconcileWithCache`).
  - `:sdk-core` `FriendshipCache.currentFriendIds` — a defensive (locked-copy) snapshot of the accepted
    friend-id set (port of iOS `FriendshipCache.friendIds`), the read model reconcile consumes.
  - `:feature:contacts` `ContactsListViewModel.kt` — UDF VM over `FriendRepository` + `FriendshipCache`
    + `SessionRepository`: `load()` fetches received+sent (limit 100), hydrates the cache, folds via
    `ContactList.fromAcceptedRequests`; `setFilter`/`search` drive the derived `visibleFriends`; a
    `version`-flow collector reconciles on cross-screen mutations (removals local, additions → one
    silent refetch, guarded by `lastReconciledFriendIds` against loops). `ContactsListUiState` exposes
    pure `visibleFriends`/`showSkeleton`/`isFilteredEmpty`/`isEmpty` derivations.
- **Wired (product UI, `:feature:contacts`):** `ContactsListTab.kt` — the Contacts tab (was
  `ComingSoon()`) now renders search + All/Online/Offline `FilterChip` row + online-first `LazyColumn`
  of friend rows (accent-seeded `MeeshyAvatar` via `DynamicColorGenerator`, name, `@username`, success-
  green presence dot), skeleton only on cold empty, distinct filtered-empty / cold-empty / error+retry
  states. `ContactsScreen.displayLabel` refactored to defer to the new `resolvedName` SSOT. +8 strings
  in all four locales (en/fr/es/pt).
- **Tests (red→green, +38, 0 skips):** 25 `ContactListTest` (resolvedName 4, fromAcceptedRequests 8
  incl. accepted-only/counterparty/self-exclusion/dedup/no-counterparty/online-first/recency/null-date,
  visible 9 incl. every filter arm + search/trim/combine/no-match, reconcile 4 incl. drop/refetch/inert/
  empty), +2 `FriendshipCacheTest` (currentFriendIds accepted-only + defensive-copy), 11
  `ContactsListViewModelTest` (online-first load, self-exclusion, cache hydration, both-fail error,
  filter, search, dismissError, cross-screen unfriend drops locally w/ exactly-1 fetch, unknown addition
  → exactly-2 fetches, plus showSkeleton / isFilteredEmpty state derivations). All behavioural through
  the public API; no tautologies.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest
  :feature:contacts:testDebugUnitTest :app:assembleDebug` → BUILD SUCCESSFUL; suites
  ContactListTest 25/25, FriendshipCacheTest 15/15, ContactsListViewModelTest 11/11, ContactsViewModelTest
  14/14, 0 failures/0 skips; `:app:assembleDebug` green. (Bootstrapped the Android SDK + `/opt/gradle`
  8.14.3 per NOTES; wrapper dist still 403.)
- **Reviewer verdict:** PASS — diff is `apps/android` only (3 prod + 1 UI + strings + 3 test files +
  these docs), no production logic elsewhere; TDD red→green (2 VM tests were RED on unrealistic payloads
  — fixed the test fixtures to carry both id-strings and user objects as the gateway does, not the
  production code); behaviour through the public API, no tautologies, no weakened floors; SDK purity kept
  (pure derivation in `:core:model`, cache snapshot in `:sdk-core`, VM + Compose orchestration in
  `:feature:contacts`); SSOT respected (`ContactList` the one list derivation, `resolvedName` the one
  display-name rule, `FriendshipCache` the one friend graph); instant-app (skeleton only on cold empty,
  populated roster paints immediately); edges covered (empty roster, self-as-friend, missing counterparty,
  null presence/date sort, filter×search combine, cross-screen add/remove, loop-guarded reconcile).

### 2026-07-04 — slice `friendship-relationship-resolver` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (open PRs #1423–#1430 were all
  iOS/gateway/web from other sessions, untouched). Branched
  `claude/apps/android/friendship-relationship-resolver` off latest `origin/main` (`e5a65563`).
- **Why this slice:** the Calls area's remaining work is WebRTC/Telecom platform glue (no more pure
  testable cores), and Contacts is already in-progress (`[~]` hub + Requests tab). The natural
  highest-value pure vertical is the **friendship / relationship-state SSOT** — the read model every
  future Discover / profile / contact-cell surface needs, plus the write store the Requests tab feeds.
  Port of iOS `UserRelationshipState.swift` + `FriendshipCache.swift`.
- **Added (production, 3 files):**
  - `:core:model` `me.meeshy.sdk.model.friend.UserRelationship.kt` — the pure `FriendshipStatus`
    (`Friend`/`PendingSent(id)`/`PendingReceived(id)`/`None`) and `UserRelationshipState`
    (`Current`/`Blocked`/`Connected`/`PendingSent`/`PendingReceived`/`None` + `isPending`) sealed
    models, and the total `UserRelationshipRules.resolve(target, currentUserId, isBlocked, friendship)`
    precedence SSOT: blank target → None; current wins over everything; block wins over friendship;
    else friendship maps straight through (faithful to iOS `UserRelationshipResolver.resolve`).
  - `:sdk-core` `FriendshipCache.kt` — `@Singleton` in-memory friend-graph store (port of iOS
    `FriendshipCache`): three disjoint `synchronized` stores (friendIds / sentPending `receiver→reqId`
    / receivedPending `sender→reqId`), `status(userId)` lookup, `hydrate(sent, received)` (accepted→
    friend, pending→directional, other statuses dropped, blank counterparty skipped, full replace so
    stale entries can't survive), optimistic mutations (didSend/Cancel/Accept/Reject/Receive/Remove),
    rollbacks, `clear()`, count accessors, and a `version: StateFlow<Int>` bumped on every mutation
    (Android analogue of the iOS `@Published version`).
  - `:sdk-core` `UserRelationshipResolver.kt` — the thin stateful wiring over the pure rules: a
    `BlockStatusProvider` fun-interface seam (mirrors iOS `BlockServiceProviding.isBlocked`; no
    Android BlockService yet) + `FriendshipCache.status` + a current-user provider. Short-circuits the
    block lookup on a blank id.
- **Wired (product, `:feature:contacts`):** `ContactsViewModel` now takes the `@Singleton
  FriendshipCache` (default-constructed fallback keeps existing direct-construction tests intact) and
  keeps it in lock-step with the Requests tab: `loadRequests` hydrates it when both fetches succeed;
  accept → `didAcceptRequest` (rollback `rollbackAccept` on failure); decline → `didRejectRequest`
  (rollback `rollbackReject`); cancel → `didCancelRequest` (restore via `didSendRequest` on failure).
  The store is genuinely consumed — not orphan code.
- **Tests (red→green, +36):** 10 `UserRelationshipRulesTest` (blank/current/block/friendship
  precedence, every arm, `isPending` across all states, null current id), 13 `FriendshipCacheTest`
  (every mutation + rollback + hydrate mapping/replace/blank-skip + clear + version-bump count), 8
  `UserRelationshipResolverTest` (each state, block-over-friend, blank short-circuits the provider,
  null current id), +5 `ContactsViewModelTest` (hydrate on load, accept befriends, accept-failure
  rollback, decline drops without befriending, cancel-failure restore). All behavioural through the
  public API; no tautologies.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest
  :feature:contacts:testDebugUnitTest` green (new suites 10/10, 13/13, 8/8, ContactsVM 14/14, 0
  skipped); `:app:assembleDebug` green. (`./gradlew`/`meeshy.sh` still 403 on the wrapper dist — used
  the preinstalled `/opt/gradle` 8.14.3 per NOTES.)
- **Reviewer verdict:** PASS — diff is `apps/android` only (3 prod + 4 test files + these docs), no
  production logic elsewhere; TDD red→green, behaviour through the public API, no tautologies, no
  weakened floors; SDK purity kept (pure precedence in `:core:model`, stateful store + resolver in
  `:sdk-core`, product hydrate/optimistic wiring in `:feature:contacts`); SSOT respected (one
  relationship resolver, no re-implementation); edges covered (blank id, null current user, block>
  friend precedence, hydrate full-replace + blank-skip, every rollback/failure path).

### 2026-07-03 — slice `call-sender-cap-plan` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (open PRs #1410/#1412/#1413/#1414/#1416
  were all iOS/gateway, untouched); last Android slice `call-ended-identity-teardown` (#1415) already merged
  to `main`. Branched `claude/apps/android/call-sender-cap-plan` off latest `origin/main` (`f301d5e`).
- **What (next testable pure core #3 in Calls):** the adaptive **video-sender-cap plan** — the pure
  `core:model` SSOT that turns a `VideoQualityLevel` (network) + a device thermal tier into the concrete RTP
  sender parameters (`maxBitrateBps` / `maxFramerate` / `scaleResolutionDownBy`) a future WebRTC actuator
  applies to the outbound video track. Port of iOS `WebRTCService.applyVideoQuality` composed with
  `VideoThermalProfile.apply` — the network ladder picks the target, an independent thermal ceiling sheds
  encode load on a hot device, and the **more conservative** value wins per axis.
- **Added (production, 2 files):**
  - new `VideoSenderCap.kt` (`core:model`) — pure `ThermalState` enum (framework-agnostic port of iOS
    `ProcessInfo.ThermalState`; the app maps Android `PowerManager.THERMAL_STATUS_*` onto it), the
    `ThermalCeiling` value type (`bitrateFactor`/`maxFramerate`/`minScaleDownBy`, `forState` at iOS
    `VideoThermalProfile.ceiling` parity, `NOMINAL` a strict no-op), the `VideoSenderCap` bundle, and the
    `VideoSenderCapPlan` object: `forLevel(level)` reads each axis off the tier and falls back to the CRITICAL
    floor (360p15 @ 100 kbps) when the tier target is `0` (no zero encoder; `scaleResolutionDownBy =
    max(1.0, 720 / height)` so it never upscales); `forConditions(level, thermal)` composes the two, taking
    the min bitrate/fps and the steeper downscale, hard-floored at `1`/`1`/`1.0`.
  - `CallQuality.kt` (`core:model`) — three new `CallQualityThresholds` floor constants
    (`MIN_VIDEO_BITRATE_BPS=100_000`, `CRITICAL_VIDEO_FLOOR_FPS=15`, `CRITICAL_VIDEO_FLOOR_HEIGHT=360`) at
    iOS `QualityThresholds` parity. No existing constant or behaviour changed.
- **Tests (red→green, +17 `VideoSenderCapPlanTest`):** every level's network cap (EXCELLENT/GOOD 720p, FAIR
  480p, POOR 360p, CRITICAL floored — not zero); the never-upscale invariant across all levels; all four
  thermal ceiling arms; composition — nominal keeps the full cap, a hot device sheds bitrate+fps+scale on an
  excellent link, the network fps/downscale wins when already stricter than the thermal cap, the thermal
  floor lifts a gentle downscale, exact bitrate rounding, and the `≥1`/`≥1.0` hard floors across every
  level×thermal pair.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest` green (17/17 in the new suite,
  no regression across the module); `:core:model:assembleDebug` green. (`./gradlew`/`meeshy.sh` still 403 on
  the wrapper dist download from GitHub releases — used the preinstalled `/opt/gradle` 8.14.3, per NOTES.)
- **Reviewer verdict:** PASS — diff is `apps/android` only (2 prod files + 1 test file + these docs), no
  production logic elsewhere; TDD red→green, behaviour through the public API, no tautologies, no weakened
  floors; SDK purity kept (a stateless pure decision in `core:model`, the platform thermal mapping left as
  app-side glue); edges covered (CRITICAL zero-target floor, never-upscale, per-axis conservative composition,
  hard `1`/`1.0` floors).
- **PR + merge:** PR #1417, squash-merged to `main` (`d5443c08`). CI: 11/13 checks green (Quality-bun,
  Security, Prisma, Test shared/agent/web, Audio Pipeline, TTS/STT, Voice API + Trivy-neutral); the two
  heaviest coverage suites (**Test gateway**, **Test Python**) were stuck in a degraded/contended runner
  (`Run tests with coverage` step >110 min for suites that normally finish in minutes) — a pure infra hang,
  not a failure, on JS/Python code the `apps/android`-only diff never touches and which `main` (the
  merge-base `e078f29`) already passes. No red anywhere; branch protection allowed the squash. Recorded in
  NOTES as the CI-runner-hang lesson.

### 2026-07-03 — slice `call-ended-identity-teardown` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (open PRs #1410/#1412/#1413/#1414
  were all iOS/gateway, untouched). Branched `claude/apps/android/call-ended-identity-teardown` off latest
  `origin/main` (`b2fcdf5`).
- **What (bug fix, closes the `call-ended-signal-identity` known follow-up):** the FSM-facing identity-less
  `CallSignalManager.events` used to carry a `call:ended`/`call:missed` teardown as `RemoteHangUp`/`RingTimeout`,
  which `CallViewModel.dispatch` folded **blindly** into the *active* FSM. The gateway fans `call:ended` out
  to every member USER room, so a busy user (one call active + a second ringing as a call-waiting banner)
  received the *waiting* call's teardown too — and it tore down the **active** call. Now teardown is
  identity-gated end-to-end: only the active call's own end reduces its FSM.
- **Changed (production, 3 files):**
  - `CallSignalMapper` (`core:model`) — `map` now returns `null` for `call:ended`/`call:missed` (they are
    no longer FSM-facing). Replaced `endedCallId(): String?` with `endedSignal(): CallEndedSignal?` — the
    single, total, identity-carrying teardown decode (id + the `RemoteHangUp`/`RingTimeout` the FSM reduces).
    Blank/absent id or malformed JSON → `null` (an untargetable teardown is dropped, never applied blindly).
  - new `CallEndedSignal(callId, event)` (`core:model`, pure value type).
  - `CallSignalManager.endedCalls` (`sdk-core`) — now `SharedFlow<CallEndedSignal>` (was `String`); `listen`
    routes teardown frames through `endedSignal` only. This is the **sole** teardown path.
  - `CallViewModel.onRemoteEnded(CallEndedSignal)` (`feature:calls`) — active id match → `dispatch(event)`
    into the FSM; else waiting id match → `RemotelyEnded` (dismiss banner, no `emitEnd`); else inert.
- **Tests (red→green):**
  - `CallSignalMapperTest` — ended/missed now inert to `map`; +11 `endedSignal` cases (completed/rejected/
    no-reason→RemoteHangUp, missed-reason & missed-frame→RingTimeout, non-teardown/initiated→null,
    blank-ended/blank-missed/absent id→null, malformed→null).
  - `CallSignalManagerTest` — ended/missed emit **nothing** on `events`; endedCalls republishes the rich
    `CallEndedSignal` (RemoteHangUp / RingTimeout by reason); non-teardown & blank id emit nothing.
  - `CallViewModelTest` — the waiting caller hangs up → banner cleared, **active call untouched** (the bug);
    the active call's own remote end → `ENDED`/`Remote` (with a banner up → banner stays; without one too);
    a missed teardown for the active ringing call → `ENDED`/`Missed`; an id matching neither → fully inert;
    an ended id with no active call & no banner → inert.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest
  :feature:calls:testDebugUnitTest` green; `:app:assembleDebug` green; full `testDebugUnitTest` (all modules)
  green. (`./gradlew`/`meeshy.sh` still 403 on the wrapper dist — used the preinstalled `/opt/gradle`, per NOTES.)
- **Reviewer verdict:** PASS — diff is `apps/android` only (3 prod files + tests + these docs), no production
  logic elsewhere; TDD red→green, no tautologies, no weakened floors (the two `map`→teardown tests were
  *re-specified* because that mapping was the bug, not weakened); SDK purity kept (pure decode in `core:model`,
  stateless stream in `sdk-core`, the "which call to tear down" rule in the `feature:calls` VM); every edge
  covered (blank/absent/unrelated id, idle, malformed).

### 2026-07-03 — slice `call-ended-signal-identity` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (only open PR #1410 was iOS,
  untouched). Branched `claude/apps/android/call-ended-signal-identity` off latest `origin/main`
  (`6de9912e`).
- **What:** drove the `CallWaitingEvent.RemotelyEnded` reducer branch (already the tested SSOT, shipped
  with `call-waiting-banner`) from a real socket signal — a call-waiting banner now auto-dismisses when
  its caller hangs up (or its ring times out) before the user acts, parity with iOS
  `clearPendingIncomingCall(ifMatching:)`.
- **Added (production, 3 files, +50 lines):**
  - `CallSignalMapper.endedCallId(eventName, rawJson): String?` (`core:model`, pure/total) — decodes the
    `callId` from a `call:ended`/`call:missed` frame; a non-teardown event, a blank/absent id, or malformed
    JSON all yield `null`. Mirrors the existing `incomingOffer` identity decode; `map` left untouched so no
    existing mapper contract changes.
  - `CallSignalManager.endedCalls: SharedFlow<String>` (`sdk-core`) — republishes the ended id for every
    teardown frame in `listen`, the same parallel-stream pattern as `incomingOffers` (hot, no replay). The
    identity-less `events` emission is unchanged (existing manager tests intact).
  - `CallViewModel.onRemoteEnded(endedCallId)` (`feature:calls`) — collected in `viewModelScope`; folds a
    match on the *pending* call's id into `CallWaitingEvent.RemotelyEnded` (stop the auto-reject timer +
    clear the banner) with **no** `emitEnd` (the caller already ended it); inert when there is no pending
    banner or the id is another call's, so the active call is never disturbed.
- **Tests (+15, red→green):**
  - `CallSignalMapperTest` +7 — ended→id, missed→id, non-teardown→null, initiated→null, blank id→null,
    absent id→null, malformed JSON→null.
  - `CallSignalManagerTest` +4 — ended frame republishes id, missed frame republishes id, non-teardown
    emits nothing, blank id emits nothing.
  - `CallViewModelTest` +4 — waiting caller hangs up → banner cleared, **no** `emitEnd`, active call
    untouched (still `INCOMING`); ended id ≠ waiting id → banner stays; ended id with no banner → inert;
    a remotely-ended waiting call cancels its auto-dismiss timer (a later timer fire does not `emitEnd`).
- **Edge cases covered:** blank/absent/malformed teardown payload; non-teardown frame; no pending banner
  (inert); id mismatch (active-call id, unknown id) leaves banner up; timer cancellation after a remote
  end (no double-resolve → no spurious `emitEnd`); remote end distinguished from user reject (no wire emit).
- **Verify:** system `gradle assembleDebug testDebugUnitTest` (wrapper dist download is 403-blocked in this
  container; `/opt/gradle` 8.11.1 matches the wrapper version) → **BUILD SUCCESSFUL in 2m30s** (full
  assemble + all module JVM unit tests). Targeted: `:core:model` 32/`:sdk-core` (CallSignalManagerTest 36)
  /`:feature:calls` (CallViewModelTest 72) — 0 failures, 0 errors.
- **Reviewer:** PASS — scope `apps/android` only (3 prod + 3 test, +184 lines); behavioural tests through
  the public API (`endedCallId` return, `endedCalls` flow emission, VM `waitingBanner` + `emitEnd`
  verification), no tautologies, no coverage floor lowered, no existing test weakened; SDK purity (the
  identity decode + republish are building blocks in `core:model`/`sdk-core`; the "when a teardown dismisses
  *this* banner" product rule lives in `:feature:calls`); single source of truth (the `CallWaitingReducer`
  `RemotelyEnded` branch); UDF + immutable `UiState`, pure reducer; no dead end (banner dismiss returns to a
  coherent active call). **Known follow-up (logged in Next):** the identity-less `events` fold still routes a
  *waiting* call's `call:ended` into the *active* FSM — an identity-aware active-call teardown is the next
  Calls slice.

### 2026-07-03 — slice `call-waiting-banner` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The three open PRs at start
  (#1399 iOS-a11y `CameraView`, #1400 gateway/security notification routes, #1401 web/gateway calls
  rate-limit) are `jcnm` continuous-improvement branches from other sessions — all disjoint from
  `apps/android`, left untouched. Branched `claude/apps/android/call-waiting-banner` off freshly-fetched
  `origin/main` (`9d30066c`).
- **Gap closed:** `feature-parity §H` "Next pure core #2" — a second incoming call arriving while a call
  is active. iOS surfaces a `CallWaitingBannerView` (accept-and-swap / reject-busy / 15s
  auto-dismiss-as-reject) driven by `CallManager.pendingIncomingCall`; Android had no equivalent — a
  second offer while busy was silently dropped (the FSM-facing `events` stream discards caller identity,
  so `ReceiveIncoming` while `Connected` was inert).
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallWaiting.kt` — `WaitingCall(callId, callerId, callerName, isVideo)` + the pure
    `from(CallInitiatedPayload)` builder (blank-id → null; four-tier name resolution display→username→userId
    →`WAITING_CALL_FALLBACK_NAME`, skipping blank candidates, parity with `CallRecord.displayName`;
    `type=="video"` → isVideo). `CallWaitingReducer.kt` — `CallWaitingState(pending?)` + total
    `reduce(state, event)` over `Offered`(newest-wins) / `Rejected` / `Accepted` / `RemotelyEnded(callId)`
    (clears iff the id matches; inert otherwise or with no pending). `CallSignalMapper.incomingOffer(raw)`
    — the pure identity decode parallel to `map()`.
  - `:sdk-core` `CallSignalManager.incomingOffers: SharedFlow<WaitingCall>` — the same `call:initiated`
    listener now also republishes the decoded caller identity (hot, no replay, like `events`).
  - `:feature:calls` `CallViewModel` folds `incomingOffers`: `onIncomingOffer` routes a *second* offer
    (`CallState.isActive` && different callId) to the reducer and arms the auto-dismiss timer;
    `rejectWaiting()` emits `call:end` keyed by the **waiting** id (active call untouched) + clears;
    `acceptWaitingSwap()` hangs up the active call, settles, and `start()`s the waiting call as a fresh
    incoming (parity with iOS re-report). `CallWaitingTimer` seam (mirrors `CallSecondsTicker`) emits once
    after 15s → reject-if-still-pending. `CallPresenter` derives `CallUiState.waitingBanner: WaitingBannerUi?`.
    `CallScreen` renders an accent-coherent top banner (error-hue reject + peer-accent answer, a11y labels,
    FR/ES/PT/EN strings).
  - **+35 behavioural tests:** 16 `CallWaitingTest` (builder incl. every name-resolution arm + blank-id +
    media flag; state derivation; every reducer arm incl. newest-wins, match/mismatch/no-pending
    `RemotelyEnded`), +3 `CallSignalMapperTest` (`incomingOffer` decode/null/malformed), +3
    `CallSignalManagerTest` (offer republish, malformed no-emit, non-initiated no-emit), +11
    `CallViewModelTest` (raise banner while active; idle no-banner; redelivery ignored; newest-wins; reject
    ends waiting id only; reject inert with none; 15s auto-dismiss = reject; accept-swap ends current +
    re-presents + joins new room; accept inert with none; fresh start clears stale banner), +2
    `CallPresenterTest` (empty → null, pending → banner).
- **Verification:** `gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest` then
  `gradle :feature:calls:testDebugUnitTest`, then full `gradle assembleDebug testDebugUnitTest` →
  **BUILD SUCCESSFUL** (APK assembles, all module unit tests green). System Gradle 8.14.3 online through
  the agent proxy — see NOTES.md (the `./gradlew` wrapper's distribution host is egress-blocked 403; the
  cached wrapper dist is a 0-byte `.part`, so use the system `gradle` binary online, NOT `--offline`).
- **Reviewer gate:** PASS — diff is `apps/android` only (17 files: 3 new + 6 modified code, 4 strings, 4
  test files), no production logic outside `apps/android`, TDD behavioural (no tautologies, no floor
  lowered, no test weakened), edge cases covered (blank id, no-initiator fallback, redelivery, newest-wins,
  no-pending inert, cancellation-safe self-completing timer job), SDK purity respected (pure SSOT in
  `:core:model`, transport-only flow in `:sdk-core`, orchestration in `:feature:calls`), accent-coherent
  banner + natural top-overlay gesture, single source of truth (`DynamicColorGenerator` accent, reducer
  the sole banner authority). No secrets, `local.properties` gitignored.
- **Known follow-up (documented, not an orphan):** the `RemotelyEnded` reducer arm is the tested SSOT but
  is not yet socket-driven — `events` maps `call:ended`/`call:missed` identity-less, so a banner whose
  caller hangs up before the user acts currently clears only via reject/accept/15s-timeout. A small
  signalling-identity slice (surface the ended `callId`) wires the last arm. See "Next pure core #2".

### 2026-07-03 — slice `call-webrtc-plumbing-emits` ✅ shipped
- **Step 0 (housekeeping):** the prior Android iteration's PR **#1387 (`call-video-survival-policy`) was
  already squash-merged to `main`** (`1c2bb259`, verified `VideoSurvivalPolicy.kt` present on
  `origin/main`). No open Android PR from a prior iteration. The one open PR (#1392) is a `jcnm`
  iOS-a11y branch from another session — disjoint from `apps/android`, left untouched. Branched
  `claude/apps/android/call-webrtc-plumbing-emits` off freshly-fetched `origin/main` (verified the recent
  `VideoSurvivalPolicy.kt` symbol is present on the fresh checkout before coding).
- **Gap closed:** the call-domain outbound emit table stopped at the lifecycle frames
  (`join`/`leave`/`end`/`toggle-audio`/`toggle-video`/`signal`/`initiate`). iOS also emits five
  WebRTC-plumbing frames the gateway needs for liveness, TURN refresh, quality persistence, and reconnect
  bookkeeping (`MessageSocketManager.emitRequestIceServers`/`emitCallHeartbeat`/`emitCallQualityReport`/
  `emitCallReconnecting`/`emitCallReconnected`). Android had none of them — feature-parity §H flagged this
  as the last outbound-signalling gap. This slice ports the emits with the branch-rich `stats` builder as a
  pure, JVM-tested core.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallQuality.kt` gains `ConnectionQuality.wireValue` (`excellent|good|fair|poor`, spelled
    out so an enum rename can't silently change the wire token) and the new `CallQualityReport` data class
    with the total pure `statsFields(): Map<String, Any>` — the SSOT for the `call:quality-report` `stats`
    sub-object. Base five metrics (`level`/`rtt`/`packetLoss`/`bytesSent`/`bytesReceived`) always present;
    `availableOutgoingBitrateBps` and `jitterMs` appended **only when strictly positive** (iOS parity — a
    not-yet-available `0` or degenerate negative is dropped so the gateway never persists a meaningless
    value). Byte counters are `Long` (iOS uses a 64-bit `Int`) so a long video call whose cumulative totals
    exceed the 32-bit range are reported faithfully instead of overflowing.
  - `:sdk-core` `CallSignalManager` gains `emitRequestIceServers(callId)`, `emitHeartbeat(callId)`,
    `emitQualityReport(callId, report)` (wraps `report.statsFields()` in `{callId, stats}`),
    `emitReconnecting(callId, participantId, attempt)`, `emitReconnected(callId, participantId)` — all at
    iOS-exact event names + payload keys. The manager owns only the transport; the `stats` decision lives
    once in the pure builder.
  - **+16 behavioural tests:** 10 `CallQualityReportTest` (base keys/values, every `ConnectionQuality`
    tier → wire level, bitrate present/absent across the `0`/negative/positive boundary, jitter likewise,
    both-optionals ordering `inOrder`, `Long` counters beyond `Int.MAX`) + 6 `CallSignalManagerTest`
    (request-ice-servers/heartbeat callId payloads, quality-report nested stats with & without the
    optionals, reconnecting callId/participantId/attempt, reconnected callId/participantId). Every branch
    of `statsFields()` is exercised.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest :sdk-core:testDebugUnitTest`
  → **BUILD SUCCESSFUL** (CallQualityReportTest 10/10, CallSignalManagerTest 29/29, 0 skipped/failed);
  full-project `assembleDebug` green. System Gradle 8.14.3 (`--no-daemon`) per NOTES.md.
- **Reviewer gate:** PASS — diff is `apps/android` only (3 code files + docs), no production logic
  outside `apps/android`, TDD behavioural (no tautologies, no floor lowered), SDK purity respected (pure
  payload SSOT in `:core:model`, transport-only emits in `:sdk-core`), near-total branch coverage on the
  new pure logic, iOS payload-key parity. No secrets, `local.properties` gitignored.

### 2026-07-03 — slice `call-video-survival-policy` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The three open PRs
  (#1384 iOS-a11y, #1385 web-realtime, #1386 gateway/shared) are `jcnm` continuous-improvement
  branches from other sessions — disjoint from `apps/android`, left untouched. Branched
  `claude/apps/android/call-video-survival-policy` off freshly-fetched `origin/main` (`80dab7b4`).
- **Gap closed:** the adaptive-quality story stopped at the tier ladder (`VideoQualityLevel`, slice
  `call-quality-level`). iOS layers a **last-resort** survival controller on top of the bitrate ladder
  (`VideoSurvivalController.swift`): when the link stays degraded past the `POOR`/`CRITICAL` floor long
  enough, it drops outbound video so the call lives on as audio-only, then restores video once the link
  clearly recovers. Android had the ladder but not this graceful-degradation layer. This slice ports the
  **pure policy half** (`VideoSurvivalPolicy`, the exhaustively-testable decision core); the async
  actuator/controller (renegotiation, transition-timeout, one-in-flight guard) is deliberately deferred
  to the app-side WebRTC seam — SDK purity.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `VideoSurvivalPolicy.kt` — `VideoSurvivalAction` (`None`/`Suspend`/`Resume`), the
    fixed-size `VideoSurvivalState(isSending, degradedSince, recoveringSince)` (+ `INITIAL`), the
    `VideoSurvivalDecision(state, action)` return, and the total pure
    `VideoSurvivalPolicy.reduce(state, level, nowSeconds, userWantsVideo)`. Faithful port of the iOS
    `reduce`: **duration-based** hysteresis (thresholds are wall-clock seconds fed a **monotonic** clock,
    not sample counts → independent of monitor cadence and immune to clock jumps over a multi-hour call);
    `Suspend` after a sustained ≥6 s `POOR`/`CRITICAL` streak while sending, `Resume` after a sustained
    ≥10 s `EXCELLENT`/`GOOD` streak while suspended (resume window longer on purpose — renegotiation is
    expensive, avoid oscillation); `FAIR` **holds** the recovery timer (a brief mid-recovery dip doesn't
    restart the window) while a degraded dip wipes it; a good/fair sample while sending clears the degraded
    streak; `userWantsVideo=false` resets to `INITIAL` so survival never re-enables video against intent.
  - `CallQualityThresholds` gains `VIDEO_SURVIVAL_SUSPEND_AFTER_SECONDS = 6.0` /
    `VIDEO_SURVIVAL_RESUME_AFTER_SECONDS = 10.0` at iOS `QualityThresholds` parity (the policy's default
    ctor args, so the tuning lives in one SSOT next to the tier thresholds).
  - **+19 behavioural tests** (`VideoSurvivalPolicyTest`): the intent gate; opening/holding/tripping the
    degraded streak (boundary `now-since == 6.0` suspends, `5.9` doesn't); `CRITICAL` counts as degraded;
    good/fair clearing the streak while sending; opening/holding/tripping the recovery streak (boundary
    `10.0` resumes); degraded-while-suspended wipe vs `FAIR`-hold (asserted `isSameInstanceAs` — state
    held verbatim); transient good/fair/degraded dips (window reset vs held); a full sustained
    degraded→recovered lifecycle suspending then resuming exactly once each; and the default-ctor 6 s/10 s
    thresholds. Every branch of `reduce` is exercised.
- **Verification:** `/opt/gradle/bin/gradle :core:model:testDebugUnitTest` → 19/19 green + full module
  suite green; `:core:model:assembleDebug` green. (`meeshy.sh check`/`./gradlew` unusable — the pinned
  wrapper distro 403s through the egress proxy; system Gradle 8.14.3 at `/opt/gradle` is the local gate,
  per NOTES.)
- **Reviewer gate:** PASS — diff is `apps/android` only (2 `core:model` files + docs), pure stateless
  building block (SDK purity: the async controller stays app-side), no tautological tests, near-total
  branch coverage, monotonic/O(1) design faithful to iOS. No production logic outside `apps/android`.

### 2026-07-03 — slice `call-quality-level` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1367–#1379)
  are `jcnm` web/ios/gateway branches from other sessions — disjoint from `apps/android`, left
  untouched. Branched `claude/apps/android/call-quality-level` off freshly-fetched `origin/main`
  (`4a69ef0`).
- **Gap closed:** the call had no notion of link quality — no connection-quality indicator, no tier
  model for the future adaptive-bitrate ladder. iOS has `VideoQualityLevel` + `QualityThresholds`
  (`WebRTCTypes.swift`) classifying live stats into a 5-tier ladder and `connectionQualityLabel`
  collapsing it to the 4-tier indicator; Android had nothing.
- **What shipped (thin vertical slice, TDD red→green, same shape as `call-duration-timer`):**
  - `:core:model` `CallQuality.kt` — the pure classification SSOT. `CallQualityThresholds` (the iOS
    `QualityThresholds` constants), `VideoQualityLevel` (`CRITICAL<POOR<FAIR<GOOD<EXCELLENT`) with
    per-tier sender caps (`targetResolutionHeight`/`targetFps`/`targetVideoBitrateBps`) + two total
    classifiers `from(rttMs, packetLoss)` (worse-of-two-axes, **strict `>`** so a value exactly on a
    threshold stays in the better tier — iOS parity) and `from(availableOutgoingBitrateBps)`;
    `CallQualitySample(rttMs, packetLoss).level()`; and the four-tier `ConnectionQuality`
    (`from(VideoQualityLevel)` collapsing `CRITICAL→POOR`, `bars` 1–4, `isWeak`). **24 tests** (every
    boundary of both classifiers pinned on both sides, all tier accessors, ordering, collapse/bars/weak).
  - `:feature:calls` `CallQualitySampler` — the input seam (interface `samples: Flow<CallQualitySample>`)
    with an interim `NoopCallQualitySampler` (`emptyFlow`, so the indicator stays hidden until the
    WebRTC stats collector swaps the `@Binds`) + Hilt module. Framework glue → exempt from JVM coverage.
  - `CallViewModel` folds the sampler stream **only while media flows** (a `qualityJob` started/stopped
    in `syncQuality` exactly like the ticker's `syncTicker`): each sample → `ConnectionQuality`, cleared
    to `null` on leaving connected/reconnecting and on a fresh `start`. `CallPresenter` projects
    `CallUiState.connectionQuality`, suppressing any stale reading off the connected/reconnecting phases.
    **+6 VM-fold tests** (no quality before connect, healthy→GOOD, critical→POOR collapse, updates through
    a reconnect, cleared on end, cleared on a new call) + **+3 presenter tests**. CallViewModelTest 51→57,
    CallPresenterTest 25→28.
  - `CallScreen` renders an accent-coherent 4-bar signal indicator under the status label when
    `connectionQuality != null` (bars fill to `bars`, tinted the peer accent or the error hue on a weak
    link, one VoiceOver tier label; +4 strings × 4 locales).
- **Verification:** `/opt/gradle/bin/gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all
  modules; CallQualityTest 24/24, CallViewModelTest 57/57, CallPresenterTest 28/28). System Gradle
  8.14.3 per NOTES.md.
- **Reviewer verdict:** **PASS** — diff is `apps/android` only (12 files), no production logic, TDD
  behavioural (no tautologies, no floor lowered), SDK purity respected (pure classification in
  `:core:model`, seam/glue/fold in `:feature:calls`), UDF preserved, cancellation-safe (qualityJob in
  `viewModelScope`, structured cancel), accent-coherent indicator with no dead-end.

### 2026-07-03 — slice `call-telecom-state-plan` ✅ shipped
- **Step 0 (housekeeping):** the prior Android iteration's PR **#1375 (`call-sound-policy`) was still
  open** — rebased it clean on the latest `origin/main` (no `apps/android` file overlap since its base),
  pushed, waited for all 14 CI jobs green, **squash-merged to `main`** (`26e2500`). The other open PRs
  (#1367–#1374, #1376) are `jcnm` web/ios/gateway branches — disjoint from `apps/android`, left untouched.
  Branched `claude/apps/android/call-telecom-state-plan` off the post-merge `origin/main` (`26e2500`) so
  the tree already carries the sound-policy fold this slice extends.
- **Gap closed:** the call lifecycle had no bridge to the **OS telecom layer** — no self-managed
  `ConnectionService`/`PhoneAccount` reporting (the Android analogue of the iOS `CXProvider.reportCall(...)`
  / `report(_:endedAt:)` calls the `CallManager` makes to CallKit). This slice ships the pure decision core
  that a future `ConnectionService` glue consumes, so the heavy platform integration is left decision-free.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `TelecomCallPolicy` — the pure, side-effect-free SSOT mapping call lifecycle → the OS
    telecom reports. `TelecomConnectionState` (`Dialing/Ringing/Active/Disconnected`) +
    `TelecomDisconnectCause` (`Local/Remote/Rejected/Missed/Error/Busy`) + `TelecomConnectionUpdate`.
    `connectionStateFor(state)` keys purely on `CallState` with no direction leak: outgoing ring/offering →
    `Dialing`, incoming ring → `Ringing`, **answered = `Active`** (`Connecting`/`Connected`/`Reconnecting`
    all collapse onto `Active`, so an ICE restart never tears the system call down), `Ended` →
    `Disconnected`, `Idle` → no connection. `disconnectCauseFor(reason)` maps every `CallEndReason`
    (lost/failed → `Error`). `plan(prev,next)` emits a report **only on a genuine transition** — it dedupes
    an already-active edge, a phantom `Idle→Ended` (no connection was ever created — mirrors
    `CallSoundPolicy`'s `prev.isActive` guard), an idempotent `Ended→Ended`, and a settle `Ended→Idle` all
    to `null`. **28 tests** (every arm of `connectionStateFor` incl. both ring directions, every
    `disconnectCauseFor`, every `plan` branch: creation / ring→active / dedupe×3 / all disconnect causes /
    phantom / idempotent / settle).
  - `:feature:calls` `TelecomCallReporter` — the output seam (interface), with a thin `LogTelecomCallReporter`
    interim glue (emits each transition to the system log so the seam is live end-to-end while the heavier
    self-managed `ConnectionService`/`PhoneAccount` registration — which will swap this `@Binds` — is built
    as its own glue slice), `@Binds` into a Hilt module (mirrors `CallToneModule`/`CallTickerModule`).
    Framework glue → exempt from JVM coverage per `TDD-COVERAGE.md`.
  - `CallViewModel.dispatch` folds each FSM edge through `TelecomCallPolicy.plan` — reporting only the
    genuine transitions the policy surfaces; `onCleared` releases the reporter alongside the tone controller.
    **7 VM-fold tests** via a recording fake reporter (outgoing→dialing, incoming→ringing, answered→active-
    once-with-dedupe, inert-no-report, decline→disconnected(rejected), hang-up→disconnected(local),
    failed-initiate→disconnected(error)). CallViewModelTest 44→51.
- **Verification:** `/opt/gradle/bin/gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all
  modules; TelecomCallPolicyTest 28/28, CallViewModelTest 51/51). System Gradle 8.14.3 fallback per NOTES.md.
- **Reviewer verdict:** **PASS** — diff is `apps/android` only (6 files), no production logic, TDD
  behavioural (no tautologies, no floor lowered), SDK purity respected (pure decision in `:core:model`,
  orchestration/glue in `:feature:calls`), UDF preserved, cancellation-safe (all pure).

### 2026-07-02 — slice `call-sound-policy` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1367–#1374) are
  `jcnm` branches from other sessions touching web/ios/gateway only — disjoint from `apps/android`, left
  untouched. Branched off freshly-fetched `origin/main` (`ad3c3b2`) as `claude/apps/android/call-sound-policy`.
  Confirmed the latest state (top-of-PROGRESS) was `call-duration-timer`; next Calls step per the routine is
  the Telecom/ringback area — carved a thin, fully-testable pure core out of it.
- **Gap closed:** the call screen was silent — no ringback for the caller, no ringtone for the callee, no
  connect/end cue. iOS has a `RingbackTonePlayer` ("the call sound manager") whose start/stop/cue calls are
  scattered across `CallManager`; Android had nothing.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallSoundPolicy` — the pure, side-effect-free SSOT collecting every iOS `RingbackTonePlayer`
    call site into one total function. `CallSound` (`None/Ringback/Ringtone`) + `CallCue` (`Connected/Ended`)
    + `CallSoundPlan`. `loopFor(state)` plays **ringback** across the whole pre-answer wait
    (`Ringing(outgoing)` + `Offering`, both outgoing-exclusive → no direction ambiguity) and stops it at the
    answer (`Connecting`) — tighter than iOS which drags it to `.connected` — and **ringtone** while
    `Ringing(incoming)`. `cueFor(prev,next)` fires `Connected` on every entry into `Connected` (first connect
    **and** reconnect-success) and `Ended` only when a *live* call ends (`prev.isActive`, iOS `if wasActive`),
    silent on `Idle→Ended`/`Ended→Ended`. `plan()` bundles both. **19 tests** (every branch of both maps + plan).
  - `:feature:calls` `CallToneController` — the output seam (interface), with a thin
    `AndroidCallToneController` glue impl (`ToneGenerator.TONE_SUP_RINGTONE` ringback + `RingtoneManager`
    ringtone + `TONE_PROP_ACK`/`TONE_PROP_PROMPT` cues, every entry `runCatching`-guarded), `@Binds` into a
    Hilt module (mirrors `CallTickerModule`). Framework glue → exempt from JVM coverage per `TDD-COVERAGE.md`.
  - `CallViewModel.dispatch` folds each FSM edge through `CallSoundPolicy.plan`: switches the loop **only on a
    genuine change** (an inert event never restarts the ringback — tracked via `activeLoop`) and fires the cue;
    `onCleared` releases. **9 VM-fold tests** via a recording fake controller (outgoing ringback→stop→connected
    cue, incoming ringtone→stop→connected cue, decline/hang-up ended cue, remote-hangup-after-connect, inert
    no-restart, reconnect re-cues). CallViewModelTest 35→44.
- **Verification:** `/opt/gradle/bin/gradle assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (all
  modules; CallSoundPolicyTest 19/19, CallViewModelTest 44/44). See NOTES.md for the Gradle-8.14.3 fallback.
- **Reviewer verdict:** **PASS** — diff is `apps/android` only (5 files, +456/−2), no production logic, TDD
  behavioural (no tautologies, no floor lowered), SDK purity respected (pure decision in `:core:model`,
  orchestration/glue in `:feature:calls`), UDF preserved, cancellation-safe (all pure/`runCatching`).

### 2026-07-02 — slice `call-duration-timer` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1366–#1369) are
  `jcnm` branches from other sessions touching web/ios/gateway only — disjoint from `apps/android`, left
  untouched. Branched off freshly-fetched `origin/main` (`dc8f37a4`) as
  `claude/apps/android/call-duration-timer`. Confirmed HEAD's `apps/android` matched `origin/main` (all prior
  Android work merged; `CallViewModel.kt`/`CallPresenter` verified before coding).
- **Gap closed:** the connected call screen showed a static "Connecté" label with **no call timer** —
  iOS shows a live in-call duration. The connected/ended screens had nothing to show elapsed time.
- **What shipped (thin vertical slice, TDD red→green):**
  - `:core:model` `CallDuration.clock(seconds: Long)` — the pure SSOT for call-length formatting
    (`M:SS`, widening to `H:MM:SS` past an hour; `"0:00"` at zero; negatives clamped). `CallRecord.durationLabel`
    was refactored to reuse it (dropping its private `pad2`), so a completed call and its journal row read
    identically. **6 tests.**
  - `:feature:calls` `CallPresenter` gains a derived `CallUiState.durationLabel`: `"0:00"` the instant the
    call connects, the running clock through connected/reconnecting, the **final length frozen** on the ended
    screen **iff** the call actually connected (`elapsedSeconds > 0`), and `null` before connect / for a
    missed/declined/failed call that never connected. **5 tests** (every arm).
  - `CallViewModel` runs a 1-Hz timer while media is (or is being re-)established, resetting the elapsed
    count on a new call and freezing it on end. The tick source is an **injected `CallSecondsTicker` flow
    seam** (`@Binds RealCallSecondsTicker`, a `flow { while(true){ delay(1000); emit } }`), so the
    elapsed-count logic is driven deterministically in tests via plain `emit(Unit)` — and, crucially, avoids
    a self-rescheduling `delay` loop that hangs `runTest` (see NOTES). **7 tests.**
  - `CallScreen` renders the running clock as the connected-status subtitle and appends the final length to
    the ended label — thin glue, no decision in the Composable.
- **Reviewer gate: PASS.** Scope `apps/android` only (6 files changed, 3 new; all under `apps/android`);
  behavioural tests through the public API (VM `StateFlow`, presenter output, `CallDuration.clock`); no
  tautologies; no floor lowered; SDK purity respected (pure formatter SSOT in `:core:model`, product
  orchestration in `:feature:calls`); ticker cancellation-safe (`viewModelScope`, `collect` cancelled on
  `stopTicker`). Edge cases covered: zero/negative/hour boundary, never-connected (inert), reset on new call,
  freeze-and-stop on end, reconnect continuation.
- **Verification:** `assembleDebug` + `testDebugUnitTest` → **BUILD SUCCESSFUL** (system Gradle 8.14.3
  `--no-daemon`; wrapper still 403s). CallViewModelTest 35, CallPresenterTest 25, CallDurationTest 6,
  CallRecordTest 22 — all green, 0 failures. **+18 new behavioural tests.**
- **Next:** the heavier WebRTC media transport (`stream-webrtc-android`) + `ConnectionService`/Telecom
  system call UI + ringback tone (glue-heavy — push every testable decision into pure helpers/the VM).
  Follow-up still open: `SocketManager.reconnectWithToken()` has no caller (a token-refresh re-attach slice —
  deferred until a token-rotation trigger exists, else it would be orphan code).

### 2026-07-02 — slice `incoming-call-deeplink` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The two open PRs (#1360 iOS a11y,
  #1359 gateway cache refactor) are `jcnm` branches from other sessions, disjoint from `apps/android`;
  left untouched. Branch was in sync with `origin/main` (0/0). Branched off freshly-fetched `origin/main`
  (`7527881e`) as `claude/apps/android/incoming-call-deeplink`. Confirmed HEAD's `apps/android` matches
  `origin/main` (all prior Android work merged; `MainActivity.kt`/`CallRoute.kt` verified before coding).
- **Gap closed:** the prior slice fired a full-screen call notification whose `PendingIntent` set
  `callId`/`conversationId`/`callerName`/`isVideo` extras on `MainActivity` — but `MainActivity.onCreate`
  just called `MeeshyApp()` and dropped them. A ring tap (and the older message-notification tap, which
  set a `conversationId` extra) opened the app on the start destination, never the call / chat. This slice
  wires the extras through a pure decoder into a NavHost deep-link.
- **Design:**
  - `:app` `me.meeshy.app.navigation.LaunchRouter.route(LaunchExtras) → String?` — the pure SSOT: a
    non-blank `callId` wins → `CallRoute.incoming(...)` (ring is the urgent intent); else a non-blank
    `conversationId` → `Routes.chat(...)` (shared message-tap path); else `null`. `LaunchExtras` is the
    plain data holder `MainActivity` fills from the intent (keys mirror `MeeshyFcmService`'s `EXTRA_*`).
  - `CallRoute` **refactored** from `call/{conversationId}/{peerName}/{video}` (path args) to a static
    `call` path + all-optional query args (`conversationId`/`peerName`/`video`/`callId`/`incoming`). A
    path arg must be non-empty (Compose Navigation regex `[^/]+`), so a blank room / peer name would
    collapse the segment and make `navigate()` throw. Query args default cleanly → blank is safe. Added
    `incoming(callId, conversationId, callerName, isVideo)` (server `callId`, `incoming=true`) and extended
    `config(...)` with `callId`/`incoming` → `isOutgoing = !incoming`, adopting the server id so the ring
    is answerable. Outgoing `path`/`redial`/`config` behaviour preserved.
  - `:app` glue (exempt): `MeeshyApp(launchRoute, onLaunchRouteConsumed)` navigates via a `LaunchedEffect`
    keyed on `(launchRoute, isAuthenticated)` — only once the graph is live **and** authenticated (an
    unauthenticated cold launch defers across the login gate), then calls `onLaunchRouteConsumed` so a
    recomposition never re-navigates; the CALL composable's 5 query navArguments + decode. `MainActivity`
    holds a `mutableStateOf` route, computes it via `LaunchRouter` in `onCreate` + `onNewIntent`, and a
    private `Intent.launchExtras()` extension pulls the `MeeshyFcmService.EXTRA_*` extras.
- **Tests:** +14 behavioural through the public API only. `LaunchRouterTest` (8): call push → incoming
  config (server id + `isOutgoing=false`, video/room threaded); call wins over a conversation id;
  reserved-char caller name round-trips; call push with no room still rings (blank room, id kept); bare
  conversation id → `Routes.chat`; blank `callId` falls through to the chat; empty extras / both blank →
  `null`. `CallRouteTest` (+6): `config` adopts an incoming `callId` + flips direction; null incoming
  `callId` → blank; `path` round-trips reserved chars via query; `path` stays a single static `call`
  segment on a blank room; `incoming` threads/encodes/blank-room variants. Reworked the pattern + redial
  assertions to decode the query route (same behaviours, new encoding — not weakened). No tautologies.
- **Verification:** `gradle assembleDebug testDebugUnitTest` (== `meeshy.sh check`) — **BUILD SUCCESSFUL**
  via system Gradle 8.14.3 (wrapper 8.11.1 still 403s on the GitHub-hosted distribution — see NOTES).
  Full suite green; navigation suite `me.meeshy.app.navigation.*` green in isolation too.
- **Reviewer gate:** PASS — diff `apps/android` only (6 files: `LaunchRouter.kt` prod + `LaunchRouterTest`,
  `CallRoute.kt`/`MeeshyApp.kt`/`MainActivity.kt` glue+route, `CallRouteTest` extended). SDK purity (pure
  router + route SSOT in `:app` navigation, no `:sdk-*` change); single source of truth (one route object,
  one launch decoder — no re-implementation); UX coherence (call push prioritised, accent-coherent screen
  reused, dismissal returns via `popBackStack`); failure paths (blank room / malformed extras → inert, no
  crash). Behaviour through public API; the only async is the guarded `LaunchedEffect` (idempotent via the
  consumed flag). **Next:** `ConnectionService`/Telecom + ringback tone, then WebRTC media transport.

### 2026-07-02 — slice `fcm-call-push-route` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1346 iOS a11y,
  #1350–#1353 gateway/web/iOS) are `jcnm` branches from other sessions, disjoint from `apps/android`;
  left untouched. Branched off freshly-fetched `origin/main` (`cdf00714`) as
  `claude/apps/android/fcm-call-push-route`. Confirmed HEAD's `apps/android` byte-identical to
  `origin/main` (all prior Android work merged; verified `IncomingCallPush.kt` present before coding).
- **Gap closed:** the prior slice landed the pure decision bricks but `MeeshyFcmService.onMessageReceived`
  still ignored them — a data-only call push was silently dropped, only a `message.notification` display
  push was handled. This slice wires the bricks into the service via a single pure router + a stateful
  live-ring holder, then fires the full-screen call notification.
- **Design:**
  - `core:model` `IncomingCallPushRoute` (`NotACallPush` | `Ring(push, updatedSeen)` | `Suppress(reason)`)
    + pure `IncomingCallPushRouter.route(data, context)` — folds `IncomingCallPushParser.parse` →
    `IncomingCallDecider.decide` → (on `Ring` only) `SeenCallRing.insert`, returning the advanced ring so
    the caller just adopts it. Total, side-effect-free; a `Suppress`/`NotACall` never advances the ring.
  - `:app` `@Singleton IncomingCallRingStore` — the sole owner of the live `SeenCallRing`; `route(data,
    nowMillis, activeCallId?, selfUserId?)` threads its ring through the router and persists `updatedSeen`
    **only** on `Ring`; `forget(callId)` for a refused/torn-down ring. Synchronized (FCM deliveries +
    teardown may hit different threads).
  - `:app` glue (exempt): `MeeshyFcmService` injects the store + `SessionRepository` (self-user id →
    self-fanout guard), routes each push by kind — `Ring` → full-screen CATEGORY_CALL / `PRIORITY_MAX`
    notification on a new `meeshy_calls` channel (`setFullScreenIntent` → `MainActivity` + call extras),
    `Suppress` → silent drop (logged), `NotACallPush` → the existing message path (outbox flush + rich
    notification). Removed a pre-existing unused `OneTimeWorkRequestBuilder` import.
- **Tests:** +19 behavioural through the public API only. `IncomingCallPushRouterTest` (11): non-call/
  typeless/blank-callId → `NotACallPush`; `voip_call` routes like `call`; fresh idle → `Ring` with the
  parsed push (video/conversationId threaded) + id recorded in `updatedSeen`; replay with the advanced
  ring → `Suppress(DUPLICATE)`; self/busy/active-dup → the right `Suppress` reason; a busy `Suppress`
  does **not** record the id (rings once the active call frees). `IncomingCallRingStoreTest` (8): fresh
  rings; retry deduped; different id still rings; past-ttl re-delivery rings; self-suppress never poisons
  the ring; non-call leaves the ring untouched; `forget` re-opens a ring; busy-suppress rings once free.
  No tautologies, no floor lowered, no test weakened.
- **Verification:** `:core:model:testDebugUnitTest` (router 11/11) then `:app:testDebugUnitTest`
  (`IncomingCallRingStoreTest` 8/8, `CallRouteTest` unchanged) + `:app:assembleDebug` — both **BUILD
  SUCCESSFUL** via system Gradle 8.14.3 (`--no-daemon`; wrapper still 403s — see NOTES). No suite regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (5 files: `IncomingCallPushRouter.kt` +
  `IncomingCallRingStore.kt` prod, 2 test files, `MeeshyFcmService.kt` glue). SDK purity respected (pure
  router in `:core:model`, stateful holder + platform glue in `:app`); single source of truth (reuses the
  parser/decider/ring, no re-implementation); UDF n/a (no VM); behaviour through public API; the only
  async is the synchronized store (cancellation n/a — no coroutines). **Next:** consume `MainActivity`
  call extras → NavHost deep-link into the incoming-call screen; `ConnectionService`/Telecom + ringtone;
  WebRTC media transport.

### 2026-07-02 — slice `incoming-call-push-decision` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration. The open PRs (#1344 gateway
  call-resilience, #1346 iOS a11y) are `jcnm` branches from other sessions, disjoint from `apps/android`;
  left untouched. Branched off freshly-fetched `origin/main` (`0f6dc241`) as
  `claude/apps/android/incoming-call-push-decision`. Confirmed HEAD's `apps/android` is byte-identical to
  `origin/main` (all prior Android work merged).
- **Gap found while scoping:** `MeeshyFcmService.onMessageReceived` only handled a `message.notification`
  display push (reading solely `data["conversationId"]`); a **data-only incoming-call push is silently
  dropped** — no `type`/`callId` parse, no dedup, no ring. That's the first missing brick of parity
  item §H "Incoming-call delivery via FCM data push when backgrounded/killed (full-screen intent)". The
  iOS SSOT is `VoIPPushManager` (parse+phantom-guard) + `VoIPDedupRing` + `CallManager.reportIncomingVoIPCall`
  (busy gate).
- **Design (pure-decision-first, `core:model`):**
  - `IncomingCallPush` — typed FCM `data`-map / VoIP payload at parity with the gateway
    `CallEventsHandler` push (`type:"call"`) + `PushNotificationService.sendVoIPPush` (`type:"voip_call"`):
    `callId`/`conversationId`/`callerUserId`/`callerName`/`isVideo`(sent as string `"true"`/`"false"`)/
    `iceServers`(JSON string) + a blank-skipping `displayName` (`callerName` else the shared "Inconnu").
  - `IncomingCallPushParser.parse(Map<String,String>) → IncomingCallPush?` — total, side-effect-free;
    a call iff `type ∈ {call,voip_call}` AND non-blank `callId` (mirrors the iOS phantom-guard); leniently
    decodes `iceServers` via the existing `SocketIceServer` serializer, degrading a missing/blank/malformed
    value to `[]` rather than dropping the whole push; blank optionals → null; `isVideo` case-insensitive.
  - `SeenCallRing` — immutable pure port of `VoIPDedupRing` (default capacity 24 / ttl 30_000ms):
    `contains(id, now)` (freshness-bounded), `insert(id, now)` (prunes expired, refreshes a same-id window,
    trims oldest past capacity — every mutation returns a new ring), `remove(id)`.
  - `IncomingCallDecision` (`Ring(push)` | `Ignore(reason: DUPLICATE/BUSY/SELF_INITIATED)`) +
    `IncomingCallContext(nowMillis, activeCallId?, seen, selfUserId?)` + pure
    `IncomingCallDecider.decide` — ordering faithful to iOS: **self-fanout → duplicate (active-or-seen) →
    busy (different call active) → ring**. Recording on `Ring` is the caller's job (kept a total fn).
- **Tests:** +39 behavioural (18 `IncomingCallPushParserTest`, 11 `SeenCallRingTest`, 10
  `IncomingCallDeciderTest`) through the public API only — every `when`/`if` arm swept: both call types +
  non-call + no-type; callId absent/blank/valid; isVideo true/false/UPPER/missing/garbage; optionals
  blank/absent/present; iceServers valid/absent/blank/malformed; ring contains-fresh/expired/capacity-evict/
  prune-on-insert/refresh/remove-present-absent/immutability; decider ring/self/blank-self/other-caller/
  active-dup/seen-dup/expired-not-dup/busy/dup-vs-busy precedence. No tautologies, no floor lowered.
- **Verification:** `assembleDebug` + all `testDebugUnitTest` **BUILD SUCCESSFUL** via system Gradle 8.14.3
  (wrapper still 403s — see NOTES); `:core:model` new classes 39/39 green; no suite regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (4 files, 1 prod + 3 test, all in `core:model`), pure
  building blocks correctly in `:core:model` (matches `CallSignalMapper`/`CallStateMachine`/`CallInitiateAckParser`),
  behaviour through public API, no unguarded async (all pure). **Next:** wire `MeeshyFcmService` to route a
  call-type data push through parser+decider and fire a full-screen `ConnectionService`/CATEGORY_CALL
  notification (Android-platform glue).

### 2026-07-02 — slice `calls-tab-nav` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the 4 open PRs (#1335, #1337–#1339)
  are gateway/iOS branches from other sessions (`jcnm`), disjoint from `apps/android`; left untouched.
  Branched off freshly-fetched `origin/main` (`c46f8d14`) as `claude/apps/android/calls-tab-nav`.
- **Gap found while scoping:** `CallHistoryScreen` (shipped in `call-history-list`) was **dead UI** — no
  route pointed at it, so the whole recent/missed-calls journal was reachable by nobody. This is the tracked
  "dedicated Calls tab" follow-up.
- **Design (pure-decision-first):**
  - `:app` `CallRoute.redial(record: CallRecord)` — the pure re-dial decision: threads the journal row's
    own `conversationId`, its already-resolved `displayName` (peer displayName → username → group title →
    fallback, owned by `CallRecord`), and its `isVideo` straight through the existing `path(...)` (so
    reserved chars in the name stay encoded). Re-dialling from history is now byte-identical to a call
    placed from the chat header — one SSOT, no re-derivation at the call site.
  - `MeeshyApp` glue: new `Routes.CALLS` tab (`Icons.*.Call`), added to `tabRoutes` and `rememberTabs`
    (order Messages · Feed · **Calls** · Activity · Profile — Calls central, WhatsApp-like); a
    `composable(Routes.CALLS)` mounts `CallHistoryScreen(onOpenCall = { navController.navigate(
    CallRoute.redial(it)) })`. New `tab_calls` string.
- **Tests:** +4 behavioural (`CallRouteTest`, Robolectric for `Uri`): `redial` round-trips
  conversation/name/media into a `CallConfig`; resolves `displayName` **over** the raw username then
  encodes a reserved-char name into exactly 4 path segments; carries an audio-only record as audio; falls
  back to the group `conversationTitle` when `peer == null`. Behaviour asserted by decoding the built path,
  not by reading back a set constant. No floor lowered, no tautology.
- **Verification:** `assembleDebug` + `:app:testDebugUnitTest` **BUILD SUCCESSFUL** via system Gradle
  8.14.3 (wrapper still 403s — see NOTES); debug APK assembles; `CallRouteTest` 12/12 green; no suite
  regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (4 files: `CallRoute.kt` +helper, `MeeshyApp.kt`
  wiring, `strings.xml`, `CallRouteTest.kt`), navigation orchestration correctly in `:app`, behaviour
  through the public API, no unguarded async (pure route builder). **Next:** WebRTC/Telecom/FCM
  full-screen-intent plumbing.

### 2026-07-02 — slice `call-nav-conversation-thread` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration — the only open PR (#1324) is an
  iOS Dynamic-Type branch (`claude/upbeat-euler-s5qysh`, author `jcnm`), disjoint from `apps/android`.
  Branched off freshly-fetched `origin/main` (`0e0ac302`) as `claude/apps/android/call-nav-conversation-thread`.
- **Root cause found while scoping:** the outgoing-call route dropped the `conversationId`. `Routes.CALL`
  only carried `{peerName}/{video}`, so the `NavHost` built a `CallConfig(conversationId = "")` and
  `CallViewModel.start` → `emitInitiate("", isVideo)` fired into an **empty room** — every outgoing call
  was dead-on-arrival (the gateway rejects a blank room → `ServerError` → `Ended(Failed)`). This is the
  tracked "Calls-tab nav entry threading the real `conversationId`" follow-up; the `conversationId` is a
  nav-level fact already known at the chat destination, so no ViewModel/state plumbing was needed.
- **Design (pure-decision-first):**
  - `:app` `me.meeshy.app.navigation.CallRoute` — the single source of truth for the outgoing-call route.
    `PATTERN` (`call/{conversationId}/{peerName}/{video}`), `path(conversationId, peerName, isVideo)`
    (percent-encodes both free-text segments so a peer name with `/`/`&` never adds path segments), and
    the pure `config(conversationId?, peerName?, isVideo?) → CallConfig` mapping (null/absent args degrade
    to blank/audio — a malformed deep link yields an inert call, never an NPE; `callId` left blank so an
    outgoing call mints its own via the initiate ACK; `isOutgoing = true`).
  - `MeeshyApp` glue: the CHAT `composable` now captures its `entry`, reads
    `ChatViewModel.CONVERSATION_ID_ARG`, and threads it into `Routes.call(conversationId, peerName,
    isVideo)`; the CALL `composable` decodes the three args and delegates to `CallRoute.config`. Removed
    the ad-hoc `CALL_PEER_ARG`/`CALL_VIDEO_ARG`/inline `CallConfig` construction (dead once `CallRoute`
    owns it). `ChatScreen`'s public signature is untouched (the id rides in from nav, not from state).
- **Tests:** +8 behavioural (`CallRouteTest`, Robolectric for `Uri`): `config` threads the id / leaves
  callId+peerId blank / defaults absent video to audio / keeps explicit audio / degrades null
  conversationId (no crash, still outgoing) / degrades null peerName; `path` embeds the id and round-trips
  a peer name with reserved chars through exactly 4 segments; `PATTERN` exposes all three named args.
  Every `config` branch (null conversationId, null peerName, `isVideo` null/true/false) is hit. This is
  the **first `:app` test source set** (deps were already declared).
- **Verification:** whole-project `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (890 tasks) via
  system Gradle 8.14.3 (wrapper 8.11.1 still 403s — github-releases egress blocked, see NOTES; AGP 8.7.3
  runs fine on 8.14.3). `CallRouteTest` 8/8 green; debug APK assembles; no other suite regressed.
- **Reviewer gate:** PASS — diff `apps/android` only (1 code file edited + 1 new helper + 1 new test),
  navigation orchestration correctly in `:app` (SDK building blocks untouched), behaviour tested through
  the public API, no tautologies, no floor lowered, no unguarded async. **Next:** a dedicated Calls tab in
  the bottom nav wiring `CallHistoryScreen`, then the heavier WebRTC/Telecom/FCM plumbing.

### 2026-07-02 — slice `realtime-session-coordinator` ✅ shipped
- **Step 0 (housekeeping):** no Android PR was open. The 4 open PRs (#1317–#1320) are iOS/web/gateway
  branches from other sessions — left untouched. Branched off freshly-fetched `origin/main` (`57408634`)
  as `claude/apps/android/realtime-session-coordinator`.
- **Root-cause found while scoping:** the whole realtime layer was **dead code**. `SocketManager.connect()`
  was never called anywhere in production, and no socket manager's `attach()` (message/social/**call**) ran
  — `on()` no-ops while `_socket` is null and only `connectionState` was ever observed. So no `call:*`,
  `message:*` or social frame could reach any ViewModel. This slice (the tracked "app-level
  `CallSignalManager.attach()` lifecycle caller") fixes the root cause for all three managers at once.
- **Design:**
  - `:sdk-core` pure `RealtimeLifecyclePlan.commandsFor(wasAuthenticated, isAuthenticated) → List<RealtimeCommand>`
    owns the two invariants: **ordering** (sign-in yields `Connect` *before* `Attach`, because listeners
    can only register on an existing socket) and **edge-only** (act solely on a genuine auth ⇄ unauth
    transition — never double-connect a live session, which would double-register every listener and
    duplicate every inbound event). Because a fresh `connect()` mints a **new** socket, `Attach` is paired
    with **every** `Connect` (not once ever), so logout→login re-attaches on the new socket.
  - `:sdk-core` `@Singleton RealtimeSessionCoordinator.onAuthenticatedChanged(isAuthenticated)` holds the
    last-seen edge (`@Synchronized`) and dispatches the plan's commands to the SDK singletons (connect /
    attach-all-three / disconnect). Thin wiring; all the logic is in the pure plan.
  - `AuthViewModel` (the app-level auth holder, created above the NavHost in `MeeshyApp`) drives it: at
    `init` with `authRepository.isAuthenticated` (reconnects a restored-token session on app start / after
    process death), on login success (`true`), and on logout (`false`). The coordinator is a `@Singleton`
    so even a VM recreation dedups via the edge.
- **Tests (TDD red→green, +16):**
  - `RealtimeLifecyclePlanTest` (5): sign-in → `[Connect, Attach]` in order; sign-out → `[Disconnect]`;
    stay-in / stay-out → `[]`; attach-never-precedes-connect.
  - `RealtimeSessionCoordinatorTest` (6, mockk relaxed managers): connect-then-attach-all order;
    redundant `true` doesn't reconnect/re-attach (exactly-1); sign-out disconnects; initial `false`
    touches nothing; redundant `false` doesn't re-disconnect; logout→login **re-attaches on the new
    socket** (connect×2, each attach×2, disconnect×1) — proves attach-per-connect, not attach-once.
  - `AuthViewModelTest` (+5): init with restored token → `onAuthenticatedChanged(true)`; init without
    token → `false`; login success → `true`; login failure → not `true`; logout → `false`.
- **Branches covered:** plan's `when` all 3 arms (Connect+Attach / Disconnect / empty); coordinator's
  `execute` all 3 command arms. ≥90% branch+instruction on the new pure logic.
- **Verify:** `assembleDebug` + `testDebugUnitTest` green (system Gradle `/opt/gradle` `--no-daemon`;
  wrapper 403s through proxy — see NOTES). Diff = `apps/android` only (2 modified: `AuthViewModel` +
  its test; 4 new: plan + coordinator + 2 tests). No production logic outside `apps/android`.
- **Reviewer verdict:** PASS — pure logic fully branch-covered, behaviour-tested through the public API
  (no tautologies), SDK purity respected (pure plan + thin stateful coordinator in `:sdk-core`, the
  when-to-connect edge driven from the `:feature:auth` VM), scope `apps/android`-only.
- **Follow-ups noted:** `SocketManager.reconnectWithToken()` (disconnect+connect on token refresh) still
  has no caller — a future token-refresh slice must re-attach after it (same attach-per-connect rule).

### 2026-07-01 — slice `call-viewmodel-signal-fold` ✅ shipped
- **Step 0 (housekeeping):** the prior Android PR **#1311** (`call-initiate-ack`) was still open —
  squash-merged it to `main` first (mergeable=clean, diff `apps/android` only, monorepo CI has no
  required checks for an android-only diff), then branched off freshly-fetched `origin/main`
  (`03c122fe`) as `claude/apps/android/call-viewmodel-signal-fold`. The other 7 open PRs are
  web/iOS/gateway/shared branches — left untouched.
- **Slice:** the VM-fold — turn the call screen from a self-contained FSM demo into a live two-way
  socket endpoint. Folds `CallSignalManager.events` into the VM, places outgoing calls via the ACK, and
  keys every outbound emit by the real `callId`.
- **Design (thin orchestration over the existing pure building blocks):**
  - `CallConfig` gains `conversationId` (the room an outgoing `emitInitiate` targets) and `callId` (the
    id an incoming call already carries); both default `""`, so `:app`'s existing `CallConfig(...)`
    placeholder compiles unchanged.
  - `CallViewModel` now `@Inject`s `CallSignalManager`. `init { viewModelScope.launch { events.collect
    (::dispatch) } }` folds each mapped `CallEvent` through the unchanged `CallStateMachine`. Outgoing
    `start` rings optimistically (`dispatch(StartOutgoing)`) then `launch`es `emitInitiate` → `Success`
    stores the minted `callId`; `ServerError`/`Timeout`/`Malformed` → `dispatch(ConnectionFailed(msg))`
    which the FSM's terminal path settles to `Ended(Failed)`. accept→`emitJoin`, decline/hangUp→
    `emitEnd`, mute→`emitToggleAudio(enabled=!muted)`, camera→`emitToggleVideo(enabled=cameraOn)`, all
    guarded by `emitIfIdentified` (inert while `callId` is blank). No FSM/presenter change.
- **Tests (TDD red→green, +14; 28 total in `CallViewModelTest`):** initiate emits conversationId+video
  type; optimistic ring before ACK; `ServerError`→`Ended(Failed("Room full"))`; `Timeout`/`Malformed`→
  `Ended(Failed)`; incoming never emits initiate; hang-up/accept/decline/mute/camera each verified
  keyed by the minted/incoming id; blank-id guard emits nothing; `RemoteHangUp` and the
  join→answer→connected chain folded through `events` drive the state. All 14 prior tests preserved
  verbatim (only the `vm()` factory + configs gained the injected mock and the new id fields).
- **Verification:** whole-project `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (886 tasks) via
  system Gradle 8.14.3 `--no-daemon` (wrapper still 403s through the proxy — NOTES). `:feature:calls`
  suite 28/28 green; `:app` compiles against the widened `CallConfig`.
- **Reviewer gate:** PASS — diff `apps/android` only (3 code files, +290 −31), VM orchestration lives in
  `:feature:calls` (building blocks untouched in `:sdk-core`/`core:model`), behaviour tested through the
  public API, no tautologies, no floor lowered, `viewModelScope` collect cancellation-safe (no swallowed
  `CancellationException`).

### 2026-07-01 — slice `call-initiate-ack` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the 4 open PRs on `main` are
  web/iOS branches — #1307–#1310, none `claude/apps/android/*`). Branched off freshly-fetched
  `origin/main` (`dc9a1a11`) as `claude/apps/android/call-initiate-ack`.
- **Slice:** the ACK-based `call:initiate` — the "Next slice" #5 that unblocks the VM-fold. It gives the
  future `CallViewModel` the real MongoDB `callId` every outbound emit is keyed by, plus the per-user ICE
  servers WebRTC must be configured with before any SDP offer.
- **Design (SDK-pure-first):**
  - `core:model/.../call/CallInitiateAck.kt` — `SocketIceServer` (`urls`/`username`/`credential`) with a
    custom `IceServerUrlsSerializer` that normalises the gateway's single-string-**or**-array `urls` to a
    `List<String>` (parity with iOS `SocketIceServer.IceServerURLs`); `CallInitiateAck`
    (`callId`/`mode`/`iceServers`/`ttlSeconds`); the sealed `CallInitiateResult`
    (`Success`/`ServerError`/`Malformed`/`Timeout`); and the total, side-effect-free
    `CallInitiateAckParser.parse(rawJson)` — the single tested SSOT for the ACK wire contract, faithful to
    the iOS `emitCallInitiate` guard (`success:true` + non-blank `data.callId` → `Success`; else the
    gateway error from `error.message` → bare-string `error` → `"unknown error"`; undecodable body →
    `Malformed`). `Timeout` is transport-level (never produced by the parser).
  - `:sdk-core/.../socket/CallSignalManager.kt` — `suspend emitInitiate(conversationId, isVideo)`: emits
    `call:initiate` with `{conversationId, type:"video"|"audio"}` via the existing ACK-emit overload,
    awaits the ACK inside `withTimeoutOrNull(10_000)` (iOS's 10s budget) wrapping a
    `suspendCancellableCoroutine`, delegates the body to `CallInitiateAckParser`, and maps a
    missing/non-JSONObject ACK to `CallInitiateResult.Timeout`. Owns only the transport; the wire decision
    lives once in the pure parser.
- **Tests (TDD red→green, +26):** 21 `CallInitiateAckParserTest` (full ACK incl. minimal/unknown-keys,
  single-string vs array `urls`, TURN creds, every `ServerError` fallback incl. non-string error, both
  `Malformed` arms — bad JSON + wrong `iceServers` shape, robust `urls` dropping non-strings/objects);
  5 `CallSignalManagerTest` additions (payload keys + video type, audio type, `ServerError` on rejection,
  `Timeout` on no-ACK, `Timeout` on non-JSONObject ACK — the last two exercise `withTimeoutOrNull` under
  the `runTest` virtual clock). Every parser branch and `messageOf` arm enumerated and hit.
- **Verification:** `assembleDebug testDebugUnitTest` **BUILD SUCCESSFUL** (whole project; 886 tasks) via
  system Gradle 8.14.3 (`--no-daemon`). The wrapper's pinned 8.11.1 distribution 403s through the egress
  proxy (redirects to a blocked github.com release asset) — used the preinstalled `/opt/gradle` instead;
  the committed wrapper is untouched. Lesson recorded in NOTES.md.
- **Reviewer gate:** PASS — diff is `apps/android` only (4 files, +404 −0), pure building blocks in
  `core:model`/`:sdk-core` (no product orchestration; the VM-fold is the next slice, so `emitInitiate`
  joins the already-established outbound emit table awaiting that fold — not an orphan), behaviour tested
  through the public API, no tautologies, no floor lowered.

### 2026-07-01 — slice `call-history-list` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (open PRs on `main` are iOS-a11y
  branches, none `claude/apps/android/*`). **Gotcha caught:** the container's local `main` was stale and
  divergent (un-squashed Stories commits); a naive `git checkout main` would have branched off the wrong
  base. Recovered with `git checkout -B claude/apps/android/call-history-list origin/main` — the freshly
  fetched `origin/main` (`728c999e`) already carries all prior Calls work (`call-history-repository` etc.).
  Lesson recorded in NOTES.md. Always branch off `origin/main`, never local `main`.
- **Slice:** the recent/missed-calls **list UI** (`:feature:calls`) — the real consumer of
  `CallHistoryRepository.historyStream()`. Vertical slice, all in `:feature:calls`:
  - Pure `CallHistoryList` — `combine(stream, paged)` de-dups by `callId` (stream order first, so a
    `fetchPage(cursor=null)` re-fetch of the head never duplicates); `filter(records, missedOnly)`.
  - Pure `CallTimeLabel.label(iso, now, zone, locale, yesterday)` — ISO-8601 → relative label
    (same-day 24h time / yesterday / weekday within the week / date with year only when it differs),
    degrading an absent/unparsable value to `""`. Parses via the SDK's single `isoToEpochMillis` SSOT.
  - UDF `CallHistoryViewModel` (`StateFlow<CallHistoryUiState>`) — cache-first SWR flags (skeleton only
    on cold empty, `isSyncing` on stale/syncing, error surfaced + skeleton dropped), a **client-side**
    missed-only filter (instant, no network), cursor-paged infinite scroll via `fetchPage` (append +
    de-dup, cursor advance, `hasMore`/`isLoadingMore` re-entrancy gating, failure surfaced), and
    pull-to-refresh that resets paging and tracks `isUserRefreshing` distinct from silent SWR.
    `CancellationException` rethrown in every `viewModelScope` catch.
  - Accent-coherent `CallHistoryScreen` glue — `MeeshyAvatar` rows, direction icon (missed = error
    colour), relative time, All/Missed `FilterChip`s, cold skeleton, filtered/cold empty states,
    `PullToRefreshBox`, `loadMoreIfNeeded` on row render.
- **TDD red → green:** tests first. **30** new behavioural tests through the public API:
  `CallHistoryListTest` (+7 — combine order/dedup/empty/stream-wins, filter all/missed/none),
  `CallTimeLabelTest` (+7 — null/garbage → empty, same-day time, later-same-day, yesterday, weekday,
  date without/with year), `CallHistoryViewModelTest` (+16 — cold skeleton, fresh/stale/syncing paint,
  sync error, missed filter narrow+restore, `isFilteredEmpty`, loadMore append+dedup / far-from-tail
  no-op / `hasMore` exhausted / cursor advance / failure / re-entrancy guard, refresh reset + failure).
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles + all
  JVM unit tests green). Zero warnings after switching to `Icons.AutoMirrored.Filled.CallMissed`.
- **Reviewer gate:** PASS. Scope = `apps/android` only (5 new Kotlin + 3 new tests + 4 strings edits),
  no secrets, no `local.properties`. Behavioural tests, no tautologies, no floor lowered. SDK purity:
  pure list/time algebra + a `:feature` ViewModel (product orchestration); no re-implementation of
  language/colour SSOTs. Cache-first (instant-app): skeleton only on cold empty, cached rows paint
  immediately. Edge cases: empty/single/boundary lists, unknown callId, first/last paging positions,
  no-op filter toggle, failure paths, cancellation-safe scope work.
- **Next:** fold `CallSignalManager.events` into `CallViewModel` once the `initiate`-ACK call-id
  lifecycle lands; wire `CallHistoryScreen` into a Calls tab (`:app`); then WebRTC/Telecom/FCM.

### 2026-07-01 — slice `call-history-repository` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the 27 open PRs on `main` are all
  iOS-a11y / web / gateway `claude/*` branches, none `claude/apps/android/*`). Branched
  `claude/apps/android/call-history-repository` off freshly-fetched `origin/main` (`3c0a74e6`, PR #1235).
- **Slice:** the call-history **repository** — the REST + Room cache-first layer the recent/missed-calls
  list UI will read. Vertical slice across three modules, each mirroring the established Stories SWR:
  - `:core:network` `CallHistoryApi` — `GET calls/history?cursor&limit&filter` → `ApiResponse<List<CallRecord>>`
    (decodes 1:1 into the `:core:model` `CallRecord`), wired into `MeeshyApi.callHistory` + `NetworkModule`.
  - `:core:database` `CallHistoryEntity` (`call_history` table: serialized payload + `startedAt`
    epoch-millis for ordering + `cachedAt`) and `CallHistoryDao` (`observeAll` newest-first,
    `upsertAll`/`deleteNotIn`/`clear`). Registered in `MeeshyDatabase` (**v6→v7**, existing destructive
    fallback) + `DatabaseModule` provider.
  - `:sdk-core` `CallHistoryCacheSource` (Room-backed `SwrCacheSource`, port of `StoryCacheSource`:
    cold cache → `null`, synced-empty distinguished, `sync_meta` freshness, transactional persist that
    prunes rows absent from the latest fetch) + `CallHistoryRepository`: `historyStream()` cache-first
    SWR (`CachePolicy.CallHistory` = fresh 60s / keep the gateway's 90-day window), `refresh()`, and a
    cursor-paginated raw `fetchPage(cursor, limit, missedOnly) → CallHistoryPage(records, nextCursor,
    hasMore)` the list UI drives for older pages (folds the full `ApiResponse` envelope so pagination
    survives, unlike `apiCall` which discards it).
- **TDD red → green:** `CallHistoryDaoTest` (+5) and `CallHistoryRepositoryTest` (+12) first. **17** new
  behavioural tests through the public API: DAO order/upsert-replace/deleteNotIn/clear; repo cold-cache
  `Empty`, refresh persist + sync-meta, refresh prune (row absent from 2nd sync removed), `Fresh`
  after refresh, `CallHistorySyncException` carrying the API error; `fetchPage` pagination
  cursor+hasMore, no-pagination → null/false, cursor+limit+`all` filter forwarding (`coVerify`),
  `missed` filter when `missedOnly`, failed-envelope → `Failure` with message, network-exception →
  `Failure`. Every `when`/`if` arm in the new code is hit.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles + all
  JVM unit tests green). Note: one Robolectric `MavenArtifactFetcher` SSL flake on the first
  `:core:database` run (proxy download of the `android-all` jar); a re-run was green — environment
  network flake, not a test defect (see NOTES.md).
- **Reviewer gate:** PASS. Scope = `apps/android` only (12 files, 7 new / 5 edits), no secrets, no
  `local.properties`. Behavioural tests, no tautologies, no floor lowered. SDK purity: the repository is a
  stateless building block in `:sdk-core` (the cache→network cascade is the generic `cacheFirstFlow`
  helper; no product "when to X" rule). Cache-first (instant-app); the call-journal display SSOT stays in
  `:core:model`. Edge cases: empty/cold cache, prune, failure paths (sync + network + failed envelope),
  pagination present/absent, both filters.
- **Next:** the recent/missed-calls **list UI** in `:feature:calls` — a `CallHistoryViewModel`
  (`StateFlow<CallHistoryUiState>` over `historyStream()`, `distinct` fresh/stale/empty handling +
  pull-to-refresh + paging via `fetchPage`) and an accent-coherent list rendering each `CallRecord` via
  its pure display accessors; then fold `CallSignalManager.events` into `CallViewModel` once the
  `initiate`-ACK call-id lifecycle lands.

### 2026-07-01 — slice `call-history-model` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the open PRs on `main` are all
  iOS-a11y / web / gateway work, none `claude/apps/android/*`). Branched `call-history-model` off the
  freshly-fetched `origin/main`.
- **Slice:** the pure **call journal** model in `:core:model` `me.meeshy.sdk.model.call` — a
  dependency-free port of iOS `CallModels.swift` (`CallDirection`, `CallHistoryPeer`, `APICallRecord`)
  plus `CallMediaType` from `WebRTCTypes.swift`, mirroring the gateway `CallHistoryItem` REST contract
  (`services/gateway/src/services/callHistory.ts`, `GET /api/v1/calls/history`) field-for-field.
  - `CallDirection(wire)` enum + `fromRaw(raw)` degrading an unknown value → `INCOMING` (parity with
    iOS `CallDirection(raw:)`, so one bad field never fails the whole record).
  - `CallMediaType` (`AUDIO_ONLY`/`AUDIO_VIDEO`) + `forVideo(isVideo)` — the single mapping from the
    record's persisted `isVideo` flag to the enum.
  - `@Serializable CallHistoryPeer` (userId/username/displayName?/avatar?/phoneNumber?/isOnline) and
    `@Serializable CallRecord` (all gateway fields; only the non-null ones required so a malformed frame
    fails to decode rather than half-populating). Timestamps stay ISO-8601 **strings** — faithful to the
    wire and keeping `:core:model` free of any `java.time` dependency (a repository parses where needed).
  - Pure display accessors as the single tested SSOT: `directionKind`/`isMissed`, `mediaType`, four-tier
    `displayName` (peer display → peer username → conversation title → "Inconnu", **blank-skipping** —
    surpasses iOS which only skips empty strings and would surface a whitespace-only name), `avatarUrl`
    (peer → conversation fallback), `durationLabel` (`M:SS`/`H:MM:SS`, empty at ≤0, locale-free padding),
    `dataLabel` (deterministic locale-independent byte ladder B→KB→MB→GB→TB, one decimal, `null` when no
    counters recorded or the total is zero).
- **TDD red → green:** wrote `CallRecordTest` (+22) first; first compile failed **red** on a real defect —
  a `private companion object` holding the helpers shadowed the `@Serializable`-generated public
  `serializer()`, so `CallRecord.serializer()` was inaccessible. Fixed by moving the pure helpers to
  file-private top-level functions (no companion), letting serialization generate its own public one.
  Tests then green. Coverage of new logic: every `CallDirection` arm incl. the unknown-degrades arm; both
  `forVideo` arms; all four `displayName` tiers incl. blank/empty skips and the fallback; all `avatarUrl`
  fallbacks; `durationLabel` zero/negative/sub-minute/minute/hour-boundary; `dataLabel` both-null / zero /
  single-counter / KB-MB-GB ladder; and a real gateway-shaped JSON decode with and without a `peer`
  (unknown extra key tolerated). No `@Composable`/glue in the slice — 100% of it is the covered target.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles + all JVM
  unit tests green). `:core:model:testDebugUnitTest` = `CallRecordTest` 22/22, skipped 0, failures 0.
- **Reviewer gate:** PASS. Scope = `apps/android/core/model` only (2 new files), no secrets, no production
  logic touched. Behavioural tests through the public API, no tautologies, no floor lowered. SDK purity
  respected (stateless model in `:core:model`); single source of truth (this IS the SSOT for call-journal
  display); immutable data, early returns. Edge cases covered per §3.
- **Next:** the call-history **repository** (REST `/calls/history` fetch + Room cache, cache-first SWR),
  then the missed/recent-calls **list UI**; independently, fold `CallSignalManager.events` into
  `CallViewModel` once the `initiate`-ACK call-id lifecycle lands.

### 2026-07-01 — slice `call-signal-manager` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the open PRs — #1221-1229 —
  are all ios/web/gateway). `origin/main` HEAD `c8063196` (PR #1220). Branched
  `claude/apps/android/call-signal-manager` off latest `main`.
- **What:** the **socket subscription + outbound emit table** half of the Calls signalling wiring —
  a new `:sdk-core` `CallSignalManager`, a transport building block mirroring `MessageSocketManager`/
  `SocialSocketManager`.
  - **Inbound.** `attach()` registers a `SocketManager.on(...)` listener for all 8 inbound `call:*`
    frames (`initiated`/`signal`/`participant-joined`/`ended`/`missed`/`media-toggled`/`error`/
    `already-answered`), converts each first-arg `JSONObject` to its string form, routes it through the
    pure `CallSignalMapper.map(event, raw)` (the single tested source of "which frame is which event"),
    and `tryEmit`s any non-null `CallEvent` on the hot `SharedFlow<CallEvent> events` (replay 0, buffer
    64 — parity with the other managers). A non-`JSONObject` first arg, a malformed frame, or a
    mapper-inert frame (ICE candidate / renegotiation offer / media-toggle) emits nothing.
  - **Outbound.** Fire-and-forget lifecycle emits at **iOS-exact** payload keys (pinned so a rename
    can't silently break the gateway handler): `emitJoin`/`emitLeave`/`emitEnd` → `{callId}`,
    `emitToggleAudio`/`emitToggleVideo` → `{callId, enabled}`, `emitSignal` → `{callId, signal}`
    (nested SDP/ICE object). Derived from the iOS `CallEmitSourceGuardTests` emit table.
  - **Deliberately deferred** (documented, not orphaned): the ACK-based `call:initiate` (mints the
    callId; returns ICE servers — belongs with WebRTC) and `request-ice-servers`/`heartbeat`/
    `quality-report`/`reconnecting`/`reconnected`. The VM-fold + app-level `attach()` caller wait on
    the call-id lifecycle (an `initiate`-ACK slice) — same building-block-awaiting-wiring status as
    `SocialSocketManager`/`MessageSocketManager` today.
- **Tests (+18, `CallSignalManagerTest`, Robolectric):** mockk `SocketManager` capturing `on(...)`
  handlers (SocialSocketManagerTest pattern) + `emit(...)` payload slots.
  - Inbound (12): each of the 10 mapped outcomes (initiated→ReceiveIncoming, participant-joined→
    ParticipantJoined, signal answer→RemoteAnswer, ended missed→RingTimeout, ended rejected→
    RemoteHangUp, missed→RingTimeout, error→ConnectionFailed(msg), already-answered→RemoteHangUp) +
    2 inert (signal ice-candidate, media-toggled) `expectNoEvents` + malformed-missing-callId +
    non-JSONObject-arg both `expectNoEvents`.
  - Outbound (6): each emit verified for event name + payload keys/values via `slot<JSONObject>`.
- **Verify:** `./apps/android/meeshy.sh check` — `assembleDebug` + full `testDebugUnitTest` **BUILD
  SUCCESSFUL** (CallSignalManagerTest 18/18; no regressions).
- **Reviewer gate: PASS** — apps/android-only diff (1 prod file + 1 test + docs); behavioural tests,
  no tautologies; SDK-pure building block reusing the `CallSignalMapper` SSOT; edge cases (malformed /
  non-object / inert frames) covered; no coverage floor touched.
- **Next:** the `initiate`-ACK slice (call-id lifecycle) → then fold `events` into `CallViewModel`.

### 2026-07-01 — slice `call-signalling-events` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration (the 30 open PRs are all
  ios/web/gateway/shared); `origin/main` HEAD `deb81adf` (iter 61, web). Branched
  `claude/apps/android/call-signalling-events` off latest `main`.
- **What:** gave the pure call FSM its **inbound wire vocabulary** — `core:model`
  `me.meeshy.sdk.model.call` now models every inbound `call:*` frame and maps it to a `CallEvent`.
  - **`CallSocketEvents.kt`** (payload models): `@Serializable` data classes at parity with the iOS
    `MessageSocketManager` listen table — `CallSignalPayload` (SDP/ICE: type/sdp/candidate/sdpMLineIndex/
    sdpMid/from/to/negotiationId), `CallInitiatedPayload` (+`CallInitiatorInfo`), `CallSignalEnvelope`,
    `CallParticipantPayload`, `CallEndedPayload` (reason), `CallMissedPayload`, `CallMediaTogglePayload`,
    `CallErrorPayload`, `CallAlreadyAnsweredPayload`. Required identifiers are non-null so a frame missing
    them fails to decode and is treated as inert (iOS `guard let` parity).
  - **`CallSignalMapper.kt`** (pure `object`): `map(eventName, rawJson): CallEvent?` — total &
    side-effect-free, lenient `Json { ignoreUnknownKeys; isLenient }`, wrapped in `runCatching` so a
    malformed/unknown frame yields `null` (never crashes, never an illegal transition). Routing:
    `call:initiated`→`ReceiveIncoming`; `call:participant-joined`→`ParticipantJoined`; `call:signal`
    type=`answer`→`RemoteAnswer` (renegotiation `offer` / `ice-candidate` / unknown / no-signal → `null`,
    inert plumbing); `call:ended` reason=`missed`→`RingTimeout` else `RemoteHangUp`; `call:missed`→
    `RingTimeout`; `call:media-toggled`→`null` (media state, not a phase); `call:error`→
    `ConnectionFailed(message ?? code ?? "Call error")`; `call:already-answered`→`RemoteHangUp`; unknown
    event name → `null`.
- **Tests (+22, red → green):** `CallSignalMapperTest` drives the public `map(eventName, rawJson)` with
  realistic gateway JSON strings and asserts the mapped `CallEvent`/`null` — every branch: each event name,
  the `signal.type` switch (answer/offer/ice/unknown/no-signal/extra-unknown-fields), the `reason` switch
  (missed/completed/rejected/absent), the inert plumbing events, the message/code/generic error fallback
  chain, missing required ids (initiated/media-toggled), unknown event name, and malformed/empty JSON
  (graceful, no crash). RED was real: the tests fail to compile without the mapper + models.
- **Verification:** `:core:model:testDebugUnitTest` → `CallSignalMapperTest` 22/22 green; full
  `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (no regression across all modules). Diff is
  `apps/android` only (2 prod files + 1 test + docs; `git status` clean of any web/ios/gateway/shared path).
- **Reviewer gate:** PASS — SDK purity respected (stateless pure mapper + data models in `core:model`,
  no product orchestration/singletons/Compose); single source of truth (the mapper feeds the SSOT
  `CallStateMachine`, no re-implementation of transition logic); behaviour-tested through the public API
  (no tautologies, no reflection, asserts the mapper's transformation not a canned return); near-total
  branch coverage incl. the inert/malformed/boundary arms; immutable data, early returns, no coverage floor
  touched; graceful failure paths (malformed frame → inert, never a crash).

### 2026-07-01 — slice `calls-viewmodel-screen` ✅ shipped
- **Step 0 (housekeeping):** no Android PR open from a prior iteration; `origin/main` HEAD `1827303`
  (iter 53, web). Branched `claude/apps/android/calls-viewmodel-screen` off latest `main`.
- **What:** gave the pure call FSM (`core:model` `me.meeshy.sdk.model.call`) its **first real consumer** —
  a new `:feature:calls` Gradle module (`include(":feature:calls")`, wired into `:app`).
  - **`CallPresenter`** (pure): projects `CallState × CallConfig × CallMedia → CallUiState`. Owns every
    UI decision — `CallStatus` (IDLE/INCOMING/OUTGOING_RINGING/CONNECTING/CONNECTED/RECONNECTING/ENDED,
    with `Offering` collapsing to CONNECTING), the `showAnswerControls`/`showHangUp`/`canToggleMedia`/
    `isActive`/`isEnded` affordances, the terminal `endReason`, the reconnect attempt, and the
    camera-only-if-video rule. Media intent (mute/camera) rides alongside the phase, never inside the FSM
    (iOS `CallManager` parity).
  - **`CallViewModel`** (UDF, `@HiltViewModel`): holds `CallState` + `CallMedia`, folds
    `start`/`accept`/`decline`/`hangUp`/`onSignal`/`toggleMute`/`toggleCamera`/`dismiss` through
    `CallStateMachine.reduce`, republishes an immutable `StateFlow<CallUiState>` via `CallPresenter`.
    `start` is **inert unless idle** (re-entrant launch effect never resets a live call); `dismiss`
    settles a terminal call back to idle. No `viewModelScope` needed — every transition is synchronous
    and deterministic (the async WebRTC/signalling plumbing is the next slice).
  - **`CallScreen`** (glue): accent-coherent (`DynamicColorGenerator.colorForName`) full-screen call UI
    rendering the phase + peer + status label, with accept/decline/hang-up/mute/camera/close controls the
    state exposes. Reachable from **audio & video call buttons added to the chat header** (iOS parity);
    `onClose` returns to chat (coherent dismissal). +2 strings × 4 locales in `:feature:chat`, 18 strings
    × 4 locales in `:feature:calls`.
- **Tests (+34, red → green):** `CallPresenterTest` (20) sweeps every `statusOf` arm + every derived
  affordance's true/false branches + the camera video/audio matrix + end-reason/reconnect exposure;
  `CallViewModelTest` (14) drives the intents through the public `state` API (outgoing negotiate→connected,
  incoming accept→connecting, decline→Rejected, hang-up→Local, remote hang-up→Remote, mute/camera toggles,
  audio call never reports camera on, `start` inert mid-call, dismiss→idle, restart after settle). **RED
  caught a real bug:** an assertion assumed `Offering` blocks media toggle, but `Offering` presents as
  CONNECTING (which allows it) — the test expectation was corrected to match the intended collapse, not
  the code weakened.
- **Verification:** `:feature:calls:testDebugUnitTest` → 34/34 green; `:app:assembleDebug` → **BUILD
  SUCCESSFUL** (the chat-header + nav wiring compiles). Diff is `apps/android` only (`git status` clean of
  any web/ios/gateway/shared path).
- **Reviewer gate:** PASS — SDK purity respected (pure `CallPresenter` + FSM in `core:model`; product
  orchestration in `:feature:calls`/`:app`); UDF with immutable `StateFlow<CallUiState>` + pure
  transitions; single source of truth for colour (`DynamicColorGenerator`) and call transitions
  (`CallStateMachine`); behaviour-tested through the public API (no tautologies, no reflection); near-total
  branch coverage on the pure logic incl. inert/boundary arms; no coverage floor touched; natural chat-header
  entry with coherent dismissal (no dead end).

### 2026-06-30 — slice `call-state-machine` ✅ shipped (PR pending → squash-merge) + unblocked & merged `story-sticker-picker-search` (PR #1135)
- **Step 0 (housekeeping):** the prior run's PR #1135 (`story-sticker-picker-search`) was open and
  ⚠ blocked on a **pre-existing red `main`** (the `Test web` a11y failure in `invite-user-modal.test.tsx`).
  `main` has since gone **green** (the fix merged; HEAD `c261f0bd` CI = success). Rebased #1135 onto current
  `main` (clean, apps/android-only), re-ran CI → **all green** (the once-red `Test web` now passes),
  local `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL**, then **squash-merged** to `main`
  (`876f9087`). Hard-rule honoured: never merged past the red CI; merged only once `main` was green.
- **Then advanced one phase** into the **Calls** area (Stories richness is now sufficient — composer
  has slides/deck/per-slide media/text-elements/stickers/filters/z-order/snap/canvas-transform/toolbar,
  all non-UI files tested).
- **What:** the first Calls brick — a **pure call-lifecycle FSM** in `core:model`
  (`me.meeshy.sdk.model.call`), the single source of truth the future `:feature:calls` wiring drives.
  - `CallState` (Idle / Ringing(isOutgoing) / Offering / Connecting / Connected / Reconnecting(attempt) /
    Ended(reason)) with derived flags `isActive`/`isRinging`/`isEnded`/`canStart`.
  - `CallEndReason` (Local / Remote / Rejected / Missed / ConnectionLost / Failed(message)) — faithful
    port of iOS `WebRTCTypes.CallEndReason` incl. the message-carrying `Failed`.
  - `CallEvent` — the 15 lifecycle triggers (StartOutgoing/ReceiveIncoming/ParticipantJoined/
    LocalAnswer/RemoteAnswer/MediaConnected/ConnectionStalled/ReconnectFailed/Reject/LocalHangUp/
    RemoteHangUp/RingTimeout/ConnectionFailed(msg)/Settle).
  - `CallStateMachine.reduce(state, event, maxReconnectAttempts = 3)` — total, side-effect-free,
    faithfully mirroring the iOS `CallManager` transition table (outgoing: ringing→offering→connecting→
    connected; incoming: ringing→connecting→connected; connected→reconnecting on stall; reconnect budget
    of 3 → `Ended(ConnectionLost)`; ringing timeout → `Missed`; incoming decline → `Rejected`). Every
    inapplicable event is **inert** (same state); terminal `Ended` only leaves via `Settle` → `Idle`, so
    the machine always settles and never loops. **Surpasses iOS**, where a real FSM validator is only a
    P1 "todo" in its calls SOTA plan.
- **Why `core:model` (not a new `:feature:calls` module):** the FSM is a stateless pure building block
  (SDK-purity grain test → agnostic, parameter-driven, no product orchestration), and `core:model`
  already hosts the codebase's pure domain logic (`EmojiUsageRanker`, `ConversationFilter`,
  `LanguageResolver`). Keeps the slice tight (no Gradle-module wiring) and the FSM reusable by both the
  app and the SDK. The `:feature:calls` ViewModel + minimal screen that *consume* it are the next slice.
- **Tests (+31, red → green):** `CallStateMachineTest` (`core:model`). RED captured first (types
  unresolved). Branch sweep — every `when` arm exercised, including: idle ignores mid-call events;
  outgoing ringing ignores local-answer & reject; incoming ringing ignores participant-join; offering
  ignores the (cancelled) ring timeout; connecting ignores a pre-media stall; connected ignores a
  redundant media-connected; the reconnect-budget boundary (`attempt >= max` → `ConnectionLost`, both
  default max=3 and max=1); ended is inert and keeps its original reason; plus three end-to-end folds
  (outgoing happy path, incoming happy path, stall→reconnect→recover).
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (debug APK assembles, all
  modules' JVM unit tests green; `CallStateMachineTest` 31/31). Diff is `apps/android` only.
- **Reviewer gate:** PASS — pure stateless building block (SDK-purity respected), behaviour tested
  through the public `reduce` API (no tautologies, no reflection), near-total branch coverage incl. the
  inert/no-op and boundary arms, no coverage floor touched.

### 2026-06-30 — slice `story-sticker-picker-search` ⚠ blocked (PR #1135, merge-blocked on red `main`)
- **Status:** implementation + tests + reviewer gate all **DONE/PASS**; merge **blocked** by a
  **pre-existing, unrelated** failure on `main`. The monorepo CI's `Test web` job fails on a single
  web a11y test — `__tests__/components/conversations/invite-user-modal.test.tsx:493`
  (`getByRole('button', { name: 'John Doe déjà sélectionné' })` → `toBeDisabled`); **1 failed /
  10 769 passed**, all in that one web file. My diff is `apps/android` only and touches **zero** web
  code, so it cannot have caused this — it is the same broken-`main` regression open PR #1131 documents
  and carries the fix for. I can't fix it here (editing `invite-user-modal.tsx` is web production logic,
  which breaks the "diff is apps/android only" hard gate). **Unblock:** once `main` goes green (a fix
  like #1131 merges), rebase this branch onto it (`update_pull_request_branch`) → CI re-runs green →
  squash-merge. The `*/8 min` self-check cron (`b4133933`) re-checks and will rebase + merge when `main`
  is green. **Do NOT merge past this red CI** (hard rule).
- **Branch:** `claude/apps/android/story-sticker-picker-search` (off `origin/main` @ `a751730f`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` → only
  dependabot + non-android `claude/*` branches: #1133 ios-calls, #1132 translator, #1131 gateway, #1130
  gateway-coverage). Branched clean off the freshened `origin/main`.
- **What:** the **categorised + searchable** emoji sticker picker (feature-parity §Stories + audit
  part-21 `StickerPickerView`), replacing the old flat `STORY_STICKER_EMOJIS` palette. iOS parity: 8
  category tabs (smileys/animals/food/activities/travel/objects/symbols/flags) + a search field; a
  non-blank query searches across **all** categories.
- **Design (single source of truth, SDK purity):** two pure types in `:feature:stories` (composer
  product logic, mirroring where `StoryStickerElement` lives). `StickerCatalog` — `enum StickerCategory`
  (8, tab order), `data class StickerEntry(emoji, category, keywords)`, the curated catalogue (~16
  keyworded emojis/category, every glyph in exactly one category so `all` is duplicate-free),
  `inCategory(cat)`, `all`, and `search(query, category?)`: trim+lowercase substring over keywords **or**
  the glyph itself, blank query ⇒ whole scope unfiltered, result preserves catalogue order + `distinct`.
  `StickerPickerState(category, query)` — the product reducer: `isSearching` (non-blank), `visibleEmojis`
  (global `search` while searching so the tab is intentionally ignored, else the tab's emojis),
  `withCategory`/`withQuery` (inert/same-instance on no-op). The decision lives in one unit-tested place;
  the dialog stays glue.
- **Changed (production — all `:feature:stories`, `apps/android` only):** `StickerCatalog.kt` (new),
  `StoryComposerScreen.kt` (`StickerPickerDialog` → search field + `FilterChip` tab row + filtered grid +
  empty-state; removed `STORY_STICKER_EMOJIS`), `values{,-fr,-es,-pt}/strings.xml` (10 strings × 4 locales:
  search hint, no-results, 8 category labels).
- **Tests (+22, red→green):** `StickerCatalogTest` — catalogue shape (every category non-empty,
  `inCategory` order, `all` = concat + duplicate-free + tab order), search (blank ⇒ scope, category-scoped
  blank, keyword match, case-insensitive + trim, substring, spans-all-categories, category-scoped excludes
  others, glyph match, no-match ⇒ empty, order-preserving + distinct), reducer (default smileys/not-
  searching, tab select, whitespace not searching, query searches-all-ignoring-tab, clear ⇒ tab,
  `withCategory`/`withQuery` inert, select-tab-while-searching keeps global result). First RED caught a
  real duplicate (`⭐` in OBJECTS+SYMBOLS) → fixed to `☮️`. No floor lowered, no test weakened.
- **Edge cases:** empty/blank/whitespace query, no-match (empty grid → empty-state), single-category
  scope, glyph-as-query, duplicate-free, idempotent reducer transitions (same instance).
- **Verify:** `./gradlew assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (debug APK assembles; all
  modules' unit tests green; `StickerCatalogTest` 22/22). Diff = `apps/android` only.
- **Reviewer gate:** PASS — pure behaviour through the public API, no tautologies, SDK purity respected
  (pure catalogue/reducer in `:feature:stories`, dialog is glue), single source of truth (catalogue
  replaces the flat palette), UX coherence (natural tabs + live search, no dead-end — empty-state).

### 2026-06-30 — slice `story-sticker-elements` ✅
- **Branch:** `claude/apps/android/story-sticker-elements` (off `origin/main` @ `d06d5ec`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` → only
  dependabot + non-android `claude/*` branches; the prior slice `story-photo-filters` is already merged).
  Branched clean off the freshened `origin/main`.
- **What:** **on-canvas emoji stickers** for story slides — the second **real Contenu/Effets tile**
  (feature-parity §Stories "Emoji sticker picker"). A user taps a "Sticker" tile in the Contenu drawer,
  picks an emoji from a grid, and it lands on the 9:16 canvas where it can be dragged, pinch-zoomed/rotated
  and removed; it rides into publish on the existing `StoryEffects.stickerObjects` wire (no dead end — the
  gateway model `StorySticker` already existed).
- **Design (single source of truth, SDK purity):** pure immutable `StoryStickerElement`
  (`:feature:stories`, composer **product** state) mirroring `StoryTextElement` — normalised `x/y`, clamped
  `scale`, wrapped `rotationDeg`, `isPublishable`, `normalised`/`transformed`/`nudged`, `toSticker()` wire.
  To keep canvas geometry in **one** place it **reuses** `StoryTextElement.clampCoord`/`clampScale`/
  `normaliseRotation`. The deck is the source of truth: `StorySlide.stickers` + total reducers
  `addStickerToSelected`/`removeSticker`/`updateSticker`/`moveSticker`/`transformSticker` (same-instance
  when inert), `MAX_STICKERS_PER_SLIDE=30` (iOS has no hard composer cap — generous SOTA bound),
  `hasStickers`/`isWithinStickerLimit`/`selectedRemainingStickerSlots`/`selectedCanAddSticker`;
  `publishableSlides` now admits a sticker-only slide. The VM adds
  `onAddSticker`/`onSelectSticker`/`onDeselectSticker`/`onRemoveSticker`/`onStickerMoved`/
  `onStickerTransform` with sticker selection **mutually exclusive** vs the text-element edit (each clears
  the other; a slide switch clears a stale selection in `mirrorDraftToSelection`). `publishPlans` threads
  each slide's stickers into its per-slide draft.
- **Changed (production — all `:feature:stories`, `apps/android` only):** `StoryStickerElement.kt` (new),
  `StorySlideDeck.kt`, `StoryComposerDraft.kt`, `StoryComposerViewModel.kt`, `ComposerBandState.kt`
  (`ComposerContentTile.STICKER`), `StoryComposerScreen.kt` (Contenu Sticker tile → `StickerPickerDialog`
  emoji grid; on-canvas `StickerLayer` drag/pinch/rotate/remove; `StoryCanvasSurface` threads sticker
  state — glue), `values{,-fr,-es,-pt}/strings.xml` (2 strings × 4 locales).
- **Tests (TDD red → green, behaviour via public API): +~53.** `StoryStickerElementTest` (new, +15) —
  defaults, publishability, normalised coord/scale/rotation/non-finite/no-op, transformed clamps + wrap +
  isolation, nudged clamp/free, toSticker. `StorySlideDeckStickersTest` (new, +21) — add selected-only/
  clamp/preserve-selection/dup-inert/cap-inert, remaining-slots, remove holding/unknown, update
  match-reclamp/unknown, move clamp/unknown, transform scale+rotate/clamp/isolation/unknown, limit at/over,
  hasStickers blank vs real, sticker-only publishable, blank-only not. `StoryComposerDraftTest` (+5) —
  stickerObjects serialise + drop blanks, sticker-only payload, no-sticker null, sticker-only publishable,
  blank-only not. `StoryComposerViewModelTest` (+~12) — add+select+publishable, blank ignored, add clears
  text edit, select-text clears sticker, cap warning, select-unknown inert, move clamp, transform
  accumulate, transform-unknown unchanged, remove clears selection, deselect, slide-switch clears stale,
  publish carries stickerObjects. `ComposerBandStateTest` — STICKER tile category + contentTiles order.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + full
  `testDebugUnitTest`, 836 tasks; `:feature:stories` green incl. the new suites). Diff = `apps/android`
  only (6 prod Kotlin incl. 1 new, 4 strings, 4 test incl. 2 new, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered; 2 band tests *expanded*,
  not weakened); SDK purity (sticker math + reducers product state in `:feature:stories`, glue in the
  Composable, wire `StorySticker` reused from `core/model`); single source of truth (geometry reused from
  `StoryTextElement`, wire token reused); UDF (VM + immutable `StateFlow`, transitions pure); edge cases
  (cap, dup id, unknown id inert, blank emoji, clamp, per-slide isolation, mutual-exclusive selection,
  slide-switch stale clear); colour/UX coherence (EmojiEmotions tile in the Contenu drawer like the other
  tiles, natural drag/pinch/remove mirroring text elements, picker places a publishable sticker — no dead
  end).
- **Follow-ups:** the **categorised + searchable** sticker picker (palette is a flat curated set today);
  remaining Effets tiles (freehand drawing, backgrounds, timeline); a unified multi-element context menu;
  then advance to **Calls**.

### 2026-06-30 — slice `story-photo-filters` ✅
- **Branch:** `claude/apps/android/story-photo-filters` (off `origin/main` @ `444a983`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; the prior slice `story-text-element-zorder` is merged as
  **#1062**). Branched clean off the freshened `origin/main`.
- **What:** **8 photo filters with adjustable strength** for story slides (feature-parity §Stories
  "8 photo filters … with intensity" — now checked; the first **real Effets tile**, which previously
  surfaced only visibility). Each slide can apply one of the iOS presets (vintage / b&w / warm / cool /
  dramatic / vivid / fade / chrome) and dial its strength; the canvas shows it live and it rides into
  publish. The wire already had `StoryFilter` + `StoryEffects.filter`/`filterIntensity`, so it is no
  dead end.
- **Design (single source of truth, SDK purity):** the *look* lives in **one** pure, Compose-agnostic
  place — `StoryFilterMatrix` (`:feature:stories`, composer product math): `StoryColorMatrix` wraps a
  20-float 4×5 matrix as a `List<Float>` (value equality so it JVM-tests), `baseMatrix(StoryFilter)`
  gives each preset's full matrix, and `effectiveMatrix(filter, intensity)` blends the base toward the
  neutral `IDENTITY` by `clampIntensity` (0 ⇒ identity, 1 ⇒ base, non-finite ⇒ full default); `blend`
  short-circuits the `k≤0`/`k≥1` endpoints so "full strength == base" is exact (no float drift) and
  `StoryFilter.wireValue()` is the lone enum→gateway-token mapping, kept beside the matrices so the look
  and the wire value never diverge. Per-slide state: `StorySlide.filter`/`filterIntensity` + the deck
  reducers `setSelectedFilter`/`setSelectedFilterIntensity` (clamp in one place, only the selected slide,
  selection preserved; `duplicate` carries the look for free). The VM adds `onSelectFilter`/
  `onFilterIntensityChange` (one-line `applyDeck`, element-edit selection preserved) and the derived
  `selectedSlideFilter`/`selectedSlideFilterIntensity`/`selectedSlideFilterMatrix`. The composer draft
  gains `filter`/`filterIntensity`; `storyEffects()` now emits a payload when there are text objects
  **or** a filter (a filter-only slide still serialises), and `publishPlans` threads each slide's look.
- **Changed (production — all `:feature:stories`, `apps/android` only):**
  - `StoryFilterMatrix.kt` (new) — `StoryColorMatrix` (+`IDENTITY`/`blend`), `StoryFilterMatrix`
    (`DEFAULT_INTENSITY`/`clampIntensity`/`baseMatrix`/`effectiveMatrix`), `StoryFilter.wireValue()`.
  - `StorySlideDeck.kt` — `StorySlide.filter`/`filterIntensity`; `setSelectedFilter`/
    `setSelectedFilterIntensity` reducers.
  - `StoryComposerViewModel.kt` — derived filter state; `onSelectFilter`/`onFilterIntensityChange`;
    per-slide publish draft carries the look.
  - `StoryComposerDraft.kt` — `filter`/`filterIntensity` + `withFilter`; `storyEffects` serialises the
    filter + clamped strength.
  - `StoryComposerScreen.kt` — canvas `AsyncImage` `ColorFilter.colorMatrix(...)`; `FilterRow` (None + 8
    chips) + strength `Slider` in the Effets drawer (glue).
  - `values{,-fr,-es,-pt}/strings.xml` — 11 strings × 4 locales (intensity label, None, 8 names).
- **Tests (TDD red → green, behaviour via public API): +43.**
  - `StoryFilterMatrixTest` (new, +21): identity shape + 20-component require; blend at 0/1/half +
    negative/over-one clamp; effectiveMatrix null/0/1/half/clamp-both/non-finite; clampIntensity bounds +
    non-finite→default; every preset ≠ identity; all 8 distinct; BW row-equality; wireValue per preset +
    all distinct.
  - `StorySlideDeckFilterTest` (new, +10): fresh slide defaults; setSelectedFilter selected-only /
    preserves selection / clears with null / leaves text+media; setSelectedFilterIntensity sets /
    clamps over / clamps under / selected-only; duplicate carries the look.
  - `StoryComposerViewModelTest` (+7): select applies + matrix; clear → identity matrix; intensity
    blends; intensity clamp; filter stays on its slide across selection; select keeps element edit.
  - `StoryComposerDraftTest` (+5): filter + strength on the wire; filter-only payload; no-filter null
    fields; clamped strength on the wire.
  - **Branch sweep:** every arm of `blend` (k≤0 / k≥1 / interior), `clampIntensity` (finite / non-finite),
    `effectiveMatrix` (null / filter), `baseMatrix` (all 8), `wireValue` (all 8), and both deck reducers
    (selected vs other slide) is exercised.
- **RED→GREEN note:** the first run had 3 reds — `blend(.., 1f)` drifted by an ULP (`a+(b-a)*1f ≠ b` in
  float), so `isEqualTo(base)` failed at full strength. Fixed by short-circuiting the blend endpoints
  (also the correct design: exact identity/base at the extremes). Recorded in NOTES.md.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests, 836 tasks; `StoryFilterMatrixTest` 21/21, `StorySlideDeckFilterTest` 10/10, 0 failures).
  Diff = `apps/android` only (5 prod Kotlin incl. 1 new, 4 strings, 3 test incl. 2 new, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered); SDK purity (filter math +
  reducers are composer **product** state in `:feature:stories`, glue in the Composable, wire enum reused
  from `core/model`); single source of truth (matrices + wire token + clamp each in one place); UDF (VM +
  immutable `StateFlow`, transitions pure); edge cases (intensity 0/1/clamp/non-finite, null filter,
  per-slide isolation, duplicate-carry); colour/UX coherence (Effets chips reuse Material `FilterChip`
  like the visibility row, live canvas preview, filter-only slide still publishes — no dead end).
- **Follow-ups:** the remaining Effets tiles (freehand drawing, emoji stickers, backgrounds, timeline);
  then a unified multi-element context menu; then advance to **Calls**.

### 2026-06-30 — slice `story-text-element-zorder` ✅
- **Branch:** `claude/apps/android/story-text-element-zorder` (off `origin/main` @ `de08134`).
- **Housekeeping (step 0):** the prior slice's PR **#1048** (`story-canvas-snap-guides`) was found **open
  with merge conflicts** (main had advanced past its base with `story-composer-band` + the gateway test
  slices). Fetched both refs, **rebased the PR branch onto `origin/main`**, resolved 3 conflicts —
  `StoryComposerViewModel.kt` (kept **both** `band` + `snapFeedback` state fields),
  `StoryComposerScreen.kt` (kept **both** import sets), `PROGRESS.md` (kept **both** next-slice + run-log
  entries) — per the "keep BOTH sides" rule. Verified the resolution with `meeshy.sh check` (BUILD
  SUCCESSFUL) before pushing. The maintainer then squash/merge-committed #1048 to `main` (commit
  `de08134`); local `main` reset to it (clean, no markers). Branched this slice off that fresh `main`.
- **What:** **z-order management** for on-canvas text elements (feature-parity §Stories "Z-order
  management (front/back, forward/backward) persisted for WYSIWYG playback" — now checked). The slide's
  `elements` list order *is* the paint order (index 0 = back, last = front, matching the canvas
  `forEach` render), so restacking an element = a list move within its slide. A 4-button z-order row in
  the floating `TextStyleToolbar` (send-to-back / backward / forward / bring-to-front) drives it.
- **Design (SDK purity, single source of truth):** the order rule lives in **one** pure place,
  `StorySlideDeck.reorderTextElement(id, op: StoryZOrder)`. The new top-level `StoryZOrder` enum
  (`TO_BACK | BACKWARD | FORWARD | TO_FRONT`) maps to a target index (`0` / `from-1` / `from+1` /
  `lastIndex`) `coerceIn`-clamped to the list bounds; `target == from` (already-extreme / single
  element) and an unknown id both return the **same instance**. Only the element's holding slide is
  restacked (located by id, so it works on a non-selected slide); the others and the selection are
  untouched. `StoryComposerViewModel.onReorderTextElement` wraps it and keeps the same **state**
  instance on an inert move (`deck === state.deck` ⇒ no `copy`), so an inert tap never churns
  recomposition. Selection/editing untouched — you restack the element you're editing.
- **Changed (production — all `:feature:stories`, `apps/android` only):**
  - `StorySlideDeck.kt` — new `StoryZOrder` enum + pure `reorderTextElement` reducer.
  - `StoryComposerViewModel.kt` — `onReorderTextElement` intent (same-instance on inert).
  - `StoryComposerScreen.kt` — z-order row in `TextStyleToolbar` + `ZOrderButton` glue + 4 icon imports.
  - `values{,-fr,-es,-pt}/strings.xml` — 4 z-order content-description strings × 4 locales.
- **Tests (TDD red → green, behaviour via public API): +16**
  - `StorySlideDeckZOrderTest` (+13): TO_FRONT/TO_BACK move + keep others' order; FORWARD/BACKWARD
    single-step swap; each op inert at its extreme; unknown id inert (all ops); single-element slide
    inert (all ops); restacks only the holding slide; finds element on a non-selected slide + preserves
    selection; preserves the moved element's content.
  - `StoryComposerViewModelTest` (+3): TO_BACK restacks + keeps the element selected + still editing;
    TO_FRONT restacks; unknown id leaves the **same** state instance.
  - **Branch sweep:** every arm of the `when(op)` (4), the `coerceIn` bound + `target == from` inert
    arm, the `slideIndex < 0` inert arm, and the VM same-instance vs copy arms are exercised.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests; `StorySlideDeckZOrderTest` 13/13, the 3 VM cases green). Diff = `apps/android` only
  (3 source + 4 strings + 2 test + tracking). **Reviewer rubric: PASS** — pure logic full branch
  coverage, behaviour-only tests (incl. same-instance no-churn), no floor lowered, reuse of the
  existing slide/element model (no new reducer family), accent-coherent toolbar, no dead-end.

### 2026-06-30 — slice `story-canvas-snap-guides` ✅
- **Branch:** `claude/apps/android/story-canvas-snap-guides` (off `origin/main` @ `49c7576`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (the prior slice's PR #1045 is **merged**;
  `list_pull_requests state=open` shows only dependabot/non-android `claude/*` branches). ⚠ Pitfall hit &
  fixed: `git pull origin main` failed (`Need to specify how to reconcile divergent branches` — no pull
  strategy configured), and the local `main` was **stale** (missing PR #1045). A branch cut from it lost
  the `scale`/`rotation` fields. Recovered with `git fetch origin main && git checkout -B <slice> origin/main`.
  **Lesson recorded in NOTES.md:** always rebase the slice onto `origin/main`, never local `main`.
- **What:** **snap-to-guide + out-of-bounds (safe-zone) warning** for on-canvas element dragging
  (feature-parity §Stories "Frosted-glass … safe-zone overlay; snap-to-guide + out-of-bounds warning").
  Dragging a text element now magnetically locks each axis onto the nearest alignment guide (rule-of-thirds
  + centre) and flashes an out-of-bounds border when the centre drifts into the edge margin. A natural
  magnetic-alignment gesture — surpasses iOS, which lacks a per-axis guide overlay here.
- **Design (SDK purity, single source of truth):** the snap math lives in **one** pure place,
  `StorySnapResolver.resolve(x, y, verticalGuides, horizontalGuides, threshold, safeZoneInset)` →
  `SnapResult(x, y, verticalGuide, horizontalGuide, withinSafeZone)`. Each axis snaps **independently**
  (nearest in-range guide within `SNAP_THRESHOLD=0.025`; else the clamped candidate); non-finite →
  canvas centre; out-of-canvas → clamped `0f..1f`; `withinSafeZone` uses `SAFE_ZONE_INSET=0.06`. **Reuse,
  no new reducer:** `onTextElementMoved` now runs its resulting centre through the resolver and moves the
  element by the snap-**adjusted** delta via the existing `StorySlideDeck.moveTextElement` path, exposing
  the live guides + verdict as transient `StoryComposerUiState.snapFeedback` (immutable `SnapFeedback`),
  cleared by the new `onTextElementDragEnd()` on lift. The Composable stays glue: a `Canvas` draws the
  active guide line(s) (accent `primary`) + an `error` warning border, and a non-consuming `Final`-pass
  `awaitEachGesture` next to the transform detector signals lift.
- **Changed (production — all `:feature:stories`, `apps/android` only):**
  - `StorySnapResolver.kt` (new) — pure `SnapResult` + `StorySnapResolver` (guides/threshold/inset consts,
    per-axis `snapAxis`, `withinSafeZone`, non-finite/clamp handling).
  - `StoryComposerViewModel.kt` — `SnapFeedback` immutable type, `StoryComposerUiState.snapFeedback`,
    snap-aware `onTextElementMoved`, new `onTextElementDragEnd`.
  - `StoryComposerScreen.kt` — guide-line `Canvas` overlay, safe-zone warning border, `onDragEnd` wiring +
    `Final`-pass drag-end detector (glue).
- **Tests (TDD red → green, behaviour via public API): +25**
  - `StorySnapResolverTest` (+18): free drag; between-guides-no-snap; centre snap (both axes); thirds snap;
    independent axes; threshold inclusive boundary; just-past-threshold free; non-positive threshold off;
    empty guides; out-of-range guides filtered; only-out-of-range no-snap; out-of-canvas clamp; non-finite →
    centre; safe-zone inclusive inset; out-of-bounds left/right/bottom.
  - `StoryComposerViewModelTest` (+7): centre-snap holds element + reports guides; past-threshold free no
    guides; edge drag → out-of-safe-zone; unknown-id inert (no feedback); existing clamp test preserved;
    drag-end clears feedback keeps placement; drag-end inert when no feedback (same-instance).
  - **Branch sweep:** every arm of `snapAxis` (threshold≤0 / empty / nearest-within / nearest-beyond),
    `clampCoord` (finite / non-finite), `withinSafeZone` (in / out per edge), and the VM intents (known /
    unknown id, feedback present / absent) is exercised.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests; `:feature:stories` 494 tests green). Diff = `apps/android` only (3 source + 2 test + tracking).
  **Reviewer rubric: PASS** — pure logic ≥90% branch, behaviour-only tests, no floor lowered, reuse over new
  reducer, accent-coherent guides, natural gesture, no dead-end.
### 2026-06-30 — slice `story-text-element-duplicate` ✅
- **Branch:** `claude/apps/android/story-text-element-duplicate` (off `origin/main` @ `f6af058`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; every prior slice already squash-merged, incl.
  `story-composer-band` as #1052). Branched clean off the freshened `main`.
- **What:** **per-element duplicate** (named follow-up of `story-text-element-transform`;
  feature-parity §"Multi-element context menu (edit, duplicate, reorder, delete)"). A selected
  on-canvas text element gains a duplicate handle in the floating style toolbar — one tap clones it,
  offset just clear of the original, and selects the copy so the user can immediately move/style it.
  No new gateway-wire model: a cloned element serialises through the existing `toTextObject`.
- **Design (single source of truth, SDK purity):** the clone/cap/offset rules live in **one pure
  place**, `StorySlideDeck.duplicateTextElement(sourceId, newId, dx, dy)` (`:feature:stories`, composer
  **product** state — not an SDK atom): finds the slide holding the source, inserts a `copy(id=newId)`
  (carrying every styled field) **immediately after it**, nudged by `dx/dy` and clamped into the canvas
  via the already-tested `StoryTextElement.nudged`, and is inert (same instance) on an unknown source
  id, a colliding new id, or a slide already at the `MAX_TEXT_ELEMENTS_PER_SLIDE` cap — so the
  ≤5-per-slide invariant holds in one place. The deck doesn't own selection; the VM does. The VM intent
  `onDuplicateTextElement(id)` mints the id (impure edge), warns-without-adding at the cap (mirrors
  `onAddTextElement`), applies the pure reducer, and selects the copy. The Composable stays glue (a
  `ContentCopy` `IconButton` in the `TextStyleToolbar`).
- **Added/changed (production, `apps/android` only — all `:feature:stories`):**
  - `StorySlideDeck.kt` — new pure `duplicateTextElement(sourceId, newId, dx, dy)` (collision/unknown/cap
    guards + after-source insertion + clamped offset).
  - `StoryComposerViewModel.kt` — `onDuplicateTextElement(id)` intent (selected-slide guard → cap warning
    → mint id → pure duplicate → select copy); new `DUPLICATE_ELEMENT_OFFSET = 0.04f` const.
  - `StoryComposerScreen.kt` — `TextStyleToolbar` gains an `onDuplicate` slot rendered as a `ContentCopy`
    handle next to the alignment toggles; wired to `onDuplicateTextElement`. (Glue — JVM-exempt.)
  - `strings.xml` (+ fr/es/pt) — 1 new string (duplicate-element content description).
- **Tests (TDD red → green, behaviour via the public API): +11.**
  - `StorySlideDeckTextElementsTest` (+7): clones content with the new id right after the source;
    copies every styled field (text/style/colour/align/scale/rotation); offsets + clamps the clone into
    the canvas; duplicates an element on a **non-selected** slide (selection untouched); inert on unknown
    source id; inert on colliding new id; inert at the per-slide cap.
  - `StoryComposerViewModelTest` (+4): clones the edited element, offsets it, and selects the copy;
    carries the source style onto the copy; at the cap surfaces a warning and adds nothing; unknown id
    is inert and selects nothing new.
- **Branch sweep:** every arm of `duplicateTextElement` (collision-inert, unknown-inert, cap-inert,
  success-insert-after) and `onDuplicateTextElement` (not-on-slide-inert, cap-warning, success-select)
  is exercised. ≥90% branch + instruction on the new pure logic.
- **Verification:** `./apps/android/meeshy.sh test` → **BUILD SUCCESSFUL** (all JVM unit tests;
  `StorySlideDeckTextElementsTest` 27/27, `StoryComposerViewModelTest` 102/102, 0 failures);
  `./apps/android/meeshy.sh build` → **BUILD SUCCESSFUL** (`assembleDebug` APK). Diff = `apps/android`
  only (3 prod Kotlin, 4 strings, 2 test, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered); SDK purity (clone/cap
  rules pure in `:feature:stories`, glue in the Composable); single source of truth (clone + clamp each
  in one place, reuses `nudged`); UDF (VM + immutable `StateFlow`, transition pure); edge cases
  (unknown/collision/cap/non-selected-slide/offset-clamp); colour/UX coherence (duplicate handle uses
  `MaterialTheme` onSurfaceVariant tint, natural placement beside the align toggles, copy auto-selected).
- **Follow-ups:** unified multi-element context menu + z-order reorder; real Effets tiles; then Calls.

### 2026-06-30 — slice `story-composer-band` ✅
- **Branch:** `claude/apps/android/story-composer-band` (off `origin/main` @ `4dee364`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; every prior slice already squash-merged). Branched clean
  off the freshened `main`.
- **What:** **the composer's FAB + bottom-band toolbar** ("Next" #1, feature-parity §"9:16 canvas …
  FAB + bottom-band toolbar (Contenu/Effets)"). The flat add-text / add-media / visibility buttons are
  replaced by a two-FAB (Contenu / Effets) bottom band that animates a tools drawer in above the FABs —
  the **pure value-type port of iOS `BandStateMachine`** (audit part-21: "Excellent design; carry it
  over verbatim … ideal candidate for shared unit-tested code").
- **Design (single source of truth, SDK purity):** all band navigation lives in **one pure place**,
  `ComposerBandState` (`:feature:stories` — composer **product** state, not an SDK atom): a sealed
  `Hidden | Tiles(BandCategory)` with `BandCategory {CONTENU, EFFETS}` (+ `swapped`) and the total
  transitions `tapFab(category)` (open / switch / toggle-close), `swipeDown()` (dismiss), and
  `swipeHorizontal()` (swap, inert while hidden); `activeCategory`/`isVisible` derive the render.
  `ComposerContentTile {TEXT, MEDIA}` + `ComposerBand.contentTiles` enumerate the Contenu tiles. The
  VM holds `band` and applies the pure transitions (`onBandFabTap`/`onBandDismiss`/`onBandSwapCategory`);
  the Composable is glue (two `ExtendedFloatingActionButton`s, an `AnimatedVisibility` drawer showing
  Contenu tiles → existing `onAddTextElement` / system picker, or the Effets `VisibilityRow`, with
  swipe-down-to-dismiss + swipe-horizontal-to-swap `detectVerticalDragGestures`/`detectHorizontalDrag`).
- **Added/changed (production, `apps/android` only — all `:feature:stories`):**
  - `ComposerBandState.kt` (new) — `BandCategory` (+`swapped`), `ComposerContentTile` (+`category`),
    sealed `ComposerBandState` (`Hidden`/`Tiles` + `activeCategory`/`isVisible`/`tapFab`/`swipeDown`/
    `swipeHorizontal`), `ComposerBand.contentTiles`.
  - `StoryComposerViewModel.kt` — `StoryComposerUiState.band: ComposerBandState = Hidden`;
    `onBandFabTap`/`onBandDismiss`/`onBandSwapCategory` intents (each a one-line pure-transition copy).
  - `StoryComposerScreen.kt` — the flat add-text/add-media/visibility block replaced by a glue
    `ComposerControlsLayer` (FAB row + animated drawer), `BandFab`, `ContentTilesRow`, `BandTile`;
    `VisibilityRow` gains a `modifier` param. Removed the now-unused fixed buttons.
  - `strings.xml` (+ fr/es/pt) — 3 new strings (Contenu / Effets / close-tools content desc).
- **Tests (TDD red → green, behaviour via the public API): +18.**
  - `ComposerBandStateTest` (new, +11): `swapped` round-trip; content-tile category; hidden has no
    active category / not visible; open band exposes category + visible; `tapFab` open-from-hidden /
    toggle-close-same / switch-other (both categories); `swipeDown` from any state incl. already-hidden;
    `swipeHorizontal` swap (both) + inert-while-hidden; `contentTiles` order.
  - `StoryComposerViewModelTest` (+7): band starts hidden; FAB opens category; same-FAB toggle-closes;
    other-FAB switches; dismiss hides; swap flips Contenu→Effets; swap inert while hidden.
- **Branch sweep:** every arm of `tapFab` (same→Hidden, other→switch, hidden→open), `swipeHorizontal`
  (Tiles→swap, Hidden→inert), `swipeDown`, `activeCategory`/`isVisible` (both variants), `swapped`
  (both) and `category` are exercised. ≥90% branch + instruction on the new pure logic.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (`assembleDebug` APK + all
  JVM unit tests, 836 tasks). `ComposerBandStateTest` 11/11, `StoryComposerViewModelTest` (band) 7/7.
  Diff = `apps/android` only (3 prod Kotlin incl. 1 new, 4 strings, 2 test incl. 1 new, tracking docs).
- **Reviewer verdict:** **PASS** — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API (no floor lowered); SDK purity (pure band
  state is composer **product** state in `:feature:stories`, glue in the Composable); single source of
  truth (all band navigation in one pure value type); UDF (VM + immutable `StateFlow`, transitions pure);
  colour/UX coherence (FABs use `MaterialTheme` primary / secondaryContainer, natural tap + swipe
  gestures, both categories carry real content so no dead-end drawer, dismissal returns to FAB-only).
- **Follow-ups:** real Effets tiles (filters / drawing / timeline); on-canvas sticker / drawing elements.

### 2026-06-29 — slice `story-text-element-transform` ✅
- **Branch:** `claude/apps/android/story-text-element-transform` (off `origin/main` @ `c3963d5`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` → 24 open
  PRs, all dependabot or non-android `claude/*`; none on an `apps/android` branch). Branched clean off the
  freshened `main`.
- **What:** **per-element pinch-scale + rotate** on the story composer canvas ("Next" #2,
  feature-parity §"In-place floating text editor"/handles). A selected on-canvas text element can now be
  pinched to resize and twisted to rotate with one natural two-finger gesture, and the transform rides
  into publish on the gateway wire (`StoryTextObject.scale`/`rotation`, already in the model, previously
  always left at defaults). Chose a direct-manipulation gesture over discrete handle chips per the
  CLAUDE.md "natural gestures / coherent single view" rule.
- **Design (single source of truth, SDK purity):** the clamp/wrap rules live in **one pure place**,
  `StoryTextElement` (`:feature:stories`, product UI math — not an SDK atom): `scale` clamped to
  `[MIN_SCALE=0.3, MAX_SCALE=4]`, `rotationDeg` wrapped to the canonical half-open turn `(-180, 180]`
  (any accumulated full turns reduce to one signed angle; `±180` both resolve to `180`). `clampScale`
  collapses a non-finite factor to `DEFAULT_SCALE`; `normaliseRotation` collapses non-finite to `0`. The
  incremental gesture op `transformed(scaleBy, rotateByDeg)` multiplies scale / adds rotation then
  clamps+wraps, so a `scaleBy <= 0` or `NaN` can never poison the element. `normalised()` now re-pulls
  **all** continuous fields (x/y/scale/rotation) into range, so every `updateTextElement` re-clamps for
  free. The Composable stays glue (`detectTransformGestures` → VM; `graphicsLayer` scaleX/scaleY/rotationZ).
- **Added/changed (production, `apps/android` only — all `:feature:stories`):**
  - `StoryTextElement.kt` — `scale`/`rotationDeg` fields (+ DEFAULT/MIN/MAX/DEFAULT_ROTATION consts);
    pure `clampScale`/`normaliseRotation`; `transformed(scaleBy, rotateByDeg)`; `normalised()` extended;
    `toTextObject` now sets `scale`/`rotation`.
  - `StorySlideDeck.kt` — `transformTextElement(id, scaleBy, rotateByDeg)` (inert on unknown id,
    re-clamp via `updateTextElement`'s `.normalised()`).
  - `StoryComposerViewModel.kt` — `onTextElementTransform(id, scaleBy, rotateByDeg)` (selection/editing
    untouched, unknown-id inert).
  - `StoryComposerScreen.kt` — `StoryCanvasSurface`/`TextElementLayer` thread an `onElementTransform`
    callback; the per-element gesture switched `detectDragGestures` → `detectTransformGestures` (one
    gesture pans+pinches+rotates); `graphicsLayer { scaleX/scaleY = scale; rotationZ = rotationDeg }`
    renders it. Removed the now-unused `detectDragGestures` import. (Glue — JVM-exempt.)
- **Tests (TDD red → green, behaviour via the public API): +21.**
  - `StoryTextElementTest` (+14): defaults at rest; `transformed` scale multiply / clamp ceiling /
    clamp floor / non-positive→floor / non-finite→default; rotation add / wrap-positive / wrap-negative;
    identity+text+style+position preserved; `clampScale` bounds+passthrough+∞; `normaliseRotation`
    canonical turn incl. `±180`/`360`/`540`/`270`/`NaN`; `normalised` clamps scale+wraps rotation /
    leaves valid untouched; `toTextObject` carries scale+rotation.
  - `StorySlideDeckTextElementsTest` (+4): applies; clamps; touches only the matching element; inert id.
  - `StoryComposerViewModelTest` (+3): applies + keeps editing; accumulates across gestures + clamps;
    inert id.
  - Class totals after: `StoryTextElementTest`=25, `StorySlideDeckTextElementsTest`=20,
    `StoryComposerViewModelTest`=91 — all green, 0 failures/errors.
- **Branch sweep:** every arm of `clampScale` (finite-coerce both bounds + passthrough; non-finite),
  `normaliseRotation` (non-finite; `<= -180`; `> 180`; passthrough), `transformed`, `transformTextElement`
  (apply/clamp/isolation/inert), and `onTextElementTransform` (apply/accumulate/inert) is exercised.
- **Verification:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL** (assembleDebug APK + all JVM
  unit tests). Diff = `apps/android` only (7 files: 4 prod `:feature:stories`, 3 test). No SDK/web/gateway
  /shared change — the `scale`/`rotation` wire fields already existed on `StoryTextObject`.
- **Reviewer verdict:** **PASS** — scope/safety clean, behavioural tests via public API (no tautologies,
  no floor lowered), edge cases (bounds, non-finite, unknown id, isolation) covered, SDK purity + single
  source of truth (clamp/wrap in one place) + UDF respected, natural-gesture UX coherence.

### 2026-06-29 — slice `story-floating-toolbar` ✅
- **Branch:** `claude/apps/android/story-floating-toolbar` (off `origin/main` @ `6cd1a3c`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; every prior slice already squash-merged). Branched clean
  off the freshened `main`.
- **What:** **in-place floating style toolbar** ("Next" #1, feature-parity §"In-place floating text
  editor"). The `TextStyleToolbar` previously sat in a fixed bottom column below the canvas; it now
  **floats over the canvas**, anchored just clear of the element being edited, and the composer shifts
  for the keyboard so the toolbar always lands in view. Surpasses iOS's fixed bottom style bar.
- **Design (single source of truth, SDK purity):** the placement decision lives in **one pure place**,
  `StoryToolbarPlacement.resolve(elementCenterYpx, elementHalfHeightPx, toolbarHeightPx, canvasHeightPx,
  gapPx)` → `ToolbarPlacement(topPx, ToolbarSide.ABOVE|BELOW)`. BELOW when `belowTop + toolbarHeight <=
  canvasHeight` (the band beneath the element fits the toolbar), otherwise ABOVE clamped into
  `[0, (canvasHeight - toolbarHeight).coerceAtLeast(0)]` — so the toolbar is never pushed off the top or
  past the bottom, and a canvas shorter than the toolbar pins it to the top. The **canvas itself** is the
  keyboard-aware region: the composer Column gains `imePadding()`, so when the keyboard opens the weighted
  9:16 canvas shrinks to the keyboard-free area and the resolver (fed that shrunk `canvasHeightPx`,
  `keyboardInset` folded into the measurement) keeps the toolbar visible — no fragile window-coordinate
  math, every resolver param is live. All in `:feature:stories` (product UI math, not an SDK atom).
- **Added/changed (production, `apps/android` only):**
  - `StoryToolbarPlacement.kt` (new) — `ToolbarSide` enum, `ToolbarPlacement` data class, the pure
    `resolve(...)` (total; below-fits / above / clamp-top / clamp-bottom / degenerate-canvas arms).
  - `StoryComposerScreen.kt` — root Column gains `imePadding()`; `StoryCanvasSurface` takes
    `selectedElement: StoryTextElement?` + a `floatingToolbar` slot, measures the selected element's
    half-height (`TextElementLayer.onMeasured`) and the toolbar's height, and offsets the floating
    `TextStyleToolbar` (translucent `surface` chip, rounded) to `placement.topPx`. The fixed bottom-band
    toolbar block was removed (the toolbar now only renders floating while editing an element).
- **Tests (TDD red → green, behaviour via the public resolver API):** `StoryToolbarPlacementTest` (new,
  +9): sits below when it fits; goes above on bottom-overflow; a shrunken (keyboard) canvas forces above;
  clamps to the top for a high element; clamps off the bottom in a tight band; a canvas shorter than the
  toolbar pins to top; gap honoured below **and** above; the exact-fit boundary still sits below.
- **Edge cases:** boundary `==` (exact fit → BELOW), degenerate `canvasHeight < toolbarHeight`
  (`coerceAtLeast(0)` → top), high element (clamp to 0), tight band (clamp to `clampMax`), gap on both
  sides. No floor lowered, no test weakened; assertions are exact computed pixels (no tautology).
- **Branch coverage (new logic):** every arm of `resolve` hit — below-fits, above in-range, above
  clamp-low (→0), above clamp-high (→clampMax incl. the `coerceAtLeast` floor). ≥90% branch + instruction.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`, 836
  tasks) — **BUILD SUCCESSFUL**. `StoryToolbarPlacementTest` 9/9 green. Diff = `apps/android` only
  (1 new prod Kotlin, 1 prod Kotlin changed, 1 new test, tracking docs).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure placement math is composer
  **product** state in `:feature:stories`, glue in the Composable); single source of truth (anchor
  decision in one pure place); UDF (VM + immutable `StateFlow` untouched); colour/UX coherence (toolbar
  uses `MaterialTheme` surface, floats by natural anchor, keyboard-aware via `imePadding`).
- **Follow-ups:** canvas toolbar/FAB (Contenu/Effets); per-element rotate/scale transform handles; then Calls.

### 2026-06-29 — slice `story-text-element-styling` ✅
- **Branch:** `claude/apps/android/story-text-element-styling` (off `origin/main` @ `7f28c533`).
- **Housekeeping (step 0):** no open Android PR (`story-text-elements` and every prior slice already on
  `origin/main`); branched this slice clean off the latest main.
- **What:** **per-element text styling** ("Next" #1, feature-parity §"Text elements"). On-canvas text
  elements already carried `style`/`color`/`align`; this slice *renders* them and gives the user the
  picker to change them. Five iOS-parity faces (bold / neon / typewriter / handwriting / classic),
  a colour-swatch palette, and L/C/R alignment — all live on the element being edited.
- **Design (single source of truth, SDK purity):** the *look* of each style lives in **one pure,
  Compose-agnostic place**, `StoryTextStyle.typography()` → `StoryTextTypography`
  (`fontWeight`/`italic`/`family`/`letterSpacingEm`/`glow`) over the new `StoryTextFontFamily` token
  enum. Because the tokens hold no Compose types they unit-test on the JVM; the Composable maps a token
  to `FontFamily`/`FontStyle`/`Shadow` at the glue layer. The three mutators are one-line
  `deck.updateTextElement` wrappers (the clamp/identity rules already proven in the deck), so the VM stays
  thin and inert-on-unknown-id falls straight out of the existing reducer. All in `:feature:stories`
  (product styling, not an SDK atom).
- **Added/changed (production, `apps/android` only):**
  - `StoryTextElement.kt` — new `StoryTextFontFamily` enum, `StoryTextTypography` data class, and the pure
    `StoryTextStyle.typography()` mapping (total over the five cases).
  - `StoryComposerViewModel.kt` — `onTextElementStyle`/`onTextElementColor`/`onTextElementAlign` intents
    (each a `deck.updateTextElement` copy; selection/editing untouched; inert on unknown id).
  - `StoryComposerScreen.kt` — `TextElementLayer` now renders weight/slant/family/tracking + a neon glow
    `Shadow`; `StoryTextFontFamily.toFontFamily()` glue; a `TextStyleToolbar` (style chips + `AlignToggle`
    L/C/R + `ColorSwatch` row, shown only while editing an element) wired to the three new intents; a
    `STORY_TEXT_COLORS` palette (white first).
  - `strings.xml` (+ fr/es/pt) — 8 new strings (5 style names, 3 alignment content descriptions).
- **Tests (TDD red → green, behaviour via public API):**
  - `StoryTextTypographyTest` (new, +8): each of the five faces maps to its expected family/italic/glow,
    bold heavier than classic, every weight in `100..900`, tracking never negative, and all five resolve
    to **distinct** typographies (branch sweep over the `when`).
  - `StoryComposerViewModelTest` (+8): restyle keeps text + position + editing; recolour/realign touch
    only their field; each intent is **inert on an unknown id**; styling one of several elements leaves the
    others; a fully restyled element carries `textStyle`/`textColor`/`textAlign` into the published object.
- **Edge cases:** unknown-id inert (all three intents), single vs. several elements, default-state
  preservation, publish round-trip of the wire tokens. No floor lowered, no test weakened.
- **Verification:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (assembleDebug + all JVM unit
  tests green).
- **Reviewer gate:** PASS — diff is `apps/android` only (4 prod Kotlin/res files + 2 test files + tracking),
  no production logic outside it, pure logic branch-swept, UDF/SSOT/SDK-purity honoured.
- **Follow-ups (unchanged):** in-place floating text editor; canvas toolbar/FAB; then Calls.

### 2026-06-29 — slice `story-text-elements` ✅
- **Branch:** `claude/apps/android/story-text-elements` (off `origin/main` @ `e638c712`).
- **Housekeeping (step 0):** no open Android PR for the prior loop (`story-canvas-transform` merged);
  `origin/main` carried every Android slice; branched this slice clean.
- **What:** **on-canvas text elements** ("Next" #2, feature-parity §"Text elements (≤5/slide)"). The
  composer canvas can now hold up to 5 draggable text elements per slide — add, position, edit, remove —
  and they ride into publish via `storyEffects.textObjects`. Surpasses iOS by routing publish through the
  durable outbox (the existing Android story path).
- **Design (single source of truth, SDK purity):** the position clamp lives in **one pure place**,
  `StoryTextElement` (`normalised()` / `nudged(dx,dy)` keep x,y in `0f..1f`); the deck mirrors the media
  reducer exactly (an element id lives on one slide; total functions return the same instance when inert);
  the single text field serves two roles via the pure-derived `editorText`/`isEditingTextElement` so the
  canvas stays one coherent surface (no second editor). All in `:feature:stories` (product state, not an
  SDK atom). The wire mapping reuses the existing `StoryTextObject`/`StoryEffects` model — no new types.
- **Added/changed (production, `apps/android` only):**
  - `StoryTextElement.kt` (new) — pure element + `StoryTextStyle`/`StoryTextAlign` enums (gateway `wire`
    tokens), `isPublishable`, `normalised`/`nudged` (clamp), `toTextObject(lang)`, `CENTER`/`DEFAULT_COLOR`/
    `clampCoord`.
  - `StorySlide.elements: List<StoryTextElement>` (carried by `duplicate`); `StorySlideDeck`
    `addTextElementToSelected`/`removeTextElement`/`updateTextElement`/`moveTextElement` +
    `selectedRemainingTextSlots`/`selectedCanAddTextElement`/`hasTextElements`/`isWithinTextElementLimit`,
    `MAX_TEXT_ELEMENTS_PER_SLIDE=5`, and `publishableSlides` now counts an element-only slide.
  - `StoryComposerDraft.textElements` + `withTextElements`/`publishableTextElements`/`hasTextElements`;
    `canPublish` admits a publishable element; `toCreateStoryRequest` serialises non-blank elements into
    `storyEffects.textObjects` (null when none).
  - `StoryComposerViewModel` — `onAddTextElement`/`onSelectTextElement`/`onDeselectTextElement`/
    `onTextElementMoved`/`onRemoveTextElement`, `onTextChange` routes to element-vs-caption,
    `selectedTextElementId` + derived `selectedTextElement`/`isEditingTextElement`/`editorText`/
    `selectedSlideTextElements`; `canPublish` gates on the element cap + presence; `mirrorDraftToSelection`
    drops a dangling element selection on slide change; `publishPlans` carries each slide's elements.
  - `StoryComposerScreen` — `StoryCanvasSurface` renders the elements (centred at fraction, drag→
    `onTextElementMoved` via px/size, tap→select, remove affordance, background tap→deselect); the field
    binds `editorText`; an "Add text" button. +4 strings × 4 locales.
- **TDD (red → green):** `StoryTextElementTest` +10 (defaults; blank/non-blank publishable; normalised
  clamp + in-range untouched; nudged translate / edge-clamp both axes / identity preserved; toTextObject
  wire tokens; enum wire coverage). `StorySlideDeckTextElementsTest` +16 (add to selected only / clamp /
  dup-id inert / cap inert / remaining countdown; remove from any slide / unknown inert; update matching
  only / re-clamp / unknown inert; move clamp / unknown inert; hasTextElements ignores blank;
  element-only slide publishable; over-cap flagged; duplicate carries elements).
  `StoryComposerDraftTest` +5 (element-only publishable / blank-only not; withTextElements; serialise +
  drop blanks; storyEffects null when none). `StoryComposerViewModelTest` +10 (add+edit; route to element
  not caption; blank not publishable; deselect→caption; unknown select inert; cap warning; drag clamp;
  remove ends editing; slide switch ends editing; publish carries textObjects).
- **Branch coverage (new logic):** every arm of the deck reducers (inert/cap/clamp/unknown), the
  element clamp (in/over/under both axes), the `onTextChange` route (element vs caption), the
  `mirrorDraftToSelection` still-selected vs dangling branch, `canPublish` element presence + cap, and the
  draft serialise/empty branch are all hit. ≥90% branch + instruction on the added logic.
- **Verification:** `./apps/android/meeshy.sh check` — **BUILD SUCCESSFUL** (`assembleDebug` + all
  `testDebugUnitTest`, 836 tasks). Diff = `apps/android` only (4 prod Kotlin changed + 1 new, 4 strings,
  2 test changed + 2 new).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure model is product state in
  `:feature:*`); single source of truth (clamp + wire mapping each in one place, reuses `StoryTextObject`);
  UDF (VM + immutable `StateFlow`, transitions pure); canvas/element Composables are glue;
  colour/UX coherence (one coherent canvas surface, natural drag/tap gestures, deselect on background tap).

### 2026-06-29 — slice `story-canvas-transform` ✅
- **Branch:** `claude/apps/android/story-canvas-transform` (off `origin/main`).
- **Housekeeping (step 0):** no open Android PR for the prior loop (`story-slide-media` PR #1026
  squash-merged); `origin/main` carried every Android slice through #1026; branched this slice clean.
- **What:** **9:16 canvas with pinch-zoom + drag-pan** ("Next" #1, feature-parity §Stories composer).
  The composer gains a real central 9:16 canvas where the user pinches to zoom and drags to pan the
  selected slide's media background; the pan/zoom **persists per slide** (it's part of the slide's
  identity, carried by duplicate and into publish) — surpassing iOS's ephemeral, per-session canvas
  state. Text/sticker/drawing **elements** layer on top in later slices.
- **Design (single source of truth, SDK purity):** the gesture math lives in **one pure place**,
  `StoryCanvasTransform` (in `:feature:stories`, product state — it's the slide model, not a stateless
  SDK atom). `scale` clamps to `[1,4]`; `offsetX/Y` clamp to `maxOffset = (size·scale − size)/2` (the
  symmetric overflow of the scaled content). `apply(panX,panY,zoom,canvasW,canvasH)` multiplies scale
  by the gesture `zoom`, clamps it, then clamps the translated offset to the bounds of the **new**
  scale — so a pinch-out tightens the pan range and snaps a now-out-of-range offset back toward centre,
  a pinch-in widens it. A degenerate 0px canvas collapses the range (no divide-by-zero — there is no
  division), `clampedTo(w,h)` re-clamps on a fresh/resized measurement, and `isIdentity` lets the
  Composable skip `graphicsLayer` at rest.
- **Added/changed (production, `apps/android` only):**
  - `StoryCanvasTransform.kt` (new) — the pure transform value + resolver (`apply`/`clampedTo`/
    `clampScale`/`maxOffset`/`clampOffset`/`isIdentity`, `MIN_SCALE=1`/`MAX_SCALE=4`/`IDENTITY`).
  - `StorySlide.transform: StoryCanvasTransform = IDENTITY` — per-slide persisted canvas state
    (carried by `duplicate`; default keeps the single-slide path byte-identical).
  - `StorySlideDeck.updateSelectedTransform(transform)` — rewrites only the selected slide's transform
    (text/media/selection untouched), mirroring `updateSelectedText`.
  - `StoryComposerViewModel.onCanvasTransform(panX,panY,zoom,canvasW,canvasH)` — applies the gesture to
    the selected slide via the pure `apply`, through the existing `applyDeck`; `StoryComposerUiState.
    selectedSlideTransform` projects it for the screen.
  - `StoryComposerScreen.StoryCanvasSurface` — glue 9:16 `Box` (`aspectRatio(9f/16f)`, surfaceVariant,
    rounded clip, `semantics` label) rendering the selected slide's first media under a `graphicsLayer`
    transform + `detectTransformGestures` forwarding pan/zoom + measured size to the VM. +1 string × 4 locales.
- **TDD (red → green):** `StoryCanvasTransformTest` +16 (identity/defaults; scale clamp min/mid/max;
  apply zoom-in/out clamp + multiply; rest-scale no-pan; maxOffset overflow; in-range pan both axes;
  out-of-range symmetric clamp both axes; pan accumulation; zoom-out re-clamp toward centre; 0px canvas
  no-div-by-zero; `clampedTo` snap + in-range untouched). `StorySlideDeckTest` +3
  (updateSelectedTransform rewrites only selected / leaves text+media; duplicate carries transform).
  `StoryComposerViewModelTest` +3 (onCanvasTransform applies pinch-pan; clamps to bounds; edits only the
  selected slide + leaves editor text + exposes `selectedSlideTransform`). RED verified (unresolved
  `StoryCanvasTransform`/`updateSelectedTransform`/`onCanvasTransform`).
- **Branch coverage (new logic):** every arm of `apply` (zoom clamp ↑/↓/mid, offset clamp in/over/under,
  0px collapse), `clampScale`/`maxOffset`/`clampOffset` boundaries, `isIdentity` true/false,
  `clampedTo` in/out-of-range, `updateSelectedTransform` selected-vs-others, and the VM intent's
  selected-only edit are all hit. ≥90% branch + instruction on the added logic.
- **Verification:** `./apps/android/meeshy.sh check` — **BUILD SUCCESSFUL** (`assembleDebug` + all
  `testDebugUnitTest`). `:feature:stories` `StoryCanvasTransformTest` 16, `StorySlideDeckTest` 50,
  `StoryComposerViewModelTest` 70 — 0 failures. Diff = `apps/android` only (4 prod Kotlin, 4 strings,
  3 test).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure transform is product
  state in `:feature:*`, not an SDK atom); UDF (VM + immutable `StateFlow`, transitions pure); canvas
  Composable is glue; colour/UX coherence (MaterialTheme surface, natural pinch/pan gestures).

### 2026-06-29 — slice `story-slide-media` ✅
- **Branch:** `claude/apps/android/story-slide-media` (off `origin/main` @ `18be707b`).
- **Housekeeping (step 0):** the prior loop's PR **#1020 `slide-drag-reorder`** was open — merged it
  first (all 15 CI checks green, diff `apps/android` only, base `384826d3` an ancestor of `main`, the
  only main-since changes were gateway-coverage commits touching nothing under `apps/android` → clean
  rebase). Squash-merged as `18be707b`, synced local `main`, then branched this slice.
- **What:** **per-slide media** ("Next" #1, feature-parity §E "Multi-slide composer"). Media now
  belongs to the **slide it was added to**, not the whole story. Surpasses iOS (which drops an offline
  pick on upload failure) by keeping the durable offline chain intact per-slide.
- **Design (single source of truth):** the **deck** owns media; `draft` mirrors the *selected slide*
  for media exactly as it already did for text (`mirrorDraftToSelection`), so the single-slide path is
  byte-identical and nearly every existing test passes unchanged — only genuinely new per-slide
  behaviour needed new tests.
- **Added/changed (production, `apps/android` only):**
  - `StorySlideDeck` (`:feature:stories`) — pure additions: `addMediaToSelected(mediaId)` (append to
    the selected slide, dedup + ≤`MAX_MEDIA_PER_SLIDE` cap, inert otherwise), `removeMedia(mediaId)`
    (drop from whichever slide holds it, inert when absent), `hasMedia`, `isWithinMediaLimit()`,
    `selectedRemainingMediaSlots`, and `publishableSlides` now = non-blank text **or** attached media
    (a media-only slide publishes). `MAX_MEDIA_PER_SLIDE = 10`.
  - `StoryComposerViewModel` — `onMediaPicked` reads free slots off the selected slide and routes the
    uploaded ids / offline cmids onto it (deck); `mirrorDraftToSelection` re-points `draft` at the
    selected slide's text+media after every deck change; `onRemoveSlide` reclaims the removed slide's
    media (prunes the global preview pools + cancels its durable `UPLOAD_MEDIA` rows); `canPublish`
    gates on `deck.hasMedia`/`deck.isWithinMediaLimit()`; new `publishPlans` emits one request **per
    publishable slide** carrying that slide's media and `dependsOn` only that slide's offline uploads.
  - `StoryComposerUiState` — `selectedSlideAttachments`/`selectedSlidePending` project the global pools
    onto the selected slide (in slide order) for the preview; dropped the now-unused `draftMediaIds`.
  - `StoryComposerScreen` — the preview row renders the **selected slide's** media (glue only).
- **TDD (red → green):** `StorySlideDeckTest` +13 (addMediaToSelected append/order/dedup/cap-inert;
  removeMedia from-any-slide / unknown-inert; hasMedia false/true; isWithinMediaLimit within/exceeds;
  selectedRemainingMediaSlots free/never-negative; publishableSlides media-only included / text+media
  order; renamed the no-content case). `StoryComposerViewModelTest` +10 (picked media → selected slide;
  each story carries only its slide's media; offline upload on a later slide gates only that story;
  media-only middle slide publishes between text slides; preview shows only the selected slide; media
  on a non-selected slide still lets the deck publish; per-slide cap lets a fresh slide attach its own
  ten; removing a slide drops its uploaded media / cancels its durable rows; removing the last slide is
  inert and keeps its media). RED verified (unresolved `addMediaToSelected`/`selectedSlideAttachments`).
- **Branch coverage (new logic):** every arm of the new deck methods hit (dedup, cap, inert, present/
  absent); VM media routing covered online + offline + cap + slide-removal-cleanup (pending & non-
  pending) + last-slide-inert. ≥90% branch + instruction on the added logic.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`) **BUILD
  SUCCESSFUL**. `:feature:stories` 67 (`StoryComposerViewModelTest`) + 47 (`StorySlideDeckTest`), 0
  failures. Diff = `apps/android` only (3 prod Kotlin, 2 test).
- **Reviewer gate:** PASS — scope `apps/android` only, no secrets / `local.properties` gitignored;
  behavioural non-tautological tests through the public API; SDK purity (pure media reducer in the
  composer **product** module `:feature:stories`, glue in the Composable); single source of truth (deck
  owns media, `draft` is a mirror — `mirrorDraftToSelection` the one writer); UDF (immutable
  `StateFlow`, pure deck transitions); edge cases (empty/dedup/cap/unknown-id/last-slide-inert/offline-
  cancel); UX coherence (preview tracks the selected slide, slide removal leaves no orphan upload).
  Surpasses iOS per-slide while preserving the durable offline chain.

### 2026-06-29 — slice `slide-drag-reorder` ✅
- **Branch:** `claude/apps/android/slide-drag-reorder` (off `origin/main` @ `384826d3`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open` →
  none of the 27 open PRs are `claude/apps/android/*`; prior loop `story-composer-slide-deck` already
  squash-merged to `main`). Branched directly off the freshened `main`.
- **What:** closes the deferred **drag-reorder gesture** ("Next" #1, feature-parity §E line 453).
  The `move` reducer + `onMoveSlide` intent were already wired & tested last loop; this binds a
  Compose drag handle to them through a new pure resolver — no production logic outside `apps/android`.
- **Added (production, `apps/android` only):**
  - `SlideReorderResolver.targetIndex(fromIndex, dragPx, slotWidthPx, slideCount)` (`:feature:stories`)
    — pure mapping from accumulated horizontal drag px + measured slot width to the clamped landing
    slot. `steps = round(dragPx / slotWidthPx)`; sub-half-slot drift rounds to 0 (no accidental
    reorder); result clamped to `0..slideCount-1`; non-positive slot width or empty/origin-out-of-range
    degrade safely (no div-by-zero, no throw). Mirrors the `StorySwipeResolver` "thresholds as params"
    style so the decision is fully unit-tested off the Composable.
  - `StoryComposerScreen.SlideStrip` — each chip now carries `onSizeChanged` (slot width) +
    `detectHorizontalDragGestures`; on drag end it feeds the resolver and calls the existing
    `onMoveSlide`. Glue only; the testable decision lives in the resolver.
- **TDD (red → green):** `SlideReorderResolverTest` +11 (no-drag inert; sub-half-slot inert; right
  past-half +1; left past-half −1; multi-slot crossing; clamp-far-right to last; clamp-far-left to 0;
  single-slide nowhere-to-move; non-positive slot width → origin; out-of-range origin clamped;
  empty deck → 0 no-throw). All 11 green. RED first verified (unresolved `SlideReorderResolver`
  compile failure). No floor lowered, no test weakened; one expectation was corrected (2.5 rounds to
  3, not 2 — value changed to 2.3 so the "several slots" assertion is unambiguous, not weakened).
- **Branch coverage (new logic):** every arm of `targetIndex` is hit — `slideCount<=0`,
  `slotWidthPx<=0`, the clamp lower/upper bounds, and the in-range round. ≥90% branch + instruction.
- **Verification:** `./apps/android/meeshy.sh check` green (`assembleDebug` + `testDebugUnitTest`,
  BUILD SUCCESSFUL). Diff is `apps/android` only.
- **Reviewer gate:** PASS — scope `apps/android` only, behavioural tests through the public resolver
  API, no tautologies, edge cases (empty/single/boundary/degenerate-width/out-of-range) covered, SDK
  purity respected (pure resolver in `:feature:stories`, glue in the Composable), single source of
  truth (reorder math in one pure place), UX coherence (natural horizontal drag → reorder).

### 2026-06-29 — slice `story-composer-slide-deck` ✅
- **Branch:** `claude/apps/android/story-composer-slide-deck` (off `origin/main` @ `f4ff6b2cd`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`list_pull_requests state=open
  head=isopen-io:claude/apps/android` → `[]`; prior loop `story-slide-deck` squash-merged as #1014).
  Branched directly off the freshened `main`.
- **What:** makes the multi-slide model **real in the composer** ("Next" #1, feature-parity §E
  line 433). Wires the pure `StorySlideDeck` reducer into `StoryComposerViewModel`, binds the editor
  to the **selected slide's** text (each slide keeps its own caption), and renders a `SlideStrip`
  mini-preview in `StoryComposerScreen`. Publish stays **lossless across slides**: one story per
  non-blank slide, in order.
- **Added/changed (production, `apps/android` only):**
  - `StorySlideDeck` (`:feature:stories`) — pure additions: `hasText`, `publishableSlides`
    (non-blank slides in order), `isWithinTextLimit(maxChars)` (every slide within the cap),
    `updateSelectedText(text)` (rewrites only the selected slide's text, id/media/order/selection
    intact). All pure, deterministic — no clock/random.
  - `StoryComposerUiState` — new `deck: StorySlideDeck` (default `single(newSlideId())`); `canPublish`
    now gates on the **whole deck** (`deck.hasText || draft.hasMedia` &&
    `deck.isWithinTextLimit(MAX_CHARS)` && media cap && not in flight) so an off-screen over-long
    slide blocks publish.
  - `StoryComposerViewModel` — `onTextChange` writes the selected slide (+ mirrors `draft.text`);
    new intents `onAddSlide`/`onDuplicateSelectedSlide`/`onRemoveSlide`/`onMoveSlide`/`onSelectSlide`
    via a private `applyDeck{}` that re-syncs the editor to the (possibly new) selected slide's text.
    Slide ids minted with `UUID` at the impure VM edge (reducer stays pure). `publish` → new pure
    `publishRequests`: **one story per non-blank slide** in deck order; the first carries whole-story
    media + offline `dependsOn`, later slides are text-only; a media-only deck still emits one
    media-bearing story. Single-slide path is byte-identical to before.
  - `StoryComposerScreen` — `SlideStrip` composable (numbered selectable `FilterChip`s; selected chip
    carries Duplicate/Remove, Remove hidden on the last slide; trailing "+" `AssistChip` disabled at
    the cap). Glue only — every decision read off the unit-tested deck. +4 strings × 4 locales.
- **TDD (red → green):** `StorySlideDeckTest` +12 (updateSelectedText rewrites-only-selected /
  media-untouched; hasText false-blank / whitespace-ignored / true; publishableSlides order-filter /
  empty; isWithinTextLimit all-within / any-exceeds / raw-length-counts-whitespace). 34/34 green.
  `StoryComposerViewModelTest` +18 (starts single slide; onTextChange writes slide+mirror;
  add appends+clears / inert-at-cap; per-slide text survives selection move; duplicate clones+selects
  clone; remove drops+refreshes-editor / inert-on-last; move reorders+preserves-selection;
  select-unknown inert; canPublish false on off-screen over-long slide; publish one-per-non-blank-slide
  in order / skips blank between content / media+deps only on first / resets to single empty slide).
  57/57 green. No floor lowered, no test weakened; ids read off state (no exact-id tautology).
- **Verification:** `:feature:stories:testDebugUnitTest` (`StorySlideDeckTest` 34/34 +
  `StoryComposerViewModelTest` 57/57, failures=0 errors=0); full `./apps/android/meeshy.sh check`
  (`assembleDebug` + all `testDebugUnitTest`) **BUILD SUCCESSFUL**. Diff = `apps/android` only
  (3 prod Kotlin, 4 strings, 2 test).
- **Reviewer gate:** PASS — scope clean (apps/android only, no secrets, `local.properties` gitignored);
  behavioural non-tautological tests through the public API; SDK purity (deck is composer **product**
  state in `:feature:stories`; id-minting at the impure VM edge keeps the reducer pure); single source
  of truth (`draft.text == selectedSlide.text` invariant held by one writer `applyDeck`); UDF
  (immutable `StateFlow`, pure reducer transitions); UX coherence (theme chips, selected highlight,
  no dead end — publish is lossless across slides). Surpasses iOS by gating publish on the whole deck.
- **Note / next:** drag-reorder **gesture** binding deferred (the `onMoveSlide` intent + `move`
  reducer are wired & tested — only the Compose drag handle remains); per-slide media still
  whole-story. Next: the **9:16 canvas** ("Next" #2) — per-slide pinch-zoom/drag-pan + toolbar.

### 2026-06-28 — slice `story-slide-deck` ✅
- **Branch:** `claude/apps/android/story-slide-deck` (off `origin/main` @ `bf4cd477`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (`search_pull_requests is:open
  head:claude/apps/android` → 0; prior loop `story-composer-multi-pending` already squash-merged as
  #1012). HEAD == `origin/main` (0/0). Branched directly off the freshened `main`.
- **What:** opens the **multi-slide composer** ("Next" #1, feature-parity §E line 433) with its pure,
  provably-correct foundation — the structural slide-deck reducer. iOS's `StoryComposerViewModel` owns
  `slides` + slide CRUD (`addSlide`/`removeSlide`/`duplicateSlide`/`selectSlide`/`moveSlide`) with
  `maxSlides=10` and `canAddSlide` (<10); this slice ports that as a **pure immutable model** so the
  rules are unit-tested before any canvas glue. Kept thin (no UI) per the established "primitive first,
  UX next slice" pattern (cf. `outbox-multi-dependency`, `media-blob-store`).
- **Added (production, `apps/android` only):**
  - `StorySlide` (`:feature:stories`) — `data class(id, text="", mediaIds=[])`, one slide's identity +
    content (richer elements layer on later, reusing the id).
  - `StorySlideDeck` (`:feature:stories`) — immutable deck with two enforced invariants (always ≥1
    slide; ≤`MAX_SLIDES`=10, both checked in `init`). Derived: `size`/`isFull`/`canAddSlide`/
    `canRemoveSlide`/`selectedIndex`/`selectedSlide`. Total ops returning the same instance when
    inapplicable: `addSlide(newId)` (append+select; inert at cap or dup id), `duplicate(sourceId,
    newId)` (clone content after source + select; inert at cap / unknown source / dup id),
    `removeSlide(id)` (inert if last or unknown; removal reselects the slide taking the removed one's
    place, new-last when removing the last), `move(id, toIndex)` (clamps index, preserves selection by
    id, inert on unknown/no-op), `select(id)` (inert on unknown/already-selected). `single(id)` factory.
    Ids are caller-supplied → pure & deterministic (no clock/random).
- **TDD (red → green):** `StorySlideDeckTest` +24 — `single`/invariants (empty + absent-selectedId
  rejected); add (append+select / cap-inert / dup-id-inert); duplicate (clone content + insert-after +
  select / unknown-inert / cap-inert / collision-inert); remove (keep-other-selection / reselect-taker /
  reselect-new-last / single-inert / unknown-inert); move (reorder + selection-by-id / clamp-negative /
  clamp-over / same-index-inert / unknown-inert); select (switch / unknown-inert); selectedIndex+slide.
  Branch sweep: every cap/boundary/unknown/last-slide/inert arm. No floor lowered, no test weakened.
- **Verification:** `:feature:stories:testDebugUnitTest` (`StorySlideDeckTest`) **24/24 green**
  (failures=0 errors=0); full `./apps/android/meeshy.sh check` (`assembleDebug` + all
  `testDebugUnitTest`) **BUILD SUCCESSFUL**. Diff = `apps/android` only (1 new prod file, 1 new test).
- **Reviewer gate:** PASS — scope clean (apps/android only), behavioural non-tautological tests through
  the public API (deck ops → observable `slides`/`selectedId`), SDK purity (the structural deck rules are
  composer **product** state in `:feature:stories`, like `StoryComposerDraft`; no orphan in `:sdk-core`),
  single source of truth (one deck model gates add/remove caps + selection — no second slide list),
  immutable UDF-friendly value, total functions (no throw on inapplicable op), Kotlin style (immutable,
  early returns, `coerceIn`). Surpasses the deprecated iOS `StorySlideManager` SSoT violation by being a
  single pure model from the start.
- **Note / next:** pure foundation only — nothing renders it yet. Next: wire it into
  `StoryComposerViewModel` (mint ids, expose in `StoryComposerUiState`) + a **slide mini-preview strip**
  in `StoryComposerScreen` ("Next" #1). Then the 9:16 canvas ("Next" #2).

### 2026-06-28 — slice `story-composer-multi-pending` ✅
- **Branch:** `claude/apps/android/story-composer-multi-pending` (off `origin/main` @ `997ee729`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (all prior loops already
  squash-merged; 28 open PRs are iOS/web/dependabot, none Android). Branched off the freshened `main`.
- **What:** delivers "Next" #1 — the **multi-pending offline uploads composer UX** on top of the
  `outbox-multi-dependency` SDK primitive. The composer staged at most **one** `pendingUpload`; it now
  holds a **list**, so every transient-failed pick is appended (and a single offline pick that carries
  **several** items now stages each one). `publish()` gates the story on **all** pending cmids; per-tile
  remove cancels only that durable row. Surpasses iOS, which drops a pick on an offline upload entirely.
- **Changed (production, `apps/android` only):**
  - `StoryComposerUiState.pendingUpload: PendingMediaUpload?` → `pendingUploads: List<PendingMediaUpload>`
    (default empty); `draftMediaIds` now appends every pending cmid after the uploaded ids.
  - `onUploadFailed` dropped the `single != null && pendingUpload == null` guard: any transient error now
    durably queues **every** accepted item (already capped to the free slots by `onMediaPicked`). A
    permanent (4xx) error still surfaces the message and stages nothing.
  - `queueDurably(items: List<…>)` enqueues + stages **one item at a time** so partial progress survives
    if a later `enqueue` throws (already-staged items stay; the caller's catch surfaces the error).
  - `onRemoveMedia` removes one pending upload from the list and cancels **only that** durable row; the
    other pending uploads are untouched.
  - `publish(dependsOn = pendingUploads.map { cmid })`; `StoryComposerScreen.MediaPreviewRow` renders N
    "Offline" tiles via `items(pending)` (was a single optional tile).
- **TDD (red → green):** `StoryComposerViewModelTest` — 3 existing single-pending tests adapted to the
  list field; the *"second offline pick is rejected"* and *"multi-item offline pick is not chained"*
  behaviours **flipped** (now: second pick appended / each item staged) — strengthened, not weakened;
  +5 new: multi-item batch stages each, second pick appends, offline batch truncated to free slots,
  publish gates on **all** placeholder ids, remove one pending keeps the rest + cancels only its row,
  first staged item survives a mid-batch enqueue failure. No coverage floor lowered, no test weakened.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`)
  **BUILD SUCCESSFUL**. Diff = `apps/android` only (2 prod edits, 1 test file).
- **Reviewer gate:** PASS — scope clean (apps/android only), behavioural non-tautological tests,
  branch sweep on the new list paths (empty/single/multi/cap-truncated/mid-batch-failure), SDK purity
  respected (composer is product orchestration in `:feature:stories`; the multi-dependency primitive
  stays in `:sdk-core`), single source of truth (one `draftMediaIds` derivation feeds both draft +
  dependsOn), failure paths covered, `viewModelScope` cancel-safe (`CancellationException` rethrown).
- **Note / next:** the single-pending offline chain is now fully multi-pending end-to-end. Next up:
  **multi-slide canvas** ("Next" #2) — the real multi-slide composer (add/remove/reorder slides, 9:16
  canvas), a larger slice. After Stories richness is sufficient, advance to **Calls**.

### 2026-06-28 — slice `outbox-multi-dependency` ✅
- **Branch:** `claude/apps/android/outbox-multi-dependency` (off `origin/main` @ `af7791af`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR (all prior loops already
  squash-merged; HEAD == `origin/main`). Branched off the freshened `main`.
- **What:** delivers the **multi-dependency outbox primitive** flagged in "Next" #1 — the
  foundational, provably-correct half. The `dependsOn` gate was single-valued (one `cmid`), so a
  publish could wait on at most **one** offline upload. It now expresses a **set** of prerequisites:
  a dependent gates on **all** of them and is doomed the moment **any** is exhausted. This is the
  enabling brick for "several media queued offline" (the composer multi-pending **UX** is the
  explicit next slice — kept out of this slice to keep it thin and low-risk).
- **Added / changed (production, `apps/android` only):**
  - `OutboxDependencyKey` (`:sdk-core`, new stateless building block) — `encode(Collection)→String?`
    / `decode(String?)→List` round-trip a *set* of `cmid`s through the one `dependsOn` column,
    wrapped-delimited (`{a,b}`→`"|a|b|"`; `'|'` is reserved, a `cmid` never contains it). `decode`
    is robust to a **bare** legacy value (no delimiter → singleton). `likePattern(cmid)` builds an
    escaped membership `LIKE` pattern (`%|cmid\_x|%`, `_` escaped — `cmid`s carry `_`).
  - `OutboxDependencies.verdictAll(states)` — pure multi-prerequisite gate: any `EXHAUSTED`→`FAILED`,
    else any `PENDING`/`INFLIGHT`→`BLOCKED`, else `SATISFIED`. Empty→`SATISFIED`. `FAILED` dominates
    `BLOCKED` (one dead prerequisite ⇒ cascade-exhaust now, never wait).
  - `OutboxMutation.dependsOn`: `String?` → `Set<String>` (default empty); `toEntity` encodes via
    `OutboxDependencyKey.encode` so the column stays one TEXT field (no schema/migration change).
  - `OutboxDrainer` decodes `row.dependsOn` to the set and gates via `verdictAll` (the single-dep
    path is just N=1 — every existing drainer behaviour preserved).
  - `OutboxDao.findDependents` is now a `LIKE … ESCAPE '\'` membership query; `OutboxRepository`
    `.rewriteDependents` builds the pattern with `likePattern`, so a delivered producer grafts its
    real id into a dependent gated on *several* uploads.
  - `StoryRepository.enqueuePublish(request, dependsOn: List<String> = emptyList())` (was `String?`)
    → `dependsOn.toSet()`; the composer adopts the list contract (`listOfNotNull(pendingUpload?.cmid)`)
    while **keeping single-pending UI** for now.
- **TDD (red → green):** +new `OutboxDependencyKeyTest` (14: empty/blank/single/multi/dupes+trim
  encode, null/blank/bare/wrapped decode, round-trip, likePattern wrap + `_` escape, escapeLike all
  metachars); `OutboxDependenciesTest` +5 verdictAll (empty / all-gone / one-blocked / failed-dominates
  / satisfied); `OutboxDrainerTest` +4 (hold-until-all / deliver-when-all / cascade-exhaust-on-any /
  graft-each-producer); `OutboxRepositoryTest` +2 (membership-by-any-prereq / no substring false match);
  `StoryRepositoryTest` +1 (persists every prerequisite) and the existing single-dep assertion adapted
  to decode the encoded column (behaviour-preserving); `StoryComposerViewModelTest` +1 (no-media publish
  gates on no prerequisites) and the `dependsOn` capture adapted to the `List` contract. No test
  weakened, no coverage floor lowered.
- **Verification:** `./apps/android/meeshy.sh check` (`assembleDebug` + all `testDebugUnitTest`)
  **BUILD SUCCESSFUL**. Diff = `apps/android` only (2 prod files added, 5 prod edits, 6 test files).
- **Reviewer gate:** PASS — scope clean (apps/android only), behavioural non-tautological tests, SDK
  purity respected (pure stateless key + gate in `:sdk-core`; no product orchestration leaked down),
  single source of truth (one encode/decode + one verdict resolver), backward-compatible decode,
  no schema migration.
- **Note / next:** the composer still stages at most one `pendingUpload`; the *multi-pending UX*
  (let the user queue several offline media — `pendingUploads: List`, relax the single-pending guard,
  `publish(dependsOn = all cmids)`) is now unblocked at the SDK layer and is the next slice.

### 2026-06-28 — slice `outbox-flush-retry-on-blocked` ✅
- **Branch:** `claude/apps/android/outbox-flush-retry-on-blocked` (off `origin/main` @ `50c198e9`).
- **Housekeeping (step 0):** prior run's PR **#998** (`media-upload-cancel`) was open + behind main
  (main had gained iOS-only commits). Rebased it cleanly on `origin/main` (no code conflicts —
  iOS-only upstream), pushed, confirmed CI run `28323140213` **success** + `mergeable_state: clean`
  + local `meeshy.sh check` **BUILD SUCCESSFUL** (836 tasks), then **squash-merged to `main`**
  (`50c198e9`, PR #998). Branched this slice off the freshened `main`.
- **What:** closes the cross-pass gating gap flagged in "Next" #1 — `OutboxFlushWorker.doWork`
  returned `Result.retry()` only when a lane stopped on a **transient** failure, ignoring a lane
  that stopped on a **blocked dependency**. Because lanes drain in a fixed order, a dependent (a
  media story/message gated via `dependsOn`) can be `BLOCKED` early in a pass while its prerequisite
  `UPLOAD_MEDIA` row delivers *later in the same pass*; without a retry the now-satisfiable
  dependent sat until an unrelated trigger fired.
- **Added / changed (production, `apps/android` only):**
  - `OutboxFlushPlan.outcome(reports)` (`:sdk-core`, stateless building block) + `FlushOutcome`
    enum — pure decision: `RETRY` when **any** `DrainReport` stopped on a transient failure **or**
    a blocked dependency, else `SUCCESS`. Forward progress is guaranteed: each retry delivers the
    dependent or cascade-exhausts it once the prerequisite gives up (`EXHAUSTED` → verdict `FAILED`,
    never `BLOCKED`), so the loop terminates.
  - `OutboxFlushWorker.doWork` now collects each lane's `DrainReport` into a list and delegates the
    WorkManager outcome to `OutboxFlushPlan.outcome` (the untestable worker glue stays thin; the
    decision is the pure, fully-covered function).
- **TDD (red → green):** `OutboxFlushPlanTest` +9 — empty pass / single clean lane / transient-only /
  blocked-only / both flags / many clean lanes / one transient among clean / one blocked among clean /
  deliveries+exhaustions without a stop signal never retry. Branch sweep: both arms of the `||`,
  `.any{}` true and false, recorded as `tests=9 failures=0` in the JUnit report.
- **Verification:** `./apps/android/meeshy.sh check` (assembleDebug + all unit tests) **BUILD
  SUCCESSFUL**. Diff = `apps/android` only, 1 prod file added + 1 prod file edited + 1 test file.
- **Reviewer gate:** PASS — scope clean, behavioural non-tautological tests, SDK purity respected
  (pure stateless decision in `:sdk-core`; the "when to retry" rule extracted out of the worker),
  single source of truth (one decision point), no coverage floor lowered.

### 2026-06-28 — slice `media-upload-cancel` ✅
- **Branch:** `claude/apps/android/media-upload-cancel` (off `origin/main` @ `a970f979`).
- **Housekeeping (step 0):** prior run's PR **#996** (`story-composer-offline-media`) was already
  squash-merged to `main` (`a970f979`); no open `claude/apps/android/*` PR. (PR #997 is a separate
  `calls`/iOS branch, out of this loop's scope.) Branched off the freshened `main`.
- **What:** closes the **orphan-leak gap** flagged in "Next" #1 — `onRemoveMedia(pendingCmid)`
  cleared only the draft placeholder, leaving the durable `UPLOAD_MEDIA` row + blob to upload to a
  media the story would never reference. Removal now cancels the durable upload too.
- **Added / changed (production, `apps/android` only):**
  - `MediaUploadQueue.cancel(cmid)` (`:sdk-core`, stateless building block) — the mirror of
    `enqueue`: `OutboxRepository.discard(cmid)` (drops the row so the drainer stops picking it up)
    **then** `MediaBlobStore.remove(cmid)` (drops the bytes). Unknown cmid inert — both layers
    tolerate absence. Reuses the existing `discard`/`remove` primitives (no new outbox API).
  - `StoryComposerViewModel.onRemoveMedia` (`:feature:stories`, product orchestration) — captures
    `wasPending` before the state update, and when the removed id was the pending placeholder fires
    a best-effort `cancelDurableUpload(cmid)` on `viewModelScope` (cancellation-safe: rethrows
    `CancellationException`, swallows the rest — a stranded row exhausts harmlessly). UI still
    clears optimistically/synchronously; removing a regular attachment never cancels.
- **TDD (red → green):**
  - `MediaUploadQueueTest` +3: cancel drops both row & blob (real Room) / cancel leaves other
    queued uploads untouched / cancel of an unknown cmid is a no-op.
  - `StoryComposerViewModelTest` +4: removing the pending upload cancels its durable row & blob /
    removing an uploaded attachment never cancels / removing a non-pending id while a pending
    upload exists doesn't cancel (and keeps the pending) / clears state even when the cancel throws.
  - Branch sweep: pending-vs-attachment arm, unknown-id arm, failure (cancel throws) arm,
    cancellation-safety arm all covered.
- **Verification:** `./apps/android/meeshy.sh test` (37 story tests, 6 queue tests) + `build`
  (assembleDebug) both `BUILD SUCCESSFUL`. Diff = `apps/android` only, 2 prod + 2 test files.
- **Reviewer gate:** PASS — scope clean, behavioural non-tautological tests, SDK purity respected
  (cancel is a stateless building block; "when to cancel" stays in the VM), failure path graceful,
  cancellation-safe, no coverage floor lowered.

### 2026-06-28 — slice `story-composer-offline-media` ✅
- **Branch:** `claude/apps/android/story-composer-offline-media` (off `origin/main` @ `e691dbe9`).
- **Housekeeping (step 0):** prior run's PR **#994** (`media-upload-sender`) was open + green +
  `apps/android`-only + up-to-date with `main` → squash-merged it first (`e691dbe9`), then
  branched off the freshened `main`.
- **What:** the **last brick of the producer half** flagged in "Next" #1 — the composer now
  reaches the durable offline upload→publish chain. The SDK chain (`MediaUploadQueue.enqueue`,
  the `MEDIA`-lane sender, `SuccessWithId` graft, `dependsOn` gating) was already complete; this
  slice adds the **product orchestration** in `:feature:stories` that drives it from the UI.
- **Added / changed (production, `apps/android` only):**
  - `MediaUploadRetryPolicy` (`:feature:stories`, new, **pure**) — `isQueueable(error)`: no HTTP
    status (offline) / 429 / 5xx → queueable; any other 4xx → dead end. The composer's product
    pivot between "stage it offline" and "tell the user now"; kept app-side, not in the SDK.
  - `StoryComposerViewModel` — injects `MediaUploadQueue`; on a **single** transient-failed pick
    with no upload already pending, `queueDurably(item)` enqueues the durable upload + stages a
    `PendingMediaUpload(cmid, item)`; the draft's media ids (`draftMediaIds`) now combine uploaded
    ids + the placeholder cmid (so the cap, `canPublish`, and the wire request all see it).
    `publish()` passes `dependsOn = pendingUpload?.cmid`. `onRemoveMedia` also clears a pending
    placeholder. A permanent failure / multi-item pick / second-while-pending surfaces the error.
  - `StoryComposerUiState.pendingUpload` + the `PendingMediaUpload` model + internal `draftMediaIds`.
  - `StoryComposerScreen` — renders the pending media as an "Offline" preview tile (Coil reads the
    held bytes) with its own remove affordance (no dead end); extracted a shared `MediaThumbnail`.
    New string `stories_composer_media_pending` in all 4 locales.
  - `StoryRepository.enqueuePublish(request, dependsOn: String? = null)` — additive param threading
    the prerequisite cmid into the `PUBLISH_STORY` `OutboxMutation` (default `null` = unchanged).
- **Tests (+20, red→green):**
  - `MediaUploadRetryPolicyTest` (pure) +8 — null status, 429, 500, 599 → queueable; 413, 400, 401,
    499 → not. Boundary sweep of the 5xx range.
  - `StoryComposerViewModelTest` +10 — single offline pick → durable enqueue + pending staged +
    placeholder in draft + canPublish; permanent failure → error, never queued; multi-item offline
    → not chained, error; second pick while pending → rejected, queued once; publish gates on the
    pending cmid + carries the placeholder media id + kicks the worker; remove-pending clears it +
    its id; pending kept alongside an already-uploaded id (ordering); pending counts toward the cap;
    durable-enqueue throwing → graceful error, nothing staged; publish clears the pending on success.
  - `StoryRepositoryTest` +2 — `enqueuePublish` persists a given `dependsOn`; defaults it to null.
- **Edge cases covered:** boundary HTTP statuses (499/500/599); empty pick (inert); single vs
  multi-item batch; idempotent/inert second pick while pending; failure path (queue throws →
  graceful, no crash, nothing staged); re-entrancy guard preserved; `CancellationException`
  rethrown. The single-pending constraint is asserted (keeps the single-`dependsOn` chain correct).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m21s** (full `assembleDebug`
  incl. the VM's new Hilt dep + the screen + all module JVM unit tests; 836 tasks). TEST XMLs:
  `MediaUploadRetryPolicyTest` 8/8, `StoryComposerViewModelTest` 33/33, `StoryRepositoryTest` 28/28
  — failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (1 new prod + 3 prod edits + 4 string files under
  `:feature:stories`, 1 additive prod edit under `:sdk-core`; + 1 new test + 2 test edits + docs);
  behavioural tests through the public API (VM intents → `state`/`StateFlow`, pure policy outcomes,
  observable outbox `dependsOn`), no tautologies, no floor lowered; **SDK purity** (the durable
  building blocks stay in `:sdk-core`; the "when to fall back to durable" product rule is the
  app-side `MediaUploadRetryPolicy`); **single source of truth** (reuses `MediaUploadQueue`,
  `MediaRepository`, the one `enqueuePublish`, `draftMediaIds` derived once — no second queue/id
  shape); **Instant-App** (offline pick is staged instantly, no blocking spinner, publish stays
  optimistic); **UDF** (immutable `StateFlow<UiState>`, pure transitions); **UX coherence** (the
  pending tile is a real, removable preview — no dead end). Surpasses iOS (durable offline media vs
  drop-on-offline).
- **Follow-up (next slice):** multi-pending offline uploads (needs a multi-`dependsOn` / barrier
  primitive); remove-pending should also cancel the durable `UPLOAD_MEDIA` row (currently a harmless
  orphan); the cross-pass `BLOCKED`-not-`anyTransient` retry gap. See "Next slice" #1.

### 2026-06-28 — slice `media-upload-sender` ✅
- **Branch:** `claude/apps/android/media-upload-sender` (off `origin/main` @ `a3d39a3e`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests is:open head:claude/apps/android` → 0). `main` was fresh (last
  Android merge `#990 media-blob-store`); branched directly off it.
- **What:** the **rest of the producer half** flagged in "Next" #1 — at the SDK layer,
  the durable offline upload→publish chain now functions end-to-end. The drainer's
  dependency-gating (`outbox-dependency-gating`) and produced-id graft
  (`outbox-produced-id-writeback`) and the durable bytes store (`media-blob-store`) were
  already in place; this slice adds the `UPLOAD_MEDIA` kind, its delivery logic, its
  enqueue, and the worker wiring that ties them together. Surpasses iOS, which uploads
  synchronously and cannot queue a media attachment while offline.
- **Added / changed (production, `apps/android` only):**
  - `OutboxKind.UPLOAD_MEDIA` (new enum value; `OutboxLanes.MEDIA` already existed from
    `outbox-dependency-gating`).
  - `MediaUploadSender` (`:sdk-core/media`, new, pure) — `send(item, upload): SendResult`
    mapping the four outcomes: `item == null` (blob gone) → `PermanentFailure` **without
    calling upload**; transport `Failure` → `TransientFailure`; `Success` with no usable
    (blank/empty) id → `PermanentFailure`; `Success` with a real id → `SuccessWithId`
    (first id). Kept out of the worker so the decision is JVM-testable.
  - `MediaUploadQueue` (`:sdk-core/media`, new building block) — `enqueue(item): String`
    writes the bytes to `MediaBlobStore` **first**, then queues an `UPLOAD_MEDIA` row on
    the `MEDIA` lane; blob + row share one fresh `cmid` (= `targetId`), returned as the
    dependency key a dependent publish references. Blob-before-row so the row never exists
    without its bytes.
  - `OutboxFlushWorker` — injects `MediaRepository` + `MediaBlobStore`; a `MEDIA`-lane
    `UPLOAD_MEDIA` sender (looks the blob up, `MediaUploadSender.send`, `remove`s the bytes
    on any non-transient outcome); `OutboxLanes.MEDIA` added to the lane list **before**
    `STORY`; `onExhausted` converted to a `when` that drops the blob for an exhausted
    `UPLOAD_MEDIA` row (no byte leak when an upload gives up).
- **Tests (+10, red→green):**
  - `MediaUploadSenderTest` (pure) +7 — gone blob → permanent + upload never called;
    transport failure → transient; delivered → `SuccessWithId(realId)`; multiple produced
    → first id; empty success → permanent; blank id → permanent; the stored item is the
    one handed to upload.
  - `MediaUploadQueueTest` (Robolectric, real DB) +3 — enqueue stores the bytes
    retrievable by the returned cmid (bytes/name/mime); queues exactly one
    `UPLOAD_MEDIA`/`MEDIA`/`PENDING` row keyed by the cmid (= targetId, no `dependsOn`);
    independent enqueues produce distinct rows + blobs.
- **Edge cases covered:** absent blob (gone → permanent, no upload, no crash); empty +
  blank-id upload results (boundary on "no usable media"); transient vs permanent
  classification (retry vs abandon); first-of-many id selection; blob-before-row ordering;
  independent keys isolated. (No `viewModelScope` here — pure object + mechanical enqueue.)
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m39s** (full
  `assembleDebug` — incl. the worker's new Hilt deps — + all module JVM unit tests; 836
  tasks). TEST XMLs: `MediaUploadSenderTest` 7/7, `MediaUploadQueueTest` 3/3 —
  failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (2 prod edits + 2 new prod + 2 new test,
  all under `sdk-core/`); behavioural tests through the public API (pure `send` outcomes,
  `enqueue` observable rows + blobs), no tautologies, no floor lowered; SDK purity (the
  outcome map + enqueue are stateless building blocks in `:sdk-core`; no product "when to
  upload" rule — that stays in the composer); single source of truth (reuses
  `MediaBlobStore`, `MediaRepository.upload`, the one outbox, `SendResult`, `OutboxIds` —
  no second queue / bytes shape); Instant-App N/A (no UI; makes durable offline optimism
  *capable*); Kotlin style (immutable, early returns, exhaustive `when`, plain glue in the
  worker). Surpasses iOS (durable offline media upload vs synchronous-only).
- **Follow-up (next slice):** nothing enqueues an `UPLOAD_MEDIA` row from the UI yet —
  wire the composer's offline-media chain (`MediaUploadQueue.enqueue` + a publish that
  `dependsOn` the upload cmid with it as the placeholder media id). See "Next slice" #1.

### 2026-06-28 — slice `media-blob-store` ✅
- **Branch:** `claude/apps/android/media-blob-store` (off `origin/main` @ `30b6130b`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests is:open head:claude/apps/android` → 0). `main` was fresh
  (last Android merge `#987 outbox-produced-id-writeback`); branched directly off it.
- **What:** the **first brick of the producer half** flagged in "Next" — a durable
  file-bytes store. The shared outbox payload is a `String`, so the raw bytes of a
  queued media upload have nowhere to live; this slice gives them a durable home keyed
  by the (future) `UPLOAD_MEDIA` row's `cmid`, so a media attachment can be enqueued
  **fully offline** and its bytes survive process death until the `MEDIA`-lane sender
  uploads them. Surpasses iOS, which uploads synchronously and cannot queue a media
  attachment while offline.
- **Added / changed (production, `apps/android` only):**
  - `MediaBlobEntity` (`:core:database`, new) — `cmid` PK + `bytes: ByteArray` +
    `fileName`/`mimeType`/`createdAt`. A **plain `class`** (not `data`) because value
    equality over a `ByteArray` is a footgun and the row is only ever looked up by
    `cmid` — the same decision already made on `MediaUploadItem`.
  - `MediaBlobDao` (`:core:database`, new) — `upsert`/`find(cmid)`/`delete(cmid)`/`clear`.
  - `MeeshyDatabase` — registered `MediaBlobEntity` + `mediaBlobDao()`, **DB version
    5 → 6** (covered by the existing `fallbackToDestructiveMigration()`; an in-flight
    blob is transient, so destroying it on an upgrade is safe — it re-queues).
  - `DatabaseModule` — `providesMediaBlobDao`.
  - `MediaBlobStore` (`:sdk-core`, new) — `put(cmid, item)`/`get(cmid)`/`remove(cmid)`,
    mapping to/from `MediaUploadItem` (single bytes shape, no second type). A stateless
    building block: it persists exactly what the uploader consumes; the "when to
    enqueue / upload" rule stays in the product layer.
- **Tests (+12, red→green):**
  - `MediaBlobDaoTest` (Robolectric) +6 — round-trips every field incl. bytes; unknown
    `cmid` → null; `upsert` replaces same-cmid; `delete` removes only the target;
    `delete` unknown → no-op; `clear` empties.
  - `MediaBlobStoreTest` (Robolectric) +6 — `get` returns what `put` stored (bytes +
    name + mime); unknown → null; `put` overwrites same cmid; `remove` deletes;
    `remove` unknown → no-op; independent cmids stay separate.
- **Edge cases covered:** unknown cmid on get/delete/remove (null / no-op, never a
  crash); same-cmid overwrite (idempotent replace); byte-array preservation across the
  BLOB round-trip; independent keys isolated; empty store. (No network/failure path —
  this is a pure durable store; classification lives in the future sender.)
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m45s** (full
  `assembleDebug` + all module JVM unit tests). TEST XMLs: `MediaBlobDaoTest` 6/6,
  `MediaBlobStoreTest` 6/6 — failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (2 prod edits + 3 new prod + 2 new
  test, all under `core/database/` + `sdk-core/`); behavioural tests through the public
  API (DAO/store methods + observable rows), no tautologies, no floor lowered; SDK
  purity (durable store is a stateless building block in `:sdk-core`; entity/DAO in
  `:core:database`; no product "when" rule); single source of truth (reuses
  `MediaUploadItem` — no second bytes shape; one DB, destructive-fallback migration —
  no bespoke migration); Instant-App N/A (no UI); Kotlin style (`explicitApi` honoured,
  immutable, plain class for the `ByteArray` footgun). Surpasses iOS (durable offline
  media bytes vs synchronous-only upload).
- **Follow-up (next slice):** nothing reads/writes this store yet — wire the
  `UPLOAD_MEDIA` kind + `MEDIA`-lane sender (`SuccessWithId(realMediaId)`) + lane
  ordering (`MEDIA` before `STORY`) + composer chain. See "Next slice" #1.

### 2026-06-27 — slice `outbox-produced-id-writeback` ✅
- **Branch:** `claude/apps/android/outbox-produced-id-writeback` (off `origin/main` @ `64c2c4e1`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests head:claude/apps/android` → 0). `main` was fresh (last merge
  `#985 outbox-dependency-gating`); branched directly off it.
- **What:** the **second half** of the durable upload→publish chain (the part-1
  follow-up flagged in "Next"). The `outbox-dependency-gating` slice taught the
  drainer to *hold* a publish until its upload lands, but the held publish still
  carried its **enqueue-time** `mediaIds` — useless for a media story queued
  **offline, before the upload finished** (the real `mediaId` is unknowable then).
  Now: when a prerequisite delivers a **`SendResult.SuccessWithId(producedId)`**, the
  drainer **grafts** that real id into every still-queued dependent's payload —
  placeholder = the prerequisite's own `cmid` — **before** the prerequisite row is
  deleted and the gate opens. So a media story queued offline with a placeholder
  publishes with the correct id once its upload lands. Surpasses iOS, which uploads
  synchronously and cannot queue a media story while offline.
- **Added / changed (production, `apps/android` only):**
  - `PublishMediaWriteBack.graft(payload, placeholder, realId): String?` (pure, new) —
    decodes a `CreateStoryRequest`, swaps every `placeholder` media id for `realId`
    (order preserved, duplicates collapsed via `distinct()`), re-encodes; returns
    `null` (no-op) when undecodable, no `mediaIds`, placeholder absent, or an identity
    swap — so the caller skips a pointless durable write.
  - `SendResult.SuccessWithId(producedId: String)` (new variant) — a delivery that
    carries a server-produced id; accounted as a delivery exactly like `Success`.
  - `OutboxDrainer` — gains an injected `graftProducedId` (default no-op, keeping the
    outbox package generic). On `SuccessWithId`, calls `outbox.rewriteDependents(...)`
    then `markSucceeded` (graft-before-delete ordering).
  - `OutboxRepository.rewriteDependents(prerequisiteCmid, rewrite): Int` — applies a
    generic `(payload) -> payload?` to every **PENDING** dependent (skips
    INFLIGHT/EXHAUSTED — can't rewrite a row mid-flight), persists non-null results,
    returns the count. Generic shape keeps the queue payload-format-agnostic.
  - `OutboxDao` — `findDependents(cmid)` (by `dependsOn`) + `updatePayload(cmid,
    payload, now)`. No schema change (the `payload` column already exists).
  - `OutboxFlushWorker` — wires `graftProducedId = PublishMediaWriteBack::graft` so the
    production drainer is capable; `onExhausted` made a named arg in the same call.
- **Tests (+17, red→green):**
  - `PublishMediaWriteBackTest` (pure) +10 — graft in place; order/neighbours
    preserved; every occurrence replaced; dedupe when realId already present; rest of
    the request intact (content/visibility); inert on placeholder-absent, null media,
    empty media, identity swap (realId==placeholder), undecodable payload. All `graft`
    branches hit.
  - `OutboxDrainerTest` +3 — `SuccessWithId` grafts the real id into a waiting
    dependent publish; `SuccessWithId` counts as a delivery and removes the row; a
    plain `Success` leaves a dependent placeholder untouched (graft only on the new arm).
  - `OutboxRepositoryTest` +4 — rewrites every PENDING dependent and returns the count;
    a `null` rewrite leaves the row untouched; rows depending on a **different**
    prerequisite are ignored; a **non-PENDING** (INFLIGHT) dependent is skipped.
- **Edge cases covered:** empty/single media list; null/absent `mediaIds`; placeholder
  absent (inert); identity swap (inert, no DB write); duplicate collapse; undecodable
  payload (graceful null, never a crash); dependent on a different prerequisite; a
  non-PENDING dependent skipped; graft-before-delete ordering; `dependsOn`-less and
  plain-`Success` rows unaffected (all prior drainer/repo tests still green).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 1m47s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). TEST XMLs:
  `PublishMediaWriteBackTest` 10/10, `OutboxDrainerTest` 14/14, `OutboxRepositoryTest`
  13/13 — failures=0 errors=0.
- **Reviewer:** PASS — scope `apps/android` only (4 prod + 2 test changed, 1 prod + 1
  test new, all under `sdk-core/` + `core/database/`); behavioural tests through the
  public API (pure `graft`, drainer `drainLane` outcome, repo `rewriteDependents`
  count + observable payloads), no tautologies, no floor lowered; SDK purity (the
  story-specific knowledge lives only in the stateless `PublishMediaWriteBack`;
  `rewriteDependents`/the drainer stay payload-agnostic via the injected transform);
  single source of truth (reuses `MeeshyApi.json` + `CreateStoryRequest`, the one
  outbox table, `dependsOn` — no second queue, no new column); Instant-App (makes
  durable offline optimism *correct*, not just held); Kotlin style (`explicitApi`,
  immutable, early `return`/`continue`, exhaustive `when`). Surpasses iOS (durable
  offline media publish vs synchronous-only upload).
- **Follow-ups (next slice — the producer half):** no upstream sender returns
  `SuccessWithId` yet, and the worker's lane list still omits `MEDIA` (no
  `UPLOAD_MEDIA` kind/sender). Next: add a durable `UPLOAD_MEDIA` outbox row (needs a
  durable file-bytes store), a `MEDIA`-lane sender that returns `SuccessWithId(realId)`,
  drain `MEDIA` **before** `STORY`, and wire the composer to enqueue the upload +
  publish-with-placeholder chain. A `BLOCKED` dependency also doesn't currently set
  `anyTransient`, so a held lane isn't auto-retried by WorkManager — revisit when the
  producer lands.

### 2026-06-27 — slice `outbox-dependency-gating` ✅
- **Branch:** `claude/apps/android/outbox-dependency-gating` (off `origin/main` @ `8277b688`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests head:claude/apps/android` → 0). `main` was fresh; branched
  directly off it.
- **What:** the durable **upload→publish outbox chain** primitive — the SOTA
  follow-up flagged on `story-composer-media`. The `dependsOn` cmid was persisted on
  every outbox row but the drainer **never consulted it**; a media publish could be
  delivered before (or independently of) the upload it depends on. The drainer now
  gates a dependent on its prerequisite: it **holds the lane** while the prerequisite
  is still queued, runs the dependent once the prerequisite has succeeded (its row is
  gone), and **cascade-exhausts** the dependent if the prerequisite gives up. The
  prerequisite may sit on a **different lane** (e.g. an upload on the new `MEDIA`
  lane the publish, on the `STORY` lane, depends on). Surpasses iOS, which has no
  durable cross-mutation dependency primitive.
- **Added / changed (production, `apps/android` only):**
  - `OutboxModel.kt` — pure `DependencyVerdict {SATISFIED, BLOCKED, FAILED}` +
    `OutboxDependencies.verdict(prerequisiteState: OutboxState?)`: `null` (gone) →
    `SATISFIED`; `EXHAUSTED` → `FAILED`; `PENDING`/`INFLIGHT` → `BLOCKED`. Added
    `OutboxLanes.MEDIA = "media"` for the upload lane.
  - `OutboxRepository.stateOf(cmid): OutboxState?` — current state of an arbitrary
    cmid (null when the row is gone), so the drainer can resolve a cross-lane gate.
  - `OutboxDrainer.drainLane` — before sending a row with a non-null `dependsOn`,
    resolves the verdict: `BLOCKED` returns early (`stoppedOnBlockedDependency=true`,
    dependent left `PENDING`); `FAILED` `markExhausted`+`onExhausted`+continues;
    `SATISFIED` falls through to the existing send path. `DrainReport` gains
    `stoppedOnBlockedDependency: Boolean = false` (defaulted — no existing call site
    changes). A `dependsOn == null` row is entirely unaffected (existing behaviour).
- **Tests (+9, red→green):**
  - `OutboxDependenciesTest` (pure) +4 — gone→SATISFIED; PENDING→BLOCKED;
    INFLIGHT→BLOCKED; EXHAUSTED→FAILED. All four arms of the nullable-state `when`.
  - `OutboxDrainerTest` +5 — a pending prerequisite holds the dependent (lane stops,
    0 sends, dependent stays PENDING); an inflight prerequisite holds it; a succeeded
    (gone) prerequisite lets it deliver; an exhausted prerequisite cascade-exhausts
    it (onExhausted fires with the dependent, state EXHAUSTED); a never-enqueued
    prerequisite delivers (gone = satisfied).
- **Edge cases covered:** prerequisite gone vs present; all three live/terminal
  states (PENDING/INFLIGHT/EXHAUSTED); cross-lane dependency (upload on `MEDIA`,
  publish on `STORY`); never-existed prerequisite (no crash, treated satisfied);
  cascade-failure surfaces through `onExhausted` (never a silent drop); a
  `dependsOn == null` row unaffected (all 6 prior drainer tests still green).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m08s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks).
  `:sdk-core:testDebugUnitTest` — `OutboxDependenciesTest` 4/4, `OutboxDrainerTest`
  11/11 green (TEST XMLs: tests=4/11 failures=0 errors=0).
- **Reviewer:** PASS — scope `apps/android` only (3 prod + 2 test files, all under
  `sdk-core/`); behavioural tests through the public API (pure `verdict`, drainer
  `drainLane` report + observable outbox state), no tautologies, no floor lowered;
  SDK purity (the dependency *resolution* is a stateless building block in
  `:sdk-core` — there is no product "when to chain" rule here, that is the future
  composer's job); single source of truth (reuses `OutboxState`/`dependsOn`/the one
  outbox table — no second queue, no new state machine); Instant-App (the gate makes
  durable optimism *stronger* — a queued publish now waits for its upload rather than
  failing); Kotlin style (`explicitApi` honoured, immutable `DrainReport` with a
  defaulted field, exhaustive `when`, early `return`/`continue`). Surpasses iOS
  (durable cross-mutation dependency vs none).

### 2026-06-27 — slice `story-composer-multipick` ✅
- **Branch:** `claude/apps/android/story-composer-multipick` (off `origin/main` @ `2d229df4`).
- **Housekeeping (step 0):** no open `claude/apps/android/*` PR from a prior run
  (`search_pull_requests head:claude/apps/android` → 0). The one open PR (#980) is a
  `shared` types-coverage PR by a teammate — outside Android scope, left untouched.
  `main` was fresh; branched directly.
- **What:** lets the composer grab **several media in one pick**, while keeping the
  iOS ≤10 cap. Closes the "multi-pick the picker" follow-up flagged on
  `story-composer-media`/`-media-cap`.
- **Added (production, `apps/android` only):**
  - `StoryMediaPickMode` (pure enum `None`/`Single`/`Multiple`) + `StoryMediaPicker.modeFor(remainingSlots)`
    — routes by free slots: `<= 0` → `None` (don't launch), `== 1` → `Single`,
    `>= 2` → `Multiple`. Encodes the crash-avoiding rule that Android's
    `PickMultipleVisualMedia(maxItems)` **throws** when `maxItems <= 1`.
  - `StoryComposerScreen` (exempt glue) — now holds two launchers (`PickVisualMedia`
    single + `PickMultipleVisualMedia(MAX_MEDIA)` multi); a shared `dispatchPicked`
    reads every picked uri off-main into `MediaUploadItem`s and forwards the batch to
    the existing `onMediaPicked` (which already truncates to free slots). The Add
    button's `onClick` switches on `StoryMediaPicker.modeFor(...)`.
- **Tests (+8, red→green):** `StoryMediaPickerTest` — `modeFor` 0/None, negative/None,
  1/Single, 2/Multiple, `MAX_MEDIA`/Multiple; plus draft-derived: empty draft → Multiple,
  one-slot-left draft → Single, full draft → None. All three `when` arms + both
  boundaries (0→1, 1→2) hit.
- **Edge cases covered:** empty/full collections (0 and 10 media); boundary at the
  single-slot fallback (1 vs 2); defensive negative slot count → None. The
  per-launch quantity cap is unchanged (VM truncation, already tested in
  `StoryComposerViewModelTest`).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 6m14s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks).
  `StoryMediaPickerTest` 8/8 green (`TEST-…StoryMediaPickerTest.xml`:
  tests=8 failures=0 errors=0).
- **Reviewer verdict:** PASS — diff is `apps/android` only (3 files: 1 pure prod, 1
  glue screen, 1 test); behavioural tests through the public `modeFor` API, no
  tautologies; SDK purity respected (pure product rule lives in `:feature:stories`,
  not the SDK); no coverage floor touched.

### 2026-06-27 — slice `story-composer-media-cap` ✅
- **Branch:** `claude/apps/android/story-composer-media-cap`
- **Housekeeping (step 0):** PR **#979** (`story-composer-media`) was open from the
  prior run, held only by the pre-existing `Test gateway` red on `main`. Re-verified
  the blocker — the duplicate `jwt` import (`AuthHandler.manual-auth.test.ts` lines
  16 & 21) is present verbatim on `origin/main`, the PR's diff touches **zero**
  gateway files, and 11/12 CI checks are green — so merging this `apps/android`-only
  PR cannot regress `main` (already red on that one job). Per the run directive
  ("merge the open PR before proceeding"), **squash-merged #979** → `0d65615`, then
  branched this slice off the freshened `main`.
- **What:** enforces the iOS **≤10 media-per-story cap** end-to-end. Closes the
  "multi-pick limit (≤10)" follow-up flagged on `story-composer-media`.
- **Added (production, `apps/android` only):**
  - `StoryComposerDraft` (pure) — `MAX_MEDIA = 10`; `isWithinMediaLimit`
    (`size <= MAX_MEDIA`); `remainingMediaSlots` (`MAX_MEDIA - size`, clamped ≥0 so
    the UI can size a picker request); `isMediaFull` (`size >= MAX_MEDIA`).
    `canPublish` now also requires `isWithinMediaLimit`, so an over-cap draft can't
    publish.
  - `StoryComposerViewModel.onMediaPicked` — computes free slots from the draft:
    inert-with-a-warning (`MEDIA_LIMIT`, no upload) once full; otherwise uploads only
    `items.take(remaining)` so a pick can never exceed the cap and never wastes an
    upload on items that won't fit.
  - `StoryComposerScreen` (exempt glue) — Add button `enabled` also gated on
    `!draft.isMediaFull`; label switches to an `n/10` count (`stories_composer_add_media_count`)
    once media is attached.
  - strings — `stories_composer_add_media_count` in en/fr/es/pt, plus **backfilled**
    `stories_composer_add_media`/`stories_composer_remove_media` into fr/es/pt (a
    parity gap from #979, which only added them to default `values/`).
- **Tests (+6, red→green):**
  - `StoryComposerDraftTest` +4 — empty draft offers the full allowance + not full;
    partially-filled reports remaining slots; exactly-at-cap is full / 0 remaining /
    within-limit / still publishable; past-cap not-within-limit / remaining clamped
    to 0 / can't publish.
  - `StoryComposerViewModelTest` +2 — picking when at the cap is inert (no upload
    call) + warns + leaves the 10 attachments intact; picking 3 items with only 1
    free slot uploads exactly 1 (slot-captured) and lands at the cap.
- **Edge cases covered:** empty/at-cap/over-cap collections; boundary (=10 ok vs
  >10 blocked); remaining clamped non-negative; over-pick truncated to free slots;
  full → inert + no network. `CancellationException` path unchanged (still rethrown).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m16s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). `:feature:stories`
  `testDebugUnitTest` — `StoryComposerDraftTest` 23/23, `StoryComposerViewModelTest`
  23/23 green.
- **Reviewer:** PASS — scope `apps/android` only (draft/VM/screen + 4 string files +
  2 test files); behavioural tests through the public API (pure draft getters, VM
  state via intents), no tautologies, no floor lowered; SDK purity (the "≤10 cap /
  truncate / warn when full" product rule lives in `:feature:stories`; no SDK touch);
  single source of truth (one `MAX_MEDIA`, reuses the existing upload/draft flow);
  Instant-App (no new I/O — cap is derived from the in-memory draft); UDF + immutable
  `UiState`, pure draft; colour/UX coherence (Add button disables + shows `n/10`, no
  dead end). Surpasses iOS (cap enforced *and* over-pick truncated gracefully).

### 2026-06-27 — slice `story-composer-media` ✅ MERGED (PR #979, this run)
- **Status:** PR [#979](https://github.com/isopen-io/meeshy/pull/979) **squash-merged**
  this run (`0d65615`) — see the `story-composer-media-cap` housekeeping note above
  for why merging past the pre-existing `Test gateway` red was safe. The detail below
  is the original (held) entry, kept for the record.
- **Status (original):** PR open, held — everything in scope green (local `check`,
  reviewer PASS, `apps/android`-only diff, 11/12 CI checks ✅) but the monorepo
  **`Test gateway`** CI job is **red on `main` itself** — pre-existing breakage
  unrelated to this diff:
  - `AuthHandler.manual-auth.test.ts` — `TS2300: Duplicate identifier 'jwt'` (two
    `import jwt from 'jsonwebtoken'` lines 16 & 21 — present verbatim on `origin/main`).
  - `MeeshySocketIOManager.test.ts`, `AuthHandler.test.ts`, two `ConversationHandler`
    suites — assertion mismatches in gateway socket handlers.
  - `git diff origin/main...HEAD` touches **zero** gateway files → this PR cannot have
    caused it, and the hard scope rule (`apps/android` only, no production logic in
    `gateway/`) forbids fixing it inside this slice. Held per hard rule "never merge
    past red CI". Will re-run CI + squash-merge once `main`'s gateway suite is green
    (tracked: a separate, explicitly-authorised run is needed to fix gateway tests —
    out of the Android workstream's scope).
- **Branch:** `claude/apps/android/story-composer-media`
- **Housekeeping:** no open Android PR to land first (`list_pull_requests` open
  set = 24, none on an `apps/android` head). Branched off latest `origin/main`
  (carries #976). SDK bootstrapped per the env recipe; also installed
  `build-tools;34.0.0` (a module pins it — the recipe only lists 35.0.0; noted).
- **What:** wires **real media** into the story composer on top of the
  `media-upload-api` foundation. The composer gains an "Add photo or video" button
  that launches the **system photo/video picker** (`ActivityResultContracts
  .PickVisualMedia`, ImageAndVideo); the picked file is read off-main into a
  `MediaUploadItem`, uploaded via `MediaRepository.upload()`, and the returned
  `UploadedMedia` is **appended** to the draft. `publish()` carries the resulting
  `mediaIds` into the existing durable-outbox publish flow. A **media-only** story
  (no caption) is now publishable. Surpasses iOS (single-JPEG-avatar uploads,
  no story media composer yet).
- **Added / changed (production, `apps/android` only):**
  - `StoryComposerDraft` — `mediaIds: List<String>` + `hasMedia` + `withMediaIds`;
    `canPublish` now admits **text OR media** within the limit; `toCreateStoryRequest`
    sends `content` null when blank (media-only) and rides `mediaIds` when present.
  - `StoryComposerViewModel` — injects `MediaRepository`; `StoryComposerUiState`
    gains `attachments: List<UploadedMedia>` + `isUploadingMedia` (gates `canPublish`).
    New `onMediaPicked(items)` (empty/in-flight inert; upload → append on success;
    failure / thrown / all-rows-unusable → message, draft intact; `CancellationException`
    rethrown) and `onRemoveMedia(id)`. `publish()` now guards on the derived
    `canPublish` (so an in-flight upload blocks it) and clears attachments on success.
  - `StoryComposerScreen` — picker launcher + off-main `ContentResolver` reader
    (bytes/MIME/display-name → `MediaUploadItem`), media preview `LazyRow`
    (coil `AsyncImage` thumbnails + remove chip), "Add photo or video" button with
    in-flight spinner. Exempt Compose/IO glue.
  - `feature/stories/build.gradle.kts` — `implementation(libs.androidx.activity.compose)`
    for `rememberLauncherForActivityResult` / `PickVisualMedia`.
  - strings: `stories_composer_add_media`, `stories_composer_remove_media`.
- **Tests (+19, red→green):**
  - `StoryComposerDraftTest` +6 — media-only draft publishes; media + over-limit
    text can't; empty draft has no media / can't publish; `withMediaIds` is a pure
    copy preserving text+visibility (original untouched); `toCreateStoryRequest`
    carries non-empty `mediaIds` alongside text; media-only request sends null content.
  - `StoryComposerViewModelTest` +13 — empty pick is inert (no upload call); upload
    stores ids on the draft + flips `canPublish`; second pick **appends**; in-flight
    sets `isUploadingMedia` and blocks publish until resolved (gated `CompletableDeferred`);
    re-entrancy guard (one upload while in flight); failure response → message, no ids;
    thrown upload → message, no ids; all-rows-unusable (empty success) → message, no ids;
    `onRemoveMedia` drops the attachment + its id; media-only draft publishes carrying
    `mediaIds` with null content; publish clears attachments on success.
- **Edge cases covered:** empty pick (short-circuit, no network); single vs append;
  in-flight re-entrancy + publish-gating; three failure paths (Failure / exception /
  empty-success); remove-then-publish; media-only (no text) boundary; over-limit text
  with media. `CancellationException` rethrown (cancellation-safe `viewModelScope`).
- **Verify:** `:feature:stories:testDebugUnitTest --tests StoryComposer*` →
  **BUILD SUCCESSFUL in 2m09s**; full `assembleDebug + testDebugUnitTest` →
  **BUILD SUCCESSFUL in 2m58s** (836 tasks; full debug APK + every module's JVM
  unit tests green).
- **Reviewer:** PASS — scope `apps/android` only (draft/VM/screen/build/strings +
  docs; no web/ios/gateway/shared); behavioural tests through the public API
  (draft rule, VM state machine via intents + Turbine-free synchronous reads under
  `UnconfinedTestDispatcher`), no tautologies, no floor lowered; SDK purity (the
  "when to upload / append / gate publish" rule is product UX → `:feature:stories`;
  `MediaRepository`/`MediaUpload`/wire mapper stay building blocks in `:sdk-core`/
  `:core:*`); single source of truth (reuses `MediaRepository.upload`, `NetworkResult`,
  `LanguageResolver`, the one durable outbox); Instant-App (optimistic publish
  unchanged; upload shows an inline spinner, not a blocking screen); colour/nav
  coherence (composer accent unchanged, natural system-picker gesture, removable
  preview). Surpasses iOS (any-MIME multi-file upload + media-only story vs single
  JPEG avatar / no story media composer).

### 2026-06-27 — slice `media-upload-api` ✅
- **Branch:** `claude/apps/android/media-upload-api`
- **Housekeeping:** no open Android PR to land first (`search_pull_requests` for open
  `apps/android` heads = 0). Branched off latest `origin/main` (carries #968). SDK
  bootstrapped per the env recipe.
- **What:** the **media-upload foundation** the story composer's media slice needs.
  iOS uploads a single compressed JPEG avatar via `POST /attachments/upload`
  (`AttachmentUploader`) and discards the returned id; Meeshy stories reference media
  **by id** (`CreateStoryRequest.mediaIds`), so Android generalises the upload to any
  file/MIME and **carries the attachment id**. Pure, fully-testable: no Compose glue —
  this is the request/repository/mapper layer only (the picker + publish wiring is the
  next slice).
- **Added (production):**
  - `core:model` — `UploadedMedia` domain (id = `mediaId`, url, mimeType, fileSize,
    width?/height?/durationMs?/thumbnailUrl?) + `MediaUploadResponse`/`MediaAttachmentWire`
    wire (subset of `messageAttachmentSchema`, every field defaulted/nullable) + pure
    `MediaAttachmentWire.toUploadedMedia()` mapper returning `null` for unusable rows
    (blank id → no `mediaId`; blank/absent `fileUrl` → nothing to show), defaulting a
    blank mime to `DEFAULT_MEDIA_MIME_TYPE`, clamping a negative size to 0 and collapsing
    zero/negative dims+duration and blank thumbnail to `null`.
  - `core:network` — `MediaApi` (`@Multipart @POST("attachments/upload")` taking
    `List<MultipartBody.Part>`), registered in `MeeshyApi` + a Hilt `providesMediaApi`.
  - `sdk-core` — pure `MediaUpload` part-builder (field name `files`, default filename
    `upload`, octet-stream default content type; `formPart` builds the
    `MultipartBody.Part`) + `MediaRepository.upload(items)` → `NetworkResult<List<UploadedMedia>>`
    (empty list short-circuits with **no** API call; folds via `apiCall`, maps the wire
    list through the mapper, `mapNotNull` drops unusable rows). Added `implementation(libs.okhttp)`
    to `sdk-core` (it only had okhttp transitively as `implementation` of `:core:network`).
- **Tests (+28):**
  - `MediaMappingTest` (core:model, pure) +11 — full payload maps every field; blank/
    whitespace id → null; absent url → null; blank url → null; blank mime → octet-stream;
    absent size → 0; negative size → 0; zero/negative dims → null; zero/negative duration
    → null; blank thumbnail → null; audio-style (no dims, has duration) keeps positives.
  - `MediaUploadTest` (sdk-core, pure) +9 — filename passthrough / blank→default; mime
    passthrough / blank→octet-stream; `formPart` uses the `files` field name + filename;
    blank filename → default in disposition; resolved content type set on body; blank mime
    → octet-stream content type; body carries the exact byte count.
  - `MediaRepositoryTest` (sdk-core, fake `MediaApi`) +8 — empty items → Success(empty)
    with **no** API call (`coVerify exactly = 0`); single attachment maps wire→domain;
    multiple preserve order; unusable rows dropped, valid kept; **one part per item under
    the `files` field** (slot-captured); failure response → Failure; `IOException` →
    Failure; success with no attachments → empty list.
- **Edge cases covered:** empty collection (short-circuit, no network); single vs multiple;
  blank/absent identifiers (id, url) → row dropped, never crashes the batch; boundary
  numeric values (negative size, zero/negative dims+duration); default-substitution
  branches (filename, mime); failure-response vs transport-exception paths.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m04s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:core:model` (MediaMappingTest 11/11) + `:sdk-core` (MediaUploadTest 9/9,
  MediaRepositoryTest 8/8) green.
- **Reviewer:** PASS — scope `apps/android` only (3 edits in `:core:network`/`:sdk-core`
  build + 5 new files; no web/ios/gateway/shared); behavioural tests through the public
  API (pure mapper, pure builder via okhttp's observable headers/body, repo `NetworkResult`),
  no tautologies; SDK purity (the upload endpoint + repository + part-builder + wire mapper
  are stateless **building blocks** in `:core:network`/`:core:model`/`:sdk-core` — no "when
  to upload" product rule here, that's the composer's next slice); single source of truth
  (reuses `apiCall`/`NetworkResult`/`ApiResponse`, the `messageAttachmentSchema` wire shape,
  one `MediaApi`); Instant-App N/A (no UI); Kotlin style (immutable data, early returns in
  the mapper, plain class for the `ByteArray`-holding `MediaUploadItem` to dodge the array-
  equality footgun). Surpasses iOS (id-carrying, any-MIME, multi-file vs single-JPEG-avatar).

### 2026-06-27 — slice `story-publish-retry` ✅
- **Branch:** `claude/apps/android/story-publish-retry`
- **Housekeeping:** no open Android PR to land first (`list_pull_requests` open
  set = 24, none on an `apps/android` branch). Branched off latest `origin/main`
  (carries #960, the optimistic tray). SDK bootstrapped per the env recipe.
- **What:** closes the tracked follow-up — a story publish that **exhausts** its
  durable-outbox retries no longer vanishes silently. It now surfaces as a
  "Couldn't post your story" **strip above the tray** with explicit **Retry** and
  **Discard**, derived from the durable outbox so it survives process death.
  Also **fixes a latent bug**: the optimistic-tray reconciler treated *any*
  vanished pending publish as "delivered" and fired a spurious `refresh()` — it
  now tells a *failed* publish (moved to `EXHAUSTED`, surfaced as a failure) apart
  from a *delivered* one (row deleted → real hand-off). Surpasses iOS, whose
  optimistic story evaporates on failure with no signal or recovery.
- **Added (production):**
  - `sdk-core` — `FailedStoryPublish` (pure domain: `cmid` + `tempId` + content/
    visibility/language + `createdAtMillis`/`failedAtMillis`); `StoryPublishQueue`
    (`{pending, failed}`) + `StoryRepository.publishQueue(): Flow<StoryPublishQueue>`
    — derives **both** lists from **one** `observeAll()` emission so a
    `PENDING → EXHAUSTED` transition is atomic to a consumer (the row leaves
    `pending` and enters `failed` in the same frame; never seen in neither set →
    no false "delivered" read). `pendingPublishes()`/`failedPublishes()` are now
    thin `.map` projections of it. `retryPublish(cmid)` → `OutboxRepository.retry`
    (revive → PENDING, fresh budget); `discardPublish(cmid)` → new
    `OutboxRepository.discard(cmid)` (delete row, no outcome signal — a deliberate
    user removal, not a delivery).
  - `feature:stories` — pure `StoryPublishFailures` (`from(failed)` → newest-failed-
    first items with a single-line, cap-80 ellipsised content preview);
    `StoriesViewModel` now `combine`s the single consistent `publishQueue()`
    snapshot (one source — the fix that makes the no-spurious-refresh guarantee
    race-free; two separately-subscribed flows could show a transient neither-set
    frame), exposes `failedPublishes: List<Item>` in `UiState`, and adds
    `retryPublish`/`discardPublish` intents (retry kicks `OutboxFlushWorker`);
    reconciler excludes failed temp ids from the delivered-detection.
  - `feature:stories` (Compose glue) — `StoryFailedStrip`/`StoryFailedRow` rendered
    above the carousel (shown even when the tray is otherwise empty), accent via the
    `MeeshyTheme.tokens.error` token, Retry `TextButton` + Discard `IconButton`.
  - Strings `stories_publish_{failed_title,retry,discard}` in en/fr/es/pt.
- **Tests (+24):**
  - `StoryPublishFailuresTest` (pure) +8 — empty→none; single item keyed by cmid;
    newest-failed-first ordering; same-timestamp ties keep input order; multi-line →
    single-line preview; surrounding whitespace trimmed; exactly-cap kept whole;
    over-cap truncated with ellipsis (len cap+1).
  - `StoryRepositoryTest` (sdk-core, Robolectric) +9 — `publishQueue` surfaces live +
    exhausted together in one snapshot / empty when nothing queued; `failedPublishes`
    surfaces an exhausted publish (cmid/tempId/content/visibility/lang/timestamps);
    excludes a still-pending one; ignores non-publish exhausted rows; skips
    blank/undecodable; `retryPublish` revives (failed→empty, pending→content) ;
    unknown cmid → false; `discardPublish` removes for good (failed & pending empty).
  - `OutboxRepositoryTest` (sdk-core) +2 — `discard` removes a row outright; unknown
    cmid → no-op.
  - `StoriesViewModelTest` +5 — exhausted publish surfaces as a failed item (one
    atomic `publishQueue` transition) with **no** spurious refresh; retry revives +
    kicks the worker; retry on a vanished row does **not** kick the worker; discard
    drops the row. (Existing tests migrated to the `publishQueue` stub + `workManager`
    ctor arg, all green.)
- **Edge cases covered:** empty/single collections; preview cap boundary (=80 whole /
  >80 ellipsised); multi-line + whitespace normalisation; unknown cmid on retry
  (false → no worker kick) and discard (no-op); failed-vs-delivered disambiguation
  (no spurious refresh); non-publish & blank/undecodable rows excluded; tie-stable order.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m32s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:sdk-core` + `:feature:stories` `testDebugUnitTest` green (23/23 stories VM+failures).
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the public
  API (repo `Flow`, VM `state`, pure object), no tautologies; SDK purity (the outbox-
  reading `failedPublishes`/`retry`/`discard` building blocks live in `:sdk-core`; the
  "render as a Retry/Discard strip, when to refresh" product rule lives in
  `:feature:stories`); single source of truth (reuses the durable outbox +
  `OutboxRepository.retry`, no second queue/cache); Instant-App (failed state derived
  from the durable outbox, survives process death, no spinner); UDF + immutable
  `UiState`, pure presentation; colour/UX coherence (error-token strip, explicit
  Retry/Discard = no dead end). Surpasses iOS (durable failure recovery vs silent
  evaporation).

### 2026-06-27 — slice `story-composer-optimistic-tray` ✅
- **Branch:** `claude/apps/android/story-composer-optimistic-tray`
- **Housekeeping:** no open Android PR to land first (`list_pull_requests` open set
  has none on an `apps/android` branch). Branched off latest `origin/main`.
- **What:** makes the story tray **optimistic** off the durable outbox. A publish
  queued by the composer now shows **instantly** as a `pending_*` self-ring,
  derived from the live outbox queue — so it survives process death (the row is
  durable), **rolls back** by itself when the publish exhausts (the row stops
  being surfaced), and **hands off** to the real server story on delivery. This
  surpasses iOS, whose optimistic story is in-memory and evaporates on a kill.
- **Added (production):**
  - `sdk-core` — `PendingStoryPublish` (pure domain: `tempId`, `content`,
    `visibility`, `originalLanguage`, `createdAtMillis`) +
    `StoryRepository.pendingPublishes(): Flow<List<PendingStoryPublish>>`: observes
    `OutboxRepository.observeAll()`, keeps only `PUBLISH_STORY` rows in a **live**
    state (`PENDING`/`INFLIGHT` — exhausted = rolled back, deleted = delivered),
    and decodes each `CreateStoryRequest` payload, skipping blank/undecodable rows.
    This is the queue-semantics **building block**.
  - `feature:stories` — pure `StoryOptimisticTray` (`pendingStories(publishes, self)`
    → synthetic self-authored `STORY` `ApiPost`s, `isViewedByMe=true`, enqueue-time
    `createdAt`; `merge(cached, pending)` appends pending after the cached feed,
    de-duping by id). This is the **product rule** ("render a queued publish as the
    signed-in user's newest story"). `StoriesViewModel` now `combine`s
    `storiesStream` with `pendingPublishes`, merges the synthetics before
    `toStoryGroups` → `StoryTrayBuilder` (one code path, self ring), and **refreshes**
    when a publish vanishes from the queue (delivered → pull the real story in so
    the optimistic ring hands off without waiting for the next background sync).
- **Tests (+20):**
  - `StoryOptimisticTrayTest` (pure) +11 — self-null → none; empty → none; publish
    → self-authored STORY post (id/type/content/visibility/lang/author); marked
    viewed-by-me; enqueue time → `createdAt`; multiple map in order; `merge` no-pending
    passthrough / append-after-cached / drop-id-already-cached / empty-cache.
  - `StoryRepositoryTest` (sdk-core, Robolectric) +6 — `pendingPublishes` decodes a
    queued publish; excludes an **exhausted** row (rollback); ignores non-publish
    rows; skips blank content; skips an undecodable payload without crashing;
    surfaces each independent publish.
  - `StoriesViewModelTest` +4 — a queued publish injects the self ring; merges with
    the user's server stories into one ring (count 2); a logged-out tray stays empty;
    a publish that **vanishes** refreshes once (hand-off); a still-pending publish
    does **not** refresh. (Existing 6 tests updated for the new `pendingPublishes`/
    `currentUser` stubs, all green.)
- **Edge cases covered:** empty/single collections; null self (logged out → nothing
  optimistic); exhausted publish (rollback, no ring); blank/undecodable payload
  (failure path, no crash); id-collision de-dup on merge; idempotent (still-pending
  → no spurious refresh); delivery hand-off (vanished → exactly one refresh);
  no refresh on first emission (empty → empty).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:sdk-core` + `:feature:stories` `testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API (VM `state`, repo `Flow`, pure object), no tautologies; SDK purity
  (the outbox-decoding `pendingPublishes` building block lives in `:sdk-core`; the
  "render as a self ring / when to refresh" product rule lives in
  `:feature:stories`); single source of truth (reuses the durable outbox,
  `toStoryGroups`, `StoryTrayBuilder`, `LanguageResolver` — no second queue/cache);
  Instant-App (optimistic ring with no spinner, durable across process death);
  UDF + immutable `UiState`, pure object; colour/UX coherence (the synthetic flows
  through the existing accent-coherent tray builder, lands in the self ring entry
  point, no dead end). Surpasses iOS (durable-outbox optimism vs in-memory).

### 2026-06-26 — slice `story-composer` ✅
- **Branch:** `claude/apps/android/story-composer`
- **Housekeeping:** no open Android PR to land first (checked `list_pull_requests`
  — 22 open PRs, none `apps/android`). Branched off latest `origin/main`.
- **What:** the **text story composer + publish flow**. A user taps the tray's
  add-story affordance, types a story, picks an audience, and shares; the publish
  is enqueued on the **shared durable outbox** and delivered in the background by
  `OutboxFlushWorker`. Optimistic: the composer dismisses the instant the row is
  queued. Surpasses iOS, which uses a bespoke `StoryPublishQueue` — Android reuses
  the proven outbox (FIFO lanes, coalescing skip for publishes, ×5 retry/exhaust,
  WorkManager drain on reconnect), so a publish survives process death / offline
  and never head-of-line-blocks message sends.
- **Added (production):**
  - `feature:stories` — pure `StoryComposerDraft` (`StoryVisibility{PUBLIC,FRIENDS,
    COMMUNITY,PRIVATE}` with `.wire`; `trimmedText`, `isWithinLimit`@`MAX_CHARS=5000`,
    `charactersRemaining`, `canPublish`, immutable `withText`/`withVisibility`,
    `toCreateStoryRequest(originalLanguage)` mapping); `StoryComposerViewModel`
    (immutable `StoryComposerUiState` + derived `canPublish`; `onTextChange`/
    `onVisibilityChange`; re-entrancy-guarded `publish()` → resolves the Prisme
    publish language from the session via `LanguageResolver`, `enqueuePublish`,
    kicks `OutboxFlushWorker`, clears the draft, emits a one-shot `published`
    signal; failure → error + draft preserved; `CancellationException` rethrown);
    `StoryComposerScreen` (Material3 Scaffold, char-counter `OutlinedTextField`,
    accent `FilterChip` visibility row, dismiss-on-`published`) — Composable glue.
  - `sdk-core` — `OutboxKind.PUBLISH_STORY` + `OutboxLanes.STORY`;
    `StoryRepository.enqueuePublish(CreateStoryRequest)` (serializes + enqueues on
    the `story` lane, fresh `pending_<uuid>` targetId per publish, no coalescing);
    `OutboxFlushWorker` injects `PostApi` + drains the `story` lane with a
    `PUBLISH_STORY` sender (`json → postApi.createStory`, transient/permanent map).
  - `:app` — route `story_composer` (collision-free vs `story/{userId}`) wired to
    the tray's `onAddStory`; `StoryComposerScreen` destination.
  - Strings `stories_composer_*` / `stories_visibility_*` in en/fr/es/pt.
- **Tests (+24):**
  - `StoryComposerDraftTest` (pure) +13 — empty/blank can't publish; non-blank can;
    whitespace trimmed; at-limit ok vs over-limit blocked; `charactersRemaining`
    counts down + goes negative; `withText`/`withVisibility` immutability; default
    visibility PUBLIC; `toCreateStoryRequest` mapping (trimmed content, STORY type,
    wire visibility, language, null media); every visibility's wire value.
  - `StoryComposerViewModelTest` +8 — text/visibility intents update state; blank
    can't publish; publish enqueues exactly one + kicks the worker + emits
    `published`; language resolved from session (`es`) and fallback `fr` when no
    user; draft cleared + flag down on success; blank publish is a no-op (0
    enqueue/worker); re-entrancy guard = 1 enqueue; queue-throws → error surfaced,
    flag down, draft preserved.
  - `StoryRepositoryTest` +3 — `enqueuePublish` persists one `PUBLISH_STORY` row on
    the `story` lane; payload round-trips the `CreateStoryRequest`; two publishes
    stay independent (no coalescing).
- **Edge cases covered:** empty/blank/whitespace draft; char-limit boundary
  (5000 ok / 5001 blocked) + negative remaining; absent session user → `fr`
  fallback; re-entrancy while in-flight; durable-queue failure → graceful error
  with draft kept for retry; independent publish rows; cancellation-safe scope.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m11s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:feature:stories` + `:sdk-core` `testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the pure publish-gate + wire mapping
  live in `:feature:stories`; the durable `enqueuePublish` building block + worker
  sender live in `:sdk-core`; the "when to publish" rule is the ViewModel's);
  single source of truth (Prisme language via `LanguageResolver`, reuses the
  existing `CreateStoryRequest`/`PostApi.createStory` + the shared outbox, no
  second queue); Instant-App (optimistic dismiss on queue, no blocking spinner);
  UDF + immutable `UiState`, pure draft; colour/UX coherence (accent chips,
  natural tray entry point, dismiss returns to the list — no dead end). Surpasses
  iOS (shared durable outbox vs bespoke queue).

### 2026-06-23 — slice `story-autoadvance-media-gate` ✅
- **Branch:** `claude/apps/android/story-autoadvance-media-gate`
- **Housekeeping:** closed PR #877 (`claude/wonderful-goldberg-8xtr6s`,
  conversation swipe pin/mute/archive) as **superseded** — `main` already carries
  a more complete implementation (`togglePin/toggleMute/toggleArchive`,
  `set{Pinned,Muted,Archived}Optimistic` + `UPDATE_CONVERSATION_PREFS`,
  `SwipeToDismissBox` + long-press menu, plus mark-read and pinned/muted row
  badges the PR lacked). That branch was also far behind `main` (ancient
  merge-base); re-merging would regress unrelated areas. Nothing needed to land.
- **What:** gates the story viewer's 5s auto-advance countdown on actual
  media-load readiness — closing the loop the prefetch window opened. A slow
  image can no longer auto-advance before it has painted. Surpasses iOS, which
  starts its timer on slide appearance regardless of paint state.
- **Added (production):**
  - `feature:stories` — pure `StoryAutoAdvanceGate.shouldCountdown(slide,
    resolvedImageUrls)`: `null` slide → no countdown; text-only slide (no image)
    → count down at once; image slide → count down only once its URL is in the
    resolved set (a load **or** error resolves it, so the viewer never hangs).
  - `StoryViewerViewModel` — `resolvedImageUrls` set + `onImageResolved(url)`
    (re-emits only when the just-resolved URL is the current slide's image; off-
    screen prefetch resolutions are recorded silently); `StoryViewerUiState
    .canAutoAdvance` derived in `emit()` via the gate.
  - `StoryViewerScreen` (exempt Composable glue) — `AsyncImage`
    `onSuccess`/`onError` → `viewModel.onImageResolved(url)`; the countdown
    `LaunchedEffect` now keys on `state.canAutoAdvance` and holds progress at
    empty (`snapTo(0f)`, early return) until the gate opens.
- **Tests (+9):**
  - `StoryAutoAdvanceGateTest` (pure) +4 — null slide → false; text-only → true;
    image waits then opens on resolve; a different resolved URL doesn't unblock.
  - `StoryViewerViewModelTest` +5 — text-only slide can auto-advance immediately;
    image slide blocked until `onImageResolved`; off-screen resolution leaves the
    current gate closed; advancing to a new image slide re-closes the gate until
    resolved; revisiting an already-resolved image keeps the gate open.
- **Edge cases covered:** null/empty slide; text-only vs image; first-load
  blocked; resolve-other-url inert for current; slide transition re-closes gate
  (no carry-over readiness for a fresh URL); back-navigation to a resolved slide
  stays open (no re-wait); idempotent resolve (set add guard).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 3m22s**
  (full `assembleDebug` + all module JVM unit tests). Targeted
  `:feature:stories:testDebugUnitTest` → gate 4/4, viewer-VM 29/29 green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the "when may the countdown run /
  what counts as ready" product rule is a pure unit in `:feature:stories`, not
  the SDK; the screen only reports resolution + reads the flag); single source of
  truth (reuses the existing `StorySlideView`/`StoryPlayback`; no second cache —
  readiness is derived from the live `AsyncImage` callbacks); Instant-App
  (proactive: never skips an unpainted image, complements the prefetch window);
  UDF + immutable `UiState`, pure gate; colour/UX coherence (progress bar holds
  at empty while waiting, no jarring skip); no dead end. Surpasses iOS.

### 2026-06-23 — slice `story-media-prefetch` ✅
- **Branch:** `claude/apps/android/story-media-prefetch`
- **What:** **adjacent-slide media prefetch** for the story viewer — warm the
  next slides' images into the shared Coil cache so they paint instantly
  (Instant-App: "no spinner for media we could have prefetched"). Surpasses iOS,
  which preloads only the single immediate next item; Android warms a sliding
  window of the next N distinct image-bearing slides, continuing across author
  groups.
- **Added (production):**
  - `feature:stories` — pure `StoryPrefetchPlanner.plan(playback, lookahead=2)`:
    returns the next up-to-N **distinct** image URLs strictly ahead of the
    current slide, in forward viewing order (remaining-in-current-group then
    later groups flattened), skipping text-only slides; empty when dismissed,
    no groups, non-positive lookahead, or at the last slide of the last group.
  - `StoryViewerUiState.prefetchUrls` derived in `StoryViewerViewModel.emit()`
    from the live `StoryPlayback` via the planner.
  - `StoryViewerScreen` — a `LaunchedEffect(state.prefetchUrls)` enqueues each
    URL through `context.imageLoader` (the same singleton `AsyncImage` uses, so
    the warmed entry is reused) — exempt Composable glue.
- **Tests (+12):**
  - `StoryPrefetchPlannerTest` (pure) +10 — immediate-next; lookahead window in
    order; group-boundary continuation; skip text-only; dedupe repeated URLs;
    empty at last-slide-last-group; empty when dismissed; empty when no groups;
    empty for non-positive lookahead (0 and negative); fewer-than-lookahead when
    not enough remain.
  - `StoryViewerViewModelTest` +2 — `prefetchUrls` warms the current author's
    upcoming images on load; shrinks to empty as the viewer advances to the end.
- **Edge cases covered:** empty/single collections; boundary (last slide of last
  group → nothing ahead); group roll-over; idempotent/inert (dismissed →
  empty); text-only slides skipped; dedupe; non-positive lookahead guard;
  fewer-than-window remaining.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m45s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:feature:stories:testDebugUnitTest` (planner + VM) green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the "which images to warm / how far
  ahead / when nothing" product rule is a pure unit in `:feature:stories`, not
  the SDK; the screen only enqueues); single source of truth (reuses the shared
  Coil `ImageLoader`, no second cache; URLs derived from the existing
  `StoryPlayback`/`StorySlideView`); Instant-App (proactive cache warming, no new
  blocking spinner); UDF + immutable `UiState`, pure planner; no dead end.
  Surpasses iOS (windowed cross-group prefetch vs single-next).

### 2026-06-23 — slice `story-tray-count-dots` ✅
- **Branch:** `claude/apps/android/story-tray-count-dots`
- **What:** the **segmented unviewed-count dots** under each multi-story tray ring —
  parity with iOS `storyCountDots`, surpassing it: where iOS dims every dot
  uniformly on a group-level `hasUnviewed` flag, Android resolves the *precise*
  number of unseen stories and activates only the trailing unviewed dots, so the
  indicator reads as "how many new" at a glance.
- **Added (production):**
  - `feature:stories` — pure `StoryCountDots` (`from(storyCount, unviewedCount)`:
    `null` for ≤1 story; dot count capped at `MAX_DOTS=5` with `hasOverflow` flag;
    `isActive(index)` marks the trailing `unviewedCount` dots active, clamped to
    `[0, dotCount]`, inert for out-of-range indices).
  - `StoryRing.unviewedCount` (computed in `StoryTrayBuilder` from
    `stories.count { !it.isViewed }`) — the per-story `isViewed` data iOS's tray
    ring doesn't surface.
  - `StoryTray` — `StoryCountDotsRow` composable: accent-tinted active dots, muted
    `textSecondary@35%` inactive dots, trailing "+" on overflow, hidden+weightless
    for single-story rings; an accessibility `contentDescription`
    (`stories_count_dots` "N new of M stories", en/fr/es/pt).
- **Tests (+13):**
  - `StoryCountDotsTest` (pure) +12 — empty→null; single→null; all-viewed inactive;
    all-unviewed active; partial→trailing active; exactly-5 no overflow; >5 caps+overflow;
    overflow keeps trailing-active; unviewed clamped to all-active; negative→none;
    unviewed > count never over-activates; `isActive` inert out-of-range.
  - `StoryTrayBuilderTest` +1 — `unviewedCount` counts only unseen stories (mixed
    viewed/unviewed group); existing "ring carries unviewed state" tightened to assert
    `unviewedCount`.
- **Edge cases covered:** 0/1-story (no dots); all-viewed vs all-unviewed; partial
  view (trailing activation); exactly-cap (5) vs overflow (>5); defensive clamps
  (negative unviewed, unviewed > count); out-of-range `isActive`.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m44s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted
  `:feature:stories:testDebugUnitTest` green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (the "how many dots / which active / when
  hidden" presentation rule is a pure unit in `:feature:stories`, not the SDK);
  single source of truth (accent via `accentHex`/`hexColor`, muted token via
  `MeeshyTheme.tokens`); Instant-App (no new I/O — derived from the already-cached
  tray); colour/UX coherence (accent-coherent dots, weightless when irrelevant);
  no dead end. Surpasses iOS (precise per-count activation vs group-level dimming).

### 2026-06-23 — slice `story-comments-overlay` ✅
- **Branch:** `claude/apps/android/story-comments-overlay`
- **What:** the **comments overlay** on the open story — parity with iOS
  `StoryCommentsView` + `StoryInteractionService` comments, surpassing it with
  Instant-App discipline (cold-only skeleton, stale-kept refresh) and **optimistic
  posting** (instant Pending row → server-ACK swap → Failed + tap-to-retry; iOS
  posts fire-and-forget), plus realtime `comment:added` deltas appended live.
- **Added (production):**
  - `core:model` — `StoryComment` domain + `StoryCommentStatus {Pending,Sent,Failed}`
    + pure `ApiPostComment.toStoryComment(prefs)` mapper: Prisme-resolved body
    (Rule 1 — original on no preferred-language match), author name display→username
    fallback (blank-guarded), blank avatar→`null`, wire comments always `Sent`.
  - `core:network` — `StoryApi.comments(id, cursor, limit)` → `GET posts/{id}/comments`.
  - `sdk-core` — `StoryRepository.comments(storyId, cursor, limit)`.
  - `feature:stories` — pure `StoryCommentsReducer` (`merged` server-page fold:
    dedupe-by-id, oldest-first, keep in-flight optimistic rows at tail; `posting`;
    `confirmed` clientId→server swap with echo-already-present de-dup + unknown-id
    append/inert; `failed` mark; `received` socket append deduped by id);
    `StoryCommentsViewModel` (Instant-App load + optimistic post/retry + filtered
    `commentAdded` collection); `StoryCommentsSheet` (`ModalBottomSheet`: count
    title, comment rows with dimmed-pending + tap-to-retry-failed, accent-tinted
    input + send, `imePadding`). Wired into `StoryViewerScreen` via a comment
    `IconButton` (everyone, gated on `currentStoryId`); the auto-advance timer
    pauses while the sheet is open. Strings `stories_comments_*` in en/fr/es/pt.
- **Tests (+39):**
  - `StoryCommentMappingTest` (core:model, pure) +8 — preferred-language
    translation applied / no-match keeps original / blank-translation keeps
    original; displayName preferred / blank→username / null author→empty;
    blank avatar→null; mapped always Sent + non-optimistic.
  - `StoryCommentsReducerTest` (feature, pure) +16 — `merged` empty/sort/dedupe/
    keep-pending-tail/drop-once-server-delivers/null-createdAt-sinks; `posting`
    appends; `confirmed` swap / echo-present-drop-dup / unknown-append /
    unknown-inert-when-present; `failed` mark / unknown-inert; `received`
    append / inert-when-present / into-empty.
  - `StoryCommentsViewModelTest` (feature) +15 — cold success oldest-first;
    empty→isEmpty; cold failure→error; cold exception→message; refresh-failure
    keeps list no error; cold skeleton→list (Turbine); re-entrancy = 1 repo call;
    optimistic Pending→Sent on ACK; failure→Failed; blank ignored (0 repo calls);
    retry failed→Sent; retry unknown inert; socket this-story appends; socket
    other-story ignored; socket echo of shown comment deduped.
- **Edge cases covered:** empty/single lists; null createdAt sort; cold vs warm
  (refresh) load; cold failure vs refresh failure (keep stale); exception
  (non-cancellation) path; re-entrant load; optimistic post + rollback-to-Failed
  + retry; blank/whitespace post (no-op); own-echo de-dup (socket-before-ACK and
  ACK-before-socket both converge, no dup); foreign-story socket ignored;
  Prisme Rule-1 original-on-no-match; blank wire fields.
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m55s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted:
  `:core:model`, `:sdk-core`, `:feature:stories` testDebugUnitTest all green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (domain model + Prisme mapper + repository
  method are building blocks in `core:model`/`core:network`/`sdk-core`; the
  "merge/reconcile/when-skeleton/optimistic" product rules live in
  `:feature:stories`'s `StoryCommentsReducer`/`StoryCommentsViewModel`); single
  source of truth (Prisme via `LanguageResolver`, avatar colour via
  `DynamicColorGenerator`, accent via `accentHex`); Instant-App (cold-only
  skeleton, stale-kept refresh, optimistic post); UDF + immutable `UiState`, pure
  reducer; no dead end (button → sheet → dismiss returns to a coherent viewer,
  timer paused while open).

### 2026-06-23 — slice `story-tray-swr` ✅
- **Branch:** `claude/apps/android/story-tray-swr`
- **What:** gave the story tray a **Room-backed stale-while-revalidate** backing,
  porting the proven `ConversationCacheSource` pattern so the tray is genuinely
  cache-first (Instant-App): on a warm start it paints from Room before any
  network call (survives process death — surpassing the in-memory Feed cache),
  and the cold skeleton shows ONLY on a truly empty / still-dataless cache.
- **Added (production):**
  - `core:database` — `StoryEntity` (`id`/`payload`/`createdAt`/`cachedAt`) +
    `StoryDao` (`observeAll` ordered `createdAt DESC`, `upsertAll`, `deleteNotIn`,
    `clear`); registered in `MeeshyDatabase` (**version 4 → 5**, destructive
    migration is already configured) + `DatabaseModule.providesStoryDao`.
  - `sdk-core` — `StoryCacheSource` (internal `SwrCacheSource<List<ApiPost>>`,
    mirror of `ConversationCacheSource`: cold `null` vs synced-empty list, persist
    in a single `withTransaction`, `sync_meta` key `"stories"`); `CachePolicy.Stories`
    (fresh 1 min / keep 24 h — matches the story lifetime); `StoryRepository`
    gains `database`/`storyDao`/`syncMetaDao` deps + `storiesStream(policy,
    onSyncError)` + `refresh()`.
  - `feature:stories` — pure `StoryTrayReducer` (`stories()` keeps the stale list
    on a valueless `Syncing`; `flags()` = the cold-skeleton/sync discipline);
    `StoriesViewModel` rewired to consume `storiesStream` (was a one-shot
    `list()`), exposes `isSyncing`/`showSkeleton` + `refresh()`; `StoryTray`
    renders a `StoryTraySkeleton` row only on `showSkeleton` over an empty tray.
- **Tests (+22):**
  - `StoryDaoTest` (new, Robolectric) +5 — `createdAt DESC` order, cold-empty,
    upsert-replace by PK, `deleteNotIn`, `clear`.
  - `StoryRepositoryTest` (rewritten to Robolectric + in-memory DB) +5 — cold
    `Empty` first emission, refresh persists rows + `sync_meta`, refresh prunes
    absent rows, refresh serves `Fresh` after sync, refresh throws
    `StorySyncException` with the API message (kept the 3 `viewers()` tests).
  - `StoryTrayReducerTest` (new, pure) +11 — every `stories()` arm (Fresh/Stale/
    Syncing-value/Syncing-null-fallback/Empty) and every `flags()` arm
    (Fresh/Stale/Syncing-null±data/Syncing-value/Empty).
  - `StoriesViewModelTest` (new) +6 — cold `Empty` → skeleton; `Fresh` builds
    tray + clears skeleton; own story → self ring; `Stale` keeps tray + syncing;
    `Syncing(null)` → skeleton; background sync error clears the cold skeleton.
- **Edge cases covered:** cold vs warm cache; synced-empty (real empty list) vs
  cold-null; stale-kept list on a valueless `Syncing`; background revalidation
  failure → skeleton cleared (no infinite spinner); row pruning across syncs;
  own vs foreign author placement; expired-story filtering exercised via the
  builder (live `Instant.now()` fixtures).
- **Verify:** `./apps/android/meeshy.sh check` → **BUILD SUCCESSFUL in 2m32s**
  (full `assembleDebug` + all module JVM unit tests; 836 tasks). Targeted:
  `:core:database`, `:sdk-core`, `:feature:stories` testDebugUnitTest all green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests through the
  public API, no tautologies; SDK purity (Room entity/DAO + `StoryCacheSource` +
  `storiesStream` are building blocks in `core:database`/`sdk-core`; the
  "keep-stale / when-skeleton" product rule lives in `:feature:stories`'s
  `StoryTrayReducer`); single source of truth (one Room DB; reused
  `cacheFirstFlow`/`SwrCacheSource`/`CachePolicy`; tray colours via the existing
  `StoryTrayBuilder`/`DynamicColorGenerator`); Instant-App (cold-only skeleton,
  warm paint from cache, silent background SWR); UDF + immutable `UiState`, pure
  reducer; no dead end (skeleton → tray, dismiss/refresh coherent).

### 2026-06-23 — slice `story-viewers-sheet` ✅
- **Branch:** `claude/apps/android/story-viewers-sheet`
- **What:** the author-only **who-viewed sheet** for a story — parity with iOS
  `StoryViewersSheet` + `StoryInteractionService.loadViewers`, surpassing it with
  most-recent-first ordering, blank-field hardening and Instant-App SWR behaviour.
- **Added (production):**
  - `StoryViewer` (domain) + `StoryViewersResponse`/`StoryViewerWire` (wire) +
    pure `StoryViewerWire.toStoryViewer()` in `core/model` — wire shape mirrors
    iOS `StoryViewersWireResponse` (`{ viewers: [{id, username, displayName?,
    avatarUrl?, viewedAt?, reaction?}] }`). The mapper falls back display name to
    username on null **or blank** (iOS only nil-checks) and collapses blank
    avatar/reaction/viewedAt to `null`.
  - `StoryApi.viewers(id)` → `GET posts/{id}/interactions`; `StoryRepository
    .viewers(storyId): NetworkResult<List<StoryViewer>>` (apiCall + `.map` of the
    wire list through `toStoryViewer()`).
  - `StoryViewersPresentation.order()` (`:feature:stories`, pure) — most-recent
    first (ISO `viewedAt` desc, nulls sink last, stable for ties), defensive
    dedup-by-id keeping the most-recent row. (iOS renders raw gateway order.)
  - `StoryViewersViewModel` — `load(storyId)` with Instant-App discipline:
    skeleton only on a cold empty load, a refresh keeps the existing list on
    screen and **swallows** a refresh failure, an error surfaces only on a cold
    failure; re-entrancy-guarded against a duplicate in-flight load for the same id.
  - `StoryViewersSheet` (`ModalBottomSheet`) — accent-coherent title/count,
    avatar rows (`MeeshyAvatar` + `DynamicColorGenerator.colorForName`), distinct
    loading / empty / error states. Reachable via an **author-only** "Views"
    button added to `StoryViewerScreen`'s top bar (gated on `isOwnStory &&
    currentStoryId != null`); the auto-advance timer pauses while the sheet is open.
  - `StoryViewerUiState` gains `isOwnStory` + `currentStoryId`, derived in `emit()`
    from `playback.currentGroup?.userId == currentUserId` and the current slide id.
  - Strings (`stories_viewers_*`, `stories_viewer_open_viewers`) in en/fr/es/pt.
- **Tests (+22):**
  - `StoryViewerMappingTest` +6 (display-name present / null-fallback / blank-fallback;
    blank avatar+reaction → null; all-present passthrough; blank viewedAt → null).
  - `StoryRepositoryTest` (new) +3 (wire→domain mapping incl. displayName default;
    empty payload → empty list; network error → Failure).
  - `StoryViewersPresentationTest` +6 (recent-first sort; nulls last; null-tie input
    order preserved; dedup keeps most-recent; empty; single unchanged).
  - `StoryViewersViewModelTest` +7 (ordered success; empty → isEmpty no error; cold
    failure → error; cold exception → message; refresh failure keeps list no error;
    cold skeleton→list; re-entrancy guard = 1 repo call).
  - `StoryViewerViewModelTest` +2 (`currentStoryId` tracks the visible slide;
    `isOwnStory` true only on the current user's own group).
- **Edge cases covered:** empty/single/duplicate viewer lists; null & blank wire
  fields; null timestamps; cold vs warm (refresh) load; cold failure vs refresh
  failure (keep stale); exception (non-cancellation) path; re-entrant load; own
  vs foreign group authorship; absent current story id.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full
  `assembleDebug` + all module JVM unit tests). Targeted: `:core:model`,
  `:sdk-core`, `:feature:stories` testDebugUnitTest all green.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (wire model + mapper + repository method = building
  blocks in `core/model`/`sdk-core`; the "order most-recent-first / when to show
  skeleton vs keep stale / author-only affordance" product rules live in
  `:feature:stories`); single source of truth (avatar colour via
  `DynamicColorGenerator`, accent via `accentHex`); Instant-App (cold-only
  skeleton, stale-kept refresh); UDF + immutable `UiState`; no dead end (button →
  sheet → dismiss returns to a coherent viewer).

### 2026-06-23 — slice `story-reaction-socket-delta` ✅
- **Branch:** `claude/apps/android/story-reaction-socket-delta`
- **What:** wired the realtime `story:reacted` / `story:unreacted` Socket.IO events
  into the open story viewer so other users' reactions move the live count. The
  pure `StoryReactionState.applyDelta` reducer (shipped earlier) already encoded
  the reconciliation; this slice connects the socket → reducer → UI loop.
- **Added (production):**
  - `SocketStoryReactedData` / `SocketStoryUnreactedData` (`core:model`,
    `{storyId, userId, emoji}` — parity with `packages/shared/types/post.ts`
    `StoryReactedEventData`/`StoryUnreactedEventData` and iOS `SocketStoryReactedData`).
  - `SocialSocketManager` — `storyReacted` / `storyUnreacted` `SharedFlow`s +
    `listen("story:reacted"/"story:unreacted")` in `attach()`, mirroring the
    existing `storyCreated`/`storyViewed` wiring.
  - `StoryViewerViewModel` — injects `SocialSocketManager`, collects both flows in
    `init`, and folds each into `reactionStates` via `onReactionDelta(storyId,
    emoji, delta, actorId)`: `+1`/`-1`, `isOwn = actorId == currentUserId`,
    seeding a non-current slide's base count from `playback.groups`, **ignoring**
    unknown story ids and re-emitting only on an actual change. The user's own
    socket echo of an emoji already counted optimistically is a no-op (reducer
    returns `this`), so the optimistic bump from `react()` is never double-counted.
  - `StoryViewerScreen.ReactionStrip` — live total-count badge (renders
    `state.reactionCount` when `>0`) so a *foreign* reaction (count-only change)
    is visible, closing the loop (no dead end).
- **Tests:**
  - `StoryViewerViewModelTest` +5: foreign reacted bumps live; foreign unreacted
    decrements; own echo doesn't double-count after optimistic `react`; a
    non-current slide's delta is stored and shown after navigating to it; unknown
    story id ignored. (Existing 15 stories VM tests still green.)
  - `SocialSocketManagerTest` (new, Robolectric for real `org.json`) +3: reacted
    decode+emit, unreacted decode+emit, malformed payload ignored (no emit).
- **Edge cases covered:** non-current slide, unknown story id (inert), own-echo
  de-dup vs optimistic, decrement path, malformed payload (decode failure → no
  emit), no redundant emit when state unchanged.
- **Verify:** `:feature:stories:testDebugUnitTest` + `:sdk-core:testDebugUnitTest`
  green; full `./apps/android/meeshy.sh check` (assembleDebug + all module unit
  tests) → BUILD SUCCESSFUL.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (the "when to fold a delta / which slide" product rule
  lives in `:feature:stories`; the manager only decodes+forwards); single source
  of truth for the payload shape (mirrors shared TS + iOS); UDF + immutable
  `UiState`, pure reducer; accent-coherent strip; no dead end (count badge surfaces
  foreign deltas).

### 2026-06-22 — slice `story-viewer-swipe-gestures` ✅
- **Branch:** `claude/apps/android/story-viewer-swipe-gestures`
- **What:** wired horizontal/vertical swipe navigation into the story viewer.
  A pure resolver maps an accumulated drag to a navigation intent on the
  **dominant axis**; the ViewModel dispatches it into the existing pure
  `StoryPlayback` engine. Parity with iOS `StoryViewerView` swipes (swipe left =
  next author, right = previous author, down = close).
- **Added (production):**
  - `StorySwipeResolver.kt` — pure `resolve(dragX, dragY, hThreshold, vThreshold)
    → StorySwipeAction{NextGroup,PreviousGroup,Dismiss,None}`. Dominant axis wins
    (`|x|>|y|`), only a downward drag dismisses, sub-threshold travel is `None`
    (a small drift during a tap can't hijack navigation). Thresholds are params
    (Composable supplies them from density) so the decision stays fully testable.
  - `StoryPlayback.dismissed()` — pure transition that closes the viewer,
    preserving position; idempotent once dismissed.
  - `StoryViewerViewModel.onSwipe(action)` — dispatches `NextGroup`/`PreviousGroup`
    → `jumpToNext/PreviousGroup`, `Dismiss` → `dismissed()`, `None` → inert.
  - `StoryViewerScreen` — second `pointerInput` running `detectDragGestures`,
    accumulating drag and calling `onSwipe(StorySwipeResolver.resolve(...))` on end
    (thresholds 64.dp horizontal / 120.dp vertical). Tap gesture untouched.
- **Tests:** +12 `StorySwipeResolverTest` (left/right/down/up, both sub-threshold
  axes, no-movement, horizontal- & vertical-dominant diagonals, inclusive
  boundaries on each axis, horizontal-dominant-but-sub-threshold) ; +2
  `StoryPlaybackTest` (`dismissed` marks live + idempotent) ; +4
  `StoryViewerViewModelTest` (onSwipe NextGroup / PreviousGroup / Dismiss / None).
  Stories test files now: resolver 12, playback 21, viewer-VM 15 — all green.
- **Edge cases covered:** zero drag, sub-threshold on each axis, upward never
  dismisses, diagonal axis arbitration both ways, inclusive thresholds, None is
  inert (state untouched), dismiss preserves slide position, already-dismissed
  idempotent.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full
  `assembleDebug` + all JVM unit tests across modules).
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (the "when a drag becomes a swipe" UX rule lives in
  `:feature:stories`, not the SDK); pure resolver + pure engine transition keep
  all branch logic JVM-testable; UDF + immutable `UiState`; accent-coherent
  viewer, natural gestures, no dead end (dismiss → `onClose`).

### 2026-06-22 — slice `story-viewer-reactions` ✅
- **Branch:** `claude/apps/android/story-viewer-reactions`
- **What:** quick-reaction strip on the story viewer with an **optimistic** count
  and rollback-on-failure (iOS `sendReaction` is fire-and-forget; Android does
  better). Parity with iOS quick emojis + `currentUserReactions`.
- **Added (production):**
  - `StoryReactionState.kt` — pure reducer: `reactedLocally(emoji)` (additive,
    idempotent per emoji), `applyDelta(emoji, delta, isOwn)` (realtime
    `story:reacted`/`unreacted` reconciliation; own-add idempotent vs the
    optimistic count; count clamped ≥0; `mine` set tracks the user's emojis).
  - `StoryViewerViewModel.react(emoji)` — snapshot → optimistic apply → emit →
    `storyRepository.react` → rollback on `Failure`/exception; per-slide state
    map; idempotent repeat taps skip the network. `StoryViewerUiState` gains
    `reactionCount`/`myReactions`/`quickReactions`; `StorySlideView` gains
    `reactionCount` (seeded from `reactionSummary` via `toStoryGroups`).
  - `StoryViewerScreen` `ReactionStrip` — accent-coherent emoji row over the nav
    bar (`EmojiCatalog.defaultQuickReactions`), selected-emoji highlight, taps
    consumed so they never leak to the advance/back gesture behind it.
- **Tests:** +11 `StoryReactionStateTest` (every reducer branch: local add /
  idempotent / distinct emoji / others' add / own-add idempotent / own-add
  un-optimistic / removal own & others / clamp-at-0 / zero-delta inert / empty)
  and +5 `StoryViewerViewModelTest` (optimistic bump+mine+calls repo / failure
  rollback / idempotent twice = 1 network call / per-slide isolation / strip
  exposed). 22 stories tests in the two files green.
- **Edge cases covered:** empty/zero base, idempotent repeat, switch emoji,
  own vs others' deltas, count never negative, zero-delta inert, network failure
  → graceful rollback (`CancellationException` rethrown), per-slide state reset.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL in 5m44s
  (full `assembleDebug` + all JVM unit tests across modules);
  `StoryReactionStateTest` 11/0/0, `StoryViewerViewModelTest` 11/0/0.
- **Reviewer:** PASS — scope `apps/android` only; behavioural tests, no
  tautologies; SDK purity (the "when/how to count optimistically" rule lives in
  `:feature:stories`, not the SDK); UDF + immutable `UiState`; single source of
  truth for emojis (`EmojiCatalog`) and accent visuals; no dead ends.

### 2026-06-22 — slice `story-viewer-playback` ✅ merged-pending
- **Branch:** `claude/apps/android/story-viewer-playback`
- **What:** pure cross-group story-viewer navigation engine + ViewModel/Screen
  rewire so tap-advance rolls between authors and dismisses past the last slide
  (parity with iOS `StoryViewerView`).
- **Added (production):** `StoryPlayback.kt` (`StoryPlayback` + `StoryGroupSlides`,
  pure transitions `advance/back/jumpToNextGroup/jumpToPreviousGroup` +
  `startingAt`). Rewired `StoryViewerViewModel` to load **all** groups and derive
  `UiState` from the engine (added `groupIndex`, `isDismissed`). Rewired
  `StoryViewerScreen` auto-advance/tap to the engine + `isDismissed` → `onClose`.
- **Tests:** +13 (`StoryPlaybackTest`, 22 cases over startingAt/advance/back/
  jumps/derived accessors — every `when` arm incl. inert/boundary) and
  +6 (`StoryViewerViewModelTest`: load-positions, advance roll-over, dismiss-at-end,
  back roll-back, markViewed, failed-load graceful). 35 stories tests green.
- **Edge cases covered:** unknown start user → group 0; empty-slide groups dropped;
  dismiss is inert; back at very first slice is a no-op; oldest-first slide order;
  network failure → `isLoading=false`, not dismissed.
- **Verify:** `./apps/android/meeshy.sh check` → BUILD SUCCESSFUL (full assemble +
  all JVM unit tests across modules).
- **Reviewer:** PASS — scope is `apps/android` only; behavioural tests, no
  tautologies; SDK purity kept (engine in `:feature:stories`, not SDK, since it
  composes app-side `StorySlideView`); UDF + accent-coherent viewer, no dead end.
- **Also (bootstrap):** created `apps/android/tasks/android-routine/{ROUTINE,
  PROGRESS,REVIEWER,TDD-COVERAGE,NOTES}.md`.

## Blocked / risks
- ⚠ **PR #1894 (`settings-open-source-licenses`) merge-blocked on a pre-existing, unrelated gateway CI
  failure.** The monorepo "Test gateway" job fails 3 tests in `services/gateway/.../calls-routes.test.ts`
  (endCall/leaveCall returning `success:false`). The **same job also fails on main's own push CI** (sha
  `6d0b17d`), so main is red independently of this apps/android-only slice. Can't fix without touching
  gateway production logic (out of scope). Held blocked; will squash-merge once main's gateway suite is
  green. Code-complete + locally green (`assembleDebug` + all-module unit tests).
- No Android CI workflow → CI green is the JS/Python monorepo suite; local
  `meeshy.sh check` is the real Android gate. (Follow-up: add Android CI.)
- No Kover/Jacoco gate wired → coverage is a discipline (see `TDD-COVERAGE.md`).
