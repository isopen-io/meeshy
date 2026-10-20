import Foundation
import MeeshySDK

/// La loi d'échéance des éphémères d'un fil — pure : elle lit des messages et rend des instants.
/// Deux questions distinctes, que l'état `.expired` (échéance `nil`) empêche de confondre :
/// « quand me réveiller ? » (`deadlines`) et « qu'est-ce qui doit partir MAINTENANT ? » (`elapsedIds`).
enum EphemeralExpiryLaw {

    /// L'échéance de chaque éphémère encore affiché. Elle passe par `MeeshyMessage.protection`, le site
    /// UNIQUE de la règle : jamais une seconde arithmétique, sinon deux horloges pour un message.
    /// #10433 — une RÉPONSE meurt avec ce qu'elle cite (`QuoteCascade`) : son échéance est la sienne
    /// rapprochée de celle de sa chaîne citée.
    static func deadlines(of messages: [Message], now: Date) -> [String: Date] {
        let quotes = QuoteCascade.MessageThread(messages, ledger: EphemeralReceiptLedger.shared, now: now)
        var table: [String: Date] = [:]
        for message in messages {
            // Filtre bon marché d'abord : relue à CHAQUE changement de `messages`.
            let declaresEphemeral = message.effects.flags.contains(.ephemeral) || message.expiresAt != nil
            let own = declaresEphemeral ? message.protection().ephemeralState.deadline : nil
            guard let deadline = QuoteCascade.inheritedExpiresAt([own, quotes.inheritedDeath(of: message)]) else { continue }
            table[message.id] = deadline
        }
        return table
    }

    /// Les éphémères DÉJÀ échus (#7552) : un message échu pendant que l'app était fermée n'a plus
    /// d'échéance future, donc n'était jamais dû et réapparaissait à chaque démarrage à froid.
    static func elapsedIds(in messages: [Message], now: Date) -> Set<String> {
        let quotes = QuoteCascade.MessageThread(messages, ledger: EphemeralReceiptLedger.shared, now: now)
        return Set(messages.compactMap { message -> String? in
            if let inherited = quotes.inheritedDeath(of: message), inherited <= now { return message.id }
            guard message.effects.flags.contains(.ephemeral) || message.expiresAt != nil else { return nil }
            return message.protection().ephemeralState.hasElapsed ? message.id : nil
        })
    }

    /// Ce que l'ordonnanceur voit : les échéances ET les échus (`.distantPast`, donc dus sur-le-champ),
    /// sauf ceux qui brûlent déjà — une combustion en cours ne se rallume jamais (#8352).
    static func scheduled(for messages: [Message], now: Date) -> [String: Date] {
        var table = deadlines(of: messages, now: now)
        let burning = Dictionary(messages.map { ($0.id, $0.isBurning) }, uniquingKeysWith: { _, last in last })
        for id in elapsedIds(in: messages, now: now) where burning[id] == false {
            table[id] = .distantPast
        }
        return table
    }
}
