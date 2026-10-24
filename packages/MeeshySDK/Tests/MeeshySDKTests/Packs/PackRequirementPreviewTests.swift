import XCTest
@testable import MeeshySDK

/// **Ce qui reste à débloquer d'un pack, et comment** (S21 #11276, lot IC28 #11306).
///
/// La passerelle sert `requirementPreview` pour un pack du registre NON possédé qui se gagne (rang,
/// trophée, saison) ou qui a une fenêtre d'offre. Le client le LIT, le MONTRE, et ne propose pas le
/// geste que le serveur refuserait. Un ancien serveur ne le sert pas : l'absence vaut `nil`, et
/// la vitrine se lit exactement comme avant.
final class PackRequirementPreviewTests: XCTestCase {

    private func pack(_ json: String) throws -> ShopPack {
        try JSONDecoder().decode(ShopPack.self, from: Data(json.utf8))
    }

    private let rankPreview = """
    {"met":false,"reward":{"kind":"rank","rank":"voix","currentRank":"echo",\
    "requirement":{"current":2500,"required":6000,"missing":3500,"met":false}},"window":null}
    """

    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso) ?? .distantPast
    }

    // MARK: Le décodage tolérant

    func test_decode_readsTheGloryStillMissingForARankReward() throws {
        let served = try pack(#"{"slug":"contours-rituel","owned":false,"requirementPreview":\#(rankPreview)}"#)

        let preview = try XCTUnwrap(served.requirementPreview)
        XCTAssertFalse(preview.met)
        XCTAssertEqual(preview.reward, .rank("voix", PackRequirement(current: 2500, required: 6000, missing: 3500, met: false)))
        XCTAssertNil(preview.window)
    }

    func test_decode_anOlderServerSendsNoPreview_theAbsenceIsNilAndTheReadingIsUnchanged() throws {
        let served = try pack(#"{"slug":"contours-celte"}"#)

        XCTAssertNil(served.requirementPreview)
        XCTAssertTrue(served.isOwned, "un pack gratuit sans aperçu reste possédé, comme avant")
        XCTAssertFalse(served.isLocked)
    }

    func test_decode_anUnreadableShapeIsIgnored_theRowFallsBackAndTheShelfSurvives() throws {
        let served = try pack(#"{"slug":"a","requirementPreview":{"met":"oui"}}"#)

        XCTAssertEqual(served.slug, "a")
        XCTAssertNil(served.requirementPreview)
    }

    func test_decode_aRewardOfAFutureKindKeepsTheVerdictAndDropsTheLine() throws {
        let served = try pack(#"{"slug":"a","owned":false,"requirementPreview":{"met":false,"reward":{"kind":"streak","days":9},"window":null}}"#)

        let preview = try XCTUnwrap(served.requirementPreview)
        XCTAssertFalse(preview.met, "le verdict du serveur fait foi, même sans la forme de la règle")
        XCTAssertNil(preview.reward)
        XCTAssertTrue(served.isLocked)
        XCTAssertTrue(preview.clauses.isEmpty)
    }

    func test_codable_roundTripsThroughTheCacheOfTheShelf() throws {
        let original = try pack(#"{"slug":"a","owned":false,"requirementPreview":{"met":false,"reward":{"kind":"season","number":3,"met":false},"window":{"state":"upcoming","startsAt":"2026-11-01T00:00:00.000Z"}}}"#)

        let again = try JSONDecoder().decode(ShopPack.self, from: try JSONEncoder().encode(original))

        XCTAssertEqual(again, original)
        XCTAssertEqual(again.requirementPreview?.window?.startsAt, date("2026-11-01T00:00:00Z"))
    }

    // MARK: La possession et le verrou

    func test_isOwned_aPackThatCarriesAPreviewIsNotOwnedWhenTheServerStaysSilent() throws {
        let silent = try pack(#"{"slug":"a","requirementPreview":\#(rankPreview)}"#)
        let told = try pack(#"{"slug":"a","owned":true,"requirementPreview":{"met":true,"reward":null,"window":null}}"#)

        XCTAssertFalse(silent.isOwned, "un pack à gagner n'est pas possédé d'office parce qu'il est sans prix")
        XCTAssertTrue(told.isOwned)
    }

    func test_isLocked_followsTheVerdictOfTheServer() throws {
        XCTAssertTrue(try pack(#"{"slug":"a","owned":false,"requirementPreview":\#(rankPreview)}"#).isLocked)
        XCTAssertFalse(try pack(#"{"slug":"a","owned":false,"requirementPreview":{"met":true,"reward":null,"window":{"state":"open"}}}"#).isLocked)
    }

    func test_state_aLockedPackOffersNeitherInstallNorPurchase() throws {
        let locked = try pack(#"{"slug":"a","installed":false,"owned":false,"requirementPreview":\#(rankPreview)}"#)
        let paidAndLocked = try pack(#"{"slug":"b","installed":false,"price":40,"owned":false,"requirementPreview":\#(rankPreview)}"#)
        let state = PackShopState(sections: [PackShopSection(domain: .avatarRing, packs: [locked, paidAndLocked])], balance: 100)

        XCTAssertNil(state.togglingInstall(.avatarRing, "a"), "le serveur répondrait 403 not-owned")
        XCTAssertNil(state.purchasing(.avatarRing, "b", makeRequestId: { "r" }))
    }

    func test_state_anUnlockedPackWithAnOpenWindowStillBuysAndInstalls() throws {
        let open = try pack(#"{"slug":"a","installed":false,"price":40,"owned":false,"requirementPreview":{"met":true,"reward":null,"window":{"state":"open","endsAt":"2026-12-01T00:00:00Z"}}}"#)
        let earned = try pack(#"{"slug":"b","installed":false,"owned":true}"#)
        let state = PackShopState(sections: [PackShopSection(domain: .banner, packs: [open, earned])], balance: 100)

        XCTAssertNotNil(state.purchasing(.banner, "a", makeRequestId: { "r" }))
        XCTAssertNotNil(state.togglingInstall(.banner, "b"))
    }

    func test_state_anInstalledPackCanAlwaysBeRemoved() throws {
        let installed = try pack(#"{"slug":"a","installed":true,"owned":false,"requirementPreview":\#(rankPreview)}"#)
        let state = PackShopState(sections: [PackShopSection(domain: .banner, packs: [installed])])

        XCTAssertNotNil(state.togglingInstall(.banner, "a"))
    }

    // MARK: La ligne, en clauses

    func test_clauses_aRankRewardSaysTheRankAndTheGloryMissing() throws {
        let preview = try XCTUnwrap(try pack(#"{"slug":"a","requirementPreview":\#(rankPreview)}"#).requirementPreview)

        XCTAssertEqual(preview.clauses, [.rank(.voix, missing: 3500)])
    }

    func test_clauses_anUnknownRankStillSaysTheGloryMissing() {
        let preview = PackRequirementPreview(met: false,
            reward: .rank("titan", PackRequirement(current: 0, required: 9, missing: 9, met: false)), window: nil)

        XCTAssertEqual(preview.clauses, [.glory(missing: 9)])
    }

    func test_clauses_aMetRewardIsNotSaidAgain() {
        let preview = PackRequirementPreview(met: false,
            reward: .rank("voix", PackRequirement(current: 7000, required: 6000, missing: 0, met: true)),
            window: PackWindowPreview(state: .closed))

        XCTAssertEqual(preview.clauses, [.closed])
    }

    func test_clauses_trophyAndSeasonAreSaidOnlyWhileUnmet() {
        XCTAssertEqual(PackRequirementPreview(met: false, reward: .trophy(key: "polyglotte", met: false), window: nil).clauses, [.trophy])
        XCTAssertEqual(PackRequirementPreview(met: false, reward: .season(number: 3, met: false), window: nil).clauses, [.season(3)])
        XCTAssertTrue(PackRequirementPreview(met: true, reward: .trophy(key: "polyglotte", met: true), window: nil).clauses.isEmpty)
        XCTAssertTrue(PackRequirementPreview(met: true, reward: .season(number: 3, met: true), window: nil).clauses.isEmpty)
    }

    func test_clauses_theWindowSaysWhenItOpensOrEnds_andNothingWithoutADate() {
        let starts = date("2026-11-01T00:00:00Z")
        let ends = date("2026-12-01T00:00:00Z")

        XCTAssertEqual(PackRequirementPreview(met: false, reward: nil, window: PackWindowPreview(state: .upcoming, startsAt: starts)).clauses, [.upcoming(starts)])
        XCTAssertEqual(PackRequirementPreview(met: true, reward: nil, window: PackWindowPreview(state: .open, endsAt: ends)).clauses, [.until(ends)])
        XCTAssertTrue(PackRequirementPreview(met: true, reward: nil, window: PackWindowPreview(state: .open)).clauses.isEmpty, "une fenêtre ouverte sans fin ne se dit pas")
        XCTAssertTrue(PackRequirementPreview(met: false, reward: nil, window: PackWindowPreview(state: .upcoming)).clauses.isEmpty)
    }

    func test_clauses_rewardFirstThenWindow() {
        let ends = date("2026-12-01T00:00:00Z")
        let preview = PackRequirementPreview(met: false, reward: .season(number: 2, met: false),
                                             window: PackWindowPreview(state: .open, endsAt: ends))

        XCTAssertEqual(preview.clauses, [.season(2), .until(ends)])
    }

    // MARK: Le sélecteur du profil

    func test_profileDecor_aPackWonByTheGameIsListedOnceInstalled_aLockedOneNever() throws {
        let won = try pack(#"{"slug":"contours-rituel","installed":true,"owned":true}"#)
        let lockedYetFlaggedInstalled = try pack(#"{"slug":"contours-celte","installed":true,"requirementPreview":\#(rankPreview)}"#)

        let slugs = ProfileDecorOptions.rings(installed: [won, lockedYetFlaggedInstalled]).map(\.pack)

        XCTAssertEqual(slugs, ["contours-rituel"])
    }
}
