import Foundation
import UIKit
import MeeshySDK
import SwiftUI

/// **Un seul réveil pour tout le fil** — l'ordonnanceur qui fait disparaître un
/// éphémère à son échéance (#7452, dimension 4).
///
/// ## Ce qu'il remplace
///
/// Chaque bulle éphémère possédait son `BubbleEphemeralController` et son
/// `Timer.publish(every: 1)` : autant de réveils du `MainActor` par seconde que
/// d'éphémères à l'écran, chacun pour recalculer un texte. Le TEXTE n'a plus
/// besoin de personne (`Text(timerInterval:)` le fait battre côté système), et
/// le seul instant qui demande une décision — celui où le message QUITTE
/// l'écran — n'a jamais eu besoin d'être redemandé chaque seconde : il suffit
/// de dormir jusqu'à la PROCHAINE échéance.
///
/// ## Pourquoi le retrait ne se fait jamais dans la passe courante
///
/// `refresh` est appelé depuis `invalidateCaches`, donc depuis le `didSet` de
/// `messages`. Y retirer un message serait une mutation RÉENTRANTE de la
/// collection en cours d'observation. Le réveil est donc toujours différé —
/// même pour une échéance déjà passée, où il est simplement immédiat.
@MainActor
final class EphemeralExpiryCoordinator {
    // Même raison que `BubbleBlurRevealController` : sous SE-0466 la `deinit`
    // synthétisée serait isolée au MainActor et libèrerait deux fois au
    // démontage hors tâche. Garde : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    /// Ce que l'hôte fait des messages échus. Reçu, jamais décidé ici : cet
    /// ordonnanceur ne connaît ni la liste ni la persistance.
    var onExpired: (([String]) -> Void)?

    private var task: Task<Void, Never>?
    private var scheduledWake: Date?

    /// Déclare l'ensemble des éphémères VIVANTS et leur échéance.
    ///
    /// Idempotent : rappelé avec le même prochain réveil, il ne replanifie
    /// rien — sans quoi chaque frappe au clavier (qui touche `messages`)
    /// annulerait et recréerait la tâche.
    func refresh(deadlines: [String: Date], now: Date = Date()) {
        let plan = EphemeralExpirySchedule.plan(deadlines: deadlines, now: now)

        if !plan.expired.isEmpty {
            let expired = plan.expired
            Task { @MainActor [weak self] in self?.onExpired?(expired) }
        }

        guard let next = plan.nextWake else {
            cancel()
            return
        }
        guard scheduledWake != next || task == nil else { return }

        task?.cancel()
        scheduledWake = next
        task = Task { @MainActor [weak self] in
            let delay = next.timeIntervalSinceNow
            if delay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
            guard !Task.isCancelled, let self else { return }
            self.scheduledWake = nil
            self.task = nil
            self.onExpired?([])
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
        scheduledWake = nil
    }
}

extension ConversationViewModel {

    /// L'échéance de chaque éphémère encore affiché, par identifiant.
    ///
    /// La résolution passe par `MeeshyMessage.protection`, le site UNIQUE de la
    /// règle : l'ordonnanceur ne réécrit pas sa propre arithmétique d'échéance,
    /// sans quoi il pourrait retirer un message que le chrome montre encore
    /// vivant — deux horloges pour un même message, le défaut que ce lot ferme.
    var ephemeralDeadlines: [String: Date] {
        var table: [String: Date] = [:]
        for message in messages {
            // Filtre bon marché d'abord : cette propriété est relue à CHAQUE
            // changement de `messages`, et l'écrasante majorité des messages
            // d'un fil n'est pas éphémère. Sans lui, chaque passe construirait
            // un descripteur par message.
            guard message.effects.flags.contains(.ephemeral) || message.expiresAt != nil else { continue }
            guard let deadline = message.protection().ephemeralState.deadline else { continue }
            table[message.id] = deadline
        }
        return table
    }

    /// Retire de l'écran les éphémères échus, et purge ce qu'un texte DÉRIVÉ
    /// en garderait (#7452, exigence 3 : « aucun texte dérivé ne garde le
    /// contenu d'un éphémère au-delà de son échéance »).
    ///
    /// `ids` vide ⇒ le réveil a simplement sonné : c'est `ephemeralDeadlines`,
    /// recalculé à l'instant, qui dit ce qui est échu. L'appelant n'a pas à
    /// tenir cette liste à jour entre deux réveils.
    func expireEphemeralsIfNeeded(_ ids: [String] = []) {
        let now = Date()
        let due = Set(ids).union(
            ephemeralDeadlines.compactMap { $0.value <= now ? $0.key : nil }
        )
        guard !due.isEmpty else {
            // **Le réveil du SEUIL** (#7467). Rien n'est échu : ce réveil-ci
            // marque le passage sous la dernière minute, où la flamme gagne son
            // compteur. Rien n'a changé dans la DONNÉE — c'est l'HORLOGE qui a
            // bougé —, or une vue ne se reconstruit que si son entrée change.
            // Réassigner la ligne telle quelle est donc le geste juste : il ne
            // ment sur rien et fait re-résoudre `protection()` avec un `now`
            // frais, qui rendra `.imminent` au lieu de `.running`.
            restampMessagesEnteringLastMinute(now: now)
            refreshEphemeralExpirySchedule()
            return
        }

        // **La destruction se VOIT** (#7467). Le message n'est pas retiré tout
        // de suite : il passe d'abord par l'état EN DESTRUCTION, le temps que
        // la combustion se joue. Retirer sans transition se lit comme un SAUT
        // de liste — le lecteur croit avoir raté un défilement et cherche le
        // message plus haut.
        let fresh = due.filter { id in
            guard let index = messageIndex(for: id) else { return false }
            return !messages[index].isBurning
        }
        guard !fresh.isEmpty else {
            // Déjà en combustion : le réveil suivant n'en rallume pas une
            // seconde, et ne replanifie pas un second retrait.
            refreshEphemeralExpirySchedule()
            return
        }

        for id in fresh {
            guard let index = messageIndex(for: id) else { continue }
            messages[index].isBurning = true
        }

        let reduceMotion = UIAccessibility.isReduceMotionEnabled
        let burning = Set(fresh)
        Task { @MainActor [weak self] in
            let duration = EphemeralBurn.duration(reduceMotion: reduceMotion)
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            guard let self else { return }
            for id in burning { EphemeralReceiptLedger.shared.noteDestruction(of: id) }
            // Le repli des voisins est ANIMÉ : c'est la seconde moitié de
            // l'effet — la combustion montre la destruction, le repli montre
            // que la place est rendue.
            withAnimation(.easeInOut(duration: 0.25)) {
                self.messages.removeAll { burning.contains($0.id) }
            }
            self.refreshEphemeralExpirySchedule()
        }
    }

    /// Réassigne les lignes qui viennent d'entrer dans leur dernière minute.
    ///
    /// Bornée aux messages CONCERNÉS — jamais la liste entière : réassigner
    /// tout le fil à chaque réveil coûterait une reconstruction complète pour
    /// un badge.
    private func restampMessagesEnteringLastMinute(now: Date) {
        for (id, deadline) in ephemeralDeadlines {
            let remaining = deadline.timeIntervalSince(now)
            guard remaining > 0, remaining <= EphemeralDeadline.countdownThreshold else { continue }
            guard let index = messageIndex(for: id) else { continue }
            let message = messages[index]
            messages[index] = message
        }
    }

    /// Réarme l'unique réveil du fil. Appelé à chaque changement de `messages`.
    func refreshEphemeralExpirySchedule() {
        ephemeralExpiry.refresh(deadlines: ephemeralDeadlines)
    }
}
