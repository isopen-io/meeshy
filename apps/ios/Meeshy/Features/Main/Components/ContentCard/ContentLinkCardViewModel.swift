import Combine
import Foundation
import MeeshySDK

/// Les états de la carte d'un lien de contenu (#19332, contrat § 3) — servis
/// cache d'abord : une carte déjà connue paraît à la première image, même
/// périmée ; le squelette n'existe que sur cache vide.
@MainActor
final class ContentLinkCardViewModel: ObservableObject {
    nonisolated deinit {}

    enum Phase: Equatable {
        /// Rien de connu : le squelette de la carte, jamais une roue.
        case loading
        case card(ContentCard)
        /// Supprimé, expiré ou hors audience : une ligne atténuée, non cliquable.
        case unavailable(PostType?)
        /// Pas un contenu, ou une panne sans rien en mémoire : ce que l'hôte
        /// montrait avant la carte (l'aperçu générique dans une bulle).
        case fallback
    }

    @Published private(set) var phase: Phase

    let target: ContentLinkTarget
    /// Le contenu qui porte le lien : il ne se cite jamais lui-même.
    let excludedPostId: String?
    private let store: ContentCardStoreProviding
    private var isFresh: Bool

    init(target: ContentLinkTarget, store: ContentCardStoreProviding, excludedPostId: String? = nil) {
        self.target = target
        self.store = store
        self.excludedPostId = excludedPostId
        switch store.cached(target) {
        case .fresh(let resolution, _):
            phase = Self.phase(after: resolution, current: .loading, excluding: excludedPostId)
            isFresh = true
        case .stale(let resolution, _):
            phase = Self.phase(after: resolution, current: .loading, excluding: excludedPostId)
            isFresh = false
        case .expired, .empty:
            phase = .loading
            isFresh = false
        }
    }

    /// Relit la carte, sauf si le cache est frais. Une carte affichée reste à
    /// l'écran pendant la relecture, et après une panne.
    func load() async {
        guard !isFresh else { return }
        let resolution = await store.refresh(target)
        isFresh = true
        phase = Self.phase(after: resolution, current: phase, excluding: excludedPostId)
    }

    /// Où le toucher mène, par le routeur des liens profonds : le lien suivi
    /// tel quel (le clic se compte, la cible se relit), l'adresse canonique du
    /// contenu sinon — un réel s'ouvre dans le lecteur de réels même quand le
    /// lien était l'ancienne forme `/feeds/post/<id>`.
    func destinationURL(linkURL: String, webOrigin: String) -> URL? {
        guard case .card(let card) = phase else { return nil }
        switch target {
        case .tracked:
            return URL(string: linkURL.trimmingCharacters(in: .whitespacesAndNewlines))
        case .content:
            return URL(string: ContentLinkTarget.webURL(origin: webOrigin, type: card.kind, postId: card.postId))
        }
    }

    static func phase(after resolution: ContentCardResolution, current: Phase, excluding excludedPostId: String?) -> Phase {
        switch resolution {
        case .card(let card) where card.postId.lowercased() == excludedPostId?.lowercased():
            return .fallback
        case .card(let card):
            return .card(card)
        case .unavailable(let kind):
            return .unavailable(kind)
        case .notContent:
            return .fallback
        case .failed:
            if case .card = current { return current }
            return .fallback
        }
    }
}
