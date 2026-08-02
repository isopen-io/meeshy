import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// S3.1 (C3) — le tap « Publier » ne traverse plus AUCUN point de suspension.
/// Le snapshot remis au callback est capturé au moment du tap (types valeur →
/// copie immuable) et le composer se ferme sans rien attendre.
///
/// `StoryComposerView` n'est pas hostable en XCTest (même précédent que
/// `StoryComposerExitDialogSourceGuardTests`) : la partie décidable est
/// extraite dans l'atome pur `handoffSlides`, et l'absence d'`await` est
/// ancrée par une garde de source qui retire les commentaires avant analyse.
@MainActor
final class StoryComposerPublishHandoffTests: XCTestCase {

    // MARK: - Atome pur

    func test_handoffSlides_currentIndexInRange_appliesCurrentEffectsToThatSlideOnly() {
        let slides = [StorySlide(id: "a"), StorySlide(id: "b")]
        var effects = StoryEffects()
        effects.thumbHash = "current"

        let result = StoryComposerView.handoffSlides(slides, currentIndex: 1, currentEffects: effects)

        XCTAssertEqual(result[1].effects.thumbHash, "current")
        XCTAssertNil(result[0].effects.thumbHash, "La slide non courante n'est jamais touchée")
    }

    func test_handoffSlides_currentIndexOutOfRange_returnsSlidesUnchanged() {
        let slides = [StorySlide(id: "a")]
        var effects = StoryEffects()
        effects.thumbHash = "current"

        let result = StoryComposerView.handoffSlides(slides, currentIndex: 7, currentEffects: effects)

        XCTAssertEqual(result.map(\.id), ["a"])
        XCTAssertNil(result[0].effects.thumbHash)
    }

    func test_handoffSlides_returnsCopy_mutatingResultDoesNotAffectInput() {
        let slides = [StorySlide(id: "a")]

        var result = StoryComposerView.handoffSlides(slides, currentIndex: 0, currentEffects: StoryEffects())
        result[0].content = "muté après le hand-off"

        XCTAssertNil(slides[0].content, "Le composer ne peut plus atteindre ce qui est parti")
    }

    // MARK: - Garde de source (C3)

    func test_publishAllSlides_bodyContainsNoSuspensionPoint() throws {
        let body = try Self.functionBody(named: "func publishAllSlides()",
                                         in: Self.publicationSourceURL)

        for banned in ["await ", "Task {", "Task.detached"] {
            XCTAssertFalse(
                body.contains(banned),
                """
                `publishAllSlides()` contient « \(banned) » : la fermeture du composer \
                ne doit dépendre d'AUCUN await (critère C3 — main rendue < 500 ms).
                """
            )
        }
    }

    func test_publishAllSlides_latchIsSetOnlyWhenTheHandoffIsAccepted() throws {
        let body = try Self.functionBody(named: "func publishAllSlides()",
                                         in: Self.publicationSourceURL)

        XCTAssertTrue(
            body.contains("didHandOffPublish = true"),
            "Le loquet anti-double-tap doit être posé dans publishAllSlides()"
        )
        guard let latchRange = body.range(of: "didHandOffPublish = true"),
              let callRange = body.range(of: "onPublishAllInBackground(") else {
            XCTFail("Loquet ou hand-off introuvables")
            return
        }
        XCTAssertTrue(
            callRange.lowerBound < latchRange.lowerBound,
            """
            Le loquet doit être posé APRÈS avoir lu le retour du hand-off : un callback \
            qui REFUSE (édition hors-ligne, composer inerte) laisserait sinon le bouton \
            Publier grisé à vie.
            """
        )
        XCTAssertTrue(
            body.contains("accepted"),
            "Le retour Bool du hand-off doit être lu, pas ignoré"
        )
    }

    func test_publishAllSlides_destroysTheDraftOnlyWhenTheHandoffIsAccepted() throws {
        let body = try Self.functionBody(named: "func publishAllSlides()",
                                         in: Self.publicationSourceURL)

        guard let callRange = body.range(of: "onPublishAllInBackground(") else {
            XCTFail("Hand-off introuvable")
            return
        }
        // Multi-brouillons (spec 2026-08-01) : la publication acceptée ne jette
        // que le brouillon de LA story partie (`clearCurrentDraft()`), jamais le
        // magasin entier — les brouillons voisins survivent.
        for destructive in ["clearCurrentDraft()", "draftAutosaveSuspended = true"] {
            guard let range = body.range(of: destructive) else {
                XCTFail("« \(destructive) » a disparu de publishAllSlides()")
                continue
            }
            XCTAssertTrue(
                callRange.lowerBound < range.lowerBound,
                """
                « \(destructive) » s'exécute AVANT de savoir si le hand-off est accepté : \
                sur un refus (édition hors-ligne, surface inerte) le composer reste ouvert \
                avec son brouillon déjà jeté et son autosave morte pour la session.
                """
            )
        }
    }

    // MARK: - Visibilité injectée (C6)

    func test_composerInit_initialVisibility_seedsTheVisibilityState() throws {
        let code = try Self.strippedSource(of: Self.composerSourceURL)

        XCTAssertFalse(
            code.contains("\"FRIENDS\""),
            """
            Le composer ne doit plus porter le littéral "FRIENDS" : l'audience initiale \
            arrive par `initialVisibility` (défaut `PostVisibility.friends.rawValue`).
            """
        )
        XCTAssertTrue(
            code.contains("self._visibility = State(initialValue: initialVisibility)"),
            "Les deux inits doivent semer `visibility` depuis le paramètre injecté"
        )
    }

    func test_composerInit_editingVisibility_winsOverInitialVisibility() throws {
        let code = try Self.strippedSource(of: Self.composerSourceURL)

        guard let injected = code.range(of: "self._visibility = State(initialValue: initialVisibility)",
                                        options: .backwards),
              let editing = code.range(of: "self._visibility = State(initialValue: editingVisibility)") else {
            XCTFail("Assignations de visibilité introuvables")
            return
        }
        XCTAssertTrue(
            injected.lowerBound < editing.lowerBound,
            "Le mode ÉDITION doit écraser la valeur injectée, donc venir APRÈS elle"
        )
    }

    // MARK: - Reprise de brouillon (rang 2 de la chaîne de précédence)

    func test_restoreDraft_visibilityRequiringUserSelection_fallsBackToFriends() {
        for stored in [PostVisibility.only, .except] {
            XCTAssertEqual(
                StoryComposerView.restorableVisibility(stored.rawValue),
                PostVisibility.friends.rawValue,
                """
                `StoryDraftStore.save(slides:visibility:)` ne persiste PAS \
                `visibilityUserIds` : restaurer « \(stored.rawValue) » publierait vers \
                une liste VIDE ou rouvrirait un sélecteur à l'ouverture.
                """
            )
        }
    }

    func test_restoreDraft_visibility_overridesInjectedInitialVisibility() throws {
        XCTAssertEqual(
            StoryComposerView.restorableVisibility(PostVisibility.public.rawValue),
            PostVisibility.public.rawValue,
            "Un mode mémorisable repris d'un brouillon survit tel quel"
        )
        XCTAssertEqual(
            StoryComposerView.restorableVisibility("MODE_INCONNU"),
            PostVisibility.friends.rawValue,
            "Une valeur illisible retombe sur le défaut produit"
        )

        // Le rang 2 n'a de sens que s'il ÉCRIT : `restoreDraft()` doit affecter
        // `visibility` sur les DEUX chemins de reprise (GRDB et legacy).
        let body = try Self.functionBody(named: "func restoreDraft()", in: Self.syncRestoreSourceURL)
        let writes = body.components(separatedBy: "visibility = Self.restorableVisibility(").count - 1
        XCTAssertEqual(writes, 2,
                       "Les deux chemins de reprise (GRDB + brouillon legacy) passent par le filtre")
    }

    func test_restoreDraft_doesNotRewriteTheRememberedPreference() throws {
        let body = try Self.functionBody(named: "func restoreDraft()", in: Self.syncRestoreSourceURL)

        for banned in ["remember(", "lastVisibility"] where body.contains(banned) {
            XCTFail("Reprendre un brouillon n'est pas publier : « \(banned) » n'a rien à faire dans restoreDraft()")
        }
    }

    /// Méta-test : sans lui, une garde qui pointerait le mauvais fichier ou
    /// isolerait un corps vide resterait verte pour toujours.
    func test_guardDetectsASuspensionPointInASampleBody() {
        let sample = """
        func publishAllSlides() {
            let snapshot = await snapshotAllSlides()
            onPublishAllInBackground(snapshot)
        }
        """
        let body = Self.functionBody(named: "func publishAllSlides()", in: sample)
        XCTAssertNotNil(body)
        XCTAssertTrue(body?.contains("await ") == true)
    }

    // MARK: - Helpers

    private static var packageRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
    }

    private static var publicationSourceURL: URL {
        packageRoot.appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Publication.swift")
    }

    private static var composerSourceURL: URL {
        packageRoot.appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView.swift")
    }

    private static var syncRestoreSourceURL: URL {
        packageRoot.appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift")
    }

    /// Même règle de strip que partout ailleurs. La variante locale coupait à la
    /// première `//` de la ligne, y compris DANS un littéral de chaîne — une URL
    /// `https://…` écrite en code vivant y perdait sa moitié droite.
    private static func strippedSource(of url: URL) throws -> String {
        ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func functionBody(named signature: String, in url: URL) throws -> String {
        let source = try String(contentsOf: url, encoding: .utf8)
        guard let body = functionBody(named: signature, in: source) else {
            throw XCTSkip("Fonction \(signature) introuvable dans \(url.lastPathComponent)")
        }
        return body
    }

    /// Isole le corps d'une fonction par équilibrage d'accolades, APRÈS retrait
    /// des commentaires : la prose qui explique le fix contient elle-même les
    /// motifs bannis (leçon `feedback_source_guard_tests_must_strip_comments`).
    ///
    /// Une seconde implémentation du même algorithme vivait ici jusqu'à ce que
    /// S5 en extraie la version partagée : deux règles de parsing jumelles,
    /// c'est deux endroits où corriger le prochain cas limite — et un seul qui
    /// sera corrigé. Le stripper partagé couvre EN PLUS les commentaires de
    /// bloc, que la variante locale laissait passer.
    private static func functionBody(named signature: String, in source: String) -> String? {
        ComposerSourceGuard.functionBody(
            named: signature,
            in: ComposerSourceGuard.stripComments(source))
    }
}
