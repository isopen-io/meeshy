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
// SOURCE — même patron que
// `MyStoriesBulkDeleteGuardTests.test_myStoryRow_selection_conveyedViaRowTrait_notGlyphLabel`.
//
// Elle s'ancre sur le COMPORTEMENT protégé (l'action est-elle attachée sans
// condition ? son bouton est-il matérialisé conditionnellement à l'intérieur ?)
// et non sur le texte du prédicat : ancrée sur le littéral exact
// `saveService.progress(for: story.id) != nil`, elle est passée au rouge au
// premier renommage de la condition (22aeacdf7, qui l'a remplacée par
// `saveService.isCancellable(storyId:)`) sans qu'aucun invariant n'ait bougé —
// et personne ne l'a vu, `-only-testing` ciblant la CLASSE, pas le fichier.
// Doctrine déjà appliquée en `b7aeb5020`.
@MainActor
final class MyStoryRowCancelActionPresenceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/MyStoriesView.swift")
        return MyStoriesSourceCorpus.text()
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

    /// Corps de `MyStoryRow.body`, commentaires retirés.
    ///
    /// Ancré à l'intérieur de `MyStoryRow` : `MyStoriesView` (le parent)
    /// déclare AUSSI un `var body: some View {` — une recherche non scopée
    /// matcherait le sien en premier, pas celui de la ligne.
    private func rowBodyBlock() throws -> String? {
        let viewSource = strippingComments(try source())
        guard let rowStructStart = viewSource.range(
            of: "private struct MyStoryRow<MenuContent: View>: View {"
        ) else {
            XCTFail("MyStoryRow introuvable dans le fichier")
            return nil
        }
        guard let bodyStart = viewSource.range(
            of: "var body: some View {",
            range: rowStructStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("MyStoryRow doit définir body")
            return nil
        }
        guard let bodyEnd = viewSource.range(
            of: "private var rowAccessibilityLabel: String {",
            range: bodyStart.upperBound..<viewSource.endIndex
        ) else {
            XCTFail("body doit être suivi de rowAccessibilityLabel")
            return nil
        }
        return String(viewSource[bodyStart.lowerBound..<bodyEnd.lowerBound])
    }

    /// Conditions `if …` ENGLOBANTES d'une aiguille dans un bloc de code, de
    /// la plus externe à la plus interne. Tableau vide = l'aiguille est
    /// déclarée inconditionnellement. `nil` = aiguille absente du bloc.
    ///
    /// C'est l'outil qui rend cette garde **comportementale** : ce qu'elle
    /// protège, c'est « qui est gardé par quoi » — pas le texte du prédicat.
    /// Round 2 de la revue finale a renommé la condition d'annulation
    /// (`saveService.progress(for: story.id) != nil` → `saveService
    /// .isCancellable(storyId: story.id)`, commit 22aeacdf7) : la garde,
    /// alors ancrée sur le littéral exact, est passée au rouge alors que
    /// l'invariant qu'elle protège n'avait pas bougé d'un pouce. Même
    /// doctrine que `b7aeb5020` (« la garde s'ancre sur le comportement, pas
    /// la signature »).
    private func enclosingConditions(of needle: String, in block: String) -> [String]? {
        var conditionAtDepth: [Int: String] = [:]
        var depth = 0
        var found: [String]?
        for rawLine in block.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let opens = line.filter { $0 == "{" }.count
            let closes = line.filter { $0 == "}" }.count
            if trimmed.hasPrefix("if "), opens > closes {
                conditionAtDepth[depth] = trimmed
                    .dropFirst(3)
                    .replacingOccurrences(of: "{", with: "")
                    .trimmingCharacters(in: .whitespaces)
            }
            if found == nil, trimmed.contains(needle) {
                found = (0..<depth).compactMap { conditionAtDepth[$0] }
            }
            depth += opens - closes
            conditionAtDepth = conditionAtDepth.filter { $0.key < depth }
        }
        return found
    }

    /// Auto-test de l'outil : la garde doit rester verte quand la CONDITION
    /// est renommée, et rouge quand elle DISPARAÎT.
    ///
    /// C'est précisément ce qui a échoué : ancrée sur le littéral exact
    /// `saveService.progress(for: story.id) != nil`, la garde est passée au
    /// rouge le jour où la condition est devenue
    /// `saveService.isCancellable(storyId: story.id)` — sans qu'aucun
    /// invariant n'ait bougé. Ce test verrouille la propriété qui l'évite,
    /// sur des sources SYNTHÉTIQUES : nul besoin de casser la production
    /// pour prouver que l'ancrage est comportemental.
    func test_enclosingConditions_survivesRenaming_butNotRemoval() {
        let renamedGate = """
        var body: some View {
            HStack(spacing: 12) {
            }
            .accessibilityActions {
                if saveService.progress(for: story.id) != nil {
                    Button("x") {
                        saveService.cancel(storyId: story.id)
                    }
                }
            }
        }
        """
        XCTAssertEqual(
            enclosingConditions(of: "saveService.cancel(storyId:", in: renamedGate),
            ["saveService.progress(for: story.id) != nil"],
            "un simple renommage du prédicat ne doit pas casser la garde"
        )

        let noGate = """
        var body: some View {
            HStack(spacing: 12) {
            }
            .accessibilityActions {
                Button("x") {
                    saveService.cancel(storyId: story.id)
                }
            }
        }
        """
        XCTAssertEqual(
            enclosingConditions(of: "saveService.cancel(storyId:", in: noGate), [],
            "sans condition englobante, la garde doit voir un tableau VIDE et échouer"
        )

        let wrappedModifier = """
        var body: some View {
            HStack(spacing: 12) {
            }
            if hasJob {
                EmptyView()
                    .accessibilityActions {
                    }
            }
        }
        """
        XCTAssertEqual(
            enclosingConditions(of: ".accessibilityActions {", in: wrappedModifier), ["hasJob"],
            "un modifier posé derrière une condition doit être vu comme tel"
        )
    }

    /// Invariant 1/2 — **l'identité de vue de la ligne ne forke jamais**.
    ///
    /// Ni un `if/else` autour du corps (bug round 1 : deux types de vue
    /// concrets, donc démontage/remontage complet de la ligne — vignette,
    /// bouton d'ouverture, élément d'accessibilité — à chaque
    /// démarrage/fin de sauvegarde, avec perte de focus VoiceOver), ni un
    /// `.accessibilityActions` posé derrière une condition, ce qui
    /// produirait exactement le même fork une couche plus bas.
    func test_body_neverForksViewIdentity_accessibilityActionsIsAlwaysAttached() throws {
        guard let bodyBlock = try rowBodyBlock() else { return }

        let afterBody = bodyBlock
            .range(of: "var body: some View {")
            .map { bodyBlock[$0.upperBound...].drop { $0 == "\n" || $0 == " " || $0 == "\t" } }
        XCTAssertEqual(
            afterBody?.prefix(6),
            "HStack",
            """
            Le corps de la ligne doit démarrer directement par sa pile de contenu, sans if/else \
            qui l'engloberait : les deux branches auraient des types de vue concrets différents, \
            donc SwiftUI démonterait et remonterait TOUTE la ligne à chaque bascule de \
            sauvegarde (perte de focus VoiceOver). Début lu: \(afterBody?.prefix(160) ?? "")
            """
        )

        guard let conditions = enclosingConditions(of: ".accessibilityActions {", in: bodyBlock) else {
            XCTFail("""
                Les actions VoiceOver de la ligne doivent passer par le conteneur \
                `.accessibilityActions { … }` — introuvable. Bloc lu: \(bodyBlock)
                """)
            return
        }
        XCTAssertEqual(
            conditions, [],
            """
            `.accessibilityActions` doit être attaché INCONDITIONNELLEMENT à la ligne : c'est ce \
            qui garde son identité de vue stable pendant toute la sauvegarde. Le posant derrière \
            une condition, le type concret de la ligne redeviendrait dépendant de l'état du job \
            et SwiftUI la remonterait à chaque bascule. Conditions englobantes trouvées: \
            \(conditions)
            """
        )

        // La convenience à un seul cas ne peut PAS accueillir de condition
        // dans son corps : l'adopter forcerait à reconditionner la vue
        // elle-même — c'est exactement ce qui avait produit le fork du
        // round 1. C'est un fait de construction, pas une préférence.
        XCTAssertFalse(
            bodyBlock.contains(".accessibilityAction(named:"),
            """
            L'action d'annulation doit rester dans le conteneur @ViewBuilder \
            `.accessibilityActions { … }`, jamais dans la convenience à un seul cas : cette \
            dernière n'accepte pas de condition dans son corps, donc conditionner sa PRÉSENCE \
            forkerait à nouveau l'identité de vue de la ligne. Bloc lu: \(bodyBlock)
            """
        )
    }

    /// Invariant 2/2 — **l'annulation reste conditionnelle À L'INTÉRIEUR du
    /// ViewBuilder**.
    ///
    /// Bug d'origine : le rotor « Actions » proposait « Annuler
    /// l'enregistrement » sur N'IMPORTE QUELLE ligne « Mes stories », sans
    /// aucune sauvegarde en cours et sans rien y activer (action fantôme —
    /// son EFFET était gardé par un `guard` interne, sa PRÉSENCE non).
    ///
    /// Ancrage sur l'EFFET (`saveService.cancel(storyId:`) et non sur le
    /// texte du prédicat : la garde doit survivre à un renommage de la
    /// condition, pas à sa disparition.
    func test_cancelAction_isGatedInsideTheBuilder_onTheSharedSaveState() throws {
        guard let bodyBlock = try rowBodyBlock() else { return }

        let cancelEffect = "saveService.cancel(storyId:"
        guard let actionsRange = bodyBlock.range(of: ".accessibilityActions {"),
              let effectRange = bodyBlock.range(of: cancelEffect) else {
            XCTFail("""
                La ligne doit exposer une action VoiceOver qui appelle `\(cancelEffect)` depuis \
                `.accessibilityActions { … }`. Bloc lu: \(bodyBlock)
                """)
            return
        }
        XCTAssertTrue(
            actionsRange.lowerBound < effectRange.lowerBound,
            """
            L'annulation VoiceOver doit être déclarée DANS `.accessibilityActions`, pas ailleurs \
            dans le corps de la ligne (elle serait alors avalée par \
            `.accessibilityElement(children: .ignore)`). Bloc lu: \(bodyBlock)
            """
        )

        guard let gates = enclosingConditions(of: cancelEffect, in: bodyBlock) else {
            XCTFail("Effet d'annulation introuvable. Bloc lu: \(bodyBlock)")
            return
        }
        XCTAssertFalse(
            gates.isEmpty,
            """
            L'action d'annulation doit rester CONDITIONNELLE à l'intérieur du ViewBuilder : \
            déclarée inconditionnellement, le rotor VoiceOver la proposerait sur toutes les \
            lignes, sans sauvegarde en cours et sans rien activer (action fantôme — le bug \
            d'origine). Aucune condition englobante trouvée. Bloc lu: \(bodyBlock)
            """
        )
        XCTAssertTrue(
            gates.contains { $0.contains("saveService") },
            """
            La condition qui matérialise l'action doit interroger le service de sauvegarde \
            partagé — le MÊME état que celui qui désactive le tap de l'anneau — sinon le rotor \
            et l'anneau pourraient diverger sur un même job. Conditions englobantes trouvées: \
            \(gates)
            """
        )
    }
}
