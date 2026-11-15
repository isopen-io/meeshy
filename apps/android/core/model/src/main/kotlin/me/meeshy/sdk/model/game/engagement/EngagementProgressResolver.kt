package me.meeshy.sdk.model.game.engagement

import java.time.Instant

/**
 * LA LOI DE PROGRESSION — MIROIR de `resolveEngagementProgress` (`packages/shared/utils/engagement-progress.ts`)
 * et de `EngagementProgressResolver.swift`, rejouée sur le MÊME fichier de vecteurs. En cas d'écart, le
 * TypeScript fait foi.
 *
 * Deux sources, deux questions : le COMPTEUR dit ce qui a été fait (un palier est atteint dès que la valeur le
 * dépasse) ; le PALIER GRAVÉ dit QUAND il a été servi, et suffit seul à le tenir pour atteint (anti-rejeu).
 * Un axe inconnu, une clé hors catalogue : ignorés. Une valeur négative vaut 0.
 */
public object EngagementProgressResolver {

    private const val ELAN_MAX_FACTOR: Double = 5.0

    public fun resolve(payload: ApiEngagementProgress): EngagementProgress {
        val served = indexServed(payload)
        val counts = indexCounts(payload)
        fun servedAt(type: EngagementMilestoneType, key: String): String? = served["${type.wire}|$key"]

        val axes = EngagementAxisKey.entries.map { axis ->
            val count = counts[axis] ?: 0
            EngagementAxisProgress(
                axis,
                resolveScale(count, count, EngagementCatalog.badgeThresholds) {
                    servedAt(EngagementMilestoneType.BADGE, EngagementCatalog.badgeMilestoneKey(axis, it))
                },
            )
        }

        val score = safeCount(payload.level.engagementScore)
        val levelScale = resolveScale(score, score, EngagementCatalog.levelThresholds) {
            servedAt(EngagementMilestoneType.LEVEL, EngagementCatalog.levelMilestoneKey(it))
        }

        val currentDays = safeCount(payload.streak.currentStreakDays)
        val longestDays = maxOf(safeCount(payload.streak.longestStreakDays), currentDays)
        val streakScale = resolveScale(currentDays, longestDays, EngagementCatalog.streakThresholds) {
            servedAt(EngagementMilestoneType.STREAK, EngagementCatalog.streakMilestoneKey(it))
        }

        val achievements = EngagementAchievementKey.entries.map { key ->
            val reachedAt = servedAt(EngagementMilestoneType.ACHIEVEMENT, key.wire)
            EngagementAchievementProgress(key, unlocked = reachedAt != null, reachedAt = reachedAt)
        }

        val badgesEarned = axes.sumOf { it.scale.reachedCount }
        val hasActivity = axes.any { it.scale.value > 0 } ||
            score > 0 ||
            longestDays > 0 ||
            badgesEarned > 0 ||
            levelScale.reachedCount > 0 ||
            streakScale.reachedCount > 0 ||
            achievements.any { it.unlocked }

        return EngagementProgress(
            level = EngagementLevelProgress(levelScale),
            streak = EngagementStreakProgress(streakScale, currentDays, longestDays),
            axes = axes,
            achievements = achievements,
            badgesEarned = badgesEarned,
            badgesTotal = EngagementAxisKey.entries.size * EngagementCatalog.badgeThresholds.size,
            isEmpty = !hasActivity,
            meesh = payload.meesh?.let(::resolveMeesh),
            elan = payload.elan?.let(::resolveElan),
            // Le catalogue est LOCAL : il ne dépend pas de sa mesure (#5916).
            achievementSections = AchievementResolver.sections(
                reach = payload.achievementReach.orEmpty(),
                unlocked = payload.milestones
                    .filter { it.milestoneType == EngagementMilestoneType.ACHIEVEMENT }
                    .fold(LinkedHashMap<String, String?>()) { acc, m ->
                        if (!acc.containsKey(m.milestoneKey)) acc[m.milestoneKey] = m.reachedAt
                        acc
                    },
            ),
        )
    }

    /** Une date ISO 8601 (avec ou sans fraction) lisible, sinon `null` — le repli n'invente jamais l'instant présent. */
    public fun reachedEpochMillis(iso: String?): Long? {
        if (iso == null) return null
        return try {
            Instant.parse(iso).toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }

    private fun safeCount(value: Int): Int = value.coerceAtLeast(0)

    /** `reachedAt` du premier palier gravé par (nature, clé). */
    private fun indexServed(payload: ApiEngagementProgress): Map<String, String> {
        val index = LinkedHashMap<String, String>()
        payload.milestones.forEach { index.putIfAbsent("${it.milestoneType.wire}|${it.milestoneKey}", it.reachedAt) }
        return index
    }

    /** La valeur RETENUE par axe : la plus haute si la charge en portait deux. */
    private fun indexCounts(payload: ApiEngagementProgress): Map<EngagementAxisKey, Int> {
        val index = HashMap<EngagementAxisKey, Int>()
        payload.counters.forEach { counter ->
            val axis = EngagementAxisKey.fromWire(counter.axisKey) ?: return@forEach
            index[axis] = maxOf(index[axis] ?: 0, safeCount(counter.count))
        }
        return index
    }

    private fun resolveScale(
        value: Int,
        reachedValue: Int,
        thresholds: List<Int>,
        reachedAtOf: (Int) -> String?,
    ): EngagementScaleProgress {
        val tiers = thresholds.map { threshold ->
            val reachedAt = reachedAtOf(threshold)
            EngagementTier(threshold, reached = reachedValue >= threshold || reachedAt != null, reachedAt = reachedAt)
        }
        val previous = thresholds.lastOrNull { it <= value } ?: 0
        val next = thresholds.firstOrNull { it > value }
        val progress = if (next == null) 1.0 else ((value - previous).toDouble() / (next - previous)).coerceIn(0.0, 1.0)
        return EngagementScaleProgress(value, tiers, tiers.count { it.reached }, previous, next, progress)
    }

    private fun resolveElan(elan: ApiEngagementProgress.Elan): EngagementElanProgress {
        // Borné à [1, 5] ici AUSSI : le plafond est une règle de produit, pas une convention de sérialisation.
        val factor = if (elan.factor.isFinite()) elan.factor.coerceIn(1.0, ELAN_MAX_FACTOR) else 1.0
        return EngagementElanProgress(
            factor = factor,
            activeFamilyCount = safeCount(elan.activeFamilyCount),
            hasStanding = elan.hasStanding,
            windowDays = safeCount(elan.windowDays),
            isAccelerated = factor > 1.0,
            activeFamilies = elan.activeFamilies.orEmpty().mapNotNull(EngagementAxisFamily::fromWire).distinct(),
        )
    }

    private fun resolveMeesh(meesh: ApiEngagementProgress.Meesh): EngagementMeeshProgress {
        val cost = safeCount(meesh.mintCost)
        val debitable = safeCount(meesh.debitablePoints)
        return EngagementMeeshProgress(
            balance = safeCount(meesh.balance),
            mintedLifetime = safeCount(meesh.mintedLifetime),
            debitablePoints = debitable,
            floorPoints = safeCount(meesh.floorPoints),
            missingPoints = safeCount(meesh.missingPoints),
            mintCost = cost,
            canMint = cost > 0 && debitable >= cost,
            progress = if (cost == 0) 0.0 else (debitable.toDouble() / cost).coerceIn(0.0, 1.0),
            firstMintedAt = meesh.firstMintedAt?.takeIf { reachedEpochMillis(it) != null },
            lastMintedAt = meesh.lastMintedAt?.takeIf { reachedEpochMillis(it) != null },
        )
    }
}
