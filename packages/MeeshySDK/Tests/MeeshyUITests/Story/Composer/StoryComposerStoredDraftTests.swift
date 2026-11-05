import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Le brouillon de « Mes stories » se reprend et s'écrit par le ViewModel, sans
/// atelier monté (#15629) : un hôte qui adopte un brouillon le voit sur sa scène.
@MainActor
final class StoryComposerStoredDraftTests: XCTestCase {

    private func makeStore() -> StoryDraftStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoredDraft-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return StoryDraftStore(dbPath: root.appendingPathComponent("drafts.sqlite").path,
                               mediaDirectory: root.appendingPathComponent("media"))
    }

    private func slide(_ id: String, _ content: String) -> StorySlide {
        var slide = StorySlide(id: id)
        slide.content = content
        return slide
    }

    func test_restoreAdoptedDraft_adoptedSession_reposeLaSceneEtRendLAudience() throws {
        let store = makeStore()
        store.save(draftId: "repris", slides: [slide("a", "Première"), slide("b", "Seconde")],
                   visibility: "ONLY", visibilityUserIds: ["u1"], originalLanguage: "es")
        let viewModel = StoryComposerViewModel()
        viewModel.adoptDraft(id: "repris")

        let rendu = try XCTUnwrap(StoryStoredDraft.restoreAdopted(into: viewModel, from: store))

        XCTAssertEqual(viewModel.slides.map(\.content), ["Première", "Seconde"])
        XCTAssertEqual(viewModel.currentSlideIndex, 0)
        XCTAssertEqual(rendu, StoryStoredDraftRestoration(visibility: "ONLY", visibilityUserIds: ["u1"],
                                                          originalLanguage: "es", lostMediaCount: 0))
    }

    func test_restoreAdoptedDraft_sessionNonAdoptee_neToucheRien() {
        let store = makeStore()
        let viewModel = StoryComposerViewModel()
        store.save(draftId: viewModel.draftId, slides: [slide("a", "Ailleurs")], visibility: "PUBLIC")
        let avant = viewModel.slides.map(\.id)

        XCTAssertNil(StoryStoredDraft.restoreAdopted(into: viewModel, from: store))
        XCTAssertEqual(viewModel.slides.map(\.id), avant)
    }

    func test_restoreAdoptedDraft_brouillonDisparu_laisseLaScene() {
        let store = makeStore()
        let viewModel = StoryComposerViewModel()
        viewModel.adoptDraft(id: "efface")

        XCTAssertNil(StoryStoredDraft.restoreAdopted(into: viewModel, from: store))
        XCTAssertEqual(viewModel.slides.count, 1)
    }

    func test_persistStoredDraft_ecritSousLIdAdopte_etSeRelit() throws {
        let store = makeStore()
        let viewModel = StoryComposerViewModel()
        viewModel.adoptDraft(id: "repris")
        viewModel.applyContentText("Écrit dans la scène")

        StoryStoredDraft.persist(viewModel, frame: StoryStoredDraftFrame(visibility: "FRIENDS", visibilityUserIds: [],
                                                           originalLanguage: "fr"),
                                     to: store, lastStoredMediaKeys: nil)

        let relu = try XCTUnwrap(store.load(draftId: "repris"))
        XCTAssertEqual(relu.slides.first?.content, "Écrit dans la scène")
        XCTAssertEqual(relu.visibility, "FRIENDS")
        XCTAssertEqual(relu.originalLanguage, "fr")
    }

    func test_persistStoredDraft_porteLeLienDEdition() throws {
        let store = makeStore()
        let viewModel = StoryComposerViewModel()
        viewModel.editingPostId = "post-1"

        StoryStoredDraft.persist(viewModel, frame: StoryStoredDraftFrame(visibility: "PUBLIC", visibilityUserIds: [],
                                                           originalLanguage: nil),
                                     to: store, lastStoredMediaKeys: nil)

        XCTAssertEqual(try XCTUnwrap(store.load(draftId: viewModel.draftId)).editingPostId, "post-1",
                       "Rouvrir le brouillon d'une édition rouvre l'édition, jamais une story neuve.")
    }
}
