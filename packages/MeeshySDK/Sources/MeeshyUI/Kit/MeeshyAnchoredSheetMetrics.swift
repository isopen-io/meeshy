import SwiftUI

/// **La hauteur d'une feuille ancrée** (K15) : épouse son contenu, prend une
/// fraction fixe de la place disponible, ou repose sur l'un de plusieurs crans.
///
/// Toute hauteur est plafonnée par `MeeshyAnchoredSheetMetrics.ceiling` : jamais
/// plus de 62 % de la place, et au moins 120 pt gardés au-dessus d'elle.
public nonisolated enum MeeshyAnchoredSheetHeight: Sendable, Equatable {
    /// Épouse le contenu, plafonnée.
    case content
    /// Une part de la place disponible (0…1), plafonnée.
    case fraction(CGFloat)
    /// Des parts ordonnées de la place disponible ; `initial` est l'indice du cran d'ouverture.
    case detents([CGFloat], initial: Int)

    public static let compact = MeeshyAnchoredSheetHeight.fraction(MeeshyAnchoredSheetMetrics.compactFraction)
    public static let regular = MeeshyAnchoredSheetHeight.fraction(MeeshyAnchoredSheetMetrics.regularFraction)
    public static let tall = MeeshyAnchoredSheetHeight.fraction(MeeshyAnchoredSheetMetrics.maximumFraction)
}

/// Le matériau d'une feuille ancrée : celui du thème, ou l'indigo sombre forcé du composer.
public nonisolated enum MeeshyAnchoredSheetSurface: String, Sendable, Equatable, CaseIterable {
    case theme
    case dark
}

/// Ce que devient un toucher hors de la feuille : il la ferme, ou il traverse jusqu'à l'hôte.
public nonisolated enum MeeshyAnchoredSheetOutside: String, Sendable, Equatable, CaseIterable {
    case dismisses
    case passesThrough
}

/// Où une feuille se pose au relâcher d'un glissé.
public nonisolated enum MeeshyAnchoredSheetSettlement: Sendable, Equatable {
    case dismiss
    case rest(index: Int)
}

/// Le mouvement d'entrée, de sortie et de retour. « Réduire les animations » :
/// tout est immédiat, le doigt déplace toujours la feuille.
public nonisolated struct MeeshyAnchoredSheetMotion: Sendable, Equatable {
    public let isImmediate: Bool
    public let response: Double
    public let dampingFraction: Double
    public let durationMilliseconds: Int

    public var animation: Animation? {
        isImmediate ? nil : .spring(response: response, dampingFraction: dampingFraction)
    }
}

/// **Ce que la feuille montre autour de son contenu, et ce qu'elle dit au lecteur d'écran** (loi 13) :
/// aucune poignée sans glissé, aucune rangée d'en-tête sans titre ni fin d'en-tête, aucun ✕ quand la fin
/// d'en-tête le remplace ou que son nom est absent, aucun voile hors de la fermeture au toucher extérieur.
public nonisolated struct MeeshyAnchoredSheetChrome: Sendable, Equatable {
    public let showsHandle: Bool
    /// La poignée est un contrôle réglable (« Hauteur de la feuille ») : il faut des crans.
    public let handleIsAdjustable: Bool
    public let showsHeader: Bool
    public let showsClose: Bool
    public let showsScrim: Bool
    /// Un toucher hors de la feuille la ferme, et la feuille est une fenêtre modale.
    public let isModal: Bool

    public static func resolve(
        hasTitle: Bool,
        hasTrailing: Bool,
        hasCloseLabel: Bool,
        showsHandle: Bool,
        isDragDismissEnabled: Bool,
        hasDetents: Bool,
        outside: MeeshyAnchoredSheetOutside,
        scrim: Bool
    ) -> MeeshyAnchoredSheetChrome {
        let handle = showsHandle && isDragDismissEnabled
        let modal = outside == .dismisses
        return MeeshyAnchoredSheetChrome(
            showsHandle: handle,
            handleIsAdjustable: handle && hasDetents,
            showsHeader: hasTitle || hasTrailing,
            showsClose: hasTitle && !hasTrailing && hasCloseLabel,
            showsScrim: scrim && modal,
            isModal: modal
        )
    }
}

/// **La loi pure d'une feuille ancrée, lue par les trois plateformes** (K15) : hauteurs,
/// plafond, fermeture au glissé, crans, place publiée et mouvement.
///
/// Toute valeur propre vit ici et nulle part ailleurs. Les vecteurs de parité
/// (`K15-MeeshyAnchoredSheet.vectors.json`) la fixent pour iOS, Android et le web.
public nonisolated enum MeeshyAnchoredSheetMetrics {

    public static let compactFraction: CGFloat = 0.30
    public static let regularFraction: CGFloat = 0.50
    public static let maximumFraction: CGFloat = 0.62
    /// Ce que la feuille laisse toujours visible au-dessus d'elle.
    public static let reservedAbove: CGFloat = 120

    /// Le quart de sa hauteur, ou la moitié prédite : au-delà, un glissé ferme.
    public static let dismissTranslationFraction: CGFloat = 0.25
    public static let dismissPredictedFraction: CGFloat = 0.5

    public static let handleWidth: CGFloat = 36
    public static let handleHeight: CGFloat = 5
    public static let handleOpacityDark: Double = 0.35
    public static let handleOpacityTheme: Double = 0.5
    public static let shadowRadius: CGFloat = 15
    public static let shadowYOffset: CGFloat = -12
    public static let shadowOpacity: Double = 0.4
    public static let scrimOpacity: Double = 0.4

    public static let springResponse: Double = 0.32
    public static let springDamping: Double = 0.88
    public static let durationMilliseconds = 280

    // MARK: - Hauteur

    /// Le plafond : `maximumFraction` de la place, en gardant `reservedAbove` au-dessus. Jamais négatif.
    public static func ceiling(available: CGFloat, maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction) -> CGFloat {
        guard available.isFinite, available > 0 else { return 0 }
        return max(0, min(available * max(0, maximumFraction), available - reservedAbove))
    }

    /// La hauteur AU REPOS de la feuille : celle du cran initial pour des crans.
    public static func height(
        _ height: MeeshyAnchoredSheetHeight,
        content: CGFloat,
        available: CGFloat,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction
    ) -> CGFloat {
        let cap = ceiling(available: available, maximumFraction: maximumFraction)
        switch height {
        case .content:
            guard content.isFinite else { return cap }
            return min(max(0, content), cap)
        case .fraction(let part):
            return clamped(part, available: available, cap: cap)
        case .detents(let parts, let initial):
            let rests = detentHeights(parts, available: available, maximumFraction: maximumFraction)
            guard !rests.isEmpty else { return 0 }
            return rests[min(initialDetentIndex(parts, initial: initial), rests.count - 1)]
        }
    }

    /// Les hauteurs des crans, ordonnées de la plus basse à la plus haute.
    public static func detentHeights(
        _ parts: [CGFloat],
        available: CGFloat,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction
    ) -> [CGFloat] {
        let cap = ceiling(available: available, maximumFraction: maximumFraction)
        return parts.map { clamped($0, available: available, cap: cap) }.sorted()
    }

    /// L'indice du cran d'ouverture dans la liste ORDONNÉE des crans.
    public static func initialDetentIndex(_ parts: [CGFloat], initial: Int) -> Int {
        guard !parts.isEmpty else { return 0 }
        let wanted = parts[min(max(0, initial), parts.count - 1)]
        return parts.sorted().firstIndex(of: wanted) ?? 0
    }

    private static func clamped(_ part: CGFloat, available: CGFloat, cap: CGFloat) -> CGFloat {
        guard available.isFinite, available > 0, part.isFinite else { return 0 }
        return min(max(0, available * part), cap)
    }

    // MARK: - Glissé

    /// Le glissé ferme au quart de la hauteur parcourue, ou si sa fin prédite passe la moitié.
    public static func dismisses(translation: CGFloat, predictedEnd: CGFloat, height: CGFloat) -> Bool {
        guard height > 0 else { return translation > 0 }
        return translation > height * dismissTranslationFraction || predictedEnd > height * dismissPredictedFraction
    }

    /// Le décalage que suit le doigt : jamais au-dessus du repos, sauf `upwardRoom`
    /// (la place qu'un cran plus haut offre au-dessus).
    public static func dragOffset(_ translation: CGFloat, upwardRoom: CGFloat = 0) -> CGFloat {
        max(-max(0, upwardRoom), translation)
    }

    /// Le relâcher : sous le cran le plus bas, la loi de fermeture s'applique ; sinon
    /// la feuille repose sur le cran le plus proche de l'endroit que la vitesse désigne.
    public static func settle(
        translation: CGFloat,
        predictedEnd: CGFloat,
        currentIndex: Int,
        rests: [CGFloat]
    ) -> MeeshyAnchoredSheetSettlement {
        guard let lowest = rests.first else { return .dismiss }
        let index = min(max(0, currentIndex), rests.count - 1)
        let gap = rests[index] - lowest
        let below = translation - gap
        if below > 0, dismisses(translation: below, predictedEnd: predictedEnd - gap, height: lowest) {
            return .dismiss
        }
        let target = rests[index] - predictedEnd
        return .rest(index: nearest(to: target, in: rests))
    }

    private static func nearest(to target: CGFloat, in rests: [CGFloat]) -> Int {
        rests.indices.min { abs(rests[$0] - target) < abs(rests[$1] - target) } ?? 0
    }

    // MARK: - Place publiée

    /// Le haut de la feuille AU REPOS, hors glissé : l'hôte ne se recadre pas à chaque image du doigt.
    public static func restingTop(containerMaxY: CGFloat, height: CGFloat) -> CGFloat {
        containerMaxY - height
    }

    // MARK: - Mouvement

    public static func motion(reduceMotion: Bool) -> MeeshyAnchoredSheetMotion {
        MeeshyAnchoredSheetMotion(
            isImmediate: reduceMotion,
            response: springResponse,
            dampingFraction: springDamping,
            durationMilliseconds: reduceMotion ? 0 : durationMilliseconds
        )
    }

    // MARK: - Encre

    /// La valeur dite de la poignée à crans : « agrandie » sur le cran le plus haut, « réduite » sinon.
    public static func isExpanded(detentIndex: Int, detentCount: Int) -> Bool {
        detentCount > 1 && detentIndex >= detentCount - 1
    }

    public static func handleOpacity(surface: MeeshyAnchoredSheetSurface) -> Double {
        surface == .dark ? handleOpacityDark : handleOpacityTheme
    }
}
