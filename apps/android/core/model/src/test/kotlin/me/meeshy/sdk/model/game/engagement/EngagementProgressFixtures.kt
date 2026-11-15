package me.meeshy.sdk.model.game.engagement

import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress.Counter
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress.Elan
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress.Meesh
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress.Milestone

internal fun payload(
    counters: List<Counter> = emptyList(),
    milestones: List<Milestone> = emptyList(),
    current: Int = 0,
    longest: Int = 0,
    score: Int = 0,
    meesh: Meesh? = null,
    elan: Elan? = null,
    reach: Map<String, Int>? = null,
): ApiEngagementProgress = ApiEngagementProgress(
    counters = counters,
    milestones = milestones,
    streak = ApiEngagementProgress.Streak(current, longest),
    level = ApiEngagementProgress.Level(engagementScore = score),
    meesh = meesh,
    elan = elan,
    achievementReach = reach,
)

internal fun count(axis: String, value: Int) = Counter(axis, value)

internal fun milestone(type: EngagementMilestoneType, key: String, at: String = "2026-09-01T08:00:00.000Z") =
    Milestone(type, key, at)

internal fun meesh(debitable: Int, cost: Int, first: String? = null, last: String? = null) = Meesh(
    balance = 2, mintedLifetime = 3, debitablePoints = debitable, floorPoints = 10,
    missingPoints = (cost - debitable).coerceAtLeast(0), mintCost = cost, firstMintedAt = first, lastMintedAt = last,
)

internal fun elan(factor: Double, families: List<String>? = null) =
    Elan(factor = factor, activeFamilyCount = 2, hasStanding = true, windowDays = 7, activeFamilies = families)
