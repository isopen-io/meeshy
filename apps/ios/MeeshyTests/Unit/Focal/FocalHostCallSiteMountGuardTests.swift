import XCTest
@testable import Meeshy

/// F-085 (WS-6) — la garde de montage leçon 257 : « chercher les types
/// déclarés dont le nom n'apparaît à AUCUN site d'appel … écrire la garde en
/// ÉGALITÉ D'ENSEMBLES plutôt qu'en présence individuelle » (`tasks/lessons.md`,
/// leçon 257). `FocalPassCallSite` (F-084, `Focal/Scroll/FocalPassConstants.swift`)
/// pose les six sites en DONNÉES précisément pour que cette suite écrive la
/// garde par ÉGALITÉ, jamais par une liste de six assertions recopiées à la
/// main — un site ajouté demain à `FocalPassCallSite.allCases` fait rougir
/// cette suite tant qu'il n'a pas son marqueur dans l'hôte, sans qu'il faille
/// toucher ce fichier.
///
/// Chaque site d'appel porte, dans `MessageListViewController.swift`, un
/// commentaire marqueur littéral `// FocalPassCallSite.<rawValue>` — posé au
/// point d'appel RÉEL (pas au symbole `hostAnchor` seul, qui préexistait déjà
/// dans le fichier avant tout montage : `scrollViewDidScroll`,
/// `willDisplay`, `dataSource.apply`, `applyTopInsetToViews` sont des noms de
/// méthode qui existaient AVANT F-085, leur seule présence ne prouve donc
/// RIEN sur le montage du pass — d'où le marqueur dédié).
final class FocalHostCallSiteMountGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Marqueur attendu pour chaque site — construit depuis l'énumération
    /// GELÉE elle-même (`rawValue`), jamais recopié en chaîne libre : un
    /// renommage de cas dans `FocalPassCallSite` fait immédiatement échouer
    /// cette suite plutôt que de la laisser chercher un marqueur devenu faux.
    private func marker(for site: FocalPassCallSite) -> String {
        "FocalPassCallSite.\(site.rawValue)"
    }

    // MARK: - Leçon 257 : égalité d'ensembles

    func test_everyDeclaredCallSite_isMountedInTheHost() throws {
        let code = try hostSource()
        let declared = Set(FocalPassCallSite.allCases)
        let mounted = declared.filter { code.contains(marker(for: $0)) }
        let missing = declared.subtracting(mounted).map(\.rawValue).sorted()
        XCTAssertEqual(
            mounted, declared,
            "Sites de FocalPassCallSite déclarés mais NON montés dans " +
            "MessageListViewController.swift : \(missing) — chaque cas doit " +
            "porter son marqueur `// FocalPassCallSite.<cas>` au point d'appel " +
            "réel (leçon 257 : égalité d'ensembles, pas présence individuelle). " +
            "Si ce test échoue après l'ajout d'un septième site à " +
            "FocalPassCallSite, c'est un rappel exact : le montage a été " +
            "oublié, pas une faute de ce test."
        )
    }

    /// Corollaire de portée (leçon 257) : aucun marqueur orphelin — un
    /// marqueur qui ne correspond à AUCUN cas de `FocalPassCallSite`
    /// signalerait une faute de frappe qui rendrait le test précédent
    /// silencieusement moins strict qu'il ne le paraît.
    func test_noStrayCallSiteMarker() throws {
        let code = try hostSource()
        let validMarkers = Set(FocalPassCallSite.allCases.map(marker(for:)))
        let pattern = #"FocalPassCallSite\.[A-Za-z]+"#
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(code.startIndex..<code.endIndex, in: code)
        let found = Set(
            regex.matches(in: code, range: range).compactMap { match -> String? in
                guard let r = Range(match.range, in: code) else { return nil }
                return String(code[r])
            }
        )
        let stray = found.subtracting(validMarkers)
        XCTAssertTrue(
            stray.isEmpty,
            "Marqueur(s) `// FocalPassCallSite.*` sans cas correspondant dans " +
            "l'énumération GELÉE : \(stray.sorted()) — faute de frappe probable, " +
            "qui viderait de son sens le test d'égalité d'ensembles."
        )
    }

    // MARK: - Corollaire de portée : chaque site derrière sa PROPRE condition

    /// « Brancher les quatre overlays en dur satisferait une garde d'égalité
    /// tout en jouant les particules sur tous les messages — le défaut
    /// inverse, et pire » (leçon 257). Ici : monter les six sites SANS
    /// garde de drapeau romprait « flag off ⇒ zéro appel » (contrat §WS-6).
    /// Chaque fonction porteuse d'un site DOIT donc contenir sa propre garde
    /// sur `readingMode` (directe ou via `applyFocalPassIfEnabled`, qui la
    /// centralise pour les sites 1/3/4/5).
    func test_everyCallSiteIsGuardedByReadingMode_notUnconditional() throws {
        let code = try hostSource()

        // Sites 1/3/4/5 passent tous par `applyFocalPassIfEnabled()`, qui
        // porte la garde une fois pour tous — vérifier qu'ELLE la porte.
        XCTAssertTrue(
            code.contains("private func applyFocalPassIfEnabled() -> String? {\n        guard readingMode != .bubbles"),
            "applyFocalPassIfEnabled() doit garder `readingMode != .bubbles` en TÊTE de fonction — sans quoi les sites 1/3/4/5 appelleraient le pass même drapeau OFF (contrat §WS-6, « Flag off ⇒ bit-à-bit identique »)."
        )

        // Site 2 (willDisplay) — garde inline au point d'appel, pas dans une
        // fonction partagée (la cellule entrante n'utilise PAS
        // `applyFocalPassIfEnabled`, qui ré-élirait).
        XCTAssertTrue(
            code.contains("if readingMode != .bubbles {\n            syncFocalPassTheme()\n            focalPass.apply(to: cell, in: collectionView, descriptor:"),
            "Le site 2 (willDisplayCell) doit garder son appel `focalPass.apply(to:in:descriptor:)` derrière `readingMode != .bubbles` — sans quoi l'entrée d'une cellule appellerait le pass drapeau OFF."
        )

        // Site 6 — la garde vit dans les `didSet` eux-mêmes (`isViewLoaded`
        // + `oldValue != newValue`), qui ne rejouent JAMAIS depuis l'état
        // par défaut `.bubbles` au repos.
        XCTAssertTrue(
            code.contains("var readingMode: ConversationReadingMode = .bubbles {"),
            "`readingMode` doit rester à `.bubbles` par défaut — c'est la garde du site 6 : sans mutation explicite, `applyReadingModeChange()` n'est jamais appelée."
        )
    }
}
