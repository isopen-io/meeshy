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
/// de 50 à 100 % ; l'identité passe dans la barre au-delà de 50 %. Sous « Réduire les
/// animations », le doigt mène toujours la hauteur, mais l'identité ne glisse plus :
/// elle s'efface et reparaît à sa place au passage de main (un fondu). Un tic léger
/// marque l'épinglage, un seul par sens (`pinTick`).
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
    /// Le gabarit de l'identité au premier chargement (cache vide) : le nom et le pseudo en squelettes K38.
    public static let loadingTitleWidth: Double = 236
    public static let loadingTitleHeight: Double = 34
    public static let loadingTitleRadius: Double = 10
    public static let loadingSubtitleWidth: Double = 148
    /// Sous mouvement réduit, la part de l'avancée sur laquelle l'identité s'efface puis reparaît, de part et
    /// d'autre du passage de main.
    public static let reducedFadeShare: Double = 0.1

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
    /// Où en est le voyage de l'avatar et du titre, de 0 (sous la bannière) à 1 (dans la barre) ; sous mouvement
    /// réduit, 0 ou 1, jamais entre les deux.
    public let identityTravel: Double
    /// L'opacité de l'avatar et du titre : 1, sauf sous mouvement réduit autour du passage de main.
    public let identityOpacity: Double

    public static func resolve(
        progress: Double,
        expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight,
        collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight,
        alignment: MeeshyCollapsingHeroAlignment = .leading,
        hasAvatar: Bool = true,
        hasSubtitle: Bool = true,
        overscroll: Double = 0,
        reduceMotion: Bool = false
    ) -> MeeshyCollapsingHeroRecipe {
        let raw = progress.isFinite ? progress : 0
        let share = clamp01(progress)
        let travel = travelShare(share, reduceMotion: reduceMotion)
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
            alignment: alignment,
            identityTravel: travel,
            identityOpacity: reduceMotion ? clamp01(abs(share - handoverShare) / reducedFadeShare) : 1
        )
    }

    /// La bannière d'un héros qui la GARDE dans sa barre (fiche de profil, #19780) : pleine tout du long ; c'est le
    /// verre qui arrive par-dessus et la floute. Sinon, l'effacement de la loi (de 0 à 50 %).
    public static func bannerOpacity(_ recipe: MeeshyCollapsingHeroRecipe, keepsBannerInBar: Bool) -> Double {
        keepsBannerInBar ? 1 : recipe.bannerOpacity
    }

    /// Les coins bas de la bannière gardée : droits dépliée, ceux de la barre une fois le verre posé ; toujours
    /// droits pour une bannière qui s'efface.
    public static func bannerCornerRadius(_ recipe: MeeshyCollapsingHeroRecipe, keepsBannerInBar: Bool) -> Double {
        keepsBannerInBar ? barCornerRadius * recipe.glassOpacity : 0
    }

    /// Le tic d'épinglage : il sonne quand l'avancée franchit l'épinglage, dans un sens ou dans l'autre, une fois.
    public static func pinTick(from previous: Double, to current: Double) -> Bool {
        guard previous.isFinite, current.isFinite else { return false }
        return (clamp01(previous) >= 1) != (clamp01(current) >= 1)
    }

    private static func travelShare(_ share: Double, reduceMotion: Bool) -> Double {
        guard !reduceMotion else { return share > handoverShare ? 1 : 0 }
        return min(share / finishShare, 1)
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

    /// Le haut des commandes : l'inset que l'hôte donne (une feuille n'a pas de barre d'état au-dessus d'elle),
    /// sinon la zone sûre, sinon 54. Un inset négatif vaut 0 ; un non-nombre est ignoré.
    public static func controlTop(safeArea: Double, topInset: Double? = nil) -> Double {
        if let topInset, topInset.isFinite { return max(topInset, 0) }
        return safeArea > 0 ? safeArea : 54
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
