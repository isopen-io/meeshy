package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Vue P17 (`docs/product/appels-vue-finale.md`) et iOS `IncomingCallChoices` : ce que propose l'écran d'appel entrant. */
class IncomingCallChoicesTest {

    @Test
    fun `un appel video propose Refuser, Sans video puis Repondre, Repondre au bord droit sous le pouce`() {
        assertThat(IncomingCallChoices.actions(isVideoCall = true))
            .containsExactly(IncomingCallAction.Decline, IncomingCallAction.AnswerWithoutVideo, IncomingCallAction.Accept)
            .inOrder()
    }

    @Test
    fun `un appel audio n'a pas de Sans video`() {
        assertThat(IncomingCallChoices.actions(isVideoCall = false))
            .containsExactly(IncomingCallAction.Decline, IncomingCallAction.Accept)
            .inOrder()
    }

    @Test
    fun `trois boutons se resserrent pour tenir sur un ecran etroit, deux gardent leur respiration`() {
        assertThat(IncomingCallChoices.buttonSpacingDp(count = 3)).isEqualTo(36)
        assertThat(IncomingCallChoices.buttonSpacingDp(count = 2)).isEqualTo(60)
    }
}
