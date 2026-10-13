import Foundation

// MARK: - D'où vient l'ouverture d'un détail (#10483)

/// **Ouvrir un post depuis une notification n'est pas l'ouvrir depuis le fil.**
///
/// L'impression d'ouverture du détail portait toujours la source `detail`,
/// si bien qu'aucune impression `notification` n'existait : la portée des
/// notifications était invisible. Le routeur de notification MARQUE le post
/// qu'il ouvre ; le détail CONSOMME la marque à sa première apparition. La
/// marque vit une minute — un tap de notification qui n'aboutit pas sur le
/// détail (story, réel) ne déteint pas sur une ouverture ultérieure.
protocol DetailOpenSourceProviding: AnyObject {
    @MainActor func markOpenedFromNotification(_ postId: String)
    @MainActor func consumeSource(for postId: String) -> String
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
    private var marks: [String: Date] = [:]

    init(clock: @escaping () -> Date = Date.init) {
        self.clock = clock
    }

    func markOpenedFromNotification(_ postId: String) {
        guard !postId.isEmpty else { return }
        marks[postId] = clock()
    }

    func consumeSource(for postId: String) -> String {
        defer { marks[postId] = nil }
        guard let markedAt = marks[postId], clock().timeIntervalSince(markedAt) <= Self.markLifetime else {
            return Self.detailSource
        }
        return Self.notificationSource
    }
}
