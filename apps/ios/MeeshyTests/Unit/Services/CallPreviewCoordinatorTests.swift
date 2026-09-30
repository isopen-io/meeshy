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
        private(set) var sentControls: [Data] = []

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
        func sendControl(_ data: Data) { sentControls.append(data) }

        var sentAudible: [Bool] {
            sentControls.compactMap { try? JSONDecoder().decode(CallPreviewControlMessage.self, from: $0).audible }
        }
    }

    @MainActor
    private final class MockConsentStore: CallPreviewConsentStoring {
        private(set) var consents: [String: CallPreviewConsent] = [:]

        func consent(localUserId: String, peerUserId: String) -> CallPreviewConsent {
            consents["\(localUserId)|\(peerUserId)"] ?? .initial
        }

        func remember(_ consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
            consents["\(localUserId)|\(peerUserId)"] = consent
        }
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

    private func makeSUT(consents: MockConsentStore = MockConsentStore()) -> (sut: CallPreviewCoordinator, factory: MockPeerLinkFactory, signaling: MockPreviewSignaling, host: MockPreviewHost) {
        let factory = MockPeerLinkFactory()
        let signaling = MockPreviewSignaling()
        let host = MockPreviewHost()
        let sut = CallPreviewCoordinator(linkFactory: factory, signaling: signaling, consents: consents)
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

    /// #8627 — le bouton son est proposé d'emblée : choisi avant que le lien
    /// ne s'établisse, il s'applique dès que l'appelant arrive.
    func test_toggleSound_beforeTheLinkConnects_opensTheSoundOnConnection() async {
        let (sut, factory, _, host) = makeSUT()
        sut.sync(state(.incomingRinging))

        sut.toggleSound()
        XCTAssertTrue(sut.isPreviewAudible)
        XCTAssertTrue(host.audible.isEmpty)

        sut.handle(previewSignal("offer", from: "caller"))
        await settle()
        factory.emit(.state(.connected))

        XCTAssertEqual(host.audible, [true])
    }

    func test_toggleSound_chosenThenWithdrawnBeforeConnection_neverOpensTheSound() async {
        let (sut, factory, _, host) = makeSUT()
        sut.sync(state(.incomingRinging))
        sut.toggleSound()
        sut.toggleSound()

        sut.handle(previewSignal("offer", from: "caller"))
        await settle()
        factory.emit(.state(.connected))

        XCTAssertFalse(sut.isPreviewAudible)
        XCTAssertTrue(host.audible.isEmpty)
    }

    func test_offersSound_directCallRinging_offersItAtOnce() {
        let (sut, _, _, _) = makeSUT()

        sut.sync(state(.incomingRinging))

        XCTAssertTrue(sut.offersSound)
    }

    func test_offersSound_groupCallOrOutgoingOrAnswered_offersNothing() {
        let (group, _, _, _) = makeSUT()
        group.sync(state(.incomingRinging, isGroup: true))
        let (outgoing, _, _, _) = makeSUT()
        outgoing.sync(state(.outgoingRinging))
        let (answered, _, _, _) = makeSUT()
        answered.sync(state(.incomingRinging))
        answered.sync(state(.answering))

        XCTAssertFalse(group.offersSound)
        XCTAssertFalse(outgoing.offersSound)
        XCTAssertFalse(answered.offersSound)
    }

    func test_toggleSound_outsideTheRinging_doesNothing() {
        let (sut, _, _, host) = makeSUT()
        sut.sync(state(.connected))

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

    /// #8627 — décrocher ne coupe pas l'aperçu : il tient jusqu'à ce que le
    /// vrai lien soit connecté, sans écran noir entre les deux.
    func test_answering_keepsThePreviewUntilTheCallConnects() async {
        let (sut, factory, _, host) = await connectedCallee()
        let track = NSObject()
        factory.links.first?.remoteVideoTrack = track
        factory.emit(.remoteVideo)
        sut.toggleSound()

        sut.sync(state(.answering))

        XCTAssertEqual(factory.links.first?.closeCallCount, 0)
        XCTAssertTrue((sut.previewVideoTrack as? NSObject) === track)
        XCTAssertTrue(sut.isPreviewConnected)
        XCTAssertEqual(host.audible, [true])
    }

    func test_connected_closesThePreview_andLeavesTheSoundToTheCall() async {
        let (sut, factory, _, host) = await connectedCallee()
        sut.toggleSound()
        sut.sync(state(.answering))

        sut.sync(state(.connected))

        XCTAssertEqual(factory.links.first?.closeCallCount, 1)
        XCTAssertNil(sut.previewVideoTrack)
        XCTAssertFalse(sut.isPreviewConnected)
        XCTAssertFalse(sut.isPreviewAudible)
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

    func test_callerLink_connected_tellsTheCallerHeIsSeen_untilTheCallConnects() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        factory.emit(.state(.connected))
        XCTAssertTrue(sut.reachesCallee)
        sut.sync(state(.answering, peer: "callee"))
        XCTAssertTrue(sut.reachesCallee)
        XCTAssertEqual(factory.links.first?.closeCallCount, 0)
        sut.sync(state(.connected, peer: "callee"))

        XCTAssertFalse(sut.reachesCallee)
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

    // MARK: - Ce que l'appelant laisse voir et entendre (#8795)

    /// L'appelant dont le lien d'aperçu atteint l'appelé.
    private func connectedCaller(
        consents: MockConsentStore = MockConsentStore(),
        muted: Bool = false,
        video: Bool = true
    ) async -> (sut: CallPreviewCoordinator, factory: MockPeerLinkFactory, consents: MockConsentStore) {
        let (sut, factory, _, _) = makeSUT(consents: consents)
        sut.sync(state(.outgoingRinging, peer: "callee", muted: muted, video: video))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()
        factory.emit(.state(.connected))
        return (sut, factory, consents)
    }

    private func audible(_ value: Bool) -> GroupPeerLinkEvent {
        // swiftlint:disable:next force_try
        .control(try! JSONEncoder().encode(CallPreviewControlMessage(audible: value)))
    }

    func test_outgoingRinging_newContact_offersTheCameraButNotTheMic() async {
        let (sut, factory, _, _) = makeSUT()

        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        XCTAssertTrue(sut.offersOutgoingControls)
        XCTAssertEqual(sut.outgoingConsent, CallPreviewConsent(sendsAudio: false, sendsVideo: true))
        let link = factory.links.first
        XCTAssertEqual(link?.configuration.sendsAudio, false)
        XCTAssertEqual(link?.configuration.sendsVideo, true)
        XCTAssertEqual(link?.configuration.opensControlChannel, true)
    }

    func test_outgoingRinging_replaysTheChoiceMadeForThisContact() async {
        let consents = MockConsentStore()
        consents.remember(CallPreviewConsent(sendsAudio: true, sendsVideo: false), localUserId: "me", peerUserId: "callee")
        let (sut, factory, _, _) = makeSUT(consents: consents)

        sut.sync(state(.outgoingRinging, peer: "callee"))
        sut.handle(.requested(CallPreviewRequestedEvent(callId: "call1", userId: "callee")))
        await settle()

        XCTAssertEqual(sut.outgoingConsent, CallPreviewConsent(sendsAudio: true, sendsVideo: false))
        XCTAssertEqual(factory.links.first?.configuration.sendsAudio, true)
        XCTAssertEqual(factory.links.first?.configuration.sendsVideo, false)
    }

    func test_outgoingRinging_theChoiceOfOneContactNeverLeaksToAnother() {
        let consents = MockConsentStore()
        consents.remember(CallPreviewConsent(sendsAudio: true, sendsVideo: false), localUserId: "me", peerUserId: "friend")
        let (sut, _, _, _) = makeSUT(consents: consents)

        sut.sync(state(.outgoingRinging, peer: "callee"))

        XCTAssertEqual(sut.outgoingConsent, .initial)
    }

    func test_togglePreviewAudio_opensTheMicForTheCallee_andRemembersItForThisContact() async {
        let (sut, factory, consents) = await connectedCaller()

        sut.togglePreviewAudio()

        XCTAssertEqual(factory.links.first?.audioEnabled, [true])
        XCTAssertEqual(consents.consent(localUserId: "me", peerUserId: "callee"), CallPreviewConsent(sendsAudio: true, sendsVideo: true))
    }

    func test_togglePreviewVideo_cutsTheCameraForTheCallee_andRemembersIt() async {
        let (sut, factory, consents) = await connectedCaller()

        sut.togglePreviewVideo()
        await settle()

        XCTAssertEqual(factory.links.first?.videoEnabled, [false])
        XCTAssertEqual(consents.consent(localUserId: "me", peerUserId: "callee"), CallPreviewConsent(sendsAudio: false, sendsVideo: false))
    }

    func test_previewToggles_outsideTheOutgoingRinging_doNothing() {
        let consents = MockConsentStore()
        let (incoming, _, _, _) = makeSUT(consents: consents)
        incoming.sync(state(.incomingRinging))
        let (group, _, _, _) = makeSUT(consents: consents)
        group.sync(state(.outgoingRinging, peer: "callee", isGroup: true))

        incoming.togglePreviewAudio()
        group.togglePreviewVideo()

        XCTAssertFalse(incoming.offersOutgoingControls)
        XCTAssertFalse(group.offersOutgoingControls)
        XCTAssertTrue(consents.consents.isEmpty)
    }

    func test_callMicMuted_keepsThePreviewSilent_evenWhenTheContactMayHear() async {
        let consents = MockConsentStore()
        consents.remember(CallPreviewConsent(sendsAudio: true, sendsVideo: true), localUserId: "me", peerUserId: "callee")

        let (_, factory, _) = await connectedCaller(consents: consents, muted: true)

        XCTAssertEqual(factory.links.first?.configuration.sendsAudio, false)
    }

    /// La règle du libellé : jamais plus que ce que l'appelé reçoit VRAIMENT.
    func test_calleeExposure_saysSeenFirst_andHeardOnlyOnceTheCalleeTurnedTheSoundOn() async {
        let (sut, factory, _) = await connectedCaller()
        XCTAssertEqual(sut.calleeExposure, .seen)

        factory.emit(audible(true))
        XCTAssertTrue(sut.isHeardByCallee)
        XCTAssertEqual(sut.calleeExposure, .seen, "micro de l'aperçu coupé : l'appelé n'entend rien")

        sut.togglePreviewAudio()
        XCTAssertEqual(sut.calleeExposure, .seenAndHeard)

        sut.togglePreviewVideo()
        XCTAssertEqual(sut.calleeExposure, .heard)

        factory.emit(audible(false))
        XCTAssertEqual(sut.calleeExposure, .nothing)
    }

    func test_calleeExposure_audioCall_isNeverSeen() async {
        let consents = MockConsentStore()
        consents.remember(CallPreviewConsent(sendsAudio: true, sendsVideo: true), localUserId: "me", peerUserId: "callee")
        let (sut, factory, _) = await connectedCaller(consents: consents, video: false)

        XCTAssertEqual(sut.calleeExposure, .nothing)
        factory.emit(audible(true))

        XCTAssertEqual(sut.calleeExposure, .heard)
    }

    func test_calleeExposure_beforeTheLinkReachesTheCallee_isNothing() {
        let (sut, _, _, _) = makeSUT()

        sut.sync(state(.outgoingRinging, peer: "callee"))

        XCTAssertEqual(sut.calleeExposure, .nothing)
    }

    func test_controlMessage_garbled_changesNothing() async {
        let (sut, factory, _) = await connectedCaller()

        factory.emit(.control(Data("pas du json".utf8)))

        XCTAssertFalse(sut.isHeardByCallee)
    }

    func test_callConnects_theCallerForgetsHeWasHeard() async {
        let (sut, factory, _) = await connectedCaller()
        sut.togglePreviewAudio()
        factory.emit(audible(true))

        sut.sync(state(.connected, peer: "callee"))

        XCTAssertFalse(sut.isHeardByCallee)
        XCTAssertEqual(sut.calleeExposure, .nothing)
    }

    // MARK: - L'appelé dit à l'appelant qu'il a activé le son (#8795)

    func test_calleeLink_neverOpensTheControlChannelItself() async {
        let (_, factory, _, _) = await connectedCallee()

        XCTAssertEqual(factory.links.first?.configuration.opensControlChannel, false)
    }

    func test_toggleSound_tellsTheCaller() async {
        let (sut, factory, _, _) = await connectedCallee()

        sut.toggleSound()
        sut.toggleSound()

        XCTAssertEqual(factory.links.first?.sentAudible, [true, false])
    }

    func test_controlChannelOpens_theCalleeRepeatsTheChoiceHeMadeWhileItRang() async {
        let (sut, factory, _, _) = makeSUT()
        sut.sync(state(.incomingRinging))
        sut.toggleSound()
        sut.handle(previewSignal("offer", from: "caller"))
        await settle()

        factory.emit(.controlOpened)

        XCTAssertEqual(factory.links.first?.sentAudible, [true])
    }

    // MARK: - La mémoire par contact (#8795)

    private func isolatedDefaults() -> UserDefaults {
        let name = "CallPreviewConsentStoreTests-\(UUID().uuidString)"
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: name) }
        return UserDefaults(suiteName: name) ?? .standard
    }

    func test_consentStore_unknownContact_startsWithTheMicMutedAndTheCameraOn() {
        let store = CallPreviewConsentStore(defaults: isolatedDefaults())

        XCTAssertEqual(store.consent(localUserId: "me", peerUserId: "callee"), CallPreviewConsent(sendsAudio: false, sendsVideo: true))
    }

    func test_consentStore_remembersEachContact_forEachAccount_acrossInstances() {
        let defaults = isolatedDefaults()
        let first = CallPreviewConsentStore(defaults: defaults)
        first.remember(CallPreviewConsent(sendsAudio: true, sendsVideo: false), localUserId: "me", peerUserId: "callee")
        first.remember(CallPreviewConsent(sendsAudio: true, sendsVideo: true), localUserId: "me", peerUserId: "friend")

        let second = CallPreviewConsentStore(defaults: defaults)

        XCTAssertEqual(second.consent(localUserId: "me", peerUserId: "callee"), CallPreviewConsent(sendsAudio: true, sendsVideo: false))
        XCTAssertEqual(second.consent(localUserId: "me", peerUserId: "friend"), CallPreviewConsent(sendsAudio: true, sendsVideo: true))
        XCTAssertEqual(second.consent(localUserId: "other-account", peerUserId: "callee"), .initial)
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

    /// #8627 — un appel signalé à CallKit sonne AUSSI dans l'app dès qu'elle
    /// est au premier plan : l'aperçu s'y montre.
    func test_previewRingsInApp_callKitWithTheAppActive_ringsInApp() {
        XCTAssertTrue(CallManager.previewRingsInApp(usesCallKit: true, isAppActive: true))
    }

    func test_previewRingsInApp_callKitInTheBackground_doesNotRingInApp() {
        XCTAssertFalse(CallManager.previewRingsInApp(usesCallKit: true, isAppActive: false))
    }

    func test_previewRingsInApp_withoutCallKit_alwaysRingsInApp() {
        XCTAssertTrue(CallManager.previewRingsInApp(usesCallKit: false, isAppActive: false))
        XCTAssertTrue(CallManager.previewRingsInApp(usesCallKit: false, isAppActive: true))
    }

    /// #8795 — le libellé dit ce que l'appelé reçoit, rien de plus.
    func test_seenLabel_saysExactlyWhatTheCalleeGets() {
        XCTAssertNil(CallPreviewSeenLabel.text(peerName: "Bob", exposure: .nothing))
        let texts = [CallPreviewExposure.seen, .heard, .seenAndHeard].compactMap {
            CallPreviewSeenLabel.text(peerName: "Bob", exposure: $0)
        }

        XCTAssertEqual(texts.count, 3)
        XCTAssertEqual(Set(texts).count, 3, "vu, entendu, vu et entendu : trois phrases distinctes")
        XCTAssertTrue(texts.allSatisfy { $0.contains("Bob") })
    }
}
