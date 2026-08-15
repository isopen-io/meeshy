import XCTest
@testable import Meeshy

/// F-085 (WS-6) — gardes source de l'hôte : R1 (`flashCell` n'efface plus la
/// perspective), R2 (reset des trois registrations), écrivain UNIQUE de
/// `contentInset.bottom` (§4.5), atterrissage `.focal` SEUL (§4.7),
/// typographie 15→16 JAMAIS pendant le défilement (§4.6), garde R15 sur les
/// sections de calcul ajoutées par F-085.
///
/// Même patron que `FocalScrollPassSourceGuardTests` (F-084) : ces
/// invariants ne se prouvent pas par une assertion sur une valeur — ils se
/// prouvent en inspectant le CODE de l'hôte, un `UIViewController` UIKit
/// vivant qu'aucun harnais de montage complet ne peut couvrir ici (pas de
/// toolchain Swift sous Linux, R5).
final class FocalHostSourceGuardTests: XCTestCase {

    private func hostRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ fileName: String) throws -> String {
        try String(contentsOf: hostRoot().appendingPathComponent(fileName), encoding: .utf8)
    }

    private func strippedSource(_ fileName: String) throws -> String {
        AppSourceGuard.stripComments(try source(fileName))
    }

    // MARK: - R1 : `flashCell` n'écrit plus `cell.transform`/`cell.alpha` en Focal

    /// Le POINT D'ENTRÉE `flashCell` ne doit lui-même écrire ni
    /// `cell.transform` ni `cell.alpha` — il délègue à `legacyFlashCell`
    /// (Script/bulles, comportement historique CONSERVÉ verbatim, où ces
    /// écritures restent légitimes) ou à `focalPass.flash` (Focal, décoration
    /// `CALayer`, §4.7).
    func test_flashCell_entryPoint_writesNeitherCellTransformNorCellAlpha() throws {
        let code = try source("MessageListViewController.swift")
        guard let range = code.range(of: "private func flashCell(at indexPath: IndexPath, strong: Bool = false) {"),
              let endRange = code.range(of: "\n    /// Comportement HISTORIQUE, verbatim", range: range.upperBound..<code.endIndex)
        else {
            XCTFail("Corps de `flashCell` introuvable dans MessageListViewController.swift — la fonction a-t-elle été renommée ?")
            return
        }
        let body = String(code[range.lowerBound..<endRange.lowerBound])
        XCTAssertFalse(
            body.contains("cell.transform"),
            "flashCell (point d'entrée) écrit `cell.transform` — en mode .focal cela EFFACE la perspective posée par le pass sur la cellule d'atterrissage (R1, gravité haute). Cette écriture doit vivre UNIQUEMENT dans `legacyFlashCell` (Script/bulles)."
        )
        XCTAssertFalse(
            body.contains("cell.alpha"),
            "flashCell (point d'entrée) écrit `cell.alpha` — même raison que `cell.transform` ci-dessus (R1)."
        )
        XCTAssertTrue(
            body.contains("focalPass.flash(cell:"),
            "flashCell doit déléguer à `focalPass.flash(cell:strong:)` (décoration CALayer, §4.7) pour le chemin `.focal`."
        )
        XCTAssertTrue(
            body.contains("legacyFlashCell(at: indexPath, strong: strong)"),
            "flashCell doit replier sur `legacyFlashCell` pour Script/bulles — comportement historique inchangé (garde « flag off ⇒ bit-à-bit identique »)."
        )
    }

    // MARK: - R2 : reset en première ligne des trois registrations

    /// « Aucune sous-classe de cellule, donc aucun `prepareForReuse` » —
    /// sans ce reset, une cellule recyclée hériterait du transform/de la
    /// décoration de son occupant précédent (§4.8 « hors sites »).
    func test_allThreeCellRegistrations_resetTheFocalPassFirst() throws {
        let code = try strippedSource("MessageListViewController.swift")
        let registrationMarkers = [
            "let typingRegistration = UICollectionView.CellRegistration",
            "let dayHeaderRegistration = UICollectionView.CellRegistration",
            "let messageRegistration = UICollectionView.CellRegistration",
        ]
        for marker in registrationMarkers {
            guard let range = code.range(of: marker) else {
                XCTFail("Registration introuvable : `\(marker)` — MessageListViewController.swift a-t-il changé de forme ?")
                continue
            }
            // Fenêtre de 400 caractères après la déclaration : large assez
            // pour couvrir le `guard let self` + la ligne de reset, jamais
            // assez pour déborder sur la registration suivante.
            let windowEnd = code.index(range.upperBound, offsetBy: 400, limitedBy: code.endIndex) ?? code.endIndex
            let window = code[range.upperBound..<windowEnd]
            XCTAssertTrue(
                window.contains("focalPass.reset(cell)"),
                "`\(marker)` ne réinitialise pas `focalPass.reset(cell)` en tête de closure — une cellule recyclée hériterait du transform/de la carte de son occupant précédent (R2, §4.8 « hors sites »)."
            )
        }
    }

    // MARK: - §4.5 : `contentInset.bottom` a un écrivain UNIQUE

    /// Un second site d'écriture de `contentInset.bottom` se battrait avec
    /// la garde `if != total` de `applyTopInsetToViews` à chaque tick
    /// SwiftUI (§4.5). `applyBottomInset` (qui écrit `contentInset.top`) ne
    /// doit JAMAIS toucher `.bottom` directement — il délègue à
    /// `applyTopInsetToViews()` pour recomposer `headInset`.
    func test_contentInsetBottom_hasASingleWriter() throws {
        let code = try strippedSource("MessageListViewController.swift")
        let occurrences = code.components(separatedBy: "collectionView.contentInset.bottom =").count - 1
        XCTAssertEqual(
            occurrences, 1,
            "`collectionView.contentInset.bottom` est écrit à \(occurrences) endroits — un SEUL est attendu, dans `applyTopInsetToViews` (§4.5 : deux écrivains se battraient contre la garde `if != total` à chaque tick SwiftUI)."
        )
        XCTAssertFalse(
            code.range(of: "func applyBottomInset")
                .map { code[$0.lowerBound...].prefix(600) }?
                .contains("contentInset.bottom =") ?? true,
            "applyBottomInset ne doit jamais écrire `contentInset.bottom` directement — il recompose `headInset` en appelant `applyTopInsetToViews()` (écrivain unique)."
        )
    }

    // MARK: - §4.7 : l'atterrissage dans la bande est `.focal` SEUL

    func test_landingBand_isGuardedToFocalOnly() throws {
        let code = try strippedSource("MessageListViewController.swift")
        guard let range = code.range(of: "private func landOnFocusBand(indexPath: IndexPath, animated: Bool) {") else {
            XCTFail("landOnFocusBand introuvable — l'atterrissage §4.7 a-t-il été renommé ?")
            return
        }
        let windowEnd = code.index(range.upperBound, offsetBy: 300, limitedBy: code.endIndex) ?? code.endIndex
        let window = code[range.upperBound..<windowEnd]
        XCTAssertTrue(
            window.contains("guard readingMode == .focal"),
            "landOnFocusBand doit garder `readingMode == .focal` — Script et bulles conservent `.centeredVertically` (contrat §4.7 : « les deux routines conservent .centeredVertically »)."
        )
        XCTAssertTrue(
            window.contains(".centeredVertically"),
            "landOnFocusBand doit conserver le repli `.centeredVertically` pour Script/bulles."
        )
        // Les DEUX sites d'appel (scrollToMessage, scrollToMessageFast)
        // passent par la même fonction — plus aucune occurrence NUE de
        // `.centeredVertically` ne doit subsister dans `scrollToMessage`/
        // `scrollToMessageFast` eux-mêmes (elle vit UNIQUEMENT dans
        // `landOnFocusBand`, partagée).
        let bareOccurrences = code.components(separatedBy: ".centeredVertically").count - 1
        XCTAssertEqual(
            bareOccurrences, 1,
            "`.centeredVertically` apparaît \(bareOccurrences) fois — UNE seule attendue (dans `landOnFocusBand`, partagée par les deux routines de saut, §4.7 travail 8 : « Les deux, ensemble »)."
        )
    }

    // MARK: - §4.6 : la typographie ne bouge JAMAIS pendant le défilement

    /// Asymétrie voulue (contrat Lentille §4.3 note finale) : le site 1
    /// (`scrollViewDidScroll`) est un pur compositor — aucun
    /// `reconfigureItems`/`reconfigureFocusTypographyAtScrollStop` dans son
    /// corps. Le grossissement de type n'est déclenché QUE par les deux
    /// gestionnaires d'ARRÊT et par un changement de mode (qui n'est pas un
    /// défilement).
    func test_typographyReconfigure_neverCalledFromScrollViewDidScroll() throws {
        let code = try strippedSource("MessageListViewController.swift")
        // Bornée par la signature du délégué SUIVANT (code, pas commentaire —
        // un marqueur de commentaire disparaîtrait sous `stripComments`).
        guard let range = code.range(of: "func scrollViewDidScroll(_ scrollView: UIScrollView) {"),
              let endRange = code.range(
                of: "func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {",
                range: range.upperBound..<code.endIndex
              )
        else {
            XCTFail("Corps de scrollViewDidScroll introuvable.")
            return
        }
        let body = code[range.lowerBound..<endRange.lowerBound]
        XCTAssertFalse(
            body.contains("reconfigureFocusTypographyAtScrollStop"),
            "scrollViewDidScroll appelle `reconfigureFocusTypographyAtScrollStop` — la typographie 15→16 (§4.6) est réservée à l'ARRÊT du défilement, jamais pendant (asymétrie voulue, contrat Lentille §4.3 note finale)."
        )
        XCTAssertFalse(
            body.contains("reconfigureItems"),
            "scrollViewDidScroll appelle `reconfigureItems` — le site 1 est un PUR compositor (transform/alpha seuls), aucun relayout ni reconfigure de cellule ne doit s'y produire."
        )
    }

    func test_typographyReconfigure_isCalledFromBothScrollStopHandlers() throws {
        let code = try strippedSource("MessageListViewController.swift")
        for handler in ["func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {",
                         "func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {"] {
            guard let range = code.range(of: handler) else {
                XCTFail("Gestionnaire d'arrêt introuvable : `\(handler)`.")
                continue
            }
            let windowEnd = code.index(range.upperBound, offsetBy: 150, limitedBy: code.endIndex) ?? code.endIndex
            XCTAssertTrue(
                code[range.upperBound..<windowEnd].contains("reconfigureFocusTypographyAtScrollStop()"),
                "`\(handler)` doit appeler `reconfigureFocusTypographyAtScrollStop()` — sans cela, la typographie 15→16 ne se met jamais à jour (§4.6)."
            )
        }
        XCTAssertTrue(
            code.contains("reconfigureFocusTypographyAtScrollStop() {\n        guard readingMode == .focal"),
            "reconfigureFocusTypographyAtScrollStop doit garder `readingMode == .focal` — Script est plat par construction (WS-4), rien à distinguer."
        )
        XCTAssertTrue(
            code.contains("snapshot.reconfigureItems(items)"),
            "reconfigureFocusTypographyAtScrollStop doit appeler `reconfigureItems` sur EXACTEMENT les items changés (ancien élu, nouvel élu) — jamais plus (§4.6 : « deux items, jamais plus »)."
        )
    }

    // MARK: - Garde R15 : aucun littéral de loi dans les sections de calcul ajoutées

    /// Les sections `// MARK: -` introduites par F-085 (§4.5, six sites,
    /// §4.7) sont le SEUL endroit du fichier où une formule de loi pourrait
    /// légitimement apparaître — un scan plein fichier produirait de faux
    /// positifs sur du code préexistant sans rapport (dates `2026-07-24`,
    /// durées d'animation historiques `0.25`/`0.35` de `legacyFlashCell`,
    /// etc.). Ces sections doivent consommer `FocalFocusCurve`/
    /// `FocalPassConstants`/`focalPass.*`, jamais une constante en dur.
    func test_r15_newComputationSections_carryNoLawLiteral() throws {
        let code = try strippedSource("MessageListViewController.swift")
        let sections: [(start: String, end: String)] = [
            ("// MARK: - §4.5 — Inset de tête (« Début de la conversation »)",
             "// MARK: - CollectionView Setup"),
            ("// MARK: - §4.7 — Atterrissage dans la bande de focus",
             "// MARK: - Cell Frame Lookup"),
        ]
        let forbidden = ["380", "520", "0.82", "0.45", "0.40", "150", "140", "95", "900", "25", "24"]
        for section in sections {
            guard let startRange = code.range(of: section.start) else {
                XCTFail("Section introuvable : `\(section.start)`.")
                continue
            }
            guard let endRange = code.range(of: section.end, range: startRange.upperBound..<code.endIndex) else {
                XCTFail("Borne de fin introuvable pour la section `\(section.start)` : `\(section.end)`.")
                continue
            }
            let body = code[startRange.lowerBound..<endRange.lowerBound]
            for literal in forbidden {
                XCTAssertFalse(
                    body.contains(literal),
                    "La section « \(section.start) » contient le littéral `\(literal)` — garde R15 : les constantes du pass viennent de `FocalFocusCurve` (GELÉ), `FocalMetrics` ou `FocalPassConstants`, jamais en dur dans l'hôte."
                )
            }
        }
    }

    /// Le calcul d'inset consomme le pass (`focalPass.headInset`), il ne le
    /// recalcule jamais lui-même.
    func test_computeHeadInset_consumesThePassNeverRecomputes() throws {
        let code = try strippedSource("MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("focalPass.headInset(in: collectionView, topInset: topInset, firstRowHeight:"),
            "computeHeadInset() doit déléguer à `focalPass.headInset(in:topInset:firstRowHeight:)` — la formule du §4.5 vit dans `FocalPerspectiveGeometry` (F-084, GELÉ), jamais recopiée ici."
        )
        XCTAssertTrue(
            code.contains("focalPass.landingContentOffsetY(forCellCenterY:"),
            "landOnFocusBand() doit déléguer à `focalPass.landingContentOffsetY(forCellCenterY:in:)` — la formule du §4.7 vit dans `FocalPerspectiveGeometry` (F-084, GELÉ), jamais recopiée ici."
        )
    }

    // MARK: - Contrainte dure §WS-5 : WS-6 ne connaît QUE l'API gelée du pass

    /// `MessageListView.swift` : les trois nouvelles props (§WS-6 travail
    /// 10) existent bien, dans l'ordre requis par la contrainte de l'init
    /// memberwise (`:382-387` du contrat — AVANT les closures `on…`).
    func test_messageListView_declaresTheThreeNewPropsBeforeItsOnClosures() throws {
        let code = try source("MessageListView.swift")
        guard let readingModeRange = code.range(of: "var readingMode: ConversationReadingMode = .bubbles"),
              let hasReachedOldestRange = code.range(of: "var hasReachedOldest: Bool = false"),
              let isReduceMotionRange = code.range(of: "var isReduceMotionEnabled: Bool = false"),
              let firstOnClosureRange = code.range(of: "var onNewMessagesBadge: ((Int) -> Void)?")
        else {
            XCTFail("Une des trois nouvelles props (ou le premier `on…`) est introuvable dans MessageListView.swift.")
            return
        }
        XCTAssertTrue(readingModeRange.upperBound <= firstOnClosureRange.lowerBound,
                      "`readingMode` doit être déclarée AVANT les closures `on…` (contrainte d'ordre de l'init memberwise, MessageListView.swift:382-387).")
        XCTAssertTrue(hasReachedOldestRange.upperBound <= firstOnClosureRange.lowerBound,
                      "`hasReachedOldest` doit être déclarée AVANT les closures `on…`.")
        XCTAssertTrue(isReduceMotionRange.upperBound <= firstOnClosureRange.lowerBound,
                      "`isReduceMotionEnabled` doit être déclarée AVANT les closures `on…`.")
    }
}
