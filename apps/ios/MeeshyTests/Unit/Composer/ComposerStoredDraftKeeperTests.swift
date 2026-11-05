import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Reprendre un brouillon et modifier une story se composent sur la scène du
/// meuble** (#15629) : le gardien y repose le brouillon adopté, l'écrit après
/// un geste de l'auteur, et se tait dès que la publication est partie.
@MainActor
final class ComposerStoredDraftKeeperTests: XCTestCase {

    private func makeStore() -> StoryDraftStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoredDraftKeeper-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return StoryDraftStore(dbPath: root.appendingPathComponent("drafts.sqlite").path,
                               mediaDirectory: root.appendingPathComponent("media"))
    }

    private func slide(_ content: String) -> StorySlide {
        var slide = StorySlide(id: UUID().uuidString)
        slide.content = content
        return slide
    }

    private func frame() -> StoryStoredDraftFrame {
        StoryStoredDraftFrame(visibility: "FRIENDS", visibilityUserIds: [], originalLanguage: "fr")
    }

    private func adoptedScene(_ store: StoryDraftStore, content: String) -> StoryComposerViewModel {
        store.save(draftId: "repris", slides: [slide(content)], visibility: "ONLY", visibilityUserIds: [])
        let scene = StoryComposerViewModel()
        scene.adoptDraft(id: "repris")
        return scene
    }

    // MARK: - Qui a un brouillon de « Mes stories »

    func test_scope_brouillonAdopte_etEditionDeStory_seulement() {
        let edition = ComposerHydration.editingStory(StoryComposerViewModel(editing: StoryItem(id: "s", content: "x")))
        XCTAssertTrue(ComposerStoredDraftScope.keepsStoredDraft(adoptsDraft: true, hydration: nil))
        XCTAssertTrue(ComposerStoredDraftScope.keepsStoredDraft(adoptsDraft: false, hydration: edition))
        XCTAssertFalse(ComposerStoredDraftScope.keepsStoredDraft(adoptsDraft: false, hydration: nil),
                       "Une création se sauvegarde dans le tiroir du meuble, jamais dans « Mes stories ».")
        XCTAssertFalse(ComposerStoredDraftScope.keepsStoredDraft(
            adoptsDraft: false, hydration: .repostingStory(StoryItem(id: "s", content: "x"), authorHandle: "@a")))
    }

    func test_restoredAudience_unModeAListeSansListe_retombeSurLesAmis() {
        let sansListe = StoryStoredDraftRestoration(visibility: "ONLY", visibilityUserIds: [],
                                                    originalLanguage: nil, lostMediaCount: 0)
        let avecListe = StoryStoredDraftRestoration(visibility: "ONLY", visibilityUserIds: ["u1"],
                                                    originalLanguage: nil, lostMediaCount: 0)
        XCTAssertEqual(ComposerStoredDraftScope.restoredAudience(sansListe).visibility, .friends)
        XCTAssertEqual(ComposerStoredDraftScope.restoredAudience(avecListe).visibility, .only)
    }

    // MARK: - Reprendre

    func test_bind_brouillonAdopte_leReposeSurLaScene() throws {
        let store = makeStore()
        let scene = adoptedScene(store, content: "Ma story d'hier")
        let gardien = ComposerStoredDraftKeeper(store: store, debounceNanoseconds: 0)

        let repris = try XCTUnwrap(gardien.bind(scene, keeps: true))

        XCTAssertEqual(scene.slides.map(\.content), ["Ma story d'hier"],
                       "Reprendre un brouillon ne rouvre plus une scène vide.")
        XCTAssertEqual(repris.visibility, "ONLY")
        XCTAssertTrue(gardien.keepsDraft)
    }

    func test_bind_horsDePortee_neRepriseRien_etNePromet() {
        let store = makeStore()
        let scene = adoptedScene(store, content: "Ailleurs")
        let gardien = ComposerStoredDraftKeeper(store: store, debounceNanoseconds: 0)

        XCTAssertNil(gardien.bind(scene, keeps: false))
        XCTAssertFalse(gardien.keepsDraft)
    }

    // MARK: - Écrire

    func test_flush_sansGeste_nEcritRien() throws {
        let store = makeStore()
        let scene = StoryComposerViewModel(editing: StoryItem(id: "post-1", content: "Publiée"))
        let gardien = ComposerStoredDraftKeeper(store: store, debounceNanoseconds: 0)
        _ = gardien.bind(scene, keeps: true)

        gardien.flush { self.frame() }

        XCTAssertNil(store.load(draftId: scene.draftId),
                     "Ouvrir « Modifier » puis fermer sans toucher ne crée aucun brouillon.")
    }

    func test_flush_apresUnGeste_ecritSousLeLienDEdition() throws {
        let store = makeStore()
        let scene = StoryComposerViewModel(editing: StoryItem(id: "post-1", content: "Publiée"))
        let gardien = ComposerStoredDraftKeeper(store: store, debounceNanoseconds: 0)
        _ = gardien.bind(scene, keeps: true)

        scene.applyContentText("Corrigée")
        gardien.flush { self.frame() }

        let relu = try XCTUnwrap(store.load(draftId: scene.draftId))
        XCTAssertEqual(relu.slides.first?.content, "Corrigée")
        XCTAssertEqual(relu.editingPostId, "post-1",
                       "Rouvrir « Modifier » reprend l'édition en cours (#8848).")
    }

    func test_stopWriting_apresPublication_plusRienNEcrit() {
        let store = makeStore()
        let scene = StoryComposerViewModel(editing: StoryItem(id: "post-1", content: "Publiée"))
        let gardien = ComposerStoredDraftKeeper(store: store, debounceNanoseconds: 0)
        _ = gardien.bind(scene, keeps: true)
        scene.applyContentText("Corrigée")

        gardien.stopWriting()
        gardien.flush { self.frame() }

        XCTAssertNil(store.load(draftId: scene.draftId),
                     "La file possède le brouillon une fois la publication acceptée.")
        XCTAssertFalse(gardien.keepsDraft)
    }

    func test_discard_effaceLeBrouillonRepris() {
        let store = makeStore()
        let scene = adoptedScene(store, content: "À jeter")
        let gardien = ComposerStoredDraftKeeper(store: store, debounceNanoseconds: 0)
        _ = gardien.bind(scene, keeps: true)

        gardien.discard()

        XCTAssertNil(store.load(draftId: "repris"), "« Abandonner » jette ce que l'auteur tenait.")
    }
}
