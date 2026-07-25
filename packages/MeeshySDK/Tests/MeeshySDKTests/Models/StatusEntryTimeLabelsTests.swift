import XCTest
@testable import MeeshySDK

/// P2 — `StatusEntry.timeAgo`/`timeRemaining` used to hand-roll a French-only
/// relative-time string and a bare English "expired" literal, regardless of
/// the user's language (Prisme Linguistique violation — every other relative
/// timestamp in the app goes through a localized single source of truth).
///
/// These tests run in the SDK test target (no app bundle), so every
/// `String(localized:defaultValue:bundle: .main)` call resolves to its French
/// `defaultValue` — same convention as `RelativeTimeFormatterTests`, which
/// asserts directly against the French fallback strings.
final class StatusEntryTimeLabelsTests: XCTestCase {

    private func makeStatus(createdAt: Date, expiresAt: Date? = nil) -> StatusEntry {
        StatusEntry(
            id: "status-1",
            userId: "user-1",
            username: "alice",
            avatarColor: "#000000",
            moodEmoji: "😊",
            createdAt: createdAt,
            expiresAt: expiresAt
        )
    }

    // MARK: - timeAgo — delegates to RelativeTimeFormatter.longString

    func test_timeAgo_fiveMinutesAgo_matchesRelativeTimeFormatterLongForm() {
        let status = makeStatus(createdAt: Date().addingTimeInterval(-5 * 60))
        XCTAssertEqual(status.timeAgo, "il y a 5 min")
    }

    func test_timeAgo_twoHoursAgo_matchesRelativeTimeFormatterLongForm() {
        let status = makeStatus(createdAt: Date().addingTimeInterval(-2 * 3_600))
        XCTAssertEqual(status.timeAgo, "il y a 2h")
    }

    func test_timeAgo_justNow_isLocalizedNowLabel() {
        let status = makeStatus(createdAt: Date().addingTimeInterval(-2))
        XCTAssertEqual(status.timeAgo, "maintenant")
    }

    // MARK: - timeRemaining — no more hardcoded English "expired"

    func test_timeRemaining_noExpiry_isEmpty() {
        let status = makeStatus(createdAt: Date(), expiresAt: nil)
        XCTAssertEqual(status.timeRemaining, "")
    }

    func test_timeRemaining_alreadyExpired_isLocalizedNotHardcodedEnglish() {
        let status = makeStatus(createdAt: Date(), expiresAt: Date().addingTimeInterval(-10))
        XCTAssertEqual(status.timeRemaining, "Expire bientôt")
    }

    func test_timeRemaining_underAMinuteLeft_collapsesToExpiringSoonLabel() {
        let status = makeStatus(createdAt: Date(), expiresAt: Date().addingTimeInterval(30))
        XCTAssertEqual(status.timeRemaining, "Expire bientôt")
    }

    func test_timeRemaining_hoursLeft_isLocalizedHoursLabel() {
        let status = makeStatus(createdAt: Date(), expiresAt: Date().addingTimeInterval(2 * 3_600 + 60))
        XCTAssertEqual(status.timeRemaining, "Expire dans 2h")
    }

    func test_timeRemaining_minutesLeft_isLocalizedMinutesLabel() {
        // +30 s de marge, comme le test des heures ci-dessus. `timeRemaining`
        // TRONQUE (`Int(timeIntervalSinceNow) / 60`) : viser 45 min pile rendait
        // l'assertion dépendante du délai entre la construction de la date et la
        // lecture de la propriété — « 44min » dès qu'une milliseconde s'écoule,
        // ce qui rougissait SDK Tests en CI sans rien dire du comportement testé.
        let status = makeStatus(createdAt: Date(), expiresAt: Date().addingTimeInterval(45 * 60 + 30))
        XCTAssertEqual(status.timeRemaining, "Expire dans 45min")
    }
}
