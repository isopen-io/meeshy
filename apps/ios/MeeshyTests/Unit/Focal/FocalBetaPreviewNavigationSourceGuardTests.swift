import XCTest
@testable import Meeshy

/// I-075 — preuves par lecture de source du chemin de navigation
/// « Focal (bêta) » : `Router.pendingForcedReadingMode` (override ÉPHÉMÈRE) →
/// `ConversationView.init(forcedReadingMode:)` → `ReadingModeController
/// .init(forcedMode:)`. Même patron que `ConversationViewReadingModeSourceGuardTests`
/// (F-086) : ce qu'un test d'exécution ne peut pas couvrir sans construire un
/// `ConversationView` réel (R5, GRDB/réseau non injectables depuis `init`).
///
/// Trois invariants du design imposé (§0 workshop, arbitrage orchestrateur) :
/// 1. Seuls les DEUX sites de navigation RÉELS (RootView, iPadRootView) lisent
///    `router.pendingForcedReadingMode` — aucun troisième site créé.
/// 2. Les QUATRE autres sites de montage `ConversationView(` existants
///    (RootView notification preview, iPadRootView+Sheets notification
///    preview, GuestConversationContainer, ConversationFirstRenderWarmup)
///    restent INTACTS — aucun ne mentionne `forcedReadingMode`, la preuve
///    « nil ⇒ bit-à-bit identique » au niveau du CODE, pas seulement du
///    comportement par défaut.
/// 3. `MessageListViewController.swift` — le fichier gardé par
///    `FocalHostSourceGuardTests` (les six sites d'appel du pass de
///    perspective, contrat §4.8) — ne mentionne NULLE PART `forcedReadingMode`
///    ni `forcedMode` : le court-circuit vit STRICTEMENT en amont
///    (`ReadingModeController.init`), jamais dupliqué aux six sites internes.
///    `FocalHostSourceGuardTests` reste donc intact, non affaibli, non amendé
///    — ce lot n'avait pas besoin d'y toucher.
final class FocalBetaPreviewNavigationSourceGuardTests: XCTestCase {

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: appRoot().appendingPathComponent(relativePath), encoding: .utf8)
    }

    // MARK: - 1. Les deux sites RÉELS lisent le canal éphémère

    func test_rootView_conversationDestination_readsAndClearsThePendingForcedMode() throws {
        let code = try source("Features/Main/Views/RootView.swift")
        XCTAssertTrue(
            code.contains("forcedReadingMode: router.pendingForcedReadingMode"),
            "RootView doit lire `router.pendingForcedReadingMode` au site de construction de ConversationView — sinon l'item « Focal (bêta) » n'atteint jamais l'écran."
        )
        XCTAssertTrue(
            code.contains("router.pendingForcedReadingMode = nil"),
            "RootView doit remettre `router.pendingForcedReadingMode` à `nil` (même patron que `pendingReplyContext`) — sans cela l'override survivrait à une réouverture normale de la MÊME conversation, violant « une fois »."
        )
    }

    func test_iPadRootView_rightColumn_readsAndClearsThePendingForcedMode() throws {
        let code = try source("Features/Main/Views/iPadRootView.swift")
        XCTAssertTrue(
            code.contains("forcedReadingMode: router.pendingForcedReadingMode"),
            "iPadRootView doit lire `router.pendingForcedReadingMode` au site de construction de ConversationView (colonne de droite) — parité iPhone/iPad."
        )
        XCTAssertTrue(
            code.contains("router.pendingForcedReadingMode = nil"),
            "iPadRootView doit remettre `router.pendingForcedReadingMode` à `nil` à l'ouverture."
        )
    }

    /// Garde d'ensemble (leçon 257 — une garde individuelle par site ne
    /// détecte pas un TROISIÈME site ajouté par erreur) : EXACTEMENT deux
    /// occurrences de `forcedReadingMode: router.pendingForcedReadingMode`
    /// dans tout l'arbre `apps/ios/Meeshy` — RootView + iPadRootView, jamais
    /// plus. Un nouveau site de navigation vers `ConversationView` qui
    /// oublierait de le câbler resterait invisible à cette garde (c'est
    /// voulu : « nil ⇒ inchangé » est la valeur par défaut sûre) ; un TROISIÈME
    /// câblage, en revanche, romprait le décompte.
    func test_exactlyTwoNavigationSites_wireThePendingForcedMode() throws {
        let roots = [
            "Features/Main/Views/RootView.swift",
            "Features/Main/Views/iPadRootView.swift",
            "Features/Main/Views/iPadRootView+Sheets.swift",
            "Features/Main/Views/GuestConversationContainer.swift",
            "Features/Main/Services/ConversationFirstRenderWarmup.swift",
        ]
        var totalOccurrences = 0
        for relativePath in roots {
            let code = try source(relativePath)
            totalOccurrences += code.components(separatedBy: "forcedReadingMode: router.pendingForcedReadingMode").count - 1
        }
        XCTAssertEqual(
            totalOccurrences, 2,
            "Exactement DEUX sites doivent câbler `forcedReadingMode: router.pendingForcedReadingMode` (RootView, iPadRootView) — un compte différent signale un site oublié ou un site de trop."
        )
    }

    // MARK: - 2. Les quatre autres sites de montage restent INTACTS (nil ⇒ bit-à-bit identique, au niveau du CODE)

    func test_rootView_notificationPreviewSheet_neverMentionsForcedReadingMode() throws {
        let code = try source("Features/Main/Views/RootView.swift")
        guard let range = code.range(of: "ConversationView(conversation: conv, previewMode: true, onOpenFullConversation:") else {
            XCTFail("Le site d'aperçu de notification (sheet) est introuvable dans RootView.swift — a-t-il changé de forme ?")
            return
        }
        let end = code.index(range.upperBound, offsetBy: 300, limitedBy: code.endIndex) ?? code.endIndex
        XCTAssertFalse(
            code[range.lowerBound..<end].contains("forcedReadingMode"),
            "L'aperçu de notification (sheet, previewMode: true) est un site de montage DIFFÉRENT de la navigation liste→conversation — il ne doit JAMAIS mentionner forcedReadingMode (design imposé : seuls les DEUX sites de navigation réels sont câblés)."
        )
    }

    func test_iPadRootViewSheets_notificationPreview_neverMentionsForcedReadingMode() throws {
        let code = try source("Features/Main/Views/iPadRootView+Sheets.swift")
        XCTAssertFalse(
            code.contains("forcedReadingMode"),
            "iPadRootView+Sheets.swift (aperçu de notification) ne doit JAMAIS mentionner forcedReadingMode — site de montage non concerné par I-075."
        )
    }

    func test_guestConversationContainer_neverMentionsForcedReadingMode() throws {
        let code = try source("Features/Main/Views/GuestConversationContainer.swift")
        XCTAssertFalse(
            code.contains("forcedReadingMode"),
            "GuestConversationContainer.swift (flux invité, aucun listing de conversations) ne doit JAMAIS mentionner forcedReadingMode."
        )
    }

    func test_conversationFirstRenderWarmup_neverMentionsForcedReadingMode() throws {
        let code = try source("Features/Main/Services/ConversationFirstRenderWarmup.swift")
        XCTAssertFalse(
            code.contains("forcedReadingMode"),
            "ConversationFirstRenderWarmup.swift (warm-up DEBUG hors écran) ne doit JAMAIS mentionner forcedReadingMode."
        )
    }

    // MARK: - 3. `ConversationView.init` transmet tel quel à `ReadingModeController`

    func test_conversationView_init_forwardsForcedReadingMode_toReadingModeControllerAsForcedMode() throws {
        let code = try source("Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(
            code.contains("forcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode? = nil"),
            "ConversationView.init doit exposer `forcedReadingMode: ReadingModeOrchestrator.ConversationReadingMode? = nil` — défaut nil, bit-à-bit identique."
        )
        guard let controllerRange = code.range(of: "_readingModeController = StateObject(wrappedValue: ReadingModeController(") else {
            XCTFail("Le site de construction de ReadingModeController est introuvable.")
            return
        }
        let end = code.index(controllerRange.upperBound, offsetBy: 400, limitedBy: code.endIndex) ?? code.endIndex
        XCTAssertTrue(
            code[controllerRange.lowerBound..<end].contains("forcedMode: forcedReadingMode"),
            "ReadingModeController(...) doit recevoir `forcedMode: forcedReadingMode` — le paramètre de ConversationView.init doit atteindre le contrôleur SANS second calcul (même discipline que capabilities/isFlagEnabled, ConversationViewReadingModeSourceGuardTests)."
        )
    }

    // MARK: - 4. `FocalHostSourceGuardTests` reste INTACT — le court-circuit ne descend jamais jusqu'aux six sites d'appel

    /// Le fichier gardé par `FocalHostSourceGuardTests` (F-085, contrat §4.8,
    /// « les six sites d'appel ») ne doit JAMAIS mentionner
    /// `forcedReadingMode`/`forcedMode` : le court-circuit d'I-075 vit
    /// STRICTEMENT en amont, dans `ReadingModeController.init` — la valeur
    /// forcée atteint `MessageListViewController` UNIQUEMENT via la prop
    /// `readingMode` déjà existante (`readingMode: readingModeController.mode`,
    /// câblage F-086 inchangé). Si ce test échoue, quelqu'un a dupliqué le
    /// court-circuit à l'intérieur des six sites au lieu de le laisser en
    /// amont — amender `FocalHostSourceGuardTests` avec justification
    /// documentée serait alors requis (design imposé §0(c)), jamais un
    /// relâchement silencieux.
    func test_messageListViewController_neverMentionsForcedReadingModeOrForcedMode() throws {
        let code = try source("Features/Main/Views/MessageListViewController.swift")
        XCTAssertFalse(
            code.contains("forcedReadingMode"),
            "MessageListViewController.swift ne doit JAMAIS mentionner forcedReadingMode — le fichier gardé par FocalHostSourceGuardTests reste intact, le court-circuit I-075 vit en amont (ReadingModeController.init), pas aux six sites d'appel."
        )
        XCTAssertFalse(
            code.contains("forcedMode"),
            "MessageListViewController.swift ne doit JAMAIS mentionner forcedMode — même raison (le court-circuit ne se duplique jamais aux six sites d'appel du pass de perspective)."
        )
    }
}
