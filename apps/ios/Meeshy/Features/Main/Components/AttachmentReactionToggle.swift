import Foundation

// MARK: - La bascule d'une réaction sur une pièce (#9910)

/// **Poser ou retirer un émoji sur UNE pièce** — la règle des multi-réactions
/// (2026-08-18) : les émojis s'empilent, et le même émoji re-touché se retire.
///
/// Extraite du ViewModel (#9910) : la réaction d'une pièce hors de la fenêtre
/// chargée — que seul l'index des médias porte — doit basculer EXACTEMENT
/// comme celle d'une pièce chargée. Deux écritures de la bascule auraient
/// divergé au premier ajustement de l'une.
nonisolated enum AttachmentReactionToggle {

    struct Outcome: Equatable, Sendable {
        /// Les comptes après la bascule ; `nil` quand plus personne n'a réagi.
        let summary: [String: Int]?
        /// Les émojis de l'utilisateur après la bascule ; `nil` quand aucun.
        let mine: [String]?
        /// `true` : l'émoji est posé ; `false` : il est retiré.
        let added: Bool
    }

    static func apply(_ emoji: String, summary: [String: Int]?, mine: [String]?) -> Outcome {
        var counts = summary ?? [:]
        var own = mine ?? []
        guard own.contains(emoji) else {
            counts[emoji] = (counts[emoji] ?? 0) + 1
            own.append(emoji)
            return Outcome(summary: counts, mine: own, added: true)
        }
        counts[emoji] = max(0, (counts[emoji] ?? 1) - 1)
        if counts[emoji] == 0 { counts.removeValue(forKey: emoji) }
        own.removeAll { $0 == emoji }
        return Outcome(summary: counts.isEmpty ? nil : counts, mine: own.isEmpty ? nil : own, added: false)
    }
}
