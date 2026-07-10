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
