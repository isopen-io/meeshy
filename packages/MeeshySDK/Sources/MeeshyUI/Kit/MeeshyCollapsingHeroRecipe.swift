import Foundation

/// Où se range l'identité d'un héros : au début sous la bannière, au centre, ou
/// avatar et titre sur une même ligne (un héros bas : feuille, colonne de tablette).
public nonisolated enum MeeshyCollapsingHeroAlignment: String, Sendable, Equatable, CaseIterable {
    case leading
    case center
    case compact
}

/// **La recette de K28 en VALEURS** : un seul nombre, `progress`, de 0 à 1, mène la
/// hauteur, l'avatar, le titre, la bannière et le verre. Aucune vue, aucune
/// couleur, aucun type du domaine : l'hôte donne des tailles, la recette rend des
/// tailles.
///
/// Les lois : hauteur = déplié − (déplié − replié) × progress ; l'avatar et le
/// titre finissent à 55 % ; la bannière s'efface de 0 à 50 %, le verre apparaît
/// de 50 à 100 % ; l'identité passe dans la barre au-delà de 50 %.
public nonisolated struct MeeshyCollapsingHeroRecipe: Sendable, Equatable {

    public static let expandedHeight: Double = 318
    public static let collapsedHeight: Double = 96
    public static let identityOverflow: Double = 132
    public static let finishShare: Double = 0.55
    public static let handoverShare: Double = 0.5
    public static let discFadeShare: Double = 0.7
    public static let titleRiseEnd: Double = 0.7
    public static let avatarExpanded: Double = 112
    public static let avatarCollapsed: Double = 36
    public static let titleExpanded: Double = 36
    public static let titleCollapsed: Double = 17
    public static let subtitleExpanded: Double = 15
    public static let subtitleCollapsed: Double = 12
    public static let controlInsetExpanded: Double = 16
    public static let controlInsetCollapsed: Double = 12
    public static let barCornerRadius: Double = 28
    public static let controlTarget: Double = 44

    public let height: Double
    public let bannerStretch: Double
    public let avatarSize: Double
    public let titleSize: Double
    public let subtitleSize: Double
    public let bannerOpacity: Double
    public let glassOpacity: Double
    public let controlsDiscOpacity: Double
    public let titleRise: Double
    public let controlSize: Double
    public let controlShift: Double
    public let barOwnsIdentity: Bool
    public let isPinned: Bool
    public let alignment: MeeshyCollapsingHeroAlignment

    public static func resolve(
        progress: Double,
        expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight,
        collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight,
        alignment: MeeshyCollapsingHeroAlignment = .leading,
        hasAvatar: Bool = true,
        hasSubtitle: Bool = true,
        overscroll: Double = 0
    ) -> MeeshyCollapsingHeroRecipe {
        let raw = progress.isFinite ? progress : 0
        let share = clamp01(progress)
        let travel = min(share / finishShare, 1)
        let distance = scrollDistance(expandedHeight: expandedHeight, collapsedHeight: collapsedHeight)
        let pulled = max(max(overscroll.isFinite ? overscroll : 0, 0), raw < 0 ? -raw * distance : 0)
        return MeeshyCollapsingHeroRecipe(
            height: expandedHeight - (expandedHeight - collapsedHeight) * share,
            bannerStretch: pulled,
            avatarSize: hasAvatar ? lerp(avatarExpanded, avatarCollapsed, travel) : 0,
            titleSize: lerp(titleExpanded, titleCollapsed, travel),
            subtitleSize: hasSubtitle ? lerp(subtitleExpanded, subtitleCollapsed, travel) : 0,
            bannerOpacity: clamp01((1 - share) / handoverShare),
            glassOpacity: clamp01((share - handoverShare) / (1 - handoverShare)),
            controlsDiscOpacity: clamp01(1 - share / discFadeShare),
            titleRise: clamp01((share - handoverShare) / (titleRiseEnd - handoverShare)),
            controlSize: controlTarget,
            controlShift: controlInsetExpanded - lerp(controlInsetExpanded, controlInsetCollapsed, travel),
            barOwnsIdentity: share > handoverShare,
            isPinned: share >= 1,
            alignment: alignment
        )
    }

    /// La distance de défilement : le héros déplié occupe 450, la barre 96.
    public static func scrollDistance(
        expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight,
        collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight
    ) -> Double {
        expandedHeight + identityOverflow - collapsedHeight
    }

    /// L'avancée du doigt, ramenée en `progress` : le défilement divisé par la distance.
    public static func progress(offset: Double, expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight,
                                collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight) -> Double {
        guard offset.isFinite else { return 0 }
        let distance = scrollDistance(expandedHeight: expandedHeight, collapsedHeight: collapsedHeight)
        return distance > 0 ? offset / distance : 0
    }

    /// `progress` borné de 0 à 1 ; un non-nombre vaut 0.
    public static func clamped(_ progress: Double) -> Double {
        clamp01(progress)
    }

    private static func clamp01(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return min(max(value, 0), 1)
    }

    private static func lerp(_ from: Double, _ to: Double, _ share: Double) -> Double {
        from + (to - from) * share
    }
}
