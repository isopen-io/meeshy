import XCTest
@testable import MeeshyUI

/// #10815 — le plafond des films vivants : une liste longue ne fait jamais jouer plus
/// de `max` couches, la plus anciennement sortie de l'écran cède sa place, et celle qui
/// n'a pas de place montre son image fixe.
@MainActor
final class LottieLiveBudgetTests: XCTestCase {

    private final class Layer {
        var live = false
        var evictions = 0
    }

    private func claim(_ budget: LottieLiveBudget, _ layer: Layer) -> LottieLiveBudget.Ticket {
        budget.claim(grant: { layer.live = true }, evict: { layer.live = false; layer.evictions += 1 })
    }

    func test_aLayerOnScreen_getsAPlace_whileThereIsRoom() {
        let budget = LottieLiveBudget(max: 2)
        let layer = Layer()
        let ticket = claim(budget, layer)
        XCTAssertFalse(layer.live, "hors écran, aucune place n'est prise")
        budget.setVisible(ticket, true)
        XCTAssertTrue(layer.live)
        XCTAssertEqual(budget.holders, 1)
    }

    func test_aLongList_neverPlaysMoreThanTheCap() {
        let budget = LottieLiveBudget(max: LottieLiveBudget.maxLiveLayers)
        let layers = (0..<30).map { _ in Layer() }
        for layer in layers {
            let ticket = claim(budget, layer)
            budget.setVisible(ticket, true)
            budget.setVisible(ticket, false)
        }
        XCTAssertEqual(budget.holders, LottieLiveBudget.maxLiveLayers)
        XCTAssertEqual(layers.filter(\.live).count, LottieLiveBudget.maxLiveLayers)
    }

    func test_underPressure_theOldestLayerToLeaveTheScreen_givesUpItsPlace() {
        let budget = LottieLiveBudget(max: 2)
        let first = Layer(), second = Layer(), third = Layer()
        let a = claim(budget, first), b = claim(budget, second), c = claim(budget, third)
        budget.setVisible(a, true)
        budget.setVisible(b, true)
        budget.setVisible(a, false)
        budget.setVisible(b, false)
        budget.setVisible(c, true)
        XCTAssertFalse(first.live, "la première sortie cède sa place")
        XCTAssertEqual(first.evictions, 1)
        XCTAssertTrue(second.live, "la dernière sortie la garde : elle reprendra sans recommencer")
        XCTAssertTrue(third.live)
    }

    func test_whenEveryPlaceIsOnScreen_theNewcomerWaits_thenPlaysWhenOneLeaves() {
        let budget = LottieLiveBudget(max: 1)
        let shown = Layer(), newcomer = Layer()
        let a = claim(budget, shown), b = claim(budget, newcomer)
        budget.setVisible(a, true)
        budget.setVisible(b, true)
        XCTAssertFalse(newcomer.live, "aucune couche à l'écran n'est arrêtée pour une autre")
        budget.setVisible(a, false)
        XCTAssertTrue(newcomer.live)
        XCTAssertFalse(shown.live)
    }

    func test_aWaitingLayerThatLeavesTheScreen_losesItsTurn() {
        let budget = LottieLiveBudget(max: 1)
        let shown = Layer(), passing = Layer()
        let a = claim(budget, shown), b = claim(budget, passing)
        budget.setVisible(a, true)
        budget.setVisible(b, true)
        budget.setVisible(b, false)
        budget.setVisible(a, false)
        XCTAssertFalse(passing.live)
        XCTAssertTrue(shown.live, "personne n'attend : la couche sortie garde sa place")
    }

    func test_aReleasedLayer_freesItsPlaceForTheNextOne() {
        let budget = LottieLiveBudget(max: 1)
        let gone = Layer(), next = Layer()
        let a = claim(budget, gone), b = claim(budget, next)
        budget.setVisible(a, true)
        budget.setVisible(b, true)
        budget.release(a)
        XCTAssertTrue(next.live)
        XCTAssertEqual(budget.holders, 1)
    }

    // MARK: - La place d'une couche se démonte hors d'une tâche

    /// `LottieLiveSlot` vit et meurt avec chaque anneau d'avatar et chaque décor
    /// animé qui défile. Sa `deinit` écrite, sans `nonisolated`, était isolée au
    /// MainActor (SE-0466) : démontée hors d'une tâche — une vue retirée, ce
    /// test synchrone — elle double-libérait sur iOS 26.1 (#9694, a409c4eaa5
    /// avait corrigé le budget, pas la place).
    func test_aSlotDroppedOutsideATask_releasesItsPlace() async {
        let budget = LottieLiveBudget(max: 1)
        Self.dropAPlayingSlot(on: budget)
        for _ in 0..<20 where budget.holders > 0 { await Task.yield() }
        XCTAssertEqual(budget.holders, 0, "la place rendue sert à la couche suivante")
    }

    /// Le cas du défaut lui-même : la dernière référence lâchée SANS tâche courante.
    func test_aSlotDroppedInASynchronousTest_doesNotCrash() {
        Self.dropAPlayingSlot(on: LottieLiveBudget(max: 1))
    }

    private static func dropAPlayingSlot(on budget: LottieLiveBudget) {
        var slot: LottieLiveSlot? = LottieLiveSlot(budget: budget)
        slot?.wantsToPlay(true)
        XCTAssertEqual(budget.holders, 1)
        slot = nil
    }

    func test_theSlotDeinit_isNonisolated() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Lottie/LottieLiveBudget.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        let written = code.components(separatedBy: "deinit {").count - 1
        let nonisolated = code.components(separatedBy: "nonisolated deinit {").count - 1
        XCTAssertEqual(written, nonisolated, "toute deinit de ce fichier est nonisolated")
    }
}
