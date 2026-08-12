package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

/**
 * Behavioural spec for the pure [ShareLinkDetailState] reducer — the UDF state of the
 * per-link detail screen. Resolution from the owner list, optimistic toggle, the
 * delete signal and error surfacing are all pure transitions exercised here.
 */
class ShareLinkDetailStateTest {

    private val now = Instant.parse("2026-07-25T12:00:00Z").toEpochMilli()
    private val origin = "https://meeshy.me"

    private fun link(
        linkId: String,
        identifier: String? = null,
        name: String? = null,
        isActive: Boolean = true,
        currentUses: Int = 0,
        maxUses: Int? = null,
    ) = MyShareLink(
        id = "id-$linkId",
        linkId = linkId,
        identifier = identifier,
        name = name,
        isActive = isActive,
        currentUses = currentUses,
        maxUses = maxUses,
    )

    @Test
    fun initialState_isLoading() {
        val state = ShareLinkDetailState()
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Loading)
        assertThat(state.link).isNull()
        assertThat(state.presentation).isNull()
        assertThat(state.isDeleted).isFalse()
    }

    @Test
    fun loading_clearsAnyPriorError() {
        val state = ShareLinkDetailState(phase = ShareLinkDetailPhase.Error, errorMessage = "boom")
            .loading()
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Loading)
        assertThat(state.errorMessage).isNull()
    }

    @Test
    fun resolved_findsTheLinkByLinkIdAndBuildsPresentation() {
        val links = listOf(link("a"), link("b", name = "Beta"))
        val state = ShareLinkDetailState().resolved(links, "b", origin, now)
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
        assertThat(state.link?.linkId).isEqualTo("b")
        assertThat(state.presentation?.displayName).isEqualTo("Beta")
    }

    @Test
    fun resolved_marksNotFoundWhenLinkIdAbsentFromList() {
        val state = ShareLinkDetailState().resolved(listOf(link("a")), "missing", origin, now)
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.NotFound)
        assertThat(state.link).isNull()
        assertThat(state.presentation).isNull()
    }

    @Test
    fun resolved_marksNotFoundOnEmptyList() {
        val state = ShareLinkDetailState().resolved(emptyList(), "a", origin, now)
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.NotFound)
    }

    @Test
    fun resolved_clearsAPriorError() {
        val state = ShareLinkDetailState(errorMessage = "old")
            .resolved(listOf(link("a", name = "Alpha")), "a", origin, now)
        assertThat(state.errorMessage).isNull()
    }

    @Test
    fun failed_entersErrorPhaseWithMessageKeepingTheLink() {
        val loaded = ShareLinkDetailState().resolved(listOf(link("a", name = "Alpha")), "a", origin, now)
        val state = loaded.failed("network down")
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Error)
        assertThat(state.errorMessage).isEqualTo("network down")
        assertThat(state.link?.linkId).isEqualTo("a")
    }

    @Test
    fun toggled_flipsTheActiveFlagOnLinkAndPresentation() {
        val loaded = ShareLinkDetailState().resolved(listOf(link("a", isActive = true)), "a", origin, now)
        val state = loaded.toggled()
        assertThat(state.link?.isActive).isFalse()
        assertThat(state.presentation?.isActive).isFalse()
    }

    @Test
    fun toggled_flipsBackFromInactiveToActive() {
        val loaded = ShareLinkDetailState().resolved(listOf(link("a", isActive = false)), "a", origin, now)
        val state = loaded.toggled()
        assertThat(state.link?.isActive).isTrue()
        assertThat(state.presentation?.isActive).isTrue()
    }

    @Test
    fun toggled_isInertWhenNoLinkResolved() {
        val notFound = ShareLinkDetailState().resolved(emptyList(), "a", origin, now)
        assertThat(notFound.toggled()).isEqualTo(notFound)
    }

    @Test
    fun markDeleted_raisesTheDeletedSignal() {
        val loaded = ShareLinkDetailState().resolved(listOf(link("a")), "a", origin, now)
        assertThat(loaded.markDeleted().isDeleted).isTrue()
    }

    @Test
    fun dismissError_returnsToLoadedWhenALinkIsPresent() {
        val errored = ShareLinkDetailState()
            .resolved(listOf(link("a", name = "Alpha")), "a", origin, now)
            .failed("boom")
        val state = errored.dismissError()
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.Loaded)
        assertThat(state.errorMessage).isNull()
    }

    @Test
    fun dismissError_isInertWhenNoErrorIsSurfaced() {
        val loaded = ShareLinkDetailState().resolved(listOf(link("a")), "a", origin, now)
        assertThat(loaded.dismissError()).isEqualTo(loaded)
    }

    @Test
    fun dismissError_keepsNotFoundPhaseWhenNoLinkResolved() {
        val notFound = ShareLinkDetailState().resolved(emptyList(), "a", origin, now).failed("boom")
        val state = notFound.dismissError()
        assertThat(state.errorMessage).isNull()
        assertThat(state.phase).isEqualTo(ShareLinkDetailPhase.NotFound)
    }
}
