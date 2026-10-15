import XCTest
@testable import MeeshySDK

/// #9863 — la progression d'un téléchargement ne republie pas l'état des
/// surfaces à chaque paquet réseau : au plus un rapport par intervalle, plus
/// toujours le premier et le dernier.
final class TransferProgressCadenceTests: XCTestCase {

    func test_admits_theFirstReport() {
        var cadence = TransferProgressCadence(minimumInterval: 0.1)
        XCTAssertTrue(cadence.admits(writtenBytes: 10, expectedBytes: 1000, now: 5))
    }

    func test_refuses_aReportInsideTheInterval() {
        var cadence = TransferProgressCadence(minimumInterval: 0.1)
        _ = cadence.admits(writtenBytes: 10, expectedBytes: 1000, now: 5)
        XCTAssertFalse(cadence.admits(writtenBytes: 20, expectedBytes: 1000, now: 5.05))
    }

    func test_admits_aReportOnceTheIntervalHasElapsed() {
        var cadence = TransferProgressCadence(minimumInterval: 0.1)
        _ = cadence.admits(writtenBytes: 10, expectedBytes: 1000, now: 5)
        _ = cadence.admits(writtenBytes: 20, expectedBytes: 1000, now: 5.05)
        XCTAssertTrue(cadence.admits(writtenBytes: 30, expectedBytes: 1000, now: 5.11))
    }

    func test_alwaysAdmits_theCompletingReport() {
        var cadence = TransferProgressCadence(minimumInterval: 0.1)
        _ = cadence.admits(writtenBytes: 10, expectedBytes: 1000, now: 5)
        XCTAssertTrue(cadence.admits(writtenBytes: 1000, expectedBytes: 1000, now: 5.01))
    }

    func test_unknownExpectedSize_neverCountsAsCompletion() {
        var cadence = TransferProgressCadence(minimumInterval: 0.1)
        _ = cadence.admits(writtenBytes: 10, expectedBytes: -1, now: 5)
        XCTAssertFalse(cadence.admits(writtenBytes: 20, expectedBytes: -1, now: 5.01))
    }

    /// 400 paquets en une seconde ⇒ une dizaine de rapports, pas 400.
    func test_aBurstOfPackets_yieldsAboutTenReportsPerSecond() {
        var cadence = TransferProgressCadence(minimumInterval: 0.1)
        let admitted = (0..<400).filter { index in
            cadence.admits(writtenBytes: Int64(index + 1), expectedBytes: 10_000, now: Double(index) / 400)
        }.count
        XCTAssertLessThanOrEqual(admitted, 11)
        XCTAssertGreaterThanOrEqual(admitted, 9)
    }
}
