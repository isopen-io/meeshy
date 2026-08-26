import Foundation
import Combine
import MeeshySDK

/// Inventaire des brouillons de story, pour l'onglet « Brouillons ».
///
/// `StoryDraftStore.listDrafts()` lit SQLite en synchrone : l'appeler depuis
/// un `body` SwiftUI le ferait à chaque évaluation de vue. Le chargement se
/// fait donc une fois, ici, puis au retour en avant-plan — même patron que
/// `StoryPublishService.refreshQueueState`.
@MainActor
final class StoryDraftsViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published private(set) var drafts: [StoryDraftSummary] = []

    private let store: StoryDraftStore
    private var cancellables = Set<AnyCancellable>()

    init(store: StoryDraftStore = .shared, observeForeground: Bool = true) {
        self.store = store
        guard observeForeground else { return }
        NotificationCenter.default
            .publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in self?.reload() }
            .store(in: &cancellables)
    }

    /// Filtre les brouillons GELÉS (`pendingPublishAt` non nil, directive
    /// 2026-08-02) : une publication est en cours pour eux, ils ne doivent
    /// apparaître dans AUCUNE liste de reprise tant que la file travaille —
    /// les rouvrir en édition pendant qu'ils voyagent vers le serveur
    /// corromprait le brouillon que le succès/l'échec s'apprête à consommer.
    /// `StoryDraftStore.listDrafts()` continue de les EXPOSER (le store est
    /// la source de vérité brute) ; c'est ce consommateur UI qui les cache.
    func reload() {
        drafts = store.listDrafts().filter { $0.pendingPublishAt == nil }
    }

    /// Supprime un brouillon et son sous-répertoire de médias, puis rafraîchit
    /// la liste. Optimiste : la ligne disparaît avant la relecture du store,
    /// sinon la grille attend une lecture disque pour réagir au geste.
    func delete(_ draftId: String) {
        drafts.removeAll { $0.id == draftId }
        store.delete(draftId: draftId)
        reload()
    }
}

#if canImport(UIKit)
import UIKit
#endif
