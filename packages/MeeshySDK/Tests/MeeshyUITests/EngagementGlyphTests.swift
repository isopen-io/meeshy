import XCTest
@testable import MeeshyUI

/// `EngagementGlyph` rend visible « c'est MOI qui l'ai fait » : glyphe plein +
/// contour à l'accent du contenu, superposé.
///
/// Ce que ces témoins gardent, c'est la RÈGLE que le composant d'origine
/// (`ReelFeedCard.actionGlyph`) énonçait dans son doc-comment sans que rien ne
/// la vérifie : « le contour retrace le bord du GLYPHE, jamais un cercle autour
/// de lui ». Une règle écrite en prose et jamais mesurée finit par être violée
/// — elle l'était déjà, sur le repost du fil, seul des trois à changer de
/// famille de symbole selon son état (`arrow.2.squarepath` au repos,
/// `arrow.2.squarepath.circle.fill` actif) : son contour traçait donc un anneau.
final class EngagementGlyphTests: XCTestCase {

    func test_symbolesQuiRetracentLeGlyphe_sontAcceptes() {
        for outline in ["heart", "bookmark", "arrow.2.squarepath", "square.and.arrow.up"] {
            XCTAssertFalse(
                EngagementGlyph.tracesARingInsteadOfTheGlyph(outline: outline),
                "\(outline) retrace le bord du glyphe — c'est la forme attendue"
            )
        }
    }

    func test_symbolesEnCercle_sontDetectes() {
        for outline in ["arrow.2.squarepath.circle", "heart.circle", "bookmark.circle.fill"] {
            XCTAssertTrue(
                EngagementGlyph.tracesARingInsteadOfTheGlyph(outline: outline),
                "\(outline) dessinerait un ANNEAU autour du glyphe — un badge d'état de l'app, "
                + "pas la trace du lecteur"
            )
        }
    }

    /// Le témoin qui empêche les deux precedents de devenir muets : si la
    /// détection cessait de distinguer quoi que ce soit, ils passeraient tous
    /// les deux au vert en ayant perdu leur protection.
    func test_laDetectionDistingueVraimentLesDeuxFamilles() {
        XCTAssertNotEqual(
            EngagementGlyph.tracesARingInsteadOfTheGlyph(outline: "heart"),
            EngagementGlyph.tracesARingInsteadOfTheGlyph(outline: "heart.circle")
        )
    }
}
