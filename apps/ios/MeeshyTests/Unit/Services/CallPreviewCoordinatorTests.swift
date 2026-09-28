import XCTest
import MeeshySDK
@testable import Meeshy

/// #8480 — voir, et entendre si on le choisit, l'appelant avant de décrocher.
/// L'appelé demande l'aperçu et reçoit sans rien envoyer ; l'appelant offre son
/// média dans l'état où il est ; tout voyage sur `call:preview-signal`.
@MainActor
final class CallPreviewCoordinatorTests: XCTestCase {

    // MARK: - Doubles

    @MainActor
    private final class MockPeerLink: GroupPeerLinkProviding {
        let remoteUserId: String
        let configuration: GroupPeerLinkConfiguration
        var remoteVideoTrack: Any?
        private(set) var offerCallCount = 0
        private(set) var received: [GroupCallIncomingSignal] = []
        private(set) var audioEnabled: [Bool] = []
        private(set) var videoEnabled: [Bool] = []
        private(set) var iceServerUpdates: [[IceServer]] = []
        private(set) var closeCallCount = 0

        init(configuration: GroupPeerLinkConfiguration) {
            self.configuration = configuration
            self.remoteUserId = configuration.remoteUserId
        }

        func offer() async { offerCallCount += 1 }
        func receive(_ signal: GroupCallIncomingSignal) async { received.append(signal) }
        func setAudioEnabled(_ enabled: Bool) { audioEnabled.append(enabled) }
        func setVideoEnabled(_ enabled: Bool) async { videoEnabled.append(enabled) }
        func updateIceServers(_ servers: [IceServer]) { iceServerUpdates.append(servers) }
        func audioLevel() async -> Double? { nil }
        func close() { closeCallCount += 1 }
    }

    @MainActor
    private final class MockPeerLinkFactory: GroupPeerLinkFactoryProviding {
        private(set) var links: [MockPeerLink] = []
        private(set) var handlers: [@MainActor (GroupPeerLinkEvent) -> Void] = []

        func makeLink(
            _ configuration: GroupPeerLinkConfiguration,
            onEvent: @escaping @MainActor (GroupPeerLinkEvent) -> Void
        ) -> any GroupPeerLinkProviding {
            let link = MockPeerLink(configuration: configuration)
            links.append(link)
            handlers.append(onEvent)
            return link
        }

        func emit(_ event: GroupPeerLinkEvent) { handlers.last?(event) }
    }

    @MainActor
    private final class MockPreviewSignaling: CallPreviewSignalingProviding {
        private(set) var requests: [String] = []
        private(set) var signals: [(callId: String, type: String, from: String, to: String)] = []
        private(set) var iceRequests: [String] = []

        func requestCallPreview(callId: String) { requests.append(callId) }
        func emitCallPreviewSignal(callId: String, type: String, from: String, to: String, negotiationId: Int, fields: [String: Any]) {
            signals.append((callId, type, from, to))
        }
        func emitRequestIceServers(callId: String) { iceRequests.append(callId) }
    }

    @MainActor
    private final class MockPreviewHost: CallPreviewHostActing {
        private(set) var audible: [Bool] = []
        private(set) var restoreCount = 0

        func setPreviewAudible(_ audible: Bool) { self.audible.append(audible) }
        func restoreMicAfterRinging() { restoreCount += 1 }
    }

    // MARK: - Fabriques

    private func makeSUT() -> (sut: CallPreviewCoordinator, factory: MockPeerLinkFactory, signaling: MockPreviewSignaling, host: MockPreviewHost) {
        let factory = MockPeerLinkFactory()
        let signaling = MockPreviewSignaling()
        let host = MockPreviewHost()
        let sut = CallPreviewCoordinator(linkFactory: factory, signaling: signaling)
        sut.attach(host: host)
        // Le coordinateur tient son hôte en `weak`.
        addTeardownBlock { _ = host }
        return (sut, factory, signaling, host)
    }

    private func state(
        _ phase: CallPreviewPhase,
        callId: String? = "call1",
        peer: String? = "caller",
        isGroup: Bool = false,
        muted: Bool = false,
        video: Bool = true
    ) -> CallPreviewHostState {
        CallPreviewHostState(callId: callId, localUserId: "me", peerUserId: peer, phase: phase, isGroup: isGroup, isMicMuted: muted, isVideoEnabled: video)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) -> T {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func previewSignal(_ type: String, from: String, to: String = "me", callId: String = "call1") -> CallPreviewSocketEvent {
        .signal(decode(CallAnswerData.self, #"{"callId":"\#(callId)","signal":{"type":"\#(type)","from":"\#(from)","to":"\#(to)","sdp":"v=0","negotiationId":1}}"#))
    }

    private func settle() async {
        for _ in 0..<8 { await Task.yield() }
    }

    /// L'appelé dont le lien d'aperçu reçoit déjà l'appelant.
    private func connectedCallee() async -> (sut: CallPreviewCoordinator, factory: MockPeerLinkFactory, signaling: MockPreviewSignaling, host: MockPreviewHost) {
        let sut = makeSUT()
        sut.sut.sync(state(.incomingRinging))
        sut.sut.handle(previewSignal("offer", from: "caller"))
        await settle()
        sut.factory.emit(.state(.connected))
        return sut
    }

    // MARK: - Appelé

    func test_sync_directCallRingsInApp_requestsThePreviewOnce() {
        let (sut, _, signaling, _) = makeSUT()

        sut.sync(state(.incomingRinging))
        sut.sync(state(.incomingRinging, muted: true))

        XCTAssertEqual(signaling.requests, ["call1"])
    }

    func test_sync_groupCallRings_requestsNothing() {
        let (sut, _, signaling, _) = makeSUT()

        sut.sync(state(.incomingRinging, isGroup: true))

        XCTAssertTrue(signaling.requests.isEmpty)
    }

    func test_offerFromCaller_opensReceiveOnlyLink_andAppliesTheOffer() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.incomingRinging))

        sut.handle(previewSignal("offer", from: "caller"))
        await settle()

        let link = factory.links.first
        XCTAssertEqual(link?.configuration.receiveOnly, true)
        XCTAssertEqual(link?.configuration.sendsAudio, false)
        XCTAssertEqual(link?.configuration.sendsVideo, false)
        XCTAssertEqual(link?.received.map(\.kind), [.offer])
    }

    func test_offerFromSomeoneElse_opensNothing() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.incomingRinging))

        sut.handle(previewSignal("offer", from: "stranger"))
        sut.handle(previewSignal("offer", from: "caller", to: "someone-else"))
        await settle()

        XCTAssertTrue(factory.links.isEmpty)
    }

    func test_calleeAnswer_leavesOnThePreviewChannel_towardTheCaller() async {
        let (sut, factory, signaling, _) = makeSUT()
        sut.sync(state(.incomingRinging))
        sut.handle(previewSignal("offer", from: "caller"))
        await settle()

        factory.emit(.signal(.description(.answer, sdp: "v=0", negotiationId: 1)))

        XCTAssertEqual(signaling.signals.map(\.type), ["answer"])
        XCTAssertEqual(signaling.signals.first?.from, "me")
        XCTAssertEqual(signaling.signals.first?.to, "caller")
    }

    func test_remoteVideo_isShownBehindTheRinging() async {
        let (sut, factory, _, _) = await connectedCallee()
        let track = NSObject()
        factory.links.first?.remoteVideoTrack = track

        factory.emit(.remoteVideo)

        XCTAssertTrue((sut.previewVideoTrack as? NSObject) === track)
        XCTAssertTrue(sut.isPreviewConnected)
    }

    func test_toggleSound_beforeTheLinkConnects_doesNothing() async {
        let (sut, _, _, host) = makeSUT()
        sut.sync(state(.incomingRinging))
        sut.handle(previewSignal("offer", from: "caller"))
        await settle()

        sut.toggleSound()

        XCTAssertFalse(sut.isPreviewAudible)
        XCTAssertTrue(host.audible.isEmpty)
    }

    func test_toggleSound_onAConnectedPreview_opensThenClosesTheSound() async {
        let (sut, _, _, host) = await connectedCallee()

        sut.toggleSound()
        XCTAssertTrue(sut.isPreviewAudible)
        sut.toggleSound()

        XCTAssertFalse(sut.isPreviewAudible)
        XCTAssertEqual(host.audible, [true, false])
    }

    func test_answering_closesThePreview_andLeavesTheSoundToTheCall() async {
        let (sut, factory, _, host) = await connectedCallee()
        sut.toggleSound()

        sut.sync(state(.answering))

        XCTAssertEqual(factory.links.first?.closeCallCount, 1)
        XCTAssertNil(sut.previewVideoTrack)
        XCTAssertFalse(sut.isPreviewConnected)
        XCTAssertEqual(host.audible, [true])
    }

    func test_declinedWhileListening_silencesTheSound() async {
        let (sut, factory, _, host) = await connectedCallee()
        sut.toggleSound()

        sut.sync(state(.ended))

        XCTAssertEqual(factory.links.first?.closeCallCount, 1)
        XCTAssertEqual(host.audible, [true, false])
    }

    // MARK: - Appelant

    func test_requested_whileOutgoingRings_offersTheLocalMediaAsItIs() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee", muted: true, video: true))

        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        let link = factory.links.first
        XCTAssertEqual(link?.configuration.receiveOnly, false)
        XCTAssertEqual(link?.configuration.sendsAudio, false)
        XCTAssertEqual(link?.configuration.sendsVideo, true)
        XCTAssertEqual(link?.offerCallCount, 1)
    }

    func test_requested_forAnotherCallOrPeer_isIgnored() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee"))

        sut.handle(.requested(CallPreviewRequestedEvent(callId: "other", userId: "callee")))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "stranger")))
        await settle()

        XCTAssertTrue(factory.links.isEmpty)
    }

    func test_requested_onceAnswered_isIgnored() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.answering, peer: "callee"))

        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        XCTAssertTrue(factory.links.isEmpty)
    }

    func test_callerLink_connected_tellsTheCallerHeIsSeen_untilAnswered() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        factory.emit(.state(.connected))
        XCTAssertTrue(sut.isSeenByCallee)
        sut.sync(state(.answering, peer: "callee"))

        XCTAssertFalse(sut.isSeenByCallee)
        XCTAssertEqual(factory.links.first?.closeCallCount, 1)
    }

    func test_callerMutesWhileRinging_thePreviewFollows_andTheMicComesBackAtConnection() async {
        let (sut, factory, _, host) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        sut.sync(state(.outgoingRinging, peer: "callee", muted: true))
        sut.sync(state(.answering, peer: "callee", muted: true))
        XCTAssertEqual(host.restoreCount, 0)
        sut.sync(state(.connected, peer: "callee", muted: true))

        XCTAssertEqual(factory.links.first?.audioEnabled, [false])
        XCTAssertEqual(host.restoreCount, 1)
    }

    func test_callerUnmutesBeforeConnection_nothingToRestore() {
        let (sut, _, _, host) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.sync(state(.outgoingRinging, peer: "callee", muted: true))
        sut.sync(state(.outgoingRinging, peer: "callee", muted: false))

        sut.sync(state(.connected, peer: "callee"))

        XCTAssertEqual(host.restoreCount, 0)
    }

    func test_mutedAfterConnection_staysMuted() {
        let (sut, _, _, host) = makeSUT()
        sut.sync(state(.connected, peer: "callee"))
        sut.sync(state(.connected, peer: "callee", muted: true))
        sut.sync(state(.connected, peer: "callee", muted: true, video: false))

        XCTAssertEqual(host.restoreCount, 0)
    }

    // MARK: - Serveurs ICE

    func test_link_usesTheCallsIceServers_whenTheRingingBroughtThem() async {
        let (sut, factory, signaling, _) = makeSUT()
        sut.handleIncomingCall(decode(CallOfferData.self, #"{"callId":"call1","conversationId":"conv1","initiator":{"userId":"caller","username":"c"},"iceServers":[{"urls":"turn:turn.meeshy.me:3478","username":"u","credential":"p"}]}"#))
        sut.sync(state(.incomingRinging))

        sut.handle(previewSignal("offer", from: "caller"))
        await settle()

        XCTAssertEqual(factory.links.first?.configuration.iceServers.map(\.urls), [["turn:turn.meeshy.me:3478"]])
        XCTAssertTrue(signaling.iceRequests.isEmpty)
    }

    func test_link_withoutKnownServers_asksForThem_andAdoptsTheRefresh() async {
        let (sut, factory, signaling, _) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        sut.handleIceServersRefreshed(decode(CallIceServersRefreshedData.self, #"{"callId":"call1","iceServers":[{"urls":["turn:turn.meeshy.me:3478"]}],"ttl":600}"#))

        XCTAssertEqual(signaling.iceRequests, ["call1"])
        XCTAssertEqual(factory.links.first?.configuration.iceServers.count, IceServer.defaultServers.count)
        XCTAssertEqual(factory.links.first?.iceServerUpdates.map { $0.map(\.urls) }, [[["turn:turn.meeshy.me:3478"]]])
    }

    // MARK: - Lecture de l'appel

    func test_previewPhase_readsTheCallState() {
        XCTAssertEqual(CallManager.previewPhase(of: .ringing(isOutgoing: false), ringsInApp: true), .incomingRinging)
        XCTAssertEqual(CallManager.previewPhase(of: .ringing(isOutgoing: false), ringsInApp: false), .none)
        XCTAssertEqual(CallManager.previewPhase(of: .ringing(isOutgoing: true), ringsInApp: false), .outgoingRinging)
        XCTAssertEqual(CallManager.previewPhase(of: .offering, ringsInApp: false), .outgoingRinging)
        XCTAssertEqual(CallManager.previewPhase(of: .connecting, ringsInApp: true), .answering)
        XCTAssertEqual(CallManager.previewPhase(of: .reconnecting(attempt: 1), ringsInApp: true), .connected)
        XCTAssertEqual(CallManager.previewPhase(of: .idle, ringsInApp: true), .none)
    }

    func test_seenLabel_audioOnlyWithMutedMic_announcesNothing() {
        XCTAssertNil(CallPreviewSeenLabel.text(peerName: "Bob", isVideo: false, isMuted: true))
        XCTAssertNotNil(CallPreviewSeenLabel.text(peerName: "Bob", isVideo: false, isMuted: false))
        XCTAssertNotNil(CallPreviewSeenLabel.text(peerName: "Bob", isVideo: true, isMuted: true))
    }
}
