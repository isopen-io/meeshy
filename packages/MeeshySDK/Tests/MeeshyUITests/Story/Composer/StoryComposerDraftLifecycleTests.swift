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

    /// La fermeture par le X ne détruit JAMAIS un brouillon restaurable — ni
    /// celui de la session, ni un voisin. `clearPhantomDraftsOnly()` est la
    /// seule purge que cette sortie emprunte.
    func test_exitWithContent_keepsTheSessionDraftUnderItsOwnId_andNeighborsIntact() throws {
        let store = makeStore()
        let defaults = makeDefaults()
        store.save(draftId: "session", slides: [contentSlide("Ma story en cours")], visibility: "PUBLIC")
        store.save(draftId: "voisin", slides: [contentSlide("Une autre story")], visibility: "FRIENDS")

        let purged = StoryComposerView.clearPhantomDrafts(store: store, defaults: defaults)

        XCTAssertFalse(purged, "Des brouillons restaurables existent : la sortie ne purge rien.")
        XCTAssertEqual(
            Set(store.listDrafts().map(\.id)), ["session", "voisin"],
            "Chaque brouillon survit sous SON id — la sortie n'en fusionne ni n'en perd aucun."
        )
        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "session")).slides.first?.content,
                       "Ma story en cours")
    }

    /// Le brouillon conservé l'est sous l'id de LA session : c'est
    /// `persistDraft()` qui écrit, et il ne connaît qu'un id.
    func test_persistDraft_writesEveryStoreUnderTheSessionDraftId() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func persistDraft()", in: code))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "draftId: viewModel.draftId", in: body), 2,
            """
            `save` et `saveMedia` écrivent tous deux sous l'id de la session — \
            un littéral ou un id global ressusciterait le magasin mono-brouillon.
            """
        )
    }

    // MARK: - Sortie vierge → aucun brouillon ne survit

    func test_exitBlank_withOnlyThePhantomSessionDraft_leavesTheStoreEmpty() {
        let store = makeStore()
        let defaults = makeDefaults()
        var phantom = StorySlide()
        phantom.effects.background = "A5B4FC"
        store.save(draftId: "session", slides: [phantom], visibility: "PUBLIC")

        let purged = StoryComposerView.clearPhantomDrafts(store: store, defaults: defaults)

        XCTAssertTrue(purged)
        XCTAssertTrue(store.listDrafts().isEmpty,
                      "Sortie vierge → `listDrafts()` est vide (spec incrément 3).")
    }

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

    /// Une purge GLOBALE du magasin n'a plus sa place sur les chemins de
    /// sortie/publication : `clear()` ne sert qu'à la déconnexion, et seul
    /// `clearPhantomDrafts` (règle partagée, testée plus haut) peut y recourir
    /// quand RIEN n'est restaurable.
    func test_publicationPaths_neverPurgeTheWholeStore() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "StoryDraftStore.shared.clear()", in: code), 0,
            "Publier ou fermer ne vide jamais le magasin entier — brouillons voisins compris."
        )
    }
}
