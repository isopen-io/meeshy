import XCTest
@testable import Meeshy

/// L'ancienneté se lit en UNE ligne sous mon nom (#18590) : « Sur Meeshy depuis mars 2026 ». Elle remplace la section
/// « Membre depuis » ; sans date servie, la ligne n'existe pas.
final class ProfileMembershipLineTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let now = ISO8601DateFormatter().date(from: "2026-11-15T12:00:00Z")!

    func test_text_withAServedCreationDate_saysTheMonthAndYear() {
        XCTAssertEqual(
            ProfileMembershipLine.text(createdAt: "2026-03-15T10:00:00.000Z", locale: french, now: now),
            "Sur Meeshy depuis mars 2026"
        )
    }

    func test_text_withoutFractionalSeconds_isStillRead() {
        XCTAssertEqual(
            ProfileMembershipLine.text(createdAt: "2025-07-10T08:30:00Z", locale: french, now: now),
            "Sur Meeshy depuis juillet 2025"
        )
    }

    func test_text_withoutACreationDate_isAbsent() {
        XCTAssertNil(ProfileMembershipLine.text(createdAt: nil, locale: french, now: now))
        XCTAssertNil(ProfileMembershipLine.text(createdAt: "", locale: french, now: now))
    }

    func test_text_withAnUnreadableDate_isAbsent_neverAFabricatedMonth() {
        XCTAssertNil(ProfileMembershipLine.text(createdAt: "pas une date", locale: french, now: now))
    }

    func test_text_withADateBeyondTomorrow_isAbsent() {
        XCTAssertNil(ProfileMembershipLine.text(createdAt: "2027-01-01T00:00:00Z", locale: french, now: now),
                     "une inscription ne vient pas du futur : la date est corrompue, la ligne se tait")
    }
}
