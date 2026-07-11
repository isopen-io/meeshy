import XCTest
@testable import Meeshy

// MARK: - CallSignalStrength mapping

/// Le glyphe signal (barres + code couleur) est un MAPPING PUR des niveaux de
/// qualité déjà mesurés (`VideoQualityLevel` stats RTT+perte, `PeerConnectionState`
/// en repli) — aucune heuristique nouvelle. Ces tests verrouillent le mapping.
@MainActor
final class CallSignalStrengthTests: XCTestCase {

    // MARK: - Stats level takes precedence

    func test_from_excellentLevel_returnsExcellent() {
        XCTAssertEqual(CallSignalStrength.from(level: .excellent, connection: .failed), .excellent)
    }

    func test_from_goodLevel_returnsGood() {
        XCTAssertEqual(CallSignalStrength.from(level: .good, connection: .disconnected), .good)
    }

    func test_from_fairLevel_returnsFair() {
        XCTAssertEqual(CallSignalStrength.from(level: .fair, connection: .connected), .fair)
    }

    func test_from_poorLevel_returnsPoor() {
        XCTAssertEqual(CallSignalStrength.from(level: .poor, connection: .connected), .poor)
    }

    func test_from_criticalLevel_returnsLost() {
        XCTAssertEqual(CallSignalStrength.from(level: .critical, connection: .connected), .lost)
    }

    // MARK: - ICE state fallback (no stats tick yet)

    func test_from_nilLevel_connected_returnsGood() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .connected), .good)
    }

    func test_from_nilLevel_reconnecting_returnsFair() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .reconnecting), .fair)
    }

    func test_from_nilLevel_failed_returnsLost() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .failed), .lost)
    }

    func test_from_nilLevel_connecting_returnsConnecting() {
        XCTAssertEqual(CallSignalStrength.from(level: nil, connection: .connecting), .connecting)
    }

    // MARK: - Bars fraction (cellularbars variable value)

    func test_barsFraction_decreasesMonotonically_withDegradation() {
        XCTAssertGreaterThan(CallSignalStrength.excellent.barsFraction, CallSignalStrength.good.barsFraction)
        XCTAssertGreaterThan(CallSignalStrength.good.barsFraction, CallSignalStrength.fair.barsFraction)
        XCTAssertGreaterThan(CallSignalStrength.fair.barsFraction, CallSignalStrength.poor.barsFraction)
        XCTAssertGreaterThan(CallSignalStrength.poor.barsFraction, CallSignalStrength.lost.barsFraction)
    }

    // MARK: - isDegraded (drives glyph visibility)

    func test_isDegraded_trueForFairPoorLost() {
        XCTAssertTrue(CallSignalStrength.fair.isDegraded)
        XCTAssertTrue(CallSignalStrength.poor.isDegraded)
        XCTAssertTrue(CallSignalStrength.lost.isDegraded)
    }

    func test_isDegraded_falseForHealthyAndInitialConnecting() {
        // `.connecting` n'est pas dégradé : la négociation initiale ne doit
        // pas faire surgir le glyphe — seule une dégradation réelle le montre.
        XCTAssertFalse(CallSignalStrength.excellent.isDegraded)
        XCTAssertFalse(CallSignalStrength.good.isDegraded)
        XCTAssertFalse(CallSignalStrength.connecting.isDegraded)
    }

    // MARK: - Recovery linger window

    func test_recoveryLinger_is30Seconds() {
        // Retour user 2026-07-04 : après récupération le glyphe reste VERT
        // 30 s puis disparaît — assez long pour rassurer, pas permanent.
        XCTAssertEqual(TransientCallSignalGlyph.recoveryLingerSeconds, 30)
    }

    // MARK: - Accessibility label must describe signal QUALITY, never a connection EVENT

    /// `.fair`/`.poor`/`.lost` are reachable both via a live, fully `.connected`
    /// link (real-time RTT/loss stats) AND via the pre-first-sample ICE fallback
    /// — the case alone cannot tell which. A VoiceOver label claiming
    /// "Reconnecting"/"Connection lost" on a healthy-but-degraded `.connected`
    /// call is actively false; only signal-strength wording is honest in both
    /// branches. Asserted on the resolved live property (not source text) —
    /// none of the 5 locale translations for these keys contain the old
    /// connection-event wording, so this holds regardless of test-runtime locale.
    func test_accessibilityLabel_fairOnHealthyConnection_doesNotClaimReconnecting() {
        let strength = CallSignalStrength.from(level: .fair, connection: .connected)
        XCTAssertEqual(strength, .fair)
        XCTAssertFalse(
            strength.accessibilityLabel.localizedCaseInsensitiveContains("reconnec"),
            "`.fair` on a `.connected` link is a live quality metric, not a reconnection " +
            "event — the label must describe signal strength, e.g. \"Fair signal\"."
        )
    }

    func test_accessibilityLabel_poorOnHealthyConnection_doesNotClaimConnectionLost() {
        let strength = CallSignalStrength.from(level: .poor, connection: .connected)
        XCTAssertEqual(strength, .poor)
        XCTAssertFalse(
            strength.accessibilityLabel.localizedCaseInsensitiveContains("lost")
                && !strength.accessibilityLabel.localizedCaseInsensitiveContains("signal"),
            "`.poor` on a `.connected` link must not be announced as \"Connection lost\"."
        )
        XCTAssertFalse(strength.accessibilityLabel.localizedCaseInsensitiveContains("perdu"))
    }

    func test_accessibilityLabel_poorAndLost_areDistinctStrings() {
        // Before this fix both cases shared the single "Connexion perdue"/
        // "Connection lost" label — a VoiceOver user could not tell mild
        // degradation (`.poor`) from a near-total loss (`.lost`) apart.
        XCTAssertNotEqual(
            CallSignalStrength.poor.accessibilityLabel,
            CallSignalStrength.lost.accessibilityLabel
        )
    }
}

// MARK: - DataChannel inbound routing

/// Le raccroché in-band (`{"type":"bye"}`) partage le data channel avec la
/// transcription et le ping keep-alive — le routage doit isoler chaque cas
/// sans jamais confondre un segment avec un ordre de teardown.
final class DataChannelInboundTests: XCTestCase {

    func test_decode_bye_withReason_returnsBye() {
        let data = Data(#"{"type":"bye","reason":"completed"}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .bye(reason: "completed"))
    }

    func test_decode_bye_withoutReason_returnsBye() {
        let data = Data(#"{"type":"bye"}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .bye(reason: nil))
    }

    func test_decode_ping_isIgnored() {
        let data = Data(#"{"type":"ping"}"#.utf8)
        XCTAssertEqual(DataChannelInbound.decode(data), .ignored)
    }

    func test_decode_garbage_isIgnored() {
        XCTAssertEqual(DataChannelInbound.decode(Data("not json".utf8)), .ignored)
        XCTAssertEqual(DataChannelInbound.decode(Data(#"{"type":"unknown-future"}"#.utf8)), .ignored)
    }
}

// MARK: - Hangup fast-path wiring (source inspection)

/// Le « bye » in-band n'a de valeur que s'il part AVANT le teardown local
/// (qui ferme la peer connection) et que le canal existe côté offreur.
@MainActor
final class CallHangupFastPathTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_endCall_sendsInBandBye_beforeLocalTeardown() throws {
        let manager = try source("Meeshy/Features/Main/Services/CallManager.swift")
        guard let endCallRange = manager.range(of: "func endCall()") else {
            XCTFail("CallManager must define endCall()")
            return
        }
        let end = manager.index(endCallRange.lowerBound, offsetBy: 3000, limitedBy: manager.endIndex) ?? manager.endIndex
        let body = String(manager[endCallRange.lowerBound ..< end])
        guard let byeIndex = body.range(of: "sendHangupBye()"),
              let teardownIndex = body.range(of: "endCallInternal(reason: .local)") else {
            XCTFail("endCall() must send the in-band bye AND perform the local teardown")
            return
        }
        XCTAssertLessThan(
            byeIndex.lowerBound, teardownIndex.lowerBound,
            "The DataChannel bye must be sent BEFORE endCallInternal — the teardown closes " +
            "the peer connection, after which the bye can no longer reach the peer."
        )
    }

    func test_createOffer_createsControlChannel_beforeTheOffer() throws {
        let service = try source("Meeshy/Features/Main/Services/WebRTCService.swift")
        guard let offerRange = service.range(of: "func createOffer()") else {
            XCTFail("WebRTCService must define createOffer()")
            return
        }
        let end = service.index(offerRange.lowerBound, offsetBy: 1200, limitedBy: service.endIndex) ?? service.endIndex
        let body = String(service[offerRange.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("createDataChannel(label: \"transcription\")"),
            "createOffer() must create the data channel BEFORE the SDP offer so the " +
            "m=application section is negotiated — without it neither the in-band bye " +
            "nor the remote transcription segments have a transport."
        )
    }

    func test_dataChannelCreation_isIdempotent_acrossRenegotiations() throws {
        let client = try source("Meeshy/Features/Main/Services/WebRTC/P2PWebRTCClient.swift")
        guard let range = client.range(of: "func createDataChannel(label: String) -> Bool {") else {
            XCTFail("P2PWebRTCClient must define createDataChannel")
            return
        }
        let end = client.index(range.lowerBound, offsetBy: 700, limitedBy: client.endIndex) ?? client.endIndex
        let body = String(client[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("if transcriptionDataChannel != nil { return true }"),
            "createDataChannel must be idempotent — renegotiation offers (ICE restart, " +
            "video escalation) must not stack a second channel on the same peer connection."
        )
    }

    func test_transcriptionToggleButton_wiresToCallManager() throws {
        // Floats on the trailing edge (user feedback 2026-07-10) rather than
        // living inside controlButtonsRow, to keep the main horizontal row
        // uncrowded — see transcriptionToggleButton's own doc comment.
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var transcriptionToggleButton: some View {") else {
            XCTFail("CallView must define transcriptionToggleButton")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 2000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("callManager.toggleTranscription()"),
            "transcriptionToggleButton must call callManager.toggleTranscription() " +
            "— this is the UI entry point that was missing before this feature was rebuilt."
        )
    }

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

    func test_connectedView_audioPath_usesStructuralTranscriptPanel_notFloatingOverlay() throws {
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 4000, limitedBy: view.endIndex) ?? view.endIndex
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

    func test_transcriptOverlay_callSite_isGatedOnVideoUIActive() throws {
        // Regression guard for the 2026-07-11 fix: transcriptOverlay used to
        // run unconditionally, so on an audio call with captions on, the SAME
        // transcriptSegmentsList rendered TWICE — once via the structural
        // transcriptPanel, once via the floating transcriptOverlay.
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "if callManager.isVideoUIActive {\n                transcriptOverlay\n            }") else {
            XCTFail("transcriptOverlay's call site must be gated on callManager.isVideoUIActive")
            return
        }
        _ = range
    }

    func test_transcriptSegmentRow_showsElapsedTimeSinceCallStart() throws {
        // User-requested 2026-07-11: each line carries a small "since call
        // start" timestamp, derived from capturedAt (wall clock) against
        // callManager.callStartDate — never from startTime/endTime (those are
        // ASR-buffer-relative, see TranscriptionSegment.capturedAt).
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "func transcriptSegmentRow(") else {
            XCTFail("CallView must define transcriptSegmentRow(_:)")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 2000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("segment.capturedAt.timeIntervalSince(callManager.callStartDate"),
            "transcriptSegmentRow must compute elapsed time from segment.capturedAt against " +
            "callManager.callStartDate, not from the ASR-relative startTime/endTime."
        )
        XCTAssertTrue(
            body.contains("CallManager.formatDuration"),
            "transcriptSegmentRow must reuse CallManager.formatDuration for the elapsed-time label " +
            "instead of a new formatter."
        )
    }

    func test_connectedView_stillReferencesUnmovedElements() throws {
        // Regression guard: the layout restructuring must not drop or relocate
        // pipView / showEffectsToolbar's trigger — spec risk table. (The
        // reconnectingBanner this guard used to also name was removed
        // 2026-07-11 — see test_reconnecting_usesCompactStatusPill_notFullScreenBanner.)
        let view = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let range = view.range(of: "private var connectedView: some View {") else {
            XCTFail("CallView must define connectedView")
            return
        }
        let end = view.index(range.lowerBound, offsetBy: 9000, limitedBy: view.endIndex) ?? view.endIndex
        let body = String(view[range.lowerBound ..< end])
        XCTAssertTrue(body.contains("pipView"), "connectedView must still reference pipView")
    }
}

// MARK: - CallSignalGlyph Reduce Motion (source inspection)

/// Audit P2-iOS-9 covered every other animated element in the call chrome
/// (pulsingAvatar, IncomingCallView's ring/bounce, IslandEmergingBanner,
/// FloatingCallPillView's slide-in, CallWaitingBannerView's slide-in) but
/// missed the signal glyph — its bars-changing and appear/disappear
/// animations ran unconditionally regardless of Reduce Motion.
@MainActor
final class CallSignalGlyphReduceMotionTests: XCTestCase {

    private func glyphSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/CallSignalGlyph.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_glyph_declaresReduceMotionEnvironment() throws {
        let source = try glyphSource()
        XCTAssertTrue(
            source.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"),
            "CallSignalGlyph and TransientCallSignalGlyph must read accessibilityReduceMotion " +
            "like every other animated element in the call chrome."
        )
    }

    func test_barsAnimation_isGatedByReduceMotion() throws {
        let source = try glyphSource()
        XCTAssertTrue(
            source.contains(".animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: strength)"),
            "the bars-strength-change animation must be skipped under Reduce Motion, matching " +
            "the codebase's established `reduceMotion ? nil : .easeInOut(...)` pattern."
        )
    }

    func test_appearDisappearAnimations_areGatedByReduceMotion() throws {
        let source = try glyphSource()
        XCTAssertTrue(
            source.contains("withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { isVisible = true }"),
            "the glyph's appear transition must be skipped under Reduce Motion."
        )
        XCTAssertTrue(
            source.contains("withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) { isVisible = false }"),
            "the glyph's disappear transition must be skipped under Reduce Motion."
        )
    }
}
