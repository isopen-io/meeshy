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
        XCTAssertTrue(source.contains("ProfileActivityBand.figures(of: viewModel.stats"), "Les chiffres viennent des cartes de Mon activité, comme sur ma fiche, jamais d'une liste recopiée.")
    }

    func test_timelineHeader_doesNotRepeatTheScreenTitle_butSaysItsPeriod() throws {
        XCTAssertEqual(UserStatsView.timelineHeader, Bundle.main.localizedString(forKey: "user.stats.last_30_days", value: nil, table: nil))
        XCTAssertTrue(UserStatsView.timelineHeader.contains("30"), "la période se lit dans toutes les langues")
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

    // MARK: - L'écran est fait du kit (#19635, loi 12)

    func test_userStatsView_drawsNoCardOnTheSpot_butTheKitFigureBandInAGroupCard() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("MeeshyFigureBand("), "les trois compteurs sont la bande de chiffres K34")
        XCTAssertTrue(source.contains("MeeshyGroupCard("), "la carte qui les porte est celle du kit K43")
        for handDrawn in ["statCard(", "RoundedRectangle(", "surfaceGradient(", "valueHex("] {
            XCTAssertFalse(source.contains(handDrawn), "\(handDrawn) redessinait une carte sur place")
        }
        XCTAssertFalse(source.contains("import Charts"), "la frise est le graphique K50, jamais Swift Charts")
    }

    func test_userStatsView_failure_isTheKitStateBlock_withRetry() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("MeeshyStateBlock(kind: failure.isOffline ? .offline : .error"), "l'échec est le bloc d'état K38")
        XCTAssertTrue(source.contains("ProfilePublicationsCopy.retry"), "une erreur a toujours « Réessayer » (loi 8)")
        XCTAssertTrue(source.contains("await viewModel.retry()"), "« Réessayer » relance le chargement")
        XCTAssertFalse(source.contains("errorBanner"), "plus de bandeau d'erreur sans sortie")
    }

    func test_retry_rereadsTheServer_whateverTheCacheSays() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains("await load(force: true)"))
        XCTAssertTrue(source.contains("let fetchesStats = force || UserActivityRefreshLaw.needsStatsFetch("))
        XCTAssertTrue(source.contains("let fetchesTimeline = force || UserActivityRefreshLaw.needsTimelineFetch("))
    }

    // MARK: - Le squelette ne tient que la place de ce qui manque (loi 8)

    func test_figuresAreLoading_onlyWhileNothingIsServedAndTheLoadRuns() {
        XCTAssertTrue(UserActivityScreenPlan.figuresAreLoading(hasStats: false, hasSettled: false))
        XCTAssertFalse(UserActivityScreenPlan.figuresAreLoading(hasStats: true, hasSettled: false),
                       "un cache non vide se peint : jamais de squelette par-dessus")
        XCTAssertFalse(UserActivityScreenPlan.figuresAreLoading(hasStats: false, hasSettled: true),
                       "le chargement fini, le tiret du kit dit l'absence — jamais trois zéros")
    }

    func test_timeline_isASeriesAsSoonAsADayIsServed_evenAfterAFailure() {
        XCTAssertEqual(UserActivityScreenPlan.timeline(pointCount: 30, hasSettled: false, failed: false), .series)
        XCTAssertEqual(UserActivityScreenPlan.timeline(pointCount: 30, hasSettled: true, failed: true), .series,
                       "un échec ne retire pas la frise déjà affichée")
    }

    func test_timeline_withoutAnyDay_isASkeletonWhileLoading_thenItsEmptyPhrase_orHiddenBehindTheFailure() {
        XCTAssertEqual(UserActivityScreenPlan.timeline(pointCount: 0, hasSettled: false, failed: false), .skeleton)
        XCTAssertEqual(UserActivityScreenPlan.timeline(pointCount: 0, hasSettled: true, failed: false), .empty)
        XCTAssertEqual(UserActivityScreenPlan.timeline(pointCount: 0, hasSettled: true, failed: true), .hidden,
                       "le bloc d'échec dit déjà qu'elle manque")
    }

    func test_failure_isNilOnSuccess_andKeepsWhatIsShownOnFailure() {
        XCTAssertNil(UserActivityScreenPlan.failure(failed: false, isOffline: true, hasContent: true))
        let overContent = UserActivityScreenPlan.failure(failed: true, isOffline: false, hasContent: true)
        XCTAssertEqual(overContent, UserActivityScreenPlan.Failure(isOffline: false, keepsContent: true))
        let offline = UserActivityScreenPlan.failure(failed: true, isOffline: true, hasContent: false)
        XCTAssertEqual(offline, UserActivityScreenPlan.Failure(isOffline: true, keepsContent: false))
    }

    func test_failureTitle_saysUnavailableWhenNothingIsShown_andNotUpdatedOverContent() {
        let offlineEmpty = UserActivityScreenPlan.Failure(isOffline: true, keepsContent: false)
        let failedEmpty = UserActivityScreenPlan.Failure(isOffline: false, keepsContent: false)
        let overContent = UserActivityScreenPlan.Failure(isOffline: false, keepsContent: true)

        XCTAssertEqual(UserStatsView.failureTitle(offlineEmpty), ProfileActivityBand.unavailableTitle(offline: true))
        XCTAssertEqual(UserStatsView.failureTitle(failedEmpty), ProfileActivityBand.unavailableTitle(offline: false))
        XCTAssertEqual(UserStatsView.failureTitle(overContent),
                       Bundle.main.localizedString(forKey: "user.stats.refresh_failed", value: nil, table: nil))
        XCTAssertNotEqual(UserStatsView.failureTitle(overContent), UserStatsView.failureTitle(failedEmpty),
                          "ce qu'on lit reste : il n'est pas « indisponible »")
    }

    // MARK: - L'échec et la frise paraissent en fondu

    func test_userStatsView_failureAndTimeline_appearThroughATransition() throws {
        let source = try statsViewSource()

        XCTAssertTrue(source.contains(".meeshyMotion(.rise, value: viewModel.failure)"))
        XCTAssertTrue(source.contains(".meeshyMotion(.rise, value: viewModel.timeline.isEmpty)"))
        XCTAssertTrue(source.contains("failureBlock(failure)\n                    .meeshyTransition(.move(edge: .top).combined(with: .opacity))"))
    }
}
