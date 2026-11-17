import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce qu'on peut faire partager (planche `Lien-Creer`, étape 1) : l'ordre des cas est celui de la planche.
nonisolated enum ProfileLinkCreation: String, CaseIterable, Identifiable, Hashable {
    case profile
    case share
    case tracking
    case community
    case referral

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .profile: return "person.crop.square"
        case .share: return "bubble.left.and.bubble.right"
        case .tracking: return "cursorarrow.click"
        case .community: return "person.3"
        case .referral: return "gift"
        }
    }

    var title: String {
        switch self {
        case .profile: return String(localized: "profile.links.create.profile", defaultValue: "Mon profil", bundle: .main)
        case .share: return String(localized: "links.hub.share.title", defaultValue: "Liens de partage", bundle: .main)
        case .tracking: return String(localized: "links.hub.tracking.title", defaultValue: "Liens de suivi", bundle: .main)
        case .community: return String(localized: "links.hub.community.title", defaultValue: "Liens communauté", bundle: .main)
        case .referral: return String(localized: "links.hub.affiliate.title", defaultValue: "Parrainage", bundle: .main)
        }
    }

    /// La phrase d'orientation : à quoi sert ce lien, lisible au repos.
    var subtitle: String {
        switch self {
        case .profile:
            return String(localized: "profile.links.create.profile.detail", defaultValue: "Ta vitrine publique, avec QR", bundle: .main)
        case .share:
            return String(localized: "links.hub.share.description", defaultValue: "Invitez des contacts à rejoindre vos conversations", bundle: .main)
        case .tracking:
            return String(localized: "links.hub.tracking.description", defaultValue: "Suivez les performances de vos liens de référence", bundle: .main)
        case .community:
            return String(localized: "links.hub.community.description", defaultValue: "Gérez les liens d'invitation vers vos communautés", bundle: .main)
        case .referral:
            return String(localized: "links.hub.affiliate.description", defaultValue: "Invitez et suivez qui s'inscrit par vos liens", bundle: .main)
        }
    }

    /// Ce que VoiceOver annonce : le geste, pas seulement la famille.
    var accessibilityLabel: String {
        switch self {
        case .profile: return title
        case .share: return String(localized: "links.hub.share.create.a11y", defaultValue: "Créer un lien de partage", bundle: .main)
        case .tracking: return String(localized: "links.hub.tracking.create.a11y", defaultValue: "Créer un lien de suivi", bundle: .main)
        case .community: return title
        case .referral: return String(localized: "links.hub.affiliate.create.a11y", defaultValue: "Créer un lien de parrainage", bundle: .main)
        }
    }

    static var heading: String {
        String(localized: "profile.links.create.heading", defaultValue: "Que veux-tu partager ?", bundle: .main)
    }

    static var pageTitle: String {
        String(localized: "profile.links.create.title", defaultValue: "Nouveau lien", bundle: .main)
    }
}

/// « Nouveau lien » (planche `Lien-Creer`, étape 1) : choisir ce qu'on partage, puis le formulaire de cette famille —
/// les écrans de création existants, inchangés. Rangées à chevron du kit (K06) dans un verre de thème.
struct ProfileLinkCreateChooser: View {
    let accent: Color
    let onPick: (ProfileLinkCreation) -> Void

    var body: some View {
        LinksPage(title: ProfileLinkCreation.pageTitle, accent: accent, glyph: .close) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ProfileLinkCreation.heading, form: .overline)
                VStack(spacing: 0) {
                    ForEach(Array(ProfileLinkCreation.allCases.enumerated()), id: \.element) { index, creation in
                        MeeshyToggleRow(creation.title, systemImage: creation.systemImage, subtitle: creation.subtitle,
                                        accessory: .chevron,
                                        showsDivider: index < ProfileLinkCreation.allCases.count - 1,
                                        tint: accent, action: { onPick(creation) })
                            .accessibilityLabel(Text(creation.accessibilityLabel))
                            .accessibilityHint(Text(creation.subtitle))
                    }
                }
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
            .padding(.bottom, 40)
        }
    }
}
