import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

// MARK: - L'en-tête de l'aperçu et la flamme du jour (#9031)

// Demande porteur du 2026-10-01 : dans l'aperçu tiré d'une notification, le
// bouton « agrandir » remplace la loupe, et l'avatar montre la pile des plus
// actifs puis l'interlocuteur ou le groupe. Sous l'avatar de l'en-tête replié,
// une flamme porte les points du jour ; elle rejoue son effet à chaque envoi,
// disparaît au toucher et revient après un dépliement. Le dépliement et le
// masquage sont retenus par conversation, sur l'appareil.
@MainActor
final class ConversationHeaderFlameTests: XCTestCase {

    // MARK: - La disposition

    func test_resolve_previewMode_showsTheIdentityAvatars() {
        XCTAssertTrue(ConversationHeaderLayout.resolve(previewMode: true, showOptions: false).avatarShowsIdentity)
    }

    func test_resolve_fullConversationFolded_showsTheSingleAvatarWithItsFlame() {
        XCTAssertFalse(ConversationHeaderLayout.resolve(previewMode: false, showOptions: false).avatarShowsIdentity)
    }

    func test_resolve_fullConversationUnfolded_showsTheIdentityAvatars() {
        XCTAssertTrue(ConversationHeaderLayout.resolve(previewMode: false, showOptions: true).avatarShowsIdentity)
    }

    func test_headerButtonsCluster_previewPutsOpenFullInTheSearchSlot() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        XCTAssertTrue(source.contains("searchButton: { previewMode ? openFullConversationButton : expandedHeaderSearchButton }"))
        XCTAssertFalse(source.contains("cluster; openFullConversationButton"),
                       "« agrandir » remplace la loupe, il ne s'ajoute plus après elle")
    }

    // MARK: - La visibilité de la flamme

    func test_isShown_foldedWithPointsAndNotDismissed_showsTheFlame() {
        XCTAssertTrue(HeaderFlameVisibility.isShown(headerExpanded: false, dismissed: false, hasEngagement: true))
    }

    func test_isShown_unfolded_hidesTheFlame() {
        XCTAssertFalse(HeaderFlameVisibility.isShown(headerExpanded: true, dismissed: false, hasEngagement: true))
    }

    func test_isShown_dismissed_hidesTheFlame() {
        XCTAssertFalse(HeaderFlameVisibility.isShown(headerExpanded: false, dismissed: true, hasEngagement: true))
    }

    func test_isShown_withoutEngagement_hidesTheFlame() {
        XCTAssertFalse(HeaderFlameVisibility.isShown(headerExpanded: false, dismissed: false, hasEngagement: false))
    }

    func test_dismissed_afterUnfolding_isCleared() {
        XCTAssertFalse(HeaderFlameVisibility.dismissed(afterHeaderExpanded: true, wasDismissed: true))
    }

    func test_dismissed_afterFolding_isKept() {
        XCTAssertTrue(HeaderFlameVisibility.dismissed(afterHeaderExpanded: false, wasDismissed: true))
        XCTAssertFalse(HeaderFlameVisibility.dismissed(afterHeaderExpanded: false, wasDismissed: false))
    }

    // MARK: - La lueur rejoint la flamme, qui s'allume (#9044)

    func test_glowHead_startsAndEndsUnderTheAvatar_whereTheFlameSits() {
        XCTAssertEqual(HeaderFlameOrbit.glowHead(at: 0).degrees, 90, accuracy: 0.001)
        XCTAssertEqual(HeaderFlameOrbit.glowHead(at: HeaderFlameOrbit.orbitShare).degrees, 450, accuracy: 0.001,
                       "la lueur fait UN tour et finit sous l'avatar, sur la flamme")
    }

    func test_glowHead_halfwayThroughTheTurn_isAboveTheAvatar() {
        XCTAssertEqual(HeaderFlameOrbit.glowHead(at: HeaderFlameOrbit.orbitShare / 2).degrees, 270, accuracy: 0.001)
    }

    func test_glowLength_collapsesIntoTheFlameOnArrival() {
        XCTAssertEqual(HeaderFlameOrbit.glowLength(at: 0), 0, accuracy: 0.001)
        XCTAssertGreaterThan(HeaderFlameOrbit.glowLength(at: HeaderFlameOrbit.orbitShare / 2), 0.2)
        XCTAssertEqual(HeaderFlameOrbit.glowLength(at: HeaderFlameOrbit.orbitShare), 0, accuracy: 0.001)
        XCTAssertEqual(HeaderFlameOrbit.glowOpacity(at: 0.9), 0, accuracy: 0.001)
    }

    func test_flame_isDimWhileTheGlowTurns_andLightsUpWhenItArrives() {
        XCTAssertEqual(HeaderFlameOrbit.flameOpacity(at: 0), 1, accuracy: 0.001)
        XCTAssertLessThan(HeaderFlameOrbit.flameOpacity(at: HeaderFlameOrbit.orbitShare * 0.6), 0.5)
        XCTAssertEqual(HeaderFlameOrbit.flameOpacity(at: HeaderFlameOrbit.orbitShare), 1, accuracy: 0.001)
        XCTAssertEqual(HeaderFlameOrbit.flameOpacity(at: 1), 1, accuracy: 0.001)
    }

    func test_flame_staysStillDuringTheTurn_thenBurnsAndGrowsOnArrival() {
        let midTurn = HeaderFlameOrbit.orbitShare / 2
        XCTAssertEqual(HeaderFlameOrbit.flameScale(at: midTurn), 1, accuracy: 0.001,
                       "la flamme ne tourne pas et ne grossit pas tant que la lueur fait le tour")
        XCTAssertEqual(HeaderFlameOrbit.burn(at: midTurn), .still)
        let midIgnition = (HeaderFlameOrbit.orbitShare + HeaderFlameOrbit.ignitionEnd) / 2
        XCTAssertGreaterThan(HeaderFlameOrbit.flameScale(at: midIgnition), 1.4)
        XCTAssertNotEqual(HeaderFlameOrbit.burn(at: midIgnition + 0.03), .still, "la flamme vacille en brûlant")
        XCTAssertEqual(HeaderFlameOrbit.flameScale(at: 1), 1, accuracy: 0.001)
        XCTAssertEqual(HeaderFlameOrbit.burn(at: 1), .still)
    }

    func test_tongues_riseFromTheFlameWhileItBurns_andAreGoneAtRest() {
        for index in 0..<HeaderFlameOrbit.tongueCount {
            XCTAssertEqual(HeaderFlameOrbit.tongue(index, at: HeaderFlameOrbit.orbitShare / 2).opacity, 0, accuracy: 0.001)
            XCTAssertEqual(HeaderFlameOrbit.tongue(index, at: 1).opacity, 0, accuracy: 0.001)
        }
        let rising = (0..<HeaderFlameOrbit.tongueCount).map {
            HeaderFlameOrbit.tongue($0, at: (HeaderFlameOrbit.orbitShare + HeaderFlameOrbit.ignitionEnd) / 2)
        }
        XCTAssertTrue(rising.contains { $0.opacity > 0.3 && $0.rise > 0 }, "des mèches montent de la flamme qui brûle")
    }

    func test_valueRelease_comesAfterTheFlameHasCaught() {
        XCTAssertGreaterThan(HeaderFlameOrbit.valueRelease, (HeaderFlameOrbit.orbitShare + HeaderFlameOrbit.ignitionEnd) / 2)
        XCTAssertLessThan(HeaderFlameOrbit.valueRelease, 1)
    }

    func test_law_outOfRangeProgress_isClamped() {
        XCTAssertEqual(HeaderFlameOrbit.flameScale(at: -1), HeaderFlameOrbit.flameScale(at: 0))
        XCTAssertEqual(HeaderFlameOrbit.glowHead(at: 2), HeaderFlameOrbit.glowHead(at: 1))
    }

    // MARK: - Rien sans série en cours, et les totaux abrégés (#9044)

    private func engagement(total: Int = 120, today: Int = 12, streak: Int = 4) -> ConversationEngagementSnapshot {
        ConversationEngagementSnapshot(conversationId: "c", totalPoints: total, todayPoints: today,
                                       streakDays: streak, day: "2026-10-01")
    }

    func test_headerFlame_withoutARunningStreak_showsNothing() {
        XCTAssertTrue(HeaderFlameVisibility.hasRunningStreak(engagement()))
        XCTAssertFalse(HeaderFlameVisibility.hasRunningStreak(engagement(streak: 0)))
        XCTAssertFalse(HeaderFlameVisibility.hasRunningStreak(nil))
    }

    func test_headerCallButtons_doNotCarryTheEngagementPill() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
        let cluster = try XCTUnwrap(source.range(of: "var headerCallButtons: AnyView {"))
        let end = try XCTUnwrap(source.range(of: "var headerEngagementBadge", range: cluster.upperBound..<source.endIndex))
        XCTAssertFalse(source[cluster.upperBound..<end.lowerBound].contains("headerEngagementBadge"),
                       "repliée ou en aperçu, la pastille ne s'affiche pas")
    }

    func test_engagementPill_showsStreakDotTotal_withoutTodayInParentheses() {
        let pill = ConversationEngagementPill(snapshot: engagement(), accentColor: "FF0000")
        XCTAssertEqual(pill?.text, "4 · 120")
    }

    func test_engagementPill_withoutARunningStreak_isAbsent() {
        XCTAssertNil(ConversationEngagementPill(snapshot: engagement(streak: 0), accentColor: "FF0000"))
    }

    func test_totals_areAbbreviated_inTheReadersLocale() {
        let english = Locale(identifier: "en_US")
        let pill = ConversationEngagementPill(snapshot: engagement(total: 1_234), accentColor: "FF0000", locale: english)
        XCTAssertEqual(pill?.text, "4 · \(CompactCountLabel.text(1_234, locale: english))")
        XCTAssertEqual(CompactCountLabel.text(1_234, locale: english), "1.2K")
        let mark = ConversationStreakMark(snapshot: engagement(total: 2_500_000), locale: english)
        XCTAssertEqual(mark?.totalText, "2.5M")
    }

    // MARK: - La mémoire, par conversation

    private func makeSUT() -> (sut: ConversationHeaderMemory, defaults: UserDefaults) {
        let suite = "ConversationHeaderFlameTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return (ConversationHeaderMemory(defaults: defaults), defaults)
    }

    func test_memory_remembersTheUnfoldedHeaderPerConversation() {
        let (sut, _) = makeSUT()
        sut.setExpanded(true, for: "c1")

        XCTAssertTrue(sut.isExpanded("c1"))
        XCTAssertFalse(sut.isExpanded("c2"))
    }

    func test_memory_foldingForgetsTheUnfoldedHeader() {
        let (sut, _) = makeSUT()
        sut.setExpanded(true, for: "c1")
        sut.setExpanded(false, for: "c1")

        XCTAssertFalse(sut.isExpanded("c1"))
    }

    func test_memory_remembersTheDismissedFlameAcrossInstances() {
        let (sut, defaults) = makeSUT()
        sut.setFlameDismissed(true, for: "c1")

        let reopened = ConversationHeaderMemory(defaults: defaults)
        XCTAssertTrue(reopened.isFlameDismissed("c1"))
        XCTAssertFalse(reopened.isExpanded("c1"), "masquer la flamme ne déplie rien")
    }

    func test_memory_ignoresAnEmptyConversationId() {
        let (sut, defaults) = makeSUT()
        sut.setExpanded(true, for: "")

        XCTAssertNil(defaults.stringArray(forKey: ConversationHeaderMemory.expandedKey))
    }

    // MARK: - Le rejeu à chaque envoi

    func test_sendMessage_firesTheFlameReplayAfterTheEligibilityGuard() throws {
        let send = try String(contentsOf: Self.appFile("Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift"), encoding: .utf8)
        let code = AppSourceGuard.stripComments(send)
        guard let guardRange = code.range(of: "guard SendEligibility.canSend("),
              let replayRange = code.range(of: "HeaderFlameReplay.messageSent(in: conversationId)") else {
            return XCTFail("l'envoi doit signaler la flamme de sa conversation")
        }
        XCTAssertLessThan(guardRange.lowerBound, replayRange.lowerBound,
                          "un envoi refusé par la garde ne fait pas jouer la flamme")
    }

    func test_replaySignal_carriesTheConversationId() {
        var received: [String] = []
        let cancellable = HeaderFlameReplay.sent.sink { received.append($0) }
        HeaderFlameReplay.messageSent(in: "c42")
        cancellable.cancel()

        XCTAssertEqual(received, ["c42"])
    }

    private static func appFile(_ relative: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relative)
    }
}
