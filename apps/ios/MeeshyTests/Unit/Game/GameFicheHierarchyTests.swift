import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// **Chaque écran du jeu met en tête ce qu'on POSSÈDE, et ne dit chaque chiffre qu'une fois** (#11180, épopée § 3.3 et
/// § 5, leçon 2026-10-20). Les captures du porteur, servies par la production : 88 Meeshes gardées, 91 frappées, la
/// Meesh n° 92 à 10 423, ta lumière à 108 233 et 377 752 reçues depuis toujours. La fiche des Meeshes mettait le PRIX
/// en grand et le redisait trois fois ; celle des Étincelles montrait 377 752, le cycle, au lieu de la poche.
///
/// Trois instruments :
///  - la LOI de chaque tête (ce qu'elle dit, et les faits qu'elle porte) ;
///  - l'écran RENDU : chaque chiffre déclare son identité (`GameFactsTag`), une préférence les remonte de ce qui est
///    MONTÉ, et deux rendus de même identité sont un défaut ;
///  - la SOURCE : aucun calcul dans le cadre de la frappe.
@MainActor
final class GameFicheHierarchyTests: XCTestCase {

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    private func n(_ value: Int) -> String { GameCopy.formatCount(value) }

    // MARK: - Les comptes

    /// Le compte du porteur tel que la production le sert le 2026-10-20 : le niveau y est encore lu sur le cycle, donc
    /// `level.score` vaut 377 752 quand la poche en vaut 108 233 (#10892).
    private static func porteur() -> (game: GameBlock, wallet: APIEngagementProgress.Meesh) {
        let base = GameFixture.game(score: 377_752, glory: 44_600, minted: 91, held: 88)
        let sparked = GameFixture.sparked(base, pocket: 108_233, cycle: 377_752, lifetime: 377_752)
        let mint = GameMintPreview(
            number: 92, price: 10_423, edition: .silver, canMint: true, missingPoints: 0, levelBefore: 32, levelAfter: 30,
            levelsLost: 2, gloryGained: 1_000, basePrice: 12_948, costFactor: 0.805, costLevel: 61
        )
        let game = sparked.replacing(level: sparked.level.replacing(score: 377_752), mint: mint)
        return (game, GameFixture.meesh(balance: 88, minted: 91, debitable: 108_233, cost: 10_423))
    }

    /// Une Ombre voile 300 étincelles : la frappe est fermée tant qu'elle est là.
    private static func shadowed() -> (game: GameBlock, wallet: APIEngagementProgress.Meesh) {
        let base = GameFixture.game(score: 2_000, minted: 3, held: 3)
        let sparked = GameFixture.sparked(base, pocket: 2_000, cycle: 5_000, lifetime: 9_000, debt: 300)
        let mint = GameMintPreview(
            number: 4, price: 1_200, edition: .silver, canMint: false, missingPoints: 0, levelBefore: 12, levelAfter: 12,
            levelsLost: 0, gloryGained: 0, sparksDebt: 300, blockedBy: .debt
        )
        return (sparked.replacing(mint: mint), GameFixture.meesh(balance: 3, minted: 3, debitable: 2_000, cost: 1_200))
    }

    /// Une frappe impossible : il manque des étincelles.
    private static func poor() -> (game: GameBlock, wallet: APIEngagementProgress.Meesh) {
        let game = GameFixture.game(score: 400, debitable: 400, held: 0)
        return (game, GameFixture.meesh(balance: 0, minted: 0, debitable: 400))
    }

    private static var accounts: [(String, GameBlock, APIEngagementProgress.Meesh)] {
        let full = GameWave2Fixture.game()
        return [
            ("porteur", porteur().game, porteur().wallet), ("Ombre", shadowed().game, shadowed().wallet),
            ("frappe impossible", poor().game, poor().wallet), ("jeu complet", full, GameFixture.meesh()),
            ("au sommet", GameWave2Fixture.atLevel100(prestige: 4), GameFixture.meesh(balance: 9_999, minted: 99_999, debitable: 9_999_999)),
        ]
    }

    private func progress(_ game: GameBlock, _ wallet: APIEngagementProgress.Meesh) -> EngagementProgress {
        EngagementProgressResolver.resolve(GameFixture.snapshot(game, meesh: wallet))
    }

    // MARK: - La tête des Étincelles lit la POCHE par son nom

    func test_theSparksHead_readsThePocketByItsName_neverTheLevelBase() {
        let (game, wallet) = Self.porteur()
        XCTAssertEqual(game.level.score, 377_752, "le témoin veut un niveau lu sur le cycle, comme la production")

        XCTAssertEqual(ProgressionConceptModel.value(.points, progress: progress(game, wallet), game: game), GameCopy.points(108_233),
                       "la tête des Étincelles dit TA LUMIÈRE (la poche), jamais `level.score`")
        let head = GameSparksHeadModel(game.level)
        XCTAssertEqual(head.label, GameFicheCopy.lightLabel)
        XCTAssertEqual(head.pocket, ProgressionFactText(GameCopy.points(108_233), .sparksPocket))
        XCTAssertEqual(head.lifetime?.text, GameSparksCopy.cumulLine(cycle: 377_752, lifetime: 377_752))
        XCTAssertTrue(head.lifetime?.text.contains(n(377_752)) ?? false)
        XCTAssertNil(head.shadow)
    }

    func test_theSparksSheet_neverSaysThePriceOfTheNextCoin_andLeadsToTheHeritage() {
        let (game, wallet) = Self.porteur()
        let fiche = ProgressionConceptFiche.make(.points, progress: progress(game, wallet), game: game)

        XCTAssertEqual(fiche.head, .sparks(GameSparksHeadModel(game.level)))
        XCTAssertFalse(fiche.hasWhere, "« Où j'en suis » redisait ta lumière et le prix : il disparaît")
        let card = ProgressionConceptModel.card(.points, progress: progress(game, wallet), game: game)
        XCTAssertFalse(card.facts.contains(.mintPrice) || card.facts.contains(.mintMissing))
        let page = try? String(contentsOf: Self.source("Game/ProgressionConceptPage.swift"), encoding: .utf8)
        XCTAssertTrue(page?.contains("GameFicheCopy.toHeritage") ?? false, "la fiche des Étincelles mène à l'Héritage")
    }

    func test_aShadow_passesBeforeEverythingOnTheSparksHead_andTakesTheCardLine() {
        let (game, wallet) = Self.shadowed()
        let head = GameSparksHeadModel(game.level)

        XCTAssertEqual(head.shadow, ProgressionFactText(GameMintCostCopy.debtText(300), .sparksDebt))
        XCTAssertEqual(head.facts.first, .sparksDebt, "l'Ombre se lit avant ta lumière")
        let card = ProgressionConceptModel.card(.points, progress: progress(game, wallet), game: game)
        XCTAssertEqual(card.line, ProgressionFactText(GameFicheCopy.shadow(n(300)), .sparksDebt))
    }

    // MARK: - L'Héritage met en tête ce qu'on garde

    func test_theHeritageHead_saysTheContainer_theMeeshesKept_theNextContainer_andTheMintedSinceAlways() {
        let (game, wallet) = Self.porteur()
        let head = GameHeritageHeadModel(balance: wallet.balance, treasury: game.treasury, minted: wallet.mintedLifetime)

        XCTAssertEqual(head.label, ProgressionFactText(GameFicheCopy.held(.coffret), .treasuryTier))
        XCTAssertEqual(head.held, ProgressionFactText(GameCopy.meeshes(88), .meeshHeld))
        XCTAssertEqual(head.opens, ProgressionFactText(GameFicheCopy.opens(.coffre, at: 100), .treasuryNext))
        XCTAssertEqual(head.minted, ProgressionFactText(GameFicheCopy.minted(91), .minted))
        XCTAssertFalse([head.label, head.held, head.opens, head.minted].compactMap { $0?.text }.contains { $0.contains(n(10_423)) },
                       "la tête de l'Héritage ne dit aucun prix")
        XCTAssertNil(GameHeritageHeadModel(balance: 0, treasury: TreasuryStanding(held: 0, tier: nil, next: nil), minted: 0).minted,
                     "rien de frappé : la ligne se tait")
    }

    func test_theMintFrame_saysThePriceOnce_inASentenceWithYourLight_andTheGloryInsideTheButton() {
        let (game, _) = Self.porteur()
        let frame = GameMintFrameModel(mint: game.mint, pocket: game.level.sparkFacts.pocket)

        XCTAssertEqual(frame.title.facts, [.mintNext])
        XCTAssertEqual(frame.sentence, ProgressionFactText(GameFicheCopy.mintSentence(price: GameCopy.points(10_423), held: n(108_233)),
                                                           .mintPrice, .sparksPocket))
        XCTAssertEqual(frame.texts.filter { $0.contains(n(10_423)) }.count, 1, "le prix ne paraît qu'une fois")
        XCTAssertEqual(frame.glory?.facts, [.mintGlory])
        XCTAssertNil(frame.missing)
        XCTAssertEqual(frame.mee, ProgressionFactText(GameFicheCopy.meeNextGold(n(100)), .mintNextSpecial), "Mee annonce la n° 100, d'or")
    }

    func test_meeSays_theComingEdition_orTheNextSpecialOne_orTheWishToComeBack() {
        func mee(_ number: Int, canMint: Bool = true) -> String {
            GameMintFrameModel(mint: GameMintPreview(
                number: number, price: 10, edition: GameMint.edition(forNumber: number), canMint: canMint, missingPoints: canMint ? 0 : 5,
                levelBefore: 1, levelAfter: 1, levelsLost: 0, gloryGained: 10
            ), pocket: 10).mee.text
        }
        XCTAssertEqual(mee(100), GameFicheCopy.meeGold)
        XCTAssertEqual(mee(1_000), GameFicheCopy.meePrism)
        XCTAssertEqual(mee(950), GameFicheCopy.meeNextPrism(n(1_000)))
        XCTAssertEqual(mee(101), GameFicheCopy.meeNextGold(n(200)))
        XCTAssertEqual(mee(42, canMint: false), GameFicheCopy.meeWait)
    }

    func test_aBlockedMint_saysWhatClosesIt_andPromisesNoGlory() {
        let (game, _) = Self.shadowed()
        let frame = GameMintFrameModel(mint: game.mint, pocket: game.level.sparkFacts.pocket)

        XCTAssertEqual(frame.blocker?.facts, [.sparksDebt])
        XCTAssertNil(frame.glory, "pas de bouton grisé : pas de gloire promise")
    }

    // MARK: - Aucun calcul sur une fiche

    func test_noSheet_doesArithmetic() throws {
        let frame = try String(contentsOf: Self.source("Game/GameMintPreviewView.swift"), encoding: .utf8)
        for calculation in ["GameMintCostCopy.costLine", "GameMintCostCopy.levelPassage", "GameSpendRows", "afterStanding", "→"] {
            XCTAssertFalse(frame.contains(calculation), "le cadre de la frappe calcule encore : « \(calculation) »")
        }
        for (label, game, _) in Self.accounts {
            let texts = GameMintFrameModel(mint: game.mint, pocket: game.level.sparkFacts.pocket).texts
            for forbidden in [GameMintCostCopy.costLine(game.mint), ConceptText.factAfter, "→"].compactMap({ $0 }) {
                XCTAssertFalse(texts.contains { $0.contains(forbidden) }, "\(label) : « \(forbidden) » sur la fiche")
            }
        }
    }

    // MARK: - L'écran RENDU dit chaque fait une fois

    /// L'instrument doit pouvoir ÉCHOUER : deux vues qui déclarent le même fait remontent deux fois.
    func test_theInstrument_seesAFactRenderedTwice() {
        let twice = VStack {
            Text("a").modifier(GameFactsTag(.sparksPocket))
            Text("b").modifier(GameFactsTag(.sparksPocket))
            Text("c").modifier(GameFactsTag(nil))
        }
        XCTAssertEqual(rendered(twice), [.sparksPocket, .sparksPocket])
    }

    func test_everySheet_rendersEachFactOnce() async {
        for (label, game, wallet) in Self.accounts {
            let vm = await loadedViewModel(game, wallet)
            guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }
            for concept in ProgressionConcepts.served(for: progress, game: game) {
                let facts = rendered(ProgressionConceptContent(
                    concept: concept, viewModel: vm, photos: vm.photos, progress: progress, isDark: false,
                    onOpenLink: { _ in }, onReveal: { _ in }
                ))
                XCTAssertEqual(Self.twice(facts), [], "la fiche « \(concept.rawValue) » (\(label)) dit un fait deux fois")
            }
        }
    }

    func test_theHeritageSheet_rendersItsHeadThenItsMintFrame() async {
        let (game, wallet) = Self.porteur()
        let vm = await loadedViewModel(game, wallet)
        guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }

        let facts = rendered(ProgressionConceptContent(
            concept: .meesh, viewModel: vm, photos: vm.photos, progress: progress, isDark: false, onOpenLink: { _ in }, onReveal: { _ in }
        ))

        let expected: [ProgressionFactID] = [.treasuryTier, .meeshHeld, .treasuryNext, .minted, .mintNext, .mintPrice, .sparksPocket, .mintGlory, .mintNextSpecial]
        XCTAssertEqual(facts, expected, "la tête (ce qu'on garde), puis le cadre de la frappe, chaque fait une fois")
    }

    func test_theSparksSheet_rendersYourLightFirst() async {
        let (game, wallet) = Self.porteur()
        let vm = await loadedViewModel(game, wallet)
        guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }

        let facts = rendered(ProgressionConceptContent(
            concept: .points, viewModel: vm, photos: vm.photos, progress: progress, isDark: false, onOpenLink: { _ in }, onReveal: { _ in }
        ))

        XCTAssertEqual(facts, [.sparksPocket, .sparksLifetime], "ta lumière, puis le « depuis toujours » ; ni prix ni manque")
    }

    func test_theFrontPage_rendersEachFactOnce() async {
        for (label, game, wallet) in Self.accounts {
            let vm = await loadedViewModel(game, wallet)
            guard let progress = vm.progress else { return XCTFail("pas de progression chargée") }
            let facts = rendered(ProgressionFrontList(
                viewModel: vm, guide: vm.guide, photos: vm.photos, progress: progress,
                onOpenConcept: { _ in }, onOpenConversations: {}, onOpenRules: { _ in },
                onOpenNotebook: {}, onOpenPage: { _ in }
            ))
            XCTAssertFalse(facts.isEmpty, "\(label) : la première page ne déclare aucun fait — l'instrument ne voit rien")
            XCTAssertEqual(Self.twice(facts), [], "\(label) : la première page dit un fait deux fois")
            XCTAssertTrue(facts.contains(.sparksPocket) && facts.contains(.meeshHeld), "\(label) : \(facts)")
        }
    }

    // MARK: - Les outils

    private static func twice(_ facts: [ProgressionFactID]) -> [String] {
        Dictionary(grouping: facts, by: { $0 }).filter { $0.value.count > 1 }.keys.map(\.rawValue).sorted()
    }

    /// Monte la vue dans une fenêtre réelle et lit les faits que l'arbre RENDU déclare.
    private func rendered(_ view: some View) -> [ProgressionFactID] {
        let probe = FactsProbe()
        ecran?.dismount()
        ecran = RenderedScreen(
            view.onPreferenceChange(GameFactsKey.self) { facts in MainActor.assumeIsolated { probe.facts = facts } },
            size: CGSize(width: 402, height: 6400)
        )
        return probe.facts
    }

    private func loadedViewModel(_ game: GameBlock, _ wallet: APIEngagementProgress.Meesh) async -> ProgressionViewModel {
        let service = MockEngagementProgressService()
        service.fetchProgressResult = .success(GameFixture.snapshot(game, meesh: wallet))
        let vm = ProgressionViewModel(
            service: service,
            gameService: MockGameService(),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: "fiche-hierarchy-\(UUID().uuidString)",
            notebook: MockGamePhotoNotebook()
        )
        await vm.load(forceNetwork: true)
        return vm
    }

    private static func source(_ path: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/\(path)")
    }
}

/// Ce que l'arbre rendu a déclaré.
@MainActor
private final class FactsProbe {
    var facts: [ProgressionFactID] = []
}
