import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// « Mon activité » (#18591) : l'écran des statistiques ne compte que ce qui dit quelque chose de Meeshy — messages,
/// conversations, traductions. Les demandes vivent dans « Mes cercles », l'ancienneté sous mon nom, les langues dans
/// leur section et les badges dans Ma Légende : les recompter ici répétait la fiche.
final class UserActivityCardsTests: XCTestCase {

    private func makeStats() -> UserStats {
        UserStats(
            totalMessages: 128, totalConversations: 14, totalTranslations: 512,
            friendRequestsReceived: 9, languagesUsed: 4, memberDays: 230
        )
    }

    private func statsViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Profile/Views/UserStatsView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - La valeur

    func test_make_withServedStats_servesExactlyMessagesConversationsTranslationsInThatOrder() {
        let cards = UserActivityCards.make(stats: makeStats())

        XCTAssertEqual(cards.map(\.kind), [.messages, .conversations, .translations])
    }

    func test_make_withServedStats_carriesEachServedCountOnItsCard() {
        let cards = UserActivityCards.make(stats: makeStats())

        XCTAssertEqual(cards.map(\.value), [128, 14, 512])
    }

    func test_make_withoutStats_saysZeroOnEachCard_neverAnEstimate() {
        let cards = UserActivityCards.make(stats: nil)

        XCTAssertEqual(cards.map(\.kind), [.messages, .conversations, .translations])
        XCTAssertEqual(cards.map(\.value), [0, 0, 0])
    }

    func test_make_neverServesRequestsLanguagesOrMembership() {
        let served = Set(UserActivityCards.make(stats: makeStats()).map(\.value))

        XCTAssertFalse(served.contains(9), "Un compteur de demandes n'est pas une statistique : il vit dans Mes cercles.")
        XCTAssertFalse(served.contains(4), "Le nombre de langues est déjà la section Langues.")
        XCTAssertFalse(served.contains(230), "L'ancienneté se lit en un mot sous mon nom.")
    }

    func test_make_eachCard_labelsItselfFromItsCatalogKey() {
        let labels = UserActivityCards.make(stats: makeStats()).map(\.label)

        XCTAssertEqual(labels, [
            String(localized: "user.stats.messages", defaultValue: "Messages", bundle: .main),
            String(localized: "user.stats.conversations", defaultValue: "Conversations", bundle: .main),
            String(localized: "user.stats.translations", defaultValue: "Traductions", bundle: .main),
        ])
    }

    func test_make_eachCard_keepsItsIconAndTint() {
        let cards = UserActivityCards.make(stats: makeStats())

        XCTAssertEqual(cards.map(\.icon), ["bubble.left.fill", "person.2.fill", "globe"])
        XCTAssertEqual(cards.map(\.colorHex), [
            MeeshyColors.brandPrimaryHex, MeeshyColors.indigo300Hex, MeeshyColors.indigo600Hex,
        ])
    }

    func test_make_cardIdentity_isItsKind_soAServedCountChangeKeepsTheCard() {
        let before = UserActivityCards.make(stats: nil)
        let after = UserActivityCards.make(stats: makeStats())

        XCTAssertEqual(before.map(\.id), after.map(\.id))
    }

    // MARK: - L'écran

    func test_userStatsView_isTitledMyActivity_andRendersTheCardsFromTheValue() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("\"user.stats.my_activity\""), "Le titre de l'écran devient « Mon activité ».")
        XCTAssertFalse(source.contains("\"user.stats.title\""), "Le titre « Statistiques » est parti.")
        XCTAssertTrue(source.contains("UserActivityCards.make(stats: viewModel.stats)"), "Les cartes viennent de la valeur, jamais d'une liste recopiée.")
    }

    func test_timelineHeader_doesNotRepeatTheScreenTitle_butSaysItsPeriod() throws {
        XCTAssertEqual(UserStatsView.timelineHeader, "30 DERNIERS JOURS")
        XCTAssertFalse(try statsViewSource().contains("\"user.stats.activity\""), "« ACTIVITÉ » répétait le titre « Mon activité ».")
    }

    func test_userStatsView_dropsTheBadgesBlock_whichMyLegendCarries() throws {
        let source = try statsViewSource()

        XCTAssertFalse(source.contains("achievements"), "Les badges vivent à Ma Légende.")
        XCTAssertFalse(source.contains("AchievementBadgeView"))
    }

    func test_userStatsView_noLongerCountsRequestsLanguagesOrMembership() throws {
        let source = try statsViewSource()

        for field in ["friendRequestsReceived", "languagesUsed", "memberDays"] {
            XCTAssertFalse(source.contains(field), "\(field) ne se compte plus sur Mon activité.")
        }
    }

    func test_userStatsView_keepsTheThirtyDayActivityTimeline() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("StatsTimelineChart(timeline: viewModel.timeline"), "La frise d'activité reste.")
        XCTAssertTrue(source.contains("fetchTimeline(days: 30)"), "Le modèle de vue charge toujours les trente derniers jours.")
    }

    // MARK: - La frise a sa propre loi de rafraîchissement

    func test_needsTimelineFetch_withFreshStatsAndMissingTimeline_fetchesTheTimeline() {
        XCTAssertTrue(UserActivityRefreshLaw.needsTimelineFetch(stats: .fresh, timeline: .missing),
                      "La fiche enregistre les compteurs en passant : des compteurs frais ne disent rien de la frise.")
        XCTAssertFalse(UserActivityRefreshLaw.needsStatsFetch(stats: .fresh))
    }

    func test_needsTimelineFetch_withFreshStatsAndStaleTimeline_revalidatesTheTimeline() {
        XCTAssertTrue(UserActivityRefreshLaw.needsTimelineFetch(stats: .fresh, timeline: .stale))
    }

    func test_needsTimelineFetch_withBothFresh_asksNothing() {
        XCTAssertFalse(UserActivityRefreshLaw.needsTimelineFetch(stats: .fresh, timeline: .fresh))
        XCTAssertFalse(UserActivityRefreshLaw.needsStatsFetch(stats: .fresh))
    }

    func test_needsTimelineFetch_whenTheStatsAreRefetched_refetchesTheTimelineWithThem() {
        for stats in [UserActivityRefreshLaw.Freshness.stale, .missing] {
            XCTAssertTrue(UserActivityRefreshLaw.needsStatsFetch(stats: stats), "\(stats)")
            XCTAssertTrue(UserActivityRefreshLaw.needsTimelineFetch(stats: stats, timeline: .fresh), "\(stats)")
        }
    }

    func test_freshness_ofACachedEmptyTimeline_isMissing_soTheTimelineLoads() {
        let empty: CacheResult<[TimelinePoint]> = .fresh([], age: 1)
        let expired: CacheResult<[TimelinePoint]> = .expired

        XCTAssertEqual(UserActivityRefreshLaw.freshness(of: empty), .missing)
        XCTAssertEqual(UserActivityRefreshLaw.freshness(of: expired), .missing)
        XCTAssertEqual(UserActivityRefreshLaw.freshness(of: CacheResult<[UserStats]>.stale([makeStats()], age: 1)), .stale)
        XCTAssertEqual(UserActivityRefreshLaw.freshness(of: CacheResult<[UserStats]>.fresh([makeStats()], age: 1)), .fresh)
    }

    func test_userStatsView_loadsTheTimelineByItsOwnLaw() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("UserActivityRefreshLaw.needsTimelineFetch("), "La frise ne dépend plus du seul cache des compteurs.")
    }

    // MARK: - Le nombre se lit sur sa carte

    func test_valueHex_conversationsInLightMode_takesTheDarkerIndigo_whileTheCardKeepsItsTint() {
        let conversations = UserActivityCards.make(stats: makeStats())[1]

        XCTAssertEqual(conversations.valueHex(isDark: false), MeeshyColors.indigo600Hex)
        XCTAssertEqual(conversations.colorHex, MeeshyColors.indigo300Hex)
        XCTAssertEqual(conversations.valueHex(isDark: true), MeeshyColors.indigo300Hex)
    }

    func test_valueHex_conversationsNumber_readsAtLeast4_5To1OnItsLightCard() {
        let conversations = UserActivityCards.make(stats: makeStats())[1]
        let card = Self.tinted(conversations.colorHex, opacity: 0.08, over: "FFFFFF")

        XCTAssertGreaterThanOrEqual(Self.contrast(conversations.valueHex(isDark: false), card), 4.5)
    }

    func test_valueHex_translationsNumber_readsAtLeast4_5To1OnItsDarkCard() {
        let translations = UserActivityCards.make(stats: makeStats())[2]
        let card = Self.tinted(translations.colorHex, opacity: 0.15, over: "09090B")

        XCTAssertGreaterThanOrEqual(Self.contrast(translations.valueHex(isDark: true), card), 4.5)
    }

    func test_statsScreenAndProfileBand_paintTheNumberWithItsInk() throws {
        XCTAssertTrue(try statsViewSource().contains("card.valueHex(isDark: theme.mode.isDark)"))
        let band = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Profile/Views/ProfileActivityBand.swift"), encoding: .utf8)
        XCTAssertTrue(band.contains("item.valueHex(isDark: theme.mode.isDark)"))
    }

    // MARK: - L'erreur et la frise paraissent en fondu

    func test_userStatsView_errorAndTimeline_appearThroughATransition() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("reduced: MeeshyMotion.reducedFade, value: viewModel.errorMessage)"))
        XCTAssertTrue(source.contains("reduced: MeeshyMotion.reducedFade, value: viewModel.timeline.isEmpty)"))
        XCTAssertTrue(source.contains("timelineChart\n                    .meeshyTransition(.opacity)"))
    }

    // MARK: - Contraste WCAG

    private static func channels(_ hex: String) -> [Double] {
        stride(from: 0, to: 6, by: 2).map { offset in
            let start = hex.index(hex.startIndex, offsetBy: offset)
            return Double(Int(hex[start..<hex.index(start, offsetBy: 2)], radix: 16) ?? 0) / 255
        }
    }

    private static func tinted(_ tint: String, opacity: Double, over background: String) -> String {
        let pairs: [(Double, Double)] = Array(zip(channels(tint), channels(background)))
        let blended: [String] = pairs.map { (front: Double, back: Double) -> String in
            let mixed: Double = front * opacity + back * (1 - opacity)
            return String(format: "%02X", Int((mixed * 255).rounded()))
        }
        return blended.joined()
    }

    private static func luminance(_ hex: String) -> Double {
        let linear: [Double] = channels(hex).map { (channel: Double) -> Double in
            if channel <= 0.03928 { return channel / 12.92 }
            return pow((channel + 0.055) / 1.055, 2.4)
        }
        let red: Double = 0.2126 * linear[0]
        let green: Double = 0.7152 * linear[1]
        let blue: Double = 0.0722 * linear[2]
        return red + green + blue
    }

    private static func contrast(_ first: String, _ second: String) -> Double {
        let (light, dark) = (max(luminance(first), luminance(second)), min(luminance(first), luminance(second)))
        return (light + 0.05) / (dark + 0.05)
    }
}
