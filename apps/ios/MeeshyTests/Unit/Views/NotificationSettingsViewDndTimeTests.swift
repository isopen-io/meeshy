import XCTest
@testable import Meeshy

/// P2 (placebo audit 2026-07-20) — les heures "Ne pas déranger" étaient en
/// `TextField` libre : toute saisie ≠ "HH:mm" désactivait silencieusement
/// toute la fenêtre DnD (`UserNotificationPreferences+Filter.parseTime` est
/// strict). Remplacé par `DatePicker(.hourAndMinute)`, qui ne peut produire
/// que des heures valides. `dndDate`/`formattedDndTime` sont le coeur pur de
/// la conversion Date ↔ "HH:mm" — extraits pour être testables sans
/// construire `NotificationSettingsView`.
final class NotificationSettingsViewDndTimeTests: XCTestCase {

    private let calendar = Calendar(identifier: .gregorian)

    // MARK: - formattedDndTime

    func test_formattedDndTime_padsSingleDigitHourAndMinute() {
        let date = calendar.date(bySettingHour: 8, minute: 5, second: 0, of: Date())!

        XCTAssertEqual(NotificationSettingsView.formattedDndTime(from: date, calendar: calendar), "08:05")
    }

    func test_formattedDndTime_doubleDigitHourAndMinute() {
        let date = calendar.date(bySettingHour: 22, minute: 30, second: 0, of: Date())!

        XCTAssertEqual(NotificationSettingsView.formattedDndTime(from: date, calendar: calendar), "22:30")
    }

    // MARK: - dndDate

    func test_dndDate_validString_setsHourAndMinute() {
        let ref = Date()

        let date = NotificationSettingsView.dndDate(from: "22:30", referenceDate: ref, calendar: calendar)

        XCTAssertEqual(calendar.component(.hour, from: date), 22)
        XCTAssertEqual(calendar.component(.minute, from: date), 30)
    }

    func test_dndDate_invalidString_fallsBackToStartOfDay() {
        let ref = Date()

        let date = NotificationSettingsView.dndDate(from: "not-a-time", referenceDate: ref, calendar: calendar)

        XCTAssertEqual(date, calendar.startOfDay(for: ref))
    }

    func test_dndDate_outOfRangeHour_fallsBackToStartOfDay() {
        let ref = Date()

        let date = NotificationSettingsView.dndDate(from: "25:00", referenceDate: ref, calendar: calendar)

        XCTAssertEqual(date, calendar.startOfDay(for: ref))
    }

    func test_dndDate_missingColon_fallsBackToStartOfDay() {
        let ref = Date()

        let date = NotificationSettingsView.dndDate(from: "2200", referenceDate: ref, calendar: calendar)

        XCTAssertEqual(date, calendar.startOfDay(for: ref))
    }

    // MARK: - Round trip (Date → String → Date preserves hour/minute)

    func test_roundTrip_dateToStringToDate_preservesHourAndMinute() {
        let ref = Date()
        let original = calendar.date(bySettingHour: 6, minute: 45, second: 0, of: ref)!

        let formatted = NotificationSettingsView.formattedDndTime(from: original, calendar: calendar)
        let roundTripped = NotificationSettingsView.dndDate(from: formatted, referenceDate: ref, calendar: calendar)

        XCTAssertEqual(calendar.component(.hour, from: roundTripped), 6)
        XCTAssertEqual(calendar.component(.minute, from: roundTripped), 45)
    }
}
