# Live Call Captions — Multi-Speaker UI & Translation Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show both call participants' live captions with a clear per-speaker color/name
distinction, restructure the call layout so the transcript is a real UI element (not an
overlay), and add a global original/translated toggle for the interlocutor's speech.

**Architecture:** No pipeline change — the gateway relay (`call:transcription-segment` →
`call:translated-segment`) already delivers both sides once each device activates its own
toggle (spec: `docs/superpowers/specs/2026-07-11-call-captions-multispeaker-design.md`). This
plan (1) fixes a data-mapping bug that currently discards the interlocutor's original text, (2)
adds per-speaker visible name + `MeeshyColors` primary/secondary color coding, (3) adds a global
original↔translated toggle button, and (4) restructures `CallView`'s layout so the transcript
occupies real vertical space instead of floating over the avatar/controls (audio calls), while
video calls keep a bottom glass banner that doesn't shrink the video.

**Tech Stack:** Swift 6, SwiftUI, XCTest, Combine — same stack as the parent plan
(`docs/superpowers/plans/2026-07-10-live-call-transcription.md`), which this work extends.

## Global Constraints

- Real-device validation is mandatory for the layout tasks (Task 4) — simulator can verify
  compile/logic correctness but not the actual visual arrangement on a real screen size.
- `MeeshyColors.indigo400` is already used by `transcriptionToggleButton`'s active-state tint
  (`apps/ios/Meeshy/Features/Main/Views/CallView.swift`) and is documented in
  `packages/MeeshySDK/CLAUDE.md` as the "secondary elements" tone
  (`brandGradientLight: #818CF8 -> #6366F1`) — reuse it for "Moi" (local speaker), never invent
  a new color token.
- `MeeshyColors.brandPrimary` (`= indigo500`, `packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift:27`)
  is "THE signature" brand color per that same doc — use it for the interlocutor.
- Do NOT move or restructure `pipView`, `reconnectingBanner`, or `showEffectsToolbar`'s trigger
  — they coexist in the same `ZStack`/`VStack` region touched by this plan and must keep working
  exactly as before (spec risk table).
- `character.bubble` / `character.bubble.fill` are already used elsewhere in this codebase
  (`ConversationAnimatedBackground.swift:614`, `MediaDownloadSettingsView.swift:82`) — confirmed
  valid SF Symbols, safe to reuse for the translation toggle icon.
- TDD strict (RED-GREEN-REFACTOR), per root `CLAUDE.md` and `apps/ios/CLAUDE.md`.

---

### Task 1: Fix data mapping — keep the original text, don't discard it

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:3568-3587` (the
  `socket.callTranslatedSegmentReceived` subscription inside `setupSocketListeners()`)
- Test: `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift`

**Interfaces:**
- Produces: `CallManager.makeTranscriptionSegment(from: CallTranslatedSegmentData) ->
  TranscriptionSegment` (`static`, pure, no side effects) — Task 2 and Task 4 don't call this
  directly, but its correctness (original text preserved in `.text`) is what makes Task 2's
  original/translated toggle possible.

Today, `TranscriptionSegment.text` is set to `seg.translatedText ?? seg.text` — once translation
succeeds, the ORIGINAL text is gone forever (both `.text` and `.translatedText` end up holding
the same translated string). This blocks any original/translated toggle. Extract the mapping
into a small, directly-testable static function so this stays correct without depending on
source-inspection.

- [x] **Step 1: Write the failing test**

Open `apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift` and add at the end of the file
(after the last `}` that closes the last test class — check with `tail -5` first, insert a new
top-level test class):

```swift

@MainActor
final class CallManagerTranscriptionMappingTests: XCTestCase {

    func test_makeTranscriptionSegment_keepsOriginalText_separateFromTranslation() throws {
        let json = """
        {
            "callId": "call-1",
            "segment": {
                "text": "Bonjour",
                "translatedText": "Hello",
                "speakerId": "user-1",
                "startMs": 0,
                "endMs": 1500,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "en",
                "confidence": 0.95
            }
        }
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallTranslatedSegmentData.self, from: json)

        let segment = CallManager.makeTranscriptionSegment(from: event)

        XCTAssertEqual(segment.text, "Bonjour", "text must stay the ORIGINAL — never overwritten by the translation")
        XCTAssertEqual(segment.translatedText, "Hello")
        XCTAssertEqual(segment.translatedLanguage, "en")
        XCTAssertEqual(segment.speakerId, "user-1")
        XCTAssertEqual(segment.startTime, 0)
        XCTAssertEqual(segment.endTime, 1.5)
        XCTAssertTrue(segment.isFinal)
        XCTAssertEqual(segment.confidence, 0.95, accuracy: 0.001)
        XCTAssertEqual(segment.language, "en")
    }

    func test_makeTranscriptionSegment_withoutTranslation_translatedFieldsAreNil() throws {
        let json = """
        {
            "callId": "call-1",
            "segment": {
                "text": "Bonjour",
                "speakerId": "user-1",
                "startMs": 0,
                "endMs": 1000,
                "isFinal": true,
                "sourceLanguage": "fr",
                "targetLanguage": "fr",
                "confidence": 0.9
            }
        }
        """.data(using: .utf8)!
        let event = try JSONDecoder().decode(CallTranslatedSegmentData.self, from: json)

        let segment = CallManager.makeTranscriptionSegment(from: event)

        XCTAssertEqual(segment.text, "Bonjour")
        XCTAssertNil(segment.translatedText)
        XCTAssertNil(segment.translatedLanguage)
    }
}
```

- [x] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: FAIL — `Type 'CallManager' has no member 'makeTranscriptionSegment'`.

- [x] **Step 3: Extract the static mapping function and use it in the sink**

In `apps/ios/Meeshy/Features/Main/Services/CallManager.swift`, replace the
`socket.callTranslatedSegmentReceived` subscription (currently lines 3568-3587):

```swift
        socket.callTranslatedSegmentReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                let seg = event.segment
                let segment = TranscriptionSegment(
                    id: UUID(),
                    text: seg.translatedText ?? seg.text,
                    speakerId: seg.speakerId,
                    startTime: Double(seg.startMs) / 1000,
                    endTime: Double(seg.endMs) / 1000,
                    isFinal: seg.isFinal,
                    confidence: seg.confidence,
                    language: seg.targetLanguage,
                    translatedText: seg.translatedText,
                    translatedLanguage: seg.translatedText != nil ? seg.targetLanguage : nil
                )
                self.transcriptionService.receiveTranslatedSegment(segment)
            }
            .store(in: &cancellables)
```

with:

```swift
        socket.callTranslatedSegmentReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, self.currentCallId == event.callId else { return }
                let segment = CallManager.makeTranscriptionSegment(from: event)
                self.transcriptionService.receiveTranslatedSegment(segment)
            }
            .store(in: &cancellables)
```

Then add the extracted static function anywhere in `CallManager` (e.g. right above
`setupSocketListeners()` — search for `private func setupSocketListeners()` to find it):

```swift
    /// Maps a gateway-translated segment into the local `TranscriptionSegment` model.
    /// `text` ALWAYS carries the ORIGINAL (untranslated) text — never overwritten by
    /// `translatedText` — so the UI can offer an original/translated toggle
    /// (`docs/superpowers/specs/2026-07-11-call-captions-multispeaker-design.md`).
    /// `static` and pure (no captured state) so it's directly unit-testable without
    /// standing up a full `CallManager` + mock socket.
    static func makeTranscriptionSegment(from event: CallTranslatedSegmentData) -> TranscriptionSegment {
        let seg = event.segment
        return TranscriptionSegment(
            id: UUID(),
            text: seg.text,
            speakerId: seg.speakerId,
            startTime: Double(seg.startMs) / 1000,
            endTime: Double(seg.endMs) / 1000,
            isFinal: seg.isFinal,
            confidence: seg.confidence,
            language: seg.targetLanguage,
            translatedText: seg.translatedText,
            translatedLanguage: seg.translatedText != nil ? seg.targetLanguage : nil
        )
    }
```

- [x] **Step 4: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
SIM=$(xcrun simctl create tmp182_mspk "iPhone 16 Pro" com.apple.CoreSimulator.SimRuntime.iOS-18-2)
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallManagerTranscriptionMappingTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: PASS, both tests green. Keep `$SIM` for the remaining tasks in this plan.

- [x] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Services/CallManager.swift \
        apps/ios/MeeshyTests/Unit/Services/CallManagerTests.swift
git commit -m "fix(ios/calls): stop discarding the original text when mapping translated call segments"
```

---

### Task 2: Per-speaker visible name + primary/secondary color

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:36-39` (new `@State`), `:1343-1385`
  (`transcriptOverlay`)
- Test: `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`

**Interfaces:**
- Consumes: `TranscriptionSegment.text`/`.translatedText`/`.speakerId`/`.isFinal` (unchanged
  shape), `CallManager.remoteUsername`, `AuthManager.shared.currentUser`.
- Produces: `CallView.showOriginalText: Bool` (new `@State`, defaults `false`), `CallView.transcriptSegmentRow(_:)`
  (new `@ViewBuilder` method), `CallView.transcriptSegmentsList` (new computed property) — Task 3
  consumes `showOriginalText` (adds the button that toggles it), Task 4 consumes
  `transcriptSegmentsList` (reuses it inside the new audio-mode structural panel).

- [x] **Step 1: Write the failing test**

Open `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`, inside
`CallHangupFastPathTests` (the same class holding `test_transcriptionToggleButton_wiresToCallManager`
from the previous plan), add:

```swift

    func test_transcriptSegmentRow_usesPrimarySecondaryColorsPerSpeaker() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "func transcriptSegmentRow(") else {
            XCTFail("CallView must define transcriptSegmentRow(_:)")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 2000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("MeeshyColors.indigo400"),
            "transcriptSegmentRow must color the local speaker (\"Moi\") with MeeshyColors.indigo400 " +
            "— the codebase's established \"secondary elements\" tone."
        )
        XCTAssertTrue(
            body.contains("MeeshyColors.brandPrimary"),
            "transcriptSegmentRow must color the remote speaker with MeeshyColors.brandPrimary " +
            "— the signature brand color, used for the interlocutor."
        )
    }

    func test_transcriptSegmentRow_showsSpeakerNameAsVisibleText() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "func transcriptSegmentRow(") else {
            XCTFail("CallView must define transcriptSegmentRow(_:)")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 2000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("Text(speakerName)"),
            "transcriptSegmentRow must render the speaker's name as its own visible Text, " +
            "not just a colored dot — user-requested 2026-07-11."
        )
    }
```

- [x] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: FAIL — both new tests fail with "CallView must define transcriptSegmentRow(_:)".

- [x] **Step 3: Add `showOriginalText` state**

In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, right after the existing
`@State private var showTranscript = false` (currently line 38), add:

```swift
    @State private var showOriginalText = false
```

- [x] **Step 4: Replace `transcriptOverlay`'s per-segment rendering**

Replace `transcriptOverlay` (currently lines 1343-1385):

```swift
    private var transcriptOverlay: some View {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        let localName = AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? String(localized: "call.transcript.you", defaultValue: "Vous", bundle: .main)
        let remoteName = callManager.remoteUsername ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Appel entrant", bundle: .main)
        return VStack(alignment: .leading, spacing: 6) {
            ForEach(transcriptionService.displayedSegments) { segment in
                let isLocal = segment.speakerId == localUserId
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(isLocal ? MeeshyColors.indigo400 : MeeshyColors.success)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                        .accessibilityHidden(true)
                    Text(segment.text)
                        .font(.callout.weight(segment.isFinal ? .regular : .light))
                        .foregroundColor(.white)
                        .opacity(segment.isFinal ? 1.0 : 0.7)
                        .accessibilityLabel("\(isLocal ? localName : remoteName) : \(segment.text)")
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(12)
        // iOS 26 Liquid Glass — floating live-transcript panel over the video
        // stream (same chrome-over-content family as the duration badge / effects
        // toolbar). SDK Compatibility wrapper gates native effect / fallback.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.bottom, 100)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .opacity(showTranscript ? 1 : 0)
        .accessibilityHidden(!showTranscript)
        .animation(.easeInOut(duration: 0.2), value: showTranscript)
        // PERF-005: tell the transcription service when the panel is visible
        // so it can skip per-frame partial-result work while hidden.
        .adaptiveOnChange(of: showTranscript) { _, newValue in
            transcriptionService.isShowingOverlay = newValue
        }
        .onAppear {
            transcriptionService.isShowingOverlay = showTranscript
        }
    }
```

with (a video-only floating banner that now delegates row rendering to the shared helper — the
`isShowingOverlay` side effect moves to `transcriptionToggleButton`'s action in Task 3 Step 3,
since Task 4 introduces a SECOND place — the audio panel — that also needs it kept in sync, and
one authoritative source beats two `.onAppear`/`.onChange` copies):

```swift
    /// Video calls only — floating glass banner over the bottom of the video,
    /// like traditional subtitles. Audio calls use `transcriptPanel` (Task 4)
    /// instead, a structural (non-overlay) layout element.
    private var transcriptOverlay: some View {
        transcriptSegmentsList
            .padding(12)
            // iOS 26 Liquid Glass — floating live-transcript panel over the video
            // stream (same chrome-over-content family as the duration badge / effects
            // toolbar). SDK Compatibility wrapper gates native effect / fallback.
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
            .padding(.bottom, 100)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .opacity(showTranscript ? 1 : 0)
            .accessibilityHidden(!showTranscript)
            .animation(.easeInOut(duration: 0.2), value: showTranscript)
    }

    /// Shared, reused by both the video banner (`transcriptOverlay`) and the
    /// audio structural panel (`transcriptPanel`, Task 4).
    private var transcriptSegmentsList: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(transcriptionService.displayedSegments) { segment in
                transcriptSegmentRow(segment)
            }
        }
    }

    /// One transcript line: visible speaker name (colored) + text. `<Moi>` in
    /// `MeeshyColors.indigo400` (this codebase's established "secondary
    /// elements" tone — see Global Constraints), the interlocutor's name in
    /// `MeeshyColors.brandPrimary` (the signature brand color) — user-requested
    /// 2026-07-11, replaces the previous colored-dot-only distinction.
    /// My own speech is never translated for myself (`text` is already in my
    /// language); the interlocutor's speech shows `translatedText ?? text` by
    /// default, or `text` (original) when `showOriginalText` is on (Task 3).
    @ViewBuilder
    private func transcriptSegmentRow(_ segment: TranscriptionSegment) -> some View {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        let isLocal = segment.speakerId == localUserId
        let localName = AuthManager.shared.currentUser?.displayName ?? AuthManager.shared.currentUser?.username ?? String(localized: "call.transcript.you", defaultValue: "Vous", bundle: .main)
        let remoteName = callManager.remoteUsername ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Appel entrant", bundle: .main)
        let speakerName = isLocal ? localName : remoteName
        let speakerColor = isLocal ? MeeshyColors.indigo400 : MeeshyColors.brandPrimary
        let displayText = isLocal ? segment.text : (showOriginalText ? segment.text : (segment.translatedText ?? segment.text))

        VStack(alignment: .leading, spacing: 2) {
            Text(speakerName)
                .font(.caption.weight(.semibold))
                .foregroundColor(speakerColor)
            Text(displayText)
                .font(.callout.weight(segment.isFinal ? .regular : .light))
                .foregroundColor(.white)
                .opacity(segment.isFinal ? 1.0 : 0.7)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(speakerName) : \(displayText)")
    }
```

- [x] **Step 5: Run to verify it passes**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: PASS, all tests in `CallHangupFastPathTests` including the two new ones.

- [x] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "feat(ios/calls): per-speaker visible name + primary/secondary color in live captions"
```

---

### Task 3: Global original/translated toggle button

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:728-734` (floating button stack),
  `apps/ios/Meeshy/Features/Main/Views/CallView.swift` (new `translationToggleButton` property,
  near `transcriptionToggleButton`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`
- Test: `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`

**Interfaces:**
- Consumes: `CallView.showOriginalText` (Task 2).
- Produces: `CallView.translationToggleButton: some View` — no other task depends on this name
  directly, but Task 4's layout must not visually collide with it (both float on the trailing
  edge).

- [x] **Step 1: Write the failing test**

In `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`, inside
`CallHangupFastPathTests`, add:

```swift

    func test_translationToggleButton_togglesShowOriginalText() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var translationToggleButton: some View {") else {
            XCTFail("CallView must define translationToggleButton")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 1500, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("showOriginalText.toggle()"),
            "translationToggleButton must toggle showOriginalText on tap."
        )
    }

    func test_connectedView_showsTranslationButton_nextToTranscriptionToggle() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "transcriptionToggleButton") else {
            XCTFail("CallView must reference transcriptionToggleButton")
            return
        }
        // Search backward up to 500 chars from the reference for translationToggleButton,
        // confirming both buttons live in the same floating stack.
        let searchStart = view.index(range.lowerBound, offsetBy: -500, limitedBy: view.startIndex) ?? view.startIndex
        let body = String(view[searchStart ..< range.lowerBound])
        XCTAssertTrue(
            body.contains("translationToggleButton"),
            "translationToggleButton must be wired into the same floating trailing-edge stack as transcriptionToggleButton."
        )
    }
```

- [x] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: FAIL — both new tests fail (`translationToggleButton` not defined).

- [x] **Step 3: Add the button and wire it into the floating stack**

In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, find `transcriptionToggleButton`'s
declaration (added in the previous plan, search for `private var transcriptionToggleButton: some View {`)
and add a new property right after its closing `}`:

```swift

    /// Global original/translated toggle for the interlocutor's captions —
    /// my own speech never needs this (already in my language). Visible only
    /// while transcription is active, matching the transcript panel's own
    /// visibility condition.
    private var translationToggleButton: some View {
        callControlButton(
            icon: showOriginalText ? "character.bubble.fill" : "character.bubble",
            color: showOriginalText ? MeeshyColors.indigo400 : .white,
            bgColor: showOriginalText ? MeeshyColors.indigo400 : .white,
            isActive: showOriginalText,
            caption: String(localized: "call.control.translation.caption", defaultValue: "Traduction", bundle: .main),
            label: showOriginalText
                ? String(localized: "call.control.translation.showTranslated", defaultValue: "Afficher la traduction", bundle: .main)
                : String(localized: "call.control.translation.showOriginal", defaultValue: "Afficher le texte original", bundle: .main),
            isToggle: true
        ) {
            showOriginalText.toggle()
        }
    }
```

Then find the floating trailing-edge stack that currently holds only `transcriptionToggleButton`
(search for `transcriptionToggleButton` inside `connectedView`, the block looks like):

```swift
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    transcriptionToggleButton
                }
            }
            .padding(.trailing, 16)
            .padding(.bottom, 150)
            .opacity(showControls ? 1 : 0)
            .allowsHitTesting(showControls)
            .animation(.easeInOut(duration: 0.25), value: showControls)
```

Replace it with (adds `translationToggleButton` above the captions toggle, only while
transcription is active, and moves the `isShowingOverlay` perf side-effect here — the single
authoritative place where `showTranscript` actually changes, per Task 2 Step 4's note):

```swift
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    VStack(spacing: 12) {
                        if transcriptionService.isTranscribing {
                            translationToggleButton
                        }
                        transcriptionToggleButton
                    }
                }
            }
            .padding(.trailing, 16)
            .padding(.bottom, 150)
            .opacity(showControls ? 1 : 0)
            .allowsHitTesting(showControls)
            .animation(.easeInOut(duration: 0.25), value: showControls)
```

Finally, move the `isShowingOverlay` side effect out of `transcriptOverlay` (Task 2 removed its
`.onAppear`/`.adaptiveOnChange`) and into `transcriptionToggleButton`'s own action — find it
(added in the previous plan) and update:

```swift
    private var transcriptionToggleButton: some View {
        callControlButton(
            icon: transcriptionService.isTranscribing ? "captions.bubble.fill" : "captions.bubble",
            color: transcriptionService.isTranscribing ? MeeshyColors.indigo400 : .white,
            bgColor: transcriptionService.isTranscribing ? MeeshyColors.indigo400 : .white,
            isActive: transcriptionService.isTranscribing,
            caption: String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main),
            label: transcriptionService.isTranscribing
                ? String(localized: "call.control.transcript.off", defaultValue: "Désactiver les sous-titres", bundle: .main)
                : String(localized: "call.control.transcript.on", defaultValue: "Activer les sous-titres", bundle: .main),
            isToggle: true
        ) {
            // Read isTranscribing BEFORE calling toggleTranscription(): the
            // start path is async (permission request awaited inside a
            // Task), so isTranscribing is still false right after the call
            // returns — reading it after would always compute willStart
            // wrong. Reading it before, at tap time, is always accurate.
            let willStart = !transcriptionService.isTranscribing
            showTranscript = willStart
            // PERF-005: single authoritative place that flips this — Task 4
            // adds a second transcript surface (the audio structural panel)
            // that would otherwise need its own onAppear/onChange copy of
            // the same side effect.
            transcriptionService.isShowingOverlay = willStart
            callManager.toggleTranscription()
        }
    }
```

- [x] **Step 4: Add the xcstrings keys**

Open `apps/ios/Meeshy/Localizable.xcstrings`, find `"call.control.transcript.on"` (added in the
previous plan) and insert the three new keys right after its closing `},` (alphabetically,
`translation` sorts after `transcript` and before `unmute`):

```json
    "call.control.translation.caption" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Übersetzung"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Translation"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Traducción"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Traduction"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Tradução"
          }
        }
      }
    },
    "call.control.translation.showOriginal" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Originaltext anzeigen"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Show original text"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Mostrar texto original"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Afficher le texte original"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Mostrar texto original"
          }
        }
      }
    },
    "call.control.translation.showTranslated" : {
      "extractionState" : "manual",
      "localizations" : {
        "de" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Übersetzung anzeigen"
          }
        },
        "en" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Show translation"
          }
        },
        "es" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Mostrar traducción"
          }
        },
        "fr" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Afficher la traduction"
          }
        },
        "pt-BR" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Mostrar tradução"
          }
        }
      }
    },
```

Validate the JSON is still well-formed:

```bash
python3 -c "import json; json.load(open('apps/ios/Meeshy/Localizable.xcstrings'))" && echo OK
```

- [x] **Step 5: Run to verify tests pass, then run the localization consistency suite**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:MeeshyTests/CallHangupFastPathTests \
  -only-testing:MeeshyTests/LocalizationConsistencyTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: both suites PASS.

- [x] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/Meeshy/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "feat(ios/calls): add global original/translated toggle for live captions"
```

---

### Task 4: Structural (non-overlay) transcript layout for audio calls

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CallView.swift:658-735` (`connectedView`),
  `apps/ios/Meeshy/Features/Main/Views/CallView.swift` (new `compactAudioCallHeader`,
  `transcriptPanel` properties, near `audioCallLayout`)
- Test: `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`

**Interfaces:**
- Consumes: `CallView.transcriptSegmentsList` (Task 2), `CallView.showTranscript`,
  `CallManager.isVideoUIActive`, `CallView.audioCallLayout`/`callAvatarPair(size:)` (unchanged,
  reused).
- Produces: nothing new for later tasks — this is the last structural task before device QA.

This task ONLY changes the audio-call path (`!callManager.isVideoUIActive`). The video path
keeps using `transcriptOverlay` (Task 2's video-only floating banner) unchanged — video calls
must not shrink the video feed, per the spec.

- [x] **Step 1: Write the failing test**

In `apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift`, inside
`CallHangupFastPathTests`, add:

```swift

    func test_connectedView_audioPath_usesStructuralTranscriptPanel_notFloatingOverlay() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 3000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("compactAudioCallHeader"),
            "connectedView must show a compacted header (avatar + name, no status pills) " +
            "when captions are active on an audio call — user-requested 2026-07-11."
        )
        XCTAssertTrue(
            body.contains("transcriptPanel"),
            "connectedView must show the structural (non-overlay) transcriptPanel " +
            "for the audio-call captions layout."
        )
    }

    func test_connectedView_stillReferencesUnmovedElements() throws {
        // Regression guard: the layout restructuring must not drop or relocate
        // pipView / reconnectingBanner / showEffectsToolbar's trigger — spec risk table.
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 4000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(body.contains("pipView"), "connectedView must still reference pipView")
    }
```

- [x] **Step 2: Run to verify it fails**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -20
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: `test_connectedView_audioPath_usesStructuralTranscriptPanel_notFloatingOverlay` FAILS
(`compactAudioCallHeader`/`transcriptPanel` not present yet). `test_connectedView_stillReferencesUnmovedElements`
PASSES already (nothing removed yet) — that's fine, it's a regression guard for the NEXT step,
not a RED step itself.

- [x] **Step 3: Add `compactAudioCallHeader` and `transcriptPanel`**

In `apps/ios/Meeshy/Features/Main/Views/CallView.swift`, find `audioCallLayout`'s closing `}`
(search for `private var audioCallLayout: some View {`, the property ends right before `// MARK:
- Connection Quality`) and add two new properties right after it:

```swift

    /// Compacted header shown INSTEAD of `audioCallLayout` while captions are
    /// active — avatar shrunk (120 → 56), status pills dropped, no longer
    /// vertically centered (sits at the top) so `transcriptPanel` gets the
    /// freed vertical space. User-requested 2026-07-11.
    private var compactAudioCallHeader: some View {
        HStack(spacing: 12) {
            callAvatarPair(size: 56)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                    .font(.system(.headline, design: .rounded).weight(.semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    TransientCallSignalGlyph(strength: signalStrength)
                    Text(callManager.formattedDuration)
                        .font(.caption.weight(.medium).monospacedDigit())
                        .foregroundColor(durationColor)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.updatesFrequently)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
    }

    /// Audio-call captions surface — a real layout element (NOT a floating
    /// overlay) occupying the space between `compactAudioCallHeader` and
    /// `controlBar`. Video calls use `transcriptOverlay` instead (a bottom
    /// glass banner that doesn't shrink the video) — see that property's doc
    /// comment. User-requested 2026-07-11: "la zone de transcription ne doit
    /// pas être en overlay des autres points d'action".
    private var transcriptPanel: some View {
        ScrollView {
            transcriptSegmentsList
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 12))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
```

- [x] **Step 4: Restructure `connectedView`'s audio-path VStack**

In the same file, inside `connectedView` (starts at line 658), replace the main content
`VStack` (currently):

```swift
            VStack(spacing: 0) {
                if !callManager.isVideoUIActive {
                    Spacer()
                    audioCallLayout
                }

                Spacer()

                // §7.3 — auto-hiding control bar on iPhone video calls; always
                // visible for audio and on Mac (and while the effects tray is
                // open). Hidden controls don't capture taps.
                controlBar
                    .padding(.bottom, 60)
                    .opacity(showControls ? 1 : 0)
                    .allowsHitTesting(showControls)
                    .animation(.easeInOut(duration: 0.25), value: showControls)
            }
```

with:

```swift
            VStack(spacing: 0) {
                if !callManager.isVideoUIActive {
                    if showTranscript {
                        // Captions active on an audio call: compact header at
                        // the top, structural transcript panel filling the
                        // freed space — replaces the old vertically-centered
                        // avatar layout while captions are on.
                        compactAudioCallHeader
                            .padding(.top, 16)
                        transcriptPanel
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                            .padding(.bottom, 12)
                            .frame(maxHeight: .infinity)
                    } else {
                        Spacer()
                        audioCallLayout
                        Spacer()
                    }
                } else {
                    Spacer()
                }

                // §7.3 — auto-hiding control bar on iPhone video calls; always
                // visible for audio and on Mac (and while the effects tray is
                // open). Hidden controls don't capture taps.
                controlBar
                    .padding(.bottom, 60)
                    .opacity(showControls ? 1 : 0)
                    .allowsHitTesting(showControls)
                    .animation(.easeInOut(duration: 0.25), value: showControls)
            }
```

This preserves BOTH original cases exactly (video: single unconditional `Spacer()` then
`controlBar`; audio without captions: `Spacer(); audioCallLayout; Spacer()`, vertically centered)
and adds the new audio-with-captions case without touching `pipView`, `transcriptOverlay`, the
floating button stack, `reconnectingBanner`, or any other sibling in `connectedView`'s `ZStack` —
all of those stay exactly where they already are, untouched by this edit.

- [x] **Step 5: Run to verify tests pass**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build 2>&1 | tail -40
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=$SIM" -only-testing:MeeshyTests/CallHangupFastPathTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -40
```

Expected: PASS, including both new tests from Step 1.

- [x] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git add apps/ios/Meeshy/Features/Main/Views/CallView.swift \
        apps/ios/MeeshyTests/Unit/Services/CallSignalIndicatorTests.swift
git commit -m "feat(ios/calls): structural (non-overlay) captions layout for audio calls"
```

---

### Task 5: Full suite, device QA, final commit

**Files:** none (verification only)

- [x] **Step 1: Run the full iOS suite**

```bash
cd /Users/smpceo/Documents/v2_meeshy/apps/ios && xcodegen generate && cd -
./apps/ios/meeshy.sh test
```

Expected: all 3 phases green, per `apps/ios/CLAUDE.md`'s phased test run. Revert any
`project.pbxproj`/`Package.resolved` churn that's pure xcodegen/SPM regeneration noise (diff it
first — if it only reorders GUIDs for files unrelated to this plan, `git checkout --` it; do NOT
discard the actual source changes from Tasks 1-4).

- [x] **Step 2: Build and install on a real device**

```bash
./apps/ios/meeshy.sh device
```

**Deferred (2026-07-11):** user explicitly chose to continue development and defer Steps 3-4
(manual two-device QA) + Step 5 (final commit gate) to later, per "poursuis le developpement on
fais la QA et les corrections après!!" — everything up to here (all 4 code tasks + full
automated suite green + build/install/launch on a real device succeeded) is done and committed.
Resume at Step 3 when the user is ready to QA.

- [ ] **Step 3: Manual verification protocol — audio call**

Between two real devices, BOTH with captions capable (different `systemLanguage`, e.g. one
`fr`, one `en`):

1. Start an audio call. On device A, tap the captions button. Confirm the header compacts
   (small avatar top-left-ish, name + duration, no status pills) and a transcript panel appears
   below it, above the control bar — not floating over the avatar.
2. Speak on device A. Confirm A's own line shows `<A's name>` in the secondary
   (`indigo400`) color, text unchanged (never translated for itself).
3. On device B, tap ITS OWN captions button too. Speak on B. Confirm A now also shows B's line,
   `<B's name>` in the primary (`brandPrimary`/indigo500) color, text translated into A's
   language.
4. On device A, tap the translation toggle button (appears once captions are active). Confirm
   B's line switches to showing the ORIGINAL (untranslated) text. Tap again — back to
   translated. Confirm A's own lines are unaffected by this toggle either way.
5. Turn captions off on device A. Confirm the layout reverts to the normal centered avatar
   (120px, status pills back), transcript panel and translation button both disappear.

- [ ] **Step 4: Manual verification protocol — video call**

1. Start a video call, both devices with captions on (as above).
2. Confirm the video still fills the screen — no shrinking.
3. Confirm the transcript appears as a glass banner rising from the bottom, above the control
   bar, showing both speakers' colored/named lines exactly like the audio case.
4. Confirm the translation toggle button works the same way here too.

- [ ] **Step 5: Final commit**

If Step 1 produced any legitimate (non-churn) file changes, commit them separately with a clear
message. Otherwise, this task produces no additional commit — Tasks 1-4 are already committed.
