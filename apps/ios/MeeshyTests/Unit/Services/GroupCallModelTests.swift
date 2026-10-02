import XCTest
import MeeshySDK
@testable import Meeshy

/// #3585 — les règles pures d'un appel de groupe : le registre des membres, le
/// tri des signaux entre le pair principal et le maillage, la grille, qui parle,
/// et la charge d'un signal émis.
@MainActor
final class GroupCallModelTests: XCTestCase {

    private func arrival(_ userId: String, name: String? = nil, audio: Bool? = nil, video: Bool? = nil) -> GroupCallArrival {
        GroupCallArrival(userId: userId, displayName: name, isAudioEnabled: audio, isVideoEnabled: video)
    }

    // MARK: - Registre

    func test_admitting_newMember_appendsInArrivalOrder() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b", name: "Bob"))
            .admitting(arrival("c", name: "Chloé"))

        XCTAssertEqual(roster.members.map(\.userId), ["b", "c"])
        XCTAssertEqual(roster.participantCount, 3)
    }

    func test_admitting_self_isIgnored() {
        let roster = GroupCallRoster(localUserId: "me").admitting(arrival("me"))

        XCTAssertTrue(roster.members.isEmpty)
    }

    func test_admitting_beyondCapacity_isIgnored() {
        let full = (1...5).reduce(GroupCallRoster(localUserId: "me")) { $0.admitting(arrival("u\($1)")) }

        let overflow = full.admitting(arrival("u6"))

        XCTAssertTrue(full.isFull)
        XCTAssertEqual(overflow.members.count, 5)
        XCTAssertFalse(overflow.contains("u6"))
    }

    func test_capacity_defaultsToGatewayCeiling() {
        XCTAssertEqual(GroupCallRoster(localUserId: "me").capacity, CallRules.maxParticipants)
    }

    func test_admitting_existingMember_enrichesWithoutErasingKnownName() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b", name: "Bob", audio: true, video: false))
            .admitting(arrival("b", name: nil, video: true), isPrimary: true)

        let bob = roster.member("b")
        XCTAssertEqual(bob?.displayName, "Bob")
        XCTAssertEqual(bob?.isCameraOn, true)
        XCTAssertEqual(bob?.isPrimary, true)
        XCTAssertEqual(roster.members.count, 1)
    }

    func test_applying_mediaToggles_updatesOnlyThatMember() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b", audio: true, video: true))
            .admitting(arrival("c", audio: true, video: true))
            .applying(.audio, enabled: false, for: "b")
            .applying(.screen, enabled: true, for: "b")

        XCTAssertEqual(roster.member("b")?.isMicMuted, true)
        XCTAssertEqual(roster.member("b")?.isScreenSharing, true)
        XCTAssertEqual(roster.member("c")?.isMicMuted, false)
    }

    func test_removing_dropsMember() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b"))
            .removing("b")

        XCTAssertFalse(roster.contains("b"))
    }

    // MARK: - Tri des signaux

    func test_destination_directCall_alwaysPrimary() {
        let destination = GroupSignalRouting.destination(from: "guest", localUserId: "me", primaryUserId: "b", isGroupCall: false)

        XCTAssertEqual(destination, .primary)
    }

    func test_destination_groupCall_signalFromThirdMember_goesToMesh() {
        let destination = GroupSignalRouting.destination(from: "c", localUserId: "me", primaryUserId: "b", isGroupCall: true)

        XCTAssertEqual(destination, .mesh(userId: "c"))
    }

    func test_destination_groupCall_signalFromPrimary_staysPrimary() {
        let destination = GroupSignalRouting.destination(from: "b", localUserId: "me", primaryUserId: "b", isGroupCall: true)

        XCTAssertEqual(destination, .primary)
    }

    func test_destination_ownEcho_isIgnored() {
        let destination = GroupSignalRouting.destination(from: "me", localUserId: "me", primaryUserId: "b", isGroupCall: true)

        XCTAssertEqual(destination, .ignore)
    }

    func test_destination_missingFromOrUndesignatedPrimary_staysPrimary() {
        XCTAssertEqual(GroupSignalRouting.destination(from: nil, localUserId: "me", primaryUserId: "b", isGroupCall: true), .primary)
        XCTAssertEqual(GroupSignalRouting.destination(from: "c", localUserId: "me", primaryUserId: nil, isGroupCall: true), .primary)
    }

    func test_shouldOfferToArrival_onlyForNonPrimaryArrivalWhileInCall() {
        XCTAssertTrue(GroupSignalRouting.shouldOfferToArrival(arrivalUserId: "c", localUserId: "me", primaryUserId: "b", isInCall: true))
        XCTAssertFalse(GroupSignalRouting.shouldOfferToArrival(arrivalUserId: "b", localUserId: "me", primaryUserId: "b", isInCall: true))
        XCTAssertFalse(GroupSignalRouting.shouldOfferToArrival(arrivalUserId: "c", localUserId: "me", primaryUserId: "b", isInCall: false))
        XCTAssertFalse(GroupSignalRouting.shouldOfferToArrival(arrivalUserId: "c", localUserId: "me", primaryUserId: nil, isInCall: true))
    }

    // MARK: - Grille

    func test_layout_growsWithTileCount() {
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 1, isLandscape: false), GroupCallGridLayout(columns: 1, rows: 1))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 2, isLandscape: false), GroupCallGridLayout(columns: 1, rows: 2))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 2, isLandscape: true), GroupCallGridLayout(columns: 2, rows: 1))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 4, isLandscape: false), GroupCallGridLayout(columns: 2, rows: 2))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 6, isLandscape: false), GroupCallGridLayout(columns: 2, rows: 3))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 6, isLandscape: true), GroupCallGridLayout(columns: 3, rows: 2))
    }

    func test_layout_alwaysHoldsEveryTileUpToTheMeshCeiling() {
        (1...CallRules.maxParticipants).forEach { count in
            XCTAssertGreaterThanOrEqual(GroupCallGridLayout.layout(tileCount: count, isLandscape: false).capacity, count)
            XCTAssertGreaterThanOrEqual(GroupCallGridLayout.layout(tileCount: count, isLandscape: true).capacity, count)
        }
    }

    // MARK: - Qui parle

    func test_speaker_entersAboveThreshold_andHoldsBetweenSyllables() {
        let start = Date(timeIntervalSince1970: 0)
        let speaking = ActiveSpeakerDetector().recording(["b": 0.2, "c": 0.01], at: start)
        let pause = speaking.recording(["b": 0.0], at: start.addingTimeInterval(0.5))

        XCTAssertEqual(speaking.speakers, ["b"])
        XCTAssertTrue(pause.isSpeaking("b"))
    }

    func test_speaker_leavesAfterHoldExpires() {
        let start = Date(timeIntervalSince1970: 0)
        let silent = ActiveSpeakerDetector()
            .recording(["b": 0.2], at: start)
            .recording(["b": 0.0], at: start.addingTimeInterval(1.0))

        XCTAssertFalse(silent.isSpeaking("b"))
    }

    func test_speaker_quietVoiceBelowEnterLevel_neverLights() {
        let detector = ActiveSpeakerDetector().recording(["b": 0.04], at: Date())

        XCTAssertTrue(detector.speakers.isEmpty)
    }

    func test_forgetting_clearsLeftMember() {
        let detector = ActiveSpeakerDetector().recording(["b": 0.3], at: Date()).forgetting("b")

        XCTAssertFalse(detector.isSpeaking("b"))
    }

    // MARK: - Charge d'un signal émis

    func test_candidatePayload_carriesIntegerLineIndex_andRouting() {
        let signal = GroupCallOutgoingSignal.candidate("candidate:1", sdpMid: "0", sdpMLineIndex: 1, negotiationId: 3)

        let payload = signal.payload(from: "me", to: "c")

        XCTAssertEqual(payload["to"] as? String, "c")
        XCTAssertEqual(payload["from"] as? String, "me")
        XCTAssertEqual(payload["negotiationId"] as? Int, 3)
        XCTAssertEqual(payload["sdpMLineIndex"] as? Int, 1)
        XCTAssertEqual(payload["sdpMid"] as? String, "0")
        XCTAssertNil(payload["sdp"])
    }

    func test_offerPayload_carriesSdpOnly() {
        let payload = GroupCallOutgoingSignal.description(.offer, sdp: "v=0", negotiationId: 1).payload(from: "me", to: "c")

        XCTAssertEqual(payload["sdp"] as? String, "v=0")
        XCTAssertNil(payload["candidate"])
        XCTAssertNil(payload["sdpMLineIndex"])
    }

    // MARK: - Niveau audio reçu

    func test_callStatsReduce_keepsLoudestInboundAudioLevel() {
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "a1", type: "inbound-rtp", kind: "audio", values: ["audioLevel": 0.12]),
            CallStats.RawEntry(id: "a2", type: "inbound-rtp", kind: "audio", values: ["audioLevel": 0.4]),
            CallStats.RawEntry(id: "v1", type: "inbound-rtp", kind: "video", values: ["audioLevel": 0.9])
        ])

        XCTAssertEqual(stats.inboundAudioLevel, 0.4, accuracy: 0.0001)
    }

    // MARK: - Tuiles

    func test_stageTiles_localFirst_thenMembersInArrivalOrder() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b", name: "Bob"), isPrimary: true)
            .admitting(arrival("c", name: "Chloé", audio: false, video: true))

        let tiles = GroupCallStage.tiles(
            roster: roster,
            speakingUserIds: ["c"],
            localName: "Vous",
            isLocalMicMuted: false,
            isLocalVideoEnabled: true,
            isPrimaryVideoActive: false
        )

        XCTAssertEqual(tiles.map(\.id), [GroupCallStage.localTileId, "b", "c"])
        XCTAssertFalse(tiles[1].showsVideo, "le principal suit l'état vidéo que CallManager tient")
        XCTAssertTrue(tiles[2].showsVideo)
        XCTAssertTrue(tiles[2].isSpeaking)
        XCTAssertTrue(tiles[2].isMicMuted)
    }

    func test_stage_shownOnlyFromTwoRemoteMembers() {
        let one = GroupCallRoster(localUserId: "me").admitting(arrival("b"))
        let two = one.admitting(arrival("c"))

        XCTAssertFalse(GroupCallStage.isShown(isMeshActive: true, roster: one))
        XCTAssertTrue(GroupCallStage.isShown(isMeshActive: true, roster: two))
        XCTAssertFalse(GroupCallStage.isShown(isMeshActive: false, roster: two))
    }

    // MARK: - Invitation (#9084)

    private func offer(_ json: String) throws -> CallOfferData {
        try JSONDecoder().decode(CallOfferData.self, from: Data(json.utf8))
    }

    /// L'invitant est celui qui offrira à l'invité : c'est lui le principal,
    /// et la réponse de l'invité doit lui revenir — pas à l'initiateur.
    func test_principalUserId_invitation_isTheInviter() throws {
        let event = try offer(#"{"callId":"c1","conversationId":"dm","initiator":{"userId":"b","username":"bob"},"conversationType":"direct","invitedBy":{"userId":"a","username":"alice"},"isGroup":true}"#)

        XCTAssertEqual(event.principalUserId, "a")
        XCTAssertTrue(event.isGroupCall)
    }

    func test_principalUserId_plainDirectCall_isTheInitiator() throws {
        let event = try offer(#"{"callId":"c1","conversationId":"dm","initiator":{"userId":"b","username":"bob"},"conversationType":"direct"}"#)

        XCTAssertEqual(event.principalUserId, "b")
        XCTAssertFalse(event.isGroupCall)
    }

    func test_isGroupCall_groupConversationWithoutInvitation_isGroup() throws {
        let event = try offer(#"{"callId":"c1","conversationId":"g","initiator":{"userId":"b","username":"bob"},"conversationType":"group"}"#)

        XCTAssertTrue(event.isGroupCall)
    }

    func test_isGroupCall_oldGatewayWithoutType_isNotGroup() throws {
        let event = try offer(#"{"callId":"c1","conversationId":"dm","initiator":{"userId":"b","username":"bob"}}"#)

        XCTAssertFalse(event.isGroupCall)
    }
}
