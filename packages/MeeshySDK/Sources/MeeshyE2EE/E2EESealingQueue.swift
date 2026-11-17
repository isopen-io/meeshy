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
/// par correspondant ne les couvrait pas. Le débit est celui d'un humain qui
/// tape : tout sérialiser ne coûte rien.
///
/// `shared(for:)` sert UNE file par appareil local et par processus : deux
/// scelleurs du même appareil (une session rouverte pendant qu'un envoi
/// s'achève) passent par la même. La file ne s'emboîte pas : un `body` ne
/// rescelle jamais par elle.
final class E2EESealingQueue: Sendable {
    private struct State {
        var busy = false
        var waiters: [CheckedContinuation<Void, Never>] = []
    }

    private static let queues = OSAllocatedUnfairLock<[String: E2EESealingQueue]>(initialState: [:])

    private let state = OSAllocatedUnfairLock(initialState: State())

    static func shared(for device: E2EELocalDevice) -> E2EESealingQueue {
        let key = "\(device.userId.lowercased()).\(device.deviceId)"
        return queues.withLock { queues in
            if let existing = queues[key] { return existing }
            let created = E2EESealingQueue()
            queues[key] = created
            return created
        }
    }

    func run<T>(_ body: () async throws -> T) async rethrows -> T {
        await acquire()
        defer { release() }
        return try await body()
    }

    private func acquire() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let entersNow = state.withLock { state -> Bool in
                guard state.busy else {
                    state.busy = true
                    return true
                }
                state.waiters.append(continuation)
                return false
            }
            if entersNow { continuation.resume() }
        }
    }

    private func release() {
        let next = state.withLock { state -> CheckedContinuation<Void, Never>? in
            guard !state.waiters.isEmpty else {
                state.busy = false
                return nil
            }
            return state.waiters.removeFirst()
        }
        next?.resume()
    }
}
