import os

/// Mémoïsation à UNE entrée : la dernière clé et sa valeur.
///
/// Les résolveurs « hoistés » de la timeline (pistes, jonctions, marqueurs)
/// repassaient sur tout le projet à chaque body. Clés sur la révision du
/// projet : un calcul par version, pas un par évaluation. Une seule entrée —
/// la mémoire reste bornée, et la révision ne revient jamais en arrière.
///
/// Classe, pas struct : c'est un cache de lecture, il se remplit pendant le
/// body sans rien publier (ne jamais l'observer).
@MainActor
final class KeyedMemo<Key: Equatable, Value> {
    nonisolated deinit {}

    private var entry: (key: Key, value: Value)?

    init() {}

    func value(for key: Key, compute: () -> Value) -> Value {
        if let entry, entry.key == key { return entry.value }
        let fresh = compute()
        entry = (key, fresh)
        return fresh
    }
}

/// Révisions de projet UNIQUES pour tout le processus.
///
/// Un compteur par view model repartait de zéro à chaque instance : une vue
/// qui changeait de view model en gardant ses `KeyedMemo` (des `@State`)
/// retrouvait la même clé et servait les pistes de l'ANCIEN projet. Une source
/// unique rend une collision impossible, quelle que soit l'instance.
enum TimelineProjectRevision {
    private static let seed = OSAllocatedUnfairLock(initialState: UInt(0))

    static func next() -> UInt {
        seed.withLock { value in
            value &+= 1
            return value
        }
    }
}
