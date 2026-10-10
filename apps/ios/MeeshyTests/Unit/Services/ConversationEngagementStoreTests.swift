import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #8906 — « 🔥 série · N (M) » par conversation : semé par la liste et le
/// détail, tenu à jour par `engagement:conversation-updated`, projeté sur le
/// jour du lecteur, vidé à la déconnexion.
@MainActor
final class ConversationEngagementStoreTests: XCTestCase {

    private struct Harness {
        let sut: ConversationEngagementStore
        let updates: PassthroughSubject<ConversationEngagementSnapshot, Never>
        let authentication: CurrentValueSubject<Bool, Never>
        let calendar: Calendar
    }

    private func makeSUT(
        fetch: @escaping @Sendable (String) async throws -> ConversationEngagementSnapshot = { _ in throw URLError(.notConnectedToInternet) }
    ) -> Harness {
        let updates = PassthroughSubject<ConversationEngagementSnapshot, Never>()
        let authentication = CurrentValueSubject<Bool, Never>(true)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let sut = ConversationEngagementStore(
            updates: updates.eraseToAnyPublisher(),
            authentication: authentication.eraseToAnyPublisher(),
            calendar: calendar,
            fetch: fetch
        )
        return Harness(sut: sut, updates: updates, authentication: authentication, calendar: calendar)
    }

    private func snapshot(
        _ conversationId: String = "conv-a",
        total: Int = 42,
        today: Int = 5,
        streak: Int = 3,
        day: String? = "2026-09-30"
    ) -> ConversationEngagementSnapshot {
        ConversationEngagementSnapshot(
            conversationId: conversationId,
            totalPoints: total,
            todayPoints: today,
            streakDays: streak,
            day: day
        )
    }

    private func noon(_ day: Int, month: Int = 9, in calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: 12))!
    }

    // MARK: - Relecture à l'ouverture

    func test_revalidate_seedsServerState() async {
        let served = snapshot(total: 90, today: 9)
        let h = makeSUT(fetch: { _ in served })

        await h.sut.revalidate("conv-a")

        XCTAssertEqual(h.sut.snapshot(for: "conv-a"), served)
    }

    func test_revalidate_neverRollsBackFresherLocalState() async {
        let stale = snapshot(total: 10, today: 1, streak: 1, day: "2026-09-29")
        let h = makeSUT(fetch: { _ in stale })
        h.sut.seed(snapshot())

        await h.sut.revalidate("conv-a")

        XCTAssertEqual(h.sut.snapshot(for: "conv-a"), snapshot())
    }

    func test_revalidate_onFailure_keepsWhatItHad() async {
        let h = makeSUT()
        h.sut.seed(snapshot())

        await h.sut.revalidate("conv-a")

        XCTAssertEqual(h.sut.snapshot(for: "conv-a"), snapshot())
    }

    // MARK: - Semis (liste, détail)

    func test_seed_fromConversationPayload_isDisplayedSameDay() {
        let h = makeSUT()

        h.sut.seed(snapshot())

        XCTAssertEqual(h.sut.displayed(for: "conv-a", seed: nil, at: noon(30, in: h.calendar)), snapshot())
        XCTAssertNil(h.sut.displayed(for: "conv-b", seed: nil, at: noon(30, in: h.calendar)))
    }

    func test_seed_olderSnapshot_neverRollsTheBadgeBack() {
        let h = makeSUT()
        h.sut.seed(snapshot(total: 50, today: 13))

        h.sut.seed(snapshot(total: 42, today: 5))

        XCTAssertEqual(h.sut.snapshot(for: "conv-a")?.totalPoints, 50)
    }

    func test_displayed_seedFresherThanStored_winsWithoutWriting() {
        let h = makeSUT()
        h.sut.seed(snapshot(total: 42))

        let shown = h.sut.displayed(for: "conv-a", seed: snapshot(total: 47, today: 10), at: noon(30, in: h.calendar))

        XCTAssertEqual(shown?.totalPoints, 47)
        XCTAssertEqual(h.sut.snapshot(for: "conv-a")?.totalPoints, 42)
    }

    func test_displayed_seedOfAnotherConversation_isIgnored() {
        let h = makeSUT()

        XCTAssertNil(h.sut.displayed(for: "conv-a", seed: snapshot("conv-b"), at: noon(30, in: h.calendar)))
    }

    func test_displayed_noPointsYet_hidesThePill() {
        let h = makeSUT()
        h.sut.seed(snapshot(total: 0, today: 0, streak: 0, day: nil))

        XCTAssertNil(h.sut.displayed(for: "conv-a", seed: nil, at: noon(30, in: h.calendar)))
    }

    // MARK: - Temps réel

    func test_liveUpdate_socketEvent_replacesTheSeededSnapshot() async {
        let h = makeSUT()
        h.sut.seed(snapshot(total: 42, today: 5))
        let updated = expectation(description: "snapshot updated from the socket")
        let cancellable = h.sut.$snapshots
            .dropFirst()
            .sink { snapshots in
                if snapshots["conv-a"]?.totalPoints == 45 { updated.fulfill() }
            }

        h.updates.send(snapshot(total: 45, today: 8, streak: 3))

        await fulfillment(of: [updated], timeout: 2)
        cancellable.cancel()
        XCTAssertEqual(h.sut.displayed(for: "conv-a", seed: snapshot(total: 42), at: noon(30, in: h.calendar))?.pointsText, "45 (8)")
    }

    // MARK: - Passage de minuit

    func test_displayed_nextDay_dropsTodayPointsButKeepsTheStreak() {
        let h = makeSUT()
        h.sut.seed(snapshot())

        let shown = h.sut.displayed(for: "conv-a", seed: nil, at: noon(1, month: 10, in: h.calendar))

        XCTAssertEqual(shown?.todayPoints, 0)
        XCTAssertEqual(shown?.streakDays, 3)
        XCTAssertEqual(shown?.pointsText, "42 (0)")
    }

    func test_displayed_twoDaysWithoutGesture_breaksTheStreak() {
        let h = makeSUT()
        h.sut.seed(snapshot())

        let shown = h.sut.displayed(for: "conv-a", seed: nil, at: noon(2, month: 10, in: h.calendar))

        XCTAssertEqual(shown?.streakDays, 0)
        XCTAssertEqual(shown?.totalPoints, 42)
    }

    // MARK: - Déconnexion

    func test_signOut_forgetsEveryConversation() async {
        let h = makeSUT()
        h.sut.seed(snapshot())
        let cleared = expectation(description: "snapshots cleared on sign-out")
        let cancellable = h.sut.$snapshots
            .dropFirst()
            .sink { snapshots in
                if snapshots.isEmpty { cleared.fulfill() }
            }

        h.authentication.send(false)

        await fulfillment(of: [cleared], timeout: 2)
        cancellable.cancel()
        XCTAssertNil(h.sut.snapshot(for: "conv-a"))
    }

    // MARK: - Libellé VoiceOver

    func test_accessibilityText_withoutStreak_saysTheTotalAlone() {
        let text = ConversationEngagementPill.accessibilityText(for: snapshot(total: 42, today: 5, streak: 0))

        XCTAssertEqual(text, ConversationEngagementPill.totalAccessibilityText(42))
        XCTAssertTrue(text.contains("42"))
        XCTAssertFalse(text.contains("5"))
    }

    // MARK: - La série dans la liste (#9025)

    func test_streakMark_runningStreak_showsDaysAndTotalPoints() {
        let mark = ConversationStreakMark(snapshot: snapshot(total: 120, today: 12, streak: 4))
        XCTAssertEqual(mark?.streakDays, 4)
        XCTAssertEqual(mark?.totalText, "120")
    }

    func test_streakMark_noStreak_showsTheTotalAlone_withoutFlame() {
        let mark = ConversationStreakMark(snapshot: snapshot(total: 120, streak: 0))
        XCTAssertEqual(mark?.streakDays, 0)
        XCTAssertEqual(mark?.totalText, "120")
        XCTAssertNil(ConversationStreakMark(snapshot: snapshot(total: 0, streak: 0)))
        XCTAssertNil(ConversationStreakMark(snapshot: nil))
    }

    func test_streakMark_accessibilityText_saysStreakAndPoints() {
        let text = ConversationStreakMark(snapshot: snapshot(total: 120, today: 12, streak: 4))?.accessibilityText ?? ""
        XCTAssertTrue(text.contains("4"))
        XCTAssertTrue(text.contains("120"))
    }

    func test_streakMark_brokenStreak_displayedForToday_fallsBackToTheTotal() {
        let h = makeSUT()
        let shown = h.sut.displayed(for: "conv-a", seed: snapshot(total: 42, streak: 4, day: "2026-09-28"), at: noon(30, in: h.calendar))
        let mark = ConversationStreakMark(snapshot: shown)
        XCTAssertEqual(mark?.streakDays, 0)
        XCTAssertEqual(mark?.totalText, "42")
    }

    // MARK: - Ce qu'un post a rapporté (#9571)

    private func makePointsStore() -> (sut: PostViewerPointsStore,
                                       announcements: PassthroughSubject<PostEngagementSnapshot, Never>,
                                       authentication: CurrentValueSubject<Bool, Never>) {
        let announcements = PassthroughSubject<PostEngagementSnapshot, Never>()
        let authentication = CurrentValueSubject<Bool, Never>(true)
        let sut = PostViewerPointsStore(announcements: announcements.eraseToAnyPublisher(),
                                        authentication: authentication.eraseToAnyPublisher())
        return (sut, announcements, authentication)
    }

    func test_postPoints_readThenAnnouncement_rollsToTheAnnouncedValue() {
        let h = makePointsStore()
        XCTAssertEqual(h.sut.displayed(postId: "p1", seed: 99), 99)
        h.sut.noteRead(postId: "p1", viewerPoints: 99)
        h.sut.noteAnnouncement(PostEngagementSnapshot(postId: "p1", viewerPoints: 102, at: 2_000))
        XCTAssertEqual(h.sut.displayed(postId: "p1", seed: 99), 102, "la même lecture re-semée ne défait pas l'annonce")
    }

    func test_postPoints_olderAnnouncement_isIgnored_andALowerNewerOneApplies() {
        let h = makePointsStore()
        h.sut.noteAnnouncement(PostEngagementSnapshot(postId: "p1", viewerPoints: 102, at: 2_000))
        h.sut.noteAnnouncement(PostEngagementSnapshot(postId: "p1", viewerPoints: 99, at: 1_000))
        XCTAssertEqual(h.sut.displayed(postId: "p1", seed: nil), 102)
        h.sut.noteAnnouncement(PostEngagementSnapshot(postId: "p1", viewerPoints: 90, at: 3_000))
        XCTAssertEqual(h.sut.displayed(postId: "p1", seed: nil), 90)
    }

    func test_postPoints_aNewRead_applies_andAnAbsentFieldKeepsWhatIsKnown() {
        let h = makePointsStore()
        h.sut.noteAnnouncement(PostEngagementSnapshot(postId: "p1", viewerPoints: 102, at: 2_000))
        XCTAssertEqual(h.sut.displayed(postId: "p1", seed: 110), 110)
        h.sut.noteRead(postId: "p1", viewerPoints: nil)
        XCTAssertEqual(h.sut.displayed(postId: "p1", seed: nil), 102)
    }

    func test_postPoints_logout_forgetsEverything() {
        let h = makePointsStore()
        h.sut.noteAnnouncement(PostEngagementSnapshot(postId: "p1", viewerPoints: 102, at: 2_000))
        h.sut.reset()
        XCTAssertNil(h.sut.displayed(postId: "p1", seed: nil))
    }

    // MARK: - La limite quotidienne de gestes (#9571)

    func test_dailyLimitNotice_saysTheResetTime_inTheDeviceTimeZone() throws {
        let resetAt = try XCTUnwrap(DailyGestureLimit.parseInstant("2026-10-07T22:00:00.000Z"))
        let limit = DailyGestureLimit(gesture: .comment, resetAt: resetAt, limit: 50)
        let paris = try XCTUnwrap(TimeZone(identifier: "Europe/Paris"))
        let time = DailyGestureLimitNotice.resetTime(resetAt, locale: Locale(identifier: "fr_FR"), timeZone: paris)
        XCTAssertEqual(time, "00:00")
        XCTAssertTrue(DailyGestureLimitNotice.text(for: limit, locale: Locale(identifier: "fr_FR"), timeZone: paris).contains(time))
    }

    func test_dailyLimitNotice_onlySurfacesADailyLimit() {
        XCTAssertNil(DailyGestureLimit.from(URLError(.notConnectedToInternet)))
        XCTAssertNotNil(DailyGestureLimit.from(DailyGestureLimit(gesture: .reaction, resetAt: nil, limit: nil)))
    }
}
