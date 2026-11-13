package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17342, P6.3 et P6.4 — la garde de source du journal de l'appel, miroir de iOS `CallJournalPanel` : « Journal » à gauche et
 * la bascule Traduit · Original à droite sur UNE ligne, rien d'autre dans la tête (le journal se range par le (…), par le
 * bouton Journal ou par Retour) ; l'heure d'une phrase est celle de l'appel, à droite, jamais l'heure murale.
 */
class CallJournalGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallJournalPanel.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `la tete du journal porte Journal et la bascule, sans bouton Fermer, et Retour le range`() {
        val panel = code("CallJournalPanel.kt")
        val header = panel.substringAfter("private fun CallJournalHeader(").substringBefore("private val JOURNAL_SWITCH_MAX_WIDTH")

        assertThat(header).contains("R.string.call_captions_journal")
        assertThat(header).contains("SingleChoiceSegmentedButtonRow(")
        assertThat(header).doesNotContain("CallPanelCloseButton")
        assertThat(panel).contains("BackHandler(onBack = onClose)")
    }

    @Test
    fun `la phrase du journal porte l'heure dans l'appel a droite, plus l'heure murale collee au nom`() {
        val row = code("CallCaptionRow.kt")

        assertThat(row).contains("line.timeLabel")
        assertThat(row).doesNotContain("DateFormat")
        assertThat(row).doesNotContain("line.capturedAtMs")
        assertThat(code("CallCaptionsViewModel.kt")).contains(".dated(state.callStartedAtMs)")
    }

    @Test
    fun `W2_6 - le journal nomme l'auteur par les noms que l'ecran lui remet, sans se fabriquer un second CallViewModel`() {
        val panel = code("CallJournalPanel.kt")
        val layout = code("CallConnectedLayout.kt")

        assertThat(panel).doesNotContain("CallViewModel")
        assertThat(panel).contains("participantNames: Map<String, String>")
        assertThat(panel).contains("viewModel.journalLines(state, view, labels, participantNames)")
        assertThat(layout).contains("participantNames = state.participantNames")
    }

    @Test
    fun `le journal d'apres l'appel et celui du direct datent par la meme loi`() {
        val replay = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "core/model/src/main/kotlin/me/meeshy/sdk/model/call/CallTranscriptReplay.kt") }
            .first { it.isFile }

        assertThat(replay.readText()).contains("CallJournalClock.label(")
        assertThat(replay.readText()).doesNotContain("CallDuration.clock(")
    }
}
