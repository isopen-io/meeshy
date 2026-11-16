import Testing
@testable import MeeshySDK

/// QUAND le téléphone émetteur remonte un relevé (#14147). Le client ne fait jamais avancer l'épisode : il dit
/// seulement si un relevé part.
struct BatteryReportCadenceTests {

    private func reading(_ level: Int, charging: Bool = false, lowPower: Bool = false) -> BatteryReading {
        BatteryReading(level: level, charging: charging, lowPower: lowPower)
    }

    @Test func theFirstReading_alwaysLeaves() {
        #expect(BatteryReportCadence.shouldReport(lastSent: nil, current: reading(80)))
    }

    @Test func aboveThirty_leavesOnEachFivePercentBand() {
        #expect(!BatteryReportCadence.shouldReport(lastSent: reading(80), current: reading(80)))
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(80), current: reading(75)))
        #expect(!BatteryReportCadence.shouldReport(lastSent: reading(79), current: reading(76)))
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(35), current: reading(30)))
    }

    @Test func fromThirtyToTen_leavesOnlyWhenAStepIsCrossed() {
        #expect(!BatteryReportCadence.shouldReport(lastSent: reading(30), current: reading(26)))
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(26), current: reading(25)))
        #expect(!BatteryReportCadence.shouldReport(lastSent: reading(14), current: reading(11)))
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(11), current: reading(10)))
    }

    @Test func atFiveAndBelow_everyReadingLeaves() {
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(5), current: reading(5)))
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(4), current: reading(3)))
    }

    @Test func pluggingOrLowPower_alwaysLeaves() {
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(60), current: reading(60, charging: true)))
        #expect(BatteryReportCadence.shouldReport(lastSent: reading(60), current: reading(60, lowPower: true)))
    }

    @Test func theHeartbeat_isArmedOnlyInTheCriticalZoneOnBattery() {
        #expect(BatteryReportCadence.heartbeat(after: reading(5)) == BatteryReportCadence.criticalHeartbeat)
        #expect(BatteryReportCadence.heartbeat(after: reading(5, charging: true)) == nil)
        #expect(BatteryReportCadence.heartbeat(after: reading(6)) == nil)
        #expect(BatteryReportCadence.criticalHeartbeat == 60)
    }
}
