import XCTest
import MeeshyUI
@testable import Meeshy

/// #19987 — sous mon nom, UNE ligne : « @pseudo · depuis novembre 2026 », la loi de toutes les fiches
/// (`ProfileHandleLine`) ; dans la barre repliée, le seul @pseudo. La ligne « Sur Meeshy depuis… » plus bas n'existe
/// plus : il ne reste, sous l'en-tête, que ma ville déclarée.
@MainActor
final class ProfileMembershipLineTests: XCTestCase {

    private let french = Locale(identifier: "fr_FR")
    private let now = ISO8601DateFormatter().date(from: "2026-11-15T12:00:00Z")!

    func test_handle_withAServedCreationDate_saysTheHandleThenTheMonthOnOneLine() {
        let line = ProfileMembershipLine.handle(username: "talkieun", createdAt: "2026-11-02T10:00:00.000Z",
                                                locale: french, now: now)
        XCTAssertTrue(line.hasPrefix("@talkieun · "), line)
        XCTAssertTrue(line.hasSuffix("novembre 2026"), "le mois suit la locale demandée : \(line)")
    }

    func test_handle_withoutFractionalSeconds_isStillRead() {
        let line = ProfileMembershipLine.handle(username: "talkieun", createdAt: "2025-07-10T08:30:00Z",
                                                locale: french, now: now)
        XCTAssertTrue(line.hasPrefix("@talkieun · ") && line.hasSuffix("juillet 2025"), line)
    }

    func test_handle_inTheCollapsedBar_isTheHandleAlone() {
        XCTAssertEqual(ProfileMembershipLine.handle(username: "talkieun", createdAt: "2026-11-02T10:00:00.000Z",
                                                    locale: french, now: now, inBar: true),
                       "@talkieun")
    }

    func test_handle_withoutAReadableOrPlausibleDate_isTheHandleAlone_neverAFabricatedMonth() {
        for createdAt in [nil, "", "pas une date", "2027-01-01T00:00:00Z"] {
            XCTAssertEqual(ProfileMembershipLine.handle(username: "talkieun", createdAt: createdAt, locale: french, now: now),
                           "@talkieun", createdAt ?? "nil")
        }
    }

    func test_city_isTheDeclaredCityAlone() {
        XCTAssertEqual(ProfileMembershipLine.city(" Porto "), "Porto")
        XCTAssertNil(ProfileMembershipLine.city("  "))
        XCTAssertNil(ProfileMembershipLine.city(nil))
    }

    func test_vitrine_putsTheMembershipUnderTheName_andNoLongerBelowIt() throws {
        let profile = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Views/ProfileView.swift"))
        XCTAssertTrue(profile.contains("subtitle: user.map { ProfileMembershipLine.handle("),
                      "le pseudo et l'ancienneté se lisent sous le nom, dans le héros")
        XCTAssertFalse(profile.contains("ProfileMembershipLine.text("), "plus de ligne « Sur Meeshy depuis… » plus bas")
    }
}
