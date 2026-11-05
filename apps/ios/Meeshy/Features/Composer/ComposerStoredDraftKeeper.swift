import Foundation
import MeeshySDK
import MeeshyUI

/// **Qui tient le brouillon de « Mes stories » quand la scène est celle du
/// meuble** (#15629).
///
/// Reprendre un brouillon et modifier une story publiée écrivaient sous
/// `StoryDraftStore` par l'atelier du SDK. Ils se composent désormais sur la
/// scène du meuble, dont la sauvegarde propre (`ComposerAutosaveController`)
/// ne tient que la CRÉATION : sans ce gardien, la reprise rouvrait une scène
/// vide et l'édition en cours se perdait au premier kill.
nonisolated enum ComposerStoredDraftScope {

    /// Le brouillon adopté se reprend et s'écrit ; une édition de story s'écrit
    /// sous son lien d'édition. Les autres hydratations (republication, édition
    /// d'un post, citation) n'ont aucun brouillon de « Mes stories ».
    static func keepsStoredDraft(adoptsDraft: Bool, hydration: ComposerHydration?) -> Bool {
        if adoptsDraft { return true }
        guard case .editingStory = hydration else { return false }
        return true
    }

    /// L'audience reprise : un mode à liste ne survit qu'avec sa liste, sinon il
    /// publierait vers personne — il retombe alors sur les amis.
    static func restoredAudience(_ repris: StoryStoredDraftRestoration) -> (visibility: PostVisibility, userIds: [String]) {
        let mode = PostVisibility(served: repris.visibility)
        guard !mode.requiresUserSelection || !repris.visibilityUserIds.isEmpty else {
            return (.friends, repris.visibilityUserIds)
        }
        return (mode, repris.visibilityUserIds)
    }
}

@MainActor
final class ComposerStoredDraftKeeper: ObservableObject {

    // iOS 26.1 : deinit synthétisée isolée → double-free au démontage hors tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    typealias Capture = @MainActor () -> StoryStoredDraftFrame

    private let store: StoryDraftStore
    private let debounceNanoseconds: UInt64
    private weak var scene: StoryComposerViewModel?
    private var baseline: Data?
    private var lastStoredMediaKeys: Set<String>?
    private var pending: Task<Void, Never>?
    private(set) var isBound = false
    private(set) var isStopped = false

    /// La fermeture peut-elle promettre « Garder le brouillon » ?
    var keepsDraft: Bool { isBound && !isStopped }

    init(store: StoryDraftStore = .shared, debounceNanoseconds: UInt64 = 2_500_000_000) {
        self.store = store
        self.debounceNanoseconds = debounceNanoseconds
    }

    /// Rattache la scène, reprend le brouillon adopté, et retient la scène
    /// d'ouverture : rien ne s'écrit tant que l'auteur n'y a pas touché.
    func bind(_ scene: StoryComposerViewModel, keeps: Bool) -> StoryStoredDraftRestoration? {
        guard keeps, !isBound else { return nil }
        isBound = true
        self.scene = scene
        let restored = StoryStoredDraft.restoreAdopted(into: scene, from: store)
        baseline = Self.fingerprint(scene.slides)
        return restored
    }

    func schedule(_ capture: @escaping Capture) {
        guard keepsDraft, pending == nil else { return }
        let attente = debounceNanoseconds
        pending = Task { [weak self] in
            guard await cancellableSleep(for: .nanoseconds(attente)), !Task.isCancelled else { return }
            self?.pending = nil
            self?.write(capture)
        }
    }

    func flush(_ capture: Capture) {
        pending?.cancel()
        pending = nil
        write(capture)
    }

    /// Publication acceptée : la file possède désormais le brouillon (elle
    /// l'efface au succès, le garde à l'échec). Plus rien n'écrit.
    func stopWriting() {
        isStopped = true
        pending?.cancel()
        pending = nil
    }

    /// « Abandonner » : l'auteur jette ce qu'il tenait.
    func discard() {
        stopWriting()
        guard isBound, let scene else { return }
        store.delete(draftId: scene.draftId)
    }

    private func write(_ capture: Capture) {
        guard keepsDraft, let scene, Self.fingerprint(scene.slides) != baseline else { return }
        lastStoredMediaKeys = StoryStoredDraft.persist(scene, frame: capture(), to: store,
                                                       lastStoredMediaKeys: lastStoredMediaKeys)
    }

    private static func fingerprint(_ slides: [StorySlide]) -> Data? {
        let codeur = JSONEncoder()
        codeur.outputFormatting = [.sortedKeys]
        return try? codeur.encode(slides)
    }
}
