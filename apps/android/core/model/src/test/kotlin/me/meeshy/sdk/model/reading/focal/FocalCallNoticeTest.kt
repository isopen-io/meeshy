package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.CallSummaryMetadata.MediaType
import me.meeshy.sdk.model.CallSummaryMetadata.Outcome
import org.junit.Test

class FocalCallNoticeTest {

    private fun summary(
        outcome: Outcome = Outcome.COMPLETED,
        type: MediaType = MediaType.AUDIO,
        duration: Int = 49,
        live: Boolean = false,
        endedByInitiator: Boolean? = null,
        bytes: Int? = null,
    ) = CallSummaryMetadata(
        callId = "c1", initiatorId = "u1", callType = type, outcome = outcome, durationSeconds = duration,
        bytesTotal = bytes, bytesEstimated = false, networkQuality = null, isLive = live, endedByInitiator = endedByInitiator,
    )

    @Test fun `un appel video termine sortant porte son titre et sa duree`() {
        val notice = FocalCallNoticePresenter.of(summary(type = MediaType.VIDEO, bytes = 2048), isOutgoing = true)
        assertThat(notice.title).isEqualTo(FocalCallTitle.VideoOutgoing)
        assertThat(notice.tone).isEqualTo(FocalCallTone.Accent)
        assertThat(notice.durationLabel).isNotNull()
        assertThat(notice.dataLabel).isNotNull()
    }

    @Test fun `un appel manque est en erreur et sans duree`() {
        val notice = FocalCallNoticePresenter.of(summary(outcome = Outcome.MISSED, duration = 0), isOutgoing = false)
        assertThat(notice.title).isEqualTo(FocalCallTitle.MissedAudio)
        assertThat(notice.tone).isEqualTo(FocalCallTone.Error)
        assertThat(notice.durationLabel).isNull()
    }

    @Test fun `un appel manque termine par son initiateur est annule chez lui seulement`() {
        val missed = summary(outcome = Outcome.MISSED, duration = 0, endedByInitiator = true)
        assertThat(FocalCallNoticePresenter.of(missed, isOutgoing = true).title).isEqualTo(FocalCallTitle.Cancelled)
        assertThat(FocalCallNoticePresenter.of(missed, isOutgoing = false).title).isEqualTo(FocalCallTitle.MissedAudio)
    }

    @Test fun `un appel en cours se lit avant son outcome et se rejoint`() {
        val live = summary(live = true, type = MediaType.VIDEO, duration = 30)
        val notice = FocalCallNoticePresenter.of(live, isOutgoing = false)
        assertThat(notice.title).isEqualTo(FocalCallTitle.LiveVideo)
        assertThat(notice.isLive).isTrue()
        assertThat(notice.durationLabel).isNull()
    }

    @Test fun `un refus se dit selon le cote et un echec est une alerte`() {
        assertThat(FocalCallNoticePresenter.of(summary(outcome = Outcome.REJECTED), true).title).isEqualTo(FocalCallTitle.RejectedSent)
        assertThat(FocalCallNoticePresenter.of(summary(outcome = Outcome.REJECTED), false).title).isEqualTo(FocalCallTitle.RejectedReceived)
        val failed = FocalCallNoticePresenter.of(summary(outcome = Outcome.FAILED, type = MediaType.VIDEO), true)
        assertThat(failed.title).isEqualTo(FocalCallTitle.FailedVideo)
        assertThat(failed.tone).isEqualTo(FocalCallTone.Warning)
    }

    @Test fun `la rangee speciale suit la priorite avis puis supprime`() {
        fun route(deleted: Boolean = false, system: Boolean = false, call: Boolean = false, join: Boolean = false, text: Boolean = false) =
            FocalSpecialRowRouting.of(deleted, system, call, join, text)
        assertThat(route()).isEqualTo(FocalSpecialRow.None)
        assertThat(route(deleted = true)).isEqualTo(FocalSpecialRow.Deleted)
        assertThat(route(system = true, call = true, join = true, text = true)).isEqualTo(FocalSpecialRow.CallNotice)
        assertThat(route(system = true, join = true, text = true)).isEqualTo(FocalSpecialRow.JoinNotice)
        assertThat(route(system = true, text = true)).isEqualTo(FocalSpecialRow.SystemNotice)
        assertThat(route(system = true)).isEqualTo(FocalSpecialRow.Empty)
    }
}
