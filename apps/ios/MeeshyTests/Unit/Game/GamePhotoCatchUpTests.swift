import XCTest
@testable import Meeshy
import MeeshySDK

/// LE RATTRAPAGE DU CARNET (#9961, #9962) : chaque étape passée sans photo se propose, dans l'ordre.
/// Miroir de `packages/shared/__tests__/game/photo-catch-up.test.ts`.
@MainActor
final class GamePhotoCatchUpTests: XCTestCase {

    private func ids(_ steps: [PhotoStep], track: PhotoTrack) -> [String] {
        steps.filter { $0.track == track }.map(\.id)
    }

    private func photo() -> KeptPhoto {
        KeptPhoto(story: Data("story".utf8), square: Data("square".utf8), mode: .selfie)
    }

    private func keep(_ ids: [String], in notebook: MockGamePhotoNotebook, standing: PhotoCatchUpStanding) async {
        let steps = GamePhotoCatchUp.stepsReached(standing)
        for id in ids {
            guard let step = steps.first(where: { $0.id == id }) else { continue }
            _ = await notebook.keep(step.moment, photo: photo())
        }
    }

    private func waitUntil(_ condition: @escaping @MainActor () -> Bool) async throws {
        for _ in 0..<200 where !condition() {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertTrue(condition(), "condition jamais atteinte")
    }

    // MARK: - Les étapes franchies

    func test_stepsReached_aNewAccount_reachesOnlyTheStart() {
        XCTAssertEqual(GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding()).map(\.id), ["start"])
    }

    func test_stepsReached_meeshes_areTheFirstThenEveryTenth() {
        let steps = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(minted: 53))
        XCTAssertEqual(ids(steps, track: .meesh), ["meesh:1", "meesh:10", "meesh:20", "meesh:30", "meesh:40", "meesh:50"])
    }

    func test_stepsReached_theHundredthMeesh_carriesTheGoldEdition() {
        let hundred = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(minted: 100)).first { $0.id == "meesh:100" }
        XCTAssertEqual(hundred?.moment.emblem, .meesh(number: 100, edition: .gold))
    }

    func test_stepsReached_rank_climbsDivisionByDivisionWithoutTheStartingPoint() {
        let steps = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(rank: .echo, division: .iv))
        XCTAssertEqual(ids(steps, track: .rank), [
            "rank:murmure:4", "rank:murmure:3", "rank:murmure:2", "rank:murmure:1", "rank:echo:5", "rank:echo:4",
        ])
    }

    func test_stepsReached_mythe_comesAfterLegendeIWithoutDivision() {
        let ranks = ids(GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(rank: .mythe, division: nil)), track: .rank)
        XCTAssertEqual(ranks.dropLast().last, "rank:legende:1")
        XCTAssertEqual(ranks.last, "rank:mythe:0")
    }

    func test_stepsReached_levelTiers_followTheRecordWithTheirFirstLevel() {
        let tiers = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(levelRecord: 34)).filter { $0.track == .tier }
        XCTAssertEqual(tiers.map(\.id), ["tier:lueur", "tier:lumiere", "tier:eclat"])
        XCTAssertEqual(tiers.last?.moment.emblem, .tier(.eclat, level: 30))
    }

    func test_stepsReached_summit_thenEachPrestige() {
        let steps = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(levelRecord: 100, prestige: 2))
        XCTAssertEqual(ids(steps, track: .summit), ["level-100:0", "prestige:1", "prestige:2"])
    }

    func test_stepsReached_treasuryUpToTheHeldTier_flameUpToTheRecord() {
        let steps = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(treasuryTier: .coffret, flameRecord: 45))
        XCTAssertEqual(ids(steps, track: .treasury), ["treasury:bourse", "treasury:escarcelle", "treasury:coffret"])
        XCTAssertEqual(ids(steps, track: .flame), ["flame:7", "flame:30"])
    }

    // MARK: - Ce que le jeu servi dit

    func test_standing_readsTheServedGame() {
        let game = GameFixture.game(minted: 12, held: 9, flameDays: 23)
        let standing = PhotoCatchUpStanding(game: game)
        XCTAssertEqual(standing.rank, game.glory.rank)
        XCTAssertEqual(standing.division, game.glory.shownDivision)
        XCTAssertEqual(standing.levelRecord, game.level.shown.record)
        XCTAssertEqual(standing.minted, 12, "`mint.number` est la PROCHAINE pièce")
        XCTAssertEqual(standing.treasuryTier, game.treasury.tier)
        XCTAssertEqual(standing.flameRecord, 23)
    }

    // MARK: - Le rattrapage dans l'ordre

    func test_catchUp_onlyTheFirstStepWithoutAPhotoOfEachTrack_isOpen() {
        let meesh = GamePhotoCatchUp.catchUp(
            PhotoCatchUpStanding(minted: 53), kept: ["start", "meesh:1", "meesh:10", "meesh:20", "meesh:30"]
        ).filter { $0.track == .meesh }
        XCTAssertEqual(meesh.map(\.id), ["meesh:40", "meesh:50"])
        XCTAssertEqual(meesh.map(\.isOpen), [true, false])
        XCTAssertEqual(meesh.map(\.blockedBy), [nil, "meesh:40"])
    }

    func test_catchUp_aKeptPhoto_opensTheNextStep() {
        let standing = PhotoCatchUpStanding(minted: 53)
        let before = GamePhotoCatchUp.catchUp(standing, kept: ["meesh:1", "meesh:10", "meesh:20", "meesh:30"])
        let after = GamePhotoCatchUp.catchUp(standing, kept: ["meesh:1", "meesh:10", "meesh:20", "meesh:30", "meesh:40"])
        XCTAssertEqual(before.first { $0.id == "meesh:50" }?.isOpen, false)
        XCTAssertEqual(after.first { $0.id == "meesh:50" }?.isOpen, true)
    }

    func test_catchUp_tracksDoNotWaitForEachOther() {
        let open = GamePhotoCatchUp.catchUp(PhotoCatchUpStanding(minted: 12, flameRecord: 8), kept: []).filter(\.isOpen)
        XCTAssertEqual(open.map(\.id), ["start", "meesh:1", "flame:7"])
    }

    func test_catchUp_aCompleteNotebook_proposesNothing() {
        XCTAssertEqual(GamePhotoCatchUp.catchUp(PhotoCatchUpStanding(minted: 1), kept: ["start", "meesh:1"]), [])
    }

    // MARK: - Une seule proposition à la fois

    func test_offer_aTransitionWithSeveralMoments_proposesOnlyTheMostMarking() {
        let standing = PhotoCatchUpStanding(rank: .murmure, division: .iv, levelRecord: 10, minted: 10)
        let offer = GamePhotoCatchUp.offer(
            for: ["meesh:10", "tier:lueur", "rank:murmure:4"], standing: standing, kept: ["start", "meesh:1"]
        )
        XCTAssertEqual(offer, "rank:murmure:4")
    }

    func test_offer_aFiftiethMeeshWithoutTheFortieth_proposesTheFortieth() {
        let kept: Set<String> = ["start", "meesh:1", "meesh:10", "meesh:20", "meesh:30"]
        XCTAssertEqual(GamePhotoCatchUp.offer(for: ["meesh:50"], standing: PhotoCatchUpStanding(minted: 50), kept: kept), "meesh:40")
    }

    func test_offer_anUntrackedMoment_passesAsIs() {
        XCTAssertEqual(
            GamePhotoCatchUp.offer(for: ["achievement:first_message"], standing: PhotoCatchUpStanding(), kept: ["start"]),
            "achievement:first_message"
        )
    }

    func test_offer_aTrackAlreadyPhotographed_proposesNothing() {
        XCTAssertNil(GamePhotoCatchUp.offer(for: ["meesh:1"], standing: PhotoCatchUpStanding(minted: 1), kept: ["start", "meesh:1"]))
    }

    func test_track_isReadFromTheIdentity() {
        XCTAssertEqual(GamePhotoCatchUp.track(of: "rank:voix:2"), .rank)
        XCTAssertEqual(GamePhotoCatchUp.track(of: "level-100:0"), .summit)
        XCTAssertEqual(GamePhotoCatchUp.track(of: "prestige:3"), .summit)
        XCTAssertNil(GamePhotoCatchUp.track(of: "league-up:2026-W40:or"))
    }

    /// Les identités du rattrapage sont celles des moments en direct : une photo gardée par l'un compte pour l'autre.
    func test_stepsReached_identitiesAreThoseOfTheLiveMoments() {
        let steps = GamePhotoCatchUp.stepsReached(PhotoCatchUpStanding(levelRecord: 100, prestige: 1, minted: 10, treasuryTier: .bourse, flameRecord: 7))
        XCTAssertTrue(steps.contains { $0.moment == GamePhotoMoments.meesh(number: 10, edition: .silver) })
        XCTAssertTrue(steps.contains { $0.moment == GamePhotoMoments.flame(days: 7) })
        XCTAssertTrue(steps.contains { $0.moment == GamePhotoMoments.treasury(.bourse) })
        XCTAssertTrue(steps.contains { $0.moment == GamePhotoMoments.levelHundred(prestige: 0) })
        XCTAssertTrue(steps.contains { $0.id == "prestige:1" })
    }

    // MARK: - La proposition en direct

    func test_coordinatorOffer_anOpenStepReplacingTheMoment_isBuiltFromTheCatchUp() {
        let standing = PhotoCatchUpStanding(minted: 50)
        let moments = [GamePhotoMoments.meesh(number: 50, edition: .silver)]
        let offer = GamePhotoCoordinator.offer(among: moments, standing: standing, kept: ["start", "meesh:1", "meesh:10", "meesh:20", "meesh:30"])
        XCTAssertEqual(offer, GamePhotoMoments.meesh(number: 40, edition: .silver))
    }

    func test_observe_aTransitionWithSeveralMoments_proposesASingleOne() async throws {
        let notebook = MockGamePhotoNotebook()
        let coordinator = GamePhotoCoordinator(notebook: notebook) { GamePhotoSession(moment: $0, notebook: notebook) }
        coordinator.observe(game: GameFixture.game(glory: 5_990, flameDays: 6), settled: true)
        coordinator.observe(game: GameFixture.game(glory: 6_090, flameDays: 7), settled: true)

        try await waitUntil { !coordinator.offers.isEmpty }
        await Task.yield()

        XCTAssertEqual(coordinator.offers.count, 1)
        XCTAssertEqual(coordinator.offers.first?.id, "rank:murmure:4", "un rang qui en saute d'autres propose le premier sans photo")
    }

    func test_observe_aRankWhoseTrackIsUpToDate_proposesTheRankItself() async throws {
        let notebook = MockGamePhotoNotebook()
        let after = GameFixture.game(glory: 6_090, flameDays: 6)
        let standing = PhotoCatchUpStanding(game: after)
        let earlier = GamePhotoCatchUp.stepsReached(standing).filter { $0.track == .rank && $0.id != "rank:voix:5" }.map(\.id)
        await keep(earlier, in: notebook, standing: standing)
        let coordinator = GamePhotoCoordinator(notebook: notebook) { GamePhotoSession(moment: $0, notebook: notebook) }
        coordinator.observe(game: GameFixture.game(glory: 5_990, flameDays: 6), settled: true)
        coordinator.observe(game: after, settled: true)

        try await waitUntil { !coordinator.offers.isEmpty }

        XCTAssertEqual(coordinator.offers.map(\.id), ["rank:voix:5"])
    }

    // MARK: - Le carnet

    func test_notebookLoad_publishesTheCatchUp_andAPendingTrackedStepOnlyThere() async {
        let notebook = MockGamePhotoNotebook()
        let standing = PhotoCatchUpStanding(minted: 12)
        await keep(["start", "meesh:1"], in: notebook, standing: standing)
        _ = await notebook.postpone(GamePhotoMoments.meesh(number: 10, edition: .silver))
        _ = await notebook.postpone(GamePhotoMoments.achievement(id: "first_message", title: "Premier message"))
        let sut = GameNotebookViewModel(notebook: notebook, currentUserId: "u1", standing: { standing })

        await sut.load()

        XCTAssertEqual(sut.catchUp.map(\.id), ["meesh:10"])
        XCTAssertEqual(sut.catchUp.first?.isOpen, true)
        XCTAssertEqual(sut.pending.map(\.momentId), ["achievement:first_message"], "un moment de piste en attente ne se montre qu'au rattrapage")
        XCTAssertEqual(Set(sut.kept.map(\.momentId)), ["start", "meesh:1"])
    }

    func test_notebookLoad_withoutAKnownGame_showsNoCatchUp_andKeepsThePending() async {
        let notebook = MockGamePhotoNotebook()
        _ = await notebook.postpone(GamePhotoMoments.meesh(number: 10, edition: .silver))
        let sut = GameNotebookViewModel(notebook: notebook, currentUserId: "u1", standing: { nil })

        await sut.load()

        XCTAssertTrue(sut.catchUp.isEmpty)
        XCTAssertEqual(sut.pending.map(\.momentId), ["meesh:10"])
    }

    func test_notebookLoad_aLockedStep_namesTheStepToTakeFirst() async {
        let notebook = MockGamePhotoNotebook()
        let sut = GameNotebookViewModel(notebook: notebook, currentUserId: "u1", standing: { PhotoCatchUpStanding(minted: 12) })

        await sut.load()

        let tenth = sut.catchUp.first { $0.id == "meesh:10" }
        XCTAssertEqual(tenth?.isOpen, false)
        XCTAssertEqual(tenth?.blockedBy, "meesh:1")
        XCTAssertEqual(sut.title(ofStep: "meesh:1"), GamePhotoMoments.meesh(number: 1, edition: .silver).title)
    }
}
