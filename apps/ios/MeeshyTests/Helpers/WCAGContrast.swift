import XCTest
import SwiftUI
import UIKit

/// Mesure de contraste WCAG 2.1, partagée par les suites de palette.
///
/// Ces suites ne comparent pas des `Color` entre elles — l'égalité structurelle
/// de SwiftUI ne dit rien du pixel produit, et un test d'égalité peut virer au
/// vert par accident. Elles mesurent la grandeur que le défaut viole réellement :
/// le rapport de contraste, après composition alpha, entre ce qui est écrit et
/// ce sur quoi c'est écrit.
///
/// `@MainActor` délibérément : le bundle `MeeshyTests` est compilé en
/// `SWIFT_DEFAULT_ACTOR_ISOLATION: nonisolated` (sinon chaque `XCTestCase`
/// casse, cf. `project.yml`), mais les ponts `UIColor(_: Color)` sont
/// historiquement appelés depuis des classes de test `@MainActor`. Épingler
/// l'outillage au main actor reproduit exactement ce contexte d'appel plutôt
/// que d'en ouvrir un nouveau.
@MainActor
enum WCAGContrast {

    /// Seuil AA pour du texte de taille normale.
    static let aaThreshold: Double = 4.5

    /// Fond système d'une feuille en mode sombre (`systemBackground`, dark).
    static let darkSheetBase = Color(red: 28.0 / 255, green: 28.0 / 255, blue: 30.0 / 255)

    /// Idem en mode clair.
    static let lightSheetBase = Color.white

    static func rgba(_ color: Color) -> (r: Double, g: Double, b: Double, a: Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        _ = UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b), Double(a))
    }

    /// Composition alpha « source over » — ce que fait réellement le
    /// compositeur quand une couleur translucide est posée sur un fond opaque.
    static func composite(_ top: Color, over bottom: Color) -> Color {
        let t = rgba(top)
        let b = rgba(bottom)
        return Color(
            red: t.r * t.a + b.r * (1 - t.a),
            green: t.g * t.a + b.g * (1 - t.a),
            blue: t.b * t.a + b.b * (1 - t.a)
        )
    }

    /// Luminance relative WCAG 2.1.
    static func luminance(_ color: Color) -> Double {
        let c = rgba(color)
        func linear(_ channel: Double) -> Double {
            channel <= 0.03928 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
    }

    static func ratio(_ a: Color, _ b: Color) -> Double {
        let la = luminance(a)
        let lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// Contraste d'un texte translucide sur son fond : la couleur du texte doit
    /// d'abord être composée sur ce fond, sinon on mesure une couleur qui n'est
    /// affichée nulle part.
    static func ratioOfTranslucentForeground(_ foreground: Color, on background: Color) -> Double {
        ratio(composite(foreground, over: background), background)
    }

    static func fmt(_ value: Double) -> String {
        String(format: "%.2f", value)
    }

    /// Deux `Color` rendent-elles la même chose, à un pas de quantification
    /// 8 bits près ?
    static func rendersIdentically(_ lhs: Color, _ rhs: Color) -> Bool {
        let l = rgba(lhs)
        let r = rgba(rhs)
        let tolerance = 1.0 / 255
        return abs(l.r - r.r) < tolerance
            && abs(l.g - r.g) < tolerance
            && abs(l.b - r.b) < tolerance
            && abs(l.a - r.a) < tolerance
    }

    // MARK: - Assertions

    /// Les deux couleurs rendent-elles le même pixel ? Échoue canal par canal
    /// pour que le message dise lequel a bougé.
    ///
    /// Membre statique plutôt que fonction libre : quatre classes de test
    /// portent déjà leurs propres helpers privés, et un symbole global de même
    /// forme poserait une question d'ombrage là où il n'y en a pas besoin.
    static func assertSameRendering(
        _ produced: Color, _ expected: Color, _ label: String,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        let p = rgba(produced)
        let e = rgba(expected)
        let tolerance = 1.0 / 255
        XCTAssertEqual(p.r, e.r, accuracy: tolerance, "\(label) — rouge", file: file, line: line)
        XCTAssertEqual(p.g, e.g, accuracy: tolerance, "\(label) — vert", file: file, line: line)
        XCTAssertEqual(p.b, e.b, accuracy: tolerance, "\(label) — bleu", file: file, line: line)
        XCTAssertEqual(p.a, e.a, accuracy: tolerance, "\(label) — alpha", file: file, line: line)
    }
}
