import Foundation

/// La règle d'ouverture d'une fiche (#10093, #10111), partagée par toutes : ce que le cache garde se peint tout de
/// suite, qu'il soit frais ou périmé ; seul un cache vide ou expiré laisse place au chargement. La synchronisation part
/// ensuite dans tous les cas, et son échec ne retire rien de ce qui est peint.
public enum CacheFirst {
    /// La valeur à peindre avant le réseau, ou `nil` quand il n'y a rien à montrer.
    public static func paintable<T>(_ result: CacheResult<[T]>) -> T? {
        switch result {
        case .fresh(let items, _), .stale(let items, _): return items.first
        case .expired, .empty: return nil
        }
    }
}
