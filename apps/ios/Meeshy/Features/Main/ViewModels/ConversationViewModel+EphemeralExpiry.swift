import Foundation
import UIKit
import MeeshySDK
import SwiftUI
import os

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
    func refresh(deadlines: [String: Date]) {
        let plan = EphemeralExpirySchedule.plan(deadlines: deadlines, now: Date())

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

    var ephemeralDeadlines: [String: Date] {
        EphemeralExpiryLaw.deadlines(of: messages, now: Date())
    }

    var elapsedEphemeralIds: Set<String> {
        EphemeralExpiryLaw.elapsedIds(in: messages, now: Date())
    }

    var scheduledEphemeralDeadlines: [String: Date] {
        EphemeralExpiryLaw.scheduled(for: messages, now: Date())
    }

    /// Retire de l'écran les éphémères échus, et purge ce qu'un texte DÉRIVÉ
    /// en garderait (#7452, exigence 3 : « aucun texte dérivé ne garde le
    /// contenu d'un éphémère au-delà de son échéance »).
    ///
    /// `ids` vide ⇒ le réveil a simplement sonné : c'est `ephemeralDeadlines`,
    /// recalculé à l'instant, qui dit ce qui est échu. L'appelant n'a pas à
    /// tenir cette liste à jour entre deux réveils.
    func expireEphemeralsIfNeeded(_ ids: [String] = []) {
        let outcome = EphemeralExpiryTriage.triage(
            ids: ids,
            deadlines: ephemeralDeadlines,
            elapsed: elapsedEphemeralIds,
            now: Date(),
            isBurning: { id in messageIndex(for: id).map { messages[$0].isBurning } }
        )
        switch outcome {
        case .threshold(let restamp):
            // Rien n'a changé dans la DONNÉE — c'est l'HORLOGE qui a bougé —,
            // or une vue ne se reconstruit que si son entrée change. Réassigner
            // la ligne telle quelle est donc le geste juste : il ne ment sur
            // rien et fait re-résoudre `protection()` avec un `now` frais, qui
            // rendra `.imminent` au lieu de `.running`.
            restampMessages(withIds: restamp)
            refreshEphemeralExpirySchedule()
        case .alreadyBurning:
            // Déjà en combustion : le réveil suivant n'en rallume pas une
            // seconde, et ne replanifie pas un second retrait.
            refreshEphemeralExpirySchedule()
        case .expire(let alreadyDead, let burning):
            retire(alreadyDead: alreadyDead, burning: burning)
        }
    }

    private func retire(alreadyDead: Set<String>, burning: Set<String>) {
        if !alreadyDead.isEmpty {
            messages.removeAll { alreadyDead.contains($0.id) }
            messageStore.dropGoneEphemerals()
            purgeQuoteCascade(fromDead: Array(alreadyDead))
        }
        guard !burning.isEmpty else { return }

        for id in burning {
            guard let index = messageIndex(for: id) else { continue }
            messages[index].isBurning = true
            burningEphemeralIds[id] = true
        }

        let reduceMotion = UIAccessibility.isReduceMotionEnabled
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
            // #8382 — le fil rend `MessageStore`, pas `messages` : sans cette
            // republication, Focal et Script gardaient la ligne à 0:00 jusqu'à
            // la prochaine écriture en base.
            self.messageStore.dropGoneEphemerals()
            for id in burning { self.burningEphemeralIds.removeValue(forKey: id) }
            self.refreshEphemeralExpirySchedule()
            self.purgeQuoteCascade(fromDead: Array(burning))
        }
    }

    /// #10433 — les réponses d'un mort quittent la BASE avec lui : sans quoi
    /// elles revenaient au fil dès que le message cité sortait de la fenêtre.
    func purgeQuoteCascade(fromDead ids: [String]) {
        guard !ids.isEmpty else { return }
        let persistence = messagePersistence
        Task {
            do {
                try await persistence.purgeQuoteCascade(fromDead: ids)
            } catch {
                Logger.messages.warning("[EphemeralExpiry] purgeQuoteCascade failed \(ids.count, privacy: .public) id(s): \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Repose la combustion en cours sur des messages relus du magasin : une
    /// écriture GRDB pendant la combustion ne la remet pas à zéro (#8382).
    func applyingEphemeralBurns(_ incoming: [Message]) -> [Message] {
        guard !burningEphemeralIds.isEmpty else { return incoming }
        return incoming.map { message in
            guard burningEphemeralIds[message.id] == true, !message.isBurning else { return message }
            var burning = message
            burning.isBurning = true
            return burning
        }
    }

    /// Réassigne les lignes qui viennent d'entrer dans leur dernière minute.
    ///
    /// Bornée aux messages CONCERNÉS — jamais la liste entière : réassigner
    /// tout le fil à chaque réveil coûterait une reconstruction complète pour
    /// un badge.
    private func restampMessages(withIds ids: [String]) {
        for id in ids {
            guard let index = messageIndex(for: id) else { continue }
            let message = messages[index]
            messages[index] = message
        }
    }

    /// Réarme l'unique réveil du fil. Appelé à chaque changement de `messages`.
    func refreshEphemeralExpirySchedule() {
        ephemeralExpiry.refresh(deadlines: scheduledEphemeralDeadlines)
    }
}
