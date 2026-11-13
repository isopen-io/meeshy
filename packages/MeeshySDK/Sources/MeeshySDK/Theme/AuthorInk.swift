import Foundation

/// #17863 — la couleur d'un auteur rendue LISIBLE (4,5:1) sur ce que le fil peint sous elle : telle quelle
/// quand elle l'est déjà, sinon rapprochée de l'encre du thème du plus PETIT pas qui tient le contraste.
/// Miroir Swift pur de `legibleTint` / `authorInk` (`apps/web/src/lib/view/author-ink.ts`) : mêmes fonds,
/// même pas, même résultat — une couleur d'auteur, une seule façon de la rendre lisible.
/// `DynamicColorGenerator.adaptedColor` (plancher de luminosité, sans mesure) reste celui des autres sites.
public enum AuthorInk {
    private struct BackdropStop {
        let base: String
        let tint: Double
    }

    /// Les fonds d'un schéma : la surface et la carte, puis CHAQUE arrêt du fond du fil
    /// (`ConversationAnimatedBackground.baseGradient`) teinté par l'accent au pire, seul puis sous la
    /// lueur d'accent prise au pire (blanc en sombre, noir en clair). Mesurer contre le pire accent rend
    /// la teinte indépendante de la conversation : le journal se pose dans un verre translucide sur ce fond.
    private struct Scheme {
        let surface: String
        let card: String
        let ink: String
        let worstAccent: String
        let backdropStops: [BackdropStop]
        let glow: Double

        var backgrounds: [String] {
            let stops = backdropStops.map { AuthorInk.mix($0.base, worstAccent, $0.tint) }
            return [surface, card] + stops + stops.map { AuthorInk.mix($0, worstAccent, glow) }
        }
    }

    private static let dark = Scheme(
        surface: "09090B", card: "13111C", ink: "EEF2FF", worstAccent: "FFFFFF",
        backdropStops: [
            BackdropStop(base: "0F0C29", tint: 0),
            BackdropStop(base: "0F0C29", tint: 0.12),
            BackdropStop(base: "24243E", tint: 0),
        ],
        glow: 0.12
    )
    private static let light = Scheme(
        surface: "FFFFFF", card: "F8F7FF", ink: "1E1B4B", worstAccent: "000000",
        backdropStops: [
            BackdropStop(base: "FFFFFF", tint: 0.08),
            BackdropStop(base: "FFFFFF", tint: 0),
            BackdropStop(base: "FFFFFF", tint: 0.05),
        ],
        glow: 0.07
    )
    private static let darkBackgrounds = dark.backgrounds
    private static let lightBackgrounds = light.backgrounds
    private static let minimumContrast = 4.5
    private static let step = 0.04

    /// `hex` (avec ou sans dièse) lisible sur les fonds de `mode`, en hex nu majuscule.
    public static func hex(_ hex: String, for mode: ThemeMode) -> String {
        let ink = mode.isDark ? dark.ink : light.ink
        let measured = backgrounds(for: mode)
        let tint = DynamicColorGenerator.bareHex(hex)
        let steps = (0...Int((1 / step).rounded(.up))).map { min(1, Double($0) * step) }
        return steps
            .map { mix(tint, ink, $0) }
            .first { isLegible($0, on: measured) } ?? ink
    }

    static func backgrounds(for mode: ThemeMode) -> [String] {
        mode.isDark ? darkBackgrounds : lightBackgrounds
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
