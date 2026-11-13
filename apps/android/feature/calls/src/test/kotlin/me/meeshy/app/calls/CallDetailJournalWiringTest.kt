package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17869 — la garde de source du journal d'après l'appel, miroir de iOS `CallTranscriptSection` : « Original · … » sous chaque
 * traduction à l'encre secondaire du thème, la couleur d'auteur qui suit le thème choisi dans l'app (pas celui du système), l'heure
 * en chiffres tabulaires, la bascule au pied du journal avec une sémantique de bascule.
 */
class CallDetailJournalWiringTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallDetailSections.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `A1_9 - la couleur d'auteur suit le theme de l'app, jamais celui du systeme`() {
        val sections = code("CallDetailSections.kt")

        assertThat(sections).doesNotContain("isSystemInDarkTheme")
        assertThat(sections).contains("MeeshyTheme.isDark")
    }

    @Test
    fun `A1_5 - l'heure d'une phrase est en chiffres tabulaires`() {
        assertThat(code("CallDetailSections.kt")).contains("fontFeatureSettings = \"tnum\"")
    }

    @Test
    fun `A1_8 et A2_3 - l'original se deplie sous chaque traduction a l'encre secondaire du theme`() {
        val sections = code("CallDetailSections.kt")

        assertThat(sections).contains("line.originalBelow(showsOriginalInstead = showOriginal)")
        assertThat(sections).contains("CallCaptionOriginalBelow(original, reduceMotion = rememberCallReduceMotion(), ink = MeeshyTheme.tokens.textSecondary)")
        assertThat(code("CallCaptionRow.kt")).contains("ink = MeeshyMediaChromeColors.ChromeSecondary")
    }

    @Test
    fun `A1_15 - la bascule est au pied du journal, une vraie bascule de 48 dp, plus une icone d'en-tete`() {
        val sections = code("CallDetailSections.kt")

        assertThat(sections).doesNotContain("IconButton(")
        assertThat(sections).contains("toggleable(value = showOriginal, role = Role.Switch")
        assertThat(sections).contains("minHeight = 48.dp")
        assertThat(sections.indexOf("OriginalToggle(showOriginal, accent)")).isGreaterThan(sections.indexOf("TranscriptRow(line, showOriginal)"))
        assertThat(sections.indexOf("OriginalToggle(showOriginal, accent)")).isLessThan(sections.indexOf("TranscriptDisclaimer()\n"))
    }
}
