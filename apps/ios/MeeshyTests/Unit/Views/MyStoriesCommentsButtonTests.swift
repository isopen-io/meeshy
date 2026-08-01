import XCTest
@testable import Meeshy

// MARK: - MyStoriesCommentsButtonTests
//
// Task 8 : icône commentaire (avec compteur) posée immédiatement à gauche du
// `⋯`/anneau de sauvegarde dans « Mes stories », ouvrant `CommentsSheetView`
// (celle des posts, réutilisée telle quelle) sur les commentaires de la
// story, composeur de réponse déjà fonctionnel par défaut.
//
// ⚠️ Périmètre : NE COUVRE PAS l'overlay commentaires incrusté du reader
// (`StoryViewerView`, `showCommentsOverlay` dans `StoryViewerView+Canvas.swift`)
// — volontairement distinct, hors scope de cette tâche. Aucun fichier
// `StoryViewerView*` n'est référencé ici.
//
// Pas de ViewInspector ni de target UI-testing dans ce bundle (`MeeshyTests`
// est hébergé dans `Meeshy.app` sans XCUIApplication) : les assertions sur le
// placement/l'accessibilité du bouton vérifient donc la STRUCTURE SOURCE de
// `MyStoriesView.swift`, ancrées sur de vraies déclarations — jamais sur une
// fenêtre `offsetBy:` codée en dur — même patron que
// `MyStoryRowCancelActionPresenceGuardTests` (`MyStoryRowSaveRingTests.swift`).
//
// `@MainActor` : `MyStoriesCommentsResolver` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
// annoté y est donc main-actor-isolé par défaut.
@MainActor
final class MyStoriesCommentsButtonTests: XCTestCase {

    // MARK: - MyStoriesCommentsResolver (pure guard)

    func test_shouldUseCache_cachedPostPresent_returnsTrue() {
        XCTAssertTrue(MyStoriesCommentsResolver.shouldUseCache(cachedPost: Optional(1)))
    }

    func test_shouldUseCache_cachedPostAbsent_returnsFalse() {
        XCTAssertFalse(MyStoriesCommentsResolver.shouldUseCache(cachedPost: Optional<Int>.none))
    }

    // MARK: - Source guards on MyStoriesView.swift

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/MyStoriesView.swift")
        return MyStoriesSourceCorpus.text()
    }

    /// Copié verbatim depuis `MyStoryRowCancelActionPresenceGuardTests.strippingComments`
    /// (même target `MeeshyTests`, `MyStoryRowSaveRingTests.swift`) : cette
    /// méthode y est `private`, donc inaccessible depuis ce fichier — Swift
    /// n'offre pas de portée intermédiaire entre `private` et `internal` ici.
    /// Dupliquer le MÊME algorithme éprouvé plutôt que d'en écrire un
    /// différent qui pourrait diverger silencieusement.
    private func strippingComments(_ source: String) -> String {
        var out = ""
        var inBlock = false
        for rawLine in source.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine)
            if inBlock {
                guard let end = line.range(of: "*/") else { continue }
                line = String(line[end.upperBound...])
                inBlock = false
            }
            while let start = line.range(of: "/*") {
                if let end = line.range(of: "*/", range: start.upperBound..<line.endIndex) {
                    line = String(line[..<start.lowerBound]) + String(line[end.upperBound...])
                } else {
                    line = String(line[..<start.lowerBound])
                    inBlock = true
                }
            }
            if let slashes = line.range(of: "//") {
                line = String(line[..<slashes.lowerBound])
            }
            out += line + "\n"
        }
        return out
    }

    /// Isole le `body` de `MyStoryRow` (borné par sa déclaration de struct en
    /// amont, `rowAccessibilityLabel` en aval) — `MyStoriesView` (le parent)
    /// déclare AUSSI un `var body: some View {`, une recherche non scopée
    /// matcherait le sien en premier.
    private func rowBody() throws -> String {
        let viewSource = strippingComments(try source())
        guard let rowStructStart = viewSource.range(
            of: "private struct MyStoryRow<MenuContent: View>: View {"
        ) else {
            XCTFail("MyStoryRow introuvable dans le fichier")
            return ""
        }
        guard let bodyStart = viewSource.range(
            of: "var body: some View {",
            range: rowStructStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("MyStoryRow doit définir body")
            return ""
        }
        guard let bodyEnd = viewSource.range(
            of: "private var rowAccessibilityLabel: String {",
            range: bodyStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("body doit être suivi de rowAccessibilityLabel")
            return ""
        }
        return String(viewSource[bodyStart.lowerBound..<bodyEnd.lowerBound])
    }

    /// Ordre visuel : le bouton commentaire précède l'anneau/`⋯`. Ancré sur le
    /// comportement (l'icône `bubble.left` apparaît avant `ellipsis`), pas sur
    /// une fenêtre de caractères — `bubble.left.fill` (compteur muet de la
    /// ligne) contient `bubble.left` comme sous-chaîne, d'où la recherche
    /// guillemets inclus pour ne matcher que le littéral exact du bouton.
    func test_commentButton_precedesRing_bubbleLeftIndexBeforeEllipsisIndex() throws {
        let bodyBlock = try rowBody()

        guard let bubbleRange = bodyBlock.range(of: "\"bubble.left\"") else {
            XCTFail("Le bouton commentaire doit utiliser l'icône bubble.left. Bloc lu: \(bodyBlock)")
            return
        }
        guard let ellipsisRange = bodyBlock.range(of: "\"ellipsis\"") else {
            XCTFail("Le menu « … » doit utiliser l'icône ellipsis. Bloc lu: \(bodyBlock)")
            return
        }
        XCTAssertTrue(
            bubbleRange.lowerBound < ellipsisRange.lowerBound,
            "Le bouton commentaire doit précéder visuellement l'anneau/le « … ». Bloc lu: \(bodyBlock)"
        )
    }

    /// Le bouton commentaire reste masqué du rotor (la ligne est
    /// `children: .ignore`, cf. commentaire au-dessus de `body`) : son propre
    /// libellé a11y n'existe pas — sinon il fuiterait dans le libellé composé
    /// de la ligne (`rowAccessibilityLabel`), qui doit rester inchangé par cet
    /// ajout.
    func test_commentButton_hiddenFromRotor() throws {
        let bodyBlock = try rowBody()

        guard let bubbleRange = bodyBlock.range(of: "Image(systemName: \"bubble.left\")") else {
            XCTFail("Bouton commentaire introuvable. Bloc lu: \(bodyBlock)")
            return
        }
        guard let nextMarker = bodyBlock.range(
            of: "if let progress = saveService.progress(for: story.id) {",
            range: bubbleRange.upperBound..<bodyBlock.endIndex
        ) else {
            XCTFail("L'anneau/menu doit suivre le bouton commentaire. Bloc lu: \(bodyBlock)")
            return
        }
        let buttonBlock = String(bodyBlock[bubbleRange.lowerBound..<nextMarker.lowerBound])
        XCTAssertTrue(
            buttonBlock.contains(".accessibilityHidden(true)"),
            """
            Le bouton commentaire doit être masqué du rotor — l'accès VoiceOver \
            passe par une action de ligne. Bloc lu: \(buttonBlock)
            """
        )
    }

    /// Même patron que l'action d'annulation d'enregistrement
    /// (`MyStoryRowCancelActionPresenceGuardTests`) : le modifier
    /// `.accessibilityActions { … }` reste TOUJOURS attaché (jamais de
    /// `.accessibilityAction(named:)` à un seul cas, qui avait motivé le
    /// if/else de body en round 1 — régression d'identité de vue) ; seul son
    /// CONTENU varie, ici conditionné par `!isSelecting` (même visibilité que
    /// le bouton lui-même).
    func test_accessibilityActions_commentsAction_insideUnconditionalBuilder_neverUsesNamedConvenience() throws {
        let bodyBlock = try rowBody()

        XCTAssertFalse(
            bodyBlock.contains(".accessibilityAction(named:"),
            """
            L'action commentaires doit passer par .accessibilityActions { … }, pas par \
            .accessibilityAction(named:) — cette forme forcerait un if/else autour de body \
            (régression d'identité de vue, cf. round 1). Bloc lu: \(bodyBlock)
            """
        )

        guard let actionsRange = bodyBlock.range(of: ".accessibilityActions {") else {
            XCTFail(".accessibilityActions introuvable dans body. Bloc lu: \(bodyBlock)")
            return
        }
        let actionsBlock = String(bodyBlock[actionsRange.lowerBound...])

        guard let commentsLabelRange = actionsBlock.range(of: "story.mine.comments.a11y") else {
            XCTFail(
                "L'action « Afficher les commentaires » doit être déclarée dans .accessibilityActions. Bloc lu: \(actionsBlock)"
            )
            return
        }
        guard let isSelectingRange = actionsBlock.range(
            of: "if !isSelecting {",
            range: actionsBlock.startIndex..<commentsLabelRange.lowerBound
        ) else {
            XCTFail(
                """
                L'action commentaires doit être conditionnée par `if !isSelecting` (même \
                visibilité que le bouton). Bloc lu: \(actionsBlock)
                """
            )
            return
        }
        XCTAssertTrue(
            isSelectingRange.lowerBound < commentsLabelRange.lowerBound,
            "Le libellé de l'action commentaires doit être À L'INTÉRIEUR du if !isSelecting. Bloc lu: \(actionsBlock)"
        )
    }

    // MARK: - Task 11 : compteur de commentaires affiché deux fois

    /// La rangée de métriques affichait le nombre de commentaires une SECONDE
    /// fois via `metric(icon: "bubble.left.fill", value: story.commentCount)`
    /// — purement décoratif, non tappable, à côté du bouton actionnable
    /// ci-dessus qui affiche déjà le même chiffre. Task 11 retire cette
    /// métrique ; le bouton (icône `bubble.left`, sans `.fill`) reste seul
    /// affichage du compteur.
    ///
    /// Piège du préfixe : `"bubble.left"` est un préfixe de
    /// `"bubble.left.fill"` — un test naïf du type
    /// `XCTAssertTrue(bodyBlock.contains("bubble.left"))` resterait VRAI même
    /// si la métrique décorative n'avait jamais été retirée, puisque cette
    /// sous-chaîne existe aussi à l'intérieur de `"bubble.left.fill"`. Pour
    /// distinguer réellement les deux : (1) l'absence est vérifiée sur la
    /// chaîne complète `bubble.left.fill`, qui ne peut apparaître QUE dans
    /// l'appel `metric(icon:)` retiré ; (2) la présence est vérifiée sur le
    /// littéral exact du bouton `Image(systemName: "bubble.left")` — le
    /// guillemet fermant suit immédiatement `left`, ce qui ne matche jamais à
    /// l'intérieur de `"bubble.left.fill"` (où le caractère suivant est `.`,
    /// pas `"`). Les deux assertions ensemble ne peuvent pas passer
    /// simultanément si la métrique décorative est encore présente.
    func test_bubbleLeftFillMetric_removed_bubbleLeftButton_stillPresent() throws {
        let bodyBlock = try rowBody()

        XCTAssertFalse(
            bodyBlock.contains("bubble.left.fill"),
            """
            La métrique décorative bubble.left.fill (doublon non tappable du \
            compteur de commentaires, cf. bouton bubble.left ci-dessous) doit \
            être retirée de la rangée de métriques. Bloc lu: \(bodyBlock)
            """
        )

        XCTAssertTrue(
            bodyBlock.contains("Image(systemName: \"bubble.left\")"),
            """
            Le bouton commentaire actionnable (icône bubble.left, sans .fill) \
            doit rester — seul affichage restant du compteur de commentaires. \
            Bloc lu: \(bodyBlock)
            """
        )
    }

    // MARK: - Vues + cœur (directive 2026-07-29)

    /// Le compteur de vues quitte la rangée sous l'heure pour devenir un bouton
    /// dédié (icône `eye` + compteur), immédiatement à gauche du bouton
    /// commentaires — même patron visuel, ouvre le « Listing des vues » (la
    /// même sheet que l'entrée du menu `⋯`). Ordre visuel garanti :
    /// œil < bulle < ellipsis. Littéral exact guillemets inclus : `"eye"` est
    /// un préfixe de `"eye.fill"`, une recherche non bornée matcherait la
    /// mauvaise icône.
    func test_viewsButton_eyePrecedesCommentsBubble() throws {
        let bodyBlock = try rowBody()

        guard let eyeRange = bodyBlock.range(of: "Image(systemName: \"eye\")") else {
            XCTFail("Le bouton vues doit utiliser l'icône eye. Bloc lu: \(bodyBlock)")
            return
        }
        guard let bubbleRange = bodyBlock.range(of: "Image(systemName: \"bubble.left\")") else {
            XCTFail("Le bouton commentaires doit rester. Bloc lu: \(bodyBlock)")
            return
        }
        XCTAssertTrue(
            eyeRange.lowerBound < bubbleRange.lowerBound,
            "Le bouton vues doit précéder visuellement le bouton commentaires. Bloc lu: \(bodyBlock)"
        )
    }

    /// L'ancienne métrique décorative `eye.fill` sous l'heure disparaît — le
    /// compteur de vues n'a plus qu'UN affichage, le bouton actionnable
    /// ci-dessus (même dédoublonnage que Task 11 pour les commentaires).
    func test_decorativeEyeFillMetric_removed() throws {
        let bodyBlock = try rowBody()
        XCTAssertFalse(
            bodyBlock.contains("metric(icon: \"eye.fill\""),
            "La métrique décorative eye.fill sous l'heure doit être retirée. Bloc lu: \(bodyBlock)"
        )
    }

    /// Le cœur sous l'heure n'apparaît QUE si au moins une réaction existe —
    /// jamais de « 0 » décoratif (directive : « afficher le cœur en bas de
    /// l'heure UNIQUEMENT si une vue a donné au moins un cœur »).
    func test_heartMetric_onlyWhenReactionCountPositive() throws {
        let bodyBlock = try rowBody()

        guard let guardRange = bodyBlock.range(of: "if story.reactionCount > 0 {") else {
            XCTFail("Le cœur doit être gardé par story.reactionCount > 0. Bloc lu: \(bodyBlock)")
            return
        }
        XCTAssertNotNil(
            bodyBlock.range(
                of: "metric(icon: \"heart.fill\", value: story.reactionCount)",
                range: guardRange.upperBound..<bodyBlock.endIndex
            ),
            "La métrique cœur doit être À L'INTÉRIEUR de sa garde reactionCount > 0. Bloc lu: \(bodyBlock)"
        )
    }

    /// Parité a11y avec les commentaires : l'action « Listing des vues » est
    /// déclarée dans `.accessibilityActions` (le bouton lui-même reste masqué
    /// du rotor, la ligne compose son propre libellé).
    func test_accessibilityActions_viewersAction_present() throws {
        let bodyBlock = try rowBody()

        guard let actionsRange = bodyBlock.range(of: ".accessibilityActions {") else {
            XCTFail(".accessibilityActions introuvable dans body. Bloc lu: \(bodyBlock)")
            return
        }
        let actionsBlock = String(bodyBlock[actionsRange.lowerBound...])
        XCTAssertTrue(
            actionsBlock.contains("story.mine.viewers.a11y"),
            "L'action « Listing des vues » doit être déclarée dans .accessibilityActions. Bloc lu: \(actionsBlock)"
        )
    }
}
