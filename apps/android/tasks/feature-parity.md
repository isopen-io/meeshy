# Meeshy Android — Feature Parity Tracker

Master checklist for the **native Android rebuild** of the Meeshy iOS app
(`apps/ios` + `packages/MeeshySDK`, 673 Swift production files / ~185 700 LOC).

This file is the **anti-omission mechanism**: nothing ships as "done" until its
box is checked here **and** verified. It is rebuilt from the integral
file-by-file audit — every one of the 673 iOS files was read in full.

## Source of truth

- `tasks/audit/part-01.md` … `part-23.md` — integral file-by-file audit
  (purpose, public API, behaviours, dependencies, Android-port note per file).
- `ARCHITECTURE.md` — the target Android architecture (modules, layers, SWR,
  offline, performance, design system, security).
- `decisions.md` — architectural decision records.
- The old `inventory-screens.md` / `inventory-sdk.md` / `inventory-crosscutting.md`
  were the pre-full-read drafts; the `audit/` folder supersedes them.

## Tech mapping (iOS → Android)

| iOS | Android |
|-----|---------|
| SwiftUI | Jetpack Compose (Material 3) |
| MVVM + `@Published` / `ObservableObject` | `ViewModel` + `StateFlow<UiState>` (UDF) |
| MeeshySDK / MeeshyUI dual target | `:sdk-core` / `:sdk-ui` modules (`explicitApi()`) |
| App screens | `:feature:*` modules |
| Combine `PassthroughSubject` | Kotlin `SharedFlow` |
| `async/await`, `Task`, actors | Coroutines, `Flow`, dispatcher-confined classes |
| URLSession / app-layer `APIClient` | Retrofit + OkHttp (one client) |
| Socket.IO Swift (×2, long-polling) | `socket.io-client-java` (×2, long-polling) |
| GRDB + `CacheCoordinator` (dual store) | **single** Room DB (source of truth) |
| `CacheResult` / `CacheFirstLoader` | `CacheResult` sealed class + `cacheFirstFlow {}` |
| `OfflineQueue` / `OutboxFlusher` / `OutboxDispatcher` | Room `outbox` table + `WorkManager` |
| Keychain (per-user) | Android Keystore + `EncryptedSharedPreferences` |
| WhisperKit (on-device ASR) | translator service ASR (on-device later, optional) |
| WebRTC iOS + CallKit + PushKit | `stream-webrtc-android` + Telecom/`ConnectionService` + FCM data |
| AVFoundation / CoreImage / Metal / CALayer | Media3 (`Transformer`/`ExoPlayer`) + Compose Canvas + `RenderEffect` |
| PencilKit | custom point/stroke ink model (cross-platform JSON) |
| Firebase iOS | Firebase Android (FCM, Crashlytics, Performance) |
| `iPadRootView` two-column | `NavigableListDetailPaneScaffold` (WindowSizeClass) |

## Verification gates (no emulator in this environment)

- Compile gate: `./meeshy.sh build`
- JVM unit tests: `./meeshy.sh test` — ViewModels, repositories, SWR, state
  machines, pure logic (TDD: red → green → refactor).
- Charte graphique fidelity: Roborazzi screenshot tests (render Compose on JVM).
- Live integration vs gateway: `atabeth` test account.

---

## Phase 0 — Project setup `[done]`
- [x] Android SDK, Gradle multi-module (`:app`, `:sdk-core`, `:sdk-ui`), version catalog
- [x] Gradle wrapper, AGP, Kotlin 2.x, Compose, `meeshy.sh` build helper
- [x] App compiles to a debug APK
- [x] `minSdk 26`, `targetSdk 35`

## Phase 1 — Integral audit `[done]`
- [x] Full read of all 673 iOS files → `tasks/audit/part-01..23.md`
- [x] 696 portable capabilities catalogued (this file)
- [x] Architecture observations consolidated → `ARCHITECTURE.md`, `decisions.md`

## Phase 2 — Module + architecture setup `[next]`
- [x] `ARCHITECTURE.md` reviewed by a SOTA peer audit (`tasks/architecture-review.md`)
- [x] Module graph: `:core:{common,model,network,database,datastore,crypto,navigation}`,
      `:sdk-core`, `:sdk-ui`, `:feature:{auth,conversations}`, `:app` — build + tests green
- [x] Hilt DI graph (replaces manual `AppContainer`); `NetworkModule`, `DispatchersModule`
- [ ] `build-logic/` convention plugins + enforced dependency rules
- [ ] Remaining `:feature:*` modules created with their slices (Phase 5)
- [ ] Dispatcher injection wired into ViewModels; `Result`/error model
- [ ] Type-safe Navigation-Compose graph + `NavigableListDetailPaneScaffold`
- [ ] Observability bootstrap (Crashlytics, ANR, structured logging w/ redaction,
      remote config / feature flags) — ADR-022
- [ ] CI/CD bootstrap (lint/detekt, screenshot gate, macrobenchmark, baseline
      profile generation, Play tracks) — ADR-023

## Phase 3 — SDK foundation (`:sdk-core`)
- [x] Models: `ApiResponse`, `MeeshyUser`/`UserRole`, auth, conversation, message
- [x] `LanguageResolver` — Prisme Linguistique resolution
- [x] `DynamicColorGenerator` — accent color (blend + hue shift + DJB2 palette)
- [x] Networking: `MeeshyConfig`, `EncryptedTokenStore`, `AuthInterceptor`, `apiCall`, Retrofit
- [x] Repositories: `AuthRepository`, `ConversationRepository`, `MessageRepository`
- [x] **SWR engine**: `CacheResult` (4-state incl. `Syncing`) + `CachePolicy` +
      `cacheFirstFlow {}` + `SwrCacheSource` — TDD, 5 tests green
- [x] **SWR backing**: Room DB + `sync_meta` + `ConversationCacheSource` —
      conversation list is genuinely cache-first (skeleton only on cold `Empty`)
- [x] **Outbox model**: `outbox` table + DAO, lanes, `OutboxCoalescer`
      (send+delete / edit-merge / reaction-toggle), device-scoped `cmid`/`cid`
- [ ] **Outbox runtime**: `OutboxRepository` (enqueue+coalesce, boot recovery,
      outcome `SharedFlow`) + `WorkManager` per-lane flusher with ×5 backoff
- [ ] TUS resumable uploads in a **dedicated `WorkManager` chain** (foreground
      progress); message-send items `dependsOn` the upload
- [ ] `MessageStateMachine` (pure) + `PendingId` localId↔serverId reconciliation
- [ ] **Message ordering**: per-conversation `seq` sort key + continuity gap
      detection + server-time offset (ADR-021)
- [ ] Transport spike: WebSocket vs long-polling on Android (ADR-015) →
      Socket.IO wrappers ×2 exposing sealed-class `SharedFlow`s
- [ ] Foreground-socket / background-FCM delivery doctrine
- [ ] `ConversationSyncEngine` — cache-first sync, atomic merge, `seq` gap-fill, bounded fan-out
- [ ] Dual `kotlinx.serialization` config (lenient DTOs / strict crypto+auth)
- [ ] FCM push (notify-then-fetch) + `NotificationCoordinator` authority model
- [ ] **E2EE** — gated behind ADR-018..020: threat model, libsignal pairwise +
      Sender Keys groups, multi-device, fail-closed, call media (DTLS-SRTP + SFrame)
- [ ] SQLCipher-encrypted Room + per-user namespacing + provably complete logout wipe
- [ ] Remaining REST services (≈29) — see `audit/part-17.md`

## Phase 4 — Design system (`:sdk-ui`) — **CHARTE GRAPHIQUE (locked, see ARCHITECTURE.md §Design System)**
- [x] `MeeshyPalette` Indigo scale + semantic colors
- [x] `MeeshyThemeTokens` light/dark + `MeeshyTheme`
- [ ] Typography + spacing + shape + motion tokens
- [ ] Conversation `accentColor` Compose integration (palette propagation)
- [ ] Reusable primitives: avatar, identity bar, buttons, fields, skeletons, toasts,
      swipeable rows, tag input, pickers, progressive image (Coil + ThumbHash)
- [ ] Message Bubble component family (immutable `BubbleContent` + skippable composables)
- [ ] Roborazzi fidelity baseline for every primitive (light + dark)

## Phase 5 — Feature slices (`:feature:*`)
See the per-domain catalogue below. Build order: Auth → Conversations → Chat →
Feed → Stories → Calls → the rest.

## Phase 6 — Integration & final audit
- [ ] Navigation graph + deep links (`meeshy://`, `https://meeshy.me`)
- [ ] Adaptive tablet/foldable layouts verified (list-detail two-pane)
- [ ] Live integration test vs gateway (`atabeth`)
- [ ] Final diff audit: this checklist vs shipped Android — zero unchecked gaps

---

# Feature catalogue (696 capabilities, by domain)

> Each box maps to one or more entries in `tasks/audit/part-*.md`. Check a box
> only when the feature is implemented **and** verified.

## A. Auth & Onboarding
- [ ] Username/password login with saved-account picker (multi-account, one-tap switch)
- [ ] Server environment selector (dev/staging/prod/custom host)
- [ ] Passwordless magic-link login (email + countdown + resend) via deep link
- [ ] 8-step gamified registration wizard (username/email/phone live availability + suggestions)
- [ ] Interactive step progress bar with jump-back to completed steps
- [ ] Phone entry with searchable country-code picker (skippable)
- [ ] First/last name capture; password strength meter + requirements checklist
- [ ] System + regional language selection with live translation preview
- [ ] Profile photo / banner / bio optional step; registration recap + terms acceptance
- [ ] Email verification by 6-digit code (OTP autofill, resend, success animation)
- [ ] Country auto-detection + region→language inference at signup
- [ ] Password recovery via email link
- [ ] Password recovery via phone (lookup → masked-info challenge → SMS code → reset)
- [ ] First-run onboarding carousel with live feature demo + animated step backgrounds
- [ ] Persistent session restore with proactive token refresh
- [ ] Transparent token refresh on 401 with one retry
- [ ] Anonymous (shared-link) sessions with restricted send permissions
- [ ] Login/logout teardown wiping E2EE keys and per-user caches
- [ ] Splash screen with brand animation + minimum display duration

## B. Conversations list
- [ ] Cache-first instant load, cursor-based infinite scroll, pull-to-refresh (branded)
- [ ] Sectioned list with collapsible user categories + pinned section + drag-to-category
- [ ] Filtering (all/unread/personal/private/open/global/channels/favorites/archived) + search overlay
- [ ] Communities carousel + category filter chips
- [ ] Pinned / muted / locked / archived / favorited (emoji) states
- [ ] Swipe actions (pin, mute, lock, archive, mark read/unread, block, hide)
- [ ] Context menu (pin, mute, mark read, details, invite, favorite, move, lock, archive, block, delete)
- [ ] Hard-press conversation preview popover
- [ ] Conversation row: activity-heat background, dynamic tag overflow, rich last-message
      preview (ephemeral/expired/hidden/view-once/draft/typing), unread badge, presence/story-ring/mood
- [ ] Draft-aware ordering (drafts float to top); bump-to-top on send/receive
- [ ] Cold-start skeletons + error-with-retry empty state
- [ ] Connection-health banner (offline / disconnected / syncing / connected)
- [ ] Conversation category create + expand/collapse; client-side tag aggregation for autocomplete
- [ ] Create direct/group conversation via user search; add participants
- [ ] Story tray + per-conversation story rings
- [ ] In-app dashboard ("Tableau de bord"): unread count, recent conversations, link stats, quick actions

## C. Chat / Messaging
- [ ] Real-time 1:1 / group chat: send, edit, delete (for-me / for-everyone, 2h window), reply, forward
- [ ] Optimistic send with in-place server-ACK upgrade (no flicker) + `clientMessageId` reconciliation
- [ ] Inverted message list, date section headers, joined banner, unread separator, E2EE disclaimer
- [ ] Pagination of older messages (offset / before-cursor / around-anchor)
- [ ] Reactions: quick-strip (usage-ordered) + full picker; add/remove; reaction detail breakdown
- [ ] Pin/unpin message; starred/bookmarked messages list with navigate-to-conversation
- [ ] Reply (swipe + banner); forward (swipe + picker); jump-to-quoted-message (local/server)
- [ ] Reply-count pills + reply thread overlay
- [ ] Message bubbles: text, emoji-only (oversized), image/video grid (1–4+ collage), inline
      carousel, audio, files, location, shared-contact card
- [ ] Rich text rendering (markdown, mentions, `m+` links, URLs, search highlight)
- [ ] Quoted-reply previews incl. story-reply previews (counts, thumbnails)
- [ ] Delivery status (8-state) checkmarks + offline-pending hourglass + failed-message retry
- [ ] Edited / pinned / forwarded indicators; edit-history viewer
- [ ] Ephemeral (self-destruct) messages with duration picker + countdown badges
- [ ] Blurred ("tap to reveal") + view-once messages with fog effect
- [ ] Message visual effects (shake/zoom/explode/waoo/confetti/fireworks/glow/pulse/rainbow/sparkle)
      — picker sheet + cross-platform bitfield encoding
- [ ] Long-press overlay menu (preview bubble, quick reactions, action grid, drag-to-detail panel)
- [ ] In-overlay interactive audio/video preview (play/pause, scrub, ±5s, 0.5–2.0×)
- [ ] Universal composer: text, attachments, voice, location, emoji, camera
- [ ] Voice recording UI (iMessage-style pill: cancel, live waveform, timer, min-duration gating)
- [ ] Attachment ladder (emoji, file, location, camera, photo library, voice)
- [ ] Large-paste detection → clipboard-content attachment
- [ ] In-app camera: photo capture + video recording (flash, front/back toggle)
- [ ] Live sentiment + language detection ("smart context zone") with language pill/picker override
- [ ] @-mention autocomplete (debounced API + local merge)
- [ ] Draft auto-save/restore (text + reply + language + effects + blur + ephemeral)
- [ ] Send with attachments (TUS resumable; audio over socket, others over REST) + upload progress
- [ ] In-conversation message search (debounced, translation-match aware) + jump-to-result
- [ ] Scroll-to-bottom control with rich unread/typing/offline/search states
- [ ] Typing indicators (header + inline)
- [ ] Static location pin + live location sharing (timed sessions) + fullscreen map / directions
- [ ] OpenGraph link-preview cards + in-app browser; tracker-param stripping
- [ ] Report message (typed reasons + detail); per-conversation animated themed background
- [ ] Conversation info sheet: hero/direct headers; members / media / stats / options tabs
- [ ] Paginated member list (infinite scroll + search); shared-media grid; pinned-messages list
- [ ] Member moderation: promote/demote, expel, ban, add member
- [ ] Conversation moderation: write-role, announcement mode, slow mode, auto-translate
- [ ] Per-conversation preferences: custom name, reaction emoji, pin, category, tags, mute, mentions-only
- [ ] Conversation lock: master PIN setup/change/remove + per-conversation 4-digit lock + unlock-all
- [ ] Leave / archive / delete-for-me / delete-for-all conversation
- [ ] Anonymous-session conversation mode; guest join-via-share-link flow
- [ ] AI conversation analysis (health score, summary, topics, tone, emotions)
- [ ] Conversation stats rings + activity-over-time chart + content-type / sentiment breakdown
- [ ] AI participant persona profiles + per-participant activity breakdown + trait bars

## D. Translation — Prisme Linguistique
- [ ] Automatic per-user translation display (resolution: system → regional → custom → original)
- [ ] Original / secondary-language exploration (flag strip, inline secondary panel)
- [ ] Message detail: per-language translation explorer + on-demand translate / retranslate
- [ ] Per-post and per-story translation (flag strip, inline secondary, request missing languages)
- [ ] Persisted translations / transcriptions / audio translations (offline Prisme)
- [ ] Real-time progressive translation/transcription socket updates
- [ ] Ad-hoc blocking text translation
- [ ] Source-language stamping from in-app prefs (NEVER device locale)
- [ ] Per-language flag / native name / colour metadata (~40 languages)

## E. Stories
- [ ] Story tray carousel (my-story button, rings, count dots, upload progress + retry/cancel)
- [ ] Multi-slide composer (≤10 slides; add/remove/duplicate/reorder; slide mini-preview strip)
- [ ] 9:16 canvas with pinch-zoom + drag-pan; FAB + bottom-band toolbar (Contenu/Effets)
- [ ] Text elements (≤5/slide): style (bold/italic/handwriting/typewriter/neon/retro), colour,
      size, alignment, background (none/solid/glass), outline/stroke, RTL, fade timing
- [ ] In-place floating text editor with tool bubbles + keyboard-aware canvas shift
- [ ] Media elements (≤10/slide): photo/video import, crop/edit, aspect-ratio preservation
- [ ] Audio elements (≤5/slide): voice recording (60s), audio file import, on-canvas player widget
- [ ] Freehand drawing layer (pen/marker/eraser, colour, width, undo/redo/clear)
- [ ] Emoji sticker picker (categorised + searchable)
- [ ] Backgrounds: random pastel, colour/gradient palette, image, looping/non-looping video
- [ ] 8 photo filters (vintage/bw/warm/cool/dramatic/vivid/fade/chrome) with intensity
- [ ] Frosted-glass text backdrops; safe-zone overlay; snap-to-guide + out-of-bounds warning
- [ ] Z-order management (front/back, forward/backward) persisted for WYSIWYG playback
- [ ] Multi-element context menu (edit, duplicate, reorder, delete)
- [ ] Per-element + per-slide duration; background designation toggle (1 visual + 1 audio/slide)
- [ ] Repost flow: clone source story + locked attribution badge
- [ ] Draft save/restore with media persistence + lost-media detection / re-capture prompt
- [ ] Preview before publish; RAW background publish-all; offline publish queue + pending badge
- [ ] Visibility selection (Public / Friends / Private)
- [ ] thumbHash blur-placeholder generation per slide
- [ ] **V2 timeline editor**: multi-track, Quick + Pro modes, size-class adaptive, zoomable
- [ ] Clip add / move / trim / split / delete with full undo/redo (command stack, FIFO 50, persisted)
- [ ] Keyframe animation (position/scale/opacity, easing) per clip/element
- [ ] Clip transitions (crossfade / dissolve, adjustable duration); slide opening animations
- [ ] Per-clip inspector (volume, fade in/out, loop, background, delete)
- [ ] Timeline transport: play/pause, scrub, zoom 0.25×–4×, mute; snap-to-grid with guides
- [ ] Multi-track playback with sample-accurate audio mixing (foreground+background, fades, ducking)
- [ ] Story media audio-focus arbitration (claim app audio, restore on dismiss)
- [ ] **Story viewer**: tap-advance + swipe (horizontal=group, vertical=dismiss), segmented
      progress bars, cross-dissolve transitions, per-story opening/closing effects
- [ ] Timed auto-advance gated on media-load readiness; adjacent-slide prefetch (sliding window)
- [ ] Story content rendering: text/positioning/background/filters/media overlays
- [ ] Story reactions: emoji quick-strip + full picker, big floating animation, heart bounce, count
- [ ] Story comments overlay: live-chat panel, 1-level threading, composer with effects/blur,
      per-comment language switcher, optimistic posting + reaction likes
- [ ] Story actions: reply privately (DM with context), forward/send, reshare-as-story,
      repost-as-post (direct + edit), mute/unmute, translate, report
- [ ] Story viewers sheet (who-viewed list with reaction/reshare indicators)
- [ ] Reader Prisme: text overlays in viewer's preferred language; composer shows source language
- [ ] **Author-only Story → MP4 export** (bit-exact render, language picker, system share, never uploaded)
- [ ] Single shared renderer feeds composer canvas + reader canvas + export compositor (WYSIWYG)
- [ ] Accessibility for canvas elements (labels, custom delete/duplicate/reorder actions)

## F. Feed & Posts
- [ ] Social feed: cursor-paginated post list, infinite scroll, pull-to-refresh, new-posts banner
- [ ] Feed overlay shell with draggable floating buttons + radial menu ladder
- [ ] Create post (text, photos/videos, camera, files, location, audio+transcription, visibility, language)
- [ ] Unified post composer (Post / Status / Story tabs)
- [ ] Quote / repost posts (incl. reposts of stories) with canvas reprojection + "items repositioned" banner
- [ ] Post reactions (heart like) — optimistic + live socket sync; bookmark / un-bookmark
- [ ] Adaptive multi-image collage layouts (1–5+ media) + fullscreen gallery
- [ ] Threaded comments: auto-preview replies, expand threads ("view N more"), comment likes,
      mentions, effects/blur, per-comment language switcher
- [ ] Post / comment pin-unpin; repost / quote-repost / share; report
- [ ] Post view + dwell-time tracking; batched impression tracking
- [ ] Feed post detail with text/media/repost, translation flags, threaded comments
- [ ] User-profile posts feed + community posts feed
- [ ] Bookmarked posts feed (saved posts) with infinite scroll
- [ ] Post-detail room real-time subscriptions
- [ ] Story repost-embed cell in the feed

## G. Statuses / Moods
- [ ] Statuses/moods bar: emoji pills, popover details, infinite scroll
- [ ] Status composer / republish: emoji grid, 122-char text, visibility (public/friends/except/only)
- [ ] Mood status create, react, delete; 21h expiry + viewer tracking
- [ ] Status thought-bubble popover on avatar tap with republish action
- [ ] Friends / Discover status feeds

## H. Calls (audio / video)
- [ ] 1:1 audio & video calls (WebRTC P2P, ICE/STUN, hardware H.264)
- [ ] System call UI (Telecom/ConnectionService) + ringback tone
- [ ] Incoming-call delivery via FCM data push when backgrounded/killed (full-screen intent)
- [ ] Call reconnection on network change (ICE restart)
- [ ] Call states: ringing/connecting/connected/ended; PiP / floating call pill
- [ ] Live in-call transcription overlay (on-device speech-to-text, leader/follower)
- [ ] In-call translation data channel (dual-stream clean audio)
- [ ] In-call video filters (colour presets, low-light boost, background blur, skin smoothing)
- [ ] In-call audio effects (voice changer, baby/demon voice, looping background sound)
- [ ] Camera-covered ("dark frame") detection during video calls
- [ ] Thermal-aware quality degradation (fps/resolution caps, video disable)
- [ ] Adaptive call quality (bitrate ladder, auto video-disable on critical link)
- [ ] Connection-quality indicator; call-waiting banner (second incoming call)
- [ ] Front-camera mirroring; extensible call media pipeline hook bus
- [ ] Voice/video call signaling events (initiate, answer, ICE, end, missed, media toggle)

## I. Communities
- [ ] Community creation (name, `mshy_` identifier, description, emoji, privacy, initial members)
- [ ] Community detail (banner, stats, channels list, role-based actions)
- [ ] Add existing conversation as a channel (incl. move from another community)
- [ ] Member invite (user search + invited tracking); member management (roles, promote/demote, remove)
- [ ] Community settings (avatar/banner upload, colour/emoji, privacy, delete/leave)
- [ ] Role-based community permissions
- [ ] Community invite links: list, stats, detail, copy/share

## J. Contacts & Friends
- [ ] Contacts hub: 4 tabs (Contacts / Requests / Discover / Blocked) with badges
- [ ] Contacts list (online/offline filters + counts, search, presence + mood-emoji)
- [ ] Cache-first friends list with cross-screen reconciliation; online-first sorting
- [ ] Friendship status resolution (friend / pending sent / pending received / blocked)
- [ ] Send / accept / decline / cancel friend request — optimistic + offline-queued, idempotent
- [ ] Invite by email; invite by SMS; import phone contacts
- [ ] Discover suggestions (cache-first) + live user search with inline connect
- [ ] Blocked-users list with confirm-to-unblock; optimistic unblock with rollback

## K. Profile & Account
- [ ] View profile (by id / username / public handle / email / phone)
- [ ] Full profile sheet: banner, identity, Profile / Conversations / Stats tabs, achievements
- [ ] Edit profile (avatar + banner upload, display name, bio, content languages) — optimistic + offline save
- [ ] User stats dashboard: stat cards, 30-day activity timeline chart, achievement badges
- [ ] Profile completion ring
- [ ] Profile QR code display + save/share; share profile via message/email/copy link
- [ ] Block / unblock users; report a user (reason + details)
- [ ] Change email / phone (two-step verification)
- [ ] Two-factor auth: QR enrollment, code verification, backup codes (view + regenerate), disable
- [ ] Active device sessions: list, revoke one, revoke all others
- [ ] Voice-cloning onboarding wizard (consent → 18+ age gate → record ≥3 samples → process)
- [ ] Voice-profile management (status, cloning toggle, sample add/list/delete, GDPR delete-all)

## L. Settings & Privacy
- [ ] Settings hub: profile card, appearance/theme + interface language, notifications,
      transcription, voice profile, data, tools, support, about, logout
- [ ] Light/dark/system theme with persisted preference
- [ ] Notification preferences (push/email/sound/vibration, per-event types, DND schedule)
- [ ] Privacy settings (visibility, contacts, media/data, encryption preference)
- [ ] Auto-download settings for media by type and connection (Wi-Fi/cellular)
- [ ] Local-first user preferences (7 categories) — instant UI + debounced offline-queued sync
- [ ] Change password with strength meter + validation
- [ ] GDPR data export (JSON/CSV, selectable scope, share/save file)
- [ ] Account deletion (typed-phrase confirmation + email-confirmation flow)
- [ ] Media cache management (clear cached images/audio/video/thumbnails)
- [ ] Crash-report diagnostics viewer with share
- [ ] Static screens: Help & Support, Terms of Service (FR/EN), Privacy Policy (FR/EN),
      open-source licenses (auto-generated), About

## M. Notifications
- [ ] Notification center with category filters (messages, reactions, mentions, social,
      contacts, groups, calls, translations, system)
- [ ] Notification list — stale-while-revalidate cache + real-time socket updates, paginated, unread-only filter
- [ ] Row swipe actions (mark-read, delete); mark single / all read; delete; unread badge count
- [ ] In-app real-time notification toast
- [ ] FCM push: permission request, tap-to-navigate, foreground/silent activity signal, badge sync
- [ ] Rich push: decryption, message-media attachments, sender-avatar style, category quick
      actions (reply / mark-read / accept-friend / call), conversation threading, per-push badge
- [ ] Offline delivery-receipt acknowledgement (✓→✓✓ for offline recipients)
- [ ] Push message prefetch + pre-persist into Room for instant cold-launch
- [ ] `NotificationCoordinator` authority model (socket authoritative; cache only seeds)
- [ ] Comprehensive notification system (~80 types)

## N. Search
- [ ] Global search (messages, conversations, users) with recent searches + query highlighting
- [ ] Local full-text search (FTS, accent-folded, BM25-ranked) + network merge
- [ ] User search (paginated)

## O. Links
- [ ] Links hub (share / tracking / community / affiliate) with quick-create
- [ ] Share/invite links: create (guest rules, anonymous permissions, max-uses, expiration,
      custom slug), list + stats, detail (copy/share/activate/delete)
- [ ] Anonymous join-via-share-link (preview → form → success); share-link preview screen
- [ ] UTM tracking links: create, list, toggle, delete; aggregate + per-link click stats
      (geo/device/browser breakdown, click timeline), QR generation
- [ ] Affiliate / referral links: create, copy, share, delete, dashboard stats
- [ ] Generic in-app share picker / Android Share-Sheet receiver (text/url/image/message/story → conversation)

## P. Media (viewers & editors)
- [ ] Inline video playback (thumbnail → play, auto-hiding controls); fullscreen immersive
      player (seek bar, ±10s, speed 1.0–2.0×, swipe-to-dismiss); Picture-in-Picture
- [ ] Single-active-player coordination across audio + video; save video to gallery
- [ ] Video watch-progress reporting; synchronized karaoke-style transcription (tap-to-seek)
- [ ] Audio message player (waveform, speed control, seek); disk-cache-first instant replay
- [ ] Voice-message autoplay-next chaining; full-screen swipeable audio viewer (reels-style)
- [ ] Universal audio recorder (live waveform, duration/min-duration limits, presets)
- [ ] Full-screen audio editor (waveform, trim/crop, word-level transcription, language picker)
- [ ] On-device speech-to-text transcription of recordings
- [ ] Full-screen image editor (crop + ratio presets, 12 filters, brightness/contrast/saturation/
      sharpness/vignette, 6 effects, rotate)
- [ ] Image/video preview screens per context (story/post/message/avatar/banner) with Edit + Use
- [ ] Image viewer (pinch-zoom, pan, double-tap, drag-to-dismiss); save image to gallery
- [ ] Code attachment viewer (~16 languages, syntax highlight, GitHub light/dark, copy)
- [ ] Document viewer (PDF/presentation/spreadsheet) with share
- [ ] Image/video compression before upload (context-aware quality); save media to "Meeshy" album
- [ ] ThumbHash blur placeholders for all media; audio spectrogram visualization

## Q. Cross-cutting infrastructure
- [ ] Cache-first / SWR data layer (`CacheResult`, `cacheFirstFlow`, Room as single SoT)
- [ ] Offline outbox (one Room table, FIFO flush, backoff ×5, coalescing, `cmid` idempotency, rollback)
- [ ] Optimistic updates with snapshot rollback + in-flight guards + self/others socket-echo split
- [ ] `MessageStateMachine` + localId↔serverId reconciliation (no duplicate bubbles)
- [ ] Cold-start full conversation sync (bounded parallel paging, retries, completeness guards)
- [ ] Foreground / reconnect delta sync (`updatedSince` checkpoint, burst cooldown, gap-fill)
- [ ] Real-time socket→Room relay (messages, reactions, read status, translations, lifecycle)
- [ ] Two Socket.IO connections (message + social), long-polling transport, robust reconnect + room re-join
- [ ] Crash-safe boot recovery for in-flight queue items + orphaned audio files
- [ ] Resumable (TUS) uploads surviving app kill; daily message-retention cleanup; DB maintenance
- [ ] Background conversation sync + message prefetch (backoff + jitter)
- [ ] Encrypted local storage (AES-GCM Room / EncryptedSharedPreferences) + per-user namespacing + logout wipe
- [ ] E2EE message encryption/decryption (libsignal, batched, fail-closed)
- [ ] Deep links: profile, conversation, join/chat link, magic link, share, user links
      (`meeshy://` + `https://meeshy.me`)
- [ ] Universal Link / push / socket notification routing into the correct screen
- [ ] Home-screen widgets (recent conversations, unread count, favorite contacts, quick reply, mark-read)
- [ ] Ongoing-call / translation-progress foreground-service notification (iOS Live Activity equivalent)
- [ ] App Actions / dynamic shortcuts (send message, call, recent conversation) — Siri/Shortcuts equivalent
- [ ] Crash / hang / ANR diagnostics with on-device persistence + remote report
- [ ] Privacy-gated analytics (screen tracking); client telemetry headers; network reachability awareness
- [ ] Adaptive iPad/tablet/foldable two-column layout (feed + conversation list/detail, resizable splitter)
- [ ] Deterministic conversation/post accent colour + name-hash palette + theme-adaptive readability
- [ ] Scroll-collapsing navigation header; animated brand logo; branded pull-to-refresh
