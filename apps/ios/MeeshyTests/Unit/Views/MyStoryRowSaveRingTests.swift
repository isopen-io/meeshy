import XCTest
@testable import Meeshy

// MARK: - MyStoryRowSaveRingTests
//
// La ligne est `.accessibilityElement(children: .ignore)` : un bouton enfant
// (l'anneau) serait avalé par le rotor. La progression doit donc remonter dans
// le libellé de la LIGNE, pas dans celui de l'anneau.
//
// Assertions volontairement indépendantes de la locale : la CI tourne en `en`,
// comparer à un littéral français rendrait ces tests verts en local et rouges
// en CI.
//
// `@MainActor` : `MyStoryRowAccessibility` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
// annoté y est donc main-actor-isolé par défaut. Même patron que
// `StorySaveProgressMapperTests` (Task 2) pour la même raison.
@MainActor
final class MyStoryRowSaveRingTests: XCTestCase {

    func test_label_noSaveInFlight_returnsBaseUnchanged() {
        XCTAssertEqual(MyStoryRowAccessibility.label(base: "BASE", saveProgress: nil), "BASE")
    }

    func test_label_saveInFlight_keepsBaseAsPrefix() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.43)
        XCTAssertTrue(label.hasPrefix("BASE"), "libellé obtenu : \(label)")
        XCTAssertGreaterThan(label.count, "BASE".count, "un suffixe de progression doit être ajouté")
    }

    func test_label_saveInFlight_carriesPercentValue() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.43)
        XCTAssertTrue(label.contains("43"), "libellé obtenu : \(label)")
    }

    func test_label_roundsPercentToNearest() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.435)
        XCTAssertTrue(label.contains("44"), "libellé obtenu : \(label)")
    }

    func test_label_zeroProgress_carriesZero() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0)
        XCTAssertTrue(label.contains("0"), "libellé obtenu : \(label)")
    }

    func test_label_fullProgress_carriesHundred() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 1)
        XCTAssertTrue(label.contains("100"), "libellé obtenu : \(label)")
    }
}

// MARK: - MyStoryRowCancelActionPresenceGuardTests
//
// Revue Task 3, finding « Important » (round 1) : l'action d'annulation ne
// doit être PROPOSÉE au rotor VoiceOver que lorsqu'un job est réellement en
// vol — pas seulement son EFFET gardé par un `guard` interne à une closure
// toujours attachée. Sinon le rotor « Actions » propose « Annuler
// l'enregistrement » sur N'IMPORTE QUELLE ligne « Mes stories », sans aucune
// sauvegarde en cours, sans rien y activer (action fantôme).
//
// Round 1 avait résolu ce point avec un `if/else` posé AUTOUR de toute la
// ligne dans `body` — mais les deux branches produisent des types de vue
// concrets différents (`ModifiedContent<…, AccessibilityActionModifier>`
// contre le type nu de la ligne) : SwiftUI démonte et remonte TOUTE la ligne
// (vignette, bouton d'ouverture, élément d'accessibilité) à chaque
// démarrage/fin de sauvegarde, avec un risque de perte de focus VoiceOver.
// Round 2 (ce fichier) : la ligne garde une identité de vue stable —
// `.accessibilityActions { … }` (le conteneur `@ViewBuilder`, pas la
// convenience `.accessibilityAction(named:)` à un seul cas) reste TOUJOURS
// attaché ; seule sa CONTENU varie selon `saveService.progress(for:) != nil`,
// exactement comme un `Menu { if … { Button(...) } }` ne matérialise
// l'entrée que si la condition est vraie, sans jamais changer le type de
// `Menu` lui-même.
//
// Pas de ViewInspector ni de target UI-testing dans ce bundle (`MeeshyTests`
// est hébergé dans `Meeshy.app` sans XCUIApplication — cf. commentaire
// `project.yml` sur `BubbleExpandableTextUITests.swift`) : impossible
// d'observer à l'exécution la présence réelle d'un accessibilityCustomAction
// sur l'arbre d'accessibilité, ou l'identité de vue réellement matérialisée,
// depuis un test XCTest unitaire ici. Cette garde vérifie donc la STRUCTURE
// SOURCE, ancrée sur des marqueurs de déclaration réels — même patron que
// `MyStoriesBulkDeleteGuardTests.test_myStoryRow_selection_conveyedViaRowTrait_notGlyphLabel`.
@MainActor
final class MyStoryRowCancelActionPresenceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/MyStoriesView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Copié verbatim depuis `RightToLeftLayoutGuardTests.strippingComments`
    /// (même target `MeeshyTests`) : cette méthode y est `private`, donc
    /// inaccessible depuis ce fichier — Swift n'offre pas de portée
    /// intermédiaire entre `private` et `internal` ici. Dupliquer le MÊME
    /// algorithme éprouvé plutôt que d'en écrire un différent qui pourrait
    /// diverger silencieusement. Revue Task 3, round 2, point Minor : sans
    /// ce filtrage, une assertion négative sur le texte brut du modifier
    /// (`.accessibilityAction(named:` par ex.) se déclenche par chance de
    /// formulation, pas par construction — un futur commentaire citant ce
    /// texte la ferait échouer à tort.
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

    func test_body_neverForksViewIdentity_cancelActionLivesInsideUnconditionalAccessibilityActionsBuilder() throws {
        let viewSource = strippingComments(try source())

        // Ancré à l'intérieur de `MyStoryRow` : `MyStoriesView` (le parent)
        // déclare AUSSI un `var body: some View {` — une recherche non
        // scopée matcherait le sien en premier, pas celui de la ligne.
        guard let rowStructStart = viewSource.range(
            of: "private struct MyStoryRow<MenuContent: View>: View {"
        ) else {
            XCTFail("MyStoryRow introuvable dans le fichier")
            return
        }
        guard let bodyStart = viewSource.range(
            of: "var body: some View {",
            range: rowStructStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("MyStoryRow doit définir body")
            return
        }

        // (1) body ne doit JAMAIS forker en deux branches de type concret
        // différent selon l'état du job — c'était le bug round 1. Preuve
        // structurelle : le tout premier contenu de body doit être le
        // HStack lui-même, pas un `if`/`else` qui l'engloberait.
        let afterBody = viewSource[bodyStart.upperBound...].drop { $0 == "\n" || $0 == " " || $0 == "\t" }
        XCTAssertTrue(
            afterBody.hasPrefix("HStack(spacing: 12) {"),
            """
            body doit démarrer directement par le HStack de la ligne, sans if/else qui \
            forkerait son type concret (régression d'identité de vue, round 2). Début lu: \
            \(afterBody.prefix(160))
            """
        )

        guard let bodyEnd = viewSource.range(
            of: "private var rowAccessibilityLabel: String {",
            range: bodyStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("body doit être suivi de rowAccessibilityLabel")
            return
        }
        let bodyBlock = String(viewSource[bodyStart.lowerBound..<bodyEnd.lowerBound])

        // (2) L'action d'annulation passe par .accessibilityActions (le
        // conteneur ViewBuilder, toujours attaché), jamais par la
        // convenience .accessibilityAction(named:) à un seul cas — cette
        // dernière forme est ce qui avait motivé le if/else de body en
        // round 1.
        XCTAssertFalse(
            bodyBlock.contains(".accessibilityAction(named:"),
            """
            L'action d'annulation doit passer par .accessibilityActions { … }, pas par \
            .accessibilityAction(named:) — cette forme a motivé le if/else de body en round 1 \
            (régression d'identité de vue). Bloc lu: \(bodyBlock)
            """
        )

        guard let actionsRange = bodyBlock.range(of: ".accessibilityActions {") else {
            XCTFail(".accessibilityActions introuvable dans body. Bloc lu: \(bodyBlock)")
            return
        }
        let actionsBlock = String(bodyBlock[actionsRange.lowerBound...])

        // (3) Dans .accessibilityActions, le Button d'annulation doit rester
        // conditionné à un job en vol — sinon il redevient permanent
        // (régression du bug d'origine, cette fois à l'intérieur du nouveau
        // conteneur).
        guard let presenceCheckRange = actionsBlock.range(of: "if saveService.progress(for: story.id) != nil"),
              let buttonRange = actionsBlock.range(of: "Button(") else {
            XCTFail("""
                .accessibilityActions doit conditionner son Button par \
                `if saveService.progress(for: story.id) != nil`. Bloc lu: \(actionsBlock)
                """)
            return
        }
        XCTAssertTrue(
            presenceCheckRange.lowerBound < buttonRange.lowerBound,
            """
            Le Button d'annulation doit être À L'INTÉRIEUR du if de présence du job — sinon il \
            resterait proposé en permanence (bug d'origine). Bloc lu: \(actionsBlock)
            """
        )
    }
}
