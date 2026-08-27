import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La bande de mentions du composer (#3904)** — une variante horizontale,
/// pleine largeur, ancrée en bas de l'écran de publication.
///
/// Distincte de `MentionSuggestionPanel` (liste VERTICALE utilisée par
/// `PostDetailView`/`FeedCommentsSheet`, ancrée en haut du composer) : le
/// résultat attendu par #3904 (« en bas de l'écran, sur toute la largeur,
/// défilable horizontalement ») est un patron d'affichage DIFFÉRENT, pas une
/// option de plus sur le composant partagé — y ajouter une branche
/// conditionnelle aurait risqué de régresser les deux écrans qui en
/// dépendent déjà. Le composer a donc son PROPRE fichier.
struct ComposerMentionStrip: View {
    @ObservedObject var controller: MentionComposerController
    var accentColor: String = MeeshyColors.brandPrimaryHex
    let currentText: String
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(controller.suggestions) { candidate in
                    Button {
                        let updated = controller.insertMention(candidate, into: currentText)
                        onSelect(updated)
                    } label: {
                        VStack(spacing: 4) {
                            MeeshyAvatar(
                                name: candidate.displayName,
                                context: .userListItem,
                                accentColor: accentColor,
                                avatarURL: candidate.avatarURL
                            )
                            Text("@\(candidate.username)")
                                .font(MeeshyFont.relative(11, weight: .medium))
                                .lineLimit(1)
                                .frame(maxWidth: 64)
                        }
                    }
                    .accessibilityLabel(
                        "\(String(localized: "composer.mention.label", defaultValue: "Mention", bundle: .main)) \(candidate.displayName)"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity)
        // Même chrome neutre que `MentionSuggestionPanel` : une bande
        // d'assistance à la saisie, pas du contenu de conversation.
        .adaptiveGlass(in: Rectangle())
        // Même patron que `mediaStrip`/`toolRow` (revue Opus 2026-08-27) :
        // sans le groupe, le rotor VoiceOver ne trouve la bande qu'élément
        // par élément, jamais comme un groupe nommé.
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerDocumentCopy.mentionStrip))
    }
}
