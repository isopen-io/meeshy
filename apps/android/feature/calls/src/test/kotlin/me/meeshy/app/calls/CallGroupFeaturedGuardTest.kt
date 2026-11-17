package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17728 — la une et le plein écran de groupe alignés sur iOS (#17710, #17727) : garde de source, miroir de
 * `CallViewGlassGuardTests` côté iOS. La puce « Écran de X · 2× » est un verre en haut à gauche, la plaque garde le nom
 * de la personne, la capsule de la une vit avec la SCÈNE (elle se range avec les contrôles et repart en fondu), le verre
 * lit le ton de l'écran, la pilule et le bandeau sortent par leur bord, les sous-titres restent en plein écran.
 */
class CallGroupFeaturedGuardTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallGroupTile.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `U2_5 the screen chip sits top start in glass, follows the pinch, and the plate keeps the person's name`() {
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).contains("CallScreenShareChip(")
        assertThat(spotlight).contains("Alignment.TopStart")
        assertThat(spotlight).contains("GroupCallSpotlight.featuredChipText(title, zoom, locale)")
        val chrome = code("CallGroupFeaturedChrome.kt")
        val chip = chrome.substringAfter("fun CallScreenShareChip(").substringBefore("private class CallCapsuleSpot")
        assertThat(chip).contains("CallGlassPlate(")
        assertThat(chip).contains("clearAndSetSemantics")
        val tile = code("CallGroupTile.kt")
        val view = tile.substringAfter("internal fun CallGroupTile(").substringBefore(") {")
        val plate = tile.substringAfter("private fun CallGroupTilePlate(")
        assertThat(view).doesNotContain("title")
        assertThat(plate).contains("val name = tile.displayName.ifBlank")
        assertThat(plate).doesNotContain("title")
    }

    @Test
    fun `U2_6 the plate, the chip and the capsule wear the tone of the screen`() {
        assertThat(code("CallGlassToneUi.kt")).contains("LocalCallGlassToneProgress.current")
        assertThat(code("CallGroupTile.kt")).contains("CallToneScrim()")
        assertThat(code("CallGroupFeaturedChrome.kt").split("CallToneScrim()").size - 1).isEqualTo(2)
        assertThat(code("CallGroupFeaturedChrome.kt")).doesNotContain("MeeshyGlassSurface(")
    }

    @Test
    fun `U1_10 U1_12 the capsule lives with the stage, stows with the controls, and never replays its fade on a toggle`() {
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).doesNotContain("CallGroupSpotlightControls")
        assertThat(spotlight).doesNotContain("callTileMotionFade")
        val stage = code("CallGroupStage.kt")
        assertThat(stage).contains("CallGroupFeaturedCapsule(")
        assertThat(stage).contains("isChromeVisible = isCapsuleVisible")
        val chrome = code("CallGroupFeaturedChrome.kt")
        assertThat(chrome).contains("stowsToward = CallVerticalEdge.Top")
        assertThat(chrome).doesNotContain("callTileMotion")
        assertThat(code("CallScreen.kt")).contains("isCapsuleVisible = chromeVisibility.isVisible(CallChromeElement.FeaturedCapsule)")
    }

    @Test
    fun `U2_9 U2_10 full screen keeps the captions glass, and the pill leaves by the bottom giving its room back`() {
        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("releasesRoom = !pillText.isOnStage(chromeState.isStageFullScreen)")
        assertThat(layout).doesNotContain("if (!chromeState.isStageFullScreen) CallControlsBlock")
        assertThat(code("CallControlsBlock.kt")).contains("releasesRoom = releasesRoom")
    }

    @Test
    fun `U2_10 the strip of the others leaves by the measured edge of the window, by transform and opacity only`() {
        val exit = code("CallGroupStripExit.kt")
        assertThat(exit).contains("GroupCallStageGeometry.stripTravel(")
        assertThat(exit).contains("boundsInWindow()")
        assertThat(exit).contains("graphicsLayer")
        assertThat(exit).contains("CallRemoteVideoFade.durationMillis(true)")
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).contains("exit.sliding()")
        assertThat(spotlight).contains("exit.measuring()")
    }

    @Test
    fun `a stage size is passed down as a parameter, never read out of the BoxWithConstraints scope`() {
        // A bare `maxWidth` resolves only against an implicit BoxWithConstraintsScope (#17693); `constraints.maxWidth`
        // inside a layout modifier has its receiver written out and is not one.
        val implicitRead = Regex("""(?<![.\w])max(Width|Height)\b""")
        listOf("CallGroupSpotlight.kt", "CallGroupFeaturedChrome.kt", "CallGroupStripExit.kt").forEach { file ->
            assertThat(implicitRead.findAll(code(file)).map { it.value }.toList()).isEmpty()
        }
    }

    @Test
    fun `U1_3 the two capsule buttons are 48 dp targets on Android`() {
        val chrome = code("CallGroupFeaturedChrome.kt")
        assertThat(chrome).contains("SPOTLIGHT_BUTTON = 48.dp")
        assertThat(chrome).doesNotContain("44.dp")
    }

    /** #17961 point 1 — un toucher range puis rend la capsule ET la puce « Écran de X · 2× », aux deux niveaux. */
    @Test
    fun `U2_5 the screen chip stows and comes back with the capsule`() {
        val spotlight = code("CallGroupSpotlight.kt")
        val chip = spotlight.substringAfter("private fun CallFeaturedScreenChip(")
        assertThat(chip).contains("CallChromeFade(")
        assertThat(chip).contains("isVisible = isChipVisible")
        assertThat(chip).contains("stowsToward = CallVerticalEdge.Top")
        assertThat(code("CallGroupStage.kt")).contains("isChipVisible = isCapsuleVisible")
    }

    /** #17961 point 2 · #17753 — zoomé, l'écran se déplace au doigt, borné à son cadre ; le GPU seul le transforme. */
    @Test
    fun `U2_7 the zoomed screen moves under the finger, by the layer alone`() {
        val zoom = code("CallReceivedScreenZoom.kt")
        assertThat(zoom).contains("translationX = pan.x")
        assertThat(zoom).contains("translationY = pan.y")
        assertThat(zoom).contains("zoom.drag(")
        assertThat(zoom).contains("viewConfiguration.touchSlop")
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).contains("callReceivedScreenZoomGestures(")
        assertThat(spotlight).contains("callReceivedScreenZoomLayer(")
        assertThat(spotlight).doesNotContain("detectTransformGestures")
        val tile = code("CallGroupTile.kt")
        assertThat(tile).doesNotContain("zoom: Float")
        assertThat(code("CallGroupStageMotion.kt")).doesNotContain("val zoom: Float")
    }

    /** U1.14 · #18181 — pincer zoome MA caméra quand ma vignette est à la une, comme iOS et le web. */
    @Test
    fun `U1_14 my own camera at the spotlight zooms by the pinch, adjustable with TalkBack`() {
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).contains("callCameraPinch(enabled = true, zoom = zoom)")
        assertThat(spotlight).contains("callCameraZoomAdjustable(")
        assertThat(spotlight).contains("featured.isLocal && featured.showsVideo")
        assertThat(code("CallGroupStage.kt")).contains("selfCameraZoom = selfCameraZoom")
        assertThat(code("CallScreen.kt")).contains("selfCameraZoom = selfCamera.zoom")
    }

    /** #17961 point 3 (2026-11-14) — deux niveaux de plein écran, lus d'une seule loi. */
    @Test
    fun `U2_2 the stage reads the full screen level and its capsule from the one law`() {
        val stage = code("CallGroupStage.kt")
        assertThat(stage).contains("GroupCallSpotlight.fullScreenLevel(")
        assertThat(stage).contains("GroupCallSpotlight.capsuleButtons(")
        assertThat(stage).contains("GroupCallSpotlight.levelAfter(")
        assertThat(stage).contains("GroupCallSpotlight.isChromeShown(")
        val chrome = code("CallGroupFeaturedChrome.kt")
        assertThat(chrome).contains("R.string.call_spotlight_total_enter")
        assertThat(chrome).contains("R.string.call_spotlight_total_exit")
        assertThat(chrome).contains("MeeshyIcons.CloseFullscreen")
    }

    /** #18180 — un partage qui commence prend la une, et le lecteur d'écran l'annonce. */
    @Test
    fun `U2_1 a share that begins is announced to TalkBack`() {
        val stage = code("CallGroupStage.kt")
        assertThat(stage).contains("GroupCallSpotlight.announcesShare(")
        assertThat(stage).contains("rememberCallAnnouncer()")
        assertThat(stage).contains("R.string.call_screen_share_remote_banner")
    }

    @Test
    fun `the two new capsule labels exist in the seven languages`() {
        val res = calls().parentFile.parentFile.parentFile.parentFile.parentFile.resolve("res")
        listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar").forEach { folder ->
            val text = File(res, "$folder/strings_calls_spotlight.xml").readText()
            assertThat(text).contains("name=\"call_spotlight_total_enter\"")
            assertThat(text).contains("name=\"call_spotlight_total_exit\"")
        }
    }
}
