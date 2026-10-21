import XCTest
@testable import Meeshy

/// L'appelé passe en `.connecting` dès qu'il décroche, même quand l'offre SDP de l'appelant n'est pas
/// encore arrivée (réveil par push VoIP, socket qui se rejoint jusqu'à 30 s sur un mauvais réseau).
/// Cette phase appartient au minuteur d'offre (`sdpOfferTimeoutSeconds`, 30 s) — pas au chien de garde
/// `.connecting`, qui suppose une négociation commencée :
/// - à 12 s il lançait un ICE restart SANS description distante : l'appelé émettait sa propre offre,
///   passait en `.reconnecting` (le minuteur d'offre, gardé par `.connecting`, ne tirait plus), l'appelant
///   en `.offering` ignorait cette offre, et l'appel finissait « manqué » chez l'appelant ;
/// - à 25 s il échouait l'appel, avant même que le minuteur d'offre de 30 s ne puisse conclure ;
/// - l'offre tardive, enfin, ne désarmait pas le minuteur d'offre : une liaison ICE lente après une offre
///   reçue à 25 s se faisait couper à 30 s.
final class CallAwaitingOfferPolicyTests: XCTestCase {

    // MARK: - Politique pure

    func test_reconnecting_isNotAllowed_whileTheCalleeStillAwaitsTheOffer() {
        XCTAssertFalse(CallReliabilityPolicy.reconnectingAllowed(from: .connecting, awaitingRemoteOffer: true))
    }

    func test_reconnecting_staysAllowed_inConnecting_onceTheOfferIsApplied() {
        XCTAssertTrue(CallReliabilityPolicy.reconnectingAllowed(from: .connecting, awaitingRemoteOffer: false))
        XCTAssertTrue(CallReliabilityPolicy.reconnectingAllowed(from: .connected, awaitingRemoteOffer: true),
                      "seule la phase .connecting d'avant l'offre est concernée")
    }

    func test_connectingWatchdog_waits_whileTheOfferIsAwaited_evenPastItsBudgets() {
        XCTAssertEqual(CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 13, didAttemptRestart: false, awaitingRemoteOffer: true
        ), .waiting)
        XCTAssertEqual(CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 26, didAttemptRestart: true, awaitingRemoteOffer: true
        ), .waiting)
    }

    // MARK: - Câblage

    func test_attemptReconnection_consultsTheAwaitedOffer() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+Reconnection.swift")
        XCTAssertTrue(
            source.contains("reconnectingAllowed(from: callState, awaitingRemoteOffer: isAwaitingRemoteOffer)"),
            "attemptReconnection doit refuser l'ICE restart tant que l'offre de l'appelant n'est pas arrivée"
        )
    }

    func test_connectingWatchdog_restartsItsClock_whileTheOfferIsAwaited() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+Connection.swift")
        XCTAssertTrue(source.contains("awaitingRemoteOffer: self.isAwaitingRemoteOffer"),
                      "le chien de garde .connecting doit passer l'attente d'offre à sa politique")
        XCTAssertTrue(source.contains("if self.isAwaitingRemoteOffer {\n                        connectingSince = nil"),
                      "son horloge ne démarre qu'une fois l'offre reçue — sinon une offre arrivée à 20 s se fait couper à 25 s")
    }

    func test_aLateOffer_disarmsTheOfferTimeout() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+IncomingSignal.swift")
        guard let range = source.range(of: "case .connecting:"),
              let end = source.range(of: "case .connected, .reconnecting:", range: range.upperBound..<source.endIndex) else {
            XCTFail("branche .connecting de handleSignalOffer introuvable"); return
        }
        let branch = source[range.upperBound..<end.lowerBound]
        XCTAssertTrue(branch.contains("sdpOfferTimeoutTask?.cancel()") && branch.contains("sdpOfferTimeoutTask = nil"),
                      "l'offre tardive doit désarmer le minuteur d'offre")
    }

    /// `answerCall` vérifie l'appel AVANT `await emitCallAnswer`, puis effaçait l'offre en attente APRÈS sans
    /// revérifier : si l'appel se terminait et qu'un nouvel appel entrant mettait son offre en attente pendant
    /// cet accusé, c'est l'offre du NOUVEL appel qui disparaissait (échec au bout du délai d'offre).
    func test_answeringABufferedOffer_onlyClearsTheOfferOfItsOwnCall() throws {
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager+Answer.swift")
        XCTAssertTrue(
            source.contains("if self.currentCallId == callId { self.pendingRemoteOffer = nil }"),
            "l'offre en attente ne s'efface que si elle appartient encore à l'appel répondu"
        )
    }
}
