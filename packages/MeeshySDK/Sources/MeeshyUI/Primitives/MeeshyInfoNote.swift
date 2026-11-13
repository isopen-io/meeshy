import SwiftUI

/// UNE NOTE DERRIÈRE UN (i) — l'atome de l'épure des interfaces (#17587,
/// épure #17584), le même que `InfoNoted` sur le web et `MeeshyInfoNote` sur
/// Android.
///
/// Un libellé NOMME ; l'explication passe derrière un (i). Le nom accessible du
/// bouton est la QUESTION à laquelle la note répond (« Qui voit ma présence ? »),
/// jamais « Plus d'infos » : plusieurs (i) sur un écran doivent se distinguer à
/// l'oreille. Repliée, la note reste LUE : le bouton la porte en
/// `accessibilityValue`.
///
/// Un seul (i) ouvert par écran : l'hôte tient l'identifiant de la note ouverte
/// (`openNoteID`) et `MeeshyInfoNote.toggled` décide. Building block agnostique :
/// une question, une note, une teinte — ni singleton ni règle produit.
public struct MeeshyInfoNote: Equatable, Sendable, Identifiable {
    public let question: String
    public let text: String

    public var id: String { question }

    public init(question: String, text: String) {
        self.question = question
        self.text = text
    }

    /// L'identifiant ouvert après un toucher sur `tapped` : toucher la note
    /// ouverte la referme, toucher une autre l'ouvre et referme la précédente.
    public static func toggled(open: String?, tapped: String) -> String? {
        open == tapped ? nil : tapped
    }

    /// L'identifiant ouvert après Échap (ou le geste d'échappement de
    /// VoiceOver) sur la note `closing` : seule la note ouverte se referme.
    public static func closed(open: String?, closing: String) -> String? {
        open == closing ? nil : open
    }
}

/// Le bouton (i) : cible 44 pt, nom = la question, valeur = la note.
public struct MeeshyInfoNoteButton: View {
    private let note: MeeshyInfoNote
    private let isExpanded: Bool
    private let tint: Color
    private let onToggle: () -> Void

    public init(note: MeeshyInfoNote, isExpanded: Bool, tint: Color = .secondary, onToggle: @escaping () -> Void) {
        self.note = note
        self.isExpanded = isExpanded
        self.tint = tint
        self.onToggle = onToggle
    }

    public var body: some View {
        Button(action: onToggle) {
            Image(systemName: isExpanded ? "info.circle.fill" : "info.circle")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
        }
        .buttonStyle(.plain)
        .meeshyTapTarget()
        .accessibilityLabel(Text(verbatim: note.question))
        .accessibilityValue(Text(verbatim: note.text))
        .accessibilityAddTraits(isExpanded ? .isSelected : [])
    }
}

/// Un nom (titre de bloc, rangée de réglage) suivi de son (i), et la note
/// dépliée DESSOUS. Sans note, le nom seul.
public struct MeeshyInfoNoted<Label: View>: View {
    private let note: MeeshyInfoNote?
    @Binding private var openNoteID: String?
    private let tint: Color
    private let label: Label

    public init(note: MeeshyInfoNote?, openNoteID: Binding<String?>, tint: Color = .secondary, @ViewBuilder label: () -> Label) {
        self.note = note
        self._openNoteID = openNoteID
        self.tint = tint
        self.label = label()
    }

    public var body: some View {
        if let note {
            noted(note)
        } else {
            label
        }
    }

    private func noted(_ note: MeeshyInfoNote) -> some View {
        let isExpanded = openNoteID == note.id
        return VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack(spacing: MeeshySpacing.xs) {
                label
                MeeshyInfoNoteButton(note: note, isExpanded: isExpanded, tint: tint) {
                    openNoteID = MeeshyInfoNote.toggled(open: openNoteID, tapped: note.id)
                }
            }
            if isExpanded {
                Text(verbatim: note.text)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                    .foregroundStyle(tint)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityAction(.escape) {
            openNoteID = MeeshyInfoNote.closed(open: openNoteID, closing: note.id)
        }
    }
}
