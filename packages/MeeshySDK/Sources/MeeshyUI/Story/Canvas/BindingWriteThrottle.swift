import Foundation
import MeeshySDK
import QuartzCore

/// Cadence d'écriture d'un binding alimenté par un geste continu.
///
/// Pincer ou tourner un calque réécrivait le binding du composer à la cadence
/// tactile (60 à 120 Hz), et chaque écriture réévalue le composer entier.
/// 30 Hz suffit à une main : le canvas UIKit, lui, dessine à la cadence du
/// doigt depuis sa propre copie de la slide.
public enum BindingWriteCadence {
    public static let minimumInterval: TimeInterval = 1.0 / 30.0
    /// Un reste plus petit qu'une microseconde est l'erreur d'arrondi de
    /// `now - lastWrite` : l'intervalle est écoulé, différer serait armer un
    /// front de queue pour rien.
    static let elapsedTolerance: TimeInterval = 1e-6

    public enum Decision: Equatable {
        case writeNow
        case deferred(by: TimeInterval)
    }

    public static func decide(now: TimeInterval, lastWrite: TimeInterval?) -> Decision {
        guard let lastWrite else { return .writeNow }
        let remaining = minimumInterval - (now - lastWrite)
        guard remaining > elapsedTolerance else { return .writeNow }
        return .deferred(by: remaining)
    }
}

/// Écrit à front montant, puis garde la DERNIÈRE valeur reçue pour le front
/// descendant : la valeur finale d'un geste part toujours, au plus tard un
/// intervalle après le lâcher. Les valeurs intermédiaires d'une rafale sont
/// écrasées — le mini-aperçu suit à 30 Hz, jamais figé.
@MainActor
public final class BindingWriteThrottle<Value> {
    nonisolated deinit {}

    private let write: (Value) -> Void
    private let clock: () -> TimeInterval
    private let schedule: @MainActor (TimeInterval, @escaping @MainActor () -> Void) -> () -> Void
    private var lastWrite: TimeInterval?
    private var pending: Value?
    private var cancelTrailing: (() -> Void)?

    public init(
        write: @escaping (Value) -> Void,
        clock: @escaping () -> TimeInterval = { CACurrentMediaTime() },
        schedule: @escaping @MainActor (TimeInterval, @escaping @MainActor () -> Void) -> () -> Void = trailingMainSchedule
    ) {
        self.write = write
        self.clock = clock
        self.schedule = schedule
    }

    public func submit(_ value: Value) {
        let now = clock()
        switch BindingWriteCadence.decide(now: now, lastWrite: lastWrite) {
        case .writeNow:
            cancelTrailing?()
            cancelTrailing = nil
            pending = nil
            lastWrite = now
            write(value)
        case .deferred(let delay):
            pending = value
            guard cancelTrailing == nil else { return }
            cancelTrailing = schedule(delay) { [weak self] in _ = self?.flush() }
        }
    }

    /// Écrit la valeur en attente, s'il y en a une, et désarme le front de
    /// queue. Idempotent. Rend `true` quand une valeur attendait : la source
    /// était alors EN AVANCE sur le binding, qui ne doit pas la réécraser.
    @discardableResult
    public func flush() -> Bool {
        cancelTrailing?()
        cancelTrailing = nil
        guard let value = pending else { return false }
        pending = nil
        lastWrite = clock()
        write(value)
        return true
    }
}

/// Planifie `run` sur le main acteur après `delay` ; le retour l'annule.
@MainActor
public func trailingMainSchedule(
    delay: TimeInterval,
    run: @escaping @MainActor () -> Void
) -> () -> Void {
    let task = Task { @MainActor in
        guard await cancellableSleep(for: .seconds(max(0, delay))) else { return }
        run()
    }
    return { task.cancel() }
}
