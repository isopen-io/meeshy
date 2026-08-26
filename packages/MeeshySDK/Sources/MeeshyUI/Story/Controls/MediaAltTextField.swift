import SwiftUI

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
struct MediaAltTextField: View {
    let text: String
    let onCommit: (String) -> Void

    @State private var draft: String
    @FocusState private var isFocused: Bool

    init(text: String, onCommit: @escaping (String) -> Void) {
        self.text = text
        self.onCommit = onCommit
        _draft = State(initialValue: text)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(String(localized: "story.media.alt.label", defaultValue: "Texte alternatif", bundle: .module))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)

            TextField(
                String(localized: "story.media.alt.placeholder", defaultValue: "Décrivez ce média pour VoiceOver", bundle: .module),
                text: $draft,
                axis: .vertical
            )
            .lineLimit(1...3)
            .textFieldStyle(.roundedBorder)
            .font(.system(size: 13))
            .focused($isFocused)
            .onSubmit { commitIfChanged() }
            .accessibilityLabel(String(localized: "story.media.alt.label", defaultValue: "Texte alternatif", bundle: .module))
            .accessibilityHint(String(localized: "story.media.alt.a11yHint", defaultValue: "Décrit ce média aux personnes qui utilisent VoiceOver.", bundle: .module))
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
