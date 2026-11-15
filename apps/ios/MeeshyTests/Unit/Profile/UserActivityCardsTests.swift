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
}
