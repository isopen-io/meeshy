import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// **Le chrome et le toucher des pages de Progression** (#9564, amendement n° 2) — l'en-tête dynamique sur TOUTES
/// les pages, le groupe blason + Meeshes de la première page, et le rebond qui ouvre les précisions de chaque
/// élément. Des gardes de source (ce qu'aucun rendu ne peut dire à la place du code) et le rendu de l'en-tête.
@MainActor
final class ProgressionChromeGuardTests: XCTestCase {

    private var ecran: RenderedScreen?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ relative: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    private func sources(under relative: String) throws -> [(name: String, code: String)] {
        let root = iosRoot.appendingPathComponent(relative)
        let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" } ?? []
        return try files.map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    // MARK: - L'en-tête dynamique, partout

    func test_noProgressionPage_mountsAStaticHeader() throws {
        let game = try sources(under: "Meeshy/Features/Main/Game")
        XCTAssertGreaterThan(game.count, 50, "les sources du jeu sont introuvables : la garde ne lirait rien")
        for file in game {
            XCTAssertFalse(file.code.contains("GamePageHeader"), "\(file.name) : l'en-tête statique des pages du jeu a disparu (#6480)")
        }
        // UN seul site monte l'en-tête qui se réduit pour le jeu : le gabarit.
        let mounting = game.filter { $0.code.contains("CollapsibleHeader(") }.map(\.name)
        XCTAssertEqual(mounting, ["GamePageScaffold.swift"], "l'en-tête dynamique du jeu se monte en UN endroit")
    }

    func test_everyProgressionPage_goesThroughTheSharedScaffold() throws {
        let pages = [
            "Meeshy/Features/Main/Views/ProgressionView.swift",
            "Meeshy/Features/Main/Views/ProgressionHub.swift",
            "Meeshy/Features/Main/Game/ProgressionConceptPage.swift",
            "Meeshy/Features/Main/Game/GameRulesView.swift",
            "Meeshy/Features/Main/Game/GameNotebookView.swift",
            "Meeshy/Features/Main/Game/Wave2/GameWave2Parts.swift",
        ]
        for page in pages {
            XCTAssertTrue(try source(page).contains("GamePageScaffold("), "\(page) ne passe pas par le gabarit à en-tête dynamique")
        }
        // Les six pages de la vague 2 (ligue, saison, vitrine, Atlas, Prestige, réglages) passent par leur cadre commun.
        for page in ["GameLeagueViews", "GameSeasonViews", "GameShowcaseViews", "GameAtlasViews", "GamePrestigeViews", "GameSettingsViews"] {
            XCTAssertTrue(try source("Meeshy/Features/Main/Game/Wave2/\(page).swift").contains("GamePageShell("), "\(page) a quitté son cadre")
        }
        let scaffold = try source("Meeshy/Features/Main/Game/GamePageScaffold.swift")
        XCTAssertTrue(scaffold.contains("PanelBackAction("), "le retour opère dans les trois contextes : pile, panneau iPad, feuille")
        XCTAssertTrue(scaffold.contains("trackScrollContentOffset"), "sans le suivi iOS 18+, l'en-tête reste figé")
        XCTAssertTrue(scaffold.contains("onPreferenceChange(ScrollOffsetPreferenceKey.self)"), "sans la préférence iOS 16–17, l'en-tête reste figé")
        XCTAssertFalse(scaffold.contains("safeAreaInsets"), "mesurer la fenêtre clé depuis l'intérieur fige la vue (cycle AttributeGraph)")
    }

    // MARK: - Le rebond et la feuille partagée

    func test_theGameHasOneBounce_andOneDetailSheet() throws {
        let game = try sources(under: "Meeshy/Features/Main/Game")
        let styles = game.filter { $0.code.contains(": ButtonStyle {") }.map(\.name)
        XCTAssertEqual(styles, ["GameBounce.swift"], "UNE courbe de rebond pour tout le jeu, déclarée une fois")
        let sheets = game.filter { $0.code.contains("sheet(item: detail)") }.map(\.name)
        XCTAssertEqual(sheets, ["GameElementSheet.swift"], "UN composant de feuille pour tous les éléments")

        let sheet = try source("Meeshy/Features/Main/Game/GameElementSheet.swift")
        XCTAssertFalse(sheet.contains("fullScreenCover("), "une feuille, jamais un `fullScreenCover` : il laisse l'écran recouvert aveugle")
        XCTAssertTrue(sheet.contains(".presentationDragIndicator(.visible)"), "la poignée se voit")
        XCTAssertTrue(sheet.contains("GameMotion.release"), "l'emblème entre avec le ressort du rebond")
        XCTAssertTrue(sheet.contains("accessibilityReduceMotion"), "« réduire les animations » remplace le ressort par un fondu")
    }

    /// Les pièces des fiches et de la première page : tout ce qui se touche y rebondit — plus aucun bouton nu, plus
    /// aucun toucher sans ressort.
    func test_theSheetsAndTheFrontPage_touchOnlyThroughTheBounce() throws {
        for file in ["ProgressionConceptViews", "ProgressionConceptPage", "ProgressionFrontList", "ProgressionHeaderStanding"] {
            let code = try source("Meeshy/Features/Main/Game/\(file).swift")
            XCTAssertFalse(code.contains(".buttonStyle(.plain)"), "\(file) : un bouton sans rebond")
            XCTAssertFalse(code.contains(".onTapGesture"), "\(file) : un toucher qui n'est pas un bouton")
            XCTAssertFalse(code.contains("Button {"), "\(file) : un bouton hors du bouton à rebond")
        }
        let views = try source("Meeshy/Features/Main/Game/ProgressionConceptViews.swift")
        XCTAssertTrue(views.contains(".gameElement(GameElementDetails.fact(fact, of: concept))"), "chaque ligne de donnée ouvre SES précisions")
        let page = try source("Meeshy/Features/Main/Game/ProgressionConceptPage.swift")
        XCTAssertTrue(page.contains(".gameElement(GameElementDetails.hero(of: concept"), "le héros d'une fiche ouvre l'élément principal du concept")
    }

    func test_everyElementFamilyRendered_opensItsOwnDetails() throws {
        let wired: [(file: String, call: String)] = [
            ("Meeshy/Features/Main/Game/GameBadgeShelf.swift", "GameElementDetails.badge(item"),
            ("Meeshy/Features/Main/Views/ProgressionHub.swift", "GameElementDetails.badge(for: axis"),
            ("Meeshy/Features/Main/Views/ProgressionHub.swift", "GameElementDetails.elanFamily("),
            ("Meeshy/Features/Main/Views/ProgressionComponents.swift", "GameElementDetails.challenge(entry)"),
            ("Meeshy/Features/Main/Game/GameMissionsView.swift", "GameElementDetails.mission(mission)"),
            ("Meeshy/Features/Main/Game/GameMissionsView.swift", "GameElementDetails.chest(chest"),
            ("Meeshy/Features/Main/Game/GameHeroView.swift", "GameElementDetails.levelRing(game.level)"),
            ("Meeshy/Features/Main/Game/GameHeroView.swift", "GameElementDetails.rank(glory)"),
            ("Meeshy/Features/Main/Game/ProgressionConceptPage.swift", "GameElementDetails.flameForm("),
            ("Meeshy/Features/Main/Game/ProgressionConceptPage.swift", "GameElementDetails.freeze("),
            ("Meeshy/Features/Main/Game/ProgressionConceptPage.swift", "GameElementDetails.treasuryTier("),
            ("Meeshy/Features/Main/Game/Wave2/GameShowcaseViews.swift", "GameElementDetails.trophy("),
            ("Meeshy/Features/Main/Game/Wave2/GameAtlasViews.swift", "GameElementDetails.stamp(stamp)"),
            ("Meeshy/Features/Main/Game/Wave2/GameSeasonViews.swift", "GameElementDetails.seasonStep(step"),
            ("Meeshy/Features/Main/Game/Wave2/GameSeasonViews.swift", "GameElementDetails.seal(season)"),
            ("Meeshy/Features/Main/Game/Wave2/GamePrestigeViews.swift", "GameElementDetails.prestigeStar("),
            ("Meeshy/Features/Main/Game/Wave2/GameLeagueViews.swift", "GameElementDetails.leagueGem(league)"),
            ("Meeshy/Features/Main/Game/Wave2/GameLeagueViews.swift", "GameElementDetails.player(entry)"),
            ("Meeshy/Features/Main/Game/ProgressionHeaderStanding.swift", "GameElementDetails.rank(glory)"),
        ]
        for site in wired {
            XCTAssertTrue(try source(site.file).contains(site.call), "\(site.file) : « \(site.call) » — l'élément ne s'ouvre pas")
        }
        // Un succès garde SA précision (la célébration en grand) : jamais deux modales pour un même élément.
        let hub = try source("Meeshy/Features/Main/Views/ProgressionHub.swift")
        XCTAssertFalse(hub.contains("GameElementDetails.achievement("), "un succès n'ouvre pas une seconde modale")
        XCTAssertTrue(hub.contains(".buttonStyle(GameBounceButtonStyle())"), "la ligne d'un succès rebondit")
    }

    /// Points et Élans ont leur DESSIN : plus de Signature teintée. Le Tableau de bord est parti avec son emblème.
    func test_pointsAndElans_wearTheirDrawnEmblem() throws {
        let views = try source("Meeshy/Features/Main/Game/ProgressionConceptViews.swift")
        XCTAssertTrue(views.contains("ConceptMarkView(kind: .points)"))
        XCTAssertTrue(views.contains("ConceptMarkView(kind: .elans)"))
        XCTAssertFalse(views.contains("signature(.struck") , "plus de Signature teintée pour les Points")
        XCTAssertFalse(try source("Meeshy/Features/Main/Game/ProgressionFrontList.swift").contains("dashboard"),
                       "le tableau de bord a quitté la première page (amendement n° 4)")
    }

    // MARK: - L'en-tête de la première page

    private func loadedViewModel(_ payload: APIEngagementProgress) async -> ProgressionViewModel {
        let service = MockEngagementProgressService()
        service.fetchProgressResult = .success(payload)
        let vm = ProgressionViewModel(
            service: service,
            gameService: MockGameService(),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: "chrome-\(UUID().uuidString)",
            notebook: MockGamePhotoNotebook()
        )
        await vm.load(forceNetwork: true)
        return vm
    }

    func test_theFrontPageHeader_carriesTheRankCrestAndTheMeeshCounter_whenServed() async {
        let vm = await loadedViewModel(GameFixture.snapshot(GameFixture.game()))
        let rendu = RenderedScreen(ProgressionView(viewModel: vm), size: CGSize(width: 402, height: 4200))
        ecran = rendu

        let identifiants = rendu.identifiers
        XCTAssertTrue(identifiants.contains("progression.rank.entry"), "le blason de rang n'est pas dans l'en-tête. Vus : \(identifiants)")
        XCTAssertTrue(identifiants.contains("progression.meesh.entry"), "le compteur de Meeshes n'est pas dans l'en-tête. Vus : \(identifiants)")
    }

    func test_theFrontPageHeader_carriesNothing_whenNothingIsServed() async {
        let sans = APIEngagementProgress(
            counters: [], milestones: [], streak: .init(currentStreakDays: 0, longestStreakDays: 0), level: .init(engagementScore: 10)
        )
        let vm = await loadedViewModel(sans)
        let rendu = RenderedScreen(ProgressionView(viewModel: vm), size: CGSize(width: 402, height: 4200))
        ecran = rendu

        let identifiants = rendu.identifiers
        XCTAssertFalse(identifiants.contains("progression.rank.entry"), "un blason sans bloc game : \(identifiants)")
        XCTAssertFalse(identifiants.contains("progression.meesh.entry"), "un compteur sans solde servi : \(identifiants)")
        XCTAssertTrue(identifiants.contains("progression.concept.level"), "la page est montée : le témoin d'absence ne prouve rien sans elle")
    }

    /// La frappe a UN site : la fiche des Meeshes. Toucher le solde de l'en-tête ouvre cette fiche (amendement n° 4).
    func test_theHeaderCounter_opensTheMeeshSheet_andMintsNothing() throws {
        let page = try source("Meeshy/Features/Main/Views/ProgressionView.swift")
        XCTAssertTrue(page.contains("onOpenMeesh: { router.push(.progressionConcept(.meesh)) }"), "le solde ouvre la fiche des Meeshes")
        XCTAssertFalse(page.contains("viewModel.mint()"), "la première page ne frappe plus")
        let entry = try source("Meeshy/Features/Main/Views/ProgressionMeeshEntry.swift")
        let compteur = entry.components(separatedBy: "struct ProgressionMeeshEntry").dropFirst().first?
            .components(separatedBy: "struct MeeshCoinGlyph").first ?? ""
        XCTAssertFalse(compteur.contains(".popover("), "le compteur n'ouvre plus de feuille de frappe")
        XCTAssertFalse(compteur.contains("onMint"), "le compteur ne frappe plus")
        XCTAssertTrue(compteur.contains("onOpen()"))
    }

    /// Le groupe ne vit QUE sur la première page : la fiche des Meeshes a son héros.
    func test_theHeaderGroup_livesOnlyOnTheFrontPage() async throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/ProgressionView.swift").contains("ProgressionHeaderStanding("))
        XCTAssertFalse(try source("Meeshy/Features/Main/Game/ProgressionConceptPage.swift").contains("ProgressionMeeshEntry("),
                       "le compteur a quitté l'en-tête de la fiche des Meeshes")

        let vm = await loadedViewModel(GameFixture.snapshot(GameFixture.game()))
        let rendu = RenderedScreen(ProgressionConceptPage(concept: .meesh, viewModel: vm), size: CGSize(width: 402, height: 4200))
        ecran = rendu
        XCTAssertFalse(rendu.identifiers.contains("progression.meesh.entry"))
        XCTAssertFalse(rendu.identifiers.contains("progression.rank.entry"))
    }

    /// À 320 pt, le groupe et le titre tiennent dans l'écran : rien ne sort de la fenêtre.
    func test_theFrontPageHeader_staysInsideA320ptScreen() async {
        let vm = await loadedViewModel(GameFixture.snapshot(GameFixture.game(), meesh: GameFixture.meesh(balance: 9_999)))
        let rendu = RenderedScreen(ProgressionView(viewModel: vm), size: CGSize(width: 320, height: 4200))
        ecran = rendu

        for identifier in ["progression.rank.entry", "progression.meesh.entry"] {
            let frame = rendu.frame(of: identifier)
            XCTAssertNotNil(frame, "« \(identifier) » n'est pas rendu à 320 pt")
            XCTAssertGreaterThanOrEqual(frame?.minX ?? -1, -0.5, "« \(identifier) » sort à gauche")
            XCTAssertLessThanOrEqual(frame?.maxX ?? .infinity, 320.5, "« \(identifier) » sort à droite")
        }
    }

    // MARK: - « Jeu masqué » remplace la liste

    func test_whenTheGameIsHidden_theHiddenCardReplacesTheList_andTheHeaderGroup() throws {
        let front = try source("Meeshy/Features/Main/Game/ProgressionFrontList.swift")
        let hidden = try XCTUnwrap(front.range(of: "if prefs.prefs.hidden, viewModel.game != nil {")?.upperBound)
        let branch = front[hidden...].prefix(200)
        XCTAssertTrue(branch.contains("GameHiddenCard("), "sous « Jeu masqué », la carte masquée prend la place de la liste")
        XCTAssertTrue(branch.contains("} else {\n            list"), "la liste n'est montée que hors de « Jeu masqué »")
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/ProgressionView.swift").contains("if !hidesTheGame {"),
                      "sous « Jeu masqué », l'en-tête ne montre ni blason ni compteur")
    }
}
