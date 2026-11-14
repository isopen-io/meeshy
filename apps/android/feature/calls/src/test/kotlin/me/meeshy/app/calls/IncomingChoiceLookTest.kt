package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.IncomingCallAction
import me.meeshy.sdk.model.call.IncomingCallLayout
import me.meeshy.ui.icons.MeeshyIcons
import org.junit.Test

/** Vue P17 (`docs/product/appels-vue-finale/planche.html`) : Refuser · Sans vidéo · Répondre, chacun avec son glyphe et sa teinte. */
class IncomingChoiceLookTest {

    @Test
    fun `Sans video est un combine blanc sur un verre neutre, legende blanche`() {
        val look = IncomingChoiceLooks.of(IncomingCallAction.AnswerWithoutVideo, acceptsVideo = true, layout = IncomingCallLayout.VideoPreview)

        assertThat(look.icon).isEqualTo(MeeshyIcons.Call)
        assertThat(look.glyph).isEqualTo(CallPalette.Ink)
        assertThat(look.caption).isEqualTo(CallPalette.Ink)
        assertThat(look.fill).isNull()
    }

    @Test
    fun `Refuser garde son disque rouge et son combine raccroche`() {
        val look = IncomingChoiceLooks.of(IncomingCallAction.Decline, acceptsVideo = true, layout = IncomingCallLayout.VideoPreview)

        assertThat(look.icon).isEqualTo(MeeshyIcons.CallEnd)
        assertThat(look.fill).isEqualTo(CallPalette.Decline)
        assertThat(look.glyph).isEqualTo(CallPalette.Ink)
    }

    @Test
    fun `Repondre montre la camera sur un appel video et le combine sur un appel audio`() {
        assertThat(IncomingChoiceLooks.of(IncomingCallAction.Accept, acceptsVideo = true, layout = IncomingCallLayout.VideoPreview).icon).isEqualTo(MeeshyIcons.Video)
        assertThat(IncomingChoiceLooks.of(IncomingCallAction.Accept, acceptsVideo = false, layout = IncomingCallLayout.VideoPreview).icon).isEqualTo(MeeshyIcons.Call)
        assertThat(IncomingChoiceLooks.of(IncomingCallAction.Accept, acceptsVideo = true, layout = IncomingCallLayout.VideoPreview).fill).isEqualTo(CallPalette.Accept)
    }

    @Test
    fun `P17_10 - sur la vue P17 les legendes de Refuser et Repondre sont blanches, comme iOS`() {
        val decline = IncomingChoiceLooks.of(IncomingCallAction.Decline, acceptsVideo = true, layout = IncomingCallLayout.VideoPreview)
        val accept = IncomingChoiceLooks.of(IncomingCallAction.Accept, acceptsVideo = true, layout = IncomingCallLayout.VideoPreview)

        assertThat(decline.caption).isEqualTo(CallPalette.Ink)
        assertThat(accept.caption).isEqualTo(CallPalette.Ink)
    }

    @Test
    fun `P17_10 - l'ecran audio garde les legendes teintees (iOS audio_whiteCaptions faux)`() {
        val decline = IncomingChoiceLooks.of(IncomingCallAction.Decline, acceptsVideo = false, layout = IncomingCallLayout.Audio)
        val accept = IncomingChoiceLooks.of(IncomingCallAction.Accept, acceptsVideo = false, layout = IncomingCallLayout.Audio)

        assertThat(decline.caption).isEqualTo(CallPalette.Decline)
        assertThat(accept.caption).isEqualTo(CallPalette.Accept)
    }
}
