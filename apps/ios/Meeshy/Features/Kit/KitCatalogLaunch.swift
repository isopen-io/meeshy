#if DEBUG
import Foundation

/// **Accès DEBUG au catalogue du kit**, sans compte ni réseau — pour voir chaque
/// composant dans tous ses états, au simulateur.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyKitCatalogue K02
/// ```
///
/// Sans clé, la liste des composants livrés s'ouvre ; avec une clé livrée, le
/// détail de ce composant. Une clé inconnue ou non livrée laisse la liste.
///
/// Rien de ceci n'existe dans un build Release : le fichier entier est sous
/// `#if DEBUG`, et ses sites d'appel aussi.
enum KitCatalogLaunch {
    static let argument = "-MeeshyKitCatalogue"

    static func isActive(in arguments: [String]) -> Bool {
        arguments.contains(argument)
    }

    static func requestedKey(in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: argument), arguments.indices.contains(index + 1) else { return nil }
        let value = arguments[index + 1]
        return value.hasPrefix("-") ? nil : value
    }

    static var isActive: Bool {
        isActive(in: ProcessInfo.processInfo.arguments)
    }

    static var requestedKey: String? {
        requestedKey(in: ProcessInfo.processInfo.arguments)
    }
}
#endif
