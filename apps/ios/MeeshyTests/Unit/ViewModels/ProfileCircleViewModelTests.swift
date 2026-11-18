import XCTest
import MeeshySDK
import MeeshyUI
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

    final class ObservedOffers: @unchecked Sendable {
        var talkie: Bool?
        var together: Bool?
    }

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        try await super.tearDown()
    }

    private func makeRig(userId: String = "a", cached: [FriendRequest] = []) -> Rig {
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
            cachedReceived: { cached },
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

    func test_ourCircle_isNil_withoutAServedLink() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("b", .close)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.ourCircle, "« Notre cercle » ne s'ouvre pas sur un lien qui n'est pas servi")
    }

    func test_ourCircle_readsBothSides_fromTheServedLink() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([RelationLink(userId: "a", effectiveLevel: .close, grantedByMe: .blood)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.ourCircle?.common, .close)
        XCTAssertEqual(rig.sut.ourCircle?.mine, .blood)
        XCTAssertEqual(rig.sut.ourCircle?.missing, .theirGrant(.blood))
    }

    func test_models_shareOneModelPerPerson_whileAViewHoldsIt() {
        let first = makeRig(userId: "shared-a").sut
        let held = ProfileCircleModels.model(for: "shared-a") { first }
        let again = ProfileCircleModels.model(for: "SHARED-A") { self.makeRig(userId: "shared-a").sut }
        let other = ProfileCircleModels.model(for: "shared-b") { self.makeRig(userId: "shared-b").sut }

        XCTAssertTrue(held === again, "la pilule et la face Actions lisent le même lien")
        XCTAssertFalse(held === other)
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

    /// #19611 — planche `Etat-Erreur` vue 2 : une montée ratée reste dite dans « Notre cercle », et « Réessayer » la
    /// rejoue vers le même cran.
    func test_requestRaise_failure_isKeptUntilARetrySucceeds() async throws {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        await rig.sut.load()
        rig.queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        _ = await rig.sut.requestRaise()
        let failedRaise = rig.sut.failedRaise
        rig.queue.enqueueResult = .success("mock-cmid")
        let retried = await rig.sut.requestRaise()

        XCTAssertEqual(failedRaise, .close)
        XCTAssertTrue(retried)
        XCTAssertNil(rig.sut.failedRaise)
        XCTAssertEqual(rig.sut.pendingLevel, .close)
        let payload = try XCTUnwrap(rig.queue.lastPayload as? SendFriendRequestPayload)
        XCTAssertEqual(payload.targetLevel, "CLOSE")
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

    // MARK: - Partager ma position, dès Ami (#16983)

    func test_offersSharedLocation_anAcquaintance_isNotOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])
        rig.relations.linkResult = .success(link("a", .acquaintance))

        await rig.sut.load()

        XCTAssertFalse(rig.sut.offersSharedLocation)
    }

    func test_offersSharedLocation_aFriend_isOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.relations.linkResult = .success(link("a", .friend))

        await rig.sut.load()

        XCTAssertTrue(rig.sut.offersSharedLocation)
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

    func test_offersBring_anAcquaintance_isNotOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])
        rig.relations.linkResult = .success(link("a", .acquaintance))

        await rig.sut.load()

        XCTAssertFalse(rig.sut.offersBring)
    }

    func test_offersBring_aFriend_isOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.relations.linkResult = .success(link("a", .friend))

        await rig.sut.load()

        XCTAssertTrue(rig.sut.offersBring)
    }

    func test_offersTalkieAndTogether_aServedAccessLevelOfBloodWithoutALink_offersBoth() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])
        rig.relations.linkResult = .success(RelationLink(userId: "a", effectiveLevel: .public, grantedByMe: .public, accessLevel: .blood))

        await rig.sut.load()

        XCTAssertTrue(rig.sut.offersTalkie)
        XCTAssertTrue(rig.sut.offersTogether)
        XCTAssertNil(rig.sut.shownLevel, "aucun lien n'est fabriqué")
    }

    func test_offersTalkieAndTogether_aFriend_areNotOffered_butBringIs() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.relations.linkResult = .success(link("a", .friend))

        await rig.sut.load()

        XCTAssertTrue(rig.sut.offersBring)
        XCTAssertFalse(rig.sut.offersTalkie)
        XCTAssertFalse(rig.sut.offersTogether)
    }

    /// #18870 — la face Actions ne montre jamais une opération à la fois offerte et verrouillée : ce qui reste fermé
    /// se juge au même cercle que ce que le profil propose.
    func test_toolGateLevel_aFriend_locksExactlyWhatIsNotOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.relations.linkResult = .success(link("a", .friend))

        await rig.sut.load()

        let gate = rig.sut.toolGateLevel
        XCTAssertEqual(gate, .friend)
        XCTAssertEqual(ProfileRelationAction.talkie.gate(at: gate) == .offered, rig.sut.offersTalkie)
        XCTAssertEqual(ProfileRelationAction.together.gate(at: gate) == .offered, rig.sut.offersTogether)
        XCTAssertEqual(ProfileRelationAction.bring.gate(at: gate) == .offered, rig.sut.offersBring)
        XCTAssertEqual(ProfileRelationAction.battery.gate(at: gate) == .offered, rig.sut.offersBattery)
        XCTAssertEqual(ProfileRelationAction.unreachable.gate(at: gate) == .offered, rig.sut.offersPhoneReachability)
        XCTAssertEqual(ProfileRelationAction.location.gate(at: gate) == .offered, rig.sut.offersSharedLocation)
        XCTAssertEqual(ProfileRelationAction.lockedGroups(at: gate).map(\.opensAt), [.close])
    }

    func test_offersTalkieAndTogether_aStrangerWithoutAccessLevel_areNotOffered() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])
        rig.relations.linkResult = .success(link("a", .public))

        await rig.sut.load()

        XCTAssertFalse(rig.sut.offersTalkie)
        XCTAssertFalse(rig.sut.offersTogether)
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

    func test_offeredLowerings_aboveAcquaintance_offerTheRungBelowThenUnlink() async {
        let cases: [(RelationLevel, [ProfileCircleLowering])] = [
            (.blood, [.demote(.close), .unlink]), (.close, [.demote(.friend), .unlink]),
            (.friend, [.demote(.acquaintance), .unlink]), (.acquaintance, [.unlink]),
        ]
        for (level, expected) in cases {
            await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
            let rig = makeRig()
            rig.relations.linksResult = .success([link("a", level)])
            await rig.sut.load()
            XCTAssertEqual(rig.sut.offeredLowerings, expected, "depuis \(level)")
        }
    }

    func test_lower_unlinkFromClose_sendsPublic_andLeavesTheCircle() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        await rig.sut.load()

        let lowered = await rig.sut.lower(.unlink)

        XCTAssertTrue(lowered)
        XCTAssertEqual(rig.relations.lowerCalls, [.init(userId: "a", level: .public)])
        XCTAssertTrue(rig.sut.didUnlink)
    }

    func test_lower_aGestureThatIsNotOffered_doesNotLeave() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        await rig.sut.load()

        let lowered = await rig.sut.lower(.demote(.acquaintance))

        XCTAssertFalse(lowered, "seuls le cran inférieur et l'annulation sont proposés")
        XCTAssertTrue(rig.relations.lowerCalls.isEmpty)
    }

    // MARK: - Un seul chargement pour la pilule, « Notre cercle » et la face Actions (#18870)

    func test_load_threeConcurrentCalls_readTheLinksOnce() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        let sut = rig.sut

        async let pill: Void = sut.load()
        async let section: Void = sut.load()
        async let live: Void = sut.load()
        _ = await (pill, section, live)

        XCTAssertEqual(rig.relations.linksCallCount, 1, "trois vues, un modèle, un chargement")
        XCTAssertEqual(sut.shownLevel, .close)
    }

    func test_load_remountingTheActionsFace_doesNotReloadEverything() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        await rig.sut.load()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)

        await rig.sut.load()

        XCTAssertEqual(rig.relations.linksCallCount, 1, "une revalidation par ouverture de la fiche")
        XCTAssertEqual(rig.relations.linkCallCount, 1)
    }

    func test_reload_afterTheRitual_readsTheLinkAgain() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        rig.relations.linkResult = .success(link("a", .close))
        await rig.sut.load()
        rig.relations.linkResult = .success(link("a", .blood))
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        rig.relations.linksResult = .success([link("a", .blood)])

        await rig.sut.reload()

        XCTAssertEqual(rig.relations.linkCallCount, 2)
        XCTAssertEqual(rig.sut.shownLevel, .blood, "le Sang scellé se voit sans rouvrir la fiche")
    }

    func test_load_aDetailReadBeforeALowering_doesNotOverwriteTheLoweredTools() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        rig.relations.linkResult = .success(link("a", .close))
        let sut = rig.sut
        let relations = rig.relations
        relations.linkHook = {
            relations.linkResult = .success(RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend))
            _ = await sut.lower()
        }

        await sut.load()

        XCTAssertEqual(sut.shownLevel, .friend)
        XCTAssertFalse(sut.offersTalkie, "le Proche lu avant la baisse ne rend pas le talkie")
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

    // MARK: - Après une baisse, les outils suivent le lien, sauf le verdict d'équipe (#16623)

    func test_lower_fromClose_withdrawsTalkieAndTogether_beforeTheServerAnswers_keepsBring() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        rig.relations.linkResult = .success(link("a", .close))
        await rig.sut.load()
        XCTAssertTrue(rig.sut.offersTalkie)
        let observed = ObservedOffers()
        let sut = rig.sut
        rig.relations.lowerHook = {
            await MainActor.run {
                observed.talkie = sut.offersTalkie
                observed.together = sut.offersTogether
            }
        }
        rig.relations.linkResult = .success(link("a", .friend))

        _ = await rig.sut.lower()

        XCTAssertEqual(observed.talkie, false, "le talkie se retire avant la réponse du serveur")
        XCTAssertEqual(observed.together, false)
        XCTAssertFalse(rig.sut.offersTalkie)
        XCTAssertFalse(rig.sut.offersTogether)
        XCTAssertTrue(rig.sut.offersBring, "Proche → Ami garde le Bring")
    }

    func test_lower_fromFriend_withdrawsBring_evenWhenTheRereadFails() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.relations.linkResult = .success(link("a", .friend))
        await rig.sut.load()
        XCTAssertTrue(rig.sut.offersBring)
        rig.relations.linkResult = .failure(NSError(domain: "test", code: 1))

        _ = await rig.sut.lower()

        XCTAssertFalse(rig.sut.offersBring, "Ami → Connaissance : plus de Bring proposé")
    }

    func test_lower_betweenTeamAccounts_keepsTheServedToolLevelAboveTheLink() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.relations.linkResult = .success(RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend, accessLevel: .blood))
        await rig.sut.load()
        rig.relations.linkResult = .failure(NSError(domain: "test", code: 1))

        _ = await rig.sut.lower()

        XCTAssertEqual(rig.sut.shownLevel, .acquaintance)
        XCTAssertTrue(rig.sut.offersTalkie, "entre deux comptes de l'équipe, le lien ne décide pas des outils")
        XCTAssertTrue(rig.sut.offersBring)
        XCTAssertTrue(rig.sut.offersTogether)
    }

    func test_lower_twiceBetweenTeamAccountsLinkedAtBlood_theRereadVerdictKeepsTheTools() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .blood)])
        rig.relations.linkResult = .success(RelationLink(userId: "a", effectiveLevel: .blood, grantedByMe: .blood, accessLevel: .blood))
        await rig.sut.load()
        rig.relations.lowerResult = .success(link("a", .close))
        rig.relations.linkResult = .success(RelationLink(userId: "a", effectiveLevel: .close, grantedByMe: .close, accessLevel: .blood))
        _ = await rig.sut.lower()
        rig.relations.lowerResult = .success(link("a", .friend))
        rig.relations.linkResult = .failure(NSError(domain: "test", code: 1))

        _ = await rig.sut.lower()

        XCTAssertEqual(rig.sut.shownLevel, .friend)
        XCTAssertEqual(rig.sut.toolLevel, .blood, "le verdict relu après la première baisse fait foi")
        XCTAssertTrue(rig.sut.offersTalkie)
    }

    func test_lower_failure_restoresTheToolOffers() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        rig.relations.linkResult = .success(link("a", .close))
        await rig.sut.load()
        rig.relations.lowerResult = .failure(NSError(domain: "test", code: 1))

        _ = await rig.sut.lower()

        XCTAssertEqual(rig.sut.toolLevel, .close)
        XCTAssertTrue(rig.sut.offersTalkie)
        XCTAssertTrue(rig.sut.offersTogether)
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

/// « Notre cercle » (#18870, planche `Autre-Cercle`) : le niveau accordé de chaque côté tel que le lien le laisse LIRE,
/// ce que le cercle commun ouvre, ce que le cran suivant ajouterait, et ce qui manque pour y monter. Rien n'est inventé :
/// l'accord de l'autre n'est jamais servi, il se DÉDUIT du minimum.
final class OurCircleSummaryTests: XCTestCase {

    private func link(common: RelationLevel, mine: RelationLevel) -> RelationLink {
        RelationLink(userId: "leo", effectiveLevel: common, grantedByMe: mine)
    }

    func test_theirGrant_isExact_whenIGrantMoreThanTheCommonCircle() {
        let summary = OurCircleSummary.make(link(common: .close, mine: .blood), pending: nil)
        XCTAssertEqual(summary.mine, .blood)
        XCTAssertEqual(summary.theirs, .exactly(.close), "le minimum est son accord : il se lit sans rien révéler de plus")
    }

    func test_theirGrant_isOnlyAtLeast_whenMyGrantIsTheCommonCircle() {
        let summary = OurCircleSummary.make(link(common: .close, mine: .close), pending: nil)
        XCTAssertEqual(summary.theirs, .atLeast(.close), "son accord peut être plus haut : la fiche ne l'invente pas")
    }

    func test_missing_namesTheirGrant_whenOnlyTheirSideHoldsTheCommonCircleDown() {
        let summary = OurCircleSummary.make(link(common: .close, mine: .blood), pending: nil)
        XCTAssertEqual(summary.next, .blood)
        XCTAssertEqual(summary.missing, .theirGrant(.blood))
    }

    func test_missing_asksBothSides_whenMyGrantIsTheCommonCircle() {
        let summary = OurCircleSummary.make(link(common: .friend, mine: .friend), pending: nil)
        XCTAssertEqual(summary.missing, .bothChoose(.close))
    }

    func test_missing_saysTheRequestIsSent_whenARaiseIsPending() {
        let summary = OurCircleSummary.make(link(common: .friend, mine: .friend), pending: .close)
        XCTAssertEqual(summary.missing, .pending(.close))
    }

    func test_atTheTop_nothingIsMissing_andNothingMoreOpens() {
        let summary = OurCircleSummary.make(link(common: .blood, mine: .blood), pending: nil)
        XCTAssertNil(summary.next)
        XCTAssertNil(summary.missing)
        XCTAssertTrue(summary.nextOpens.isEmpty)
    }

    func test_opened_followsTheAccessLaw_neverAFeatureAboveTheCommonCircle() {
        let summary = OurCircleSummary.make(link(common: .close, mine: .blood), pending: nil)
        XCTAssertFalse(summary.opened.isEmpty)
        XCTAssertTrue(summary.opened.allSatisfy { $0.feature.minimumLevel <= .close })
        XCTAssertTrue(summary.opened.contains(.talkie))
        XCTAssertFalse(summary.opened.contains(.liveLocation))
    }

    func test_nextOpens_isExactlyWhatTheNextCircleAdds() {
        let summary = OurCircleSummary.make(link(common: .close, mine: .blood), pending: nil)
        XCTAssertFalse(summary.nextOpens.isEmpty)
        XCTAssertTrue(summary.nextOpens.allSatisfy { $0.feature.minimumLevel == .blood })
        XCTAssertTrue(summary.nextOpens.contains(.liveLocation))
        XCTAssertTrue(Set(summary.opened).isDisjoint(with: summary.nextOpens))
    }

    func test_opened_listsTheCommonCircleFirst() {
        let summary = OurCircleSummary.make(link(common: .close, mine: .close), pending: nil)
        let levels = summary.opened.map(\.feature.minimumLevel)
        XCTAssertEqual(levels, levels.sorted(by: >), "ce que Proche ouvre d'abord, puis ce qu'Ami ouvrait déjà")
    }

    func test_everyFeature_hasATitleAndAGlyph() {
        for feature in OurCircleFeature.allCases {
            XCTAssertFalse(feature.title.isEmpty, "\(feature)")
            XCTAssertFalse(feature.systemImage.isEmpty, "\(feature)")
        }
    }

    func test_since_readsTheServedInstant_andStaysNilWithoutIt() {
        let dated = RelationLink(userId: "leo", effectiveLevel: .close, grantedByMe: .close, since: "2026-03-19T10:00:00.000Z")
        XCTAssertNotNil(OurCircleSummary.make(dated, pending: nil).since)
        XCTAssertNil(OurCircleSummary.make(link(common: .close, mine: .close), pending: nil).since)
    }
}

// MARK: - Une proposition de cercle reçue (#19449, planche `Autre-Cercle`)

extension ProfileCircleViewModelTests {

    private func proposal(from senderId: String, level: String?, id: String = "r1",
                          status: String = "pending") -> FriendRequest {
        let target = level.map { ",\"targetLevel\":\"\($0)\"" } ?? ""
        return JSONStub.decode("""
        {"id":"\(id)","senderId":"\(senderId)","receiverId":"me","status":"\(status)",
         "createdAt":"2026-11-01T10:00:00Z"\(target)}
        """)
    }

    private func page(_ requests: [FriendRequest]) -> Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> {
        .success(OffsetPaginatedAPIResponse(success: true, data: requests, pagination: nil, error: nil))
    }

    private func loadedRig(common: RelationLevel, proposed: String) async -> Rig {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", common)])
        rig.friends.receivedRequestsResult = page([proposal(from: "a", level: proposed)])
        await rig.sut.load()
        return rig
    }

    func test_receivedProposal_aPendingRaiseFromThisPerson_isShownWithWhatItWouldOpen() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.friends.receivedRequestsResult = page([
            proposal(from: "b", level: "BLOOD", id: "rb"),
            proposal(from: "a", level: "CLOSE")
        ])

        await rig.sut.load()

        let shown = rig.sut.receivedProposal
        XCTAssertEqual(shown?.requestId, "r1", "seule la demande de CETTE personne se lit sur sa fiche")
        XCTAssertEqual(shown?.level, .close)
        XCTAssertEqual(shown?.opens, OurCircleSummary.addedBy(.close), "ce que Proche ajoute à Ami, rien d'autre")
    }

    func test_receivedProposal_atOrBelowTheCommonCircle_orNoLongerPending_isNotShown() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .close)])
        rig.friends.receivedRequestsResult = page([
            proposal(from: "a", level: "FRIEND", id: "low"),
            proposal(from: "a", level: "BLOOD", id: "done", status: "accepted")
        ])

        await rig.sut.load()

        XCTAssertNil(rig.sut.receivedProposal)
    }

    func test_receivedProposal_withoutAServedLink_isLeftToTheConnectionRequestCard() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([])
        rig.friends.receivedRequestsResult = page([proposal(from: "a", level: nil)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.receivedProposal, "sans lien, la demande de connexion garde sa carte d'avant")
    }

    func test_receivedProposal_isPaintedFromTheCache_whenTheNetworkFails() async {
        let rig = makeRig(cached: [proposal(from: "a", level: "CLOSE")])
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.friends.receivedRequestsResult = .failure(NSError(domain: "test", code: 1))

        await rig.sut.load()

        XCTAssertEqual(rig.sut.receivedProposal?.level, .close)
    }

    func test_receivedProposal_aRevalidationWithoutIt_withdrawsTheCachedCard() async {
        let rig = makeRig(cached: [proposal(from: "a", level: "CLOSE")])
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.friends.receivedRequestsResult = page([])

        await rig.sut.load()

        XCTAssertNil(rig.sut.receivedProposal, "la liste servie fait foi sur le cache")
    }

    func test_acceptProposal_raisesTheCommonCircleAtOnce_andQueuesTheAcceptance() async throws {
        let rig = await loadedRig(common: .friend, proposed: "CLOSE")

        let answer = await rig.sut.acceptProposal(name: "Léo")

        XCTAssertEqual(answer, .answered)
        XCTAssertNil(rig.sut.receivedProposal, "la carte part avant la réponse du serveur")
        XCTAssertEqual(rig.sut.shownLevel, .close, "le cercle commun monte aussitôt")
        XCTAssertEqual(rig.queue.enqueueCalls.first?.kind, .respondFriendRequest)
        let payload = try XCTUnwrap(rig.queue.lastPayload as? RespondFriendRequestPayload)
        XCTAssertEqual(payload.friendRequestId, "r1")
        XCTAssertEqual(payload.action, .accept)
    }

    func test_acceptProposal_refusedByTheServer_rollsBackTheCircleAndTheCard() async throws {
        let rig = await loadedRig(common: .friend, proposed: "CLOSE")
        _ = await rig.sut.acceptProposal(name: "Léo")
        let cmid = try XCTUnwrap((rig.queue.lastPayload as? RespondFriendRequestPayload)?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        rig.queue.emitOutcome(.exhausted(cmid: cmid), for: cmid)

        try await waitForCondition(timeout: 2) { rig.sut.receivedProposal != nil }
        XCTAssertEqual(rig.sut.shownLevel, .friend)
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_acceptProposal_enqueueFailure_rollsBackAndSaysIt() async {
        let rig = await loadedRig(common: .friend, proposed: "CLOSE")
        rig.queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        let answer = await rig.sut.acceptProposal(name: "Léo")

        XCTAssertEqual(answer, .notSent)
        XCTAssertEqual(rig.sut.receivedProposal?.requestId, "r1")
        XCTAssertEqual(rig.sut.shownLevel, .friend)
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_acceptProposal_ofBlood_opensTheRitual_andSendsNothing() async {
        let rig = await loadedRig(common: .close, proposed: "BLOOD")

        let answer = await rig.sut.acceptProposal(name: "Léo")

        XCTAssertEqual(answer, .opensRitual(CircleRitualTarget(userId: "a", name: "Léo")))
        XCTAssertTrue(rig.queue.enqueueCalls.isEmpty, "le Sang ne s'accepte que par le rituel")
        XCTAssertEqual(rig.sut.receivedProposal?.level, .blood, "la carte reste jusqu'au scellement")
        XCTAssertEqual(rig.sut.shownLevel, .close)
    }

    func test_declineProposal_withdrawsTheCardAtOnce_andQueuesTheRefusal() async throws {
        let rig = await loadedRig(common: .friend, proposed: "CLOSE")

        let sent = await rig.sut.declineProposal()

        XCTAssertTrue(sent)
        XCTAssertNil(rig.sut.receivedProposal)
        XCTAssertEqual(rig.sut.shownLevel, .friend, "refuser ne change pas le cercle commun")
        let payload = try XCTUnwrap(rig.queue.lastPayload as? RespondFriendRequestPayload)
        XCTAssertEqual(payload.action, .reject)
    }

    func test_declineProposal_refusedByTheServer_bringsTheCardBack() async throws {
        let rig = await loadedRig(common: .friend, proposed: "CLOSE")
        _ = await rig.sut.declineProposal()
        let cmid = try XCTUnwrap((rig.queue.lastPayload as? RespondFriendRequestPayload)?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        rig.queue.emitOutcome(.exhausted(cmid: cmid), for: cmid)

        try await waitForCondition(timeout: 2) { rig.sut.receivedProposal != nil }
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_postponeProposal_setsTheCardAside_sendsNothing_andARevalidationKeepsItAside() async {
        let rig = await loadedRig(common: .friend, proposed: "CLOSE")

        rig.sut.postponeProposal()
        await rig.sut.load()

        XCTAssertNil(rig.sut.receivedProposal)
        XCTAssertTrue(rig.queue.enqueueCalls.isEmpty)
    }

    func test_proposalCopy_namesThePersonAndTheCircle_andListsWhatItOpens() {
        let title = ProfileCircleProposalCopy.title(name: "Léo", level: .blood)
        XCTAssertTrue(title.contains("Léo"))
        XCTAssertTrue(title.contains(CircleLevelNames.title(of: .blood)))
        let opens = ProfileCircleProposalCopy.opens(level: .blood, features: OurCircleSummary.addedBy(.blood))
        XCTAssertTrue(opens?.contains(OurCircleFeature.liveLocation.title) == true)
        XCTAssertNil(ProfileCircleProposalCopy.opens(level: .blood, features: []))
    }
}
