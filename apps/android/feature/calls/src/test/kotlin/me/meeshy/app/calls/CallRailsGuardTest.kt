package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17327 — la garde de source des rails du duo, miroir de iOS `CallViewGlassGuardTests` : à deux, la loi pure décide, les
 * rails sont UNE capsule de verre dont les boutons sont ceux des rangées, ils entrent par leur bord et sortent par lui,
 * « Réduire les animations » les remplace par un fondu ; à plusieurs, les rangées restent dans la pilule ; plus aucune
 * commande autour de ma vignette.
 */
class CallRailsGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallActionRails.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `la loi pure decide de la disposition, l'ecran ne la recalcule pas`() {
        val layout = code("CallConnectedLayout.kt")

        assertThat(layout).contains("CallControlsDisposition.resolve(")
        assertThat(layout).contains("disposition.railRows(")
        assertThat(layout).contains("disposition.pillRows(")
        assertThat(layout).contains("CallActionRails(")
        assertThat(layout).doesNotContain("CallPillModel.rows(")
    }

    @Test
    fun `a deux le (…) ne fait pas grandir la pilule, a plusieurs il deplie ses rangees`() {
        val pill = code("CallControlsPill.kt")

        assertThat(pill).contains("val expanded = disposition.unfoldsPill(layer)")
        assertThat(pill).doesNotContain("val expanded = layer.isExpanded")
    }

    @Test
    fun `les rails sont une capsule de verre aux boutons des rangees, au dessin unique`() {
        val rails = code("CallActionRails.kt")

        assertThat(rails).contains("CallControlsGlass(")
        assertThat(rails).contains("RoundedCornerShape(percent = 50)")
        assertThat(rails).contains("CallPillButton(")
        assertThat(rails).contains("CallRailsLayout.BUTTON_SIDE_DP.dp")
        assertThat(rails).doesNotContain("MeeshyGlassSurface(")
        assertThat(rails).doesNotContain("Color.White.copy(alpha = 0.16f)")
        assertThat(rails).contains("verticalScroll(")
    }

    @Test
    fun `un rail entre par son bord et en sort par lui, un fondu avec Reduire les animations`() {
        val rails = code("CallActionRails.kt")

        assertThat(rails).contains("slideInHorizontally(")
        assertThat(rails).contains("slideOutHorizontally(")
        assertThat(rails).contains("CallRailsLayout.slideOffset(")
        assertThat(rails).contains("rememberCallReduceMotion()")
        assertThat(rails).contains("if (reduceMotion) fadeIn(")
        assertThat(rails).contains("if (reduceMotion) fadeOut(")
    }

    @Test
    fun `un rail qui defile s'efface en fondu a ses deux bords`() {
        val rails = code("CallActionRails.kt")

        assertThat(rails).contains("canScrollBackward")
        assertThat(rails).contains("canScrollForward")
        assertThat(rails).contains("BlendMode.DstIn")
    }

    @Test
    fun `ma vignette ne porte aucune commande autour d'elle`() {
        val tile = code("CallSelfTile.kt")
        assertThat(tile).doesNotContain("effectsControls")
        assertThat(tile).doesNotContain("cameraControls")
        assertThat(tile).doesNotContain("CallSelfTileControlsLaw")

        val stage = code("CallStage.kt")
        assertThat(stage).doesNotContain("CallMyImageTopRail")
        assertThat(stage).doesNotContain("CallSelfEffects")
        assertThat(stage).contains("CallZoomLensCapsule(")

        for (name in calls().list().orEmpty().filter { it.endsWith(".kt") }) {
            val source = code(name)
            assertThat(source).doesNotContain("CallSelfTileControlsRow")
            assertThat(source).doesNotContain("CallSelfEffectsRow")
            assertThat(source).doesNotContain("CallCameraRailRowSlot")
        }
    }
}
