package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #18975 — un envoi chiffré qui n'a pas pu partir rend au composeur le texte et la réponse du geste, sans rien écraser. */
class EndToEndSendRestorationTest {

    @Test
    fun `un envoi chiffre en echec rend le texte et la reponse au composeur vide`() {
        val restored = EndToEndSendRestoration.restoration("rendez-vous à 8 h", "m42", currentText = "", currentReplyToId = null)

        assertThat(restored).isEqualTo(EndToEndSendRestoration.Restored(text = "rendez-vous à 8 h", replyToId = "m42"))
    }

    @Test
    fun `ce qui a ete ecrit ou choisi pendant l'envoi n'est jamais ecrase`() {
        val restored = EndToEndSendRestoration.restoration("ancien", "m1", currentText = "nouveau", currentReplyToId = "m2")

        assertThat(restored).isEqualTo(EndToEndSendRestoration.Restored(text = null, replyToId = null))
    }

    @Test
    fun `un composeur qui ne porte que des blancs reprend le texte, un envoi sans reponse n'en invente pas`() {
        val restored = EndToEndSendRestoration.restoration("salut", null, currentText = "  ", currentReplyToId = null)

        assertThat(restored).isEqualTo(EndToEndSendRestoration.Restored(text = "salut", replyToId = null))
    }
}
