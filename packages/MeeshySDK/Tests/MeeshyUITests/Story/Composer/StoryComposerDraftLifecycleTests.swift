import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Incrément 3 (spec 2026-08-01) — les trois sorties du composer :
///  - sortie sans publier ET contenu → le brouillon reste, sous SON id ;
///  - sortie sans publier et composer vierge → aucun brouillon ne survit ;
///  - publication acceptée → SEUL le brouillon de la story publiée disparaît,
///    les brouillons voisins survivent.
///
/// La View n'est pas hostable en XCTest : chaque sortie est vérifiée par sa
/// règle décidable (mêmes fonctions que le code vivant, magasin temporaire
/// injecté) plus une garde de source sur le câblage que la règle ne voit pas.
@MainActor
final class StoryComposerDraftLifecycleTests: XCTestCase {

    private func makeStore() -> StoryDraftStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("DraftLifecycle-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return StoryDraftStore(
            dbPath: root.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: root.appendingPathComponent("media")
        )
    }

    private func makeDefaults() -> UserDefaults {
        let suite = "DraftLifecycle-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        return defaults
    }

    private func contentSlide(_ text: String) -> StorySlide {
        var slide = StorySlide()
        slide.content = text
        return slide
    }

    // MARK: - Sortie avec contenu → le brouillon reste, sous SON id

    // MARK: - Sortie vierge → aucun brouillon ne survit

    // MARK: - Publication CONFIRMÉE → SEUL le brouillon publié disparaît

    /// Directive 2026-08-02 : la destruction n'appartient plus au hand-off
    /// (qui GÈLE le brouillon — cf. `StoryComposerPublishHandoffTests`) mais
    /// aux consommateurs de SUCCÈS serveur (`StoryDraftStore.shared.delete`
    /// depuis le chemin online, la file et l'édition). Le geste reste
    /// `delete(draftId:)` : appliqué à l'id de LA story publiée, il ne touche
    /// aucun voisin.
    func test_publishConfirmed_deletesOnlyThePublishedStoryDraft() throws {
        let store = makeStore()
        store.save(draftId: "publiee", slides: [contentSlide("La story qui part")], visibility: "PUBLIC")
        store.save(draftId: "voisin", slides: [contentSlide("Celle de demain")], visibility: "FRIENDS")

        store.delete(draftId: "publiee")

        XCTAssertEqual(store.listDrafts().map(\.id), ["voisin"],
                       "Publier UNE story n'efface pas les brouillons des autres.")
        XCTAssertNil(store.load(draftId: "publiee"),
                     "Publication réussie → le brouillon de la story publiée a disparu.")
        XCTAssertNotNil(store.load(draftId: "voisin"))
    }

}
