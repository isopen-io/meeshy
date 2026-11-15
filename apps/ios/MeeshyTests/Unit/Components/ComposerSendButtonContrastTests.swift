import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Le pictogramme du bouton d'envoi est BLANC. Tant que le dégradé était figé sur
/// l'indigo de marque, son contraste était garanti par construction ; depuis qu'il
/// porte l'accent de son hôte (conversation, post, story), il dépend d'une couleur
/// que `ColorGeneration` calcule — donc il se MESURE (motif de
/// `CallBannerContrastTests`, dont ce fichier réutilise `contrastRatio`).
///
/// **Censure mesurée, volontairement NON corrigée ici.** Une part des accents que
/// `ColorGeneration` produit ne tient pas le seuil WCAG 1.4.11 (3:1) sous un glyphe
/// blanc — les familles claires de la palette vibrante (`00CED1` 1.95:1, `2ECC71`
/// 2.10:1, `22C55E` 2.28:1, `1ABC9C` 2.41:1, `14B8A6` 2.49:1, `FF7F50` 2.50:1,
/// `0EA5E9` 2.77:1, `F97316` 2.80:1, `E67E22` 2.85:1, `27AE60` 2.87:1, `CA8A04`
/// 2.94:1), et, côté conversations, la majorité des mélanges teal/vert produits par
/// `colorFor(context:)`. Le second arrêt de l'ancien dégradé de marque (`indigo400`,
/// 2.98:1) était d'ailleurs DÉJÀ sous le seuil : le contrat indigo garantissait moins
/// qu'il n'en avait l'air. Choisir un glyphe adaptatif (ou assombrir l'accent sous le
/// glyphe) est une décision produit qui dépasse ce lot — d'où l'absence de témoin sur
/// ces cas, et leur report en suivi.
///
/// Ce que ce fichier verrouille, c'est la moitié démontrable : les accents PROFONDS
/// tiennent le seuil, et le couple par défaut — servi à tout composer qui ne passe
/// pas d'accent — reste le couple de marque profond.
final class ComposerSendButtonContrastTests: XCTestCase {

    /// Seuil WCAG 2.x 1.4.11 « composants d'interface et objets graphiques ».
    private static let uiComponentThreshold: Double = 3.0

    /// Accents profonds de la palette vibrante de `ColorGeneration` — ceux qu'une
    /// conversation, un post ou une story peuvent servir au composer.
    private static let deepAccents: [(name: String, hex: String)] = [
        ("indigo600", "4F46E5"),
        ("violet800", "6D28D9"),
        ("violet600", "7C3AED"),
        ("rouge profond", "C0392B"),
        ("bleu profond", "2563EB"),
        ("améthyste", "9B59B6"),
        ("indigo500", "6366F1"),
    ]

    // MARK: - Glyphe blanc sur accents profonds

    func test_whiteGlyph_onDeepAccents_clearsUIComponentThreshold() {
        for accent in Self.deepAccents {
            let ratio = CallBannerContrast.contrastRatio(.white, Color(hex: accent.hex))
            XCTAssertGreaterThanOrEqual(
                ratio,
                Self.uiComponentThreshold,
                "glyphe blanc du bouton d'envoi sur \(accent.name) (#\(accent.hex)) : \(ratio):1"
            )
        }
    }

    // MARK: - Couple par défaut (composer sans hôte)

    /// Un composer qui ne passe pas d'accent retombe sur le couple de marque. Son
    /// PREMIER arrêt gouverne l'ombre et la moitié haute du disque : il doit rester
    /// le jeton profond, jamais un jeton clair.
    func test_defaultComposerPair_keepsTheDeepBrandSecondStop() {
        XCTAssertEqual(MeeshyColors.indigo400Hex, "818CF8")
        XCTAssertEqual(MeeshyColors.indigo600Hex, "4F46E5")

        let ratio = CallBannerContrast.contrastRatio(.white, Color(hex: MeeshyColors.indigo600Hex))
        XCTAssertGreaterThanOrEqual(
            ratio,
            4.5,
            "l'arrêt profond du couple par défaut doit rester très lisible sous un glyphe blanc : \(ratio):1"
        )
    }

    // MARK: - Le second arrêt servi par les hôtes

    /// Les hôtes qui n'ont qu'un accent (post, story) dérivent leur second arrêt par
    /// la formule de palette du SDK — `secondary = hueShift(primary, +30°)`. Ce
    /// témoin fige l'équivalence : si `colorFor(context:)` changeait de formule, les
    /// composers de post et de story serviraient un dégradé étranger à la palette de
    /// leur hôte, sans qu'aucune vue ne rougisse.
    func test_hostSecondStop_matchesTheSdkPaletteFormula() {
        let palette = DynamicColorGenerator.colorFor(
            context: ConversationContext(name: "Prisme", type: .group, language: .french, theme: .work, memberCount: 8)
        )
        XCTAssertEqual(palette.secondary, DynamicColorGenerator.hueShiftedHex(palette.primary, degrees: 30))
    }
}
