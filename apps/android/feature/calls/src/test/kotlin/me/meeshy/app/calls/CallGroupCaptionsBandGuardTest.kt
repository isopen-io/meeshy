package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17933 — ONE grammar of band, on a duo as on a group: the sentences on the glass of the pill, two of them, a hairline,
 * « Journal » a button. The group has no twin band (no inner dark card, no « Journal » as plain text): the screen hands
 * the pill the duo's band whatever the stage, and the band keeps its two sentences.
 */
class CallGroupCaptionsBandGuardTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallGroupTile.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `the pill takes the duo's band on a group too, from one site that no stage condition splits`() {
        val layout = code("CallConnectedLayout.kt")
        val sites = Regex("""CallCaptionsBandHost\(""").findAll(layout).count()
        assertThat(sites).isEqualTo(1)
        assertThat(layout).contains("captions = { CallCaptionsBandHost(state = state, hasOwnGlass = false) }")
    }

    @Test
    fun `the band shows two sentences, on a duo as on a group`() {
        assertThat(BAND_LINES).isEqualTo(2)
        assertThat(code("CallCaptionsBand.kt")).contains("CallBandEntries.last(settled, captures, BAND_LINES)")
    }

    @Test
    fun `no group twin of the band is declared in the call screen`() {
        val twins = calls().listFiles().orEmpty()
            .filter { it.extension == "kt" }
            .flatMap { file -> Regex("""fun (\w*Group\w*Caption\w*|\w*Caption\w*Group\w*)\(""").findAll(code(file.name)).map { it.groupValues[1] }.toList() }
        assertThat(twins).isEmpty()
    }
}
