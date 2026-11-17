import Foundation
import os

/// La file des scellements d'UN appareil local (IOS-08, #18946) : un seul à la
/// fois, dans l'ordre d'arrivée.
///
/// Deux scellements simultanés vers un appareil sans session — le toucher
/// « Envoyer » émet À LA FOIS la fin de frappe et le message — lisaient chacun
/// « pas de session », réservaient chacun un bundle et ouvraient chacun une
/// session : l'appareil du correspondant pouvait garder celle que l'iPhone
/// venait de remplacer. Mes appareils approuvés, cibles de TOUS les
/// scellements, le subissaient aussi d'une conversation à l'autre : un verrou
/// par correspondant ne les couvrait pas.
///
/// Une FRAPPE n'y retient jamais un message (R-1, audit de #19078) : réémise
/// toutes les trois secondes, elle tenait la file deux allers-retours vers
/// l'annuaire, et sur un réseau lent le message attendait derrière des frappes
/// périmées. Seule la DERNIÈRE frappe en attente vaut (une plus récente la
/// remplace) ; un message passe devant elle ; et un message qui demande son
/// tour INTERROMPT la frappe en cours, qui rend la main avant qu'il ne la
/// prenne — un seul scellement à la fois, toujours — puis se remet derrière
/// lui si aucune frappe plus récente n'attend.
///
/// `shared(for:)` sert UNE file par appareil local et par processus : deux
/// scelleurs du même appareil (une session rouverte pendant qu'un envoi
/// s'achève) passent par la même. La file ne s'emboîte pas : un `body` ne
/// rescelle jamais par elle.
final class E2EESealingQueue: Sendable {
    private struct State: Sendable {
        var busy = false
        var waiters: [CheckedContinuation<Void, Never>] = []
        /// La frappe qui attend, la seule qui vaille.
        var typingWaiter: TypingWaiter?
        /// Le numéro de la frappe la plus récente : une frappe interrompue qui
        /// ne l'est plus ne repart pas, qu'une plus récente attende, coure ou soit partie.
        var latestTyping = 0
        /// Ce qui interrompt la frappe en cours.
        var interruptTyping: (@Sendable () -> Void)?
        var typingInterrupted = false
    }

    /// Une frappe en attente : son tour rend son numéro, `nil` quand une plus récente la remplace.
    private struct TypingWaiter: Sendable {
        let continuation: CheckedContinuation<Int?, Never>
        let ticket: Int
    }

    private enum Turn: Sendable {
        case seal(CheckedContinuation<Void, Never>)
        case typing(TypingWaiter)
        case idle
    }

    private enum TypingEntry: Sendable {
        case now(Int)
        case waits(superseding: TypingWaiter?)
        case yields
    }

    private static let queues = OSAllocatedUnfairLock<[String: E2EESealingQueue]>(initialState: [:])

    private let state = OSAllocatedUnfairLock(initialState: State())

    static func shared(for device: E2EELocalDevice) -> E2EESealingQueue {
        let key = "\(E2EEAccountId.normalized(device.userId)).\(device.deviceId)"
        return queues.withLock { queues in
            if let existing = queues[key] { return existing }
            let created = E2EESealingQueue()
            queues[key] = created
            return created
        }
    }

    /// Ce qui attend son tour : les scellements, et s'il y a une frappe.
    var waiting: (seals: Int, typing: Bool) {
        state.withLock { state in (state.waiters.count, state.typingWaiter != nil) }
    }

    func run<T>(_ body: () async throws -> T) async rethrows -> T {
        await acquire()
        defer { release() }
        return try await body()
    }

    /// Une frappe : `CancellationError` quand une frappe plus récente la
    /// remplace, ou quand, interrompue par un message, elle cède sa place à une
    /// plus récente. Le `body` s'exécute dans une tâche que l'interruption annule.
    func runTyping<T: Sendable>(_ body: @escaping @Sendable () async throws -> T) async throws -> T {
        var ticket: Int?
        while true {
            guard let granted = await acquireTyping(ticket: ticket) else { throw CancellationError() }
            ticket = granted
            let task = Task { try await body() }
            startTyping(task)
            let result = await withTaskCancellationHandler { await task.result } onCancel: { task.cancel() }
            let interrupted = finishTyping()
            guard interrupted, case .failure = result, !Task.isCancelled else { return try result.get() }
        }
    }

    private func acquire() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let (entersNow, interrupt) = state.withLock { state -> (Bool, (@Sendable () -> Void)?) in
                guard state.busy else {
                    state.busy = true
                    return (true, nil)
                }
                state.waiters.append(continuation)
                let interrupt = state.interruptTyping
                state.interruptTyping = nil
                if interrupt != nil { state.typingInterrupted = true }
                return (false, interrupt)
            }
            interrupt?()
            if entersNow { continuation.resume() }
        }
    }

    /// Le tour d'une frappe : une nouvelle prend le numéro suivant ; une frappe
    /// interrompue garde le sien, et ne repart que si elle est encore la plus récente.
    private func acquireTyping(ticket: Int?) async -> Int? {
        await withCheckedContinuation { (continuation: CheckedContinuation<Int?, Never>) in
            let entry = state.withLock { state -> TypingEntry in
                if ticket == nil { state.latestTyping += 1 }
                let mine = ticket ?? state.latestTyping
                guard mine == state.latestTyping else { return .yields }
                guard state.busy else {
                    state.busy = true
                    return .now(mine)
                }
                let superseded = state.typingWaiter
                state.typingWaiter = TypingWaiter(continuation: continuation, ticket: mine)
                return .waits(superseding: superseded)
            }
            switch entry {
            case .now(let mine): continuation.resume(returning: mine)
            case .yields: continuation.resume(returning: nil)
            case .waits(let superseded): superseded?.continuation.resume(returning: nil)
            }
        }
    }

    /// La frappe commence : un message arrivé entre-temps l'interrompt aussitôt.
    private func startTyping<T: Sendable>(_ task: Task<T, any Error>) {
        let interruptsNow = state.withLock { state -> Bool in
            state.typingInterrupted = !state.waiters.isEmpty
            if !state.typingInterrupted { state.interruptTyping = { task.cancel() } }
            return state.typingInterrupted
        }
        if interruptsNow { task.cancel() }
    }

    /// La frappe rend la main ; elle dit si un message l'a interrompue.
    private func finishTyping() -> Bool {
        let interrupted = state.withLock { state -> Bool in
            let interrupted = state.typingInterrupted
            state.typingInterrupted = false
            return interrupted
        }
        release()
        return interrupted
    }

    private func release() {
        let turn = state.withLock { state -> Turn in
            state.interruptTyping = nil
            if !state.waiters.isEmpty { return .seal(state.waiters.removeFirst()) }
            guard let typing = state.typingWaiter else {
                state.busy = false
                return .idle
            }
            state.typingWaiter = nil
            return .typing(typing)
        }
        switch turn {
        case .seal(let next): next.resume()
        case .typing(let next): next.continuation.resume(returning: next.ticket)
        case .idle: break
        }
    }
}
