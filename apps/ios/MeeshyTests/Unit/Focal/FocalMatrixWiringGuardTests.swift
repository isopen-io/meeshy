// apps/ios/MeeshyTests/Unit/Focal/FocalMatrixWiringGuardTests.swift

import XCTest
@testable import Meeshy

/// Gardes de CÂBLAGE des correctifs de matrice §5 (audit 2026-08-18) — le
/// patron « mount guard » du dépôt (leçon 257) : chaque correctif de la
/// passe « Focal Grandeur Nature » a un témoin qui rougit si son montage
/// disparaît. Les LOIS pures ont leurs propres suites (`FocalSpecCurveTests`,
/// `FocalScrollPassGeometryTests`) ; ici on épingle les branchements que
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

    // MARK: - Chip 🌐 interactif (matrice « Traductions qui arrivent »)

    func test_translationChip_isAButtonWithLongPressDetail() throws {
        let code = try stripped(rowPath)
        guard let chipStart = code.range(of: "private var translationChip") else {
            return XCTFail("translationChip introuvable dans FocalRow")
        }
        let window = String(code[chipStart.lowerBound...].prefix(1800))
        XCTAssertTrue(
            window.contains("Button"),
            "le chip 🌐 doit être un Button (appui = V.O.) — il était purement décoratif (matrice : « Appui sur 🌐 = V.O. »)"
        )
        XCTAssertTrue(
            window.contains("onShowTranslationDetail"),
            "l'appui long du chip 🌐 doit ouvrir le sélecteur de langues (matrice : « appui long = sélecteur »)"
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

    // MARK: - Pose d'atterrissage programmatique (§4.7)

    func test_landingInFlight_isHandledAtAnimationEnd() throws {
        let code = try stripped(hostPath)
        guard let start = code.range(of: "func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {") else {
            return XCTFail("scrollViewDidEndScrollingAnimation introuvable")
        }
        let body = String(code[start.lowerBound...].prefix(2400))
        XCTAssertTrue(
            body.contains("isFocalLandingInFlight"),
            "la fin d'animation doit gérer l'atterrissage programmatique — sans ce drapeau, un saut de citation laissait la rangée d'atterrissage élue SANS tenue jusqu'au geste suivant"
        )
        XCTAssertTrue(
            body.contains("landingContentOffsetY"),
            "la pose doit RE-VISER une fois si les hauteurs estimées ont dérivé pendant l'animation (tolérance landingTolerance)"
        )
    }

    // MARK: - Badge non-lus (matrice « Message entrant temps réel »)

    func test_unreadBadge_neverCountsOwnMessages() throws {
        XCTAssertTrue(
            try stripped(hostPath).contains("newestIsOwnMessage"),
            "le badge non-lus ne doit jamais compter un message dont l'utilisateur est l'auteur — un envoi optimiste depuis l'historique incrémentait la pilule (audit 2026-08-18)"
        )
    }

    // MARK: - Fantômes exclus de l'élection (matrice « Suppression »)

    func test_descriptor_excludesDeletedAndSystemRowsFromElection() throws {
        let code = try stripped(hostPath)
        guard let start = code.range(of: "private func focalCellDescriptor(for item: MessageListItem)") else {
            return XCTFail("focalCellDescriptor introuvable")
        }
        let body = String(code[start.lowerBound...].prefix(1400))
        XCTAssertTrue(
            body.contains("record.deletedAt == nil"),
            "un message supprimé ne concourt ni à l'élection ni à la carte — élire un fantôme posait la bande sur du vide"
        )
        XCTAssertTrue(
            body.contains("record.messageType != \"system\""),
            "une notice système/appel ne concourt ni à l'élection ni à la carte"
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

    // MARK: - Chrome de focus fantôme (bug n°1 de l'audit)

    func test_isFocusedInput_isGatedOffDuringScroll() throws {
        let code = try stripped(hostPath)
        XCTAssertTrue(
            code.contains("&& !self.store.isUserScrolling"),
            "isFocused à la config de cellule doit être gaté hors défilement — une cellule recyclée mi-geste gardait la tenue de focus d'un élu périmé (chrome fantôme)"
        )
    }
}
