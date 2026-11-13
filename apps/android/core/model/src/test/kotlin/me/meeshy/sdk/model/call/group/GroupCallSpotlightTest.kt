package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
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
    fun `the screen received in a duo zooms by the same law, a pinch in progress applies to the committed zoom`() {
        assertThat(GroupCallSpotlight.receivedScreenZoom(committed = 2f, pinch = 1.5f, isReceivingScreen = true)).isEqualTo(3f)
        assertThat(GroupCallSpotlight.receivedScreenZoom(committed = 2f, pinch = 9f, isReceivingScreen = true)).isEqualTo(GroupCallSpotlight.MAX_ZOOM)
        assertThat(GroupCallSpotlight.receivedScreenZoom(committed = 3f, pinch = 0.1f, isReceivingScreen = true)).isEqualTo(1f)
    }

    @Test
    fun `the return to 1x of a received screen takes 0,2 s, the short fade of the chrome under reduce motion`() {
        assertThat(GroupCallSpotlight.receivedScreenResetMillis(reduceMotion = false)).isEqualTo(200)
        assertThat(GroupCallSpotlight.receivedScreenResetMillis(reduceMotion = true)).isEqualTo(CallChromeStow.REDUCED_FADE_MILLIS)
    }

    @Test
    fun `a zoom does not outlive the share that made it`() {
        assertThat(GroupCallSpotlight.receivedScreenZoom(committed = 3f, pinch = 1.2f, isReceivingScreen = false)).isEqualTo(1f)
    }

    @Test
    fun `the others go below in portrait, on the side in landscape, nowhere in full screen`() {
        assertThat(GroupCallSpotlight.filmstrip(isFullScreen = false, isLandscape = false)).isEqualTo(GroupCallFilmstrip.Bottom)
        assertThat(GroupCallSpotlight.filmstrip(isFullScreen = false, isLandscape = true)).isEqualTo(GroupCallFilmstrip.Trailing)
        assertThat(GroupCallSpotlight.filmstrip(isFullScreen = true, isLandscape = true)).isEqualTo(GroupCallFilmstrip.None)
    }

    /** U2.5 — the factor announced by the « Screen of X · 2× » chip. */
    @Test
    fun `the displayed zoom is null at one, and otherwise rounded to tenths under the ceiling`() {
        assertThat(GroupCallSpotlight.displayedZoom(1f)).isNull()
        assertThat(GroupCallSpotlight.displayedZoom(1.04f)).isNull()
        assertThat(GroupCallSpotlight.displayedZoom(2f)).isEqualTo(2f)
        assertThat(GroupCallSpotlight.displayedZoom(2.46f)).isEqualTo(2.5f)
        assertThat(GroupCallSpotlight.displayedZoom(9f)).isEqualTo(GroupCallSpotlight.MAX_ZOOM)
    }

    @Test
    fun `the chip carries the zoom factor after the title, written by the camera's one zoom label in the reader's language`() {
        assertThat(GroupCallSpotlight.featuredChipText("Écran de Karim", zoom = 2f, locale = Locale.FRANCE)).isEqualTo("Écran de Karim · 2×")
        assertThat(GroupCallSpotlight.featuredChipText("Écran de Karim", zoom = 2.5f, locale = Locale.FRANCE)).isEqualTo("Écran de Karim · 2,5×")
        assertThat(GroupCallSpotlight.featuredChipText("Karim's screen", zoom = 2.5f, locale = Locale.US)).isEqualTo("Karim's screen · 2.5×")
        assertThat(GroupCallSpotlight.featuredChipText("Karim's screen", zoom = 2.46f, locale = Locale.US))
            .isEqualTo("Karim's screen · " + CameraZoomPolicy.label(2.5f, Locale.US))
    }

    @Test
    fun `at one times the chip is the title alone`() {
        assertThat(GroupCallSpotlight.featuredChipText("Écran de Karim", zoom = 1f, locale = Locale.FRANCE)).isEqualTo("Écran de Karim")
    }
}
