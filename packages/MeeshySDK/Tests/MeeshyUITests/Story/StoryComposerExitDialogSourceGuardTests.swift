import XCTest

/// Garde de source **RETOURNÉE** (M10, 2026-08-23).
///
/// Elle exigeait la PRÉSENCE d'une feuille d'action de sortie (« Quitter sans
/// publier ? » → Sauvegarder / Quitter / Annuler) et interdisait de la
/// dégrader en `.alert` système — arbitrage B5/S2 : les leaders SOTA
/// présentent un choix de sortie par une feuille ancrée bas, jamais par une
/// alerte centrée à trois boutons.
///
/// La règle produit M10 tranche au-dessus de cet arbitrage : **zéro question à
/// la sortie**. Fermer le composer ENREGISTRE le brouillon, en silence. La
/// meilleure présentation d'une question qu'on ne doit plus poser reste son
/// absence — la garde change donc de sens, pas de sujet : elle interdit
/// désormais le RETOUR du dialogue, au lieu d'en policer la forme.
///
/// Ce qu'elle protégeait par ailleurs SURVIT, ici et dans
/// `StoryComposerExitAutoDraftTests` :
/// - la sortie ne doit jamais être DESTRUCTIVE (l'ancien « Quitter » l'était,
///   et c'était le seul bouton de l'app à jeter du travail sans corbeille) ;
/// - une session d'ÉDITION a droit au même traitement qu'une création
///   (directive user 2026-08-02, point c : une story mise en édition revient
///   en brouillon, son brouillon porte `editingPostId`). L'ancienne garde
///   l'exprimait en interdisant `!isEditingExistingStory` devant le bouton
///   « Sauvegarder » ; le bouton a disparu, l'interdit suit le code et porte
///   maintenant sur le chemin de fermeture lui-même.
///
/// `StoryComposerView` n'est pas « hostable » en XCTest (précédent :
/// `StoryComposerView_ShouldShowEmptyStateLargePickerTests.swift`) — la garde
/// s'ancre donc sur la SOURCE, comme `StoryBackgroundLayerVolumeSourceGuardTests`.
/// Les commentaires sont retirés avant analyse par `ComposerSourceGuard` : la
/// prose qui explique le retrait CITE les jetons bannis (elle le doit, sinon
/// la prochaine itération les réinvente), et une garde naïve échouerait sur sa
/// propre justification.
///
/// Le balayage porte sur TOUT `Sources/MeeshyUI/Story/` et non sur le seul
/// `StoryComposerView.swift` : un dialogue de sortie réintroduit dans une
/// extension voisine (`+TopBar`, `+Canvas`) échapperait à une garde nommant
/// son fichier — c'est la leçon du 4ᵉ jeu de glyphes.
final class StoryComposerExitDialogSourceGuardTests: XCTestCase {

    // MARK: - L'interdit

    /// Le cœur de la garde retournée. Trois jetons, trois façons dont la
    /// question de sortie est déjà revenue ailleurs dans ce dépôt : son titre
    /// localisé, son binding de présentation, et l'action destructive qu'elle
    /// était seule à offrir.
    func test_noExitDialogSurvivesAnywhereInTheComposer() throws {
        let offences = Self.exitDialogOffences(in: try ComposerSourceGuard.allStorySources())

        XCTAssertTrue(
            offences.isEmpty,
            """
            M10 — fermer le composer n'a plus rien à demander : le brouillon \
            s'écrit tout seul. Une feuille de sortie est revenue ici :
            \(offences.joined(separator: "\n"))
            """
        )
    }

    /// L'invariant anti-destruction, dit positivement : il n'existe qu'UN
    /// « enregistrer puis fermer » dans tout le composer, et c'est la
    /// fermeture elle-même. Un second appelant signerait le retour d'un bouton
    /// « Sauvegarder » quelque part — donc d'un choix offert à la sortie.
    func test_theOnlySaveAndDismissIsTheClosingItself() throws {
        let sources = try ComposerSourceGuard.allStorySources()
        let total = sources.reduce(0) {
            $0 + ComposerSourceGuard.occurrences(of: "saveDraftAndDismiss()", in: $1.code)
        }

        XCTAssertEqual(
            total, 2,
            """
            Attendu : la déclaration + son unique appelant (`handleDismiss`). \
            Une occurrence de plus = un bouton « Sauvegarder » est réapparu ; \
            une de moins = la fermeture a cessé d'enregistrer.
            """
        )

        let publication = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func handleDismiss()", in: publication))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "saveDraftAndDismiss()", in: body), 1,
            "La fermeture ENREGISTRE — c'est la promesse M10, et elle vit dans `handleDismiss`."
        )
    }

    /// La sortie n'emporte que les fantômes, jamais du travail. `.clear()` et
    /// `clearCurrentDraft()` appartiennent au seul discard explicite qui
    /// subsiste (« Recommencer », dans le bandeau de reprise).
    func test_theClosingPathIsNeverDestructive() throws {
        let publication = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func handleDismiss()", in: publication))

        for destructive in [".clear()", "clearCurrentDraft()", "clearAllDrafts()"] {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: destructive, in: body), 0,
                "Fermer n'est pas jeter : « \(destructive) » n'a rien à faire sur le chemin de sortie."
            )
        }
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "clearPhantomDraftsOnly()", in: body), 1,
            "Seuls les fantômes tombent, par la règle partagée, une seule fois."
        )
    }

    /// INVARIANT REPRIS de la garde d'origine (directive user 2026-08-02,
    /// point c). Elle vérifiait que le bouton « Sauvegarder » n'était pas
    /// masqué en édition ; le bouton n'existe plus, mais l'exclusion peut
    /// revenir un cran plus haut — sur la fermeture, ou sur la règle qu'elle
    /// lit. Une story mise en édition REVIENT en brouillon : son brouillon
    /// porte `editingPostId` et rouvre le mode édition à la reprise.
    func test_editSessionsAreSavedOnExitToo() throws {
        let publication = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")

        for scope in ["func handleDismiss()", "static func exitAction(", "static func exitPrompt("] {
            let body = try XCTUnwrap(
                ComposerSourceGuard.functionBody(named: scope, in: publication),
                "`\(scope)` introuvable — la garde ne protège plus rien.")

            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: "isEditingExistingStory", in: body), 0,
                """
                L'édition sort comme toute session : son brouillon porte \
                `editingPostId`. Terme retrouvé dans `\(scope)`.
                """
            )
        }
    }

    // MARK: - Méta-tests de la garde elle-même

    /// Contrôle POSITIF, et la seule chose qui distingue une garde d'un test
    /// vacuously vert : réintroduire l'interdit doit la faire rougir. Le
    /// fragment ci-dessous est le code RÉELLEMENT retiré le 2026-08-23.
    func test_guardDetectsAReintroducedExitDialog() {
        let reintroduced = """
        .confirmationDialog(
            String(localized: "story.composer.quitWithoutPublishing", defaultValue: "Quitter sans publier ?", bundle: .module),
            isPresented: $showDiscardAlert,
            titleVisibility: .visible
        ) {
            if exitPrompt.offersSave {
                Button(String(localized: "story.composer.save", defaultValue: "Sauvegarder", bundle: .module)) { saveDraftAndDismiss() }
            }
            Button(String(localized: "story.composer.quit", defaultValue: "Quitter", bundle: .module), role: .destructive) { cancelAndDismiss() }
        }
        """
        let offences = Self.exitDialogOffences(in: [(path: "Fake.swift", code: reintroduced)])

        XCTAssertEqual(offences.count, Self.bannedTokens.count)
        XCTAssertTrue(offences.allSatisfy { $0.hasPrefix("Fake.swift") })
    }

    /// La forme retenue par une seule des trois marques doit rougir aussi : un
    /// dialogue réécrit de zéro n'emprunterait pas forcément les trois.
    func test_guardDetectsEachBannedTokenOnItsOwn() {
        for token in Self.bannedTokens {
            let offences = Self.exitDialogOffences(
                in: [(path: "Fake.swift", code: "let x = \(token)")])
            XCTAssertEqual(offences.count, 1, "Le jeton « \(token) » doit suffire à faire rougir la garde.")
        }
    }

    /// Contrôle NÉGATIF : la forme actuelle ne déclenche rien. Les alertes qui
    /// subsistent dans le composer RAPPORTENT un échec média — elles ne
    /// demandent rien à la sortie, et la garde ne doit pas les confondre.
    func test_guardAcceptsTheCurrentForm() {
        let current = """
        .alert(
            String(localized: "story.composer.mediaLostTitle", defaultValue: "Médias indisponibles", bundle: .module),
            isPresented: Binding(get: { lostMediaCount > 0 }, set: { if !$0 { lostMediaCount = 0 } })
        ) {
            Button(String(localized: "story.composer.ok", defaultValue: "OK", bundle: .module)) { lostMediaCount = 0 }
        }

        func handleDismiss() {
            switch Self.exitAction(exitPrompt) {
            case .saveDraft:
                saveDraftAndDismiss()
            case .purgePhantoms:
                clearPhantomDraftsOnly()
                onDismiss()
            }
        }
        """
        XCTAssertTrue(Self.exitDialogOffences(in: [(path: "Fake.swift", code: current)]).isEmpty)
    }

    // MARK: - Helpers

    /// Les trois marques de la question de sortie. Chacune est un jeton
    /// UNIQUE au dépôt (ni `story.composer.quitWithoutPublishing` ni
    /// `showDiscardAlert` n'ont jamais eu de second porteur), et
    /// `cancelAndDismiss` nomme l'action que seule cette feuille offrait —
    /// l'homonyme d'`AudioPostComposerView` vit hors de `Sources/MeeshyUI/Story/`,
    /// hors du périmètre balayé.
    static let bannedTokens = [
        "story.composer.quitWithoutPublishing",
        "showDiscardAlert",
        "cancelAndDismiss",
    ]

    static func exitDialogOffences(in sources: [(path: String, code: String)]) -> [String] {
        sources.flatMap { source in
            bannedTokens
                .filter { source.code.contains($0) }
                .map { "\(source.path) : \($0)" }
        }
    }
}
