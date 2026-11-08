package me.meeshy.app.calls

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Videocam
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.IncomingCallAction
import org.junit.Test

/** Vue P17 (`docs/product/appels-vue-finale/planche.html`) : Refuser · Sans vidéo · Répondre, chacun avec son glyphe et sa teinte. */
class IncomingChoiceLookTest {

    @Test
    fun `Sans video est un combine blanc sur un verre neutre, legende blanche`() {
        val look = IncomingChoiceLooks.of(IncomingCallAction.AnswerWithoutVideo, isVideoCall = true)

        assertThat(look.icon).isEqualTo(Icons.Filled.Call)
        assertThat(look.glyph).isEqualTo(CallPalette.Ink)
        assertThat(look.caption).isEqualTo(CallPalette.Ink)
        assertThat(look.fill).isEqualTo(CallGlassTone.OverPicture.neutralFill)
    }

    @Test
    fun `Refuser garde son disque rouge et son combine raccroche`() {
        val look = IncomingChoiceLooks.of(IncomingCallAction.Decline, isVideoCall = true)

        assertThat(look.icon).isEqualTo(Icons.Filled.CallEnd)
        assertThat(look.fill).isEqualTo(CallPalette.Decline)
        assertThat(look.glyph).isEqualTo(CallPalette.Ink)
    }

    @Test
    fun `Repondre montre la camera sur un appel video et le combine sur un appel audio`() {
        assertThat(IncomingChoiceLooks.of(IncomingCallAction.Accept, isVideoCall = true).icon).isEqualTo(Icons.Filled.Videocam)
        assertThat(IncomingChoiceLooks.of(IncomingCallAction.Accept, isVideoCall = false).icon).isEqualTo(Icons.Filled.Call)
        assertThat(IncomingChoiceLooks.of(IncomingCallAction.Accept, isVideoCall = true).fill).isEqualTo(CallPalette.Accept)
    }
}
