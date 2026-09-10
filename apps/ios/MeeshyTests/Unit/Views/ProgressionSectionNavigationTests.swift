import XCTest
@testable import Meeshy
import MeeshySDK

/// **Les trois sections du hub sont des PAGES, pas des feuilles** (directive
/// porteur 2026-09-09).
///
/// Badges, Défis et Succès s'ouvraient en `.sheet`. Une feuille est une
/// INTERRUPTION : elle se ferme par un geste vers le BAS, elle ne se range pas
/// dans l'historique, et le geste de retour depuis le bord gauche — celui que
/// tout le reste de l'app sert — n'y fait rien. Le porteur veut le modèle des
/// deux autres clients : une navigation, un `<`, et le glissement depuis le
/// bord.
///
/// **Ce que ce témoin garde, et pourquoi c'est une garde de SOURCE.** Le geste
/// de retour interactif n'est pas observable sans un appareil : ce qui est
/// vérifiable ici, c'est que la section passe par la PILE — `Route` la porte,
/// `RootRouteDestination` la rend, et `ProgressionView` la POUSSE au lieu de la
/// présenter. Le geste vient alors de `NavigationStack`, gratuitement ; le
/// perdre demanderait de repasser par une feuille, ce que la première
/// assertion interdit.
@MainActor
final class ProgressionSectionNavigationTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    private func tableauDeBord() throws -> String {
        try source("Meeshy/Features/Main/Views/ProgressionView.swift")
    }

    private func hub() throws -> String {
        try source("Meeshy/Features/Main/Views/ProgressionHub.swift")
    }

    private func routeur() throws -> String {
        try source("Meeshy/Features/Main/Navigation/Router.swift")
    }

    private func destinations() throws -> String {
        try source("Meeshy/Features/Main/Views/RootLayers/RootRouteDestination.swift")
    }

    // MARK: - La section voyage par la PILE

    func test_laSectionEstUneRouteDeLaPile() throws {
        XCTAssertTrue(try routeur().contains("case progressionSection(ProgressionSection)"),
                      "Sans route, la section ne peut pas être poussée : elle retombe sur une feuille.")
        XCTAssertTrue(try destinations().contains("case .progressionSection(let section):"),
                      "Une route que rien ne rend est une porte qui mène au vide.")
        XCTAssertTrue(try destinations().contains("ProgressionSectionPage("),
                      "La destination doit rendre la PAGE, pas un autre écran.")
    }

    func test_leTableauDeBordPousseLaSectionAuLieuDeLaPresenter() throws {
        let vue = try tableauDeBord()
        XCTAssertTrue(vue.contains("router.push(.progressionSection("),
                      "La section doit être POUSSÉE — c'est ce qui lui donne le `<` et le glissement du bord.")
        XCTAssertFalse(vue.contains(".sheet(item: $destination)"),
                       "Une feuille n'a ni historique ni geste de bord : c'est précisément ce que le porteur retire.")
    }

    /// La célébration restait attachée à la PAGE parce qu'elle était présentée
    /// en feuille — un `fullScreenCover` de l'écran parent se serait ouvert
    /// DERRIÈRE elle. Poussée dans la pile, la page n'a plus cette contrainte,
    /// mais elle garde sa propre porte : c'est depuis SES lignes qu'on ouvre un
    /// succès, et la porte doit rester là où le doigt se pose.
    func test_laPageGardeSaPorteDeCelebration() throws {
        XCTAssertTrue(try hub().contains("AchievementRevealView("),
                      "Une ligne de succès qui ne s'ouvre plus est une fonctionnalité écrite et inatteignable.")
    }

    // MARK: - Le chrome est du VERRE

    /// Le `<` et le compte sont posés SUR le dégradé de l'écran, sans barre
    /// système pour les porter. Sans matière, ils flottent : deux glyphes
    /// teintés sur un fond clair, dont rien ne dit qu'ils sont des contrôles.
    /// Le verre adaptatif leur rend cette matière — et il est ADAPTATIF, jamais
    /// `.glassEffect` en direct (#4997) : sous iOS 26 c'est du Liquid Glass,
    /// en deçà un repli qui garde l'affordance.
    func test_leChevronEtLaValeurSontDuVerreAdaptatif() throws {
        let page = try hub()
        XCTAssertTrue(page.contains("adaptiveGlass("),
                      "Le chrome de la page doit être du verre adaptatif, pas des glyphes nus.")
        XCTAssertFalse(page.contains(".glassEffect("),
                       "`.glassEffect` en direct casse le repli sous iOS 26 (#4997) — passer par `adaptiveGlass`.")
    }
}
