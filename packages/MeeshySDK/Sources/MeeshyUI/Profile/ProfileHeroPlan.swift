import Foundation
import MeeshySDK

/// Ce que peint la bannière du héros de la fiche d'un autre (#19410) : sa photo, son design équipé, ou la bannière
/// vivante du kit (K27), éteinte quand il m'a bloqué.
public nonisolated enum ProfileHeroBanner: Equatable, Sendable {
    case photo(String)
    case design(AppearanceDesign)
    case living(isMuted: Bool)
}

/// **Le héros de la fiche d'un autre en VALEURS** (#19410, planches `Autre-Vitrine`, `Autre-Publications`,
/// `Autre-Commun`, `Autre-Actions`, `Etat-HorsLigne`) : l'en-tête est K28 `MeeshyCollapsingHero`, et un seul nombre,
/// l'avancée du doigt, mène son repli. Une feuille n'a pas de barre d'état au-dessus d'elle : ses commandes se posent
/// à `topInset`, et la barre repliée les tient.
public nonisolated enum ProfileHeroPlan {
    public static let topInset: Double = 12
    public static let expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight
    public static let collapsedHeight: Double = topInset + MeeshyCollapsingHeroRecipe.controlTarget + 12
    /// Où commence ce qui défile : sous l'identité du héros déplié, qui déborde de la bannière.
    public static let contentTop: Double = expandedHeight + MeeshyCollapsingHeroRecipe.identityOverflow
    /// En deçà, l'avatar est celui de la barre : l'anneau de story n'y tient plus.
    public static let storyRingMinimumAvatar: Double = 56

    /// L'avancée du repli : le décalage signé du défilement (négatif quand on descend) ramené à K28. Tirée vers le
    /// bas, elle est négative et seule la bannière s'étire.
    public static func progress(scrollOffset: Double) -> Double {
        guard scrollOffset.isFinite else { return 0 }
        return MeeshyCollapsingHeroRecipe.progress(offset: -scrollOffset, expandedHeight: expandedHeight,
                                                   collapsedHeight: collapsedHeight)
    }

    /// La pilule de relation rejoint la barre quand la barre porte l'identité, jamais avant (une seule identité).
    public static func barShowsRelation(progress: Double) -> Bool {
        MeeshyCollapsingHeroRecipe.resolve(progress: progress, expandedHeight: expandedHeight,
                                           collapsedHeight: collapsedHeight).barOwnsIdentity
    }

    public static func banner(_ paint: ProfileBannerPaint, isBlockedByTarget: Bool) -> ProfileHeroBanner {
        switch paint {
        case .photo(let url): return .photo(url)
        case .design(let design): return .design(design)
        case .plain: return .living(isMuted: isBlockedByTarget)
        }
    }

    public static func storyRing(_ state: StoryRingState, avatarSize: Double) -> StoryRingState {
        avatarSize >= storyRingMinimumAvatar ? state : .none
    }

    /// La hauteur à donner à la bannière peinte : celle du héros déplié, plus ce que le doigt tire vers le bas, pour
    /// que l'étirement de K28 ne découvre jamais le fond.
    public static func bannerHeight(progress: Double) -> Double {
        expandedHeight + MeeshyCollapsingHeroRecipe.resolve(progress: progress, expandedHeight: expandedHeight,
                                                            collapsedHeight: collapsedHeight).bannerStretch
    }

    /// Ce que l'app pose au bas de la bannière (niveau, rang) s'élève au-dessus de l'avatar de K28, qui la chevauche.
    public static let bannerBottomInset: Double = 94
}
