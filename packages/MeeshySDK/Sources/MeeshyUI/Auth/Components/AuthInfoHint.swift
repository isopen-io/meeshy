import SwiftUI

/// LE DÉTAIL DERRIÈRE UN (i) — un seul composant pour l'inscription, la
/// connexion par e-mail et « Mot de passe oublié » (#6441, #6626, #6644).
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
///
/// **Pourquoi dans MeeshyUI.** Il vivait dans l'app, et « Mot de passe
/// oublié » — qui vit dans le SDK — devait monter le même : le SDK n'importe
/// pas l'app. C'est un atome aux paramètres opaques (un texte, un libellé, un
/// état, une teinte), sans singleton ni règle produit : le test du grain de
/// `packages/MeeshySDK/CLAUDE.md` le range ici.
public struct AuthInfoHint: Equatable {
    public let text: String
    /// Ce que VoiceOver annonce pour le bouton — « en savoir plus » seul ne
    /// dit pas SUR QUOI, et plusieurs (i) sur un écran ne se distinguent alors
    /// plus.
    public let buttonLabel: String

    public init(text: String, buttonLabel: String) {
        self.text = text
        self.buttonLabel = buttonLabel
    }
}

public struct AuthInfoHintButton: View {
    private let hint: AuthInfoHint
    @Binding private var isExpanded: Bool
    private let tint: Color
    private let showsLabel: Bool

    /// - Parameter showsLabel: écrit la question À CÔTÉ du glyphe. Un (i) seul
    ///   suffit quand la rangée qu'il explique dit déjà de quoi il parle (un
    ///   titre, un champ) ; il ne suffit plus quand la question EST
    ///   l'information — « Jamais eu de mot de passe ? » ne se devine pas
    ///   derrière un glyphe, et c'est précisément la personne qui la pose qui
    ///   ne toucherait pas un (i) muet.
    public init(hint: AuthInfoHint, isExpanded: Binding<Bool>, tint: Color, showsLabel: Bool = false) {
        self.hint = hint
        self._isExpanded = isExpanded
        self.tint = tint
        self.showsLabel = showsLabel
    }

    public var body: some View {
        Button {
            HapticFeedback.light()
            isExpanded.toggle()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                if showsLabel {
                    Text(hint.buttonLabel)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(tint)
                        .multilineTextAlignment(.center)
                }
                Image(systemName: "info.circle")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                    .foregroundColor(tint)
            }
        }
        .buttonStyle(.plain)
        .meeshyTapTarget()
        .accessibilityLabel(hint.buttonLabel)
        .accessibilityValue(hint.text)
    }
}

public struct AuthInfoHintText: View {
    private let hint: AuthInfoHint
    private let isExpanded: Bool
    private let color: Color
    private let alignment: TextAlignment

    public init(hint: AuthInfoHint, isExpanded: Bool, color: Color, alignment: TextAlignment = .leading) {
        self.hint = hint
        self.isExpanded = isExpanded
        self.color = color
        self.alignment = alignment
    }

    public var body: some View {
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
