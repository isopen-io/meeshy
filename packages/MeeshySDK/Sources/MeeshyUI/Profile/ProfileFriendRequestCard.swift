import SwiftUI
import MeeshySDK

/// « Devenez amis » (planche `Etat-Demande`, étape « aucune demande ») : ce que la demande change, un mot facultatif
/// (K-champ, 300 signes au plus) et « Demander à être amis » (K40). Le mot vit ici jusqu'à l'envoi ; la fiche reçoit le
/// texte, le rogne et ne l'envoie pas s'il est vide ; la carte quitte l'écran quand la demande part. Une demande qui n'est
/// pas partie (planche `Etat-Erreur` vue 2) laisse le bouton comme avant, le dit, et « Réessayer » renvoie le même mot.
struct ProfileFriendRequestCard: View {
    static let noteLimit = 300

    let tint: Color
    var unsent = false
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
            if unsent { unsentNotice }
        }
    }

    private var unsentNotice: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Label {
                Text(String(localized: "profile.relation.request.unsent.detail",
                            defaultValue: "Rien n'a été envoyé. Le bouton est revenu comme avant.", bundle: .module))
                    .meeshyScaledFont(MeeshyFont.labelSize)
            } icon: {
                Image(systemName: "arrow.uturn.backward").accessibilityHidden(true)
            }
            .foregroundStyle(.secondary)
            MeeshyStateBlock(
                kind: .error,
                title: String(localized: "profile.relation.request.unsent.title",
                              defaultValue: "Ta demande n'est pas partie", bundle: .module),
                primary: MeeshyStateBlockAction(
                    title: String(localized: "profile.relation.request.unsent.retry", defaultValue: "Réessayer", bundle: .module),
                    perform: { onSend(note) }
                ),
                size: .compact
            )
        }
    }
}
