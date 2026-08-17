import XCTest
@testable import Meeshy

/// R-136 — « ordre DOM = ordre chronologique » pour la grille de
/// `RiverStreamHost`, côté iOS.
///
/// **Ré-preuve du gap (§0)** : `RiverStreamHost`/`RiverLaneCanvas` n'ont
/// AUCUNE suite dédiée — `ls apps/ios/MeeshyTests/Unit/Riviere/` ne cite ni
/// `RiverStreamHostTests` ni `RiverLaneCanvasTests`. Attendu : ce sont des
/// `View` SwiftUI/`Canvas`, non montables sans runtime UIKit complet (même
/// discipline que `RiverBubbleLayout`, extrait POUR être testable — les vues
/// elles-mêmes ne le sont pas dans ce dépôt, aucun ViewInspector n'y est
/// installé). Ce fichier ferme le trou LÀ où une garde de SOURCE suffit à
/// verrouiller la propriété demandée, sur le patron de
/// `ModeMenuModelTests.test_readingModeSubmenu_isMountedOnce_afterMarkRead
/// _behindTheFlag` (preuve par lecture de source, pas par montage de vue).
///
/// **Ce que cette suite NE prouve PAS** (documenté, pas contourné en
/// silence) : le tracé des connecteurs (`RiverLaneCanvas.drawConnectors`,
/// « le connecteur pointe le bon message ») reste sans témoin dédié — la
/// logique n'est PAS extraite en fonction pure testable (contrairement au
/// miroir web, `river-paint.ts` + `river-paint.test.ts`, qui EST pure et
/// testée sans DOM). La correction des `messageId` source/cible est
/// vectorisée à la couche LOI (`RiverLaneVectorTests`,
/// `ExpectedConnectorJSON.fromMessageId/toMessageId`) ; ce qui manque est la
/// preuve que la PEAU Canvas traduit fidèlement ces identifiants en
/// coordonnées de trait — un futur lot devrait extraire cette arithmétique
/// dans un type pur (`RiverCanvasPaint`, miroir de `RiverPaint`/
/// `buildRiverPaint`) pour la rendre testable sans Canvas.
final class RiverStreamHostSourceGuardTests: XCTestCase {

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func source(_ relativePath: String) throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Riviere/View/\(relativePath)"),
            encoding: .utf8
        )
    }

    /// La grille se peuple par `ForEach(0..<rankCount)` EN PREMIER (rang-
    /// majeur), `ForEach(0..<laneCount)` en second (couloir-mineur) — l'ORDRE
    /// TEXTUEL de ces deux boucles, l'une dans l'autre, EST l'ordre dans
    /// lequel SwiftUI insère les vues dans l'arbre (donc le DOM natif/
    /// l'ordre VoiceOver) : rang 0 tous couloirs, puis rang 1 tous
    /// couloirs, etc. — c'est-à-dire STRICTEMENT chronologique, jamais par
    /// couloir d'abord (ce qui mélangerait les temps).
    func test_grid_populatesRankMajor_rankLoopOutermost() throws {
        let code = try source("RiverStreamHost.swift")

        let rankLoopRange = try XCTUnwrap(
            code.range(of: "ForEach(0..<max(0, geometry.rankCount)"),
            "La boucle de rang a bougé — cette garde doit être re-pointée avant tout le reste."
        )
        let laneLoopRange = try XCTUnwrap(
            code.range(of: "ForEach(0..<laneCount, id: \\.self) { laneIndex in"),
            "La boucle de couloir a bougé — cette garde doit être re-pointée avant tout le reste."
        )
        XCTAssertTrue(
            rankLoopRange.lowerBound < laneLoopRange.lowerBound,
            "La boucle de RANG doit envelopper celle de COULOIR (rang-majeur) — sinon la " +
            "grille peuplerait couloir par couloir, mélangeant les instants d'un même rang " +
            "à travers plusieurs rangs avant de revenir : l'ordre du DOM cesserait d'être " +
            "chronologique."
        )
    }

    /// Aucune fonction de RÉORDONNANCEMENT (`.sorted`/`.reversed`/`.shuffled`)
    /// n'intervient entre la loi (`geometry.bubbles`, déjà chronologique par
    /// construction — R-130) et la grille : l'ordre du DOM est l'ordre de la
    /// loi, jamais un second tri posé par la peau.
    func test_grid_neverReordersBubbles() throws {
        let code = try source("RiverStreamHost.swift")
        for forbidden in [".sorted(", ".sorted {", ".reversed(", ".shuffled("] {
            XCTAssertFalse(
                code.contains(forbidden),
                "`RiverStreamHost.swift` contient `\(forbidden)` — un tri/réordonnancement " +
                "posé par la peau romprait l'ordre chronologique que `geometry.bubbles` " +
                "garantit déjà (R-130) et qu'aucune vue n'a le droit de recalculer (garde R15)."
            )
        }
    }

    /// Les cellules VIDES (aucune bulle à ce couloir/ce rang) ne portent
    /// aucun contenu accessible — seule la cellule qui PORTE une bulle
    /// expose du texte à VoiceOver (via `RiverBubbleView`, testé ailleurs) ;
    /// sans ce `accessibilityHidden`, un lecteur d'écran annoncerait des
    /// cellules muettes entre chaque bulle, brisant la lecture séquentielle.
    func test_emptyCells_areAccessibilityHidden() throws {
        let code = try source("RiverStreamHost.swift")
        XCTAssertTrue(
            code.contains(".accessibilityHidden(true)"),
            "Les cellules vides de la grille doivent rester `accessibilityHidden` — sinon " +
            "VoiceOver annoncerait des cellules muettes entre deux bulles."
        )
    }

    /// Le tracé décoratif (`RiverLaneCanvas`) est `accessibilityHidden` — le
    /// CONTENU (`geometry.bubbles`, l'ordre du DOM) porte toute
    /// l'information ; les traits n'en ajoutent aucune (§7bis/§7ter).
    func test_laneCanvas_isAccessibilityHidden() throws {
        let code = try source("RiverLaneCanvas.swift")
        XCTAssertTrue(
            code.contains(".accessibilityHidden(true)"),
            "`RiverLaneCanvas` doit rester caché de VoiceOver — décoratif, jamais porteur " +
            "d'une information que le contenu ne porte déjà."
        )
    }
}
