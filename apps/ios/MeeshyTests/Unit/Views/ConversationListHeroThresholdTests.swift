import XCTest
@testable import Meeshy

/// **Les trois grands boutons de démarrage tiennent jusqu'à 10 conversations**
/// (directive porteur 2026-09-01).
///
/// > « Les trois lignes ci-dessus de cet empty state doivent toujours
/// > s'afficher tant qu'on n'a pas plus de 10 conversations dans sa liste ! »
///
/// Ils ne répondaient qu'à « la liste est VIDE ». Or ce n'est pas le vide qui
/// appelle de l'aide, c'est le DÉMARRAGE : une liste d'UNE conversation en a
/// autant besoin qu'une liste de zéro, et reléguer les trois boutons en
/// petites tuiles dès le premier message envoyé retirait l'aide exactement au
/// moment où elle commençait à servir.
/// `@MainActor` pour la seule raison que `ConversationListQuickActions` est une
/// `View` — donc isolée au MainActor, conformité `Equatable` comprise. La RÈGLE
/// (`showsHeroes`, `tiles`, `heroes`) est `nonisolated` et s'interrogerait sans ;
/// c'est la construction de la cellule, dans les deux derniers témoins, qui
/// l'exige.
@MainActor
final class ConversationListHeroThresholdTests: XCTestCase {

    private typealias Actions = ConversationListQuickActions

    // MARK: - Le seuil

    func test_uneListeVIDE_gardeLesTroisBoutons() {
        XCTAssertTrue(Actions.showsHeroes(conversationCount: 0))
    }

    /// **LE témoin de la directive** : c'est le seul cas que l'ancienne règle
    /// ratait, et c'est le cas NOMINAL — on vient d'envoyer son premier
    /// message.
    func test_uneSEULEConversation_gardeEncoreLesTroisBoutons() {
        XCTAssertTrue(Actions.showsHeroes(conversationCount: 1))
    }

    /// « Pas PLUS de 10 » ⇒ le seuil est INCLUSIF. Dix les garde.
    func test_DIXConversations_lesGardentEncore() {
        XCTAssertTrue(Actions.showsHeroes(conversationCount: Actions.heroThreshold))
    }

    /// La ONZIÈME les range — sinon le seuil ne serait pas un seuil.
    func test_laONZIÈME_lesRange() {
        XCTAssertFalse(Actions.showsHeroes(conversationCount: Actions.heroThreshold + 1))
        XCTAssertFalse(Actions.showsHeroes(conversationCount: 250))
    }

    func test_leSeuilVaut_DIX() {
        XCTAssertEqual(Actions.heroThreshold, 10)
    }

    // MARK: - Ce que le seuil gouverne, et ce qu'il ne gouverne PAS

    /// **Les héros sortent de la grille tant qu'ils sont des héros.** Sans
    /// cela, les trois boutons paraîtraient DEUX fois — en grand au-dessus et
    /// en tuile dans la grille.
    func test_tantQueLesHérosSontGrands_ilsQuittentLaGrille() {
        let grille = Actions.Action.tiles(showsHeroes: true)
        for heros in Actions.Action.heroes {
            XCTAssertFalse(grille.contains(heros),
                           "« \(heros) » est déjà rendu en grand : le remettre en tuile le doublerait")
        }
    }

    /// Passé le seuil, ils REDEVIENNENT des tuiles ordinaires — ils ne
    /// disparaissent pas : chercher des membres reste utile à cent
    /// conversations, simplement plus au même rang.
    func test_passéLeSeuil_lesHérosRedeviennentDesTuiles() {
        let grille = Actions.Action.tiles(showsHeroes: false)
        for heros in Actions.Action.heroes {
            XCTAssertTrue(grille.contains(heros), "« \(heros) » ne doit pas disparaître de la grille")
        }
        XCTAssertEqual(grille.count, Actions.Action.allCases.count)
    }

    /// **Le seuil ne décide QUE des héros.** Le titre reste gouverné par
    /// `isEmptyState` : une liste d'une conversation n'est pas vide, et lui
    /// faire dire « Aucune conversation » serait un mensonge que le seuil
    /// n'autorise pas.
    func test_leSeuil_neDécidePasDuTITRE() {
        let vide = Actions(isDark: true, isEmptyState: true, conversationCount: 0)
        let demarrage = Actions(isDark: true, isEmptyState: false, conversationCount: 3)
        XCTAssertTrue(vide.showsHeroes)
        XCTAssertTrue(demarrage.showsHeroes, "trois conversations démarrent encore")
        XCTAssertFalse(demarrage.isEmptyState, "…mais la liste n'est PAS vide")
    }

    /// La cellule est `Equatable` pour ne pas se re-rendre pour rien : le
    /// compte doit donc entrer dans l'égalité, sinon franchir le seuil ne
    /// changerait rien à l'écran.
    func test_leCompte_entreDansLÉgalité_sinonLeSeuilNeSeVerraitJamais() {
        let dix = Actions(isDark: true, isEmptyState: false, conversationCount: 10)
        let onze = Actions(isDark: true, isEmptyState: false, conversationCount: 11)
        XCTAssertNotEqual(dix, onze)
    }
}
