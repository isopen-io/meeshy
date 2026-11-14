package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallTranscriptLine
import me.meeshy.sdk.model.call.CallTranscriptState
import org.junit.Test

/**
 * Rien n'apparaît ni ne disparaît d'un coup : le journal déplié passe en fondu d'une FACE à l'autre (rien encore,
 * attente, « Aucune transcription », journal) ; une revalidation qui garde la même face ne refait aucun fondu.
 */
class FocalCallJournalFaceTest {

    private fun line(text: String) = CallTranscriptLine(
        speakerName = "Awa", isLocal = false, elapsedLabel = "00:04", original = text, translated = null, translatedLanguage = null,
    )

    @Test fun `chaque etat du journal a sa face, l'attente distincte de la lecture de la copie`() {
        assertThat(FocalCallJournalFace.of(CallTranscriptState.ReadingCopy)).isEqualTo(FocalCallJournalFace.Unread)
        assertThat(FocalCallJournalFace.of(CallTranscriptState.Loading)).isEqualTo(FocalCallJournalFace.Waiting)
        assertThat(FocalCallJournalFace.of(CallTranscriptState.Absent)).isEqualTo(FocalCallJournalFace.NothingKept)
        assertThat(FocalCallJournalFace.of(CallTranscriptState.Failed)).isEqualTo(FocalCallJournalFace.Journal)
    }

    @Test fun `un journal revalide garde sa face, sans nouveau fondu`() {
        assertThat(FocalCallJournalFace.of(CallTranscriptState.Ready(listOf(line("Hi")))))
            .isEqualTo(FocalCallJournalFace.of(CallTranscriptState.Ready(listOf(line("Hi"), line("Bye")))))
    }
}
