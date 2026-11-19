import XCTest
@testable import Meeshy

/// L'ancienneté se lit en UNE ligne sous mon nom (#18590) : « Sur Meeshy depuis mars 2026 ». Elle remplace la section
/// « Membre depuis » ; sans date servie, la ligne n'existe pas.
final class ProfileMembershipLineTests: XCTestCase {

    /// La locale de l'INTERFACE, celle que la fiche passe à la loi : la phrase vient du catalogue de l'app
    /// et le mois de cette locale, donc le témoin tient en français comme sur un simulateur en anglais (CI).
    private let interface = Locale(identifier: Bundle.main.preferredLocalizations.first ?? "fr")
    private let french = Locale(identifier: "fr_FR")
    private let now = ISO8601DateFormatter().date(from: "2026-11-15T12:00:00Z")!

    private func expected(monthOf iso: String) -> String {
        let date = ISO8601DateFormatter().date(from: iso) ?? {
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: iso)!
        }()
        let formatter = DateFormatter()
        formatter.locale = interface
        formatter.setLocalizedDateFormatFromTemplate("MMMMy")
        let phrase = Bundle.main.localizedString(forKey: "profile.membership.since", value: nil, table: nil)
        return String(format: phrase, formatter.string(from: date))
    }

    func test_text_withAServedCreationDate_saysTheMonthAndYear() {
        let text = ProfileMembershipLine.text(createdAt: "2026-03-15T10:00:00.000Z", locale: interface, now: now)
        XCTAssertEqual(text, expected(monthOf: "2026-03-15T10:00:00.000Z"))
        XCTAssertTrue(text?.contains("2026") == true, "l'année se lit : \(text ?? "nil")")
    }

    func test_text_withoutFractionalSeconds_isStillRead() {
        let text = ProfileMembershipLine.text(createdAt: "2025-07-10T08:30:00Z", locale: interface, now: now)
        XCTAssertEqual(text, expected(monthOf: "2025-07-10T08:30:00Z"))
        XCTAssertTrue(text?.contains("2025") == true, "l'année se lit : \(text ?? "nil")")
    }

    /// Le mois suit la locale demandée, jamais celle de l'appareil : en français, « mars ».
    func test_text_inFrench_namesTheMonthInFrench() {
        let text = ProfileMembershipLine.text(createdAt: "2026-03-15T10:00:00.000Z", locale: french, now: now)
        XCTAssertTrue(text?.contains("mars 2026") == true, text ?? "nil")
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

    // MARK: - La ville déclarée (#19388, planche `Main`)

    func test_text_withADeclaredCity_putsItBeforeTheMembership() {
        let text = ProfileMembershipLine.text(city: "Dakar", createdAt: "2026-03-15T10:00:00.000Z", locale: interface, now: now)
        let phrase = Bundle.main.localizedString(forKey: "profile.membership.cityAndSince", value: nil, table: nil)
        let formatter = DateFormatter()
        formatter.locale = interface
        formatter.setLocalizedDateFormatFromTemplate("MMMMy")
        let month = formatter.string(from: ISO8601DateFormatter().date(from: "2026-03-15T10:00:00Z")!)
        XCTAssertEqual(text, String(format: phrase, "Dakar", month))
        XCTAssertTrue(text?.hasPrefix("Dakar") == true, text ?? "nil")
    }

    func test_text_withACityButNoDate_saysTheCityAlone() {
        XCTAssertEqual(ProfileMembershipLine.text(city: " Porto ", createdAt: nil, locale: french, now: now), "Porto")
    }

    func test_text_withABlankCity_isTheMembershipAlone() {
        let withBlank = ProfileMembershipLine.text(city: "  ", createdAt: "2026-03-15T10:00:00.000Z", locale: interface, now: now)
        XCTAssertEqual(withBlank, expected(monthOf: "2026-03-15T10:00:00.000Z"))
    }
}

