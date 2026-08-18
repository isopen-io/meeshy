// apps/ios/MeeshyTests/Unit/Focal/FocalMatrixWiringGuardTests.swift

import XCTest
@testable import Meeshy

/// Gardes de CÂBLAGE des correctifs de matrice §5 (audit 2026-08-18) — le
/// patron « mount guard » du dépôt (leçon 257) : chaque correctif de la
/// passe « Focal Grandeur Nature » a un témoin qui rougit si son montage
/// disparaît. RETRAIT FOCAL iOS (2026-08-18) : les suites de lois du pass
/// (`FocalSpecCurveTests`, `FocalScrollPassGeometryTests`) sont parties avec
/// lui ; ici restent épinglés les branchements Script/temps réel que
/// l'audit a trouvés morts ou absents :
/// effets jamais fournis, flou ignoré, retry sans consommateur, chip 🌐
/// inerte, présence figée, reconfigure ciblé non différé, pose
/// d'atterrissage jamais déclenchée, badge non-lus comptant ses propres
/// envois, fantômes élus.
@MainActor
final class FocalMatrixWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Focal
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func stripped(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try source(relativePath))
    }

    private var hostPath: String { "Meeshy/Features/Main/Views/MessageListViewController.swift" }
    private var rowPath: String { "Meeshy/Features/Main/Focal/Row/FocalRow.swift" }

    // MARK: - Effets (matrice « Effets, mentions, appels »)

    func test_host_feedsMessageEffectsToTheRowInput() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("effects: message.effects"),
            "l'hôte doit fournir `effects: message.effects` à FocalRowInput — resté au défaut .none, aucune rangée Focal ne joue le moindre effet (feature morte, audit 2026-08-18)"
        )
    }

    // MARK: - Flou de confidentialité (matrice « Éphémère / flou / vue unique »)

    func test_focalRow_mountsTheProtectedContentWrapper() throws {
        let code = try stripped(rowPath)
        XCTAssertTrue(
            code.contains("FocalProtectedContent("),
            "FocalRow doit envelopper son bloc contenu dans FocalProtectedContent — sans lui, un message protégé (isBlurred) s'affiche EN CLAIR en Focal (régression de confidentialité)"
        )
        XCTAssertTrue(
            code.contains("if content.isBlurred {"),
            "le montage du wrapper est piloté par content.isBlurred (branche conditionnelle : un message ordinaire ne paie ni le @StateObject ni le modificateur) — la valeur du modèle, jamais un défaut"
        )
    }

    // MARK: - Bande retry (matrice « Envoi optimiste / échec »)

    func test_focalRow_rendersTheFailedRetryBar() throws {
        let code = try stripped(rowPath)
        XCTAssertTrue(
            code.contains("BubbleFailedRetryBar(onRetry:"),
            "FocalRow doit monter BubbleFailedRetryBar pour un envoi échoué — onRetry était câblé par l'hôte mais AUCUNE vue Focal ne le consommait (message échoué sans issue)"
        )
        XCTAssertTrue(
            code.contains("content.meta.deliveryStatus == .failed"),
            "la bande retry est gatée sur l'état .failed du message sortant — même règle que la bulle (isFailedOutgoing)"
        )
    }

    // MARK: - Drapeau langue d'origine (arbitrage user 2026-08-18)

    func test_originalLanguageFlag_isPassive_andGatedOnMultipleVersions() throws {
        let code = try stripped(rowPath)
        guard let flagStart = code.range(of: "private var originalLanguageFlag") else {
            return XCTFail("originalLanguageFlag introuvable dans FocalRow — le seul indicateur multi-langue de la rangée")
        }
        let window = String(code[flagStart.lowerBound...].prefix(1200))
        XCTAssertTrue(
            window.contains("if let translation = content.translation"),
            "le drapeau n'apparaît QUE quand plusieurs versions existent (content.translation non-nil) — jamais sur un message monolingue"
        )
        XCTAssertTrue(
            window.contains("originalLangCode"),
            "le drapeau est celui de la langue D'ORIGINE — jamais la langue affichée"
        )
        XCTAssertFalse(
            window.contains("Button") || window.contains("onTapGesture") || window.contains("LongPressGesture"),
            "l'indicateur est PASSIF — demander/afficher les autres langues passe par le menu d'appui long du MESSAGE, pas par le drapeau"
        )
        XCTAssertFalse(
            code.contains("translationChip"),
            "l'icône translate (chip 🌐) est RETIRÉE de la rangée — arbitrage user 2026-08-18"
        )
    }

    // MARK: - Présence vivante (matrice « Présence »)

    func test_host_observesThePresenceRefreshSignal() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("refreshSignal.$presenceVersion"),
            "l'hôte doit observer PresenceManager.refreshSignal — sans ce sink, la pastille de présence d'une rangée reste FIGÉE à l'état de sa dernière configuration"
        )
    }

    // MARK: - Reconfigure ciblé différé pendant le geste (§4.7ter, volet ciblé)

    func test_targetedReconfigure_isDeferredDuringGesture() throws {
        let code = try stripped(hostPath)
        guard let start = code.range(of: "private func reconfigureMessages(serverIds: Set<String>) {") else {
            return XCTFail("reconfigureMessages introuvable")
        }
        let body = String(code[start.lowerBound...].prefix(1200))
        XCTAssertTrue(
            body.contains("deferredTargetedReconfigureIds"),
            "reconfigureMessages doit différer pendant un geste en rangée plate — une traduction tardive qui re-mesure une cellule visible fait sauter le champ visuel (audit 2026-08-18)"
        )
    }

    // MARK: - Badge non-lus (matrice « Message entrant temps réel »)

    func test_unreadBadge_neverCountsOwnMessages() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("newestIsOwnMessage"),
            "le badge non-lus ne doit jamais compter un message dont l'utilisateur est l'auteur — un envoi optimiste depuis l'historique incrémentait la pilule (audit 2026-08-18)"
        )
    }

    // MARK: - Typing plat (matrice « Typing indicator »)

    func test_typingIndicator_hasAFlatVariantKeyedOnReadingMode() throws {
        let code = try stripped(hostPath)
        XCTAssertTrue(
            code.contains("isFlat: typingFlat"),
            "la cellule typing doit passer la tenue plate en Focal/Script (pastille 22 + points accent, sans capsule — matrice §5)"
        )
        XCTAssertTrue(
            code.contains("let typingFlat = self.readingMode != .bubbles"),
            "la tenue plate du typing est décidée par readingMode — la capsule reste le rendu bulles"
        )
    }

}
