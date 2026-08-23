import XCTest
@testable import MeeshyUI

/// M10 — **zéro question à la sortie**, et son corollaire : le travail ne se
/// perd pas parce qu'on a fermé, ni parce que le binaire a expiré.
///
/// Deux surfaces, une seule promesse :
/// 1. **la croix** — fermer ENREGISTRE. La règle qui armait la feuille d'action
///    (`exitPrompt`) commande désormais l'écriture (`exitAction`) ; l'aiguillage
///    est PUR pour s'éprouver sans hôte SwiftUI, `StoryComposerView` n'étant pas
///    « hostable » en XCTest ;
/// 2. **le 426** — un binaire périmé fait poster `.meeshyUpgradeRequired`
///    (`UpgradeGateSignal`), sur quoi les deux racines posent une porte
///    bloquante par-dessus tout. Le composer ouvert doit toucher le disque
///    AVANT d'être recouvert, en empruntant le chemin d'écriture silencieuse
///    qui existe déjà (D1) — un second chemin divergerait de son gate.
@MainActor
final class StoryComposerExitAutoDraftTests: XCTestCase {

    // MARK: - La règle de sortie ne pose plus de question, elle commande

    func test_anEmptyComposer_leavesWithoutWritingAnything() {
        XCTAssertEqual(
            StoryComposerView.exitAction(.leaveSilently),
            .purgePhantoms,
            "Fermer une page blanche n'écrit rien — et n'emporte que les fantômes."
        )
    }

    func test_workInProgress_isWrittenInsteadOfBeingQuestioned() {
        XCTAssertEqual(
            StoryComposerView.exitAction(.confirm(offersSave: true)),
            .saveDraft,
            "Ce que la feuille offrait d'enregistrer, la fermeture l'enregistre — sans demander."
        )
    }

    /// Le cas que la feuille protégeait déjà, et qui reste le plus fragile : la
    /// story « fond + musique » n'a rien de VISUEL, donc rien que
    /// `composerHasContent` sache voir. Sous M10 elle ne doit pas seulement
    /// éviter la destruction silencieuse — elle doit être ÉCRITE.
    func test_anAudioOnlyComposition_isSavedOnClose() {
        XCTAssertEqual(
            StoryComposerView.exitAction(
                StoryComposerView.exitPrompt(hasContent: false, carriesAudio: true)),
            .saveDraft,
            "Un fond posé et une musique choisie sont du travail : la croix les enregistre."
        )
    }

    func test_visualContent_isSavedOnClose() {
        XCTAssertEqual(
            StoryComposerView.exitAction(
                StoryComposerView.exitPrompt(hasContent: true, carriesAudio: false)),
            .saveDraft
        )
    }

    func test_aBlankComposer_endToEnd_stillWritesNothing() {
        XCTAssertEqual(
            StoryComposerView.exitAction(
                StoryComposerView.exitPrompt(hasContent: false, carriesAudio: false)),
            .purgePhantoms,
            "Le fond pastel auto-appliqué ne vaut pas un brouillon (arbitrage S2)."
        )
    }

    // MARK: - La croix emprunte cette règle, et rien d'autre

    func test_theClosingPathRoutesThroughTheSharedRule() throws {
        let publication = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func handleDismiss()", in: publication))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "exitPrompt", in: body), 1,
            "La sortie lit la règle une fois — c'est sa seule condition."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "exitAction(", in: body), 1,
            "…et l'aiguillage pur est le SEUL décideur : sinon la loi M10 vit dans deux endroits."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "canPublish", in: body), 0,
            "Le gate du bouton Publier n'a rien à dire de la fermeture (règle séparée, cf. PublishGate)."
        )
    }

    // MARK: - L'accroche 426

    /// La sentinelle a une raison d'être précise : sans elle, un binaire
    /// périmé fait apparaître une porte bloquante par-dessus une composition
    /// qui n'a jamais touché le disque. L'utilisateur ne peut plus rien faire,
    /// et son travail meurt avec le process.
    func test_theComposerListensToTheUpgradeGateSignal() throws {
        let view = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "meeshyUpgradeRequired", in: view), 1,
            "Une accroche, une seule : deux abonnements écriraient deux fois le même brouillon."
        )

        let handler = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "meeshyUpgradeRequired", in: view),
            "Le 426 doit être écouté par un `.onReceive` dont le corps agit.")

        XCTAssertTrue(
            handler.contains("autoSaveDraftOnInterruption()"),
            "Sur 426, le composer enregistre — par le chemin d'interruption existant."
        )
    }

    /// « Emprunte le chemin de sauvegarde EXISTANT ; n'en écris pas un second. »
    /// Le 426 et le passage en background sont la MÊME classe d'événement — une
    /// interruption SUBIE — et doivent donc partager le gate des écritures
    /// silencieuses. Une écriture directe depuis la vue le contournerait.
    func test_bothInterruptionsShareASingleWritePath() throws {
        let view = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "autoSaveDraftOnInterruption()", in: view), 2,
            "Deux entrées — le background (D1) et le 426 (C6b) — un seul appel chacune."
        )
        for bypass in ["persistDraft()", "saveDraft()", "StoryDraftStore"] {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: bypass, in: view), 0,
                "« \(bypass) » depuis le corps de la vue court-circuiterait le gate partagé."
            )
        }
    }

    func test_theInterruptionWriteStaysBehindTheSilentWriteGate() throws {
        let syncRestore = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(
                named: "func autoSaveDraftOnInterruption()", in: syncRestore))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "mayOverwriteStoredDraft", in: body), 1,
            """
            Une interruption n'est pas une commande : elle n'a pas le droit \
            d'écraser le brouillon qu'on propose de reprendre, ni celui d'une \
            publication partie.
            """
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "persistDraft()", in: body), 1,
            "…et quand le gate cède, elle écrit vraiment."
        )
    }
}
