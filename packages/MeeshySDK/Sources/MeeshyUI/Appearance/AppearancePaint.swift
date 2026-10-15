import SwiftUI
import MeeshySDK

// MARK: - La palette d'un modèle, résolue (#10631, spec § 5.1)
//
// Les rôles (`ink`, `accent`, `accent-next`, `accent-prev`, `soft`, `base`) se
// résolvent par la palette du schéma ; `accent` est l'accent EFFECTIF du
// lecteur, `accent-next` / `accent-prev` cet accent tourné de ±30° (la
// dérivation de `conversationAccentPalette`, miroir de `hueShiftedHex`).

enum AppearancePaint {

    /// `#RRGGBB` d'un rôle pour un modèle, un schéma et l'accent effectif du lecteur.
    static func hex(_ role: AppearancePaintRole, palette: AppearanceDesignPalette, accentHex: String) -> String {
        let effective = palette.accent ?? normalizedAccent(accentHex)
        switch role {
        case .ink: return palette.ink
        case .soft: return palette.soft
        case .base: return palette.base
        case .accent: return effective
        case .accentNext: return DynamicColorGenerator.hueShiftedHex(effective, degrees: 30)
        case .accentPrev: return DynamicColorGenerator.hueShiftedHex(effective, degrees: -30)
        }
    }

    /// Indigo Meeshy si l'accent n'est pas un `#RRGGBB` : rien de non validé n'est peint.
    static func normalizedAccent(_ hex: String) -> String {
        let trimmed = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard trimmed.count == 6, trimmed.allSatisfy(\.isHexDigit) else { return "#6366F1" }
        return "#" + trimmed.uppercased()
    }

    static func color(_ role: AppearancePaintRole, palette: AppearanceDesignPalette, accentHex: String) -> Color {
        Color(hex: hex(role, palette: palette, accentHex: accentHex))
    }
}
