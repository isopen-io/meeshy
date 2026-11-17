import SwiftUI
import MeeshySDK

/// « Devenez amis » (planche `Etat-Demande`, étape « aucune demande ») : ce que la demande change, un mot facultatif
/// (K-champ, 300 signes au plus) et « Demander à être amis » (K40). Le mot vit ici jusqu'à l'envoi ; la fiche reçoit le
/// texte, le rogne et ne l'envoie pas s'il est vide ; la carte quitte l'écran quand la demande part.
struct ProfileFriendRequestCard: View {
    static let noteLimit = 300

    let tint: Color
    let onSend: (String) -> Void
    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                String(localized: "profile.relation.request.title", defaultValue: "Devenez amis", bundle: .module),
                lead: .systemImage("person.badge.plus"),
                detail: String(localized: "profile.relation.request.detail", defaultValue: "Vous verrez quand l'autre est en ligne.", bundle: .module),
                tint: tint
            )
            MeeshyField(
                String(localized: "profile.relation.request.noteLabel", defaultValue: "Ajoute un mot · facultatif", bundle: .module),
                text: note,
                prompt: String(localized: "profile.relation.request.notePrompt", defaultValue: "Dis-lui d'où vous vous connaissez", bundle: .module),
                limit: Self.noteLimit,
                onChange: { note = String($0.prefix(Self.noteLimit)) }
            )
            MeeshyButton(
                String(localized: "profile.relation.request.send", defaultValue: "Demander à être amis", bundle: .module),
                systemImage: "person.badge.plus",
                width: .fill,
                tint: tint,
                action: { onSend(note) }
            )
        }
    }
}
