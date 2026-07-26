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
// Revue Task 3, finding « Important » : `.accessibilityAction` (annulation)
// ne doit être ATTACHÉ à la ligne que lorsqu'un job est réellement en vol —
// pas seulement son EFFET gardé par un `guard` interne à la closure. Sinon
// un utilisateur VoiceOver tourne le rotor « Actions » sur N'IMPORTE QUELLE
// ligne « Mes stories », sans aucune sauvegarde en cours, y voit « Annuler
// l'enregistrement », l'active — et rien ne se passe (action fantôme).
//
// Pas de ViewInspector ni de target UI-testing dans ce bundle (`MeeshyTests`
// est hébergé dans `Meeshy.app` sans XCUIApplication — cf. commentaire
// `project.yml` sur `BubbleExpandableTextUITests.swift`) : impossible
// d'observer à l'exécution la présence réelle d'un accessibilityCustomAction
// sur l'arbre d'accessibilité depuis un test XCTest unitaire ici. Cette garde
// vérifie donc la STRUCTURE SOURCE — que `.accessibilityAction` n'existe que
// dans la branche `if` (job en vol) de `body`, jamais dans `rowContent`
// (partagée, sans condition, par les deux branches) — même patron que
// `MyStoriesBulkDeleteGuardTests.test_myStoryRow_selection_conveyedViaRowTrait_notGlyphLabel`,
// ancré sur des marqueurs de structure réels plutôt qu'une fenêtre de
// caractères arbitraire (cf. piège documenté : une fenêtre à décompte fixe
// peut sortir de la déclaration visée dès qu'un commentaire bouge).
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

    func test_cancelAccessibilityAction_attachedOnlyInJobInFlightBranch_neverInSharedRowContent() throws {
        let viewSource = try source()

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
              ),
              let rowContentStart = viewSource.range(
                of: "private var rowContent: some View {",
                range: bodyStart.upperBound..<viewSource.endIndex
              ) else {
            XCTFail("MyStoryRow doit définir body puis rowContent, dans cet ordre")
            return
        }
        let bodyBlock = String(viewSource[bodyStart.lowerBound..<rowContentStart.lowerBound])

        guard let presenceCheckRange = bodyBlock.range(of: "if saveService.progress(for: story.id) != nil"),
              let actionRange = bodyBlock.range(of: ".accessibilityAction(named:"),
              let elseRange = bodyBlock.range(of: "} else {") else {
            XCTFail("""
                body doit conditionner .accessibilityAction par \
                `if saveService.progress(for: story.id) != nil { … } else { … }`. Bloc lu: \(bodyBlock)
                """)
            return
        }
        XCTAssertTrue(
            presenceCheckRange.lowerBound < actionRange.lowerBound,
            ".accessibilityAction doit apparaître APRÈS le if de présence du job, pas avant. Bloc lu: \(bodyBlock)"
        )
        XCTAssertTrue(
            actionRange.lowerBound < elseRange.lowerBound,
            ".accessibilityAction doit être dans la branche `if` (job en vol), avant le `else`. Bloc lu: \(bodyBlock)"
        )

        guard let rowContentEnd = viewSource.range(
            of: "/// Libellé VoiceOver composé",
            range: rowContentStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("rowContent doit être suivi de la doc de rowAccessibilityLabel")
            return
        }
        let rowContentBlock = String(viewSource[rowContentStart.lowerBound..<rowContentEnd.lowerBound])
        XCTAssertFalse(
            rowContentBlock.contains(".accessibilityAction(named:"),
            """
            rowContent est partagé SANS CONDITION par les deux branches de body : s'il porte \
            .accessibilityAction, l'action redevient permanente indépendamment du if/else vérifié \
            ci-dessus. Bloc lu: \(rowContentBlock)
            """
        )
    }
}
