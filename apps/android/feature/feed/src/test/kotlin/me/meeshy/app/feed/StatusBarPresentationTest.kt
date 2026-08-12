package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MoodStatusExpiry
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.status.StatusFeedMode
import org.junit.Test

/**
 * Behavioural spec for the pure `StatusBarView` decomposition — the Android port of
 * iOS `StatusBarView.body`'s HStack: a leading own/add cell, an inline error-retry
 * cell shown ONLY on a cold empty failure, the other users' pills (deduped against
 * the own cell), then a trailing load-more spinner. All rendering decisions live
 * here so the Composable stays glue.
 */
class StatusBarPresentationTest {

    private fun entry(id: String, userId: String = "u-$id", emoji: String = "😀") =
        StatusEntry(id = id, userId = userId, username = "n-$id", moodEmoji = emoji)

    // --- leading cell ---------------------------------------------------------

    @Test
    fun `empty state renders only the add-status leading cell`() {
        val cells = buildStatusBarCells(StatusesUiState())

        assertThat(cells).containsExactly(StatusBarCell.AddStatus)
    }

    @Test
    fun `a present own status renders the my-status leading cell instead of add`() {
        val mine = entry("me", userId = "u1")
        val cells = buildStatusBarCells(
            StatusesUiState(statuses = listOf(mine), myStatus = mine),
        )

        assertThat(cells.first()).isEqualTo(StatusBarCell.MyStatus(mine))
        assertThat(cells).doesNotContain(StatusBarCell.AddStatus)
    }

    // --- own-status dedup -----------------------------------------------------

    @Test
    fun `the own status is not repeated as a pill after the leading my-status cell`() {
        val mine = entry("me", userId = "u1")
        val other = entry("b", userId = "u2")
        val cells = buildStatusBarCells(
            StatusesUiState(statuses = listOf(mine, other), myStatus = mine),
        )

        assertThat(cells).containsExactly(
            StatusBarCell.MyStatus(mine),
            StatusBarCell.Pill(other),
        ).inOrder()
    }

    @Test
    fun `with no own status every entry becomes a pill after the add cell in order`() {
        val a = entry("a")
        val b = entry("b")
        val cells = buildStatusBarCells(StatusesUiState(statuses = listOf(a, b)))

        assertThat(cells).containsExactly(
            StatusBarCell.AddStatus,
            StatusBarCell.Pill(a),
            StatusBarCell.Pill(b),
        ).inOrder()
    }

    // --- error-retry cell -----------------------------------------------------

    @Test
    fun `an error on a cold empty bar renders the retry cell right after the leading cell`() {
        val cells = buildStatusBarCells(
            StatusesUiState(statuses = emptyList(), errorMessage = "boom"),
        )

        assertThat(cells).containsExactly(
            StatusBarCell.AddStatus,
            StatusBarCell.ErrorRetry,
        ).inOrder()
    }

    @Test
    fun `an error is not surfaced once the bar already has statuses`() {
        val cells = buildStatusBarCells(
            StatusesUiState(statuses = listOf(entry("a")), errorMessage = "boom"),
        )

        assertThat(cells).doesNotContain(StatusBarCell.ErrorRetry)
    }

    @Test
    fun `no error means no retry cell`() {
        val cells = buildStatusBarCells(StatusesUiState(statuses = emptyList()))

        assertThat(cells).doesNotContain(StatusBarCell.ErrorRetry)
    }

    // --- trailing load-more ---------------------------------------------------

    @Test
    fun `loading more appends a trailing spinner cell at the very end`() {
        val a = entry("a")
        val cells = buildStatusBarCells(
            StatusesUiState(statuses = listOf(a), isLoadingMore = true),
        )

        assertThat(cells).containsExactly(
            StatusBarCell.AddStatus,
            StatusBarCell.Pill(a),
            StatusBarCell.LoadingMore,
        ).inOrder()
    }

    @Test
    fun `no trailing spinner when not loading more`() {
        val cells = buildStatusBarCells(
            StatusesUiState(statuses = listOf(entry("a")), isLoadingMore = false),
        )

        assertThat(cells).doesNotContain(StatusBarCell.LoadingMore)
    }

    // --- popover model --------------------------------------------------------

    @Test
    fun `popover maps the entry fields verbatim`() {
        val e = StatusEntry(
            id = "s1",
            userId = "u1",
            username = "alice",
            moodEmoji = "🔥",
            content = "on fire",
            viaUsername = "bob",
        )

        val model = statusPopoverModel(e, nowMillis = 0L)

        assertThat(model.moodEmoji).isEqualTo("🔥")
        assertThat(model.username).isEqualTo("alice")
        assertThat(model.content).isEqualTo("on fire")
        assertThat(model.viaUsername).isEqualTo("bob")
    }

    @Test
    fun `popover derives minutes-remaining from the expiry law for a live status`() {
        val iso = "2026-07-19T12:00:00.000Z"
        val expiresMs = MoodStatusExpiry.effectiveExpiresAtMillis(createdAt = null, expiresAt = iso)!!
        val e = StatusEntry(id = "s1", moodEmoji = "😀", expiresAt = iso)

        val model = statusPopoverModel(e, nowMillis = expiresMs - 30 * 60_000L)

        assertThat(model.remaining?.tier).isEqualTo(MoodStatusExpiry.Tier.MINUTES)
        assertThat(model.remaining?.label).isEqualTo("30min")
    }

    @Test
    fun `popover reports an expired status past its deadline`() {
        val iso = "2026-07-19T12:00:00.000Z"
        val expiresMs = isoToEpochMillisOrNull(iso)!!
        val e = StatusEntry(id = "s1", moodEmoji = "😀", expiresAt = iso)

        val model = statusPopoverModel(e, nowMillis = expiresMs + 1_000L)

        assertThat(model.remaining?.tier).isEqualTo(MoodStatusExpiry.Tier.EXPIRED)
        assertThat(model.remaining?.label).isNull()
    }

    @Test
    fun `popover carries a null time when the status has no derivable timestamp`() {
        val e = StatusEntry(id = "s1", moodEmoji = "😀")

        val model = statusPopoverModel(e, nowMillis = 1_000L)

        assertThat(model.remaining).isNull()
    }

    // --- republish affordance -------------------------------------------------

    @Test
    fun `another user's status popover offers the republish action`() {
        val model = statusPopoverModel(entry("s1"), nowMillis = 0L, isOwn = false)

        assertThat(model.canRepublish).isTrue()
    }

    @Test
    fun `the signed-in user's own status popover hides the republish action`() {
        val model = statusPopoverModel(entry("mine"), nowMillis = 0L, isOwn = true)

        assertThat(model.canRepublish).isFalse()
    }

    // --- reaction picker ------------------------------------------------------

    @Test
    fun `another user's status popover offers the reaction picker`() {
        val model = statusPopoverModel(entry("s1"), nowMillis = 0L, isOwn = false)

        assertThat(model.canReact).isTrue()
    }

    @Test
    fun `the signed-in user's own status popover hides the reaction picker`() {
        val model = statusPopoverModel(entry("mine"), nowMillis = 0L, isOwn = true)

        assertThat(model.canReact).isFalse()
    }

    @Test
    fun `popover surfaces the existing reactions from the entry summary`() {
        val e = entry("s1").copy(reactionSummary = mapOf("🔥" to 2, "❤️" to 5))

        val model = statusPopoverModel(e, nowMillis = 0L)

        assertThat(model.reactions).containsExactly(
            StatusReactionChip("❤️", 5),
            StatusReactionChip("🔥", 2),
        ).inOrder()
    }

    @Test
    fun `popover has no reactions when the summary is null`() {
        val model = statusPopoverModel(entry("s1"), nowMillis = 0L)

        assertThat(model.reactions).isEmpty()
    }

    // --- reaction chip aggregation --------------------------------------------

    @Test
    fun `reaction chips are empty for a null summary`() {
        assertThat(statusReactionChips(null)).isEmpty()
    }

    @Test
    fun `reaction chips drop zero and negative counts`() {
        val chips = statusReactionChips(mapOf("🔥" to 0, "❤️" to 3, "👏" to -1))

        assertThat(chips).containsExactly(StatusReactionChip("❤️", 3))
    }

    @Test
    fun `reaction chips order by descending count`() {
        val chips = statusReactionChips(mapOf("🔥" to 1, "❤️" to 9, "👏" to 4))

        assertThat(chips).containsExactly(
            StatusReactionChip("❤️", 9),
            StatusReactionChip("👏", 4),
            StatusReactionChip("🔥", 1),
        ).inOrder()
    }

    @Test
    fun `reaction chips break count ties by emoji for a stable order`() {
        val chips = statusReactionChips(mapOf("🔥" to 2, "❤️" to 2, "👏" to 2))

        assertThat(chips).containsExactly(
            StatusReactionChip("❤️", 2),
            StatusReactionChip("👏", 2),
            StatusReactionChip("🔥", 2),
        ).inOrder()
    }

    // --- feed-mode toggle -----------------------------------------------------

    @Test
    fun `feed-mode tabs always offer both feeds`() {
        val tabs = statusFeedModeTabs(StatusFeedMode.FRIENDS)

        assertThat(tabs.map { it.mode })
            .containsExactly(StatusFeedMode.FRIENDS, StatusFeedMode.DISCOVER)
    }

    @Test
    fun `feed-mode tabs read friends first then discover`() {
        val tabs = statusFeedModeTabs(StatusFeedMode.DISCOVER)

        assertThat(tabs.map { it.mode })
            .containsExactly(StatusFeedMode.FRIENDS, StatusFeedMode.DISCOVER)
            .inOrder()
    }

    @Test
    fun `feed-mode tabs select the friends segment on the friends feed`() {
        val tabs = statusFeedModeTabs(StatusFeedMode.FRIENDS)

        assertThat(tabs.filter { it.isSelected }.map { it.mode })
            .containsExactly(StatusFeedMode.FRIENDS)
    }

    @Test
    fun `feed-mode tabs select the discover segment on the discover feed`() {
        val tabs = statusFeedModeTabs(StatusFeedMode.DISCOVER)

        assertThat(tabs.filter { it.isSelected }.map { it.mode })
            .containsExactly(StatusFeedMode.DISCOVER)
    }
}
