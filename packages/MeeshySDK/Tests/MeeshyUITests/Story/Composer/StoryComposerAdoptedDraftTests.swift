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

    func test_openingDraftAction_adoptedSession_restoresWithoutOffering() {
        XCTAssertEqual(
            StoryComposerView.openingDraftAction(
                isEditingExistingStory: false, isAdoptedDraftSession: true, isSeededSession: false),
            .restoreAdoptedDraft
        )
    }

    func test_openingDraftAction_freshSession_offersPassiveResume() {
        XCTAssertEqual(
            StoryComposerView.openingDraftAction(
                isEditingExistingStory: false, isAdoptedDraftSession: false, isSeededSession: false),
            .offerDraftResume
        )
    }

    /// INVERSION CONSCIENTE (directive user 2026-08-02, point c) : un
    /// brouillon portant `editingPostId` ROUVRE le mode édition — la session
    /// est alors à la fois éditante ET adoptée, et c'est le brouillon choisi
    /// qui doit revivre, pas l'hydratation serveur (qui écraserait le travail
    /// repris). L'adoption prime.
    func test_openingDraftAction_adoptedEditSession_restoresTheAdoptedDraft() {
        XCTAssertEqual(
            StoryComposerView.openingDraftAction(
                isEditingExistingStory: true, isAdoptedDraftSession: true, isSeededSession: false),
            .restoreAdoptedDraft,
            "Rouvrir un brouillon d'édition doit restaurer CE brouillon, jamais ré-hydrater le serveur par-dessus."
        )
    }

    /// Une entrée en édition FRAÎCHE (« Modifier » sur une story publiée)
    /// reste hydratée depuis la story : le système de brouillons ne s'anime
    /// qu'ensuite (autosaves porteurs d'`editingPostId`).
    func test_openingDraftAction_freshEditSession_staysHydratedByEditMode() {
        XCTAssertEqual(
            StoryComposerView.openingDraftAction(
                isEditingExistingStory: true, isAdoptedDraftSession: false, isSeededSession: false),
            .hydratedByEditMode
        )
    }

    // MARK: - « Recommencer » sur une session adoptée

    func test_draftDiscardAction_adoptedSession_detaches_freshSessionDeletes() {
        XCTAssertEqual(StoryComposerView.draftDiscardAction(isAdoptedDraftSession: true),
                       .detachFromAdoptedDraft)
        XCTAssertEqual(StoryComposerView.draftDiscardAction(isAdoptedDraftSession: false),
                       .deleteCurrentDraft)
    }

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

    /// (c) — l'`onAppear` du composer route l'ouverture par la décision pure
    /// `openingDraftAction` : session adoptée → restauration directe, jamais
    /// `checkForDraft()` (qui trouverait le brouillon adopté sous
    /// `viewModel.draftId` et poserait une DEUXIÈME invite).
    func test_onAppear_routesThroughTheOpeningDraftDecision() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertGreaterThanOrEqual(
            ComposerSourceGuard.occurrences(of: "openingDraftAction(", in: code), 1,
            """
            Sans décision d'ouverture, `checkForDraft()` retrouve le brouillon \
            adopté sous `viewModel.draftId` et re-propose le bandeau : double \
            invite, canvas vide, et l'autosave reste suspendu sous une offre \
            que l'utilisateur a déjà tranchée.
            """
        )
    }

    /// « Recommencer » générique — le corps de la View ne supprime plus le
    /// brouillon en direct : la décision passe par `draftDiscardAction`, qui
    /// détache les sessions adoptées au lieu de détruire leur brouillon.
    func test_bannerDiscard_routesThroughTheDiscardDecision() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "clearCurrentDraft()", in: code), 0,
            """
            Un `clearCurrentDraft()` câblé en direct dans la View détruit le \
            brouillon ADOPTÉ quand la session en porte un : « Recommencer » \
            doit s'en détacher (id neuf), pas le supprimer.
            """
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "discardOfferedDraft()", in: code), 1,
            "Le discard du bandeau passe par l'applicateur unique de la décision."
        )
    }
}
