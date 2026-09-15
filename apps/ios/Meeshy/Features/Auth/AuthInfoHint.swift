import SwiftUI
import MeeshyUI

/// LE DÉTAIL DERRIÈRE UN (i) — un seul composant pour l'inscription et la
/// connexion par e-mail (#6441, #6626).
///
/// « Moins de détails sur la page de connexion et d'enregistrement ; utiliser
/// des (i) pour informer sur le mode de fonctionnement si naturellement ce
/// n'est pas clair » (directive porteur 2026-09-15). Une ligne visible par
/// écran dit CE QU'ON FAIT ; le (i) dit COMMENT ça marche, pour qui le demande.
///
/// Le bouton et son texte sont DEUX vues parce qu'ils vivent à deux endroits :
/// le (i) dans la rangée qu'il explique (le cadre d'un champ, une ligne
/// d'en-tête), le texte déplié SOUS elle. L'hôte tient l'état — un seul (i)
/// ouvert à la fois : deux détails dépliés reproduiraient la surcharge qu'on
/// vient de retirer.
///
/// Et REPLIÉ ne veut pas dire ABSENT : le bouton porte le texte en
/// `accessibilityValue`, et l'hôte le pose en `accessibilityHint` sur ce que
/// le (i) explique — VoiceOver l'énonce sans avoir à trouver le bouton.
struct AuthInfoHint: Equatable {
    let text: String
    /// Ce que VoiceOver annonce pour le bouton — « en savoir plus » seul ne
    /// dit pas SUR QUOI, et plusieurs (i) sur un écran ne se distinguent alors
    /// plus.
    let buttonLabel: String
}

struct AuthInfoHintButton: View {
    let hint: AuthInfoHint
    @Binding var isExpanded: Bool
    let tint: Color

    var body: some View {
        Button {
            HapticFeedback.light()
            isExpanded.toggle()
        } label: {
            Image(systemName: "info.circle")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                .foregroundColor(tint)
        }
        .buttonStyle(.plain)
        .meeshyTapTarget()
        .accessibilityLabel(hint.buttonLabel)
        .accessibilityValue(hint.text)
    }
}

struct AuthInfoHintText: View {
    let hint: AuthInfoHint
    let isExpanded: Bool
    let color: Color
    var alignment: TextAlignment = .leading

    var body: some View {
        if isExpanded {
            Text(hint.text)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                .foregroundColor(color)
                .multilineTextAlignment(alignment)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityHidden(true)
        }
    }
}
