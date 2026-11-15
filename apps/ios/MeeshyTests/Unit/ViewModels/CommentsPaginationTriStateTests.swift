import XCTest
@testable import Meeshy

/// **« Je ne sais pas encore » n'est plus « il y en a plus »** (#4868).
///
/// `hasMoreComments` était un `Bool` initialisé à `true`. L'initialisation était
/// DÉLIBÉRÉE — sans elle, la branche `.fresh` du cache laisse `commentCursor` à
/// `nil` et la pagination se bloque pour toute la session. Mais la valeur portait
/// deux sens, et le rendu lisait toujours le second : le détail d'un post
/// affichait « Charger plus » sous « Commentaires (0) ».
///
/// > La valeur par défaut était prise DANS le domaine des valeurs légitimes —
/// > c'est ça qui efface la distinction. Un tri-état écrasé en booléen a le même
/// > effet qu'un repli bien choisi : il rend l'ignorance indiscernable d'une
/// > réponse. (`tasks/lessons.md` § 431, § 443.)
///
/// Le `Bool?` rend la distinction au TYPE, à sa déclaration — donc avant qu'aucun
/// consommateur n'existe, et sans qu'aucun ait à la redéduire.
///
/// Ces témoins mesurent les trois états par leur EFFET sur les deux
/// consommateurs, pas la valeur elle-même : c'est la confusion des effets qui
/// était le défaut, pas le type.
final class CommentsPaginationTriStateTests: XCTestCase {

    @MainActor
    func test_aLOuverture_lEtatEstINCONNU_pasVrai() {
        let sut = PostDetailViewModel()
        XCTAssertNil(
            sut.hasMoreComments,
            "À l'ouverture, rien n'a été chargé : l'état doit être « je ne sais pas encore », "
                + "et surtout PAS `true` — c'est ce `true` que l'affichage lisait « il y en a plus »."
        )
    }

    /// **La raison d'être du `true` initial est préservée** : elle doit survivre
    /// au changement de type, sinon on corrige un affichage en cassant la
    /// pagination. C'est le témoin qui interdit la correction naïve `= false`.
    @MainActor
    func test_lEtatInconnu_nBloquePasLaPagination() {
        let sut = PostDetailViewModel()
        XCTAssertNotEqual(
            sut.hasMoreComments, false,
            "`loadMoreComments` se garde sur `hasMoreComments != false` : un état inconnu doit "
                + "laisser passer la première page, sinon la branche `.fresh` du cache gèle la "
                + "pagination pour toute la session."
        )
    }

    /// **Et il ne doit pas AFFICHER pour autant.** Les deux consommateurs lisent
    /// le même champ avec des seuils différents — c'est exactement ce que le
    /// booléen ne savait pas exprimer.
    @MainActor
    func test_lEtatInconnu_nAfficheJamaisChargerPlus() {
        let sut = PostDetailViewModel()
        XCTAssertFalse(
            sut.hasMoreComments == true,
            "L'affichage se garde sur `== true` : un état inconnu ne propose pas de charger ce "
                + "dont on ignore l'existence (#4086)."
        )
    }
}
