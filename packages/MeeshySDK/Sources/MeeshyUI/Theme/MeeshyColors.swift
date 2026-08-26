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

    // MARK: - Plateau du composer (O6)
    //
    // Les deux teintes que la rampe indigo ne couvrait pas. Le plateau du
    // composer est un fond CHOISI par l'auteur, et un fond choisi doit rester
    // un jeton : un `Color.black` local dans la vue échapperait au design
    // system et aux mesures de contraste qui le gardent lisible.
    //
    // `violet950` vient de la même provenance que la rampe indigo (Tailwind),
    // pour que les trois teintes se lisent comme une famille et non comme trois
    // décisions séparées.

    public static let plateauNoir = Color(hex: "000000")
    public static let violet950 = Color(hex: "2E1065")

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
    public static let indigo50Hex = "EEF2FF"
    public static let indigo300Hex = "A5B4FC"
    public static let indigo400Hex = "818CF8"
    public static let indigo600Hex = "4F46E5"
    public static let indigo900Hex = "312E81"
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

    /// D-18 (2026-08-18, soldée) — `indigo500.opacity(0.4)`/`indigo400.opacity(0.5)`
    /// (valeurs d'origine) mesuraient **1,67:1 en clair et 2,46:1 en sombre**
    /// contre `backgroundSecondary`/le fond ambiant (composition alpha PUIS
    /// luminance WCAG, même loi que Q142-a) — les DEUX thèmes étaient sous
    /// AA texte normal (4,5:1), pas seulement le clair consigné par le
    /// finding initial (la mesure prime : le sombre a été re-mesuré rouge
    /// ici, D-18 corrigé en conséquence). Assombri/opacifié au cran minimal
    /// qui passe, dans la MÊME famille indigo (jamais un gris neutre) :
    /// `indigo700.opacity(0.8)` clair (**4,76:1** sur `backgroundSecondary`
    /// `#F8F7FF`, **4,60:1** sur `backgroundTertiary` `#EEF2FF` — les deux
    /// fonds clairs déclarés les plus sombres du thème) et
    /// `indigo300.opacity(0.7)` sombre (**5,13:1** sur `backgroundSecondary`
    /// `#13111C`, **4,65:1** sur `backgroundTertiary` `#1E1B4B` — le fond
    /// sombre déclaré le plus clair, donc le pire cas pour du texte clair).
    /// Verrouillé par `TextMutedContrastAATests` (`MeeshyTests`).
    public static func textMuted(isDark: Bool) -> Color {
        isDark ? indigo300.opacity(0.7) : indigo700.opacity(0.8)
    }

    /// Fond PRIMAIRE de l'app — le blanc/noir sur lequel les écrans plats
    /// posent leur contenu. Il vivait uniquement en propriété d'instance de
    /// `ThemeManager` (qui délègue désormais ici, comme il le fait déjà pour
    /// `backgroundSecondary`) : une vue sans accès au thème observé, mais qui
    /// connaît son `isDark`, ne pouvait pas le nommer sans recopier les deux
    /// hexadécimaux.
    public static func backgroundPrimary(isDark: Bool) -> Color {
        isDark ? Color(hex: "09090B") : Color(hex: "FFFFFF")
    }

    public static func backgroundSecondary(isDark: Bool) -> Color {
        isDark ? Color(hex: "13111C") : Color(hex: "F8F7FF")
    }

    // MARK: - Inline Entity Tints (@mention / #hashtag)
    //
    // Teintes des entités inline rendues par `MessageTextRenderer` — mêmes
    // valeurs partout (bulles, posts, commentaires, reels, moods) pour que
    // « une mention » ait UNE identité visuelle dans tout le produit.
    //
    // Elles sont THÉMATISÉES : la teinte unique historique (`indigo400`,
    // `#818CF8`) ne contraste qu'à 2.98:1 sur le fond clair `#FFFFFF` — sous le
    // seuil WCAG AA (4.5:1). Chaque variante ci-dessous passe AA dans SON mode
    // (le `.system` du réglage de thème est déjà résolu en light/dark par
    // `ThemeManager.mode` / `colorScheme` chez l'appelant — pas de 3e branche).

    /// Teinte d'une mention `@user` — lien tappable, la plus prononcée des deux.
    /// Light : `indigo600` (6.3:1 sur `#FFFFFF`). Dark : `indigo300` (9.9:1 sur `#09090B`).
    public static func mentionColor(isDark: Bool) -> Color {
        isDark ? indigo300 : indigo600
    }

    /// Teinte d'un hashtag `#tag` — décoratif (non tappable), volontairement un
    /// cran plus sourd que la mention pour rester distinguable d'elle ET du
    /// lien d'accent, sans quitter la rampe indigo de marque.
    /// Light : `indigo800` (9.9:1 sur `#FFFFFF`). Dark : `indigo400` (6.6:1 sur `#09090B`).
    public static func hashtagColor(isDark: Bool) -> Color {
        isDark ? indigo400 : indigo800
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
