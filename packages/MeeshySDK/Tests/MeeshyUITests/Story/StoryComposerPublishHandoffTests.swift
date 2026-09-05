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

    // MARK: - La slide VIERGE ne devient pas une story vide (#4730)

    /// **Publier crée un post PAR slide.** Une slide vierge devient donc une
    /// story qui ne rend RIEN — et comme le bandeau montre la plus récente,
    /// elle masque la vraie.
    ///
    /// Mesuré en production le 2026-09-01 : deux posts `STORY` à 451 ms
    /// d'intervalle, issus d'UNE publication — l'un peuplé, l'autre avec
    /// `{"v":3,"scenes":[{"objects":[]}]}`.
    ///
    /// `canPublish` ne pouvait pas l'attraper : il demande « y a-t-il DE QUOI
    /// publier » (`slides.contains { … }`), pas « CETTE slide en vaut-elle
    /// un ». Le doc-comment de `slideHasContent` nommait déjà la divergence —
    /// « les deux réponses divergent dès la 2ᵉ slide » — sans que le chemin de
    /// publication l'appelle jamais.
    func test_handoffSlides_dropsABlankSlide_soItNeverBecomesAnEmptyStory() {
        let slides = [Self.slideWithText("coucou", id: "pleine"),
                      StorySlide(id: "vierge")]

        let result = StoryComposerView.handoffSlides(
            slides, currentIndex: 0, currentEffects: slides[0].effects, slideImageIds: [])

        XCTAssertEqual(result.map(\.id), ["pleine"],
                       "Une slide vierge partie en publication devient une story qui ne montre rien.")
    }

    /// **Le cas qu'un filtre naïf casserait.** La story « fond + musique » n'a
    /// aucun contenu VISUEL : son audio est la matière narrative, et
    /// `canPublish` la reconnaît par un second terme que `slideHasContent` ne
    /// porte pas. La filtrer dessus seul PERDRAIT le contenu de l'auteur —
    /// pire que le défaut qu'on corrige.
    func test_handoffSlides_keepsAnAudioOnlySlide_becauseItsSoundIsTheContent() {
        var son = StoryEffects()
        son.backgroundAudioId = "sound-1"
        let slides = [Self.slideWithText("coucou", id: "pleine"),
                      StorySlide(id: "musique", effects: son)]

        let result = StoryComposerView.handoffSlides(
            slides, currentIndex: 0, currentEffects: slides[0].effects, slideImageIds: [])

        XCTAssertEqual(result.map(\.id), ["pleine", "musique"])
    }

    /// Une slide dont le SEUL contenu est son image de fond : le bitmap ne vit
    /// pas dans `effects` mais dans `slideImages`, sous l'id de la slide. Sans
    /// cet argument, le filtre jetterait une story-photo.
    func test_handoffSlides_keepsASlideWhoseOnlyContentIsItsBackgroundImage() {
        let slides = [Self.slideWithText("coucou", id: "pleine"),
                      StorySlide(id: "photo")]

        let result = StoryComposerView.handoffSlides(
            slides, currentIndex: 0, currentEffects: slides[0].effects,
            slideImageIds: ["photo"])

        XCTAssertEqual(result.map(\.id), ["pleine", "photo"])
    }

    /// **Si le filtre vide tout, il rend la liste d'origine.**
    ///
    /// Une publication qui ne part pas est un bouton SANS EFFET (loi 4), et
    /// perdre le travail de l'auteur est pire que publier une slide pauvre.
    /// Ce repli n'arrive que si `canPublish` a dit oui pour une raison que le
    /// prédicat par slide ne voit pas — c'est-à-dire si le prédicat a tort.
    func test_handoffSlides_everySlideBlank_returnsThemUnchanged_ratherThanPublishingNothing() {
        let slides = [StorySlide(id: "a"), StorySlide(id: "b")]

        let result = StoryComposerView.handoffSlides(
            slides, currentIndex: 0, currentEffects: StoryEffects(), slideImageIds: [])

        XCTAssertEqual(result.map(\.id), ["a", "b"])
    }

    /// **Le filtre passe APRÈS le rabat des effets du canvas.** Un sticker
    /// posé sur la slide courante ne vit encore que dans `currentEffects` :
    /// filtrer avant l'aurait fait disparaître avec sa slide.
    func test_handoffSlides_currentSlideCarryingOnlyCanvasEffects_survivesTheFilter() {
        var canvas = StoryEffects()
        canvas.stickerObjects = [StorySticker(emoji: "\u{2764}\u{FE0F}")]
        let slides = [Self.slideWithText("coucou", id: "pleine"),
                      StorySlide(id: "sticker-en-vol")]

        let result = StoryComposerView.handoffSlides(
            slides, currentIndex: 1, currentEffects: canvas, slideImageIds: [])

        XCTAssertEqual(result.map(\.id), ["pleine", "sticker-en-vol"])
    }

    /// **Le filtre doit être ALIMENTÉ.** Le paramètre est requis, donc tout
    /// site d'appel passe quelque chose — mais passer `[]` compilerait et
    /// jetterait en silence les stories dont le seul contenu est leur image de
    /// fond. Les deux sites de production doivent lire les clés RÉELLES.
    ///
    /// Garde de SOURCE parce que ni `publishAllSlides` ni `snapshotAllSlides`
    /// ne sont hostables en XCTest (même précédent que la garde d'absence de
    /// point de suspension, juste au-dessus).
    func test_bothProductionCallSites_feedTheFilterWithTheRealSlideImages() throws {
        let code = Self.publicationSource()
        let appels = code.components(separatedBy: "Self.handoffSlides(").dropFirst()
        XCTAssertEqual(appels.count, 2,
                       "Deux sites de production attendus — un troisième doit être vérifié ici.")
        for (index, appel) in appels.enumerated() {
            let corps = String(appel.prefix(400))
            XCTAssertTrue(corps.contains("slideImageIds: Set(viewModel.slideImages.keys)"),
                          "Le site \(index) alimente le filtre avec autre chose que les images réelles.")
        }
    }

    private static func publicationSource() -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Publication.swift")
        let brut = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        // Les commentaires sont retirés : celui qui explique le filtre CITE
        // `slideImageIds`, et ferait passer la garde tout seul.
        return brut.split(separator: "\n", omittingEmptySubsequences: false)
            .map { ligne -> String in
                guard let borne = ligne.range(of: "//") else { return String(ligne) }
                return String(ligne[ligne.startIndex..<borne.lowerBound])
            }
            .joined(separator: "\n")
    }

    private static func slideWithText(_ texte: String, id: String) -> StorySlide {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "t-\(id)", text: texte)]
        return StorySlide(id: id, effects: effets)
    }

    // MARK: - Atome pur

    func test_handoffSlides_currentIndexInRange_appliesCurrentEffectsToThatSlideOnly() {
        let slides = [StorySlide(id: "a"), StorySlide(id: "b")]
        var effects = StoryEffects()
        effects.thumbHash = "current"

        let result = StoryComposerView.handoffSlides(slides, currentIndex: 1, currentEffects: effects, slideImageIds: [])

        XCTAssertEqual(result[1].effects.thumbHash, "current")
        XCTAssertNil(result[0].effects.thumbHash, "La slide non courante n'est jamais touchée")
    }

    func test_handoffSlides_currentIndexOutOfRange_returnsSlidesUnchanged() {
        let slides = [StorySlide(id: "a")]
        var effects = StoryEffects()
        effects.thumbHash = "current"

        let result = StoryComposerView.handoffSlides(slides, currentIndex: 7, currentEffects: effects, slideImageIds: [])

        XCTAssertEqual(result.map(\.id), ["a"])
        XCTAssertNil(result[0].effects.thumbHash)
    }

    func test_handoffSlides_returnsCopy_mutatingResultDoesNotAffectInput() {
        let slides = [StorySlide(id: "a")]

        var result = StoryComposerView.handoffSlides(slides, currentIndex: 0, currentEffects: StoryEffects(), slideImageIds: [])
        result[0].content = "muté après le hand-off"

        XCTAssertNil(slides[0].content, "Le composer ne peut plus atteindre ce qui est parti")
    }

    // MARK: - Le hand-off ne déguise plus les mentions en légende

    /// Directive user 2026-08-18 : « on doit pouvoir identifier des utilisateurs
    /// dans les story sans que ce ne soit dans un texte ». Les pastilles du
    /// canevas partent désormais dans le champ `mentions` de `POST /posts`
    /// (`StoryViewModel.runStoryUpload`), PAS recopiées dans `content`.
    ///
    /// Le détour par le texte a existé le temps que le gateway n'ait pas de
    /// canal déclaré : il inventait une phrase d'auteur, visible de tous et
    /// traduite par le Prisme, pour satisfaire un extracteur.
    func test_handoffSlides_neverWritesCanvasMentionsIntoTheCaption() {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(text: "@alice")]
        let slides = [StorySlide(id: "a", effects: effects)]

        let result = StoryComposerView.handoffSlides(slides, currentIndex: 0, currentEffects: effects, slideImageIds: [])

        XCTAssertNil(result[0].content, "La légende reste celle de l'auteur, ou rien.")
    }

    /// Et la légende qu'il a réellement écrite (édition, repost) survit intacte.
    func test_handoffSlides_leavesAnAuthoredCaptionUntouched() {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(text: "@alice")]
        let slides = [StorySlide(id: "a", content: "coucou", effects: effects)]

        let result = StoryComposerView.handoffSlides(slides, currentIndex: 0, currentEffects: effects, slideImageIds: [])

        XCTAssertEqual(result[0].content, "coucou")
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

    /// Directive user 2026-08-02 (SUPPLANTE la spec 2026-08-01) : une story ne
    /// quitte le brouillon QUE définitivement publiée. `accepted` signifie
    /// seulement « accepté en file » — le hand-off ne détruit donc PLUS le
    /// brouillon : il le GÈLE (`freezeCurrentDraftForPublish` → persistance
    /// légère + `pendingPublishAt`). Seul le succès serveur confirmé supprime
    /// le brouillon ; l'échec permanent le ramène éditable avec son erreur.
    func test_publishAllSlides_freezesTheDraftInsteadOfDestroyingIt_onlyWhenAccepted() throws {
        let body = try Self.functionBody(named: "func publishAllSlides()",
                                         in: Self.publicationSourceURL)

        XCTAssertFalse(
            body.contains("clearCurrentDraft()"),
            """
            Le hand-off ne détruit plus le brouillon : « accepté en file » n'est pas \
            « publié ». La suppression n'appartient qu'aux consommateurs de SUCCÈS serveur.
            """
        )

        guard let callRange = body.range(of: "onPublishAllInBackground(") else {
            XCTFail("Hand-off introuvable")
            return
        }
        for gated in ["freezeCurrentDraftForPublish()", "draftAutosaveSuspended = true"] {
            guard let range = body.range(of: gated) else {
                XCTFail("« \(gated) » a disparu de publishAllSlides()")
                continue
            }
            XCTAssertTrue(
                callRange.lowerBound < range.lowerBound,
                """
                « \(gated) » s'exécute AVANT de savoir si le hand-off est accepté : \
                sur un refus (édition hors-ligne, surface inerte) le composer reste ouvert \
                avec un brouillon gelé à tort et son autosave morte pour la session.
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
                Sans liste persistée, restaurer « \(stored.rawValue) » publierait vers \
                une liste VIDE ou rouvrirait un sélecteur à l'ouverture.
                """
            )
        }
    }

    func test_restoreDraft_visibilityRequiringUserSelection_survivesWithPersistedIds() {
        for stored in [PostVisibility.only, .except] {
            XCTAssertEqual(
                StoryComposerView.restorableVisibility(stored.rawValue, userIds: ["u1", "u2"]),
                stored.rawValue,
                "Le store persiste `visibilityUserIds` : « \(stored.rawValue) » repris avec sa liste survit tel quel"
            )
        }
        XCTAssertEqual(
            StoryComposerView.restorableVisibility("MODE_INCONNU", userIds: ["u1"]),
            PostVisibility.friends.rawValue,
            "Une liste persistée ne sauve pas un mode illisible"
        )
    }

    func test_restoreDraft_restoresAudienceIdsAndLanguage() throws {
        let body = try Self.functionBody(named: "func restoreDraft()", in: Self.syncRestoreSourceURL)
        XCTAssertTrue(
            body.contains("visibilityUserIds = stored.visibilityUserIds"),
            "La liste d'audience du brouillon doit revivre avec lui"
        )
        XCTAssertTrue(
            body.contains("storyLanguage = storedLanguage"),
            "La langue d'origine du brouillon doit revivre avec lui"
        )
    }

    func test_autosave_persistsAudienceAndLanguage() throws {
        let code = try Self.strippedSource(of: Self.syncRestoreSourceURL)
        let idsWrites = code.components(separatedBy: "visibilityUserIds: visibilityUserIds").count - 1
        XCTAssertGreaterThanOrEqual(
            idsWrites, 2,
            "Les DEUX écritures de brouillon (persistDraft + autosave débouncé) doivent persister la liste d'audience"
        )
        let langWrites = code.components(separatedBy: "originalLanguage: storyLanguage").count - 1
        XCTAssertGreaterThanOrEqual(
            langWrites, 2,
            "Les DEUX écritures de brouillon doivent persister la langue de la story"
        )
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
