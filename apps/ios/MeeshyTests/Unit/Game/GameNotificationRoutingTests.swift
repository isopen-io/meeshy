import XCTest
@testable import Meeshy
import MeeshySDK

/// Le toucher d'une notification du jeu (#9490, #9539) ouvre l'écran que la CARTE DE NAVIGATION nomme (#9564,
/// amendement n° 4) — le Classement pour un duo ou un résultat de ligue, la Saison pour une étape, la fiche des
/// Missions à ses gestes, la fiche d'un palier — posé sur son CHEMIN COMPLET : depuis le push, la bannière et la
/// liste, sur iPhone comme sur iPad. Et la carte elle-même : trois niveaux, un parent par écran.
///
/// Les aiguillages vivent dans des méthodes `private` de vues SwiftUI lourdes : même convention que
/// `ContactRecentlyActiveRoutingTests`, ce sont des gardes de SOURCE, qui reconnaissent la branche par ce qu'elle FAIT.
final class GameNotificationRoutingTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Les entrées extérieures

    /// Une notification ouvre la fiche de son concept, ou la sous-page quand ce qu'elle annonce n'existe que là.
    @MainActor
    func test_eachNotification_opensTheScreenTheMapNames() {
        XCTAssertEqual(GameNavigationMap.entry(for: .gameDuoInvited), .gamePage(.league), "le duo se joue au Classement")
        XCTAssertEqual(GameNavigationMap.entry(for: .gameDuoAccepted), .gamePage(.league))
        XCTAssertEqual(GameNavigationMap.entry(for: .gameLeagueResult), .gamePage(.league))
        XCTAssertEqual(GameNavigationMap.entry(for: .gameSeasonStep), .gamePage(.season), "l'étape se réclame dans la Saison")
        XCTAssertEqual(GameNavigationMap.entry(for: .gameMissionWindow), .progressionConcept(.missions, section: .act),
                       "la mission du jour ouvre la fiche des missions, à ses gestes")
        XCTAssertEqual(GameNavigationMap.entry(for: .levelUp), .progressionConcept(.level))
        XCTAssertEqual(GameNavigationMap.entry(for: .streakMilestone), .progressionConcept(.flame))
        XCTAssertEqual(GameNavigationMap.entry(for: .badgeEarned), .progressionConcept(.badges))
        XCTAssertEqual(GameNavigationMap.entry(for: .achievementUnlocked), .progressionConcept(.succes))
        XCTAssertEqual(GameNavigationMap.entry(for: .legacyAchievementUnlocked), .progressionConcept(.succes))
        XCTAssertNil(GameNavigationMap.entry(for: .newMessage))
    }

    func test_everyNavigationSwitch_opensTheGameOnItsCompleteChain() throws {
        let five = ".gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep, .gameMissionWindow"
        let entry = "router.openGame(at: GameNavigationMap.entry(for:"
        let iphone = try source("Meeshy/Features/Main/Views/RootView.swift")
        XCTAssertEqual(iphone.components(separatedBy: "case \(five):").count - 1, 1, "l'aiguillage iPhone (push, liste, bannière)")
        XCTAssertEqual(iphone.components(separatedBy: entry).count - 1, 2, "jeu et paliers : l'iPhone ouvre l'écran de la carte")

        let ipad = try source("Meeshy/Features/Main/Views/iPadRootView+Navigation.swift")
        XCTAssertEqual(ipad.components(separatedBy: "case \(five):").count - 1, 3, "liste, bannière in-app et push : trois gestionnaires iPad")
        XCTAssertEqual(ipad.components(separatedBy: entry).count - 1, 6, "jeu et paliers, sur les trois gestionnaires iPad")
        XCTAssertFalse(ipad.contains("rightPanelRoute = .gamePage("), "plus aucune sous-page orpheline ouverte par une notification")

        for layers in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift", "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            XCTAssertTrue(try source(layers).contains("onPlayerBannerTap: { router.openGame(at: .progressionConcept(.level)) }"),
                          "\(layers) : le bandeau du joueur ouvre la fiche du niveau")
        }
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/ProfileView.swift").contains("router.openGame(at: .gamePage(.showcase))"),
                      "« Voir la vitrine » du profil pose la Vitrine sur son chemin complet")
        for host in ["Meeshy/Features/Main/Views/RootLayers/RootRouteDestination.swift", "Meeshy/Features/Main/Views/iPadRootView+Panels.swift"] {
            XCTAssertTrue(try source(host).contains("ProgressionView()"), "\(host) monte Progression sans ancre : la pile porte le chemin")
        }
    }

    /// La pile reçoit le CHEMIN COMPLET en une mutation ; déjà dans le jeu, on repart de SA première page.
    @MainActor
    func test_openingTheGame_laysTheCompleteChain_fromItsFirstPage() {
        let router = Router()
        router.path = [.settings]
        router.openGame(at: .gamePage(.league))
        XCTAssertEqual(router.path, [.settings, .progression, .progressionConcept(.league), .gamePage(.league)],
                       "sous-page → fiche → Progression : le retour remonte la chaîne")

        router.openGame(at: .progressionConcept(.missions, section: .act))
        XCTAssertEqual(router.path, [.settings, .progression, .progressionConcept(.missions, section: .act)],
                       "déjà dans le jeu : la fiche se pose au-dessus de LA première page, pas d'une seconde")

        let fresh = Router()
        fresh.openGame(at: .progression)
        XCTAssertEqual(fresh.path, [.progression])
    }

    /// Une entrée extérieure pose son écran sur son CHEMIN COMPLET : jamais une page orpheline dont le retour sort du jeu.
    @MainActor
    func test_everyExternalEntry_liesOnItsCompleteChain() {
        let entries: [MeeshyNotificationType] = [.gameDuoInvited, .gameDuoAccepted, .gameLeagueResult, .gameSeasonStep,
                                                 .gameMissionWindow, .levelUp, .streakMilestone, .badgeEarned, .achievementUnlocked]
        for type in entries {
            let route = GameNavigationMap.entry(for: type)
            let chain = route.map { GameNavigationMap.chain(to: $0) } ?? []
            XCTAssertEqual(chain.first, .progression, "\(type) : la chaîne part de la première page")
            XCTAssertEqual(chain.last, route, "\(type) : la chaîne finit sur l'écran visé")
            XCTAssertEqual(chain.count, GameNavigationMap.level(of: route ?? .settings), "\(type) : un écran par niveau, aucun saut")
        }
        XCTAssertEqual(GameNavigationMap.chain(to: .progressionSection(.badges)),
                       [.progression, .progressionConcept(.badges), .progressionSection(.badges)])
    }

    /// Les moments de la vague 2 du guide ouvrent la FICHE de leur concept, jamais une sous-page sautée.
    @MainActor
    func test_theGuideMoments_openTheSheetOfTheirConcept() {
        XCTAssertEqual(GameNavigationMap.guideConcept(for: .league), .league)
        XCTAssertEqual(GameNavigationMap.guideConcept(for: .season), .season)
        XCTAssertEqual(GameNavigationMap.guideConcept(for: .showcase), .showcase)
        XCTAssertEqual(GameNavigationMap.guideConcept(for: .atlas), .atlas)
        XCTAssertEqual(GameNavigationMap.guideConcept(for: .prestige), .level, "« voir le niveau » ouvre la fiche du Niveau")
        XCTAssertEqual(ProgressionConceptModel.concept(for: .treasury), .meesh, "« voir mes Meeshes » ouvre la fiche des Meeshes")
    }

    // MARK: - La carte de navigation du jeu (#9564, amendement n° 4)

    @MainActor
    private static let gameRoutes: [Route] = [.progression, .progressionDashboard, .progressionNotebook, .progressionRules(rule: nil)]
        + ProgressionConcept.allCases.map { .progressionConcept($0) }
        + GamePage.allCases.map { .gamePage($0) }
        + ProgressionSection.allCases.map { .progressionSection($0) }

    @MainActor
    func test_everyGameRoute_hasAParent_andNoneLivesDeeperThanTheThirdLevel() {
        for route in Self.gameRoutes {
            let level = GameNavigationMap.level(of: route)
            XCTAssertNotNil(level, "\(route) : une route du jeu hors de la carte")
            XCTAssertLessThanOrEqual(level ?? .max, 3, "\(route) : trois niveaux, jamais plus")
            if level != 1 {
                XCTAssertNotNil(GameNavigationMap.parent(of: route), "\(route) : pas de retour vers le niveau d'au-dessus")
            }
        }
        XCTAssertNil(GameNavigationMap.level(of: .settings), "une route hors du jeu n'est pas sur la carte")
        XCTAssertEqual(GameNavigationMap.parent(of: .gamePage(.league)), .progressionConcept(.league))
        XCTAssertEqual(GameNavigationMap.parent(of: .gamePage(.settings)), .progression, "les réglages sont une porte de la première page")
        XCTAssertEqual(GameNavigationMap.parent(of: .progressionRules(rule: nil)), .progression, "les règles aussi")
        XCTAssertEqual(GameNavigationMap.parent(of: .progressionNotebook), .progression, "le carnet aussi")
    }

    /// « Aller plus loin » mène à la sous-page du concept, et à elle seule : un niveau plus bas, sous SA fiche.
    @MainActor
    func test_everyLinkOfASheet_opensItsOwnSubpage_andNothingElse() {
        for concept in ProgressionConcept.allCases {
            let links = ProgressionConceptModel.links(concept)
            XCTAssertLessThanOrEqual(links.count, 1, "\(concept.rawValue) : une seule sous-page, aucun lien transverse")
            for link in links {
                let route = GameNavigationMap.route(for: link)
                XCTAssertEqual(GameNavigationMap.parent(of: route), .progressionConcept(concept), "\(concept.rawValue) : \(link.id) n'est pas sa sous-page")
                XCTAssertEqual(GameNavigationMap.level(of: route), 3)
            }
        }
        for base in [ProgressionConcept.level, .points, .meesh, .glory, .flame, .missions, .elans] {
            XCTAssertTrue(ProgressionConceptModel.links(base).isEmpty, "\(base.rawValue) : la section « Aller plus loin » disparaît")
        }
    }

    /// Sur iPad, une page du jeu ouverte depuis une page du jeu s'EMPILE dans le panneau : le retour y ramène, et la
    /// page d'en dessous garde sa position.
    @MainActor
    func test_onIPad_aGamePageOpenedFromTheGame_stacksAboveIt() {
        XCTAssertTrue(GameNavigationMap.stacks(.progressionConcept(.league), over: .progression))
        XCTAssertTrue(GameNavigationMap.stacks(.gamePage(.league), over: .progression))
        XCTAssertFalse(GameNavigationMap.stacks(.progression, over: .progression), "rouvrir la première page revient à la racine")
        XCTAssertFalse(GameNavigationMap.stacks(.progressionConcept(.level), over: .settings), "hors du jeu, la route remplace le panneau")
        XCTAssertFalse(GameNavigationMap.stacks(.settings, over: .progression))

        var trail = GamePanelTrail()
        trail.push(.progressionConcept(.league), over: .progression)
        trail.push(.gamePage(.league), over: .progression)
        XCTAssertEqual(trail.path(over: .progression).count, 2)
        XCTAssertTrue(trail.path(over: .settings).isEmpty, "la pile ne vaut que pour SA racine")
        trail.pop()
        XCTAssertEqual(trail.path(over: .progression).count, 1, "le retour ramène à la fiche")
    }

    /// Les Réglages du jeu ne portent plus de chemin transverse : « Gérer ma ligue », « Comment ça marche » et
    /// « Carnet » sont des portes d'AUTRES écrans (la fiche de la ligue, la première page).
    func test_theGameSettings_carryNoCrossPath() throws {
        let settings = try source("Meeshy/Features/Main/Game/Wave2/GameSettingsViews.swift")
        for gone in ["router.push(", "game.settings.league.manage", "game.settings.help", "game.settings.notebook"] {
            XCTAssertFalse(settings.contains(gone), "« \(gone) » : un chemin transverse depuis les Réglages du jeu")
        }
    }

    func test_theNotificationExtensionRendersADuoWithTheAvatarOfTheFriend() throws {
        let extensionSource = try source("MeeshyNotificationExtension/NotificationService.swift")
        XCTAssertTrue(extensionSource.contains("\"game_duo_invited\""))
        XCTAssertTrue(extensionSource.contains("\"game_duo_accepted\""))
    }
}
