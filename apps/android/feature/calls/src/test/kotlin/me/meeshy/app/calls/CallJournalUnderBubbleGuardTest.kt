package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/** R1.11 — le journal sous la bulle d'appel du fil est celui de l'historique, jamais un jumeau. */
class CallJournalUnderBubbleGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun code(name: String): String = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls/$name") }
        .first { it.isFile }
        .readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `la bulle reutilise le ViewModel et la section du detail de l'historique`() {
        val bubble = code("CallJournalUnderBubble.kt")

        assertThat(bubble).contains("CallDetailTranscriptViewModel")
        assertThat(bubble).contains("CallDetailTranscriptSection(")
        assertThat(bubble).contains("hiltViewModel(key =")
    }

    @Test
    fun `le detail de l'historique et la bulle dessinent la meme section`() {
        assertThat(code("CallDetailSheet.kt")).contains("CallDetailTranscriptSection(")
    }

    @Test
    fun `un appel qui n'a rien garde ne deplie pas du vide sous la bulle`() {
        val bubble = code("CallJournalUnderBubble.kt")

        assertThat(bubble).contains("FocalCallJournalOffer.saysNothingWasKept(")
        assertThat(bubble).contains("audio_fullscreen_transcription_empty")
    }

    @Test
    fun `sur cache vide la bulle montre une attente sobre, et rend la main quand elle quitte l'ecran`() {
        val bubble = code("CallJournalUnderBubble.kt")

        assertThat(bubble).contains("FocalCallJournalOffer.showsWaiting(")
        assertThat(bubble).contains("CircularProgressIndicator")
        assertThat(bubble).contains("viewModel.release()")
    }

    /** Rien n'apparaît ni ne disparaît d'un coup : l'attente, le vide et le journal passent en fondu, sans taille animée. */
    @Test
    fun `l'attente, le vide et le journal se relaient en fondu, sans animer la taille`() {
        val bubble = code("CallJournalUnderBubble.kt")

        assertThat(bubble).contains("AnimatedContent(")
        assertThat(bubble).contains("FocalCallJournalFace.of(")
        assertThat(bubble).contains(".using(null)")
        assertThat(bubble).contains("FocalCallJournalMotion.fadeMillis(")
        assertThat(bubble).doesNotContain("animateContentSize")
    }
}
