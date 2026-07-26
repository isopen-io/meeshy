import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// Le fond de story sérialise ses dégradés en `"gradient:RRGGBB:RRGGBB"` —
/// séparateur DEUX-POINTS. Le lecteur, lui, splittait sur la VIRGULE : la
/// chaîne restait d'un seul tenant, `LinearGradient` recevait une unique
/// couleur bâtie sur `"FF0000:0000FF"` (donc un hex invalide), et le dégradé
/// de l'auteur disparaissait au profit d'un aplat.
///
/// On verrouille ici le contrat de parsing sur `StoryBackgroundValue`, la
/// source de vérité partagée avec le composer — plutôt que de re-tester un
/// parsing maison qu'on vient justement de supprimer.
final class StoryViewerBackgroundParsingTests: XCTestCase {

    func test_gradientValue_parsesTwoColorsFromColonSeparatedForm() {
        let parsed = StoryBackgroundValue.parse("gradient:FF0000:0000FF")

        guard case let .gradient(start, end) = parsed else {
            return XCTFail("attendu .gradient, obtenu \(parsed)")
        }
        XCTAssertEqual(start.uppercased(), "FF0000")
        XCTAssertEqual(end.uppercased(), "0000FF")
    }

    /// Aller-retour : ce que le composer écrit, le lecteur doit le relire.
    /// C'est cette symétrie que le parsing maison cassait.
    func test_gradient_roundTripsThroughSerialization() {
        let original = StoryBackgroundValue.gradient("112233", "AABBCC")

        XCTAssertEqual(StoryBackgroundValue.parse(original.serialized), original)
    }

    func test_solidValue_isNotParsedAsGradient() {
        if case .gradient = StoryBackgroundValue.parse("#112233") {
            XCTFail("une couleur unie ne doit pas être lue comme un dégradé")
        }
    }

    /// Parsing tolérant : une forme abîmée retombe en `.hex`, ce qui laisse le
    /// renderer sur son fallback couleur au lieu d'afficher un dégradé faux.
    func test_malformedGradient_fallsBackToHex() {
        for raw in ["gradient:FF0000", "gradient:FF0000:0000FF:00FF00", "gradient:ZZZZZZ:0000FF"] {
            if case .gradient = StoryBackgroundValue.parse(raw) {
                XCTFail("« \(raw) » n'est pas un dégradé bien formé")
            }
        }
    }

    /// La séparation par virgule — celle que le lecteur supposait — ne doit
    /// surtout PAS être acceptée : si elle l'était, le vrai format à
    /// deux-points et cette forme fantôme coexisteraient en silence.
    func test_commaSeparatedForm_isNotAGradient() {
        if case .gradient = StoryBackgroundValue.parse("gradient:FF0000,0000FF") {
            XCTFail("la forme à virgule n'a jamais été le format sérialisé")
        }
    }
}
