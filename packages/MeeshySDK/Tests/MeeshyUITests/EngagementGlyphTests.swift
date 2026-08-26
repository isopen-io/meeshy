import XCTest
@testable import MeeshyUI

/// `EngagementGlyph` rend visible « c'est MOI qui l'ai fait » : glyphe plein +
/// contour à l'accent du contenu, superposé.
///
/// Ces témoins gardent la règle que le composant d'origine
/// (`ReelFeedCard.actionGlyph`) énonçait dans son doc-comment sans que rien ne
/// la vérifie : « le contour retrace le bord du GLYPHE, jamais un cercle autour
/// de lui ».
///
/// **Ce que la règle dit vraiment.** Elle ne proscrit pas la famille `.circle` :
/// un glyphe QUI EST un disque a légitimement un contour circulaire — c'est le
/// cas du repost, seul des trois à changer de famille selon son état. Ce qu'elle
/// proscrit, c'est un contour d'une AUTRE forme que le glyphe qu'il borde. Une
/// première version de ce témoin mesurait « le symbole finit-il par `.circle` »
/// et aurait donc condamné un cas correct tout en laissant passer le vrai
/// défaut : un contour étranger au glyphe.
final class EngagementGlyphTests: XCTestCase {

    func test_leContourDeMemeFamilleQueLeGlyphe_estAccepte() {
        XCTAssertTrue(EngagementGlyph.outlineTracesTheGlyph(outline: "heart", filled: "heart.fill"))
        XCTAssertTrue(EngagementGlyph.outlineTracesTheGlyph(outline: "bookmark", filled: "bookmark.fill"))
    }

    /// Le cas du repost : son glyphe actif EST un disque, son contour l'est donc
    /// aussi. C'est conforme — le contour borde ce qui est affiché.
    func test_unGlypheQuiEstUnDisque_aLegitimementUnContourCirculaire() {
        XCTAssertTrue(
            EngagementGlyph.outlineTracesTheGlyph(
                outline: "arrow.2.squarepath.circle",
                filled: "arrow.2.squarepath.circle.fill"
            ),
            "le contour borde le disque AFFICHÉ — ce n'est pas un anneau ajouté autour de lui"
        )
    }

    func test_unContourDUneAutreFormeQueLeGlyphe_estRefuse() {
        XCTAssertFalse(
            EngagementGlyph.outlineTracesTheGlyph(outline: "arrow.2.squarepath.circle", filled: "heart.fill"),
            "superposer un anneau à un cœur dessine une forme étrangère au glyphe"
        )
        XCTAssertFalse(
            EngagementGlyph.outlineTracesTheGlyph(outline: "arrow.2.squarepath", filled: "arrow.2.squarepath.circle.fill"),
            "le glyphe affiché est un disque, le contour des flèches nues ne le borde pas"
        )
    }

    /// Le témoin qui empêche les précédents de devenir muets : si le prédicat
    /// cessait de distinguer quoi que ce soit, ils passeraient tous au vert en
    /// ayant perdu leur protection.
    func test_lePredicatDistingueVraiment() {
        XCTAssertNotEqual(
            EngagementGlyph.outlineTracesTheGlyph(outline: "heart", filled: "heart.fill"),
            EngagementGlyph.outlineTracesTheGlyph(outline: "heart", filled: "star.fill")
        )
    }
}
