import Combine
import XCTest
@testable import MeeshySDK

@MainActor
private final class FakeBatteryDevice: BatteryDeviceReading {
    var isTrackable = true
    var deviceLabel: String? = "iPhone"
    var reading: BatteryReading? = BatteryReading(level: 80, charging: false, lowPower: false)
    private(set) var monitoringEnabled = false
    let subject = PassthroughSubject<Void, Never>()

    nonisolated deinit {}

    func enableMonitoring() { monitoringEnabled = true }
    func disableMonitoring() { monitoringEnabled = false }
    func currentReading() -> BatteryReading? { reading }
    var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }
}

private final class RecordingSender: BatteryReportSending, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [BatteryReport] = []
    var outcome: BatteryReportOutcome = .tracked

    var reports: [BatteryReport] { lock.withLock { stored } }

    func send(_ report: BatteryReport) async -> BatteryReportOutcome {
        lock.withLock { stored.append(report) }
        return outcome
    }
}

/// Le téléphone émetteur (#14147) : il relève, applique la cadence et n'envoie que ce qu'elle veut.
@MainActor
final class BatteryReporterTests: XCTestCase {

    private func makeSUT(
        sleep: @escaping @concurrent @Sendable (TimeInterval) async -> Bool = { _ in false }
    ) -> (BatteryReporter, FakeBatteryDevice, RecordingSender) {
        let device = FakeBatteryDevice()
        let sender = RecordingSender()
        let reporter = BatteryReporter(
            device: device, sender: sender, now: { Date(timeIntervalSince1970: 1_000) }, sleep: sleep
        )
        return (reporter, device, sender)
    }

    func test_reportIfDue_firstReading_sendsIt() async {
        let (sut, _, sender) = makeSUT()
        await sut.reportIfDue()
        XCTAssertEqual(sender.reports.map(\.level), [80])
        XCTAssertEqual(sender.reports.first?.deviceLabel, "iPhone")
        XCTAssertEqual(sender.reports.first?.measuredAt, Date(timeIntervalSince1970: 1_000))
    }

    func test_reportIfDue_sameBand_sendsNothingMore() async {
        let (sut, device, sender) = makeSUT()
        await sut.reportIfDue()
        device.reading = BatteryReading(level: 81, charging: false, lowPower: false)
        await sut.reportIfDue()
        XCTAssertEqual(sender.reports.count, 1)
    }

    func test_reportIfDue_afterARefusal_triesAgainNextTime() async {
        let (sut, _, sender) = makeSUT()
        sender.outcome = .offline
        await sut.reportIfDue()
        await sut.reportIfDue()
        XCTAssertEqual(sender.reports.count, 2)
    }

    func test_reportNow_bypassesTheCadence() async {
        let (sut, _, sender) = makeSUT()
        await sut.reportIfDue()
        let outcome = await sut.reportNow()
        XCTAssertEqual(outcome, .tracked)
        XCTAssertEqual(sender.reports.count, 2)
    }

    func test_reportNow_onATablet_sendsNothing() async {
        let (sut, device, sender) = makeSUT()
        device.isTrackable = false
        let outcome = await sut.reportNow()
        XCTAssertEqual(outcome, .unavailable)
        XCTAssertFalse(sut.isAvailable)
        XCTAssertTrue(sender.reports.isEmpty)
    }

    func test_reportNow_unknownLevel_isUnavailable_andLeavesMonitoringAsItWas() async {
        let (sut, device, sender) = makeSUT()
        device.reading = nil
        let outcome = await sut.reportNow()
        XCTAssertEqual(outcome, .unavailable)
        XCTAssertFalse(device.monitoringEnabled)
        XCTAssertTrue(sender.reports.isEmpty)
    }

    func test_start_onATablet_neverObserves() {
        let (sut, device, _) = makeSUT()
        device.isTrackable = false
        sut.start()
        XCTAssertFalse(sut.isRunning)
        XCTAssertFalse(device.monitoringEnabled)
    }

    func test_startThenStop_togglesMonitoring() {
        let (sut, device, _) = makeSUT()
        sut.start()
        XCTAssertTrue(sut.isRunning)
        XCTAssertTrue(device.monitoringEnabled)
        sut.stop()
        XCTAssertFalse(sut.isRunning)
        XCTAssertFalse(device.monitoringEnabled)
    }

    func test_criticalReading_whileRunning_armsTheHeartbeat() async {
        let slept = expectation(description: "battement armé")
        slept.assertForOverFulfill = false
        let (sut, device, _) = makeSUT(sleep: { seconds in
            XCTAssertEqual(seconds, BatteryReportCadence.criticalHeartbeat)
            slept.fulfill()
            return false
        })
        device.reading = BatteryReading(level: 4, charging: false, lowPower: false)
        sut.start()
        await sut.reportIfDue()
        await fulfillment(of: [slept], timeout: 2)
        sut.stop()
    }
}
