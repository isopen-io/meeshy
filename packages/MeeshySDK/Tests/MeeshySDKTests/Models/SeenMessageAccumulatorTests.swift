import XCTest
@testable import MeeshySDK

/// Un accusé de lecture doit être VÉRIDIQUE. Le serveur ne marque plus comme lus
/// que les messages rapportés par le client ; encore faut-il que le client ne
/// rapporte que ce qui a réellement été affiché. Le seuil de présence est ce qui
/// distingue une lecture d'un défilement — survoler deux cents messages en une
/// seconde n'en lit aucun.
///
/// Miroir de `apps/web/__tests__/utils/seen-message-accumulator.test.ts` : les
/// deux implémentations doivent se comporter identiquement.
/// Voir `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
final class SeenMessageAccumulatorTests: XCTestCase {

    private let dwell = 300

    private func makeAccumulator(batchSize: Int = 50, reportedCap: Int = 2000) -> SeenMessageAccumulator {
        SeenMessageAccumulator(dwellMs: dwell, batchSize: batchSize, reportedCap: reportedCap)
    }

    // MARK: - Seuil de présence

    func test_disappeared_belowDwell_isNotRetained() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 1000)
        acc.disappeared("m1", at: 1000 + dwell - 1)

        XCTAssertEqual(acc.drain(at: 2000), [])
    }

    func test_disappeared_exactlyAtDwell_isRetained() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 1000)
        acc.disappeared("m1", at: 1000 + dwell)

        XCTAssertEqual(acc.drain(at: 2000), ["m1"])
    }

    func test_stillVisible_pastDwell_isRetained() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 1000)

        XCTAssertEqual(acc.drain(at: 1000 + dwell), ["m1"])
    }

    func test_stillVisible_beforeDwell_isNotRetained() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 1000)

        XCTAssertEqual(acc.drain(at: 1000 + dwell - 1), [])
    }

    func test_disappearedWithoutAppeared_isIgnored() {
        var acc = makeAccumulator()
        acc.disappeared("fantome", at: 5000)

        XCTAssertEqual(acc.drain(at: 9000), [])
    }

    // MARK: - Réapparition

    // Défilement rapide dans un sens puis dans l'autre : aucune des deux
    // présences n'est une lecture, et leur somme n'en fait pas une non plus.
    func test_twoShortVisits_neverReachDwell() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)
        acc.disappeared("m1", at: 100)
        acc.appeared("m1", at: 500)
        acc.disappeared("m1", at: 600)

        XCTAssertEqual(acc.drain(at: 2000), [])
    }

    func test_secondVisitCrossingDwell_isRetained() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)
        acc.disappeared("m1", at: 100)
        acc.appeared("m1", at: 500)
        acc.disappeared("m1", at: 500 + dwell)

        XCTAssertEqual(acc.drain(at: 2000), ["m1"])
    }

    func test_reappearance_doesNotCreditOffscreenTime() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)
        acc.disappeared("m1", at: 10)
        acc.appeared("m1", at: 10_000)

        XCTAssertEqual(acc.drain(at: 10_000 + dwell - 1), [])
    }

    // MARK: - Vidange

    func test_drain_neverReportsTheSameMessageTwice() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)

        XCTAssertEqual(acc.drain(at: dwell), ["m1"])
        XCTAssertEqual(acc.drain(at: 10_000), [])
    }

    func test_isBatchReady_onlyOnceSizeIsReached() {
        var acc = makeAccumulator(batchSize: 3)
        acc.appeared("a", at: 0)
        acc.appeared("b", at: 0)
        XCTAssertFalse(acc.isBatchReady(at: dwell))

        acc.appeared("c", at: 0)
        XCTAssertTrue(acc.isBatchReady(at: dwell))
    }

    func test_isBatchReady_notBeforeDwellElapsed() {
        var acc = makeAccumulator(batchSize: 2)
        acc.appeared("a", at: 0)
        acc.appeared("b", at: 0)

        XCTAssertFalse(acc.isBatchReady(at: dwell - 1))
    }

    // Passage en arrière-plan / fermeture : ce qui était acquis doit sortir,
    // et rien ne doit être réémis ensuite.
    func test_drain_onTeardown_yieldsAcquiredThenNothing() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)
        acc.appeared("m2", at: 0)

        XCTAssertEqual(acc.drain(at: dwell).sorted(), ["m1", "m2"])
        XCTAssertEqual(acc.drain(at: 100_000), [])
    }

    // m2 franchit le seuil avant m1 malgré une apparition plus tardive.
    func test_drain_yieldsInAcquisitionOrder() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)
        acc.appeared("m2", at: 50)
        acc.disappeared("m2", at: 50 + dwell)

        XCTAssertEqual(acc.drain(at: 60 + dwell), ["m2", "m1"])
    }

    // Deux messages promus au MÊME appel sortent dans un ordre déterministe :
    // un lot non reproductible complique inutilement le diagnostic.
    func test_simultaneousPromotion_isDeterministic() {
        var first = makeAccumulator()
        first.appeared("b", at: 0)
        first.appeared("a", at: 0)

        var second = makeAccumulator()
        second.appeared("a", at: 0)
        second.appeared("b", at: 0)

        XCTAssertEqual(first.drain(at: dwell), second.drain(at: dwell))
    }

    // MARK: - Promotion immédiate

    // Arriver au bas de la conversation, demander ce bas, ou quitter l'écran :
    // à ces instants ce qui est affiché EST ce qui est lu, et attendre le seuil
    // ne rendrait l'accusé ni plus ni moins véridique — seulement plus tardif.
    func test_promoteAndDrain_yieldsMessagesBelowDwell() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 1000)

        XCTAssertEqual(acc.promoteAndDrain(at: 1000), ["m1"])
    }

    func test_promoteAndDrain_emptiesState() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)

        XCTAssertEqual(acc.promoteAndDrain(at: 0), ["m1"])
        XCTAssertEqual(acc.promoteAndDrain(at: 10_000), [])
        XCTAssertEqual(acc.drain(at: 10_000), [])
    }

    // Les identifiants déjà acquis par le seuil sortent avec ceux promus de
    // force : une promotion ne doit pas court-circuiter une lecture en attente.
    func test_promoteAndDrain_yieldsAcquiredAndVisibleTogether() {
        var acc = makeAccumulator()
        acc.appeared("acquis", at: 0)
        acc.disappeared("acquis", at: dwell)
        acc.appeared("fraiche", at: dwell)

        XCTAssertEqual(acc.promoteAndDrain(at: dwell).sorted(), ["acquis", "fraiche"])
    }

    func test_promoteAndDrain_neverReportsTheSameMessageTwice() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)

        XCTAssertEqual(acc.drain(at: dwell), ["m1"])
        acc.appeared("m1", at: 5000)

        XCTAssertEqual(acc.promoteAndDrain(at: 5000), [])
    }

    func test_promoteAndDrain_isDeterministic() {
        var first = makeAccumulator()
        first.appeared("b", at: 0)
        first.appeared("a", at: 0)

        var second = makeAccumulator()
        second.appeared("a", at: 0)
        second.appeared("b", at: 0)

        XCTAssertEqual(first.promoteAndDrain(at: 0), second.promoteAndDrain(at: 0))
    }

    // La promotion ne change RIEN au régime normal : le seuil reste le
    // mécanisme par défaut pour tout défilement ultérieur.
    func test_promoteAndDrain_leavesDwellRuleIntactForLaterMessages() {
        var acc = makeAccumulator()
        acc.appeared("m1", at: 0)
        _ = acc.promoteAndDrain(at: 0)

        acc.appeared("m2", at: 100)

        XCTAssertEqual(acc.drain(at: 100 + dwell - 1), [])
        XCTAssertEqual(acc.drain(at: 100 + dwell), ["m2"])
    }

    // Le garde-fou anti-doublon est borné ; au pire un oubli provoque un
    // signalement redondant, sans conséquence puisque l'écriture est write-once.
    func test_reportedSet_isBounded() {
        var acc = makeAccumulator(batchSize: 1000, reportedCap: 5)
        for index in 0..<20 { acc.appeared("m\(index)", at: 0) }

        XCTAssertEqual(acc.drain(at: dwell).count, 20)
        XCTAssertEqual(acc.drain(at: dwell + 1), [])
    }
}
