import Combine
import SwiftUI
import XCTest
import MeeshySDK
@testable import Meeshy

/// #7955 — le démarrage à froid ne construit plus la pile d'appel.
///
/// Mesuré le 2026-09-25 : `RootChromeLayer` → `CallPresentationLayer.init` →
/// `CallManager.shared` instanciait PiP (AVKit), `WebRTCService`,
/// `P2PWebRTCClient` et `VideoFilterPipeline` (Vision + `CIContext(mtlDevice:)`)
/// sur le fil principal pendant la première image, hors de tout appel.
@MainActor
final class CallStackLazyInstantiationTests: XCTestCase {

    private final class Counter { var value = 0 }

    private func countingHost(_ counter: Counter) -> CallManagerHost {
        CallManagerHost(factory: {
            counter.value += 1
            return CallManager.shared
        })
    }

    private func offer(callId: String = "call-1") throws -> CallOfferData {
        let json = """
        {"callId":"\(callId)","conversationId":"conv-1","mode":"p2p","type":"video",
         "initiator":{"userId":"caller-1","username":"caller","displayName":"Caller"}}
        """
        return try JSONDecoder().decode(CallOfferData.self, from: Data(json.utf8))
    }

    // MARK: - La couche de présentation ne réveille pas la pile

    func test_callPresentationLayer_mountedAtRoot_neverInstantiatesCallManager() throws {
        let counter = Counter()
        let host = countingHost(counter)
        let gate = IncomingCallWakeGate(
            offers: { Empty().eraseToAnyPublisher() },
            isAwake: { false },
            wake: { _ in }
        )
        let rendu = try RenderedPixels(
            Color.blue.modifier(CallPresentationLayer(
                miniPlayerOnTapBody: {},
                miniPlayerCurrentConversationId: { nil },
                calls: host,
                incomingCallGate: gate
            ))
        )

        let armed = rendu.settle(borne: 4) { gate.isArmed }

        XCTAssertTrue(armed, "Le montage de la racine doit armer la porte des appels entrants par socket.")
        XCTAssertEqual(counter.value, 0, "Construire et rendre la couche d'appel ne doit PAS instancier CallManager.")
        XCTAssertNil(host.manager)
    }

    func test_callPresentationLayer_source_neverReadsCallManagerShared() throws {
        let source = AppSourceGuard.stripComments(try appSource("Features/Main/Views/RootLayers/CallPresentationLayer.swift"))
        XCTAssertFalse(
            source.contains("CallManager.shared"),
            "`CallPresentationLayer` lit `CallManagerHost` — `CallManager.shared` construit toute la pile d'appel."
        )
    }

    // MARK: - L'hôte

    func test_host_withoutManager_reportsNoCall_andIdleState() {
        let counter = Counter()
        let host = countingHost(counter)
        var states: [CallState] = []
        let sub = host.callStatePublisher.sink { states.append($0) }
        defer { sub.cancel() }

        XCTAssertFalse(host.isCallActiveForAudioGuard)
        XCTAssertEqual(states, [.idle])
        XCTAssertEqual(counter.value, 0, "Lire l'état d'appel ne doit pas réveiller la pile.")
    }

    func test_host_require_instantiatesOnce_synchronously() {
        let counter = Counter()
        let host = countingHost(counter)

        let first = host.require()
        let second = host.require()

        XCTAssertEqual(counter.value, 1)
        XCTAssertTrue(first === second)
        XCTAssertTrue(host.manager === first)
    }

    /// Le chemin PushKit appelle `CallManager.shared` de façon SYNCHRONE dans
    /// `MainActor.assumeIsolated` : la pile naît avant que PushKit reprenne la
    /// main, et l'hôte la voit — la couche de présentation peut donc présenter
    /// l'appel qu'un push a réveillé.
    func test_callManagerShared_registersItselfInSharedHost() {
        let manager = CallManager.shared
        XCTAssertTrue(CallManagerHost.shared.manager === manager)
        XCTAssertTrue(CallManagerHost.shared.require() === manager)
    }

    func test_voipPush_reportsIncomingCallSynchronously_throughCallManagerShared() throws {
        let source = AppSourceGuard.stripComments(try appSource("Features/Main/Services/VoIPPushManager.swift"))
        guard let push = source.range(of: "didReceiveIncomingPushWith"),
              let report = source.range(of: "CallManager.shared.reportIncomingVoIPCall(", range: push.upperBound..<source.endIndex)
        else {
            return XCTFail("Le push VoIP doit signaler l'appel via CallManager.shared.reportIncomingVoIPCall.")
        }
        let before = source[push.upperBound..<report.lowerBound]
        XCTAssertTrue(
            before.hasSuffix("MainActor.assumeIsolated {\n            "),
            "Le signalement à CallKit doit rester SYNCHRONE (MainActor.assumeIsolated), sinon iOS tue l'app."
        )
    }

    // MARK: - La porte des appels entrants par socket

    func test_gate_offerBeforeStackExists_wakesItAndHandsOverThatOffer() throws {
        let subject = PassthroughSubject<CallOfferData, Never>()
        var awake = false
        var handed: [String] = []
        let gate = IncomingCallWakeGate(
            offers: { subject.eraseToAnyPublisher() },
            isAwake: { awake },
            wake: { offer in
                awake = true
                handed.append(offer.callId)
            }
        )
        gate.arm()

        subject.send(try offer(callId: "c-1"))
        subject.send(try offer(callId: "c-2"))

        XCTAssertEqual(handed, ["c-1"], "Seul l'événement qui a réveillé la pile lui est remis ; la suite passe par son propre abonnement.")
    }

    func test_gate_offerWhileStackAwake_leavesItToTheStack() throws {
        let subject = PassthroughSubject<CallOfferData, Never>()
        var woke = 0
        let gate = IncomingCallWakeGate(
            offers: { subject.eraseToAnyPublisher() },
            isAwake: { true },
            wake: { _ in woke += 1 }
        )
        gate.arm()

        subject.send(try offer())

        XCTAssertEqual(woke, 0)
    }

    func test_gate_armIsIdempotent() throws {
        let subject = PassthroughSubject<CallOfferData, Never>()
        var woke = 0
        let gate = IncomingCallWakeGate(
            offers: { subject.eraseToAnyPublisher() },
            isAwake: { false },
            wake: { _ in woke += 1 }
        )
        gate.arm()
        gate.arm()

        subject.send(try offer())

        XCTAssertEqual(woke, 1)
    }

    // MARK: - La pile, une fois réveillée, reste légère hors d'un appel vidéo

    func test_heavyCallPieces_areBuiltOnFirstUse_notWithTheirOwner() throws {
        let manager = AppSourceGuard.stripComments(try appSource("Features/Main/Services/CallManager.swift"))
        XCTAssertTrue(manager.contains("private lazy var pip: PiPCallProviding = PiPCallController.shared"))
        XCTAssertFalse(manager.contains("private let webRTCService: WebRTCService"))
        guard let initRange = manager.range(of: "private init() {"),
              let end = manager.range(of: "Logger.calls.info(\"CallManager initialized\")", range: initRange.upperBound..<manager.endIndex)
        else { return XCTFail("CallManager.init introuvable") }
        let initBody = manager[initRange.upperBound..<end.lowerBound]
        XCTAssertFalse(initBody.contains("WebRTCService()"), "Le client WebRTC naît au premier appel, pas avec CallManager.")
        XCTAssertFalse(initBody.contains("self.webRTCService"), "Toucher `webRTCService` dans l'init le construirait.")

        let client = AppSourceGuard.stripComments(try appSource("Features/Main/Services/WebRTC/P2PWebRTCClient.swift"))
        XCTAssertTrue(
            client.contains("private(set) lazy var videoFilterPipeline = VideoFilterPipeline()"),
            "Vision + CIContext(mtlDevice:) naissent au premier appel vidéo filtré."
        )
    }

    private func appSource(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy")
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
