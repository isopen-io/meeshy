package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.UserStats
import java.util.Locale
import kotlin.math.roundToInt
import me.meeshy.sdk.model.format.CompactCountFormat

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

    fun build(stats: UserStats, locale: Locale = Locale.getDefault()): UserStatsPresentation {
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
                tile(StatMetric.MESSAGES, stats.totalMessages, locale),
                tile(StatMetric.CONVERSATIONS, stats.totalConversations, locale),
                tile(StatMetric.TRANSLATIONS, stats.totalTranslations, locale),
                tile(StatMetric.FRIEND_REQUESTS, stats.friendRequestsReceived, locale),
                tile(StatMetric.LANGUAGES, stats.languagesUsed, locale),
                tile(StatMetric.MEMBER_DAYS, stats.memberDays, locale),
            ),
            badges = badges,
            unlockedCount = badges.count { it.isUnlocked },
            totalCount = badges.size,
        )
    }

    private fun tile(metric: StatMetric, rawValue: Int, locale: Locale): StatTile {
        val value = rawValue.coerceAtLeast(0)
        return StatTile(metric = metric, value = value, formattedValue = CompactCountFormat.text(value, locale))
    }
}
