import SwiftUI
import MeeshyUI

/// Les sections d'explication de la fiche Chiffrement (#12880) : une section
/// par sujet, un fait par ligne, son symbole décoratif caché à VoiceOver.
struct ConversationEncryptionExplanationSections: View {
    let explanation: ConversationEncryptionExplanation
    /// Les sujets qu'un hôte rend lui-même, dans sa propre section (la bascule, épure #18078).
    var omitting: Set<ConversationEncryptionExplanation.Topic> = []
    @Binding var openNoteID: String?

    var body: some View {
        ForEach(explanation.sections.filter { !omitting.contains($0.topic) }, id: \.topic) { section in
            Section {
                ForEach(section.facts, id: \.self) { fact in
                    ConversationEncryptionFactRow(fact: fact, openNoteID: $openNoteID)
                }
            } header: {
                Text(section.topic.title)
            }
        }
    }
}

/// Un fait de la fiche : son symbole décoratif, sa phrase, et son (i) quand il en porte un.
struct ConversationEncryptionFactRow: View {
    let fact: ConversationEncryptionExplanation.Fact
    @Binding var openNoteID: String?

    var body: some View {
        Label {
            MeeshyInfoNoted(note: fact.note, openNoteID: $openNoteID) {
                Text(fact.text)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } icon: {
            Image(systemName: fact.systemImage)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }
}
