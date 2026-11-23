package me.meeshy.ui.component.talkie

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.TalkieHoldDelivery
import me.meeshy.sdk.model.relation.TalkieSendOutcome
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.ui.R
import org.junit.Test

/** Le talkie vers un téléphone injoignable se dit « Laisser un message vocal » (#20241) ; sans état servi, rien ne change. */
class TalkieWordingDeliveryTest {

    @Test
    fun `au repos le bouton dit le geste du mode`() {
        assertThat(TalkieWording.label(TalkieSendPhase.Idle, waking = false)).isEqualTo(R.string.talkie_send_hold)
        assertThat(TalkieWording.label(TalkieSendPhase.Idle, waking = false, delivery = TalkieHoldDelivery.VOICE_MESSAGE))
            .isEqualTo(R.string.talkie_send_leave_voice)
        assertThat(TalkieWording.label(TalkieSendPhase.RecordingCopy("u"), waking = false, delivery = TalkieHoldDelivery.VOICE_MESSAGE))
            .isEqualTo(R.string.talkie_send_recording_copy)
    }

    @Test
    fun `talkback nomme l'autre et dit ce que le geste fait partir`() {
        assertThat(TalkieWording.holdA11y(TalkieHoldDelivery.LIVE)).isEqualTo(R.string.talkie_send_hold_a11y)
        assertThat(TalkieWording.holdA11y(TalkieHoldDelivery.VOICE_MESSAGE)).isEqualTo(R.string.talkie_send_leave_voice_a11y)
        assertThat(TalkieWording.holdHint(TalkieHoldDelivery.VOICE_MESSAGE)).isEqualTo(R.string.talkie_send_hold_hint)
        assertThat(TalkieWording.holdReminder(TalkieHoldDelivery.VOICE_MESSAGE)).isEqualTo(R.string.talkie_send_leave_voice)
    }

    @Test
    fun `un message vocal choisi ne se dit pas comme un repli`() {
        assertThat(TalkieWording.notice(TalkieSendOutcome.VOICE, TalkieHoldDelivery.VOICE_MESSAGE)).isEqualTo(R.string.talkie_send_sent_as_voice)
        assertThat(TalkieWording.notice(TalkieSendOutcome.VOICE, TalkieHoldDelivery.LIVE)).isEqualTo(R.string.talkie_send_voice_copy)
        assertThat(TalkieWording.notice(TalkieSendOutcome.MIC_DENIED, TalkieHoldDelivery.VOICE_MESSAGE)).isEqualTo(R.string.talkie_send_mic_denied)
    }
}
