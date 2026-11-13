#if DEBUG
import Foundation
import MeeshyUI

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
/// `#if DEBUG`, et ses sites d'appel aussi. Lecture pure des arguments, donc
/// hors du MainActor : les témoins (bundle non isolé) l'appellent directement.
nonisolated enum KitCatalogLaunch {
    static let argument = "-MeeshyKitCatalogue"

    static func isActive(in arguments: [String]) -> Bool {
        arguments.contains(argument)
    }

    static func requestedKey(in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: argument), arguments.indices.contains(index + 1) else { return nil }
        let value = arguments[index + 1]
        return value.hasPrefix("-") ? nil : value
    }

    /// La pile de navigation au lancement : le détail de la clé demandée si elle
    /// est livrée, la liste sinon.
    static func initialPath(
        in arguments: [String],
        entries: [MeeshyKitCatalogEntry] = MeeshyKitCatalog.entries
    ) -> [String] {
        requestedKey(in: arguments)
            .flatMap { MeeshyKitCatalog.listedEntry(matching: $0, in: entries) }
            .map { [$0.key] } ?? []
    }

    static var isActive: Bool {
        isActive(in: ProcessInfo.processInfo.arguments)
    }

    static var initialPath: [String] {
        initialPath(in: ProcessInfo.processInfo.arguments)
    }
}
#endif
