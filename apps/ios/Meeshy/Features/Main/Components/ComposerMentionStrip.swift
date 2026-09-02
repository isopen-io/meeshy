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
                        // Chaque entrée : avatar + nom d'affichage (au-dessus)
                        // + @pseudo (en dessous) — retour porteur 2026-08-27.
                        HStack(spacing: 8) {
                            MeeshyAvatar(
                                name: candidate.displayName,
                                context: .userListItem,
                                accentColor: accentColor,
                                avatarURL: candidate.avatarURL
                            )
                            // **`isDark: true` n'est pas un oubli, c'est une
                            // CONSÉQUENCE** (#4122). La bande n'apparaît que
                            // sur le plateau du composer, dont les trois
                            // teintes sont sombres par doctrine
                            // (`PlateauTint` : « un fond sombre laisse la scène
                            // être la seule source de lumière »). Le suivre
                            // avec le `colorScheme` peindrait du texte sombre
                            // sur un fond sombre en thème clair — l'inverse
                            // exact du défaut qu'on croirait corriger.
                            //
                            // Mesuré sur les trois teintes (capsule à 6 % de
                            // `textPrimary` par-dessus) : le pseudo tient
                            // **6,62:1** au pire cas — au-dessus d'AA. Un token
                            // plus discret (`textMuted`) y tomberait à
                            // **4,01:1**, donc SOUS le seuil : le correctif
                            // intuitif dégraderait ce qu'il prétend réparer.
                            // Verrouillé par `ComposerMentionStripContrastTests`.
                            VStack(alignment: .leading, spacing: 1) {
                                Text(candidate.displayName)
                                    .font(MeeshyFont.relative(13, weight: .semibold))
                                    .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                                    .lineLimit(1)
                                Text("@\(candidate.username)")
                                    .font(MeeshyFont.relative(11, weight: .medium))
                                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: 140, alignment: .leading)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 10)
                        .background(
                            Capsule().fill(MeeshyColors.textPrimary(isDark: true).opacity(0.06))
                        )
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
