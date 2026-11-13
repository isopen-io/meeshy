import SwiftUI
import MeeshyUI

/// Les sections d'explication de la fiche Chiffrement (#12880) : une section
/// par sujet, un fait par ligne, son symbole décoratif caché à VoiceOver.
struct ConversationEncryptionExplanationSections: View {
    let explanation: ConversationEncryptionExplanation
    @Binding var openNoteID: String?

    var body: some View {
        ForEach(explanation.sections, id: \.topic) { section in
            Section {
                ForEach(section.facts, id: \.self) { fact in
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
            } header: {
                Text(section.topic.title)
            }
        }
    }
}
