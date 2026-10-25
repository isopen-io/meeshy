import SwiftUI

/// Les sections d'explication de la fiche Chiffrement (#12880) : une section
/// par sujet, un fait par ligne, son symbole décoratif caché à VoiceOver.
struct ConversationEncryptionExplanationSections: View {
    let explanation: ConversationEncryptionExplanation

    var body: some View {
        ForEach(explanation.sections, id: \.topic) { section in
            Section {
                ForEach(section.facts, id: \.self) { fact in
                    ConversationEncryptionFactRow(fact: fact)
                }
            } header: {
                Text(section.topic.title)
            }
        }
    }
}

/// Au moment d'activer (#10789) : ce que le mode choisi retire aux pièces
/// jointes, dit avant le geste qui ne se défait pas. Rien pour un mode que le
/// serveur lit.
struct ConversationEncryptionActivationTradeOffs: View {
    let mode: ConversationEncryptionModeChoice

    var body: some View {
        let facts = ConversationEncryptionExplanation.activationTradeOffs(for: mode)
        if !facts.isEmpty {
            Section {
                ForEach(facts, id: \.self) { fact in
                    ConversationEncryptionFactRow(fact: fact)
                }
            } header: {
                Text(String(localized: "conversation.encryption.detail.activationTradeOffsHeader",
                            defaultValue: "Ce que le bout en bout retire aux pièces jointes", bundle: .main))
            }
        }
    }
}

/// Un fait, son symbole décoratif caché à VoiceOver.
private struct ConversationEncryptionFactRow: View {
    let fact: ConversationEncryptionExplanation.Fact

    var body: some View {
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
}
