import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// S5 — le brouillon de la veille survit à un tap sur la page blanche.
///
/// La chaîne qui le détruisait, maillon par maillon :
/// `startTextCompositionOnBlankCanvas` → `addText(text: "")` → la règle
/// `slideHasContent` comptait les `textObjects` SANS regarder leur texte →
/// `composerHasContent` devenait vrai → `mayOverwriteStoredDraft` ouvrait la
/// porte → l'autosave débouncé (2,5 s) écrasait le SLOT UNIQUE de
/// `StoryDraftStore` avec une slide vide → `exitTextEditingMode` supprimait
/// ensuite le texte fantôme, ne laissant même pas la trace de ce qui avait
/// remplacé le brouillon. Perte silencieuse, sur le geste que S5 promeut
/// comme affordance PRINCIPALE de la page blanche.
///
/// Le test rejoue la séquence complète contre un vrai `StoryDraftStore` et un
/// vrai `StoryComposerViewModel`. L'autosave lui-même n'est pas déclenché par
/// un timer (ce serait du sommeil et de la flakiness) : on évalue le gate
/// EXACTEMENT comme `autosaveDraftAfterMutation` le fait — `guard
/// mayOverwriteStoredDraft else { return }` — puis on écrit si, et seulement
/// si, il autorise l'écriture.
@MainActor
final class StoryComposerBlankTextDraftGuardTests: XCTestCase {

    private func makeStore() -> StoryDraftStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("BlankTextDraftGuard-\(UUID().uuidString)")
        return StoryDraftStore(
            dbPath: root.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: root.appendingPathComponent("media")
        )
    }

    /// Suite isolée : le chemin legacy `UserDefaults` fait partie de ce que la
    /// sortie efface, il doit être testable sans toucher les préférences réelles.
    private func makeDefaults() -> UserDefaults {
        let suite = "BlankTextDraftGuard-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        return defaults
    }

    /// Reproduit le gate de `autosaveDraftAfterMutation` sur l'état vivant
    /// simulé : mêmes cinq termes, même fonction pure.
    private func autosaveWouldWrite(
        draftResume: DraftResumeState,
        slides: [StorySlide]
    ) -> Bool {
        StoryComposerView.mayOverwriteStoredDraft(
            isEditingExistingStory: false,
            draftResume: draftResume,
            isAutosaveSuspended: false,
            composerHasContent: StoryComposerView.composerHasContent(
                slides: slides,
                slideImageIds: [],
                hasStickerObjects: false,
                hasDrawingData: false,
                hasDrawingStrokes: false
            ),
            didHandOffPublish: false
        )
    }

    func test_tappingTheBlankCanvasAndLeavingTheEditorEmpty_keepsTheStoredDraftIntact() throws {
        // 1. Un vrai brouillon dort en magasin.
        let store = makeStore()
        var yesterday = StorySlide()
        yesterday.content = "Le brouillon de la veille"
        store.save(slides: [yesterday], visibility: "FRIENDS")

        // 2. Ouverture du composer : le bandeau de reprise est proposé.
        let stored = try XCTUnwrap(store.load())
        XCTAssertTrue(
            StoryComposerView.shouldOfferDraftResume(slides: stored.slides, slideImageIds: []),
            "Sans offre, il n'y a rien à protéger — le scénario ne testerait rien."
        )
        var draftResume = DraftResumeState()
        draftResume.offer()

        // 3. Le tap sur le canvas range le bandeau (`.dismissDraftResume`).
        //    Ranger n'est PAS jeter : le magasin garde son contenu.
        draftResume.hideBanner()

        // 4. Le tap suivant ouvre l'éditeur de texte sur la page blanche.
        let viewModel = StoryComposerViewModel()
        let text = try XCTUnwrap(viewModel.addText())
        viewModel.enterTextEditingMode(textId: text.id)

        // 5. L'autosave débouncé se réveille pendant que l'éditeur est ouvert,
        //    curseur clignotant et pas un caractère saisi.
        let wouldWrite = autosaveWouldWrite(draftResume: draftResume, slides: viewModel.slides)
        XCTAssertFalse(
            wouldWrite,
            """
            Un `StoryTextObject` au texte vide est une COQUILLE posée par \
            `addText()` pour donner une cible à l'éditeur — pas du contenu. \
            Le compter ouvrait l'autosave sur le slot unique du magasin.
            """
        )
        if wouldWrite { store.save(slides: viewModel.slides, visibility: "PUBLIC") }

        // 6. L'utilisateur referme l'éditeur sans avoir rien saisi : le texte
        //    fantôme est supprimé et la page redevient blanche.
        viewModel.exitTextEditingMode()
        XCTAssertTrue(viewModel.currentEffects.textObjects.isEmpty)

        // 7. Le brouillon d'origine est intact, et reproposé à l'ouverture
        //    suivante.
        let reloaded = try XCTUnwrap(store.load())
        XCTAssertEqual(reloaded.slides.count, 1)
        XCTAssertEqual(reloaded.slides.first?.content, "Le brouillon de la veille")
        XCTAssertEqual(reloaded.visibility, "FRIENDS")
        XCTAssertTrue(
            StoryComposerView.shouldOfferDraftResume(slides: reloaded.slides, slideImageIds: []),
            "La même offre doit revenir : ranger le bandeau ne consomme rien."
        )
    }

    /// La MÊME séquence, poursuivie jusqu'au geste suivant le plus naturel :
    /// refermer le composer.
    ///
    /// Le bandeau de reprise n'est plus modal (S5) : le X du header est visible
    /// et tappable dès l'ouverture, ce qui n'était pas le cas quand un voile
    /// plein écran interceptait les taps. `handleDismiss()` tombait alors dans
    /// `clearAllDrafts()` — sans alerte, sans annonce — parce que le composer
    /// vierge ne porte aucun contenu. Le brouillon PROMIS quelques secondes plus
    /// tôt disparaissait, et la réouverture ne proposait plus rien.
    ///
    /// L'invariant écrit dans `DraftResumeState` (« Ranger n'est pas jeter ») ne
    /// vaut que si la SORTIE le respecte aussi : seul un brouillon FANTÔME —
    /// celui qu'une réouverture ne proposerait pas — peut être purgé au passage.
    func test_closingTheComposerAfterTheBlankTextDetour_leavesYesterdaysDraftInTheStore() throws {
        let store = makeStore()
        let defaults = makeDefaults()
        var yesterday = StorySlide()
        yesterday.content = "Le brouillon de la veille"
        store.save(slides: [yesterday], visibility: "FRIENDS")

        // Ouverture, bandeau proposé, puis rangé par un tap sur le canvas.
        var draftResume = DraftResumeState()
        draftResume.offer()
        draftResume.hideBanner()

        // Éditeur de texte ouvert par le tap suivant, refermé sans une frappe.
        let viewModel = StoryComposerViewModel()
        let text = try XCTUnwrap(viewModel.addText())
        viewModel.enterTextEditingMode(textId: text.id)
        XCTAssertFalse(
            autosaveWouldWrite(draftResume: draftResume, slides: viewModel.slides),
            "Pré-condition : l'autosave n'a rien écrit, le magasin porte encore la veille."
        )
        viewModel.exitTextEditingMode()

        // Le X du header. Le composer ne porte aucun contenu — c'est
        // exactement la branche qui purgeait tout.
        XCTAssertFalse(
            StoryComposerView.composerHasContent(
                slides: viewModel.slides, slideImageIds: [],
                hasStickerObjects: false, hasDrawingData: false, hasDrawingStrokes: false),
            "Sans cette pré-condition, la sortie passerait par la feuille de confirmation."
        )
        let purged = StoryComposerView.clearPhantomDrafts(store: store, defaults: defaults)

        XCTAssertFalse(purged, "Un brouillon restaurable n'est pas un fantôme : rien à purger.")
        let reloaded = try XCTUnwrap(
            store.load(),
            "Le brouillon de la veille a été détruit par une simple fermeture."
        )
        XCTAssertEqual(reloaded.slides.first?.content, "Le brouillon de la veille")
        XCTAssertEqual(reloaded.visibility, "FRIENDS")
        XCTAssertTrue(
            StoryComposerView.shouldOfferDraftResume(slides: reloaded.slides, slideImageIds: []),
            "…et la prochaine ouverture le propose à nouveau."
        )
    }

    /// Le pendant : la purge des brouillons FANTÔMES, elle, doit survivre. Un
    /// draft dont le seul contenu est un fond (auto-appliqué à l'ouverture) ne
    /// mérite aucune carte de reprise — `checkForDraft()` le purge déjà à
    /// l'ouverture, la sortie doit s'aligner sur la même règle, pas s'en écarter.
    func test_closingTheComposerWhenOnlyAPhantomDraftIsStored_stillPurgesIt() throws {
        let store = makeStore()
        let defaults = makeDefaults()
        var phantom = StorySlide()
        phantom.effects.background = "FFB3C1"
        store.save(slides: [phantom], visibility: "PUBLIC")

        let purged = StoryComposerView.clearPhantomDrafts(store: store, defaults: defaults)

        XCTAssertTrue(purged, "Le fond seul ne compte pas comme contenu (arbitrage S2).")
        XCTAssertNil(store.load(), "Un fantôme laissé en place ressusciterait à chaque ouverture.")
    }

    /// Le magasin legacy `UserDefaults` porte la même promesse : `checkForDraft()`
    /// le décode et propose la reprise. La sortie doit donc le lire lui aussi —
    /// sinon la protection dépend de la version de l'app qui a créé le brouillon.
    func test_closingTheComposer_leavesARestorableLegacyUserDefaultsDraft() throws {
        let store = makeStore()
        let defaults = makeDefaults()
        var yesterday = StorySlide()
        yesterday.content = "Brouillon legacy"
        let blob = try JSONEncoder().encode(
            StoryComposerDraft(slides: [yesterday], visibilityPreference: "FRIENDS"))
        defaults.set(blob, forKey: StoryComposerDraft.userDefaultsKey)

        let purged = StoryComposerView.clearPhantomDrafts(store: store, defaults: defaults)

        XCTAssertFalse(purged)
        XCTAssertNotNil(
            defaults.data(forKey: StoryComposerDraft.userDefaultsKey),
            "Le brouillon legacy est restaurable : la sortie ne le jette pas."
        )
    }

    // MARK: - Gardes de source

    /// La règle ne vaut que si la SORTIE l'emprunte. `handleDismiss()` appelait
    /// `clearAllDrafts()` en direct, sans la moindre connaissance de l'offre de
    /// reprise (`grep draftResume` : zéro occurrence dans le fichier).
    func test_handleDismiss_neverPurgesTheStoreUnconditionally() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func handleDismiss()", in: code))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "clearAllDrafts()", in: body), 0,
            """
            Fermer le composer n'est pas un discard explicite : seul « Quitter » \
            (`cancelAndDismiss`) et « Recommencer » jettent le magasin.
            """
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "clearPhantomDraftsOnly()", in: body), 1,
            "La purge de sortie passe par la règle partagée, une seule fois."
        )
    }

    /// Même angle mort côté publication : ce qui part sans contenu VISUEL —
    /// hier une page blanche, aujourd'hui la seule story « fond + musique » que
    /// `canPublish` laisse encore passer — emportait au passage le brouillon qui
    /// venait d'être proposé.
    func test_publishAllSlides_purgesOnlyTheDraftItSupplants() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func publishAllSlides()", in: code))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "clearPhantomDraftsOnly()", in: body), 1,
            """
            Publier AVEC du contenu jette le brouillon de la story qui part — \
            c'est le sien. Publier une page blanche n'en supplante aucun : le \
            magasin ne porte alors que ce qu'on venait de proposer.
            """
        )
    }

    /// Le pendant positif : dès qu'un caractère est saisi, le travail vivant
    /// supplante l'offre ignorée et redevient protégé du kill de l'app (D1).
    func test_typingASingleCharacterAfterRangingTheBanner_letsTheLiveWorkTakeOver() throws {
        var draftResume = DraftResumeState()
        draftResume.offer()
        draftResume.hideBanner()

        let viewModel = StoryComposerViewModel()
        let text = try XCTUnwrap(viewModel.addText())
        var effects = viewModel.currentEffects
        let index = try XCTUnwrap(effects.textObjects.firstIndex { $0.id == text.id })
        effects.textObjects[index].text = "A"
        viewModel.currentEffects = effects

        XCTAssertTrue(
            autosaveWouldWrite(draftResume: draftResume, slides: viewModel.slides),
            "D1 : ce qui a été RÉELLEMENT écrit doit survivre au kill de l'app."
        )
    }
}
