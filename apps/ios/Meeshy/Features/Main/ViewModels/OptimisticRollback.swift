import Foundation

/// **Défaire SON geste, pas l'écran entier.**
///
/// Un retour en arrière optimiste restaurait un instantané pris AVANT l'attente
/// — `comments = snapshot`, `posts = snapshot`. Or l'attente dure : un refus de
/// la file durable arrive parfois des minutes plus tard. Entre-temps, des
/// commentaires sont arrivés par socket, une page s'est chargée, un autre envoi
/// optimiste est parti : l'instantané les effaçait tous. Défaire, c'est retirer
/// la ligne qu'on a posée — ou remettre celle qu'on a ôtée — et rien d'autre.
nonisolated enum OptimisticRollback {

    /// Retire la ligne optimiste `id`, et elle seule.
    static func withdrawing<T: Identifiable>(_ id: T.ID, from items: [T]) -> (items: [T], removed: Bool) {
        var kept = items
        guard let index = kept.firstIndex(where: { $0.id == id }) else { return (items, false) }
        kept.remove(at: index)
        return (kept, true)
    }

    /// Remet `item` à sa place d'origine (bornée), s'il n'y est pas déjà revenu.
    static func restoring<T: Identifiable>(_ item: T, at index: Int, into items: [T]) -> [T] {
        guard !items.contains(where: { $0.id == item.id }) else { return items }
        var restored = items
        restored.insert(item, at: min(max(0, index), restored.count))
        return restored
    }

    /// Un compteur qui suit la ligne retirée — jamais sous zéro.
    static func decremented(_ count: Int, removed: Bool) -> Int {
        removed ? max(0, count - 1) : count
    }
}
