package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** La mise à la une d'une vignette, miroir de iOS `GroupCallSpotlightTests`. */
class GroupCallSpotlightTest {

    private fun tile(id: String, isLocal: Boolean = false, sharing: Boolean = false) = GroupCallStageTile(
        id = id,
        colorKey = id,
        displayName = id,
        avatarUrl = null,
        isLocal = isLocal,
        isMicMuted = false,
        showsVideo = true,
        isScreenSharing = sharing,
        isReconnecting = false,
    )

    private val me = tile(GroupCallStageLaw.LOCAL_TILE_ID, isLocal = true)
    private val trio = listOf(me, tile("alice"), tile("bob"))

    @Test
    fun `without a choice nor a share the stage is the grid`() {
        assertThat(GroupCallSpotlight.focus(trio, choice = null)).isEqualTo(GroupCallStageFocus.Grid)
    }

    @Test
    fun `a tapped tile takes the spotlight`() {
        assertThat(GroupCallSpotlight.focus(trio, GroupCallSpotlightChoice.Tile("bob")))
            .isEqualTo(GroupCallStageFocus.Spotlight("bob", isScreenShare = false))
    }

    @Test
    fun `a member sharing their screen rises alone to the spotlight`() {
        val sharing = listOf(me, tile("alice"), tile("bob", sharing = true))
        assertThat(GroupCallSpotlight.focus(sharing, choice = null))
            .isEqualTo(GroupCallStageFocus.Spotlight("bob", isScreenShare = true))
    }

    @Test
    fun `my own share never takes the spotlight by itself`() {
        val mine = listOf(me.copy(isScreenSharing = true), tile("alice"), tile("bob"))
        assertThat(GroupCallSpotlight.sharerId(mine)).isNull()
        assertThat(GroupCallSpotlight.focus(mine, choice = null)).isEqualTo(GroupCallStageFocus.Grid)
    }

    @Test
    fun `the first sharer to arrive wins`() {
        val two = listOf(me, tile("alice", sharing = true), tile("bob", sharing = true))
        assertThat(GroupCallSpotlight.sharerId(two)).isEqualTo("alice")
    }

    @Test
    fun `grid chosen during a share keeps the grid`() {
        val sharing = listOf(me, tile("alice", sharing = true), tile("bob"))
        assertThat(GroupCallSpotlight.focus(sharing, GroupCallSpotlightChoice.Grid)).isEqualTo(GroupCallStageFocus.Grid)
    }

    @Test
    fun `a pinned tile that left the call gives the hand back to the automatic rule`() {
        val sharing = listOf(me, tile("alice", sharing = true))
        assertThat(GroupCallSpotlight.focus(sharing, GroupCallSpotlightChoice.Tile("bob")))
            .isEqualTo(GroupCallStageFocus.Spotlight("alice", isScreenShare = true))
        assertThat(GroupCallSpotlight.focus(trio.take(2), GroupCallSpotlightChoice.Tile("bob"))).isEqualTo(GroupCallStageFocus.Grid)
    }

    @Test
    fun `a pinned sharer is shown as a screen`() {
        val sharing = listOf(me, tile("alice", sharing = true))
        assertThat(GroupCallSpotlight.focus(sharing, GroupCallSpotlightChoice.Tile("alice")))
            .isEqualTo(GroupCallStageFocus.Spotlight("alice", isScreenShare = true))
    }

    @Test
    fun `grid chosen for one share is forgotten when the sharer changes, a pinned tile is kept`() {
        val grid = GroupCallSpotlightChoice.Grid
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(grid, oldSharer = "alice", newSharer = "bob")).isNull()
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(grid, oldSharer = "alice", newSharer = null)).isNull()
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(grid, oldSharer = "alice", newSharer = "alice")).isEqualTo(grid)
        val pinned = GroupCallSpotlightChoice.Tile("bob")
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(pinned, oldSharer = "alice", newSharer = null)).isEqualTo(pinned)
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(null, oldSharer = null, newSharer = "alice")).isNull()
    }

    @Test
    fun `my tile in the spotlight puts my image on the stage`() {
        assertThat(GroupCallSpotlight.featuresLocal(GroupCallStageFocus.Spotlight(GroupCallStageLaw.LOCAL_TILE_ID, false))).isTrue()
        assertThat(GroupCallSpotlight.featuresLocal(GroupCallStageFocus.Spotlight("alice", false))).isFalse()
        assertThat(GroupCallSpotlight.featuresLocal(GroupCallStageFocus.Grid)).isFalse()
    }

    @Test
    fun `a shared screen zooms between one and four`() {
        assertThat(GroupCallSpotlight.clampedZoom(0.5f)).isEqualTo(1f)
        assertThat(GroupCallSpotlight.clampedZoom(2.5f)).isEqualTo(2.5f)
        assertThat(GroupCallSpotlight.clampedZoom(9f)).isEqualTo(GroupCallSpotlight.MAX_ZOOM)
    }

    @Test
    fun `the others go below in portrait, on the side in landscape, nowhere in full screen`() {
        assertThat(GroupCallSpotlight.filmstrip(isFullScreen = false, isLandscape = false)).isEqualTo(GroupCallFilmstrip.Bottom)
        assertThat(GroupCallSpotlight.filmstrip(isFullScreen = false, isLandscape = true)).isEqualTo(GroupCallFilmstrip.Trailing)
        assertThat(GroupCallSpotlight.filmstrip(isFullScreen = true, isLandscape = true)).isEqualTo(GroupCallFilmstrip.None)
    }
}
