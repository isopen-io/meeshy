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
    /// écritures restent légitimes) ou à `focalPass.decoration.flash`
    /// (Focal, décoration `CALayer`, §4.7). F-086bis : appel `immediate:
    /// true` — le délai externe (`asyncAfter`, ci-dessus dans le corps) a
    /// déjà payé l'acquisition de cellule, le délai interne de la
    /// décoration ne doit pas s'additionner (tempo Focal ~0,35 s / ~0,25 s,
    /// pas ~0,70 s / ~0,50 s).
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
            body.contains("focalPass.decoration.flash(") && body.contains("immediate: true"),
            "flashCell doit déléguer à `focalPass.decoration.flash(cell:accentHex:strong:immediate:)` avec `immediate: true` (décoration CALayer, §4.7, F-086bis) pour le chemin `.focal` — sinon le délai externe déjà payé s'additionne au délai interne de la décoration (tempo doublé)."
        )
        XCTAssertTrue(
            body.contains("legacyFlashCell(at: indexPath, strong: strong)"),
            "flashCell doit replier sur `legacyFlashCell` pour Script/bulles — comportement historique inchangé (garde « flag off ⇒ bit-à-bit identique »)."
        )
    }

    // MARK: - R2 : amorçage en première ligne de CHAQUE registration

    /// « Aucune sous-classe de cellule, donc aucun `prepareForReuse` » —
    /// sans cet amorçage, une cellule recyclée hériterait du transform/de la
    /// décoration de son occupant précédent (§4.8 « hors sites »).
    ///
    /// **Recalibré deux fois, l'invariant est inchangé : AUCUNE registration
    /// ne configure une cellule avant de l'avoir amorcée.**
    ///
    /// 1. *Elles sont QUATRE* — `728fd957` ([R-d], réserve soldée) a monté la
    ///    rangée `.conversationStart` (`FocalConversationStartRow`) derrière
    ///    `startRegistration`. Le témoin n'en balayait que trois : la
    ///    quatrième pouvait naître sans amorçage sans que rien ne le dise.
    ///    C'est le mode d'échec exact que R2 existe pour attraper, et il
    ///    était grand ouvert. Le nom du test suit (`allCellRegistrations`).
    /// 2. *L'appel est INDIRECT* — `ea6ff081` a extrait `primeFocalCell(_:
    ///    item:)`, qui porte maintenant les deux chemins : `focalPass.reset`
    ///    quand la cellule n'est pas encore montée, `focalPass.apply` quand
    ///    elle l'est (« pose la perspective TOUT DE SUITE », sinon la cellule
    ///    entrante s'affiche une frame à l'échelle pleine). Chercher
    ///    `focalPass.reset(cell)` en dur dans la closure ne décrit donc plus
    ///    l'invariant, seulement l'une de ses branches.
    ///
    /// Le témoin exige donc l'amorçage dans les QUATRE closures, PUIS vérifie
    /// que `primeFocalCell` mène bien encore à `focalPass` — sans quoi
    /// l'indirection suffirait à vider la garde de son sens.
    func test_allCellRegistrations_primeTheFocalPassFirst() throws {
        let code = try strippedSource("MessageListViewController.swift")
        let registrationMarkers = [
            "let typingRegistration = UICollectionView.CellRegistration",
            "let dayHeaderRegistration = UICollectionView.CellRegistration",
            "let startRegistration = UICollectionView.CellRegistration",
            "let messageRegistration = UICollectionView.CellRegistration",
        ]
        for marker in registrationMarkers {
            guard let range = code.range(of: marker) else {
                XCTFail("Registration introuvable : `\(marker)` — MessageListViewController.swift a-t-il changé de forme ?")
                continue
            }
            // Fenêtre de 400 caractères après la déclaration : large assez
            // pour couvrir le `guard let self` + la ligne d'amorçage, jamais
            // assez pour déborder sur la registration suivante.
            let windowEnd = code.index(range.upperBound, offsetBy: 400, limitedBy: code.endIndex) ?? code.endIndex
            let window = code[range.upperBound..<windowEnd]
            XCTAssertTrue(
                window.contains("primeFocalCell(cell, item: item)"),
                "`\(marker)` n'amorce pas `primeFocalCell(cell, item: item)` en tête de closure — une cellule recyclée hériterait du transform/de la carte de son occupant précédent (R2, §4.8 « hors sites »)."
            )
        }

        // Le compte, pas seulement la présence (leçon 257) : une CINQUIÈME
        // registration introduite sans amorçage passerait entre les mailles
        // d'une boucle sur une liste écrite à la main.
        let registrationCount = code.components(separatedBy: "UICollectionView.CellRegistration").count - 1
        XCTAssertEqual(
            registrationCount, registrationMarkers.count,
            "MessageListViewController déclare \(registrationCount) `UICollectionView.CellRegistration` — \(registrationMarkers.count) sont balayées par ce témoin. Toute registration neuve doit être ajoutée ICI en même temps qu'elle est écrite, sinon elle naît sans amorçage R2."
        )

        // L'indirection ne doit pas vider la garde : `primeFocalCell` est le
        // SEUL amorceur, et il mène toujours à `focalPass`.
        guard let primeRange = code.range(of: "private func primeFocalCell(_ cell: UICollectionViewCell, item: MessageListItem) {") else {
            XCTFail("`primeFocalCell` introuvable — l'amorçage R2 a-t-il été renommé ?")
            return
        }
        let primeEnd = code.index(primeRange.upperBound, offsetBy: 400, limitedBy: code.endIndex) ?? code.endIndex
        let primeBody = code[primeRange.upperBound..<primeEnd]
        XCTAssertTrue(
            primeBody.contains("focalPass.reset(cell)"),
            "`primeFocalCell` doit remettre la cellule à l'identité (`focalPass.reset(cell)`) sur le chemin « pas encore montée » — c'est le reset R2 lui-même, seulement déplacé d'un cran."
        )
        XCTAssertTrue(
            primeBody.contains("focalPass.apply(to: cell, in: collectionView"),
            "`primeFocalCell` doit poser la perspective (`focalPass.apply(to:in:descriptor:)`) sur le chemin « déjà montée » — sans quoi la cellule entrante s'affiche une frame à l'échelle pleine."
        )
        XCTAssertTrue(
            primeBody.contains("guard readingMode != .bubbles else { return }"),
            "`primeFocalCell` doit garder `readingMode != .bubbles` en tête — drapeau OFF ⇒ zéro appel à `focalPass` (garde « bit-à-bit identique », leçon 257)."
        )
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

    /// **Recalibré — déplacé par `ea6ff081` (« chrome escamoté pendant le
    /// défilement + zone d'activation sans conflit avec la saisie »),
    /// l'invariant est inchangé : les DEUX gestionnaires d'arrêt, et eux
    /// seuls, déclenchent la pose typographique.**
    ///
    /// Ce commit a interposé `settleFocalElection()` entre les gestionnaires
    /// et la pose : à l'arrêt du geste, si l'élu chevauche le composeur, un
    /// `setContentOffset` animé le dégage AVANT que la typographie ne bouge —
    /// sinon le texte grossit sous le clavier, là où on ne le voit pas. La
    /// pose passe donc par deux chemins désormais : immédiat (élu déjà au
    /// clair) ou différé à `scrollViewDidEndScrollingAnimation` (fin du
    /// nudge).
    ///
    /// Exiger `reconfigureFocusTypographyAtScrollStop()` LITTÉRALEMENT dans
    /// les 150 caractères qui suivent chaque gestionnaire décrivait le
    /// CÂBLAGE d'hier, pas l'invariant. Le témoin suit donc l'indirection
    /// d'un cran — les deux gestionnaires appellent `settleFocalElection()`,
    /// qui pose — et vérifie que les DEUX sorties de `settleFocalElection`
    /// (pose immédiate, et fin de nudge) mènent bien à la typographie : sans
    /// cette seconde moitié, l'élection nudgée resterait au corps d'avant,
    /// pour toujours.
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
                code[range.upperBound..<windowEnd].contains("settleFocalElection()"),
                "`\(handler)` doit appeler `settleFocalElection()` — c'est lui qui pose la typographie 15→16 (§4.6), directement ou au terme du nudge d'atterrissage (§4.7bis, `ea6ff081`)."
            )
        }

        // L'indirection ne doit rien perdre : les DEUX sorties de
        // `settleFocalElection` posent la typographie.
        guard let settleRange = code.range(of: "private func settleFocalElection() {") else {
            XCTFail("`settleFocalElection` introuvable — le point de pose §4.7bis a-t-il été renommé ?")
            return
        }
        let settleEnd = code.index(settleRange.upperBound, offsetBy: 500, limitedBy: code.endIndex) ?? code.endIndex
        XCTAssertTrue(
            code[settleRange.upperBound..<settleEnd].contains("reconfigureFocusTypographyAtScrollStop()"),
            "`settleFocalElection` doit poser la typographie sur son chemin IMMÉDIAT (élu déjà au clair) — sans cela, la typographie 15→16 ne se met jamais à jour (§4.6)."
        )

        guard let animEnd = code.range(of: "func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {") else {
            XCTFail("`scrollViewDidEndScrollingAnimation` introuvable — la fin du nudge §4.7bis a-t-elle été renommée ?")
            return
        }
        let animWindowEnd = code.index(animEnd.upperBound, offsetBy: 500, limitedBy: code.endIndex) ?? code.endIndex
        XCTAssertTrue(
            code[animEnd.upperBound..<animWindowEnd].contains("reconfigureFocusTypographyAtScrollStop()"),
            "`scrollViewDidEndScrollingAnimation` doit poser la typographie au terme du nudge — c'est l'AUTRE sortie de `settleFocalElection` (§4.7bis) ; sans elle, un élu dégagé du composeur garderait le corps d'avant."
        )
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
        // Les bornes `// MARK: -` sont cherchées dans la source BRUTE (elles
        // sont elles-mêmes des commentaires — `strippedSource` les efface) ;
        // seul le CONTENU de chaque tranche est ensuite passé au retrait de
        // commentaires, pour ne juger que du code réel.
        let raw = try source("MessageListViewController.swift")
        let sections: [(start: String, end: String)] = [
            ("// MARK: - §4.5 — Inset de tête (« Début de la conversation »)",
             "// MARK: - CollectionView Setup"),
            ("// MARK: - §4.7 — Atterrissage dans la bande de focus",
             "// MARK: - Cell Frame Lookup"),
        ]
        let forbidden = ["380", "520", "0.82", "0.45", "0.40", "150", "140", "95", "900", "25", "24"]
        for section in sections {
            guard let startRange = raw.range(of: section.start) else {
                XCTFail("Section introuvable : `\(section.start)`.")
                continue
            }
            guard let endRange = raw.range(of: section.end, range: startRange.upperBound..<raw.endIndex) else {
                XCTFail("Borne de fin introuvable pour la section `\(section.start)` : `\(section.end)`.")
                continue
            }
            let body = AppSourceGuard.stripComments(String(raw[startRange.lowerBound..<endRange.lowerBound]))
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
