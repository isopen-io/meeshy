import Foundation
import MeeshySDK

// MARK: - Par où un écran détail est arrivé (#10483)

/// **Ouvrir un post depuis une notification n'est pas l'ouvrir depuis le fil,
/// ni depuis un lien de suivi.**
///
/// La porte qui AMÈNE un écran détail (le tap d'un listing, le routeur de
/// notification, le routeur des liens) MARQUE le contenu qu'elle ouvre de son
/// entrée (`ContentEntry`) ; l'écran détail (détail de post, lecteur de réels,
/// lecteur de story, écran visiteur) CONSOMME la marque à sa première
/// apparition et la porte sur sa vue. Sans marque, l'entrée est `direct`.
///
/// La marque vit une minute — une porte qui n'aboutit pas sur l'écran attendu
/// ne déteint pas sur une ouverture ultérieure — et ne se lit qu'une fois.
protocol DetailOpenSourceProviding: AnyObject {
    @MainActor func mark(_ postId: String, entry: ContentEntry)
    /// La marque encore valide du contenu, consommée ; `nil` sans marque.
    @MainActor func consumeMarkedEntry(for postId: String) -> ContentEntry?
}

extension DetailOpenSourceProviding {
    /// L'entrée du contenu, consommée ; `direct` sans marque.
    @MainActor func consumeEntry(for postId: String) -> ContentEntry {
        consumeMarkedEntry(for: postId) ?? .direct
    }

    @MainActor func markOpenedFromNotification(_ postId: String) {
        mark(postId, entry: .notification)
    }

    /// La source de l'impression d'ouverture du détail (`detail`,
    /// `notification`, `shared_link`) — la marque est consommée.
    @MainActor func consumeSource(for postId: String) -> String {
        consumeEntry(for: postId).detailImpressionSource
    }
}

@MainActor
final class DetailOpenSources: DetailOpenSourceProviding {
    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = DetailOpenSources()
    static let markLifetime: TimeInterval = 60
    static let notificationSource = "notification"
    static let detailSource = "detail"

    private let clock: () -> Date
    private var marks: [String: (entry: ContentEntry, at: Date)] = [:]

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    /// Les marques jamais consommées (un tap dont le détail ne s'ouvre pas) restaient pour toute la vie du processus :
    /// chaque nouvelle marque purge celles qui ont passé `markLifetime`, déjà illisibles par `consumeMarkedEntry`.
    func mark(_ postId: String, entry: ContentEntry) {
        guard !postId.isEmpty else { return }
        let now = clock()
        marks = marks.filter { now.timeIntervalSince($0.value.at) <= Self.markLifetime }
        marks[postId] = (entry, now)
    }

    var markCount: Int { marks.count }

    func consumeMarkedEntry(for postId: String) -> ContentEntry? {
        defer { marks[postId] = nil }
        guard let mark = marks[postId], clock().timeIntervalSince(mark.at) <= Self.markLifetime else {
            return nil
        }
        return mark.entry
    }
}
