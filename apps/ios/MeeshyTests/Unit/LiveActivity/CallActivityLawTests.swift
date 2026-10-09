import XCTest
@testable import Meeshy

/// **L'appel Meeshy en cours vit dans l'îlot dynamique** (#9782).
@MainActor
final class CallActivityLawTests: XCTestCase {

    private let wording = CallActivityLaw.Wording(
        ringing: "Sonnerie…",
        connecting: "Connexion…",
        audioCall: "Appel vocal",
        videoCall: "Appel vidéo",
        onHold: "En attente",
        reconnecting: "Reconnexion…",
        ended: "Appel terminé"
    )

    private let since = Date(timeIntervalSince1970: 1_000)

    private func caption(
        _ text: String = "Bonjour, tu m'entends ?",
        isFinal: Bool = true,
        onDevice: Bool = false
    ) -> CallActivityLaw.Caption {
        CallActivityLaw.Caption(
            speaker: "Alice",
            text: text,
            languageTag: "EN → FR",
            isFinal: isFinal,
            isTranslatedOnDevice: onDevice
        )
    }

    private func input(
        _ phase: CallActivityLaw.CallPhase = .connected,
        isVideo: Bool = false,
        isMuted: Bool = false,
        isOnHold: Bool = false,
        systemShowsCall: Bool = true,
        encrypted: Bool? = false,
        captionsActive: Bool = false,
        caption: CallActivityLaw.Caption? = nil
    ) -> CallActivityLaw.Input {
        CallActivityLaw.Input(
            phase: phase,
            title: "Alice Martin",
            accentHex: "6366F1",
            isVideo: isVideo,
            isMuted: isMuted,
            isOnHold: isOnHold,
            connectedSince: phase == .connected ? since : nil,
            systemShowsCall: systemShowsCall,
            isEndToEndEncrypted: encrypted,
            captionsActive: captionsActive,
            caption: caption
        )
    }

    private func step(_ running: CallActivitySnapshot?, _ input: CallActivityLaw.Input) -> CallActivityLaw.Step {
        CallActivityLaw.step(running: running, input: input, wording: wording)
    }

    func test_step_idleWithoutActivity_doesNothing() {
        let result = step(nil, input(.idle))
        XCTAssertNil(result.running)
        XCTAssertEqual(result.action, .none)
    }

    func test_step_incomingRinging_leavesTheRingToCallKit() {
        let result = step(nil, input(.ringing(isOutgoing: false)))
        XCTAssertEqual(result.action, .none, "l'écran entrant de CallKit porte déjà la sonnerie")
    }

    func test_step_outgoingRinging_opensTheActivity() {
        let result = step(nil, input(.ringing(isOutgoing: true)))
        guard case .start(let snapshot) = result.action else { return XCTFail("attendu .start, reçu \(result.action)") }
        XCTAssertEqual(snapshot.phase, .ringing)
        XCTAssertEqual(snapshot.statusLabel, "Sonnerie…")
        XCTAssertEqual(snapshot.title, "Alice Martin")
        XCTAssertEqual(snapshot.initials, "AM")
        XCTAssertNil(snapshot.connectedSince)
    }

    func test_step_connectedVideoCall_showsDurationAnchorAndVideoLabel() {
        let result = step(nil, input(.connected, isVideo: true))
        XCTAssertEqual(result.running?.phase, .connected)
        XCTAssertEqual(result.running?.statusLabel, "Appel vidéo")
        XCTAssertEqual(result.running?.connectedSince, since)
    }

    func test_step_onHold_isItsOwnPhase() {
        XCTAssertEqual(step(nil, input(.connected, isOnHold: true)).running?.phase, .onHold)
        XCTAssertEqual(step(nil, input(.connected, isOnHold: true)).running?.statusLabel, "En attente")
    }

    func test_step_reconnecting_isShown() {
        XCTAssertEqual(step(nil, input(.reconnecting)).running?.statusLabel, "Reconnexion…")
    }

    func test_step_sameInput_doesNotWakeTheActivity() {
        let opened = step(nil, input())
        XCTAssertEqual(step(opened.running, input()).action, .none)
    }

    func test_step_muteToggled_updatesTheActivity() {
        let opened = step(nil, input())
        let muted = step(opened.running, input(isMuted: true))
        guard case .update(let snapshot) = muted.action else { return XCTFail("attendu .update") }
        XCTAssertTrue(snapshot.isMuted)
    }

    func test_step_callEnds_closesTheActivityWithoutItsCaption() {
        let opened = step(nil, input(captionsActive: true, caption: caption()))
        XCTAssertNotNil(opened.running?.caption)

        let ended = step(opened.running, input(.ended))
        XCTAssertNil(ended.running)
        guard case .end(let final) = ended.action else { return XCTFail("attendu .end") }
        XCTAssertEqual(final.phase, .ended)
        XCTAssertEqual(final.statusLabel, "Appel terminé")
        XCTAssertNil(final.caption, "la dernière phrase ne survit pas à l'appel")
    }

    func test_step_idleAfterCall_neverLeavesAnOrphan() {
        let opened = step(nil, input())
        guard case .end = step(opened.running, input(.idle)).action else { return XCTFail("attendu .end") }
    }

    func test_snapshot_whenCallKitShowsTheCall_compactDoesNotRepeatTheDuration() {
        XCTAssertEqual(CallActivityLaw.snapshot(for: input(systemShowsCall: true), wording: wording)?.showsDurationInCompact, false)
        XCTAssertEqual(CallActivityLaw.snapshot(for: input(systemShowsCall: false), wording: wording)?.showsDurationInCompact, true)
    }

    func test_servedCaption_plainCallWithCaptionsActive_showsTheServedSentence() {
        let served = CallActivityLaw.servedCaption(input(captionsActive: true, caption: caption()))
        XCTAssertEqual(served, CallActivitySnapshot.Caption(speaker: "Alice", text: "Bonjour, tu m'entends ?", languageTag: "EN → FR"))
    }

    func test_servedCaption_captionsInactive_showsNothing() {
        XCTAssertNil(CallActivityLaw.servedCaption(input(captionsActive: false, caption: caption())))
    }

    func test_servedCaption_partialRevision_isNotShown() {
        XCTAssertNil(CallActivityLaw.servedCaption(input(captionsActive: true, caption: caption(isFinal: false))))
    }

    func test_servedCaption_encryptedCallTranslatedOffDevice_isNeverShown() {
        XCTAssertNil(CallActivityLaw.servedCaption(input(encrypted: true, captionsActive: true, caption: caption())))
    }

    func test_servedCaption_unknownEncryption_countsAsEncrypted() {
        XCTAssertNil(CallActivityLaw.servedCaption(input(encrypted: nil, captionsActive: true, caption: caption())))
    }

    func test_servedCaption_encryptedCallTranslatedOnDevice_isShown() {
        XCTAssertNotNil(CallActivityLaw.servedCaption(input(encrypted: true, captionsActive: true, caption: caption(onDevice: true))))
    }

    func test_servedCaption_longSentence_keepsItsEnd() {
        let long = String(repeating: "a", count: 300) + " fin"
        let served = CallActivityLaw.servedCaption(input(captionsActive: true, caption: caption(long)))
        XCTAssertEqual(served?.text.count, CallActivityLaw.captionLimit)
        XCTAssertEqual(served?.text.hasSuffix(" fin"), true, "la fin de la phrase est ce qui vient d'être dit")
    }

    func test_initials_handlesSimpleAndEmptyNames() {
        XCTAssertEqual(CallActivityLaw.initials(of: "alice"), "A")
        XCTAssertEqual(CallActivityLaw.initials(of: "Jean Pierre Martin"), "JP")
        XCTAssertEqual(CallActivityLaw.initials(of: "  "), "")
    }
}
