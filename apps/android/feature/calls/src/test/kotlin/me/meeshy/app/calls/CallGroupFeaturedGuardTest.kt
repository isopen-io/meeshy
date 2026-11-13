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
}
