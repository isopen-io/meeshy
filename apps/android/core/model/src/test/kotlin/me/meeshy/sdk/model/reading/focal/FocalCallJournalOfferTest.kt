package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.CallSummaryMetadata.MediaType
import me.meeshy.sdk.model.CallSummaryMetadata.Outcome
import me.meeshy.sdk.model.call.CallTranscriptLine
import me.meeshy.sdk.model.call.CallTranscriptState
import org.junit.Test

/** R1.11 — quelle bulle d'appel du fil offre le journal d'après l'appel sous elle (planche A1, A2). */
class FocalCallJournalOfferTest {

    private fun summary(
        outcome: Outcome = Outcome.COMPLETED,
        duration: Int = 49,
        live: Boolean = false,
        callId: String = "c1",
        type: MediaType = MediaType.VIDEO,
    ) = CallSummaryMetadata(
        callId = callId, initiatorId = "u1", callType = type, outcome = outcome, durationSeconds = duration,
        bytesTotal = null, bytesEstimated = false, networkQuality = null, isLive = live,
    )

    @Test fun `un appel connecte et termine offre son journal, en video comme en audio`() {
        assertThat(FocalCallJournalOffer.isOffered(summary(type = MediaType.VIDEO))).isTrue()
        assertThat(FocalCallJournalOffer.isOffered(summary(type = MediaType.AUDIO))).isTrue()
    }

    @Test fun `un appel en cours n'a pas encore de journal d'apres l'appel`() {
        assertThat(FocalCallJournalOffer.isOffered(summary(live = true))).isFalse()
    }

    @Test fun `un appel manque, refuse ou interrompu n'a rien dit et n'offre rien`() {
        listOf(Outcome.MISSED, Outcome.REJECTED, Outcome.FAILED).forEach { outcome ->
            assertThat(FocalCallJournalOffer.isOffered(summary(outcome = outcome, duration = 0))).isFalse()
        }
    }

    @Test fun `un appel sans duree ou sans identifiant n'offre rien`() {
        assertThat(FocalCallJournalOffer.isOffered(summary(duration = 0))).isFalse()
        assertThat(FocalCallJournalOffer.isOffered(summary(callId = " "))).isFalse()
    }

    @Test fun `un journal ouvert sur un appel qui n'a rien garde dit qu'il n'y a aucune transcription`() {
        assertThat(FocalCallJournalOffer.saysNothingWasKept(CallTranscriptState.Absent)).isTrue()
    }

    @Test fun `un journal qui charge, echoue ou a des lignes ne se dit pas vide`() {
        val line = CallTranscriptLine(
            speakerName = "Awa", isLocal = false, elapsedLabel = "00:04", original = "Hi", translated = "Salut", translatedLanguage = "fr",
        )
        listOf(CallTranscriptState.Loading, CallTranscriptState.Failed, CallTranscriptState.Ready(listOf(line))).forEach { state ->
            assertThat(FocalCallJournalOffer.saysNothingWasKept(state)).isFalse()
        }
    }

    /** A1.14 — sur cache vide, la bulle dépliée attend le replay avec un indicateur sobre ; jamais sur une copie déjà là. */
    @Test fun `un journal qui charge sans rien a montrer affiche son attente`() {
        assertThat(FocalCallJournalOffer.showsWaiting(CallTranscriptState.Loading)).isTrue()
    }

    @Test fun `un journal pret, vide ou en echec n'affiche plus d'attente`() {
        val line = CallTranscriptLine(
            speakerName = "Awa", isLocal = false, elapsedLabel = "00:04", original = "Hi", translated = null, translatedLanguage = null,
        )
        listOf(CallTranscriptState.Absent, CallTranscriptState.Failed, CallTranscriptState.Ready(listOf(line))).forEach { state ->
            assertThat(FocalCallJournalOffer.showsWaiting(state)).isFalse()
        }
    }

    /** A1.14 — la copie chiffrée de l'appareil en lecture n'est pas une attente du réseau : ni indicateur, ni « vide ». */
    @Test fun `un journal dont la copie de l'appareil se lit n'affiche ni attente ni vide`() {
        assertThat(FocalCallJournalOffer.showsWaiting(CallTranscriptState.ReadingCopy)).isFalse()
        assertThat(FocalCallJournalOffer.saysNothingWasKept(CallTranscriptState.ReadingCopy)).isFalse()
        assertThat(CallTranscriptState.ReadingCopy.isVisible).isFalse()
    }
}
