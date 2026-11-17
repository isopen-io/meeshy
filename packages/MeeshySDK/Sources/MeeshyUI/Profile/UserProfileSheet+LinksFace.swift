import SwiftUI
import MeeshySDK

// MARK: - La face Liens de la fiche d'un autre (#18870)
//
// Ce qui amène vers lui : son lien de profil sur un billet (K30), l'adresse en chasse fixe, et les gestes du billet en
// actions libellées (K32) — copier, envoyer son profil. Sans pseudo, il n'a pas d'adresse : l'état vide (K38) le dit et
// ramène à sa Vitrine (loi 8 : un état vide a toujours une sortie).

extension UserProfileSheet {

    var linksFace: some View {
        RelationLinksFace(
            link: ProfileLink(username: displayUser.username),
            tint: accentTint,
            onCopy: { copyProfileLink($0) },
            onShowVitrine: { face = .vitrine }
        )
    }
}

struct RelationLinksFace: View {
    let link: ProfileLink?
    let tint: Color
    let onCopy: (ProfileLink) -> Void
    let onShowVitrine: () -> Void
    @State private var sharesProfile = false

    var body: some View {
        Group {
            if let link {
                ticket(link)
            } else {
                MeeshyStateBlock(
                    kind: .empty,
                    title: String(localized: "profile.relation.links.empty", defaultValue: "Pas encore de lien", bundle: .module),
                    primary: MeeshyStateBlockAction(title: RelationFace.vitrine.title, systemImage: "person.crop.square") {
                        onShowVitrine()
                    },
                    tint: tint
                )
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
    }

    private func ticket(_ link: ProfileLink) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshySectionHeader(
                title: String(localized: "profile.relation.links.title", defaultValue: "Son lien de profil", bundle: .module),
                form: .overline
            )
            MeeshyTicket(
                title: String(localized: "profile.relation.links.caption", defaultValue: "Ouvre sa vitrine, vue Public", bundle: .module),
                code: link.displayText,
                tint: tint,
                systemImage: "link",
                size: .hero
            )
            MeeshyActionGrid {
                MeeshyLabeledAction(
                    title: String(localized: "profile.relation.action.copy", defaultValue: "Copier", bundle: .module),
                    systemImage: "doc.on.doc",
                    tint: tint,
                    hint: link.displayText,
                    action: { onCopy(link) }
                )
                MeeshyLabeledAction(
                    title: ProfileRelationAction.sendProfile.title,
                    systemImage: ProfileRelationAction.sendProfile.systemImage,
                    tint: tint,
                    action: { sharesProfile = true }
                )
            }
        }
        .sheet(isPresented: $sharesProfile) {
            ProfileActivitySheet(items: [link.url])
                .presentationDetents([.medium, .large])
        }
    }
}
