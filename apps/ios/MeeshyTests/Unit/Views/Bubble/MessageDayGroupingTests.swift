import XCTest
@testable import Meeshy

/// Tests de la logique pure qui transforme une liste plate de messages en
/// liste de groupes consécutifs partageant la même date locale. Cette
/// structure alimente la datasource diffable du collectionView de messages :
/// on insère un séparateur de jour entre chaque groupe.
@MainActor
final class MessageDayGroupingTests: XCTestCase {

    private func makeCalendar() -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "fr_FR")
        cal.timeZone = TimeZone(identifier: "Europe/Paris")!
        return cal
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
        let cal = makeCalendar()
        return cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    // MARK: - Cas dégénérés

    func test_groupByDay_emptyInput_returnsEmpty() {
        XCTAssertTrue(MessageDayGrouping.groupByDay(dates: [], calendar: makeCalendar()).isEmpty)
    }

    func test_groupByDay_singleDate_returnsOneGroup() {
        let d = date(2026, 5, 20, 10, 0)
        let groups = MessageDayGrouping.groupByDay(dates: [d], calendar: makeCalendar())
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].dayStart, makeCalendar().startOfDay(for: d))
        XCTAssertEqual(groups[0].indices, [0])
    }

    // MARK: - Regroupement

    func test_groupByDay_sameDayTwoDates_returnsOneGroupTwoIndices() {
        let d1 = date(2026, 5, 20, 9, 0)
        let d2 = date(2026, 5, 20, 14, 30)
        let groups = MessageDayGrouping.groupByDay(dates: [d1, d2], calendar: makeCalendar())
        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups[0].indices, [0, 1])
    }

    func test_groupByDay_threeDifferentDays_returnsThreeGroups() {
        let d0 = date(2026, 5, 18, 9, 0)
        let d1 = date(2026, 5, 19, 10, 0)
        let d2 = date(2026, 5, 20, 11, 0)
        let groups = MessageDayGrouping.groupByDay(dates: [d0, d1, d2], calendar: makeCalendar())
        XCTAssertEqual(groups.count, 3)
        XCTAssertEqual(groups[0].indices, [0])
        XCTAssertEqual(groups[1].indices, [1])
        XCTAssertEqual(groups[2].indices, [2])
        XCTAssertEqual(groups[0].dayStart, makeCalendar().startOfDay(for: d0))
        XCTAssertEqual(groups[1].dayStart, makeCalendar().startOfDay(for: d1))
        XCTAssertEqual(groups[2].dayStart, makeCalendar().startOfDay(for: d2))
    }

    func test_groupByDay_mixedDays_preservesOrder() {
        // 4 messages aujourd'hui, 1 hier, 2 avant-hier — entrée chronologique.
        let dates: [Date] = [
            date(2026, 5, 18, 8, 14),   // avant-hier
            date(2026, 5, 18, 14, 22),  // avant-hier
            date(2026, 5, 19, 9, 0),    // hier
            date(2026, 5, 20, 10, 0),   // today
            date(2026, 5, 20, 10, 30),  // today
            date(2026, 5, 20, 11, 0),   // today
            date(2026, 5, 20, 11, 30),  // today
        ]
        let groups = MessageDayGrouping.groupByDay(dates: dates, calendar: makeCalendar())
        XCTAssertEqual(groups.count, 3)
        XCTAssertEqual(groups[0].indices, [0, 1])
        XCTAssertEqual(groups[1].indices, [2])
        XCTAssertEqual(groups[2].indices, [3, 4, 5, 6])
    }

    // MARK: - Frontière minuit

    func test_groupByDay_acrossMidnightBoundary_splitsGroup() {
        // 23:59 et 00:01 dans Europe/Paris sont sur deux jours calendaires
        // distincts, même si l'écart est de 2 minutes.
        let beforeMidnight = date(2026, 5, 19, 23, 59)
        let afterMidnight = date(2026, 5, 20, 0, 1)
        let groups = MessageDayGrouping.groupByDay(dates: [beforeMidnight, afterMidnight], calendar: makeCalendar())
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups[0].indices, [0])
        XCTAssertEqual(groups[1].indices, [1])
    }
}
