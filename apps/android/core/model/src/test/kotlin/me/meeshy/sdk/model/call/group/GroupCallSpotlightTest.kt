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
    fun `grid chosen for one share is forgotten when the sharer changes, a pinned tile is kept when the share ends`() {
        val grid = GroupCallSpotlightChoice.Grid
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(grid, oldSharer = "alice", newSharer = "bob")).isNull()
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(grid, oldSharer = "alice", newSharer = null)).isNull()
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(grid, oldSharer = "alice", newSharer = "alice")).isEqualTo(grid)
        val pinned = GroupCallSpotlightChoice.Tile("bob")
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(pinned, oldSharer = "alice", newSharer = null)).isEqualTo(pinned)
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(null, oldSharer = null, newSharer = "alice")).isNull()
    }

    /** #18180 (loi 15) — Lina mise à la une à la main, Karim commence à partager : son écran prend la une. */
    @Test
    fun `a share that begins takes the spotlight even after a manual choice`() {
        val lina = GroupCallSpotlightChoice.Tile("lina")
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(lina, oldSharer = null, newSharer = "karim")).isNull()
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(lina, oldSharer = "alice", newSharer = "karim")).isNull()
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(lina, oldSharer = "karim", newSharer = "karim")).isEqualTo(lina)
        val mine = GroupCallSpotlightChoice.Tile(GroupCallStageLaw.LOCAL_TILE_ID)
        assertThat(GroupCallSpotlight.choiceAfterSharerChanged(mine, oldSharer = null, newSharer = "karim")).isNull()
        val four = listOf(me, tile("lina"), tile("karim", sharing = true), tile("bob"))
        val after = GroupCallSpotlight.choiceAfterSharerChanged(lina, oldSharer = null, newSharer = GroupCallSpotlight.sharerId(four))
        assertThat(GroupCallSpotlight.focus(four, after)).isEqualTo(GroupCallStageFocus.Spotlight("karim", isScreenShare = true))
    }

    /** #18180 — le lecteur d'écran annonce le partage qui commence, sauf quand la bannière du pair l'annonce déjà. */
    @Test
    fun `a share that begins is announced once, unless the banner of the peer already says it`() {
        assertThat(GroupCallSpotlight.announcesShare(oldSharer = null, newSharer = "karim", isAnnouncedByBanner = false)).isTrue()
        assertThat(GroupCallSpotlight.announcesShare(oldSharer = "alice", newSharer = "karim", isAnnouncedByBanner = false)).isTrue()
        assertThat(GroupCallSpotlight.announcesShare(oldSharer = null, newSharer = "karim", isAnnouncedByBanner = true)).isFalse()
        assertThat(GroupCallSpotlight.announcesShare(oldSharer = "karim", newSharer = "karim", isAnnouncedByBanner = false)).isFalse()
        assertThat(GroupCallSpotlight.announcesShare(oldSharer = "karim", newSharer = null, isAnnouncedByBanner = false)).isFalse()
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

    /** #17961 — le plein écran (U2) garde les caméras des autres ; seul le plein écran total (U2b) les retire. */
    @Test
    fun `the others go below in portrait, on the side in landscape, and stay in full screen, nowhere in total full screen`() {
        val off = GroupCallFullScreenLevel.Off
        val full = GroupCallFullScreenLevel.FullScreen
        val total = GroupCallFullScreenLevel.Total
        assertThat(GroupCallSpotlight.filmstrip(off, isLandscape = false)).isEqualTo(GroupCallFilmstrip.Bottom)
        assertThat(GroupCallSpotlight.filmstrip(off, isLandscape = true)).isEqualTo(GroupCallFilmstrip.Trailing)
        assertThat(GroupCallSpotlight.filmstrip(full, isLandscape = false)).isEqualTo(GroupCallFilmstrip.Bottom)
        assertThat(GroupCallSpotlight.filmstrip(full, isLandscape = true)).isEqualTo(GroupCallFilmstrip.Trailing)
        assertThat(GroupCallSpotlight.filmstrip(total, isLandscape = true)).isEqualTo(GroupCallFilmstrip.None)
        assertThat(GroupCallSpotlight.filmstrip(total, isLandscape = false)).isEqualTo(GroupCallFilmstrip.None)
        assertThat(GroupCallSpotlight.filmstrip(isStripHidden = true, isLandscape = true)).isEqualTo(GroupCallFilmstrip.None)
    }

    /** #17961 (2026-11-14) — « Plein écran » monte d'un niveau à chaque appui ; « Quitter » redescend d'un niveau. */
    @Test
    fun `full screen rises one level per press, a shared screen up to total, a camera only once`() {
        val off = GroupCallFullScreenLevel.Off
        val full = GroupCallFullScreenLevel.FullScreen
        val total = GroupCallFullScreenLevel.Total
        assertThat(GroupCallSpotlight.raised(off, isScreenShare = true)).isEqualTo(full)
        assertThat(GroupCallSpotlight.raised(full, isScreenShare = true)).isEqualTo(total)
        assertThat(GroupCallSpotlight.raised(total, isScreenShare = true)).isEqualTo(total)
        assertThat(GroupCallSpotlight.raised(off, isScreenShare = false)).isEqualTo(full)
        assertThat(GroupCallSpotlight.raised(full, isScreenShare = false)).isEqualTo(full)
        assertThat(GroupCallSpotlight.lowered(total)).isEqualTo(full)
        assertThat(GroupCallSpotlight.lowered(full)).isEqualTo(off)
        assertThat(GroupCallSpotlight.lowered(off)).isEqualTo(off)
    }

    @Test
    fun `the level is read from the full screen of the chrome, and total is reserved to a shared screen`() {
        assertThat(GroupCallSpotlight.fullScreenLevel(isFullScreen = false, wantsTotal = true, isScreenShare = true)).isEqualTo(GroupCallFullScreenLevel.Off)
        assertThat(GroupCallSpotlight.fullScreenLevel(isFullScreen = true, wantsTotal = false, isScreenShare = true)).isEqualTo(GroupCallFullScreenLevel.FullScreen)
        assertThat(GroupCallSpotlight.fullScreenLevel(isFullScreen = true, wantsTotal = true, isScreenShare = true)).isEqualTo(GroupCallFullScreenLevel.Total)
        assertThat(GroupCallSpotlight.fullScreenLevel(isFullScreen = true, wantsTotal = true, isScreenShare = false)).isEqualTo(GroupCallFullScreenLevel.FullScreen)
        assertThat(GroupCallFullScreenLevel.Off.isFullScreen).isFalse()
        assertThat(GroupCallFullScreenLevel.FullScreen.isFullScreen).isTrue()
        assertThat(GroupCallFullScreenLevel.Total.isFullScreen).isTrue()
    }

    /** U2 « Revenir à la grille · Plein écran total · Quitter le plein écran » ; U2b « Revenir à la grille · Quitter le plein écran total ». */
    @Test
    fun `the capsule offers grid then the next level then the way down`() {
        val b = GroupCallSpotlightButton.entries
        assertThat(b).hasSize(5)
        assertThat(GroupCallSpotlight.capsuleButtons(GroupCallFullScreenLevel.Off, isScreenShare = true))
            .containsExactly(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.FullScreen).inOrder()
        assertThat(GroupCallSpotlight.capsuleButtons(GroupCallFullScreenLevel.Off, isScreenShare = false))
            .containsExactly(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.FullScreen).inOrder()
        assertThat(GroupCallSpotlight.capsuleButtons(GroupCallFullScreenLevel.FullScreen, isScreenShare = true))
            .containsExactly(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.TotalFullScreen, GroupCallSpotlightButton.ExitFullScreen).inOrder()
        assertThat(GroupCallSpotlight.capsuleButtons(GroupCallFullScreenLevel.FullScreen, isScreenShare = false))
            .containsExactly(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.ExitFullScreen).inOrder()
        assertThat(GroupCallSpotlight.capsuleButtons(GroupCallFullScreenLevel.Total, isScreenShare = true))
            .containsExactly(GroupCallSpotlightButton.Grid, GroupCallSpotlightButton.ExitTotalFullScreen).inOrder()
    }

    @Test
    fun `each capsule button moves to its level, grid leaves everything`() {
        val off = GroupCallFullScreenLevel.Off
        val full = GroupCallFullScreenLevel.FullScreen
        val total = GroupCallFullScreenLevel.Total
        assertThat(GroupCallSpotlight.levelAfter(GroupCallSpotlightButton.FullScreen, off, isScreenShare = true)).isEqualTo(full)
        assertThat(GroupCallSpotlight.levelAfter(GroupCallSpotlightButton.TotalFullScreen, full, isScreenShare = true)).isEqualTo(total)
        assertThat(GroupCallSpotlight.levelAfter(GroupCallSpotlightButton.ExitTotalFullScreen, total, isScreenShare = true)).isEqualTo(full)
        assertThat(GroupCallSpotlight.levelAfter(GroupCallSpotlightButton.ExitFullScreen, full, isScreenShare = true)).isEqualTo(off)
        assertThat(GroupCallSpotlight.levelAfter(GroupCallSpotlightButton.Grid, total, isScreenShare = true)).isEqualTo(off)
    }

    /**
     * En plein écran, l'en-tête et la pilule sont rangés : le chrome qui se voit est la capsule. Toucher une caméra du
     * bandeau la met donc à la une tant que la capsule est là, et rend la capsule quand elle est rangée.
     */
    @Test
    fun `in full screen the capsule is the chrome a tile tap reads`() {
        assertThat(GroupCallSpotlight.isChromeShown(isFullScreen = false, isControlsVisible = true, isCapsuleVisible = true)).isTrue()
        assertThat(GroupCallSpotlight.isChromeShown(isFullScreen = false, isControlsVisible = false, isCapsuleVisible = true)).isFalse()
        assertThat(GroupCallSpotlight.isChromeShown(isFullScreen = true, isControlsVisible = false, isCapsuleVisible = true)).isTrue()
        assertThat(GroupCallSpotlight.isChromeShown(isFullScreen = true, isControlsVisible = false, isCapsuleVisible = false)).isFalse()
    }

    /** #17961 point 2 · #17753 — vecteurs de `apps/web/src/lib/calls/call-spotlight.test.ts` › « le déplacement d'un écran reçu zoomé ». */
    @Test
    fun `at 1x nothing moves, the image already fills its frame`() {
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(50f, -30f), 1f, 400f, 200f)).isEqualTo(GroupCallScreenPan(0f, 0f))
    }

    @Test
    fun `zoomed the image never leaves its frame, its edge stays at the edge on each side`() {
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(999f, -999f), 2f, 400f, 200f)).isEqualTo(GroupCallScreenPan(200f, -100f))
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(40f, -20f), 2f, 400f, 200f)).isEqualTo(GroupCallScreenPan(40f, -20f))
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(999f, 999f), GroupCallSpotlight.MAX_ZOOM, 400f, 200f)).isEqualTo(GroupCallScreenPan(600f, 300f))
    }

    @Test
    fun `going back toward 1x recentres, the bound tightens with the zoom`() {
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(600f, 300f), 2f, 400f, 200f)).isEqualTo(GroupCallScreenPan(200f, 100f))
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(600f, 300f), 1f, 400f, 200f)).isEqualTo(GroupCallScreenPan(0f, 0f))
    }

    @Test
    fun `a drag adds its offset to the acquired pan, bounded`() {
        assertThat(GroupCallSpotlight.screenPanAfterDrag(GroupCallScreenPan(10f, 0f), dx = 25f, dy = -5f, zoom = 2f, width = 400f, height = 200f))
            .isEqualTo(GroupCallScreenPan(35f, -5f))
        assertThat(GroupCallSpotlight.screenPanAfterDrag(GroupCallScreenPan(190f, 0f), dx = 50f, dy = 0f, zoom = 2f, width = 400f, height = 200f))
            .isEqualTo(GroupCallScreenPan(200f, 0f))
    }

    @Test
    fun `a frame without a measure moves nothing, no division, no NaN`() {
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(5f, 5f), 3f, 0f, 0f)).isEqualTo(GroupCallScreenPan(0f, 0f))
        assertThat(GroupCallSpotlight.screenPanClamp(GroupCallScreenPan(5f, 5f), 3f, Float.NaN, Float.POSITIVE_INFINITY)).isEqualTo(GroupCallScreenPan(0f, 0f))
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
