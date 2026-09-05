import SwiftUI
import MeeshySDK

/// Champ de texte alternatif d'un média — accessibilité, pas décoration.
///
/// Deux moitiés comptent également ici : la SAISIE (ce champ doit être
/// navigable et compréhensible à VoiceOver comme n'importe quel autre champ)
/// et la VALEUR (ce qu'elle décrit sera ensuite ce que VoiceOver annonce à
/// qui consulte le média). Un champ alt inaccessible en lui-même serait une
/// contradiction — voir la consigne du lot C7-UI.
///
/// Patron d'état repris de `StoryAudioCell` (`@State` local pour une saisie
/// fluide, resync via `.adaptiveOnChange` quand la valeur amont change pour
/// une raison NON liée à cette frappe — undo/redo, changement de slide).
/// **Un seul champ pour les DEUX textes** (#4055). Il ne diffère que par ses
/// libellés, et les dupliquer aurait produit deux composants qui divergent sur
/// le patron d'état — celui-là même dont le doc-comment ci-dessus explique
/// qu'il est subtil (resync `.adaptiveOnChange`, commit à la perte de focus et
/// au démontage). Ce qui change se lit en UN endroit, `labels`.
public struct MediaAltTextField: View {
    public let kind: PostMediaText
    public let text: String
    public let onCommit: (String) -> Void

    @State private var draft: String
    @FocusState private var isFocused: Bool

    /// **Public depuis #4756** : l'atome est agnostique — trois paramètres
    /// opaques, aucun singleton Meeshy, aucune règle « quand faire X ». C'est
    /// le test du grain du § SDK Purity, et il le passe. Le rendre public est
    /// ce qui évite qu'un second champ « qui ressemble » naisse côté app et
    /// diverge au premier réglage — la faute exacte que le composer a déjà
    /// payée sur les légendes.
    public init(kind: PostMediaText = .alt, text: String, onCommit: @escaping (String) -> Void) {
        self.kind = kind
        self.text = text
        self.onCommit = onCommit
        _draft = State(initialValue: text)
    }

    /// Les trois chaînes que la NATURE du texte décide. Séparées du corps
    /// pour que la différence entre les deux champs tienne en une lecture —
    /// et pour qu'aucune ne se retrouve écrite deux fois.
    private var labels: (label: String, placeholder: String, hint: String) {
        switch kind {
        case .alt:
            return (
                String(localized: "story.media.alt.label", defaultValue: "Texte alternatif", bundle: .module),
                String(localized: "story.media.alt.placeholder", defaultValue: "Décrivez ce média pour VoiceOver", bundle: .module),
                String(localized: "story.media.alt.a11yHint", defaultValue: "Décrit ce média aux personnes qui utilisent VoiceOver.", bundle: .module)
            )
        case .caption:
            return (
                String(localized: "story.media.caption.label", defaultValue: "Légende", bundle: .module),
                String(localized: "story.media.caption.placeholder", defaultValue: "Écrivez la légende de ce média", bundle: .module),
                String(localized: "story.media.caption.a11yHint", defaultValue: "Texte affiché sous ce média. Différent du texte alternatif, qui décrit l'image sans être affiché.", bundle: .module)
            )
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(labels.label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)

            TextField(
                labels.placeholder,
                text: $draft,
                axis: .vertical
            )
            .lineLimit(1...3)
            .textFieldStyle(.roundedBorder)
            .font(.system(size: 13))
            .focused($isFocused)
            .onSubmit { commitIfChanged() }
            .accessibilityLabel(labels.label)
            .accessibilityHint(labels.hint)
        }
        .adaptiveOnChange(of: text) { _, newValue in
            // Le texte a changé pour une raison EXTÉRIEURE à cette frappe
            // (undo/redo, changement de slide qui recycle la row) : resync
            // le brouillon local, sinon le champ affiche une valeur périmée.
            guard newValue != draft else { return }
            draft = newValue
        }
        .adaptiveOnChange(of: isFocused) { wasFocused, isFocusedNow in
            guard wasFocused, !isFocusedNow else { return }
            commitIfChanged()
        }
        .onDisappear { commitIfChanged() }
    }

    private func commitIfChanged() {
        guard draft != text else { return }
        onCommit(draft)
    }
}
