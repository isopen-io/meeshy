import Foundation
import MeeshyUI

/// Une commande posée sur la bannière de ma vitrine (planche `Main`) : la roue Réglages, « Vue par : Moi » et le
/// crayon d'édition.
nonisolated enum ProfileOwnHeroControl: String, Equatable, Sendable, CaseIterable {
    case settings
    case viewedBy
    case edit
}

/// **L'en-tête de ma vitrine en VALEURS** (#19589, planches `Main`, `Moi-Edition`, `Sys-Mouvement`) : K28
/// `MeeshyCollapsingHero` sur la bannière vivante K27, mené par le seul défilement. Au repos, il se replie de 318 en
/// barre de verre de 96 ; en édition, la bannière part avec le formulaire et le cadre de mode (K16) tient le haut.
nonisolated enum ProfileOwnHeroPlan {
    static let expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight
    static let collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight
    /// Où commence ce qui défile : sous l'identité du héros déplié, qui déborde de la bannière.
    static let contentTop: Double = expandedHeight + MeeshyCollapsingHeroRecipe.identityOverflow
    /// Le niveau et le rang s'élèvent au-dessus de l'avatar, qui chevauche le bas de la bannière.
    static let bannerBottomInset: Double = ProfileHeroPlan.bannerBottomInset
    /// « Changer la bannière » (planche `Moi-Edition`) : sous la rangée des commandes, au bord de fin.
    static let changeBannerTop: Double = 122

    /// L'avancée du repli : le décalage signé du défilement (négatif quand on descend). En édition, la bannière ne
    /// se replie pas, elle s'étire seulement quand on la tire vers le bas.
    static func progress(scrollOffset: Double, isEditing: Bool) -> Double {
        guard scrollOffset.isFinite else { return 0 }
        let progress = MeeshyCollapsingHeroRecipe.progress(offset: -scrollOffset)
        return isEditing ? min(progress, 0) : progress
    }

    /// La hauteur à donner à la bannière peinte : celle du héros déplié, plus ce que le doigt tire vers le bas, pour
    /// que l'étirement de K28 ne découvre jamais le fond.
    static func bannerHeight(progress: Double) -> Double {
        expandedHeight + MeeshyCollapsingHeroRecipe.resolve(progress: progress).bannerStretch
    }

    /// Au repos, le héros reste épinglé et se replie ; en édition, il défile avec le formulaire.
    static func isPinned(isEditing: Bool) -> Bool {
        !isEditing
    }

    static func usesModeHeader(isEditing: Bool) -> Bool {
        isEditing
    }

    static func showsGameBadges(isEditing: Bool) -> Bool {
        !isEditing
    }

    static func leading(isEditing: Bool) -> [ProfileOwnHeroControl] {
        isEditing ? [] : [.settings]
    }

    /// « Vue par » vit sur la bannière ; la barre repliée ne garde que le crayon, à côté de mon nom.
    static func trailing(isEditing: Bool, progress: Double) -> [ProfileOwnHeroControl] {
        guard !isEditing else { return [] }
        let barOwnsIdentity = MeeshyCollapsingHeroRecipe.resolve(progress: progress).barOwnsIdentity
        return barOwnsIdentity ? [.edit] : [.viewedBy, .edit]
    }

    static func label(_ control: ProfileOwnHeroControl) -> String {
        switch control {
        case .settings: return String(localized: "settings.title", defaultValue: "Réglages", bundle: .main)
        case .viewedBy: return VitrineSeenAsCopy.viewedByMe
        case .edit: return modeLabel
        }
    }

    static func systemImage(_ control: ProfileOwnHeroControl) -> String {
        switch control {
        case .settings: return "gearshape"
        case .viewedBy: return "eye"
        case .edit: return "pencil"
        }
    }

    static func identifier(_ control: ProfileOwnHeroControl) -> String {
        switch control {
        case .settings: return "profile.hero.settings"
        case .viewedBy: return "profile.viewedBy"
        case .edit: return "profile.hero.edit"
        }
    }

    /// Le nom du mode d'édition, annoncé à l'entrée ; c'est aussi le nom du crayon qui y mène.
    static var modeLabel: String {
        String(localized: "profile.hero.edit", defaultValue: "Modifier ma vitrine", bundle: .main)
    }

    static var cancelTitle: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)
    }

    static var saveTitle: String {
        String(localized: "profile.save", defaultValue: "Enregistrer", bundle: .main)
    }
}
