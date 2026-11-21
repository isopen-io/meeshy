import Foundation
import AppIntents

/// **Un appui sur un avatar du widget « Mes proches » ouvre sa vitrine** (planche `Hors-App`, vue 3, #19524).
///
/// Le petit widget n'a qu'une zone de lien : chaque avatar est donc un bouton d'intention. Compilé dans les DEUX cibles
/// (`project.yml`) ; l'intention s'exécute dans l'app (`openAppWhenRun`) et confie l'adresse de la vitrine à
/// `VitrineOpenRouter`, que l'app branche au démarrage. Arrivée avant ce branchement (démarrage à froid), l'adresse
/// attend et part au branchement — jamais perdue, jamais devinée.
@MainActor
final class VitrineOpenRelay {
    private var handler: ((URL) -> Void)?
    private var pending: URL?

    nonisolated deinit {}

    func install(_ open: @escaping (URL) -> Void) {
        handler = open
        guard let waiting = pending else { return }
        pending = nil
        open(waiting)
    }

    func open(_ url: URL) {
        guard let handler else {
            pending = url
            return
        }
        handler(url)
    }
}

@MainActor
enum VitrineOpenRouter {
    static let shared = VitrineOpenRelay()

    static func install(_ open: @escaping (URL) -> Void) {
        shared.install(open)
    }

    static func open(_ url: URL) {
        shared.open(url)
    }

    /// La vitrine d'un pseudo (`DeepLinkRouter` : `u/<pseudo>` → `.userProfile`) ; `nil` sans pseudo lisible.
    static func vitrineURL(username: String) -> URL? {
        let handle = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        guard !handle.isEmpty, let segment = handle.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "meeshy://u/\(segment)")
    }
}

@available(iOS 17.0, *)
struct OpenVitrineIntent: nonisolated AppIntent {
    static let title: LocalizedStringResource = "Meeshy"
    static let isDiscoverable = false
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Username")
    var username: String

    init() {
        username = ""
    }

    init(username: String) {
        self.username = username
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        if let url = VitrineOpenRouter.vitrineURL(username: username) {
            VitrineOpenRouter.open(url)
        }
        return .result()
    }
}
