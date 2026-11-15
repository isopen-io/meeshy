import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EphemeralExpiryTriageTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 10_000)

    private func triage(
        ids: [String] = [],
        deadlines: [String: Date] = [:],
        elapsed: Set<String> = [],
        burning: Set<String> = [],
        present: Set<String>,
        ledger: EphemeralReceiptRecording = FakeEphemeralLedger()
    ) -> EphemeralExpiryTriage.Outcome {
        EphemeralExpiryTriage.triage(
            ids: ids,
            deadlines: deadlines,
            elapsed: elapsed,
            now: now,
            isBurning: { present.contains($0) ? burning.contains($0) : nil },
            ledger: ledger
        )
    }

    func test_nothingDue_returnsThresholdWithIdsEnteringLastMinute() {
        let outcome = triage(
            deadlines: [
                "soon": now.addingTimeInterval(EphemeralDeadline.countdownThreshold - 1),
                "later": now.addingTimeInterval(EphemeralDeadline.countdownThreshold + 600),
            ],
            present: ["soon", "later"]
        )

        XCTAssertEqual(outcome, .threshold(restamp: ["soon"]))
    }

    func test_dueButAlreadyBurning_returnsAlreadyBurning() {
        let outcome = triage(
            deadlines: ["m1": now.addingTimeInterval(-1)],
            burning: ["m1"],
            present: ["m1"]
        )

        XCTAssertEqual(outcome, .alreadyBurning)
    }

    func test_dueAndAlreadyGraved_splitsIntoAlreadyDeadWithoutBurn() {
        let ledger = FakeEphemeralLedger(deaths: ["dead": now])

        let outcome = triage(
            deadlines: ["dead": now.addingTimeInterval(-1), "alive": now.addingTimeInterval(-1)],
            present: ["dead", "alive"],
            ledger: ledger
        )

        XCTAssertEqual(outcome, .expire(alreadyDead: ["dead"], burning: ["alive"]))
    }

    func test_elapsedOfflineEphemeral_isDueEvenWithoutFutureDeadline() {
        let outcome = triage(elapsed: ["offline"], present: ["offline"])

        XCTAssertEqual(outcome, .expire(alreadyDead: [], burning: ["offline"]))
    }

    func test_explicitIdsUnionWithDeadlinesPastNow() {
        let outcome = triage(
            ids: ["explicit", "ghost"],
            deadlines: ["past": now.addingTimeInterval(-5), "future": now.addingTimeInterval(3_600)],
            present: ["explicit", "past", "future"]
        )

        XCTAssertEqual(outcome, .expire(alreadyDead: [], burning: ["explicit", "past"]))
    }
}
