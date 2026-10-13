import Foundation
import MeeshySDK

// MARK: - L'écran visiteur compte ce qu'il montre (#10483)

/// **Un contenu servi à un lecteur sans compte est un affichage ET une vue.**
///
/// L'écran visiteur (#9171) était le trou central du comptage : un lien
/// universel ouvert sans session montrait la publication, le réel ou la story
/// sans qu'aucune trace ne parte. Au premier service d'un contenu, une
/// impression `detail` sur la surface `visitor` et une vue ; à la sortie, la
/// vue repart avec sa durée de lecture — la passerelle ne garde que la plus
/// longue, sans compter une seconde vue.
///
/// `ObservableObject` uniquement pour être tenu par un `@StateObject` : aucune
/// propriété publiée, le comptage ne redessine rien.
@MainActor
final class VisitorContentReach: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Le plafond de durée que la porte accepte (5 minutes).
    static let maxDurationMs = 300_000

    private let reporter: VisitorReachReporting
    private let entries: DetailOpenSourceProviding
    private let clock: () -> Date
    private var current: (postId: String, since: Date, entry: ContentEntry)?

    init(
        reporter: VisitorReachReporting = VisitorReachReporter.shared,
        entries: DetailOpenSourceProviding = DetailOpenSources.shared,
        clock: @escaping () -> Date = Date.init
    ) {
        self.reporter = reporter
        self.entries = entries
        self.clock = clock
    }

    /// L'écran a changé d'état. Seul le PREMIER service d'un contenu compte :
    /// un « Réessayer » qui rend le même post ne le recompte pas. L'entrée (le
    /// lien de suivi, le lien `?via=`, le lien venu d'ailleurs) est celle que
    /// le routeur des liens a marquée ; les deux vues la portent.
    func stateChanged(_ state: VisitorContentState) {
        guard case .served(let post, _) = state, current?.postId != post.id else { return }
        let entry = entries.consumeEntry(for: post.id)
        current = (post.id, clock(), entry)
        reporter.record([
            .impression(postId: post.id, source: entry.detailImpressionSource, surface: .visitor),
            .view(postId: post.id, durationMs: nil, surface: .visitor, entry: entry),
        ])
    }

    /// L'écran se ferme : la vue repart avec sa durée, et la file se vide.
    func left() async {
        guard let current else { return }
        self.current = nil
        let elapsedMs = Int(max(0, clock().timeIntervalSince(current.since)) * 1000)
        reporter.record([
            .view(postId: current.postId, durationMs: min(elapsedMs, Self.maxDurationMs), surface: .visitor, entry: current.entry),
        ])
        await reporter.flushNow()
    }
}
