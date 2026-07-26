import XCTest
import SwiftUI
import UIKit
import MeeshyUI
@testable import Meeshy

// MARK: - LinksHubPaletteTests
//
// Les cinq cartes de `LinksHubView` (bannière + 4 catégories) posaient leur
// surface avec `Color.white.opacity(0.05)` **sans condition**, alors que le
// fichier calculait déjà `isDark` (l.12) sans jamais s'en servir. En mode
// sombre c'est la bonne valeur ; en mode clair le fond de l'écran est
// `theme.backgroundGradient` = `#FFFFFF → #FAFAFF → #F8F7FF`, et poser du
// blanc translucide sur du blanc ne peint rien.
//
// Ces tests mesurent le contraste RÉEL (WCAG 2.1, formule officielle) après
// composition alpha, plutôt que de comparer des `Color` entre eux : c'est la
// grandeur que le défaut viole, et la seule qui ne puisse pas devenir verte
// par accident. Idiome et outillage repris de
// `StoryExportShareSheetPaletteTests` (219i).
//
// `@MainActor` : le target `Meeshy` a `SWIFT_DEFAULT_ACTOR_ISOLATION =
// MainActor` (SE-0466), donc `LinksHubPalette` y est main-actor-isolé.
@MainActor
final class LinksHubPaletteTests: XCTestCase {

    /// Les deux extrêmes du dégradé de fond en mode clair : le haut de l'écran
    /// est du blanc pur, le bas une lavande imperceptible.
    private let lightBackgroundTop = Color(red: 1, green: 1, blue: 1)
    private let lightBackgroundBottom = Color(red: 248.0 / 255, green: 247.0 / 255, blue: 255.0 / 255)

    /// Idem en mode sombre (`#09090B` → `#13111C`).
    private let darkBackgroundTop = Color(red: 9.0 / 255, green: 9.0 / 255, blue: 11.0 / 255)
    private let darkBackgroundBottom = Color(red: 19.0 / 255, green: 17.0 / 255, blue: 28.0 / 255)

    /// L'expression qui était codée en dur pour les deux modes.
    private let previousUnconditionalFill = Color.white.opacity(0.05)

    // MARK: - Le défaut

    /// Référence du défaut, reproduite explicitement ici pour que la divergence
    /// avant/après soit prouvée DANS le test, sans dépendre de l'historique git.
    func test_previousFill_renderedInLightMode_paintedNothing() {
        let surface = composite(previousUnconditionalFill, over: lightBackgroundTop)
        let ratio = contrastRatio(surface, lightBackgroundTop)

        XCTAssertLessThan(
            ratio, 1.01,
            "Référence du défaut : en haut de l'écran le fond est du blanc pur, et du blanc à 5 % " +
            "posé dessus donne \(fmt(ratio)):1 — la carte n'avait littéralement aucune surface."
        )
    }

    /// Même mesure au bas du dégradé, là où le fond n'est plus tout à fait
    /// blanc : le défaut ne dépend pas du point de mesure choisi.
    func test_previousFill_renderedAtTheBottomOfTheGradient_stillPaintedNothing() {
        let surface = composite(previousUnconditionalFill, over: lightBackgroundBottom)
        let ratio = contrastRatio(surface, lightBackgroundBottom)

        XCTAssertLessThan(
            ratio, 1.01,
            "Même au point le plus sombre du dégradé clair, l'ancien fond rendait \(fmt(ratio)):1."
        )
    }

    // MARK: - Le correctif

    func test_cardFill_inLightMode_paintsAnActualSurface() {
        let surface = composite(LinksHubPalette.cardFill(isDark: false), over: lightBackgroundTop)
        let ratio = contrastRatio(surface, lightBackgroundTop)

        XCTAssertGreaterThan(
            ratio, 1.05,
            "La carte doit se détacher de son fond en mode clair. Obtenu : \(fmt(ratio)):1."
        )
    }

    func test_cardFill_inLightMode_paintsAnActualSurfaceAtEveryGradientStop() {
        for (name, base) in [("haut", lightBackgroundTop), ("bas", lightBackgroundBottom)] {
            let surface = composite(LinksHubPalette.cardFill(isDark: false), over: base)
            let ratio = contrastRatio(surface, base)

            XCTAssertGreaterThan(
                ratio, 1.05,
                "La surface doit tenir sur tout le dégradé (\(name) : \(fmt(ratio)):1)."
            )
        }
    }

    // MARK: - Le mode sombre ne bouge pas d'un bit

    /// L'itération répare le mode clair ; elle ne re-règle pas le mode sombre.
    /// La branche sombre doit rendre, canal par canal, exactement l'expression
    /// d'origine — à un pas de quantification 8 bits près.
    func test_cardFill_inDarkMode_isBitIdenticalToThePreviousExpression() {
        let fixed = rgba(LinksHubPalette.cardFill(isDark: true))
        let previous = rgba(previousUnconditionalFill)

        XCTAssertEqual(fixed.r, previous.r, accuracy: 1.0 / 255)
        XCTAssertEqual(fixed.g, previous.g, accuracy: 1.0 / 255)
        XCTAssertEqual(fixed.b, previous.b, accuracy: 1.0 / 255)
        XCTAssertEqual(
            fixed.a, previous.a, accuracy: 1.0 / 255,
            "Le mode sombre était correct : la branche sombre doit rester l'expression d'origine."
        )
    }

    func test_cardFill_inDarkMode_stillLiftsTheCardOffItsBackground() {
        for (name, base) in [("haut", darkBackgroundTop), ("bas", darkBackgroundBottom)] {
            let surface = composite(LinksHubPalette.cardFill(isDark: true), over: base)
            let ratio = contrastRatio(surface, base)

            XCTAssertGreaterThan(
                ratio, 1.05,
                "Le lift sombre doit être préservé (\(name) : \(fmt(ratio)):1)."
            )
        }
    }

    // MARK: - Les deux modes divergent

    /// Ce qui manquait, très exactement : une valeur unique servait les deux
    /// modes. Si les deux branches redevenaient identiques, le défaut serait
    /// de retour et les tests de contraste ci-dessus ne le verraient pas tous.
    func test_cardFill_rendersDifferentlyInEachMode() {
        let light = rgba(LinksHubPalette.cardFill(isDark: false))
        let dark = rgba(LinksHubPalette.cardFill(isDark: true))
        let sameColour = abs(light.r - dark.r) < 1.0 / 255
            && abs(light.g - dark.g) < 1.0 / 255
            && abs(light.b - dark.b) < 1.0 / 255

        XCTAssertFalse(
            sameColour && abs(light.a - dark.a) < 1.0 / 255,
            "Les deux modes doivent diverger : une seule valeur pour les deux est précisément le défaut."
        )
    }

    // MARK: - Aucune surface du hub n'échappe au résolveur

    func test_linksHubDeclaresNoUnconditionalWhiteSurface() throws {
        let source = try String(
            contentsOf: appRoot.appendingPathComponent("Features/Main/Views/LinksHubView.swift"),
            encoding: .utf8
        )

        XCTAssertFalse(
            strippingComments(source).contains(".fill(Color.white.opacity("),
            "Toute surface du hub doit passer par LinksHubPalette.cardFill(isDark:) : un blanc " +
            "translucide inconditionnel est invisible sur le dégradé clair de l'app."
        )
    }

    // MARK: - Outillage

    /// `apps/ios/Meeshy` — quatre niveaux au-dessus de ce fichier, puis la cible.
    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    private func strippingComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func rgba(_ color: Color) -> (r: Double, g: Double, b: Double, a: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        _ = UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }

    /// Composition alpha « source over » — ce que fait réellement le compositeur
    /// quand un `fill` translucide est posé sur un fond opaque.
    private func composite(_ top: Color, over bottom: Color) -> Color {
        let t = rgba(top)
        let b = rgba(bottom)
        return Color(
            red: t.r * t.a + b.r * (1 - t.a),
            green: t.g * t.a + b.g * (1 - t.a),
            blue: t.b * t.a + b.b * (1 - t.a)
        )
    }

    /// Luminance relative WCAG 2.1 (linéarisation sRGB).
    private func relativeLuminance(_ color: Color) -> Double {
        let c = rgba(color)
        func channel(_ value: Double) -> Double {
            value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
    }

    private func contrastRatio(_ a: Color, _ b: Color) -> Double {
        let la = relativeLuminance(a)
        let lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private func fmt(_ value: Double) -> String {
        String(format: "%.3f", value)
    }
}
