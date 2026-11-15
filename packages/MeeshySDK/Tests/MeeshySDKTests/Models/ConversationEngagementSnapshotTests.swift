import Foundation
import Testing
@testable import MeeshySDK

/// #8906 — l'état « 🔥 série · N (M) » d'une conversation, miroir de
/// `conversationEngagementForDay` / `formatConversationPoints`
/// (`packages/shared/types/engagement-scale.ts`).
struct ConversationEngagementSnapshotTests {

    private func snapshot(total: Int = 42, today: Int = 5, streak: Int = 3, day: String? = "2026-09-30") -> ConversationEngagementSnapshot {
        ConversationEngagementSnapshot(conversationId: "c1", totalPoints: total, todayPoints: today, streakDays: streak, day: day)
    }

    // MARK: - Décodage

    @Test func test_decode_serverPayload_readsEveryField() throws {
        let json = #"{"conversationId":"c1","totalPoints":42,"todayPoints":5,"streakDays":3,"day":"2026-09-30"}"#
        let decoded = try JSONDecoder().decode(ConversationEngagementSnapshot.self, from: Data(json.utf8))
        #expect(decoded == snapshot())
    }

    @Test func test_decode_nullDay_readsNil() throws {
        let json = #"{"conversationId":"c1","totalPoints":0,"todayPoints":0,"streakDays":0,"day":null}"#
        let decoded = try JSONDecoder().decode(ConversationEngagementSnapshot.self, from: Data(json.utf8))
        #expect(decoded.day == nil)
    }

    @Test func test_decode_apiConversation_carriesViewerEngagementToTheDomainModel() throws {
        let json = #"""
        {"id":"c1","type":"group","createdAt":"2026-09-01T00:00:00Z",
         "viewerEngagement":{"conversationId":"c1","totalPoints":42,"todayPoints":5,"streakDays":3,"day":"2026-09-30"}}
        """#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIConversation.self, from: Data(json.utf8))
        #expect(api.viewerEngagement == snapshot())
        #expect(api.toConversation(currentUserId: "me").viewerEngagement == snapshot())
    }

    @Test func test_conversationCache_roundTrip_keepsViewerEngagement() throws {
        var conversation = MeeshyConversation(
            id: "c1", identifier: "c1", type: .group,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        conversation.viewerEngagement = snapshot()
        let data = try JSONEncoder().encode(conversation)
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: data)
        #expect(decoded.viewerEngagement == snapshot())
    }

    @Test func test_renderFingerprint_engagementChanges_changes() {
        var before = MeeshyConversation(
            id: "c1", identifier: "c1", type: .group,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        before.viewerEngagement = snapshot(total: 42)
        var after = before
        after.viewerEngagement = snapshot(total: 45)
        #expect(before.renderFingerprint != after.renderFingerprint)
    }

    // MARK: - Projection sur le jour affiché

    @Test func test_forDay_sameDay_keepsTodayPointsAndStreak() {
        let shown = snapshot().forDay("2026-09-30")
        #expect(shown.todayPoints == 5)
        #expect(shown.streakDays == 3)
    }

    @Test func test_forDay_nextDay_dropsTodayPointsButKeepsStreak() {
        let shown = snapshot().forDay("2026-10-01")
        #expect(shown.todayPoints == 0)
        #expect(shown.streakDays == 3)
        #expect(shown.totalPoints == 42)
    }

    @Test func test_forDay_twoDaysLater_breaksTheStreak() {
        let shown = snapshot().forDay("2026-10-02")
        #expect(shown.todayPoints == 0)
        #expect(shown.streakDays == 0)
    }

    @Test func test_forDay_acrossYearBoundary_countsCalendarDays() {
        let shown = snapshot(day: "2026-12-31").forDay("2027-01-01")
        #expect(shown.streakDays == 3)
        #expect(snapshot(day: "2028-02-28").forDay("2028-03-01").streakDays == 0)
        #expect(snapshot(day: "2028-02-29").forDay("2028-03-01").streakDays == 3)
    }

    @Test func test_forDay_neverCredited_showsZeroes() {
        let shown = snapshot(day: nil).forDay("2026-09-30")
        #expect(shown.todayPoints == 0)
        #expect(shown.streakDays == 0)
    }

    // MARK: - Texte et fraîcheur

    @Test func test_pointsText_rendersTotalThenToday() {
        #expect(snapshot().pointsText == "42 (5)")
    }

    @Test func test_isFresher_laterDayWins_thenMorePoints() {
        #expect(snapshot(total: 10, day: "2026-10-01").isFresher(than: snapshot(total: 50, day: "2026-09-30")))
        #expect(snapshot(total: 43).isFresher(than: snapshot(total: 42)))
        #expect(!snapshot(total: 42).isFresher(than: snapshot(total: 42)))
        #expect(snapshot(day: "2026-09-30").isFresher(than: snapshot(day: nil)))
    }

    @Test func test_dayString_formatsInTheGivenCalendar() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Pacific/Auckland")!
        let instant = Date(timeIntervalSince1970: 1_790_000_000)
        #expect(ConversationEngagementSnapshot.dayString(for: instant, calendar: calendar) == "2026-09-22")
    }
}
