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

    // MARK: - Nom d'un groupe sans son principal (#9091)

    func test_callTitle_titledGroup_isTheGroupTitle() {
        let roster = GroupCallRoster(localUserId: "me").admitting(arrival("c", name: "Chloé"))

        XCTAssertEqual(roster.callTitle(groupTitle: "Équipe"), "Équipe")
    }

    func test_callTitle_untitledGroup_namesTheRemainingMembers() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("c", name: "Chloé"))
            .admitting(arrival("d", name: "Dia"))

        XCTAssertEqual(roster.callTitle(groupTitle: nil), "Chloé, Dia")
        XCTAssertEqual(roster.callTitle(groupTitle: "  "), "Chloé, Dia", "un titre blanc n'est pas un titre")
    }

    func test_callTitle_untitledGroupBeyondTwo_namesTwoAndCountsTheRest() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("c", name: "Chloé"))
            .admitting(arrival("d", name: "Dia"))
            .admitting(arrival("e", name: "Eli"))

        let title = roster.callTitle(groupTitle: nil)

        XCTAssertTrue(title.hasPrefix("Chloé, Dia"), title)
        XCTAssertTrue(title.contains("1"), title)
        XCTAssertFalse(title.contains("Eli"), title)
    }

    func test_callTitle_unnamedOrNoMember_isNeverEmpty() {
        let unnamed = GroupCallRoster(localUserId: "me").admitting(arrival("c"))

        XCTAssertFalse(unnamed.callTitle(groupTitle: nil).isEmpty)
        XCTAssertFalse(GroupCallRoster(localUserId: "me").callTitle(groupTitle: nil).isEmpty)
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

    /// #9085 — le siège du principal libéré : tout le groupe passe par le maillage,
    /// l'ancien principal compris s'il revient.
    func test_destination_vacatedPrimary_everyMemberGoesToMesh() {
        XCTAssertEqual(GroupSignalRouting.destination(from: "b", localUserId: "me", primaryUserId: nil, isGroupCall: true, primaryVacated: true), .mesh(userId: "b"))
        XCTAssertEqual(GroupSignalRouting.destination(from: "me", localUserId: "me", primaryUserId: nil, isGroupCall: true, primaryVacated: true), .ignore)
        XCTAssertEqual(GroupSignalRouting.destination(from: "b", localUserId: "me", primaryUserId: nil, isGroupCall: false, primaryVacated: true), .primary)
    }

    func test_shouldOfferToArrival_vacatedPrimary_offersToEveryArrival() {
        XCTAssertTrue(GroupSignalRouting.shouldOfferToArrival(arrivalUserId: "b", localUserId: "me", primaryUserId: nil, isInCall: true, primaryVacated: true))
        XCTAssertFalse(GroupSignalRouting.shouldOfferToArrival(arrivalUserId: "me", localUserId: "me", primaryUserId: nil, isInCall: true, primaryVacated: true))
    }

    // MARK: - Grille

    func test_layout_growsWithTileCount() {
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 1, isLandscape: false, isCompactHeight: false), GroupCallGridLayout(columns: 1, rows: 1))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 2, isLandscape: false, isCompactHeight: false), GroupCallGridLayout(columns: 1, rows: 2))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 2, isLandscape: true, isCompactHeight: true), GroupCallGridLayout(columns: 2, rows: 1))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 4, isLandscape: false, isCompactHeight: false), GroupCallGridLayout(columns: 2, rows: 2))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 6, isLandscape: false, isCompactHeight: false), GroupCallGridLayout(columns: 2, rows: 3))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 6, isLandscape: true, isCompactHeight: true), GroupCallGridLayout(columns: 3, rows: 2))
    }

    /// L4.1 — en paysage de hauteur compacte (téléphone), quatre personnes tiennent sur UNE rangée de quatre (planche `cols:4`).
    /// La planche ne dessine pas trois personnes en paysage : leur grille 2 × 2 (#3585) ne change pas.
    /// Le portrait garde sa grille 2 × 2.
    func test_layout_compactLandscape_putsFourOnASingleRow_andKeepsThreeInTheirGrid() {
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 4, isLandscape: true, isCompactHeight: true), GroupCallGridLayout(columns: 4, rows: 1))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 3, isLandscape: true, isCompactHeight: true), GroupCallGridLayout(columns: 2, rows: 2))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 3, isLandscape: false, isCompactHeight: false), GroupCallGridLayout(columns: 2, rows: 2))
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 4, isLandscape: false, isCompactHeight: false), GroupCallGridLayout(columns: 2, rows: 2))
    }

    /// W2 · W2.1 — scène large ET haute (iPad ou fenêtre en paysage, hauteur ample) : 2 × 2, jamais une rangée de quatre.
    /// Une scène large mais basse reste en rangée de quatre ; le seuil est celui de `CallGroupStageSizing`.
    func test_layout_landscapeWithAmpleHeight_keepsFourInTwoByTwo() {
        XCTAssertEqual(GroupCallGridLayout.layout(tileCount: 4, isLandscape: true, isCompactHeight: false), GroupCallGridLayout(columns: 2, rows: 2))
        XCTAssertTrue(CallGroupStageSizing.isCompactHeight(390))
        XCTAssertTrue(CallGroupStageSizing.isCompactHeight(430))
        XCTAssertFalse(CallGroupStageSizing.isCompactHeight(800))
        XCTAssertFalse(CallGroupStageSizing.isCompactHeight(820))
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

    /// P11.5 — mon propre niveau vient de la source média sortante (`media-source`
    /// audio) ; il ne se confond jamais avec le niveau reçu.
    func test_callStatsReduce_readsMyOwnLevelFromTheOutgoingAudioSource() {
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "a1", type: "inbound-rtp", kind: "audio", values: ["audioLevel": 0.4]),
            CallStats.RawEntry(id: "s1", type: "media-source", kind: "audio", values: ["audioLevel": 0.25]),
            CallStats.RawEntry(id: "s2", type: "media-source", kind: "video", values: ["audioLevel": 0.9])
        ])

        XCTAssertEqual(stats.outboundAudioLevel, 0.25, accuracy: 0.0001)
        XCTAssertEqual(stats.inboundAudioLevel, 0.4, accuracy: 0.0001)
    }

    // MARK: - Tuiles

    /// P11.3 — la planche range ma vignette EN DERNIER : les autres dans leur ordre
    /// d'arrivée, puis moi. Ce témoin figeait « moi d'abord », antérieur à la planche.
    func test_stageTiles_membersInArrivalOrder_thenLocalLast() {
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

        XCTAssertEqual(tiles.map(\.id), ["b", "c", GroupCallStage.localTileId])
        XCTAssertFalse(tiles[0].showsVideo, "le principal suit l'état vidéo que CallManager tient")
        XCTAssertTrue(tiles[1].showsVideo)
        XCTAssertTrue(tiles[1].isSpeaking)
        XCTAssertTrue(tiles[1].isMicMuted)
        XCTAssertTrue(tiles[2].isLocal)
    }

    func test_stageTiles_localLast_whoeverSpeaks_theOrderNeverMoves() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b"), isPrimary: true)
            .admitting(arrival("c"))
        func ids(speaking: Set<String>) -> [String] {
            GroupCallStage.tiles(
                roster: roster, speakingUserIds: speaking, localName: "Vous",
                isLocalMicMuted: false, isLocalVideoEnabled: false, isPrimaryVideoActive: false
            ).map(\.id)
        }

        XCTAssertEqual(ids(speaking: []), ids(speaking: ["c"]))
        XCTAssertEqual(ids(speaking: ["me"]), ids(speaking: ["b", "c"]))
        XCTAssertEqual(ids(speaking: []).last, GroupCallStage.localTileId)
    }

    /// P11.5 — ma tuile s'illumine aussi quand JE parle : la planche dit « qui parle »
    /// sans m'exclure. Le maillage nomme mon identifiant parmi ceux qui parlent.
    func test_stageTiles_myTileSpeaks_whenTheMeshNamesMe() {
        let roster = GroupCallRoster(localUserId: "me")
            .admitting(arrival("b"), isPrimary: true)
            .admitting(arrival("c"))

        let tiles = GroupCallStage.tiles(
            roster: roster, speakingUserIds: ["me"], localName: "Vous",
            isLocalMicMuted: false, isLocalVideoEnabled: false, isPrimaryVideoActive: false
        )

        XCTAssertEqual(tiles.filter(\.isSpeaking).map(\.id), [GroupCallStage.localTileId])
    }

    func test_stage_shownOnlyFromTwoRemoteMembers() {
        let one = GroupCallRoster(localUserId: "me").admitting(arrival("b"), isPrimary: true)
        let two = one.admitting(arrival("c"))

        XCTAssertFalse(GroupCallStage.isShown(isMeshActive: true, roster: one))
        XCTAssertTrue(GroupCallStage.isShown(isMeshActive: true, roster: two))
        XCTAssertFalse(GroupCallStage.isShown(isMeshActive: false, roster: two))
    }

    /// #9085 — le principal parti, il peut ne rester qu'UN membre, tenu par le
    /// maillage : l'écran 1:1 ne montre que le principal, la grille doit rester.
    func test_stage_shownForASingleMeshMember() {
        let meshOnly = GroupCallRoster(localUserId: "me").admitting(arrival("c"))
        let primaryOnly = GroupCallRoster(localUserId: "me").admitting(arrival("b"), isPrimary: true)

        XCTAssertTrue(GroupCallStage.isShown(isMeshActive: true, roster: meshOnly))
        XCTAssertFalse(GroupCallStage.isShown(isMeshActive: true, roster: primaryOnly))
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
