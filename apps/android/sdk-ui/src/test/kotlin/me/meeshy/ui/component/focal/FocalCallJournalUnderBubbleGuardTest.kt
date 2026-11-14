package me.meeshy.ui.component.focal

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/** A1.4 — le journal déplié entre et sort par transformation + opacité : sa taille ne s'anime jamais. */
class FocalCallJournalUnderBubbleGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private val code: String = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/ui/component/focal/FocalCallJournalUnderBubble.kt") }
        .first { it.isFile }
        .readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `le journal n'anime jamais sa hauteur`() {
        assertThat(code).doesNotContain("expandVertically")
        assertThat(code).doesNotContain("shrinkVertically")
        assertThat(code).doesNotContain("animateContentSize")
    }

    @Test
    fun `le fondu glisse par graphicsLayer, sans recomposition par image`() {
        assertThat(code).contains("graphicsLayer")
        assertThat(code).contains("FocalCallJournalMotion.fadeMillis(")
        assertThat(code).contains("FocalCallJournalMotion.hiddenOffsetDp(")
    }
}
