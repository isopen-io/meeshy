import Foundation

/// **Une valeur que le premier écran attend, résolue sur une file à part dès le lancement** (#11558).
///
/// `start(on:)` la lance ; `value()` la RAMASSE, en attendant au plus la
/// résolution en vol (borne `waitLimit`, au-delà de laquelle l'appelant la
/// calcule lui-même plutôt que de rester bloqué). Sans lancement préalable,
/// `value()` la calcule sur place, une fois. Rien ne survit au processus : une
/// valeur qui peut changer d'un lancement à l'autre (le chemin d'un conteneur)
/// n'est jamais servie périmée.
public final class PrefetchedValue<Value: Sendable>: Sendable {
    private let compute: @Sendable () -> Value
    private let resolved = Locked<Value?>(nil)
    private let launched = Locked(false)
    private let landing = DispatchGroup()
    private let waitLimit: DispatchTimeInterval

    public init(waitLimit: DispatchTimeInterval = .seconds(2), _ compute: @escaping @Sendable () -> Value) {
        self.waitLimit = waitLimit
        self.compute = compute
    }

    public func start(on queue: DispatchQueue) {
        let begins = launched.mutate { launched -> Bool in
            defer { launched = true }
            return !launched
        }
        guard begins else { return }
        landing.enter()
        queue.async { [self] in
            keep(compute())
            landing.leave()
        }
    }

    public func value() -> Value {
        if launched.read({ $0 }) {
            _ = landing.wait(timeout: .now() + waitLimit)
        }
        if let held = resolved.read({ $0 }) { return held }
        return keep(compute())
    }

    @discardableResult
    private func keep(_ value: Value) -> Value {
        resolved.mutate { held -> Value in
            if let held { return held }
            held = value
            return value
        }
    }
}
