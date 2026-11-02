import XCTest
@testable import Meeshy

/// R-3 — l'axe des ordonnées est le temps : une règle pure, un calendrier
/// FIXÉ (grégorien, UTC, français) pour que les libellés ne dépendent ni de
/// la machine ni de l'heure du test.
final class RiverTimeScaleTests: XCTestCase {

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        c.locale = Locale(identifier: "fr_FR")
        return c
    }
    private let locale = Locale(identifier: "fr_FR")
    /// 2026-08-01 00:00 UTC
    private let t0: Double = 1_785_542_400_000

    private func scale(_ offsetsMs: [Double]) -> RiverTimeScale? {
        RiverTimeScale.resolve(
            ranks: offsetsMs.enumerated().map { RiverTimeScale.RankTime(rank: $0.offset, timeMs: t0 + $0.element) },
            calendar: calendar, locale: locale
        )
    }

    // MARK: - L'unité suit l'amplitude réelle

    func test_unit_followsTheRealSpan() {
        let h = RiverTimeScale.hourMs, d = RiverTimeScale.dayMs
        XCTAssertEqual(RiverTimeScale.unit(forSpanMs: 5 * h), .hour)
        XCTAssertEqual(RiverTimeScale.unit(forSpanMs: 3 * d), .day)
        XCTAssertEqual(RiverTimeScale.unit(forSpanMs: 40 * d), .week)
        XCTAssertEqual(RiverTimeScale.unit(forSpanMs: 300 * d), .month)
        XCTAssertEqual(RiverTimeScale.unit(forSpanMs: 1000 * d), .year)
    }

    func test_resolve_isNil_withoutTwoDistinctInstants() {
        XCTAssertNil(scale([]))
        XCTAssertNil(scale([0]))
        XCTAssertNil(scale([0, 0, 0]), "un fil écrit au même instant n'a pas d'axe")
    }

    // MARK: - Fraction ↔ rang, linéaire dans le TEMPS

    func test_fractionAndRank_areLinearInTime_notInRanks() throws {
        let d = RiverTimeScale.dayMs
        // Trois messages le jour 0, un seul le jour 10 : la moitié de la piste
        // est le jour 5 — et n'atteint que le dernier rang.
        let s = try XCTUnwrap(scale([0, d / 24, d / 12, 10 * d]))
        XCTAssertEqual(s.fraction(ofRank: 0), 0)
        XCTAssertEqual(s.fraction(ofRank: 3), 1)
        XCTAssertEqual(s.fraction(ofRank: 1), (d / 24) / (10 * d), accuracy: 1e-9)
        XCTAssertEqual(s.rank(atFraction: 0.5), 3, "le premier rang dont l'instant atteint la piste")
        XCTAssertEqual(s.rank(atFraction: 0), 0)
        XCTAssertEqual(s.rank(atFraction: 1.7), 3, "au-delà de tout : le dernier rang")
    }

    // MARK: - Graduations aux frontières, libellées dans l'unité

    func test_ticks_dayUnit_fallOnMidnights_withFrenchLabels() throws {
        let d = RiverTimeScale.dayMs
        let s = try XCTUnwrap(scale([0, d / 2, d + d / 3, 2 * d + d / 2]))
        XCTAssertEqual(s.unit, .day)
        XCTAssertEqual(s.ticks.map(\.label), ["2 août", "3 août"])
        XCTAssertEqual(s.ticks.map(\.rank), [2, 3], "la graduation pointe le premier rang de sa journée")
        XCTAssertEqual(s.ticks[0].fraction, d / (2 * d + d / 2), accuracy: 1e-9)
    }

    func test_ticks_neverExceedTheCap() throws {
        let d = RiverTimeScale.dayMs
        let s = try XCTUnwrap(scale(stride(from: 0, through: 20 * d, by: d / 2).map { $0 }))
        XCTAssertEqual(s.unit, .day)
        XCTAssertLessThanOrEqual(s.ticks.count, RiverTimeScale.maxTicks)
        XCTAssertFalse(s.ticks.isEmpty)
    }

    func test_label_underTheHandle_usesTheUnitsFormat() throws {
        let h = RiverTimeScale.hourMs
        let hours = try XCTUnwrap(scale([0, 5 * h]))
        XCTAssertEqual(hours.unit, .hour)
        XCTAssertEqual(hours.label(atFraction: 0.5), "02:30")
        let d = RiverTimeScale.dayMs
        let months = try XCTUnwrap(scale([0, 300 * d]))
        XCTAssertEqual(months.unit, .month)
        XCTAssertEqual(months.label(atFraction: 0), "août 2026")
    }
}
