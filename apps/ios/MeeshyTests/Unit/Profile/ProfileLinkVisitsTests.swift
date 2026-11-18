import XCTest
import MeeshySDK
@testable import Meeshy

/// Les visites de mon lien de profil sur la face Liens (#19489) : le dernier relevé se peint avant le réseau, la
/// passerelle le remplace en silence, un échec ne montre rien de plus, et un relevé vieilli ne se sert plus.
@MainActor
final class ProfileLinkVisitsTests: XCTestCase {

    final class Recorder {
        var cached: [String: ProfileLinkVisitsReading] = [:]
        var served: Result<ProfileLinkVisitStats, Error> = .failure(URLError(.badServerResponse))
        var saved: [(String, ProfileLinkVisitsReading)] = []
        var published: [(ProfileLinkVisitsReading, ProfileLink)] = []
        var fetches = 0
    }

    private static func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso) ?? Date(timeIntervalSince1970: 0)
    }

    private static let noon = date("2026-11-18T12:00:00Z")

    private func makeModel(_ recorder: Recorder, now: Date = ProfileLinkVisitsTests.noon) -> ProfileLinkVisitsModel {
        let sources = ProfileLinkVisitsSources(
            cached: { recorder.cached[$0] },
            fetch: {
                recorder.fetches += 1
                return try recorder.served.get()
            },
            save: { ownerId, reading in recorder.saved.append((ownerId, reading)) },
            publish: { reading, link in recorder.published.append((reading, link)) }
        )
        return ProfileLinkVisitsModel(sources: sources, now: { now })
    }

    private var aissa: ProfileLink? { ProfileLink(username: "aissa") }

    func test_load_paintsTheLastReadingFirst_whenTheGatewayDoesNotAnswer() async {
        let recorder = Recorder()
        recorder.cached["u1"] = ProfileLinkVisitsReading(today: 40, month: 1700, day: "2026-11-18")
        let model = makeModel(recorder)

        await model.load(ownerId: "u1", link: aissa)

        XCTAssertEqual(model.monthVisits, 1700)
        XCTAssertTrue(recorder.saved.isEmpty)
        XCTAssertTrue(recorder.published.isEmpty, "un échec ne remet rien au widget")
    }

    func test_load_theServedFigureReplacesTheCache_andIsKeptAndHandedToTheWidget() async {
        let recorder = Recorder()
        recorder.cached["u1"] = ProfileLinkVisitsReading(today: 40, month: 1700, day: "2026-11-18")
        recorder.served = .success(ProfileLinkVisitStats(today: 57, month: 1719))
        let model = makeModel(recorder)

        await model.load(ownerId: "u1", link: aissa)

        let fresh = ProfileLinkVisitsReading(today: 57, month: 1719, day: "2026-11-18")
        XCTAssertEqual(model.reading, fresh)
        XCTAssertEqual(model.monthVisits, 1719)
        XCTAssertEqual(recorder.saved.map { $0.0 }, ["u1"])
        XCTAssertEqual(recorder.saved.map { $0.1 }, [fresh])
        XCTAssertEqual(recorder.published.map { $0.1.displayText }, ["meeshy.me/@aissa"])
    }

    func test_load_aGatewayWithoutTheRoute_showsNothing_neverZero() async {
        let recorder = Recorder()
        let model = makeModel(recorder)

        await model.load(ownerId: "u1", link: aissa)

        XCTAssertNil(model.reading)
        XCTAssertNil(model.monthVisits)
    }

    func test_load_withoutAnAccountOrAHandle_asksNothing_andShowsNothing() async {
        let recorder = Recorder()
        recorder.served = .success(ProfileLinkVisitStats(today: 57, month: 1719))
        let model = makeModel(recorder)

        await model.load(ownerId: "u1", link: nil)

        XCTAssertEqual(recorder.fetches, 0)
        XCTAssertNil(model.reading)
    }

    func test_load_anotherAccount_neverPaintsThePreviousAccountsFigure() async {
        let recorder = Recorder()
        recorder.cached["u1"] = ProfileLinkVisitsReading(today: 40, month: 1700, day: "2026-11-18")
        let model = makeModel(recorder)
        await model.load(ownerId: "u1", link: aissa)

        await model.load(ownerId: "u2", link: ProfileLink(username: "leo"))

        XCTAssertNil(model.monthVisits)
    }

    func test_reading_thisMonthIsServedOnlyWithinTheMonthItWasCounted() {
        let reading = ProfileLinkVisitsReading(today: 57, month: 1719, day: "2026-11-18")

        XCTAssertEqual(reading.monthVisits(at: Self.date("2026-11-30T23:59:00Z")), 1719)
        XCTAssertNil(reading.monthVisits(at: Self.date("2026-12-01T00:01:00Z")))
    }

    func test_reading_todayIsServedOnlyOnTheDayItWasCounted_inUTC() {
        let reading = ProfileLinkVisitsReading(today: 57, month: 1719, day: "2026-11-18")

        XCTAssertEqual(reading.todayVisits(at: Self.date("2026-11-18T23:30:00Z")), 57)
        XCTAssertNil(reading.todayVisits(at: Self.date("2026-11-19T00:30:00Z")))
        XCTAssertEqual(ProfileLinkVisitsReading.utcDay(Self.date("2026-11-18T23:30:00Z")), "2026-11-18")
    }

    func test_copy_monthCaption_agreesWithTheFigure() {
        let one = ProfileLinksCopy.visitsThisMonth(1)
        let many = ProfileLinksCopy.visitsThisMonth(1719)

        XCTAssertNotEqual(one, many)
        XCTAssertFalse(many.isEmpty)
    }

    func test_copy_spokenFigure_saysTheNumberAndItsPeriod() {
        let spoken = ProfileLinksCopy.visitsFigure(1719)

        XCTAssertTrue(spoken.contains(1719.formatted()))
        XCTAssertTrue(spoken.contains(ProfileLinksCopy.visitsThisMonth(1719)))
    }
}
