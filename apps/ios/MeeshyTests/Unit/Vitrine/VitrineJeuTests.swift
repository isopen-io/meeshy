import XCTest
import MeeshySDK
@testable import Meeshy

/// Les célébrations du jeu se rejouent en vitrine (#9805) : chaque scène ouvre la FICHE où sa célébration vit, et la
/// joue par le chemin réel du modèle — une lecture servie, ou le geste lui-même. Seul le serveur est fictif.
@MainActor
final class VitrineJeuTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func base() throws -> APIEngagementProgress {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon)).progression
    }

    private func makeSUT(_ celebration: VitrineCelebration) async throws -> (modele: ProgressionViewModel, serveur: VitrineJeuServeur, scenario: VitrineJeuScenario) {
        let scenario = VitrineJeuScenarios.pour(celebration, base: try base())
        let serveur = VitrineJeuServeur(scenario)
        let modele = ProgressionViewModel(
            service: serveur, gameService: serveur, networkMonitor: FakeNetworkMonitor(isOnline: true),
            currentUserId: "vitrine-\(UUID().uuidString)", notebook: MockGamePhotoNotebook()
        )
        await modele.load(forceNetwork: true)
        return (modele, serveur, scenario)
    }

    // MARK: - Les scènes

    func test_scene_theFiveGameArguments_parseToTheirCelebration() {
        let attendues: [(String, VitrineScene, VitrineCelebration)] = [
            ("jeu-rang", .jeuRang, .rang), ("jeu-coffre", .jeuCoffre, .coffre), ("jeu-frappe", .jeuFrappe, .frappe),
            ("jeu-niveau", .jeuNiveau, .niveau), ("jeu-badge", .jeuBadge, .badge),
        ]
        for (argument, scene, celebration) in attendues {
            XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", argument]), scene, argument)
            XCTAssertEqual(scene.celebration, celebration, argument)
            XCTAssertTrue(scene.ouvreUneSession, argument)
        }
        XCTAssertEqual(Set(VitrineCelebration.allCases), Set(attendues.map(\.2)))
    }

    func test_celebration_otherScenesPlayNone() {
        for scene in [VitrineScene.amour, .groupe, .global, .lien, .progression, .imagine] {
            XCTAssertNil(scene.celebration, "\(scene)")
        }
    }

    /// L'écran que chaque scène ouvre : la fiche du concept qui porte la célébration.
    func test_celebration_declaresTheFicheItOpens() {
        XCTAssertEqual(VitrineCelebration.rang.concept, .level)
        XCTAssertEqual(VitrineCelebration.niveau.concept, .level)
        XCTAssertEqual(VitrineCelebration.coffre.concept, .missions)
        XCTAssertEqual(VitrineCelebration.frappe.concept, .meesh)
        XCTAssertEqual(VitrineCelebration.badge.concept, .badges)
    }

    /// Le coffre vit SOUS la liste des missions : ouverte en haut, la fiche le jouerait hors de l'écran, et le film
    /// ne verrait rien bouger (prise du 2026-10-09, 26 images figées). La fiche s'ouvre donc sur « À toi de jouer ».
    func test_celebration_theChestOpensItsFicheOnTheGestures_theHeroPiecesAtTheTop() {
        XCTAssertEqual(VitrineCelebration.coffre.section, .act)
        XCTAssertNil(VitrineCelebration.rang.section)
        XCTAssertNil(VitrineCelebration.niveau.section)
        XCTAssertNil(VitrineCelebration.frappe.section)
    }

    /// L'étagère des badges vit dans « À toi de jouer », sous trois sections : ouverte en haut, la médaille se rallumait
    /// hors de l'écran (prise du 2026-10-09, aucune image ne bougeait). La fiche s'ouvre donc sur elle, comme le coffre.
    func test_celebration_theBadgeOpensItsFicheOnTheShelf() {
        XCTAssertEqual(VitrineCelebration.badge.section, .act)
    }

    /// La durée annoncée au script est celle de la chorégraphie, jamais une valeur recopiée.
    func test_celebration_lastsItsChoreography() {
        XCTAssertEqual(VitrineCelebration.rang.duree, GameTimeline.rankDuration)
        XCTAssertEqual(VitrineCelebration.coffre.duree, GameTimeline.chestDuration)
        XCTAssertEqual(VitrineCelebration.frappe.duree, GameTimeline.strikeDuration)
        XCTAssertEqual(VitrineCelebration.niveau.duree, GameTimeline.levelGainDuration)
        XCTAssertEqual(VitrineCelebration.badge.duree, GameTimeline.badgeDuration)
    }

    func test_rendusAttendus_aGameSceneWaitsForItsFiche_andTheFeedOnIPad() {
        XCTAssertEqual(VitrineScene.jeuCoffre.rendusAttendus(conversationId: nil, appareil: .iphone), [.fiche(.missions)])
        XCTAssertEqual(VitrineScene.jeuRang.rendusAttendus(conversationId: nil, appareil: .ipad), [.fiche(.level), .fil])
    }

    /// La fiche ouverte porte bien la pièce de jeu de la célébration — sinon la scène filmerait un écran sans elle.
    func test_scenario_theOpenedFicheHostsTheCelebratedPiece() throws {
        for celebration in VitrineCelebration.allCases {
            let avant = VitrineJeuScenarios.pour(celebration, base: try base()).avant
            let progress = EngagementProgressResolver.resolve(avant)
            XCTAssertNotNil(avant.game, "\(celebration)")
            XCTAssertTrue(ProgressionConceptGestures.exist(for: celebration.concept, progress: progress, game: avant.game), "\(celebration)")
        }
    }

    /// Le montage « Le jeu » enchaîne les cinq scènes : chacune part de l'état où la précédente arrive — niveau, rang,
    /// Gloire et points. Sans ce fil, le niveau finissait sur « Niveau 35 · Murmure I » et le rang repartait de
    /// « Niveau 34 · Écho V » : monté à la suite, le joueur redescendait (prise du 2026-10-09).
    func test_scenarios_followOneThread_inTheMontageOrder() throws {
        let base = try base()
        XCTAssertEqual(VitrineJeuScenarios.ordreDuMontage, [.frappe, .coffre, .niveau, .rang, .badge])
        XCTAssertEqual(Set(VitrineJeuScenarios.ordreDuMontage), Set(VitrineCelebration.allCases))
        let scenarios = VitrineJeuScenarios.ordreDuMontage.map { ($0, VitrineJeuScenarios.pour($0, base: base)) }
        for (precedente, suivante) in zip(scenarios, scenarios.dropFirst()) {
            let arrivee = try XCTUnwrap(precedente.1.apres.game)
            let depart = try XCTUnwrap(suivante.1.avant.game)
            let etiquette = "\(precedente.0) → \(suivante.0)"
            XCTAssertEqual(depart.level.shown.level, arrivee.level.shown.level, etiquette)
            XCTAssertEqual(depart.level.score, arrivee.level.score, etiquette)
            XCTAssertEqual(depart.glory.glory, arrivee.glory.glory, etiquette)
            XCTAssertEqual(depart.glory.rank, arrivee.glory.rank, etiquette)
            XCTAssertEqual(depart.glory.division5, arrivee.glory.division5, etiquette)
            XCTAssertEqual(depart.treasury.held, arrivee.treasury.held, etiquette)
        }
    }

    /// Chaque scène fait ce qu'elle annonce, et rien d'autre : le niveau monte d'un cran sans bouger le rang, le rang
    /// monte d'une division sans bouger le niveau.
    func test_scenarios_niveauThenRang_climbOneStepEach() throws {
        let base = try base()
        let niveau = VitrineJeuScenarios.pour(.niveau, base: base)
        let rang = VitrineJeuScenarios.pour(.rang, base: base)
        let (n0, n1) = (try XCTUnwrap(niveau.avant.game), try XCTUnwrap(niveau.apres.game))
        let (r0, r1) = (try XCTUnwrap(rang.avant.game), try XCTUnwrap(rang.apres.game))
        XCTAssertEqual(n1.level.shown.level, n0.level.shown.level + 1)
        XCTAssertEqual(n1.glory.glory, n0.glory.glory)
        XCTAssertEqual(r1.level.shown.level, r0.level.shown.level)
        XCTAssertGreaterThan(GameGuideEvents.standingOrder(r1), GameGuideEvents.standingOrder(r0))
    }

    // MARK: - La célébration jouée, par le chemin réel du modèle

    func test_jouer_rang_climbsOneStandingStep_withoutMovingTheLevel() async throws {
        let (modele, serveur, _) = try await makeSUT(.rang)
        let avant = try XCTUnwrap(modele.game)

        await VitrineJeu.jouer(.rang, sur: modele, serveur: serveur)

        let apres = try XCTUnwrap(modele.game)
        XCTAssertGreaterThan(GameGuideEvents.standingOrder(apres), GameGuideEvents.standingOrder(avant), "l'écu ne monte que sur une marche GAGNÉE")
        XCTAssertEqual(apres.level.shown.level, avant.level.shown.level)
    }

    func test_jouer_niveau_gainsALevel_withoutMovingTheRank() async throws {
        let (modele, serveur, _) = try await makeSUT(.niveau)
        let avant = try XCTUnwrap(modele.game)

        await VitrineJeu.jouer(.niveau, sur: modele, serveur: serveur)

        let apres = try XCTUnwrap(modele.game)
        XCTAssertEqual(apres.level.shown.level, avant.level.shown.level + 1)
        XCTAssertEqual(GameGuideEvents.standingOrder(apres), GameGuideEvents.standingOrder(avant))
        XCTAssertTrue(modele.isSettled, "la tape de la montée ne couronne qu'une lecture réglée")
    }

    func test_jouer_coffre_opensTheReadyChest_throughTheRealGesture() async throws {
        let (modele, serveur, scenario) = try await makeSUT(.coffre)
        let avant = try XCTUnwrap(modele.game)
        XCTAssertEqual(avant.chest.status, .ready)
        XCTAssertNil(avant.chest.reward)

        await VitrineJeu.jouer(.coffre, sur: modele, serveur: serveur)

        let reward = try XCTUnwrap(scenario.coffre?.reward)
        XCTAssertEqual(modele.game?.chest.status, .claimed)
        XCTAssertEqual(modele.game?.chest.reward, reward)
        XCTAssertNil(modele.gameErrors.chest)
    }

    func test_jouer_frappe_mintsTheNextMeesh_throughTheRealGesture() async throws {
        let (modele, serveur, _) = try await makeSUT(.frappe)
        let avant = try XCTUnwrap(modele.game)
        XCTAssertTrue(avant.mint.canMint)
        XCTAssertNil(modele.celebration)

        await VitrineJeu.jouer(.frappe, sur: modele, serveur: serveur)

        XCTAssertEqual(modele.celebration?.key, 1, "la scène de la frappe se joue sur une frappe CONFIRMÉE")
        XCTAssertEqual(modele.celebration?.number, avant.mint.number)
        XCTAssertEqual(modele.celebration?.edition, avant.mint.edition)
        XCTAssertNil(modele.mintError)
    }

    func test_jouer_badge_relightsTheTextBadge() async throws {
        let (modele, serveur, _) = try await makeSUT(.badge)
        let avant = try XCTUnwrap(texte(modele))
        XCTAssertFalse(avant.lit)

        await VitrineJeu.jouer(.badge, sur: modele, serveur: serveur)

        let apres = try XCTUnwrap(texte(modele))
        XCTAssertTrue(apres.lit)
        XCTAssertEqual(apres.threshold, avant.threshold, "la MÊME médaille s'allume : la cellule rejoue sa chorégraphie")
    }

    /// Avant le signal, la passerelle fictive sert l'état d'avant : la fiche s'ouvre au repos, rien ne se joue.
    func test_serveur_servesTheStateBefore_untilTheCelebration() async throws {
        let scenario = VitrineJeuScenarios.pour(.rang, base: try base())
        let serveur = VitrineJeuServeur(scenario)
        let lu = try await serveur.fetchProgress()
        XCTAssertEqual(lu, scenario.avant)
        await serveur.servirLaSuite()
        let suite = try await serveur.fetchProgress()
        XCTAssertEqual(suite, scenario.apres)
    }

    private func texte(_ modele: ProgressionViewModel) -> GameBadgeItem? {
        guard let progress = modele.progress else { return nil }
        return GameBadges.shelf(for: progress).flatMap(\.entries).first { $0.axis.rawValue == "content.text_message" }?.item
    }
}
