import XCTest

/// **« Charger plus » ne s'affiche pas sous zéro commentaire** (#4086, mesuré au
/// simulateur le 2026-09-02).
///
/// Le détail d'un post rendait « Commentaires (0) » **et** un bouton « Charger
/// plus » — un contrôle qui propose de charger ce qui n'existe pas, c'est-à-dire
/// un contrôle sans matière (loi 4 de `BOUCLE.md`).
///
/// La cause n'est pas une garde manquante, et c'est ce qui la rend intéressante :
/// `hasMoreComments` est initialisé à `true` **à dessein** — sans quoi la
/// pagination se bloquerait pour toute la session, ce que son doc-comment
/// explique en détail. La valeur veut dire « je ne sais pas encore » ; l'affichage
/// la lisait « il y en a plus ».
///
/// > Un booléen initialisé à `true` pour ne rien bloquer porte DEUX sens —
/// > « inconnu » et « oui » — et le rendu lit toujours le second. Le défaut n'est
/// > pas au site qui l'affiche : il est à la déclaration, où un tri-état a été
/// > écrasé en booléen.
///
/// Ce témoin garde le correctif d'affichage. Le tri-état lui-même reste à faire —
/// il touche le ViewModel et sa pagination, pas la vue.
final class PostDetailLoadMoreGuardTests: XCTestCase {

    private static let detailPath = "Meeshy/Features/Main/Views/PostDetailView.swift"

    func test_chargerPlusExigeUneListeNonVide() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.detailPath))
        guard let ligne = source.range(of: "if viewModel.hasMoreComments") else {
            return XCTFail("La condition d'affichage de « Charger plus » est introuvable — "
                           + "la garde ne mesurerait rien.")
        }
        let fin = source.index(ligne.lowerBound, offsetBy: 160, limitedBy: source.endIndex) ?? source.endIndex
        let condition = String(source[ligne.lowerBound..<fin])
        XCTAssertTrue(
            condition.contains("!viewModel.comments.isEmpty"),
            "« Charger plus » doit exiger une liste NON VIDE : `hasMoreComments` vaut « je ne sais "
                + "pas encore » à l'ouverture, et l'afficher sur cet état propose de charger ce qui "
                + "n'existe pas (#4086)."
        )
    }

    /// **Garde d'aveuglement.** Le test ci-dessus lit 160 caractères après un
    /// littéral ; si la condition est réécrite sur plusieurs lignes ou renommée,
    /// il doit échouer bruyamment plutôt que passer sur une fenêtre vide.
    func test_laGardeLitBienUneCondition() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.detailPath))
        XCTAssertTrue(source.contains("viewModel.hasMoreComments"),
                      "Le drapeau de pagination doit rester nommé dans la vue.")
        XCTAssertTrue(source.contains("feed.post.detail.load_more"),
                      "Et le bouton doit toujours exister — le masquer TOUJOURS serait l'excès inverse.")
    }
}
