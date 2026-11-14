package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #18213 — la garde de source du fondu de bord, miroir des gardes iOS (`GroupCallSpotlightTests`, `CallViewGlassGuardTests`) :
 * toute rangée qui peut défiler (rails, pilule, bandeau, ambiances, genres, carrousel de looks, réactions) s'efface en
 * fondu à ses DEUX bords par le modificateur partagé, qu'elle défile ou non — iOS pose `ScrollEdgeFadeMask(start: true, end: true)`
 * sans condition. Le modificateur ne lit plus aucun état de défilement.
 */
class CallScrollEdgeFadeGuardTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallActionRails.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `P2_8 - the vertical rail fades at both edges, not only the one hiding buttons`() {
        val rails = code("CallActionRails.kt")

        assertThat(rails).contains(".callScrollEdgeFade(horizontal = false)")
        assertThat(rails).doesNotContain("symmetric")
        assertThat(rails).doesNotContain("canScrollBackward")
        assertThat(rails).doesNotContain("canScrollForward")
    }

    @Test
    fun `the shared modifier takes no scroll state, so a row that fits whole still fades`() {
        val modifier = code("CallActionRails.kt").substringAfter("internal fun Modifier.callScrollEdgeFade(").substringBefore("drawWithContent")

        assertThat(modifier).contains("horizontal: Boolean")
        assertThat(modifier).doesNotContain("ScrollableState")
        assertThat(code("CallActionRails.kt")).contains("CallScrollEdgeFade.edges")
    }

    @Test
    fun `U1_13 and U3_3 - the filmstrip fades at both edges in portrait and in landscape`() {
        val spotlight = code("CallGroupSpotlight.kt")

        assertThat(spotlight).contains(".callScrollEdgeFade(horizontal = true)")
        assertThat(spotlight).contains(".callScrollEdgeFade(horizontal = false)")
        assertThat(spotlight).doesNotContain("callScrollEdgeFade(state")
    }

    @Test
    fun `C1_5 - the mood row and the genre row fade at both edges`() {
        assertThat(code("CallFrameMoodChips.kt")).contains("callScrollEdgeFade(horizontal = true)")
        assertThat(code("CallEffectsBar.kt")).contains(".callScrollEdgeFade(horizontal = true)")
    }

    @Test
    fun `loi 17_9 - the looks carousel and the reactions row fade too`() {
        assertThat(code("CallModeCarousel.kt")).contains("callScrollEdgeFade(horizontal = true)")
        assertThat(code("CallReactionsCapability.kt")).contains(".callScrollEdgeFade(horizontal = true)")
    }

    @Test
    fun `the pill rows fade at both edges with the shared modifier`() {
        assertThat(code("CallActionRow.kt")).contains(".callScrollEdgeFade(horizontal = true)")
    }
}
