import Foundation

/// **La file série des accès au groupe d'app** (#11558).
///
/// Ouvrir les préférences du groupe d'app, les lire ou y écrire passe par un
/// aller-retour XPC SYNCHRONE (`cfprefsd`, `containermanagerd`). Au démarrage
/// à froid, l'app y publiait la langue d'interface, le compte actif et
/// l'environnement API depuis le fil principal, avant le premier rendu de la
/// liste. Ces valeurs ne servent qu'aux extensions, qui tournent dans d'autres
/// processus : elles partent ici, hors du fil principal.
///
/// Une seule file pour tout le processus : les écritures arrivent dans l'ordre
/// où elles ont été demandées, et une lecture mise en file après une écriture
/// la voit.
public final class AppGroupIO: Sendable {
    public static let shared = AppGroupIO(label: "me.meeshy.app-group.io")

    private let queue: DispatchQueue

    public init(label: String) {
        queue = DispatchQueue(label: label, qos: .userInitiated)
    }

    public func enqueue(_ work: @escaping @Sendable () -> Void) {
        queue.async(execute: work)
    }

    /// Attend que tout ce qui a été mis en file soit fait.
    public func drain() {
        queue.sync {}
    }
}
