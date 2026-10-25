import SwiftUI

/// Les sections d'explication de la fiche Chiffrement (#12880) : une section
/// par sujet, un fait par ligne, son symbole décoratif caché à VoiceOver.
struct ConversationEncryptionExplanationSections: View {
    let explanation: ConversationEncryptionExplanation

    var body: some View {
        ForEach(explanation.sections, id: \.topic) { section in
            Section {
                ForEach(section.facts, id: \.self) { fact in
                    Label {
                        Text(fact.text)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: fact.systemImage)
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                    .accessibilityElement(children: .combine)
                }
            } header: {
                Text(section.topic.title)
            }
        }
    }
}
