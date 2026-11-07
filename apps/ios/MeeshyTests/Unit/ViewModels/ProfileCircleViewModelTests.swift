import XCTest
import MeeshySDK
@testable import Meeshy

/// Le profil d'un Ami ou d'un Proche montre le niveau COMMUN (#13940) — celui que `GET /relations` sert à l'appelant
/// seul, donc visible des deux seuls — et l'action de montée quand la loi de demande la laisse proposer. Rien n'est
/// fabriqué : sans lien servi, le profil garde le badge « Connectés » d'avant.
@MainActor
final class ProfileCircleViewModelTests: XCTestCase {

    private struct Rig {
        let sut: ProfileCircleViewModel
        let relations: MockRelationsService
        let friends: MockFriendService
        let queue: MockOfflineQueue
        let forgotten: ForgottenFriendships
    }

    final class ForgottenFriendships: @unchecked Sendable {
        var ids: [String] = []
    }

    final class Observed: @unchecked Sendable {
        var level: RelationLevel?
    }

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        try await super.tearDown()
    }

    private func makeRig(userId: String = "a") -> Rig {
        let relations = MockRelationsService()
        let friends = MockFriendService()
        let queue = MockOfflineQueue()
        let forgotten = ForgottenFriendships()
        let sut = ProfileCircleViewModel(
            userId: userId,
            relations: relations,
            friendService: friends,
            offlineQueue: queue,
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            forgetFriendship: { forgotten.ids.append($0) }
        )
        return Rig(sut: sut, relations: relations, friends: friends, queue: queue, forgotten: forgotten)
    }

    private func link(_ userId: String, _ level: RelationLevel, eligibleFor: RelationLevel? = nil) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level, eligibleFor: eligibleFor)
    }

    private func sentRequest(to receiverId: String, level: String) -> FriendRequest {
        JSONStub.decode("""
        {"id":"s1","senderId":"me","receiverId":"\(receiverId)","status":"pending",
         "createdAt":"2026-11-01T10:00:00Z","targetLevel":"\(level)"}
        """)
    }

    func test_load_showsTheCommonLevelOfThisPersonOnly() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("b", .blood), link("a", .close)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.shownLevel, .close)
    }

    func test_withoutAServedLink_nothingIsInvented() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("b", .friend)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.shownLevel, "aucun lien servi : le profil garde son badge d'avant")
    }

    func test_aLinkBelowAcquaintance_isNotShown() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .community)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.shownLevel)
    }

    func test_theRaise_isNotOfferedWithoutTheServedSeries() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.offeredRaise, "Proche exige sa série : rien n'est proposé sans éligibilité servie")
    }

    func test_theRaise_isOfferedWhenTheServerServesTheSeriesAsReached() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.offeredRaise, .close)
    }

    func test_requestRaise_isAppliedLocallyThenQueuedWithTheTargetLevel() async throws {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        await rig.sut.load()

        let queued = await rig.sut.requestRaise()

        XCTAssertTrue(queued)
        XCTAssertEqual(rig.sut.pendingLevel, .close)
        XCTAssertNil(rig.sut.offeredRaise, "une demande en attente ne se propose pas deux fois")
        let payload = try XCTUnwrap(rig.queue.lastPayload as? SendFriendRequestPayload)
        XCTAssertEqual(payload.targetUserId, "a")
        XCTAssertEqual(payload.targetLevel, "CLOSE")
    }

    func test_requestRaise_enqueueFailure_rollsBack() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        await rig.sut.load()
        rig.queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        let queued = await rig.sut.requestRaise()

        XCTAssertFalse(queued)
        XCTAssertNil(rig.sut.pendingLevel)
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_aServedPendingRequest_isShownAsWaiting() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        rig.friends.sentRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [sentRequest(to: "a", level: "CLOSE")], pagination: nil, error: nil)
        )

        await rig.sut.load()

        XCTAssertEqual(rig.sut.pendingLevel, .close)
        XCTAssertNil(rig.sut.offeredRaise)
    }

    // MARK: - Promouvoir : seulement si c'est possible (#14910)

    func test_offeredRaise_aServedRaiseBlockInTheFuture_hidesThePromotion() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])
        rig.relations.linkResult = .success(RelationLink(
            userId: "a", effectiveLevel: .acquaintance, grantedByMe: .acquaintance,
            raiseBlockedUntil: Date().addingTimeInterval(86_400)
        ))

        await rig.sut.load()

        XCTAssertNil(rig.sut.offeredRaise, "un blocage de montée servi masque Promouvoir")
        XCTAssertEqual(rig.sut.shownLevel, .acquaintance)
    }

    func test_offeredRaise_aServedCanRaiseFalse_hidesThePromotion() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])
        rig.relations.linkResult = .success(RelationLink(
            userId: "a", effectiveLevel: .acquaintance, grantedByMe: .acquaintance, canRaise: false
        ))

        await rig.sut.load()

        XCTAssertNil(rig.sut.offeredRaise)
    }

    func test_offeredRaise_withoutAServedBlock_keepsTheCurrentOffer() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.offeredRaise, .friend, "absent ⇒ comportement d'avant")
    }

    func test_load_anAcquaintanceServedOnlyByTheDetailRead_isShown() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])
        rig.relations.linkResult = .success(link("a", .acquaintance))

        await rig.sut.load()

        XCTAssertEqual(rig.sut.shownLevel, .acquaintance)
    }

    // MARK: - Le Bring entre deux comptes de l'équipe (#16623)

    func test_offersBring_aServedAccessLevelOfBloodWithoutALink_offersIt_withoutShowingACircle() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])
        rig.relations.linkResult = .success(RelationLink(userId: "a", effectiveLevel: .public, grantedByMe: .public, accessLevel: .blood))

        await rig.sut.load()

        XCTAssertTrue(rig.sut.offersBring)
        XCTAssertNil(rig.sut.shownLevel, "aucun lien n'est fabriqué")
        XCTAssertFalse(rig.sut.claimsTheSlot)
    }

    func test_offersBring_aStrangerWithoutAccessLevel_isNotOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])
        rig.relations.linkResult = .success(link("a", .public))

        await rig.sut.load()

        XCTAssertFalse(rig.sut.offersBring)
    }

    func test_offersBring_anAcquaintance_isNotOffered_aFriend_is() async {
        let acquaintance = makeRig()
        acquaintance.relations.linksResult = .success([link("a", .acquaintance)])
        let friend = makeRig()
        friend.relations.linksResult = .success([link("a", .friend)])

        await acquaintance.sut.load()
        await friend.sut.load()

        XCTAssertFalse(acquaintance.sut.offersBring)
        XCTAssertTrue(friend.sut.offersBring)
    }

    // MARK: - Rétrograder d'un cran, annuler le lien à Connaissance (#14910)

    func test_offeredLowering_goesDownOneRungAndUnlinksAtAcquaintance() async {
        let cases: [(RelationLevel, ProfileCircleLowering)] = [
            (.blood, .demote(.close)), (.close, .demote(.friend)),
            (.friend, .demote(.acquaintance)), (.acquaintance, .unlink),
        ]
        for (level, expected) in cases {
            await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
            let rig = makeRig()
            rig.relations.linksResult = .success([link("a", level)])
            await rig.sut.load()
            XCTAssertEqual(rig.sut.offeredLowering, expected, "depuis \(level)")
        }
    }

    func test_offeredLowering_withoutALink_isNil() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])

        await rig.sut.load()

        XCTAssertNil(rig.sut.offeredLowering)
    }

    func test_offeredLowering_followsTheEffectiveLevel_notMyHigherGrant() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .blood)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.offeredLowering, .demote(.acquaintance))
    }

    func test_lower_isAppliedLocallyBeforeTheServerAnswers_thenSendsTheRungBelow() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        await rig.sut.load()
        let observed = Observed()
        let sut = rig.sut
        rig.relations.lowerHook = { await MainActor.run { observed.level = sut.shownLevel } }

        let lowered = await rig.sut.lower()

        XCTAssertTrue(lowered)
        XCTAssertEqual(observed.level, .friend, "le niveau change avant la réponse du serveur")
        XCTAssertEqual(rig.relations.lowerCalls, [.init(userId: "a", level: .friend)])
        XCTAssertEqual(rig.sut.shownLevel, .friend)
        XCTAssertNil(rig.sut.notice)
    }

    func test_lower_atAcquaintance_unlinksWithPublic() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])
        await rig.sut.load()

        let lowered = await rig.sut.lower()

        XCTAssertTrue(lowered)
        XCTAssertEqual(rig.relations.lowerCalls, [.init(userId: "a", level: .public)])
        XCTAssertNil(rig.sut.shownLevel)
        XCTAssertTrue(rig.sut.didUnlink)
        XCTAssertNil(rig.sut.offeredLowering)
    }

    func test_lower_failure_rollsBackAndSaysIt() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        await rig.sut.load()
        rig.relations.lowerResult = .failure(NSError(domain: "test", code: 1))

        let lowered = await rig.sut.lower()

        XCTAssertFalse(lowered)
        XCTAssertEqual(rig.sut.shownLevel, .friend)
        XCTAssertFalse(rig.sut.didUnlink)
        XCTAssertNotNil(rig.sut.notice)
        XCTAssertTrue(rig.forgotten.ids.isEmpty)
    }

    func test_lower_belowFriend_forgetsTheFriendship_aboveItDoesNot() async {
        let fromFriend = makeRig()
        fromFriend.relations.linksResult = .success([link("a", .friend)])
        await fromFriend.sut.load()
        _ = await fromFriend.sut.lower()
        XCTAssertEqual(fromFriend.forgotten.ids, ["a"])

        let fromClose = makeRig()
        fromClose.relations.linksResult = .success([link("a", .close)])
        await fromClose.sut.load()
        _ = await fromClose.sut.lower()
        XCTAssertTrue(fromClose.forgotten.ids.isEmpty, "Proche → Ami reste un ami")
    }

    func test_lower_clearsAPendingRequestAboveTheNewLevel() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        rig.friends.sentRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [sentRequest(to: "a", level: "CLOSE")], pagination: nil, error: nil)
        )
        await rig.sut.load()

        _ = await rig.sut.lower()

        XCTAssertNil(rig.sut.pendingLevel, "la passerelle retire la demande au-dessus du niveau baissé")
    }

    func test_lower_invalidatesTheCachedLinks_soTheNextOpenRevalidates() async {
        let first = makeRig()
        first.relations.linksResult = .success([link("a", .friend)])
        await first.sut.load()
        XCTAssertEqual(first.relations.linksCallCount, 1)
        _ = await first.sut.lower()

        let second = makeRig()
        second.relations.linksResult = .success([link("a", .acquaintance)])
        await second.sut.load()

        XCTAssertEqual(second.relations.linksCallCount, 1, "le cache invalidé force la relecture")
        XCTAssertEqual(second.sut.shownLevel, .acquaintance)
    }

    // MARK: - Libellés impératifs, un par cercle visé (#14910, décision porteur)

    func test_wording_promote_isOneImperativePerTargetCircle() {
        let labels = [RelationLevel.friend, .close, .blood].compactMap(ProfileCircleWording.promote(to:))
        XCTAssertEqual(labels.count, 3)
        XCTAssertEqual(Set(labels).count, 3, "Soyons amis, Soyons proches, Devenons sang : trois libellés distincts")
        XCTAssertNil(ProfileCircleWording.promote(to: .acquaintance), "on ne promeut jamais vers Connaissance depuis le profil")
        XCTAssertNil(ProfileCircleWording.promote(to: .public))
        for label in labels {
            XCTAssertFalse(label.contains("%"), "aucun gabarit générique « Promouvoir en %@ »")
        }
    }

    func test_wording_promoteAccessibility_namesThePersonAndKeepsTheVisibleLabel() {
        for level in [RelationLevel.friend, .close, .blood] {
            let visible = ProfileCircleWording.promote(to: level) ?? ""
            let spoken = ProfileCircleWording.promoteAccessibility(to: level, name: "Ada") ?? ""
            XCTAssertTrue(spoken.contains("Ada"), "\(level)")
            XCTAssertTrue(spoken.hasPrefix(visible), "le nom accessible commence par le libellé visible (\(level))")
        }
    }

    func test_wording_lowering_isOneImperativePerArrivalCircle_unlinkUnchanged() {
        let demotes = [RelationLevel.close, .friend, .acquaintance].map { ProfileCircleLowering.demote($0).label }
        XCTAssertEqual(Set(demotes).count, 3, "Restons proches, Restons amis, Restons en contact")
        XCTAssertFalse(demotes.contains(ProfileCircleLowering.unlink.label))
        XCTAssertEqual(ProfileCircleLowering.unlink.label, String(localized: "circles.action.unlink", defaultValue: "Annuler le lien", bundle: .main))
        demotes.forEach { XCTAssertFalse($0.contains("%")) }
    }

    func test_wording_confirmationTitle_isOnePerArrivalCircle_namingThePerson() {
        let titles = [RelationLevel.close, .friend, .acquaintance].map { ProfileCircleLowering.demote($0).confirmationTitle(name: "Ada") }
        XCTAssertEqual(Set(titles).count, 3)
        titles.forEach { XCTAssertTrue($0.contains("Ada")) }
        XCTAssertTrue(ProfileCircleLowering.unlink.confirmationTitle(name: "Ada").contains("Ada"))
    }
}
