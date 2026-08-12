import XCTest
import SwiftUI
@testable import MeeshyUI

/// Couleurs adaptatives des entités inline (`@mention`, `#hashtag`).
///
/// Le bug d'origine : la seule teinte de mention du produit était un hex FIXE
/// (`MeeshyColors.indigo400` / `#818CF8`) — 2.98:1 sur fond clair, donc sous le
/// seuil WCAG AA (4.5:1). Ces gardes ancrent la lisibilité dans LES DEUX modes
/// et la distinction mention ≠ hashtag.
final class MentionHashtagColorTests: XCTestCase {

    /// Fonds canoniques de `ThemeManager` (`backgroundPrimary`).
    private let lightBackground = Color(hex: "FFFFFF")
    private let darkBackground = Color(hex: "09090B")

    /// Ratio de contraste WCAG 2.x entre deux couleurs.
    private func contrast(_ a: Color, _ b: Color) -> CGFloat {
        let la = a.luminance, lb = b.luminance
        let lighter = max(la, lb), darker = min(la, lb)
        return (lighter + 0.05) / (darker + 0.05)
    }

    // MARK: - Lisibilité (WCAG AA, 4.5:1 texte normal)

    func test_mentionColor_light_meetsWCAGAAOnLightBackground() {
        XCTAssertGreaterThanOrEqual(
            contrast(MeeshyColors.mentionColor(isDark: false), lightBackground), 4.5,
            "La mention doit rester lisible sur le fond clair de l'app."
        )
    }

    func test_mentionColor_dark_meetsWCAGAAOnDarkBackground() {
        XCTAssertGreaterThanOrEqual(
            contrast(MeeshyColors.mentionColor(isDark: true), darkBackground), 4.5
        )
    }

    func test_hashtagColor_light_meetsWCAGAAOnLightBackground() {
        XCTAssertGreaterThanOrEqual(
            contrast(MeeshyColors.hashtagColor(isDark: false), lightBackground), 4.5
        )
    }

    func test_hashtagColor_dark_meetsWCAGAAOnDarkBackground() {
        XCTAssertGreaterThanOrEqual(
            contrast(MeeshyColors.hashtagColor(isDark: true), darkBackground), 4.5
        )
    }

    // MARK: - Adaptativité (la régression corrigée)

    func test_mentionColor_differsBetweenLightAndDark() {
        XCTAssertNotEqual(
            MeeshyColors.mentionColor(isDark: false),
            MeeshyColors.mentionColor(isDark: true),
            "Une teinte identique en light/dark = le bug indigo400 figé."
        )
    }

    func test_hashtagColor_differsBetweenLightAndDark() {
        XCTAssertNotEqual(
            MeeshyColors.hashtagColor(isDark: false),
            MeeshyColors.hashtagColor(isDark: true)
        )
    }

    func test_legacyFixedIndigo400_failsLightContrast_soItCannotBeTheLightMention() {
        // Garde négative : documente POURQUOI la teinte figée devait bouger.
        XCTAssertLessThan(contrast(MeeshyColors.indigo400, lightBackground), 4.5)
        XCTAssertNotEqual(MeeshyColors.mentionColor(isDark: false), MeeshyColors.indigo400)
    }

    // MARK: - Distinction mention ≠ hashtag

    func test_mentionAndHashtag_areDistinctInLightMode() {
        XCTAssertNotEqual(
            MeeshyColors.mentionColor(isDark: false),
            MeeshyColors.hashtagColor(isDark: false)
        )
    }

    func test_mentionAndHashtag_areDistinctInDarkMode() {
        XCTAssertNotEqual(
            MeeshyColors.mentionColor(isDark: true),
            MeeshyColors.hashtagColor(isDark: true)
        )
    }

    func test_mentionAndHashtag_haveSeparableLuminance() {
        // Distinction perceptible, pas seulement une inégalité d'octets :
        // au moins un pas franc de la rampe indigo dans chaque mode.
        let lightGap = abs(MeeshyColors.mentionColor(isDark: false).luminance
                           - MeeshyColors.hashtagColor(isDark: false).luminance)
        let darkGap = abs(MeeshyColors.mentionColor(isDark: true).luminance
                          - MeeshyColors.hashtagColor(isDark: true).luminance)
        XCTAssertGreaterThan(lightGap, 0.03)
        XCTAssertGreaterThan(darkGap, 0.10)
    }

    // MARK: - Famille de marque

    func test_bothColors_stayWithinBrandIndigoScale() {
        let indigoScale: [Color] = [
            MeeshyColors.indigo300, MeeshyColors.indigo400, MeeshyColors.indigo500,
            MeeshyColors.indigo600, MeeshyColors.indigo700, MeeshyColors.indigo800
        ]
        for color in [
            MeeshyColors.mentionColor(isDark: false), MeeshyColors.mentionColor(isDark: true),
            MeeshyColors.hashtagColor(isDark: false), MeeshyColors.hashtagColor(isDark: true)
        ] {
            XCTAssertTrue(indigoScale.contains(color), "Teinte hors rampe indigo de marque.")
        }
    }
}
