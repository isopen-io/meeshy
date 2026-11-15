import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Contrat `adoptDraft(id:)` (spec 2026-08-01, incréments 3-5) : un composer
/// construit sur un brouillon CHOISI (tap dans « Mes stories ») doit
/// (a) charger slides + médias + historique de CE brouillon dès l'ouverture,
/// (b) autosauvegarder SOUS cet id,
/// (c) ne PAS re-proposer le bandeau de reprise — l'utilisateur vient de
///     choisir, une double invite ferait douter du tap.
///
/// Et « Recommencer » sur une telle session ne détruit PAS le brouillon
/// choisi : la session s'en DÉTACHE (id neuf), le brouillon reste en magasin.
/// Détruire ce que l'utilisateur vient précisément de désigner comme « à
/// reprendre » serait la perte la plus injustifiable du flux.
@MainActor
final class StoryComposerAdoptedDraftTests: XCTestCase {

    private func makeStore() -> StoryDraftStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("AdoptedDraft-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return StoryDraftStore(
            dbPath: root.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: root.appendingPathComponent("media")
        )
    }

    // MARK: - (b) Identité d'autosave

    func test_adoptDraft_setsTheAutosaveIdentity_andMarksTheSessionAdopted() {
        let viewModel = StoryComposerViewModel()
        XCTAssertFalse(viewModel.isAdoptedDraftSession,
                       "Une ardoise vierge n'est adoptée de rien : id neuf, bandeau possible.")

        viewModel.adoptDraft(id: "choisi")

        XCTAssertEqual(viewModel.draftId, "choisi",
                       "Tout l'autosave (save/saveMedia/history) écrit sous cet id.")
        XCTAssertTrue(viewModel.isAdoptedDraftSession)
    }

    // MARK: - (c) Décision d'ouverture

    // MARK: - « Recommencer » sur une session adoptée

    func test_detachFromAdoptedDraft_movesToAFreshId_andTheChosenDraftSurvives() throws {
        let store = makeStore()
        var slide = StorySlide(id: "s1")
        slide.content = "Cinq diapositives de travail"
        store.save(draftId: "choisi", slides: [slide], visibility: "FRIENDS")

        let viewModel = StoryComposerViewModel()
        viewModel.adoptDraft(id: "choisi")
        viewModel.detachFromAdoptedDraft()

        XCTAssertNotEqual(viewModel.draftId, "choisi",
                          "La session repart sous un id neuf : l'autosave n'écrira plus sur le brouillon rendu.")
        XCTAssertFalse(viewModel.isAdoptedDraftSession)
        let intact = try XCTUnwrap(store.load(draftId: "choisi"),
                                   "« Recommencer » ne détruit pas ce que l'utilisateur venait de choisir.")
        XCTAssertEqual(intact.slides.first?.content, "Cinq diapositives de travail")
    }

    // MARK: - Gardes de câblage (ouverture + Recommencer)

}
