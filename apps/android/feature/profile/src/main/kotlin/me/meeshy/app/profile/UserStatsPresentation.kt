package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.UserStats
import kotlin.math.roundToInt

/** Which activity metric a [StatTile] reports. Fixed dashboard order. */
enum class StatMetric { MESSAGES, CONVERSATIONS, TRANSLATIONS, FRIEND_REQUESTS, LANGUAGES, MEMBER_DAYS }

/**
 * One activity-count card on the stats dashboard — the raw (clamped) value plus
 * its compact, human-readable label. Port of a tile in the iOS `UserStatsView`
 * counters grid.
 */
@Immutable
data class StatTile(
    val metric: StatMetric,
    val value: Int,
    val formattedValue: String,
)

/**
 * A normalized achievement badge — every server-provided value defensively
 * reconciled so a malformed payload can never mis-render (progress clamped into
 * `0..100`, negative counts floored, [isUnlocked] recomputed from
 * `current >= threshold` when a threshold exists). Port of the iOS `Achievement`
 * as consumed by `UserStatsView`.
 */
@Immutable
data class AchievementBadge(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val color: String,
    val isUnlocked: Boolean,
    val progressPercent: Int,
    val threshold: Int,
    val current: Int,
)

/**
 * The whole stats dashboard projected for rendering — the ordered counter tiles,
 * the ranked achievement badges and the unlocked summary. Pure data so the
 * Compose layer stays dumb and every derivation is unit-testable.
 */
@Immutable
data class UserStatsPresentation(
    val tiles: List<StatTile>,
    val badges: List<AchievementBadge>,
    val unlockedCount: Int,
    val totalCount: Int,
)

/**
 * Projects a raw [UserStats] into a [UserStatsPresentation]. The SSOT the stats
 * dashboard renders — the Android analogue of the iOS `UserStatsViewModel`
 * projection. Pure and deterministic (no clock, no I/O).
 */
object UserStatsBuilder {

    fun build(stats: UserStats): UserStatsPresentation {
        val badges = stats.achievements
            .map { achievement ->
                val current = achievement.current.coerceAtLeast(0)
                val threshold = achievement.threshold.coerceAtLeast(0)
                AchievementBadge(
                    id = achievement.id,
                    name = achievement.name,
                    description = achievement.description,
                    icon = achievement.icon,
                    color = achievement.color,
                    isUnlocked = if (threshold > 0) current >= threshold else achievement.isUnlocked,
                    progressPercent = (achievement.progress.coerceIn(0.0, 1.0) * 100).roundToInt(),
                    threshold = threshold,
                    current = current,
                )
            }
            .sortedWith(
                compareByDescending<AchievementBadge> { it.isUnlocked }
                    .thenByDescending { it.progressPercent }
                    .thenByDescending { it.current }
                    .thenBy { it.id },
            )

        return UserStatsPresentation(
            tiles = listOf(
                tile(StatMetric.MESSAGES, stats.totalMessages),
                tile(StatMetric.CONVERSATIONS, stats.totalConversations),
                tile(StatMetric.TRANSLATIONS, stats.totalTranslations),
                tile(StatMetric.FRIEND_REQUESTS, stats.friendRequestsReceived),
                tile(StatMetric.LANGUAGES, stats.languagesUsed),
                tile(StatMetric.MEMBER_DAYS, stats.memberDays),
            ),
            badges = badges,
            unlockedCount = badges.count { it.isUnlocked },
            totalCount = badges.size,
        )
    }

    private fun tile(metric: StatMetric, rawValue: Int): StatTile {
        val value = rawValue.coerceAtLeast(0)
        return StatTile(metric = metric, value = value, formattedValue = formatCompactCount(value))
    }
}

/**
 * A compact, boundary-safe count label: `0..999` verbatim, then `K`/`M`/`B`
 * tiers with a single decimal. The tier thresholds are the pre-rounding
 * magnitudes (`999_950`, `999_950_000`) so a value just below a tier can never
 * render as `1000.0K`/`1000.0M` — it rolls over to `1M`/`1B` instead. A trailing
 * `.0` is dropped (`1K`, not `1.0K`). Negative input is floored to `0`.
 */
fun formatCompactCount(count: Int): String {
    val n = count.coerceAtLeast(0)
    return when {
        n < 1_000 -> n.toString()
        n < 999_950 -> withSuffix(n / 1_000.0, "K")
        n < 999_950_000 -> withSuffix(n / 1_000_000.0, "M")
        else -> withSuffix(n / 1_000_000_000.0, "B")
    }
}

private fun withSuffix(value: Double, suffix: String): String {
    val rounded = (value * 10).roundToInt() / 10.0
    val mantissa = if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
    return "$mantissa$suffix"
}
