# Multi-Attachment Carousel Rendering (Plan 2/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render a message carrying MULTIPLE attachments of the same type as a carousel: an audio carousel (waveform + speed/progress chips + synchronized karaoke per track, dots, auto-advance through the thread) for multi-audio messages, and the existing visual carousel for multi-image/video, with inline video expand→collapse.

**Architecture:** Reuse maximally. The hard parts already exist: `ConversationAudioCoordinator` already owns a **queue + auto-advance** (`play(current:tail:)`, `advanceQueue()`, `attachmentFinishedPublisher`, shared `engineForBubble`); `AudioPlayerView` already renders waveform + right-side speed/progress chips + karaoke and **accepts an external shared engine** (`externalPlayer:`); `AdaptiveHorizontalPager` is the proven pager; `BubbleCarouselView` already coexists with `BubbleSwipeContainer`'s swipe-to-reply gesture in production (gesture arbitration already solved → A6 is verification-only). The only genuinely NEW component is `AudioCarouselView` (app-side), which composes these.

**Tech Stack:** Swift 6, SwiftUI, MeeshyUI SDK, XCTest. App build `./apps/ios/meeshy.sh build`. SDK tests via `MeeshySDK-Package` scheme from `packages/MeeshySDK`. App tests via `Meeshy` scheme from `apps/ios`.

**Source spec:** `docs/superpowers/specs/2026-05-30-multi-attachment-messages-and-audio-carousel-design.md` (lots A4, A5, A6).

**Branch:** `main` (user directed work directly on main; each push triggers prod deploy).

---

## De-risking summary (from grounding 2026-06-01)

| Lot | Reality found | Net new work |
|---|---|---|
| **A4** audio carousel | `ConversationAudioCoordinator` already has queue + auto-advance + shared engine; `AudioPlayerView(externalPlayer:transcription:translatedAudios:)` already renders the validated UI; `TranscriptionDisplaySegment.buildFrom(_:)` converts karaoke segments | **NEW `AudioCarouselView`** + a pure `AudioCarouselQueueBuilder` + branch in `BubbleStandardLayout` |
| **A5** visual carousel | `BubbleCarouselView` + `AdaptiveHorizontalPager` exist; `MeeshyVideoPlayer(onExpand:)` already fires fullscreen | Decision + small wiring (see A5 task) |
| **A6** gesture priority | `BubbleCarouselView` already coexists with `BubbleSwipeContainer` in prod (ScrollView wins horizontal pan; 2:1 dominance guard + 22pt min-distance on the reply DragGesture) | **Verification only** (manual smoke) |

## Key verified signatures (use verbatim)

- `ConversationAudioCoordinator.shared` (`apps/ios/Meeshy/Features/Main/Services/ConversationAudioCoordinator.swift`):
  - `@Published private(set) var activeContext: ActiveAudioContext?`, `isPlaying`, `progress`, `currentTime`, `duration`, `speed`
  - `var engineForBubble: AudioPlaybackManager?`
  - `func play(current: QueuedAudio, tail: [QueuedAudio], conversationName: String, conversationArtworkURL: String?)`
  - `var attachmentFinishedPublisher: AnyPublisher<AttachmentFinishedEvent, Never>` (auto-advance already emits per-track finish)
  - `QueuedAudio` — verify its exact fields in the file before constructing (Task A4.0).
- `AudioPlayerView.init(attachment: MeeshyMessageAttachment, context: MediaPlayerContext, accentColor:, transcription: MessageTranscription?, translatedAudios:, externalPlayer: AudioPlaybackManager?, externalLanguage: Binding<String?>?, onPlayRequest:, topContent:, bottomContent:)` — `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:495`.
- `MediaPlayerContext.messageBubble` (`MediaTypes.swift:6`).
- `TranscriptionDisplaySegment.buildFrom(_ transcription: MessageTranscription) -> [TranscriptionDisplaySegment]` (`MediaTypes.swift:180`).
- `AdaptiveHorizontalPager(items:currentPageID:fillVertical:carouselTransition:page:)` (`AdaptivePagingScroll.swift:18`).
- `BubbleFooter(model:actions:style:isDark:)`, `BubbleFooterModel.empty`, style `.overlay` (`BubbleFooter.swift`, `BubbleFooterModel.swift:33`).
- `ConversationViewModel.AudioItem { id; attachment; message; transcription; translatedAudios }` + `allAudioItems` (`ConversationViewModel.swift:498`).
- `BubbleStandardLayout.audioAttachments` (`:147`) + `ForEach(audioAttachments)` block (`:562`) + `mediaStandaloneView(_:injectFooter:replyReference:replyIsStory:embedsCaption:)` (`:974`).

## File Structure

| File | Role | Action |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Services/AudioCarouselQueueBuilder.swift` | pure: (items, selectedIndex, allAudioItems) → (current, tail) for the coordinator | **Create** |
| `apps/ios/MeeshyTests/Unit/Services/AudioCarouselQueueBuilderTests.swift` | tests for the builder | **Create** |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioCarouselView.swift` | the multi-track audio carousel view | **Create** |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` | branch `audioAttachments.count > 1` → `AudioCarouselView` | **Modify** |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift` | A5: multi-visual → carousel + inline video expand/collapse | **Modify** (pending A5 decision) |

All new app `.swift` files need manual pbxproj entries (objectVersion 63 — 4 entries + 2 UUIDs each).

---

## OPEN DECISION (confirm at plan review)

**A5 — grid vs carousel for 2–4 visuals.** Today a message with 2–4 images/videos renders an **album grid** (`visualMediaGrid`); a swipeable `BubbleCarouselView` only opens on the 4+ overflow tap. The spec/brainstorm said "use the existing image/video carousel for several images in a row." Two readings:

- **(R1, recommended) Keep the grid for 2–4, carousel for 4+ overflow (unchanged), and scope A5 to ONLY the inline-video expand→collapse improvement.** Zero regression to the album grid; honours "don't reinvent" (the carousel already exists for browsing). The user's explicit new ask (video full-inline then back) is delivered.
- **(R2) Replace the album grid with a swipeable carousel for ALL multi-visual messages (2+).** Matches a literal "carousel for several images" but changes the established album-grid UX and loses the at-a-glance multi-thumbnail view.

This plan assumes **R1** unless the user picks R2 at review. (A4 audio always uses the carousel — that's the whole point of the audio feature and there is no pre-existing audio multi-view.)

---

## Task A4.0 — Verify coordinator queue API + add finished→advance subscription point

**Files:** read-only verification (+ note any tiny SDK gap).

- [ ] **Step 1:** Read `ConversationAudioCoordinator.swift` and `AudioPlaybackEngineDriving.swift`. Confirm the EXACT shape of `QueuedAudio` (fields needed to construct one: attachmentId, messageId, conversationId, url, durationMs, sender/artwork?). Confirm `play(current:tail:conversationName:conversationArtworkURL:)` is the right entry to (a) start a chosen track from 0 and (b) auto-advance through `tail`. Confirm `attachmentFinishedPublisher` already fires per-track on natural finish (it does — `advanceQueue()` sends it).
- [ ] **Step 2:** Confirm whether `play(...)` is safe to call repeatedly (on each swipe) to RESET the head to the swiped track + new tail. If it is, swipe→play is a direct call. If repeated `play` has side effects (e.g. restarts artwork/now-playing thrash), note the minimal guard. Record findings as a short comment block to paste into `AudioCarouselView`.
- [ ] **Step 3:** No code change if the API suffices. If a gap exists (e.g. no way to build `QueuedAudio` from a `MessageAttachment`+`Message`), define the minimal mapping helper location (prefer app-side in `AudioCarouselQueueBuilder`, not SDK). Report DONE with the confirmed `QueuedAudio` initializer signature for the next task.

---

## Task A4.1 — Pure `AudioCarouselQueueBuilder` (TDD)

**Files:**
- Create `apps/ios/Meeshy/Features/Main/Services/AudioCarouselQueueBuilder.swift`
- Test `apps/ios/MeeshyTests/Unit/Services/AudioCarouselQueueBuilderTests.swift`

Builds the `(current, tail)` the coordinator needs when the user activates track at `selectedIndex` in a carousel of `items`, continuing through the carousel's remaining tracks THEN the subsequent audio messages in the thread (`allAudioItems`), per the validated UX "swipe = play this track from 0; on finish, continue to next track, then next audio in thread."

- [ ] **Step 1: Failing test.** Using the REAL `QueuedAudio` initializer confirmed in A4.0 and `ConversationViewModel.AudioItem`, assert:
  - `build(items:selectedIndex:allAudioItems:conversation…)` returns `current` = the QueuedAudio for `items[selectedIndex]`.
  - `tail` = the remaining carousel tracks after `selectedIndex` (in order), FOLLOWED BY the thread's audio items that come AFTER the carousel message (dedup: do not repeat the carousel's own tracks).
  - Selecting the LAST carousel track with no later thread audio → empty tail.
  - Out-of-range `selectedIndex` is clamped.
  Write the exact test with concrete fixtures (mirror `MultiAttachmentSendPlannerTests` style; build attachments via `MeeshyMessageAttachment(id:mimeType:duration:)`).
- [ ] **Step 2:** Run → fail (symbol missing). `./apps/ios/meeshy.sh build`.
- [ ] **Step 3:** Implement the pure builder (no View/coordinator deps; takes plain inputs, returns the coordinator's value types). Keep it `enum` + `static func` like `MultiAttachmentSendPlanner`.
- [ ] **Step 4:** Add pbxproj entries (prod file → Meeshy target, test file → MeeshyTests). Run the test class → pass.
- [ ] **Step 5:** Commit `feat(audio): AudioCarouselQueueBuilder — track + thread continuation queue (A4)`.

---

## Task A4.2 — `AudioCarouselView` (the new component)

**Files:**
- Create `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioCarouselView.swift`

Composes existing parts. Inputs (all primitives/value types — leaf-view discipline, no `@ObservedObject` on global singletons except the coordinator which is the shared engine source):

```
struct AudioCarouselView: View {
    let items: [MessageAttachment]              // the audio attachments of THIS message (count > 1)
    let message: Message
    let allAudioItems: [ConversationViewModel.AudioItem]   // for thread continuation
    let transcriptions: [String: MessageTranscription]     // by attachment.id (or message id → resolve)
    let translatedAudios: [String: [MessageTranslatedAudio]]
    let accentColor: String
    let isDark: Bool
    let footerModel: BubbleFooterModel          // current-track footer (flags/time/delivery)
    let footerActions: BubbleFooterActions
    var activeAudioLanguage: Binding<String?>
    // coordinator accessed via ConversationAudioCoordinator.shared
}
```

Body:
- `@State private var currentPageID: String?` (the visible attachment id).
- `AdaptiveHorizontalPager(items: items, currentPageID: $currentPageID, fillVertical: false, carouselTransition: true) { _, att in page(att) }`.
- `page(att)` = `AudioPlayerView(attachment: att.asMeeshyMessageAttachment, context: .messageBubble, accentColor: accentColor, transcription: transcriptions[att.id], translatedAudios: translatedAudios[att.id] ?? [], externalPlayer: ConversationAudioCoordinator.shared.engineForBubble, externalLanguage: activeAudioLanguage, onPlayRequest: { activate(att) })`. (Confirm whether `AudioPlayerView` needs the SDK `MeeshyMessageAttachment` — `MessageAttachment` IS that typealias, so pass directly.)
- Dots indicator: reuse the dots/page-count style from `BubbleCarouselView` (top-trailing small pill `i+1/N` or dot row). Keep identical visual language.
- ONE `BubbleFooter(model: footerModel, actions: footerActions, style: .overlay, isDark: isDark)` below the pager (or bottom-trailing overlay), reflecting the CURRENT page's track. When the page changes, the parent recomputes `footerModel` for the new track's message/language (the footer is per-track; see A4.3 wiring).
- `activate(att)`: build the queue via `AudioCarouselQueueBuilder` for the att's index + call `ConversationAudioCoordinator.shared.play(current:tail:…)`. This is invoked on `onPlayRequest` (tap play) AND on `currentPageID` change (swipe = play from 0, per validated UX) via `.adaptiveOnChange(of: currentPageID)`.
- Karaoke: `AudioPlayerView` already renders `MediaTranscriptionView` from `transcription` (via `TranscriptionDisplaySegment.buildFrom`) synced to the engine `currentTime`. When `transcription` is nil for a track, AudioPlayerView already hides the karaoke zone (spec A4 "masquer la zone"). No extra work.

- [ ] **Step 1:** Write `AudioCarouselView.swift` per the above, reusing verified signatures. Match the dots/footer visual style of `BubbleCarouselView` (read it, mirror).
- [ ] **Step 2:** Add pbxproj entries (Meeshy target).
- [ ] **Step 3:** `./apps/ios/meeshy.sh build` → BUILD SUCCEEDED. (View has no unit test; correctness verified by build + the A4.1 builder tests + the A4.4 smoke.)
- [ ] **Step 4:** Commit `feat(audio): AudioCarouselView — multi-track pager (shared engine + karaoke + dots + footer) (A4)`.

---

## Task A4.3 — Branch `BubbleStandardLayout` into the carousel for multi-audio

**Files:**
- Modify `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (the `ForEach(audioAttachments)` block ~:562)

- [ ] **Step 1:** Read the current block + how `mediaStandaloneView` resolves `footerModel`/`footerActions`/transcriptions/translatedAudios/`allAudioItems`/`activeAudioLanguage` (trace where those come from in `BubbleStandardLayout`/`ThemedMessageBubble`). Identify the per-track footer resolver so the carousel can compute the CURRENT-track footer.
- [ ] **Step 2:** Replace the audio rendering with:
  ```swift
  if audioAttachments.count > 1 {
      AudioCarouselView(items: audioAttachments, message: <msg>, allAudioItems: <allAudioItems>,
                        transcriptions: <map>, translatedAudios: <map>, accentColor: <accent>,
                        isDark: isDark, footerModel: <current-track footer>,
                        footerActions: <actions>, activeAudioLanguage: <binding>)
  } else {
      ForEach(audioAttachments) { attachment in /* existing mediaStandaloneView path, unchanged */ }
  }
  ```
  Resolve every `<…>` from the REAL surrounding inputs (do not invent). The single-audio path stays byte-for-byte as today (zero regression incl. the `audioHostsCaption`/`shouldInjectFooter`/`embedsCaption` logic — those only matter for count==1, since the composer never produces text+multi-audio per Plan 1's "text always separate").
- [ ] **Step 3:** Decide the current-track footer source: the footer must reflect the visible track's message + its language flags. Simplest correct approach: the carousel exposes the current track id; the layout passes a footer model for `message` (all tracks of a multi-audio message share ONE message, so flags/time/delivery are identical across tracks → a single `footerModel` for the message is correct and the "per current track" nuance collapses to "the message footer"). Confirm all carousel tracks belong to the SAME message (they do — `audioAttachments` are the attachments of one message) → use the message's footer model directly. (This simplifies A4.2: footer is constant across pages.)
- [ ] **Step 4:** `./apps/ios/meeshy.sh build` → SUCCEEDED. Run existing bubble/audio tests to confirm no regression: `xcodebuild test -scheme MeeshySDK-Package … -only-testing:MeeshyUITests` for the drawing/audio suites that exist, and the app `MeeshyTests` audio-related suites.
- [ ] **Step 5:** Commit `feat(bubble): render multi-audio message as AudioCarouselView (A4)`.

---

## Task A5 — Inline video expand→collapse (assumes decision R1)

**Files:**
- Modify `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift`

(If the user picks R2 at review, prepend a task that branches multi-visual messages to `BubbleCarouselView` instead of `visualMediaGrid`.)

- [ ] **Step 1:** Read `videoBody` (~:305) — it already calls `MeeshyVideoPlayer(style:.inline, onExpand: { fullscreenAttachment = attachment })`. Confirm what `fullscreenAttachment` drives (a `fullScreenCover`? a modal?) and where it's declared. Determine whether "expand to full inline (within the bubble/carousel space) then collapse back" is satisfied by the existing fullscreen path OR requires an in-place inline expand.
- [ ] **Step 2:** If the existing `onExpand`→fullscreen already gives full playback then returns to the carousel page on dismiss, A5 is **verification-only** — document it and add no code. If the user specifically wants in-place inline growth (not fullscreen modal), implement a local `@State expandedVideoId: String?` in the carousel/grid that grows the playing video cell to fill the bubble width and restores on finish/pause (per spec A5). Keep it a local state toggle, NOT fullscreen.
- [ ] **Step 3:** Build + smoke. Commit `feat(media): inline video expand/collapse in carousel (A5)` (or `docs: A5 satisfied by existing fullscreen path` if no code needed).

---

## Task A6 — Gesture priority verification (no code expected)

- [ ] **Step 1:** Manual smoke on simulator (`./apps/ios/meeshy.sh run`): in a multi-audio carousel bubble, swipe horizontally → pages change WITHOUT triggering reply/forward; at the first page swiping further right (and last page further left) → the bubble's reply/forward swipe engages. Confirm parity with the existing multi-image carousel behavior.
- [ ] **Step 2:** If (and only if) a real conflict is observed, implement edge-aware arbitration: expose the carousel's `isAtFirstPage`/`isAtLastPage` and gate the parent `BubbleSwipeContainer` DragGesture accordingly. Otherwise document A6 as satisfied by existing ScrollView/simultaneousGesture coexistence.
- [ ] **Step 3:** Commit `docs/test(gesture): A6 carousel vs swipe-to-reply verified` (code only if a conflict was found).

---

## Stratégie de test (TDD)
- **A4.1** pure builder: unit tests (current/tail, thread continuation, dedup, clamping).
- **A4.2/A4.3** view wiring: build-green + reuse of already-tested SDK components (`AudioPlayerView`, `MediaTranscriptionView`, coordinator) + manual smoke; no fragile View unit tests.
- Regression: existing `MeeshyUITests` (drawing/audio) + app audio suites stay green.
- **A5/A6:** verification-led (manual smoke); code only if the existing reuse path falls short.

## Hors périmètre (YAGNI)
- Changing the album-grid UX (unless R2 chosen).
- New transcription/translation plumbing (segments already flow end-to-end).
- Cross-message visual carousels (each message stays its own bubble; only same-message multi-attachment groups into a carousel — consistent with Plan 1's "group at send, render per message").

## Self-review
- **Spec coverage:** A4 (A4.0 verify + A4.1 builder + A4.2 view + A4.3 branch), A5 (inline video, R1), A6 (verification). Validated UX honoured: no track label (AudioPlayerView shows waveform+chips, not a title), chips on the right (existing), karaoke synced + hidden when absent (existing), swipe=play-from-0 (activate on page change), auto-advance track→thread (coordinator queue + builder tail), dots, footer.
- **Reuse:** no reinvention of player/karaoke/coordinator/pager/footer; only `AudioCarouselView` + a pure builder are new.
- **Type consistency:** `QueuedAudio` constructed via the initializer confirmed in A4.0; `MessageAttachment`==`MeeshyMessageAttachment` typealias passed straight to `AudioPlayerView`; footer is the message-level model (constant across same-message tracks, per A4.3 Step 3).
- **Risk:** lowest-risk path chosen everywhere; the one open product decision (A5 R1/R2) is surfaced for review, not guessed.
