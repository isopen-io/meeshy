import Foundation

/// #17863 — la couleur d'un auteur rendue LISIBLE (4,5:1) sur la carte du thème : telle quelle quand
/// elle l'est déjà, sinon rapprochée de l'encre du thème du plus PETIT pas qui tient le contraste.
/// Miroir Swift pur de `legibleTint` / `authorInk` (`apps/web/src/lib/view/author-ink.ts`) : une couleur
/// d'auteur, une seule façon de la rendre lisible. `DynamicColorGenerator.adaptedColor` (plancher de
/// luminosité, sans mesure) reste celui des autres sites.
public enum AuthorInk {
    private struct Scheme {
        let backgrounds: [String]
        let ink: String
    }

    private static let dark = Scheme(backgrounds: ["09090B", "13111C"], ink: "EEF2FF")
    private static let light = Scheme(backgrounds: ["FFFFFF", "F8F7FF"], ink: "1E1B4B")
    private static let minimumContrast = 4.5
    private static let step = 0.04

    /// `hex` (avec ou sans dièse) lisible sur la carte de `mode`, en hex nu majuscule.
    public static func hex(_ hex: String, for mode: ThemeMode) -> String {
        let scheme = mode.isDark ? dark : light
        let tint = DynamicColorGenerator.bareHex(hex)
        let steps = (0...Int((1 / step).rounded(.up))).map { min(1, Double($0) * step) }
        return steps
            .map { mix(tint, scheme.ink, $0) }
            .first { isLegible($0, on: scheme.backgrounds) } ?? scheme.ink
    }

    private static func isLegible(_ hex: String, on backgrounds: [String]) -> Bool {
        backgrounds.allSatisfy { contrast(hex, $0) >= minimumContrast }
    }

    private static func channels(_ hex: String) -> [Double] {
        let value = UInt32(hex, radix: 16) ?? 0
        return [16, 8, 0].map { Double((value >> $0) & 0xFF) }
    }

    private static func mix(_ from: String, _ to: String, _ t: Double) -> String {
        let a = channels(from), b = channels(to)
        let mixed = (0..<3).map { Int((a[$0] + (b[$0] - a[$0]) * t).rounded()) }
        return String(format: "%02X%02X%02X", mixed[0], mixed[1], mixed[2])
    }

    private static func luminance(_ hex: String) -> Double {
        let linear = channels(hex).map { c -> Double in
            let s = c / 255
            return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }

    private static func contrast(_ a: String, _ b: String) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }
}
