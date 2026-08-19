import XCTest
@testable import Meeshy

/// Sémantique hybride EXACTE du picker de transfert (spec 2026-08-19, Volet
/// A.6, décision user) : tap de ligne = sélection, bouton par-ligne = envoi
/// immédiat, aucune possibilité de doublon par construction.
/// RÈGLE JUMELLE : apps/web/lib/forward-picker-model.ts (mêmes cas).
@MainActor
final class ForwardPickerModelTests: XCTestCase {

    func test_tapRow_togglesSelection() {
        var model = ForwardPickerModel()
        model.tapRow("a")
        XCTAssertEqual(model.state(of: "a"), .selected)
        XCTAssertTrue(model.hasSelection)
        model.tapRow("a")
        XCTAssertEqual(model.state(of: "a"), .idle)
        XCTAssertFalse(model.hasSelection)
    }

    func test_tapRow_onSentTarget_isNoop() {
        var model = ForwardPickerModel()
        model.beginSend("a")
        model.finishSend("a", outcome: .sent)
        model.tapRow("a")
        XCTAssertEqual(model.state(of: "a"), .sent,
                       "une cible déjà servie n'est plus sélectionnable")
    }

    func test_beginSend_onSelectedRow_removesItFromSelection() {
        var model = ForwardPickerModel()
        model.tapRow("a")
        model.tapRow("b")
        XCTAssertTrue(model.beginSend("a"))
        XCTAssertEqual(model.selectedIds, ["b"],
                       "envoyer par-ligne une cible sélectionnée la retire de la sélection — sinon le batch doublerait")
        XCTAssertEqual(model.state(of: "a"), .sending)
    }

    func test_beginBatch_neverContainsSentTargets() {
        var model = ForwardPickerModel()
        model.tapRow("a")
        model.tapRow("b")
        model.beginSend("a")
        model.finishSend("a", outcome: .sent)
        model.tapRow("a")
        let batch = model.beginBatch()
        XCTAssertEqual(batch, ["b"], "l'envoi groupé ne reprend jamais une cible déjà servie")
        XCTAssertEqual(model.state(of: "b"), .sending)
    }

    func test_beginSend_onSentOrSendingTarget_isRefused() {
        var model = ForwardPickerModel()
        model.beginSend("a")
        XCTAssertFalse(model.beginSend("a"), "un envoi en cours ne se double pas")
        model.finishSend("a", outcome: .sent)
        XCTAssertFalse(model.beginSend("a"), "une cible servie ne se renvoie pas")
    }

    func test_finishSend_failed_keepsReason_andAllowsRetry() {
        var model = ForwardPickerModel()
        model.beginSend("a")
        model.finishSend("a", outcome: .failed(reason: "Un message à vue unique ne peut pas être transféré"))
        XCTAssertEqual(model.state(of: "a"), .failed("Un message à vue unique ne peut pas être transféré"))
        XCTAssertTrue(model.beginSend("a"), "un échec reste réessayable")
    }

    func test_finishSend_queuedOffline_countsAsSent() {
        var model = ForwardPickerModel()
        model.beginSend("a")
        model.finishSend("a", outcome: .queuedOffline)
        XCTAssertEqual(model.state(of: "a"), .sent,
                       "un enfilage durable vaut envoi pour l'affichage — l'outbox garantit la livraison")
    }

    func test_tapRow_onFailedTarget_selectsItForBatchRetry() {
        var model = ForwardPickerModel()
        model.beginSend("a")
        model.finishSend("a", outcome: .failed(reason: "x"))
        model.tapRow("a")
        XCTAssertEqual(model.state(of: "a"), .selected)
    }
}
