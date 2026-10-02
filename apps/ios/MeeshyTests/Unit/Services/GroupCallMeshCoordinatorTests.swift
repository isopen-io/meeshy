import XCTest
import MeeshySDK
@testable import Meeshy

/// #3585 — le maillage d'un appel de groupe : une connexion par membre distant
/// autre que le pair principal, la loi d'offre du web (le membre déjà dans
/// l'appel offre au nouveau venu), l'attente pendant la sonnerie, et la
/// dissolution à la fin de l'appel.
@MainActor
final class GroupCallMeshCoordinatorTests: XCTestCase {

    // MARK: - Doubles

    @MainActor
    private final class MockGroupPeerLink: GroupPeerLinkProviding {
        let remoteUserId: String
        let configuration: GroupPeerLinkConfiguration
        var remoteVideoTrack: Any?
        var audioLevelResult: Double?
        private(set) var offerCallCount = 0
        private(set) var received: [GroupCallIncomingSignal] = []
        private(set) var audioEnabled: [Bool] = []
        private(set) var videoEnabled: [Bool] = []
        private(set) var iceServerUpdateCount = 0
        private(set) var closeCallCount = 0

        init(configuration: GroupPeerLinkConfiguration) {
            self.configuration = configuration
            self.remoteUserId = configuration.remoteUserId
        }

        func offer() async { offerCallCount += 1 }
        func receive(_ signal: GroupCallIncomingSignal) async { received.append(signal) }
        func setAudioEnabled(_ enabled: Bool) { audioEnabled.append(enabled) }
        func setVideoEnabled(_ enabled: Bool) async { videoEnabled.append(enabled) }
        func updateIceServers(_ servers: [IceServer]) { iceServerUpdateCount += 1 }
        func audioLevel() async -> Double? { audioLevelResult }
        func close() { closeCallCount += 1 }
        func sendControl(_ data: Data) {}
    }

    @MainActor
    private final class MockGroupPeerLinkFactory: GroupPeerLinkFactoryProviding {
        private(set) var links: [MockGroupPeerLink] = []
        private(set) var handlers: [String: @MainActor (GroupPeerLinkEvent) -> Void] = [:]

        func makeLink(
            _ configuration: GroupPeerLinkConfiguration,
            onEvent: @escaping @MainActor (GroupPeerLinkEvent) -> Void
        ) -> any GroupPeerLinkProviding {
            let link = MockGroupPeerLink(configuration: configuration)
            links.append(link)
            handlers[configuration.remoteUserId] = onEvent
            return link
        }

        func link(to userId: String) -> MockGroupPeerLink? { links.last { $0.remoteUserId == userId } }
    }

    @MainActor
    private final class MockGroupCallSignaling: GroupCallSignalingProviding {
        private(set) var emitted: [(callId: String, type: String, payload: [String: Any])] = []

        func emitCallSignal(callId: String, type: String, payload: [String: Any]) {
            emitted.append((callId, type, payload))
        }
    }

    @MainActor
    private final class MockGroupCallHost: GroupCallHostProviding {
        var groupCallId: String? = "call1"
        var groupConversationId: String? = "group1"
        var groupLocalUserId = "me"
        var groupPrimaryUserId: String? = "b"
        var groupPrimaryDisplayName: String? = "Bob"
        var isGroupCallLive = true
        var isGroupCallEngaged = true
        var isGroupPrimaryConnected = true
        var isLocalMicMuted = false
        var isLocalVideoEnabled = false
        var primaryRemoteVideoTrack: Any?
        var primaryAudioLevelResult: Double?
        private(set) var vacateCallCount = 0
        private(set) var titles: [String] = []

        func primaryAudioLevel() async -> Double? { primaryAudioLevelResult }
        func groupPrimaryDidVacate() { vacateCallCount += 1 }
        func groupCallTitleDidChange(_ title: String) { titles.append(title) }
    }

    private final class ActiveCallStub: ActiveCallServiceProviding, @unchecked Sendable {
        var session: ActiveCallSession?
        func activeCall(conversationId: String) async throws -> ActiveCallSession? { session }
    }

    // MARK: - Fabriques

    private func makeSUT(
        engaged: Bool = true,
        markGroup: Bool = true
    ) -> (sut: GroupCallMeshCoordinator, host: MockGroupCallHost, factory: MockGroupPeerLinkFactory, signaling: MockGroupCallSignaling, calls: ActiveCallStub) {
        let factory = MockGroupPeerLinkFactory()
        let signaling = MockGroupCallSignaling()
        let calls = ActiveCallStub()
        let host = MockGroupCallHost()
        host.isGroupCallEngaged = engaged
        let sut = GroupCallMeshCoordinator(
            linkFactory: factory,
            signaling: signaling,
            activeCalls: calls,
            now: { Date(timeIntervalSince1970: 100) },
            samplingInterval: .seconds(3600)
        )
        if markGroup { sut.markGroupConversation("group1", title: "Équipe") }
        sut.attach(host: host)
        // Le coordinateur tient son hôte en `weak` : un test qui écarte `host`
        // par `_` le libérerait avant la première assertion.
        addTeardownBlock { _ = host }
        return (sut, host, factory, signaling, calls)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) -> T {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func joined(_ userId: String, name: String = "", callId: String = "call1") -> CallParticipantData {
        CallParticipantData(callId: callId, userId: userId, displayName: name.isEmpty ? nil : name)
    }

    private func signal(_ type: String, from: String, sdp: String? = "v=0", callId: String = "call1") -> CallSignalPayload {
        let sdpField = sdp.map { #","sdp":"\#($0)""# } ?? ""
        return decode(CallSignalPayload.self, #"{"type":"\#(type)","from":"\#(from)","to":"me","negotiationId":1\#(sdpField)}"#)
    }

    /// Bob a lancé un appel dans un duo ; Alice, déjà dedans, m'y invite.
    private func invitation(conversationType: String = "direct") -> CallOfferData {
        decode(CallOfferData.self, #"{"callId":"call1","conversationId":"group1","initiator":{"userId":"b","username":"bob"},"conversationType":"\#(conversationType)","invitedBy":{"userId":"a","username":"alice"},"isGroup":true}"#)
    }

    private func settle() async {
        for _ in 0..<8 { await Task.yield() }
    }

    // MARK: - Loi d'offre

    func test_participantJoined_thirdMember_whileInCall_offersToArrival() async {
        let (sut, _, factory, _, _) = makeSUT()

        sut.handleParticipantJoined(joined("c", name: "Chloé"))
        await settle()

        XCTAssertEqual(factory.link(to: "c")?.offerCallCount, 1)
        XCTAssertEqual(sut.roster.member("c")?.displayName, "Chloé")
        XCTAssertTrue(sut.isGroupCallActive)
    }

    func test_participantJoined_primary_isNeverOfferedByTheMesh() async {
        let (sut, _, factory, _, _) = makeSUT()

        sut.handleParticipantJoined(joined("b"))
        await settle()

        XCTAssertNil(factory.link(to: "b"))
        XCTAssertEqual(sut.roster.member("b")?.isPrimary, true)
    }

    func test_participantJoined_directCall_isIgnored() async {
        let (sut, host, factory, _, _) = makeSUT(markGroup: false)
        host.groupPrimaryUserId = nil

        sut.handleParticipantJoined(joined("c"))
        await settle()

        XCTAssertTrue(factory.links.isEmpty)
        XCTAssertFalse(sut.isGroupCallActive)
    }

    func test_participantJoined_thirdPartyInUnmarkedCall_infersGroup() async {
        let (sut, _, factory, _, _) = makeSUT(markGroup: false)

        sut.handleParticipantJoined(joined("c"))
        await settle()

        XCTAssertTrue(sut.isGroupConversation("group1"))
        XCTAssertEqual(factory.link(to: "c")?.offerCallCount, 1)
    }

    func test_participantJoined_meshFull_admitsNobodyMore() async {
        let (sut, _, factory, _, _) = makeSUT()
        ["c", "d", "e", "f"].forEach { sut.handleParticipantJoined(joined($0)) }

        sut.handleParticipantJoined(joined("g"))
        await settle()

        XCTAssertTrue(sut.roster.isFull)
        XCTAssertFalse(sut.roster.contains("g"))
        XCTAssertNil(factory.link(to: "g"))
    }

    // MARK: - Tri des signaux

    func test_consume_signalFromThirdMember_isRoutedToItsLink() async {
        let (sut, _, factory, _, _) = makeSUT()

        let consumed = sut.consume(signal: signal("offer", from: "c"), callId: "call1")
        await settle()

        XCTAssertTrue(consumed)
        XCTAssertEqual(factory.link(to: "c")?.received.map(\.kind), [.offer])
        XCTAssertTrue(sut.roster.contains("c"))
    }

    func test_consume_signalFromPrimary_isLeftToCallManager() {
        let (sut, _, factory, _, _) = makeSUT()

        let consumed = sut.consume(signal: signal("offer", from: "b"), callId: "call1")

        XCTAssertFalse(consumed)
        XCTAssertTrue(factory.links.isEmpty)
    }

    func test_consume_directCall_neverTakesTheSignal() {
        let (sut, _, _, _, _) = makeSUT(markGroup: false)

        XCTAssertFalse(sut.consume(signal: signal("offer", from: "guest"), callId: "call1"))
    }

    func test_consume_answerWithoutLink_isSwallowedWithoutCreatingOne() async {
        let (sut, _, factory, _, _) = makeSUT()

        let consumed = sut.consume(signal: signal("answer", from: "c"), callId: "call1")
        await settle()

        XCTAssertTrue(consumed)
        XCTAssertTrue(factory.links.isEmpty)
    }

    func test_consume_otherCall_isNotTaken() {
        let (sut, _, _, _, _) = makeSUT()

        XCTAssertFalse(sut.consume(signal: signal("offer", from: "c"), callId: "other"))
    }

    // MARK: - Pendant la sonnerie

    func test_ringing_buffersOffersAndArrivals_thenFlushesOnAnswer() async {
        let (sut, host, factory, _, _) = makeSUT(engaged: false)

        XCTAssertTrue(sut.consume(signal: signal("offer", from: "c"), callId: "call1"))
        sut.handleParticipantJoined(joined("d"))
        await settle()
        XCTAssertTrue(factory.links.isEmpty, "rien ne se négocie avant le décroché")

        host.isGroupCallEngaged = true
        sut.syncWithHost()
        await settle()

        XCTAssertEqual(factory.link(to: "c")?.received.map(\.kind), [.offer])
        XCTAssertEqual(factory.link(to: "d")?.offerCallCount, 1)
    }

    func test_ringing_newerOfferReplacesQueuedNegotiation() async {
        let (sut, host, factory, _, _) = makeSUT(engaged: false)
        _ = sut.consume(signal: signal("offer", from: "c", sdp: "old"), callId: "call1")
        _ = sut.consume(signal: signal("ice-candidate", from: "c", sdp: nil), callId: "call1")
        _ = sut.consume(signal: signal("offer", from: "c", sdp: "new"), callId: "call1")

        host.isGroupCallEngaged = true
        sut.syncWithHost()
        await settle()

        XCTAssertEqual(factory.link(to: "c")?.received.map(\.sdp), ["new"])
    }

    // MARK: - Événements des connexions

    func test_linkSignal_isEmittedToItsMember() async {
        let (sut, _, factory, signaling, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))

        factory.handlers["c"]?(.signal(.description(.offer, sdp: "v=0", negotiationId: 1)))

        XCTAssertEqual(signaling.emitted.count, 1)
        XCTAssertEqual(signaling.emitted.first?.type, "offer")
        XCTAssertEqual(signaling.emitted.first?.payload["to"] as? String, "c")
        XCTAssertEqual(signaling.emitted.first?.payload["from"] as? String, "me")
    }

    func test_linkFailed_dropsMemberButKeepsCall() {
        let (sut, _, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        let link = factory.link(to: "c")

        factory.handlers["c"]?(.failed)

        XCTAssertFalse(sut.roster.contains("c"))
        XCTAssertEqual(link?.closeCallCount, 1)
        XCTAssertTrue(sut.isGroupCallActive)
    }

    func test_participantLeft_closesItsLink() {
        let (sut, _, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "c"))

        XCTAssertEqual(factory.link(to: "c")?.closeCallCount, 1)
        XCTAssertFalse(sut.roster.contains("c"))
    }

    func test_mediaToggled_updatesMemberTile() {
        let (sut, _, _, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))

        sut.handleMediaToggled(CallMediaToggleData(callId: "call1", userId: "c", mediaType: "audio", enabled: false))

        XCTAssertEqual(sut.roster.member("c")?.isMicMuted, true)
    }

    func test_localMute_propagatesToEveryLink() {
        let (sut, host, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))

        host.isLocalMicMuted = true
        sut.syncWithHost()

        XCTAssertEqual(factory.link(to: "c")?.audioEnabled.last, false)
    }

    func test_newLink_carriesPerfectNegotiationRoleAndLocalMedia() {
        let (sut, host, factory, _, _) = makeSUT()
        host.isLocalVideoEnabled = true

        sut.handleParticipantJoined(joined("c"))

        let configuration = factory.link(to: "c")?.configuration
        XCTAssertEqual(configuration?.isPolite, CallManager.isPolitePeer(localUserId: "me", remoteUserId: "c"))
        XCTAssertEqual(configuration?.sendsVideo, true)
        XCTAssertEqual(configuration?.sendsAudio, true)
    }

    func test_iceServersRefreshed_updatesEveryLink() {
        let (sut, _, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        let refreshed = decode(CallIceServersRefreshedData.self, #"{"callId":"call1","iceServers":[{"urls":"turn:t.meeshy.me"}],"ttl":600}"#)

        sut.handleIceServersRefreshed(refreshed)

        XCTAssertEqual(factory.link(to: "c")?.iceServerUpdateCount, 1)
    }

    // MARK: - Fin de l'appel

    func test_callEnded_closesEveryLinkAndClearsRoster() {
        let (sut, host, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        sut.handleParticipantJoined(joined("d"))

        host.isGroupCallLive = false
        sut.syncWithHost()

        XCTAssertEqual(factory.links.map(\.closeCallCount), [1, 1])
        XCTAssertTrue(sut.roster.members.isEmpty)
        XCTAssertFalse(sut.isGroupCallActive)
    }

    // MARK: - Qui parle

    func test_sampleAudioLevels_marksLoudMembersAsSpeaking() async {
        let (sut, host, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        sut.handleParticipantJoined(joined("d"))
        factory.link(to: "c")?.audioLevelResult = 0.3
        factory.link(to: "d")?.audioLevelResult = 0.0
        host.primaryAudioLevelResult = 0.2

        await sut.sampleAudioLevels()

        XCTAssertEqual(sut.speakingUserIds, ["b", "c"])
    }

    // MARK: - Noms de ceux qu'on rejoint

    func test_memberDiscoveredByOffer_takesItsNameFromTheActiveCall() async {
        let (sut, _, _, _, calls) = makeSUT()
        calls.session = ActiveCallSession(
            id: "call1",
            conversationId: "group1",
            mode: "p2p",
            status: "active",
            participants: [ActiveCallParticipant(userId: "c", user: ActiveCallParticipantUser(id: "c", username: "chloe", displayName: "Chloé"))]
        )

        _ = sut.consume(signal: signal("offer", from: "c"), callId: "call1")
        await settle()

        XCTAssertEqual(sut.roster.member("c")?.displayName, "Chloé")
    }

    // MARK: - Départ du principal (#9085)

    func test_participantLeft_primaryWithMembersRemaining_vacatesSeatAndKeepsCall() {
        let (sut, host, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        XCTAssertTrue(sut.isPrimaryVacated)
        XCTAssertFalse(sut.roster.contains("b"))
        XCTAssertTrue(sut.roster.contains("c"))
        XCTAssertEqual(factory.link(to: "c")?.closeCallCount, 0, "le départ du principal ne coupe pas les autres liens")
        XCTAssertTrue(sut.isGroupCallActive)
        XCTAssertEqual(host.vacateCallCount, 1, "CallManager cesse de reprendre une liaison vers un pair parti")
    }

    /// #9090 — le principal parti, chaque membre restant garde SA liaison et son
    /// image : aucun ne dépend plus de la PeerConnection du parti.
    func test_participantLeft_primary_remainingMembersKeepTheirMedia() {
        let (sut, host, factory, _, _) = makeSUT()
        host.primaryRemoteVideoTrack = "primary-track"
        sut.handleParticipantJoined(joined("c"))
        sut.handleParticipantJoined(joined("d"))
        factory.link(to: "c")?.remoteVideoTrack = "c-track"

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        XCTAssertEqual(sut.videoTrack(for: "c") as? String, "c-track")
        XCTAssertEqual(factory.links.map(\.closeCallCount), [0, 0])
        XCTAssertEqual(sut.roster.members.map(\.userId), ["c", "d"])
        XCTAssertFalse(sut.roster.members.contains { $0.isPrimary }, "plus aucune tuile ne suit la liaison du parti")
    }

    func test_participantLeft_primaryAlone_keepsTheSeat() {
        let (sut, host, _, _, _) = makeSUT()

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        XCTAssertFalse(sut.isPrimaryVacated)
        XCTAssertEqual(host.vacateCallCount, 0)
    }

    func test_primaryDidLeave_groupWithMembersRemaining_keepsTheCall() {
        let (sut, _, _, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))

        XCTAssertTrue(sut.primaryDidLeave())
        XCTAssertTrue(sut.isPrimaryVacated)
    }

    func test_primaryDidLeave_directCall_endsLikeBefore() {
        let (sut, host, _, _, _) = makeSUT(markGroup: false)

        XCTAssertFalse(sut.primaryDidLeave())
        XCTAssertEqual(host.vacateCallCount, 0)
    }

    func test_vacatedSeat_isNotReadmittedOnSync() {
        let (sut, _, _, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        sut.syncWithHost()

        XCTAssertFalse(sut.roster.contains("b"))
        XCTAssertNil(sut.videoTrack(for: "b"))
    }

    func test_vacatedSeat_formerPrimaryRejoining_isOfferedByTheMesh() async {
        let (sut, _, factory, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        sut.handleParticipantJoined(joined("b"))
        await settle()

        XCTAssertEqual(factory.link(to: "b")?.offerCallCount, 1)
        XCTAssertTrue(sut.consume(signal: signal("answer", from: "b"), callId: "call1"))
    }

    func test_newCall_freesTheVacatedSeat() {
        let (sut, host, _, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c"))
        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        host.groupCallId = "call2"
        sut.syncWithHost()

        XCTAssertFalse(sut.isPrimaryVacated)
        XCTAssertTrue(sut.roster.contains("b"))
    }

    // MARK: - L'en-tête d'un groupe qui continue (#9091)

    func test_participantLeft_primaryOfTitledGroup_retitlesWithTheGroupTitle() {
        let (sut, host, _, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c", name: "Chloé"))

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        XCTAssertEqual(host.titles, ["Équipe"], "l'en-tête ne nomme plus le partant")
    }

    func test_participantLeft_primaryOfUntitledGroup_namesTheRemainingMembers() {
        let (sut, host, _, _, _) = makeSUT(markGroup: false)
        sut.markGroupConversation("group1", title: nil)
        sut.handleParticipantJoined(joined("c", name: "Chloé"))
        sut.handleParticipantJoined(joined("d", name: "Dia"))

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        XCTAssertEqual(host.titles, ["Chloé, Dia"])
    }

    func test_vacatedSeat_rosterChange_retitlesOnlyWhenTheNameChanges() {
        let (sut, host, _, _, _) = makeSUT(markGroup: false)
        sut.markGroupConversation("group1", title: nil)
        sut.handleParticipantJoined(joined("c", name: "Chloé"))
        sut.handleParticipantJoined(joined("d", name: "Dia"))
        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        sut.handleMediaToggled(decode(CallMediaToggleData.self, #"{"callId":"call1","userId":"c","mediaType":"audio","enabled":false}"#))
        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "d"))

        XCTAssertEqual(host.titles, ["Chloé, Dia", "Chloé"])
    }

    func test_participantLeft_primaryAlone_keepsTheTitle() {
        let (sut, host, _, _, _) = makeSUT()

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "b"))

        XCTAssertTrue(host.titles.isEmpty)
    }

    func test_memberLeaving_whilePrimaryHoldsTheSeat_keepsTheTitle() {
        let (sut, host, _, _, _) = makeSUT()
        sut.handleParticipantJoined(joined("c", name: "Chloé"))

        sut.handleParticipantLeft(CallParticipantData(callId: "call1", userId: "c"))

        XCTAssertTrue(host.titles.isEmpty)
    }

    // MARK: - Nature de l'appel

    func test_incomingGroupCall_marksConversationWithTitle() {
        let (sut, _, _, _, _) = makeSUT(markGroup: false)
        let offer = decode(CallOfferData.self, #"{"callId":"call1","conversationId":"group1","initiator":{"userId":"b","username":"bob"},"conversationType":"group","conversationTitle":"Équipe"}"#)

        sut.handleIncomingCall(offer)

        XCTAssertTrue(sut.isGroupConversation("group1"))
        XCTAssertEqual(sut.groupTitle(for: "group1"), "Équipe")
    }

    /// #9084 — un duo devenu groupe garde `conversationType == "direct"` : c'est
    /// l'invitation (`isGroup`) qui dit que l'appel réunit plus de deux membres.
    func test_handleIncomingCall_invitationIntoDirectConversation_marksGroup() {
        let (sut, _, _, _, _) = makeSUT(markGroup: false)

        sut.handleIncomingCall(invitation())

        XCTAssertTrue(sut.isGroupConversation("group1"))
    }

    /// #9084 — chez l'invité qui sonne, l'offre de l'invitant revient à la
    /// liaison principale ; celle d'un autre membre attend le maillage au lieu
    /// d'écraser l'offre en attente du principal.
    func test_consume_invitationRinging_otherMemberOfferWaitsForTheMesh() async {
        let (sut, host, factory, _, _) = makeSUT(engaged: false, markGroup: false)
        host.groupPrimaryUserId = "a"
        sut.handleIncomingCall(invitation())

        XCTAssertFalse(sut.consume(signal: signal("offer", from: "a"), callId: "call1"))
        XCTAssertTrue(sut.consume(signal: signal("offer", from: "b"), callId: "call1"))

        host.isGroupCallEngaged = true
        sut.syncWithHost()
        await settle()

        XCTAssertEqual(factory.link(to: "b")?.received.map(\.kind), [.offer])
        XCTAssertNil(factory.link(to: "a"))
    }

    func test_incomingDirectCall_isNotMarked() {
        let (sut, _, _, _, _) = makeSUT(markGroup: false)
        let offer = decode(CallOfferData.self, #"{"callId":"call1","conversationId":"dm1","initiator":{"userId":"b","username":"bob"},"conversationType":"direct"}"#)

        sut.handleIncomingCall(offer)

        XCTAssertFalse(sut.isGroupConversation("dm1"))
    }
}
