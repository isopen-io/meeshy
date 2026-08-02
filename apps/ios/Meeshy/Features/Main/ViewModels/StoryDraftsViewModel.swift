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

    func reload() {
        drafts = store.listDrafts()
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
