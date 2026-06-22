import SwiftUI

public nonisolated struct MeeshyColors {

    // MARK: - Brand Indigo Scale

    public static let indigo50 = Color(hex: "EEF2FF")
    public static let indigo100 = Color(hex: "E0E7FF")
    public static let indigo200 = Color(hex: "C7D2FE")
    public static let indigo300 = Color(hex: "A5B4FC")
    public static let indigo400 = Color(hex: "818CF8")
    public static let indigo500 = Color(hex: "6366F1")
    public static let indigo600 = Color(hex: "4F46E5")
    public static let indigo700 = Color(hex: "4338CA")
    public static let indigo800 = Color(hex: "3730A3")
    public static let indigo900 = Color(hex: "312E81")
    public static let indigo950 = Color(hex: "1E1B4B")

    // MARK: - Additional Brand Accents

    public static let purple500 = Color(hex: "A855F7")
    public static let purple600 = Color(hex: "8B5CF6")
    public static let purple700 = Color(hex: "B24BF3")

    // MARK: - Semantic Aliases

    public static let brandPrimary = indigo500
    public static let brandDeep = indigo700
    
    // MARK: - Neutral Scale
    
    public static let neutral400 = Color(hex: "9CA3AF")
    public static let neutral500 = Color(hex: "6B7280")
    public static let neutral600 = Color(hex: "4B5563")

    // MARK: - Brand Hex Strings (for accentColor parameters)

    public static let brandPrimaryHex = "6366F1"
    public static let brandDeepHex = "4338CA"

    // MARK: - Semantic State Colors

    public static let success = Color(hex: "34D399")
    public static let error = Color(hex: "F87171")
    public static let warning = Color(hex: "FBBF24")
    public static let info = Color(hex: "60A5FA")
    public static let readReceipt = indigo400
    public static let pinnedBlue = Color(hex: "3B82F6")

    /// Variante sombre du rouge sémantique — fond du badge de non-lus en dark mode.
    public static let errorDark = Color(hex: "991B1B")

    // MARK: - Semantic Tonal Variants (gradient stops; Tailwind scale coherent with the 400-base semantics)

    /// red-300 — stop clair des gradients d'erreur.
    public static let errorSoft = Color(hex: "FCA5A5")
    /// red-500 — stop appuyé des gradients d'erreur (boutons).
    public static let errorStrong = Color(hex: "EF4444")
    /// emerald-500 — stop appuyé des gradients de succès.
    public static let successDeep = Color(hex: "10B981")

    // MARK: - Semantic Hex Strings (for tint parameters, e.g. ThemeManager.surfaceGradient)

    public static let successHex = "34D399"
    public static let errorHex = "F87171"
    public static let warningHex = "FBBF24"
    public static let infoHex = "60A5FA"
    public static let neutral500Hex = "6B7280"
    public static let indigo300Hex = "A5B4FC"
    public static let indigo400Hex = "818CF8"
    public static let indigo600Hex = "4F46E5"
    public static let purple500Hex = "A855F7"

    // MARK: - Feature Accents (link management surfaces: tracking, share, community)
    //
    // Each link surface keeps a distinct accent for differentiation, but every
    // accent resolves to the Indigo scale or a semantic color — no off-brand hex.

    public static let trackingAccent = indigo600
    public static let trackingAccentHex = "4F46E5"
    public static let shareAccent = indigo400
    public static let shareAccentHex = "818CF8"
    public static let communityAccent = warning
    public static let communityAccentHex = warningHex

    /// Fond du badge de compteur de messages non lus, thématisé.
    /// Light : rouge vif (`error`). Dark : rouge foncé (`errorDark`).
    public static func unreadBadgeBackground(isDark: Bool) -> Color {
        isDark ? errorDark : error
    }

    // MARK: - Theme-Aware Text & Surface Tokens
    //
    // Miroirs statiques des tokens canoniques de ThemeManager, pour les leaf
    // views qui reçoivent `isDark: Bool` en primitive (règle Zero Unnecessary
    // Re-render : pas d'@ObservedObject sur un singleton dans une cellule de
    // liste). ThemeManager délègue à ces fonctions — les valeurs n'existent
    // qu'ici.

    public static func textPrimary(isDark: Bool) -> Color {
        isDark ? indigo50 : indigo950
    }

    public static func textSecondary(isDark: Bool) -> Color {
        isDark ? indigo300 : indigo700.opacity(0.6)
    }

    public static func textMuted(isDark: Bool) -> Color {
        isDark ? indigo400.opacity(0.5) : indigo500.opacity(0.4)
    }

    public static func backgroundSecondary(isDark: Bool) -> Color {
        isDark ? Color(hex: "13111C") : Color(hex: "F8F7FF")
    }

    // MARK: - Brand Gradient (The Signature)

    public static let brandGradient = LinearGradient(
        colors: [indigo500, indigo700],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let brandGradientLight = LinearGradient(
        colors: [indigo400, indigo500],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let brandGradientSubtle = LinearGradient(
        colors: [indigo300.opacity(0.3), indigo500.opacity(0.3)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let avatarRingGradient = LinearGradient(
        colors: [indigo500, indigo400, indigo500],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let accentGradient = LinearGradient(
        colors: [indigo600, indigo500, indigo400],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    // MARK: - Theme-Aware Gradients

    public static func mainBackgroundGradient(isDark: Bool) -> LinearGradient {
        isDark ?
            LinearGradient(
                colors: [Color(hex: "09090B"), Color(hex: "13111C"), Color(hex: "1E1B4B")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ) :
            LinearGradient(
                colors: [Color(hex: "FFFFFF"), Color(hex: "F8F7FF"), Color(hex: "EEF2FF")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
    }

    public static func secondaryGradient(isDark: Bool) -> LinearGradient {
        isDark ?
            LinearGradient(
                colors: [indigo500.opacity(0.2), Color(hex: "13111C")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ) :
            LinearGradient(
                colors: [indigo100.opacity(0.5), Color(hex: "F8F7FF")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
    }

    public static func glassBorderGradient(isDark: Bool) -> LinearGradient {
        isDark ?
            LinearGradient(
                colors: [indigo400.opacity(0.3), indigo700.opacity(0.1)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ) :
            LinearGradient(
                colors: [indigo900.opacity(0.08), indigo700.opacity(0.03)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
    }

    // MARK: - Material

    public static let glassFill = Material.ultraThin

    // MARK: - Legacy Aliases (backward compatibility — migrate to Indigo scale)
    //
    // These map old color names to the new Indigo-based palette.
    // New code MUST use the Indigo scale (indigo50–indigo950) or semantic names.
    // These aliases will be removed in a future release.

    @available(*, deprecated, renamed: "indigo500")
    public static let pink = indigo500
    @available(*, deprecated, renamed: "error")
    public static let coral = error
    @available(*, deprecated, renamed: "indigo400")
    public static let cyan = indigo400
    @available(*, deprecated, renamed: "indigo600")
    public static let purple = indigo600
    @available(*, deprecated, renamed: "indigo900")
    public static let deepPurple = indigo900
    @available(*, deprecated, renamed: "indigo950")
    public static let darkBlue = indigo950
    @available(*, deprecated, renamed: "success")
    public static let green = success
    @available(*, deprecated, renamed: "warning")
    public static let orange = warning
    @available(*, deprecated, renamed: "indigo300")
    public static let teal = indigo300
    @available(*, deprecated, renamed: "info")
    public static let infoBlue = info

    @available(*, deprecated, renamed: "brandGradient")
    public static let primaryGradient = brandGradient
}
