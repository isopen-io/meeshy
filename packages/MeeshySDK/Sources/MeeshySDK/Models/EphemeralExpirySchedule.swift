import Foundation

/// Quand faut-il rouvrir les yeux sur un fil d'éphémères — **un réveil pour
/// toute la conversation, jamais un par cellule** (#7452, dimension 4).
///
/// Chaque bulle éphémère faisait tourner son propre `Timer.publish(every: 1)`
/// (`BubbleEphemeralLifecycle`), qui réveillait le `MainActor` une fois par
/// seconde et par message à l'écran pour recalculer un texte. Le TEXTE du
/// décompte n'a plus besoin de personne — `Text(timerInterval:)` le fait battre
/// côté système, sans passer par SwiftUI. Ce qui reste à décider, c'est le seul
/// instant qui compte vraiment : **celui où un message doit QUITTER l'écran**.
///
/// Cette règle pure le donne. L'hôte n'a plus qu'une tâche endormie jusqu'au
/// prochain `nextWake`, ce qui fait, pour une conversation de cinquante
/// éphémères, une réveil-seconde au lieu de cinquante.
public enum EphemeralExpirySchedule {

    /// Ce que l'hôte doit faire MAINTENANT, et quand revenir.
    ///
    /// `nextWake` vise le plus proche de DEUX genres d'instants : le
    /// franchissement du seuil de la dernière minute (#7467), qui change ce qui
    /// s'affiche, et l'échéance, qui retire le message.
    public struct Plan: Equatable, Sendable {
        /// Les messages dont l'échéance est passée : à retirer de l'écran et
        /// de tout texte dérivé.
        public let expired: [String]
        /// La prochaine échéance à surveiller, ou `nil` s'il n'y a plus rien
        /// à attendre.
        public let nextWake: Date?

        public init(expired: [String], nextWake: Date?) {
            self.expired = expired
            self.nextWake = nextWake
        }
    }

    /// - Parameters:
    ///   - deadlines: l'échéance résolue de chaque message éphémère encore
    ///     affiché, indexée par identifiant de message.
    ///   - now: l'instant de référence.
    ///
    /// `expired` est trié pour que le plan soit reproductible : un plan qui
    /// change d'ordre à jeu de données égal rendrait tout témoin de
    /// comportement dépendant de l'ordre d'itération d'un dictionnaire.
    public static func plan(deadlines: [String: Date], now: Date = Date()) -> Plan {
        var expired: [String] = []
        var next: Date?

        for (messageId, deadline) in deadlines {
            guard deadline > now else {
                expired.append(messageId)
                continue
            }
            // **DEUX instants intéressent l'hôte par message** (#7467), pas un.
            //
            // Le franchissement du seuil de la dernière minute change ce qui
            // s'AFFICHE — la flamme gagne son compteur — sans que rien d'autre
            // ne bouge dans les données. Sans ce réveil, le compteur
            // n'apparaîtrait qu'au prochain rendu fortuit de la conversation,
            // ou jamais.
            //
            // Le seuil passe AVANT l'échéance quand il est encore devant : une
            // fois franchi, il n'y a plus rien à attendre que la fin.
            let threshold = deadline.addingTimeInterval(-EphemeralDeadline.countdownThreshold)
            let candidate = threshold > now ? threshold : deadline
            if next == nil || candidate < next! { next = candidate }
        }

        return Plan(expired: expired.sorted(), nextWake: next)
    }
}
