import XCTest
@testable import Meeshy

/// **Un accès rapide mène quelque part sur les DEUX racines, ou il ment.**
///
/// La liste de conversations peint neuf accès rapides — en queue de liste et
/// dans l'état vide de démarrage. `LentilleSceneActivityTests
/// .test_quickActions_areTheListTail_andTheEmptyState_behindTheFlag` affirme
/// que « chaque accès rapide route vers une porte EXISTANTE » et reste VERTE
/// pendant que « Publier un post » ne fait rien sur iPad : elle mesure la
/// ligne qui LÈVE le drapeau, jamais celle qui le LIT.
///
/// Or les deux racines ne montent pas le même flux. `RootView` (iPhone) monte
/// `ThemedFeedOverlay`, seul lecteur historique du drapeau ;
/// `iPadRootView` monte `FeedView` directement, qui ne le lisait pas. Le même
/// bouton, la même vue, deux destins — et rien ne rougissait, puisque
/// l'ÉCRITURE, elle, était bien là.
///
/// > La question à poser à un contrôle n'est pas « pose-t-il son drapeau ? »
/// > mais **« qui le RAMASSE, sur chacune des racines qui peignent ce
/// > bouton ? »**. Un drapeau sans lecteur est un `Button` sans action, avec
/// > une ligne de code en plus pour le déguiser.
@MainActor
final class QuickActionDoorsOnBothRootsTests: XCTestCase {

    // MARK: - Le comportement : une demande se consomme UNE fois

    func test_consumePendingFeedComposer_whenRaised_returnsTrueOnce_andLowersTheFlag() {
        let router = Router()
        router.pendingOpenFeedComposer = true

        XCTAssertTrue(router.consumePendingFeedComposer(),
                      "Une demande en attente se rend à qui la ramasse.")
        XCTAssertFalse(router.pendingOpenFeedComposer,
                       "Le drapeau retombe AU SITE de consommation — sinon la demande "
                           + "se rejoue à chaque apparition du flux.")
        XCTAssertFalse(router.consumePendingFeedComposer(),
                       "Une demande déjà servie ne se sert pas deux fois.")
    }

    func test_consumePendingFeedComposer_whenNothingPending_returnsFalse() {
        let router = Router()
        XCTAssertFalse(router.consumePendingFeedComposer())
        XCTAssertFalse(router.pendingOpenFeedComposer)
    }

    // MARK: - Les DEUX racines ramassent

    func test_bothRoots_consumeThePendingFeedComposerRequest() throws {
        // iPhone — `RootView` montre le flux, `ThemedFeedOverlay` ouvre le composeur.
        let overlay = try source("Meeshy/Features/Main/Views/RootViewComponents.swift")
        XCTAssertTrue(overlay.contains("router.consumePendingFeedComposer()"),
                      "La racine iPhone ramasse la demande par le site UNIQUE.")

        // iPad — `iPadRootView` monte `FeedView` SANS `ThemedFeedOverlay` :
        // c'est donc `FeedView` qui doit ramasser, sinon « Publier un post »
        // lève un drapeau que personne ne lit.
        let feed = try AppSourceGuard.unit("Meeshy/Features/Main/Views/FeedView.swift")
        XCTAssertTrue(feed.contains("router.consumePendingFeedComposer()"),
                      "La racine iPad ramasse la demande : sans elle, « Publier un post » est inerte.")
        XCTAssertTrue(feed.contains("isPresented = true"),
                      "Et elle l'ouvre sur le composeur que cette racine possède déjà.")
    }

    /// La demande se lève depuis la LISTE, et sur iPad la liste n'occupe une
    /// colonne que lorsqu'une conversation est ouverte — c'est-à-dire
    /// exactement quand `FeedView` n'est PAS monté (`leftColumn`). Ramasser ne
    /// suffit donc pas : il faut d'abord RÉVÉLER le flux, comme `RootView` le
    /// fait côté iPhone en montrant l'enveloppe.
    func test_theIPadRoot_revealsTheFeed_soTheRequestFindsItsReader() throws {
        let racine = try source("Meeshy/Features/Main/Views/iPadRootView.swift")
        XCTAssertTrue(racine.contains("adaptiveOnChange(of: router.pendingOpenFeedComposer)"),
                      "La racine iPad écoute la demande.")
        XCTAssertTrue(racine.contains("guard pending, isConversationOpen else { return }"),
                      "Elle n'agit QUE si le flux est masqué par une conversation — sinon "
                          + "il est déjà là et refermer les panneaux serait un effet de bord.")
        XCTAssertTrue(racine.contains("closePanels()"),
                      "Révéler le flux sur iPad, c'est refermer les panneaux — l'analogue "
                          + "exact de `showFeed = true` côté iPhone.")
    }

    /// Le drapeau n'est REMIS À PLAT qu'au site unique — sinon deux racines
    /// divergent à nouveau, chacune avec sa propre façon d'oublier.
    func test_theFlagIsLoweredOnlyBySingleSite() throws {
        let router = try source("Meeshy/Features/Main/Navigation/Router.swift")
        XCTAssertTrue(router.contains("func consumePendingFeedComposer() -> Bool"))

        for hôte in ["Meeshy/Features/Main/Views/RootViewComponents.swift",
                     "Meeshy/Features/Main/Views/FeedView.swift",
                     "Meeshy/Features/Main/Views/RootView.swift"] {
            let code = try AppSourceGuard.unit(hôte)
            XCTAssertFalse(code.contains("pendingOpenFeedComposer = false"),
                           "\(hôte) remet le drapeau à plat lui-même : la remise à zéro "
                               + "appartient à `Router.consumePendingFeedComposer()`, seul site.")
        }
    }

    private func source(_ relativeToAppRoot: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativeToAppRoot))
    }
}
