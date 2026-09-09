import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un palier se célèbre sur les DEUX racines, ou sur aucune.**
///
/// Le 2026-09-08, « Publier un post » levait un drapeau que seule la racine
/// iPhone lisait : le bouton était mort sur iPad, et aucune garde ne rougissait
/// puisque l'ÉCRITURE, elle, était bien là. Ces témoins interdisent la rechute
/// sur la célébration (#5809), qui a exactement la même forme : un drapeau
/// posé d'un côté, un hôte qui le ramasse de l'autre.
@MainActor
final class EngagementRevealWiringTests: XCTestCase {

    // MARK: - Le site unique de consommation

    func test_consumePendingEngagementReveal_servesOnce_thenLowersTheFlag() {
        let router = Router()
        router.pendingEngagementReveal = .streak(days: 7)

        XCTAssertEqual(router.consumePendingEngagementReveal(), .streak(days: 7))
        XCTAssertNil(router.pendingEngagementReveal,
                     "Le palier retombe AU SITE de consommation — sinon la célébration "
                         + "se rejoue à chaque apparition de l'hôte.")
        XCTAssertNil(router.consumePendingEngagementReveal())
    }

    func test_consumePendingEngagementReveal_whenNothingPending_isNil() {
        XCTAssertNil(Router().consumePendingEngagementReveal())
    }

    // MARK: - Les DEUX racines posent, les DEUX racines ramassent

    func test_bothRoots_mountTheRevealHost() throws {
        // L'hôte est posé par la couche de covers de chaque racine (#5837).
        for racine in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
                       "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(racine))
            XCTAssertTrue(code.contains("engagementReveal(router: router)"),
                          "\(racine) doit monter l'hôte de célébration — un hôte posé sur "
                              + "une seule racine laisse l'autre moitié des appareils sans rien.")
        }
    }

    /// Les TROIS sources de tap posent le palier, de chaque côté : API, socket
    /// et push. iPhone les traverse par les trois constructeurs de
    /// `NotificationNavContext` ; iPad par ses trois gestionnaires. Un oubli
    /// dans l'un d'eux fait disparaître la célébration pour cette source-là
    /// seulement — le genre d'écart qu'aucun essai manuel ne couvre.
    func test_everyTapSource_carriesTheMilestone() throws {
        let iphone = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootView.swift"))
        XCTAssertEqual(iphone.components(separatedBy: "reveal = ").count - 1, 3,
                       "Les trois constructeurs de `NotificationNavContext` renseignent le "
                           + "palier — API, socket, push (ce dernier à `nil`, faute de "
                           + "métadonnée typée : on n'en invente pas).")
        XCTAssertTrue(iphone.contains("router.pendingEngagementReveal = ctx.reveal"))

        let ipad = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView.swift"))
        XCTAssertEqual(ipad.components(separatedBy: "router.pendingEngagementReveal =").count - 1, 2,
                       "Les gestionnaires API et socket dérivent le palier ; celui du push "
                           + "n'en pose aucun, faute de métadonnée typée.")
    }

    // MARK: - La SECONDE porte : le geste, sans tap (#5847)

    /// L'hôte écoute le socket EN PLUS du drapeau du routeur. Sans cette
    /// seconde porte, un succès ne se célèbre que si l'utilisateur va le
    /// chercher dans la cloche — la récompense arrive sous forme de devoir.
    func test_theHost_alsoListensToLiveNotifications() throws {
        let hote = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/EngagementRevealHost.swift"))
        XCTAssertTrue(hote.contains("newNotificationReceived"),
                      "L'hôte doit s'abonner aux notifications reçues en direct — c'est "
                          + "la porte par laquelle un succès se célèbre AU GESTE.")
        XCTAssertTrue(hote.contains("celebratesUnprompted"),
                      "Et il doit filtrer : seul un SUCCÈS s'ouvre tout seul. Un badge, "
                          + "une série, un niveau se contentent d'une notification.")
    }

    /// La règle de surface, à son site unique. L'écrire dans l'hôte plutôt que
    /// dans le SDK la rendrait invisible à l'autre client.
    func test_onlyAnAchievement_celebratesUnprompted() {
        XCTAssertTrue(EngagementReveal.achievement(.firstVoice).celebratesUnprompted)
        XCTAssertFalse(EngagementReveal.streak(days: 7).celebratesUnprompted)
        XCTAssertFalse(EngagementReveal.level(3).celebratesUnprompted)
    }

    /// La célébration ne REMPLACE pas le tableau de bord : elle le couvre. Le
    /// tap continue donc de l'ouvrir, exactement comme avant — sinon refermer
    /// la célébration laisserait l'utilisateur là d'où il vient.
    func test_theDashboardIsStillOpened_theRevealOnlyCoversIt() throws {
        let iphone = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootView.swift"))
        XCTAssertTrue(iphone.contains("router.push(.progression)"))

        let ipad = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView.swift"))
        XCTAssertTrue(ipad.contains("rightPanelRoute = .progression"))
    }
}
