import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les trois faces de mon profil (loi 1, #18869) : la Vitrine dit qui je suis, les Liens ce qui amène vers moi, les
/// Actions ce que je peux faire. L'ordre des cas est l'ordre du sélecteur.
nonisolated enum ProfileFace: String, CaseIterable, Hashable, Sendable {
    case vitrine
    case links
    case actions

    var title: String {
        switch self {
        case .vitrine: return String(localized: "profile.face.vitrine", defaultValue: "Vitrine", bundle: .main)
        case .links: return String(localized: "profile.face.links", defaultValue: "Liens", bundle: .main)
        case .actions: return String(localized: "profile.face.actions", defaultValue: "Actions", bundle: .main)
        }
    }

    var systemImage: String {
        switch self {
        case .vitrine: return "person.crop.square"
        case .links: return "link"
        case .actions: return "bolt"
        }
    }

    /// La variante pleine, portée par la face courante.
    var currentSystemImage: String {
        switch self {
        case .vitrine: return "person.crop.square.fill"
        case .links: return "link"
        case .actions: return "bolt.fill"
        }
    }

    var option: MeeshySegmentedOption<ProfileFace> {
        MeeshySegmentedOption(id: self, title: title, systemImage: systemImage, currentSystemImage: currentSystemImage)
    }

    /// Le sélecteur ne se pose que hors édition : l'édition est sur place, sur la Vitrine (planche `Moi-Edition`), et
    /// une feuille ou un écran poussé n'a pas de sélecteur (loi 5).
    static func showsSelector(isEditing: Bool) -> Bool {
        !isEditing
    }

    /// En édition, c'est la Vitrine qui s'édite, quelle que soit la face d'où l'on vient.
    static func shown(_ face: ProfileFace, isEditing: Bool) -> ProfileFace {
        isEditing ? .vitrine : face
    }

    static var selectorLabel: String {
        String(localized: "profile.face.selector", defaultValue: "Faces du profil", bundle: .main)
    }

    static var shareLabel: String {
        String(localized: "profile.face.share", defaultValue: "Partager mon profil", bundle: .main)
    }

    /// Le bouton posé à côté du sélecteur dépend de la face (planches `Main`, `Moi-Liens`, `Moi-Actions`) : partager ma
    /// vitrine quand mon lien existe, créer un lien sur les Liens, rien sur les Actions.
    func accessory(canShare: Bool) -> ProfileFaceAccessory? {
        switch self {
        case .vitrine: return canShare ? .share : nil
        case .links: return .createLink
        case .actions: return nil
        }
    }
}

/// Le bouton de fin du sélecteur de faces, avec son glyphe et le libellé que VoiceOver lit.
nonisolated enum ProfileFaceAccessory: Hashable, Sendable {
    case share
    case createLink

    var systemImage: String {
        switch self {
        case .share: return "square.and.arrow.up"
        case .createLink: return "plus"
        }
    }

    var label: String {
        switch self {
        case .share: return ProfileFace.shareLabel
        case .createLink: return ProfileLinksCopy.createLink
        }
    }
}

/// Le sélecteur de faces, en bas, dans la zone du pouce (loi 5) : le choix segmenté du kit (K03, glyphe de tête plein
/// pour la face courante) posé dans un verre dense, et à côté le bouton propre à la face (K01) — il change avec elle
/// selon la table K26.
struct ProfileFaceSelector: View {
    @Binding var face: ProfileFace
    let canShare: Bool
    let onAccessory: (ProfileFaceAccessory) -> Void

    private var accessory: ProfileFaceAccessory? { face.accessory(canShare: canShare) }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshySegmented(
                ProfileFace.selectorLabel,
                selection: $face,
                options: ProfileFace.allCases.map { $0.option },
                role: .tabs,
                tone: .theme
            )
            .padding(MeeshySpacing.xs)
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl + MeeshySpacing.xs), density: .dense)
            if let accessory {
                MeeshyGlassButton(
                    systemImage: accessory.systemImage,
                    label: accessory.label,
                    kind: .active,
                    size: .s48,
                    action: { onAccessory(accessory) }
                )
                .id(accessory)
                .meeshyTransition(.scale.combined(with: .opacity))
            }
        }
        .meeshyMotion(.morph, value: accessory)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }
}
