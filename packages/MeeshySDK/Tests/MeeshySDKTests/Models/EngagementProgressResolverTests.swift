import XCTest
@testable import MeeshySDK

/// La loi de progression (#5698) — ce que l'écran « Progression » DÉRIVE de
/// `GET /me/engagement` avant de peindre. Les cas de bout en bout vivent dans
/// le fichier de vecteurs partagé, rejoué par `EngagementProgressVectorTests`
/// (cible app) ; ce fichier tient les COMPORTEMENTS un par un, là où un
/// vecteur ne dirait qu'un chiffre — miroir de `engagement-progress.test.ts`.
final class EngagementProgressResolverTests: XCTestCase {

    private func makePayload(
        counters: [APIEngagementProgress.Counter] = [],
        milestones: [APIEngagementProgress.Milestone] = [],
        streak: APIEngagementProgress.Streak = .init(currentStreakDays: 0, longestStreakDays: 0),
        score: Int = 0
    ) -> APIEngagementProgress {
        APIEngagementProgress(counters: counters, milestones: milestones, streak: streak, level: .init(engagementScore: score))
    }

    private func axis(_ progress: EngagementProgress, _ key: EngagementAxisKey) -> EngagementAxisProgress {
        progress.axes.first { $0.axis == key }!
    }

    // MARK: - État vide

    func test_resolve_emptyPayload_isEmptyAndPointsFirstThresholds() {
        let progress = EngagementProgressResolver.resolve(.empty)

        XCTAssertTrue(progress.isEmpty)
        XCTAssertEqual(progress.axes.map(\.axis), EngagementAxisKey.allCases)
        XCTAssertEqual(progress.achievements.map(\.key), EngagementAchievementKey.allCases)
        XCTAssertTrue(progress.achievements.allSatisfy { !$0.unlocked && $0.reachedAt == nil })
        XCTAssertEqual(progress.badgesEarned, 0)
        XCTAssertEqual(progress.badgesTotal, 65)
        XCTAssertEqual(progress.level.level, 0)
        XCTAssertEqual(progress.level.scale.nextThreshold, 10)
        XCTAssertEqual(progress.streak.scale.nextThreshold, 3)
        XCTAssertEqual(progress.level.scale.progress, 0)
    }

    // MARK: - Badges par axe

    func test_resolve_counterAboveThresholds_reachesThemAndMeasuresFromLastOne() {
        let progress = EngagementProgressResolver.resolve(makePayload(counters: [.init(axisKey: "content.text_message", count: 12)]))
        let messages = axis(progress, .textMessage).scale

        XCTAssertEqual(messages.tiers.map(\.reached), [true, true, false, false, false])
        XCTAssertEqual(messages.reachedCount, 2)
        XCTAssertEqual(messages.previousThreshold, 10)
        XCTAssertEqual(messages.nextThreshold, 50)
        // 2 pas sur 40 depuis le palier 10 — pas 12 sur 50 depuis zéro.
        XCTAssertEqual(messages.progress, 0.05, accuracy: 0.0001)
        XCTAssertEqual(messages.remainingToNext, 38)
        XCTAssertEqual(progress.badgesEarned, 2)
        XCTAssertFalse(progress.isEmpty)
    }

    func test_resolve_servedMilestone_carriesItsDate_counterOnlyTierHasNone() {
        let progress = EngagementProgressResolver.resolve(makePayload(
            counters: [.init(axisKey: "content.post", count: 11)],
            milestones: [.init(milestoneType: .badge, milestoneKey: "content.post:1", reachedAt: "2026-09-01T10:00:00.000Z")]
        ))
        let posts = axis(progress, .post).scale

        XCTAssertEqual(posts.tiers[0], EngagementTier(threshold: 1, reached: true, reachedAt: "2026-09-01T10:00:00.000Z"))
        XCTAssertEqual(posts.tiers[1], EngagementTier(threshold: 10, reached: true, reachedAt: nil))
    }

    func test_resolve_servedMilestoneWithoutCounter_staysReached() {
        // Anti-rejeu (§ 4) : un compteur recalculé ne reprend jamais un badge servi.
        let progress = EngagementProgressResolver.resolve(makePayload(
            milestones: [.init(milestoneType: .badge, milestoneKey: "content.reel:10", reachedAt: "2026-08-30T00:00:00.000Z")]
        ))
        let reels = axis(progress, .reel).scale

        XCTAssertTrue(reels.tiers[1].reached)
        XCTAssertEqual(reels.value, 0)
        XCTAssertEqual(progress.badgesEarned, 1)
        XCTAssertFalse(progress.isEmpty)
    }

    func test_resolve_completeScale_hasNoNextThresholdAndIsFull() {
        let progress = EngagementProgressResolver.resolve(makePayload(counters: [.init(axisKey: "tool.sticker", count: 500)]))
        let stickers = axis(progress, .sticker).scale

        XCTAssertEqual(stickers.reachedCount, 5)
        XCTAssertNil(stickers.nextThreshold)
        XCTAssertNil(stickers.remainingToNext)
        XCTAssertEqual(stickers.progress, 1)
    }

    func test_resolve_unknownAxisAndForeignMilestone_areIgnored() {
        let progress = EngagementProgressResolver.resolve(makePayload(
            counters: [.init(axisKey: "content.future", count: 99)],
            milestones: [
                .init(milestoneType: .badge, milestoneKey: "content.future:10", reachedAt: "2026-09-01T00:00:00.000Z"),
                .init(milestoneType: .badge, milestoneKey: "content.post:7", reachedAt: "2026-09-01T00:00:00.000Z"),
            ]
        ))

        XCTAssertTrue(progress.isEmpty)
        XCTAssertEqual(progress.axes.count, EngagementAxisKey.allCases.count)
    }

    func test_resolve_negativeCounter_countsAsZero() {
        let progress = EngagementProgressResolver.resolve(makePayload(counters: [.init(axisKey: "content.post", count: -5)]))
        XCTAssertEqual(axis(progress, .post).scale.value, 0)
        XCTAssertTrue(progress.isEmpty)
    }

    func test_axesByFamily_keepsModelOrderAndCatalogueOrder() {
        let groups = EngagementProgressResolver.resolve(.empty).axesByFamily

        XCTAssertEqual(groups.map(\.family), EngagementAxisFamily.allCases)
        XCTAssertEqual(groups.flatMap { $0.axes.map(\.axis) }, EngagementAxisKey.allCases)
        XCTAssertEqual(groups.map { $0.axes.count }, [5, 2, 3, 3])
    }

    // MARK: - Niveau et série

    func test_resolve_level_countsCrossedScoreThresholds() {
        let progress = EngagementProgressResolver.resolve(makePayload(
            milestones: [.init(milestoneType: .level, milestoneKey: "level:150", reachedAt: "2026-09-02T00:00:00.000Z")],
            score: 160
        ))

        XCTAssertEqual(progress.level.level, 3)
        XCTAssertEqual(progress.level.scale.previousThreshold, 150)
        XCTAssertEqual(progress.level.scale.nextThreshold, 400)
        XCTAssertEqual(progress.level.scale.progress, 10.0 / 250.0, accuracy: 0.0001)
        XCTAssertEqual(progress.level.scale.tiers[2].reachedAt, "2026-09-02T00:00:00.000Z")
        XCTAssertNil(progress.level.scale.tiers[1].reachedAt)
    }

    func test_resolve_streak_currentAdvancesToNextMilestone_recordHoldsReachedOnes() {
        let progress = EngagementProgressResolver.resolve(makePayload(
            milestones: [.init(milestoneType: .streak, milestoneKey: "streak:7", reachedAt: "2026-08-20T00:00:00.000Z")],
            streak: .init(currentStreakDays: 8, longestStreakDays: 20)
        ))

        XCTAssertEqual(progress.streak.currentDays, 8)
        XCTAssertEqual(progress.streak.longestDays, 20)
        XCTAssertEqual(progress.streak.scale.reachedCount, 3)
        XCTAssertEqual(progress.streak.scale.previousThreshold, 7)
        XCTAssertEqual(progress.streak.scale.nextThreshold, 14)
        XCTAssertEqual(progress.streak.scale.progress, 1.0 / 7.0, accuracy: 0.0001)
        XCTAssertEqual(progress.streak.scale.tiers.map(\.reached), [true, true, true, false, false, false])
        XCTAssertEqual(progress.streak.scale.tiers[1].reachedAt, "2026-08-20T00:00:00.000Z")
    }

    func test_resolve_recordBelowCurrentStreak_isLiftedToIt() {
        let progress = EngagementProgressResolver.resolve(makePayload(streak: .init(currentStreakDays: 5, longestStreakDays: 2)))
        XCTAssertEqual(progress.streak.longestDays, 5)
        XCTAssertEqual(progress.streak.scale.reachedCount, 1)
    }

    func test_resolve_servedAchievement_isUnlockedWithItsDate() {
        let progress = EngagementProgressResolver.resolve(makePayload(
            milestones: [.init(milestoneType: .achievement, milestoneKey: "achievement.first_voice", reachedAt: "2026-09-03T12:00:00.000Z")]
        ))

        let voice = progress.achievements.first { $0.key == .firstVoice }
        XCTAssertEqual(voice, EngagementAchievementProgress(key: .firstVoice, unlocked: true, reachedAt: "2026-09-03T12:00:00.000Z"))
        XCTAssertEqual(progress.unlockedAchievementCount, 1)
        XCTAssertFalse(progress.isEmpty)
    }

    // MARK: - Dates

    func test_reachedDate_parsesBothIsoForms_andNeverInventsOne() {
        XCTAssertNotNil(EngagementProgressResolver.reachedDate("2026-09-03T12:00:00.000Z"))
        XCTAssertNotNil(EngagementProgressResolver.reachedDate("2026-09-03T12:00:00Z"))
        XCTAssertNil(EngagementProgressResolver.reachedDate("pas une date"))
        XCTAssertNil(EngagementProgressResolver.reachedDate(nil))
    }

    // MARK: - Catalogue

    func test_catalogue_familyIsTheKeyPrefix() {
        for axis in EngagementAxisKey.allCases {
            XCTAssertTrue(axis.rawValue.hasPrefix("\(axis.family.rawValue)."), "\(axis) n'est pas préfixé par sa famille")
        }
        XCTAssertEqual(EngagementCatalog.badgeMilestoneKey(.audioMessage, threshold: 10), "content.audio_message:10")
        XCTAssertEqual(EngagementCatalog.streakMilestoneKey(threshold: 7), "streak:7")
        XCTAssertEqual(EngagementCatalog.levelMilestoneKey(threshold: 150), "level:150")
    }
}
