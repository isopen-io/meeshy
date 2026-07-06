package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.Achievement
import me.meeshy.sdk.model.UserStats
import org.junit.Test

class UserStatsBuilderTest {

    private fun achievement(
        id: String,
        isUnlocked: Boolean = false,
        progress: Double = 0.0,
        threshold: Int = 0,
        current: Int = 0,
    ) = Achievement(
        id = id,
        name = id.replaceFirstChar { it.uppercase() },
        description = "desc-$id",
        icon = "icon-$id",
        color = "#000000",
        isUnlocked = isUnlocked,
        progress = progress,
        threshold = threshold,
        current = current,
    )

    // ---- tiles ------------------------------------------------------------

    @Test
    fun `tiles are emitted in the fixed dashboard order`() {
        val tiles = UserStatsBuilder.build(UserStats()).tiles
        assertThat(tiles.map { it.metric }).containsExactly(
            StatMetric.MESSAGES,
            StatMetric.CONVERSATIONS,
            StatMetric.TRANSLATIONS,
            StatMetric.FRIEND_REQUESTS,
            StatMetric.LANGUAGES,
            StatMetric.MEMBER_DAYS,
        ).inOrder()
    }

    @Test
    fun `each tile carries its matching raw value`() {
        val stats = UserStats(
            totalMessages = 12,
            totalConversations = 3,
            totalTranslations = 7,
            friendRequestsReceived = 4,
            languagesUsed = 2,
            memberDays = 99,
        )
        val byMetric = UserStatsBuilder.build(stats).tiles.associate { it.metric to it.value }
        assertThat(byMetric[StatMetric.MESSAGES]).isEqualTo(12)
        assertThat(byMetric[StatMetric.CONVERSATIONS]).isEqualTo(3)
        assertThat(byMetric[StatMetric.TRANSLATIONS]).isEqualTo(7)
        assertThat(byMetric[StatMetric.FRIEND_REQUESTS]).isEqualTo(4)
        assertThat(byMetric[StatMetric.LANGUAGES]).isEqualTo(2)
        assertThat(byMetric[StatMetric.MEMBER_DAYS]).isEqualTo(99)
    }

    @Test
    fun `a negative server count is floored to zero`() {
        val stats = UserStats(totalMessages = -5)
        val tile = UserStatsBuilder.build(stats).tiles.first { it.metric == StatMetric.MESSAGES }
        assertThat(tile.value).isEqualTo(0)
        assertThat(tile.formattedValue).isEqualTo("0")
    }

    @Test
    fun `empty stats yield all-zero tiles and no badges`() {
        val presentation = UserStatsBuilder.build(UserStats())
        assertThat(presentation.tiles.map { it.formattedValue }).containsExactly("0", "0", "0", "0", "0", "0")
        assertThat(presentation.badges).isEmpty()
        assertThat(presentation.unlockedCount).isEqualTo(0)
        assertThat(presentation.totalCount).isEqualTo(0)
    }

    // ---- badge normalization ---------------------------------------------

    @Test
    fun `progress is clamped into 0 to 100 percent`() {
        val stats = UserStats(
            achievements = listOf(
                achievement("over", progress = 1.7),
                achievement("under", progress = -0.4),
                achievement("half", progress = 0.5),
            ),
        )
        val byId = UserStatsBuilder.build(stats).badges.associateBy { it.id }
        assertThat(byId.getValue("over").progressPercent).isEqualTo(100)
        assertThat(byId.getValue("under").progressPercent).isEqualTo(0)
        assertThat(byId.getValue("half").progressPercent).isEqualTo(50)
    }

    @Test
    fun `negative current and threshold are floored to zero`() {
        val stats = UserStats(achievements = listOf(achievement("a", current = -3, threshold = -10)))
        val badge = UserStatsBuilder.build(stats).badges.single()
        assertThat(badge.current).isEqualTo(0)
        assertThat(badge.threshold).isEqualTo(0)
    }

    @Test
    fun `isUnlocked is recomputed from current reaching threshold`() {
        // Server flag is stale (false) but the count already reached the threshold.
        val stats = UserStats(achievements = listOf(achievement("done", isUnlocked = false, threshold = 10, current = 10)))
        assertThat(UserStatsBuilder.build(stats).badges.single().isUnlocked).isTrue()
    }

    @Test
    fun `below-threshold badge stays locked regardless of a stale unlocked flag`() {
        val stats = UserStats(achievements = listOf(achievement("wip", isUnlocked = true, threshold = 10, current = 4)))
        assertThat(UserStatsBuilder.build(stats).badges.single().isUnlocked).isFalse()
    }

    @Test
    fun `with no threshold the server unlocked flag is trusted`() {
        val stats = UserStats(
            achievements = listOf(
                achievement("flagged", isUnlocked = true, threshold = 0, current = 0),
                achievement("plain", isUnlocked = false, threshold = 0, current = 0),
            ),
        )
        val byId = UserStatsBuilder.build(stats).badges.associateBy { it.id }
        assertThat(byId.getValue("flagged").isUnlocked).isTrue()
        assertThat(byId.getValue("plain").isUnlocked).isFalse()
    }

    // ---- badge ranking ----------------------------------------------------

    @Test
    fun `unlocked badges rank ahead of locked ones`() {
        val stats = UserStats(
            achievements = listOf(
                achievement("locked", threshold = 10, current = 2),
                achievement("unlocked", threshold = 10, current = 10),
            ),
        )
        val order = UserStatsBuilder.build(stats).badges.map { it.id }
        assertThat(order).containsExactly("unlocked", "locked").inOrder()
    }

    @Test
    fun `locked badges are ordered by descending progress`() {
        val stats = UserStats(
            achievements = listOf(
                achievement("low", threshold = 100, current = 10, progress = 0.10),
                achievement("high", threshold = 100, current = 80, progress = 0.80),
                achievement("mid", threshold = 100, current = 50, progress = 0.50),
            ),
        )
        val order = UserStatsBuilder.build(stats).badges.map { it.id }
        assertThat(order).containsExactly("high", "mid", "low").inOrder()
    }

    @Test
    fun `a progress tie is broken by descending current then id`() {
        val stats = UserStats(
            achievements = listOf(
                achievement("z", threshold = 200, current = 20, progress = 0.10),
                achievement("a", threshold = 200, current = 20, progress = 0.10),
                achievement("more", threshold = 400, current = 40, progress = 0.10),
            ),
        )
        val order = UserStatsBuilder.build(stats).badges.map { it.id }
        // Same progress (10%): higher current first, then id ascending on a full tie.
        assertThat(order).containsExactly("more", "a", "z").inOrder()
    }

    @Test
    fun `unlocked and total counts reflect the reconciled state`() {
        val stats = UserStats(
            achievements = listOf(
                achievement("a", threshold = 5, current = 5),
                achievement("b", threshold = 5, current = 2),
                achievement("c", threshold = 5, current = 9),
            ),
        )
        val presentation = UserStatsBuilder.build(stats)
        assertThat(presentation.totalCount).isEqualTo(3)
        assertThat(presentation.unlockedCount).isEqualTo(2)
    }

    // ---- compact formatting ----------------------------------------------

    @Test
    fun `values under a thousand render verbatim`() {
        assertThat(formatCompactCount(0)).isEqualTo("0")
        assertThat(formatCompactCount(1)).isEqualTo("1")
        assertThat(formatCompactCount(999)).isEqualTo("999")
    }

    @Test
    fun `thousands render with a K suffix and drop a trailing zero decimal`() {
        assertThat(formatCompactCount(1_000)).isEqualTo("1K")
        assertThat(formatCompactCount(1_500)).isEqualTo("1.5K")
        assertThat(formatCompactCount(12_000)).isEqualTo("12K")
    }

    @Test
    fun `a value just below one million rolls over to 1M rather than 1000K`() {
        assertThat(formatCompactCount(999_949)).isEqualTo("999.9K")
        assertThat(formatCompactCount(999_950)).isEqualTo("1M")
    }

    @Test
    fun `millions render with an M suffix`() {
        assertThat(formatCompactCount(2_300_000)).isEqualTo("2.3M")
    }

    @Test
    fun `a value just below one billion rolls over to 1B rather than 1000M`() {
        assertThat(formatCompactCount(999_949_999)).isEqualTo("999.9M")
        assertThat(formatCompactCount(999_950_000)).isEqualTo("1B")
    }

    @Test
    fun `billions render with a B suffix`() {
        assertThat(formatCompactCount(2_147_483_647)).isEqualTo("2.1B")
    }

    @Test
    fun `a negative count formats as zero`() {
        assertThat(formatCompactCount(-42)).isEqualTo("0")
    }
}
