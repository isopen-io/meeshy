package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure [MyShareLinksState] reducer: phase derivations and
 * the optimistic toggle/remove list mutations with their locally-consistent stats.
 */
class MyShareLinksStateTest {

    private fun link(
        linkId: String,
        isActive: Boolean = true,
        currentUses: Int = 0,
        expiresAt: String? = null,
    ) = MyShareLink(
        id = linkId,
        linkId = linkId,
        isActive = isActive,
        currentUses = currentUses,
        expiresAt = expiresAt,
    )

    private fun stats(total: Int, active: Int, uses: Int) =
        MyShareLinkStats(totalLinks = total, activeLinks = active, totalUses = uses)

    // --- phase derivations -------------------------------------------------

    @Test
    fun showColdSpinner_onlyWhenLoadingAndEmpty() {
        assertThat(MyShareLinksState().showColdSpinner).isTrue()
    }

    @Test
    fun showColdSpinner_isFalseWhenLoadingOverExistingLinks() {
        val state = MyShareLinksState(links = listOf(link("a"))).loading()
        assertThat(state.showColdSpinner).isFalse()
    }

    @Test
    fun showEmptyState_onlyAfterASettledEmptyLoad() {
        val settled = MyShareLinksState().loaded(links = emptyList(), stats = null)
        assertThat(settled.showEmptyState).isTrue()
        assertThat(MyShareLinksState().showEmptyState).isFalse() // still loading
    }

    @Test
    fun loaded_keepsPriorStatsWhenTheNewStatsAreNull() {
        val start = MyShareLinksState(stats = stats(3, 2, 10))
        val next = start.loaded(links = listOf(link("a")), stats = null)
        assertThat(next.stats).isEqualTo(stats(3, 2, 10))
        assertThat(next.phase).isEqualTo(MyShareLinksPhase.Loaded)
    }

    @Test
    fun failed_surfacesTheMessageAndKeepsExistingLinks() {
        val start = MyShareLinksState(links = listOf(link("a")), phase = MyShareLinksPhase.Loaded)
        val next = start.failed("boom")
        assertThat(next.errorMessage).isEqualTo("boom")
        assertThat(next.phase).isEqualTo(MyShareLinksPhase.Error)
        assertThat(next.links).hasSize(1)
    }

    // --- toggled -----------------------------------------------------------

    @Test
    fun toggled_active_to_inactive_decrementsActiveCount() {
        val start = MyShareLinksState(
            links = listOf(link("a", isActive = true), link("b", isActive = true)),
            stats = stats(total = 2, active = 2, uses = 0),
        )
        val next = start.toggled("a")
        assertThat(next.links.first { it.linkId == "a" }.isActive).isFalse()
        assertThat(next.stats!!.activeLinks).isEqualTo(1)
    }

    @Test
    fun toggled_inactive_to_active_incrementsActiveCount() {
        val start = MyShareLinksState(
            links = listOf(link("a", isActive = false)),
            stats = stats(total = 1, active = 0, uses = 0),
        )
        val next = start.toggled("a")
        assertThat(next.links.first().isActive).isTrue()
        assertThat(next.stats!!.activeLinks).isEqualTo(1)
    }

    @Test
    fun toggled_unknownLinkId_isInert() {
        val start = MyShareLinksState(links = listOf(link("a")), stats = stats(1, 1, 0))
        assertThat(start.toggled("nope")).isEqualTo(start)
    }

    @Test
    fun toggled_withNullStats_updatesTheListOnly() {
        val start = MyShareLinksState(links = listOf(link("a", isActive = true)), stats = null)
        val next = start.toggled("a")
        assertThat(next.links.first().isActive).isFalse()
        assertThat(next.stats).isNull()
    }

    @Test
    fun toggled_activeCountNeverGoesNegative() {
        val start = MyShareLinksState(
            links = listOf(link("a", isActive = true)),
            stats = stats(total = 1, active = 0, uses = 0), // inconsistent server stat
        )
        val next = start.toggled("a")
        assertThat(next.stats!!.activeLinks).isEqualTo(0)
    }

    // --- removed -----------------------------------------------------------

    @Test
    fun removed_active_dropsLinkAndDecrementsTotalActiveAndUses() {
        val start = MyShareLinksState(
            links = listOf(link("a", isActive = true, currentUses = 4), link("b")),
            stats = stats(total = 2, active = 2, uses = 10),
        )
        val next = start.removed("a")
        assertThat(next.links.map { it.linkId }).containsExactly("b")
        assertThat(next.stats).isEqualTo(stats(total = 1, active = 1, uses = 6))
    }

    @Test
    fun removed_inactive_keepsActiveCountButStillDropsTotalAndUses() {
        val start = MyShareLinksState(
            links = listOf(link("a", isActive = false, currentUses = 3)),
            stats = stats(total = 1, active = 0, uses = 3),
        )
        val next = start.removed("a")
        assertThat(next.links).isEmpty()
        assertThat(next.stats).isEqualTo(stats(total = 0, active = 0, uses = 0))
    }

    @Test
    fun removed_unknownLinkId_isInert() {
        val start = MyShareLinksState(links = listOf(link("a")), stats = stats(1, 1, 0))
        assertThat(start.removed("nope")).isEqualTo(start)
    }

    @Test
    fun removed_withNullStats_dropsTheLinkOnly() {
        val start = MyShareLinksState(links = listOf(link("a"), link("b")), stats = null)
        val next = start.removed("a")
        assertThat(next.links.map { it.linkId }).containsExactly("b")
        assertThat(next.stats).isNull()
    }

    @Test
    fun removed_countersNeverGoNegative() {
        val start = MyShareLinksState(
            links = listOf(link("a", isActive = true, currentUses = 5)),
            stats = stats(total = 0, active = 0, uses = 0), // inconsistent server stat
        )
        val next = start.removed("a")
        assertThat(next.stats).isEqualTo(stats(total = 0, active = 0, uses = 0))
    }

    // --- extended ----------------------------------------------------------

    @Test
    fun extended_setsTheNewExpiryOnTheMatchedLinkOnly() {
        val start = MyShareLinksState(
            links = listOf(
                link("a", expiresAt = "2026-07-26T12:00:00Z"),
                link("b", expiresAt = null),
            ),
        )
        val next = start.extended("a", "2026-10-23T12:00:00Z")
        assertThat(next.links.first { it.linkId == "a" }.expiresAt).isEqualTo("2026-10-23T12:00:00Z")
        assertThat(next.links.first { it.linkId == "b" }.expiresAt).isNull()
    }

    @Test
    fun extended_leavesTheAggregateStatsUntouched() {
        val start = MyShareLinksState(
            links = listOf(link("a")),
            stats = stats(total = 1, active = 1, uses = 7),
        )
        val next = start.extended("a", "2026-10-23T12:00:00Z")
        assertThat(next.stats).isEqualTo(stats(total = 1, active = 1, uses = 7))
    }

    @Test
    fun extended_unknownLinkId_isInert() {
        val start = MyShareLinksState(links = listOf(link("a", expiresAt = "2026-07-26T12:00:00Z")))
        assertThat(start.extended("nope", "2026-10-23T12:00:00Z")).isEqualTo(start)
    }
}
