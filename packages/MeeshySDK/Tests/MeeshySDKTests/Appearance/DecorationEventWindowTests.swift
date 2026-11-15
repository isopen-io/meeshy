import Testing
import Foundation
@testable import MeeshySDK

/// Miroir des témoins de `packages/shared/utils/__tests__/decoration-event-window.test.ts` (#16447, #16450).
struct DecorationEventWindowTests {

    private func at(_ iso: String) -> Date {
        guard let date = ISO8601DateFormatter().date(from: iso) else {
            Issue.record("date illisible \(iso)")
            return Date(timeIntervalSince1970: 0)
        }
        return date
    }

    private func window(_ startsAt: String, _ endsAt: String) -> DecorationWindow {
        DecorationWindow(startsAt: at(startsAt), endsAt: at(endsAt))
    }

    private let christmas = DecorationEventDeclaration(id: "christmas", recurrence: .yearly)
    private let newYear = DecorationEventDeclaration(id: "new-year", recurrence: .yearly)

    @Test func rule_isTwoMonthsBeforeAndOneMonthAfter() {
        #expect(DecorationEventWindow.monthsBeforeEvent == 2)
        #expect(DecorationEventWindow.monthsAfterEvent == 1)
    }

    @Test func registry_namesEventsInEnglish() {
        #expect(Set(DecorationEventWindow.events.keys) == ["christmas", "new-year", "valentines-day", "music-day", "halloween"])
        #expect(DecorationEventWindow.events["christmas"] == DecorationEventWindow.EventDate(month: 12, day: 25))
        #expect(DecorationEventWindow.events["new-year"] == DecorationEventWindow.EventDate(month: 1, day: 1))
    }

    @Test func christmas_onNovember6_2026_isTheOpenOccurrence2026() {
        let now = at("2026-11-06T12:00:00Z")
        let resolved = DecorationEventWindow.resolve(christmas, now: now)
        #expect(resolved == window("2026-10-25T00:00:00Z", "2027-01-25T00:00:00Z"))
        #expect(resolved?.isOpen(at: now) == true)
    }

    @Test func christmas_acrossTheYear_onJanuary24_isStillChristmas2026() {
        #expect(DecorationEventWindow.resolve(christmas, now: at("2027-01-24T23:59:59Z"))?.startsAt == at("2026-10-25T00:00:00Z"))
    }

    @Test func christmas_closedOccurrence_pointsToTheNextOne() {
        let now = at("2027-01-25T00:00:00Z")
        let resolved = DecorationEventWindow.resolve(christmas, now: now)
        #expect(resolved == window("2027-10-25T00:00:00Z", "2028-01-25T00:00:00Z"))
        #expect(resolved?.isOpen(at: now) == false)
    }

    @Test func newYear_upcomingOccurrence_isNextYearsEvent() {
        #expect(DecorationEventWindow.resolve(newYear, now: at("2026-10-01T00:00:00Z")) == window("2026-11-01T00:00:00Z", "2027-02-01T00:00:00Z"))
        #expect(DecorationEventWindow.resolve(newYear, now: at("2026-01-15T00:00:00Z")) == window("2025-11-01T00:00:00Z", "2026-02-01T00:00:00Z"))
    }

    @Test func february29_existsOnlyInLeapYears() {
        #expect(DecorationEventWindow.ruleWindow(date: .init(month: 4, day: 30), year: 2027).startsAt == at("2027-02-28T00:00:00Z"))
        #expect(DecorationEventWindow.ruleWindow(date: .init(month: 4, day: 30), year: 2028).startsAt == at("2028-02-29T00:00:00Z"))
        let bounded = DecorationEventDeclaration(id: "new-year", recurrence: .yearly, endsOn: "02-29")
        #expect(DecorationEventWindow.resolve(bounded, now: at("2026-11-06T00:00:00Z"))?.endsAt == at("2027-02-28T00:00:00Z"))
        #expect(DecorationEventWindow.resolve(bounded, now: at("2027-11-06T00:00:00Z"))?.endsAt == at("2028-02-29T00:00:00Z"))
    }

    @Test func writtenMonthDayBounds_win_andASingleOneKeepsTheRuleForTheOther() {
        let now = at("2026-11-06T00:00:00Z")
        let both = DecorationEventDeclaration(id: "christmas", recurrence: .yearly, startsOn: "12-01", endsOn: "01-07")
        let startOnly = DecorationEventDeclaration(id: "christmas", recurrence: .yearly, startsOn: "12-01")
        #expect(DecorationEventWindow.resolve(both, now: now) == window("2026-12-01T00:00:00Z", "2027-01-07T00:00:00Z"))
        #expect(DecorationEventWindow.resolve(startOnly, now: now) == window("2026-12-01T00:00:00Z", "2027-01-25T00:00:00Z"))
    }

    @Test func singleOccurrence_doesNotRepeat() {
        let once = DecorationEventDeclaration(id: "christmas", recurrence: .none, year: 2026)
        #expect(DecorationEventWindow.resolve(once, now: at("2030-01-01T00:00:00Z")) == window("2026-10-25T00:00:00Z", "2027-01-25T00:00:00Z"))
    }

    @Test func unknownEventOrUnreadableBound_resolvesToNothing_andTheServedWindowStands() {
        let served = window("2026-12-01T00:00:00Z", "2027-01-07T00:00:00Z")
        let unknown = DecorationEventDeclaration(id: "inconnu", recurrence: .yearly)
        let unreadable = DecorationEventDeclaration(id: "christmas", recurrence: .yearly, startsOn: "13-01")
        #expect(DecorationEventWindow.resolve(unknown, now: at("2026-11-06T00:00:00Z")) == nil)
        #expect(DecorationEventWindow.resolve(unreadable, now: at("2026-11-06T00:00:00Z")) == nil)
        #expect(DecorationEventWindow.offerWindow(event: unknown, served: served, now: at("2026-11-06T00:00:00Z")) == served)
    }

    @Test func offerWindow_recomputesAYearlyPack_andKeepsTheServedWindowOtherwise() {
        let snapshot = window("2026-10-25T00:00:00Z", "2027-01-25T00:00:00Z")
        let now = at("2027-06-01T00:00:00Z")
        #expect(DecorationEventWindow.offerWindow(event: christmas, served: snapshot, now: now) == window("2027-10-25T00:00:00Z", "2028-01-25T00:00:00Z"))
        #expect(DecorationEventWindow.offerWindow(event: nil, served: snapshot, now: now) == snapshot)
    }

    @Test func declaration_decodesBothCatalogForms() throws {
        let yearly = try JSONDecoder().decode(DecorationEventDeclaration.self, from: Data(#"{"id":"christmas","recurrence":"yearly"}"#.utf8))
        let once = try JSONDecoder().decode(DecorationEventDeclaration.self, from: Data(#"{"id":"christmas","year":2026}"#.utf8))
        #expect(yearly == christmas)
        #expect(once == DecorationEventDeclaration(id: "christmas", recurrence: .none, year: 2026))
    }
}
