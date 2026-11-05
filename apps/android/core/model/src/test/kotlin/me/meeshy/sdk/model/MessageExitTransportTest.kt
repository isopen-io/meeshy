package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MessageExitTransportTest {

    private fun offer(
        law: ContentExitLaw = ContentExitLaw.Ordinary,
        holdsBlur: Boolean = false,
        isEncrypted: Boolean = false,
    ) = MessageExitOffer(law, holdsBlur = holdsBlur, isEncrypted = isEncrypted)

    private fun copied(text: String, offer: MessageExitOffer): List<String> {
        val sink = mutableListOf<String>()
        MessageExitTransport.copy(text, offer, sink::add)
        return sink
    }

    @Test
    fun `un message ordinaire laisse copier le texte affiche`() {
        assertThat(copied("Bonjour", offer())).containsExactly("Bonjour")
        assertThat(MessageExitTransport.copy("Bonjour", offer()) { }).isTrue()
    }

    @Test
    fun `une vue unique refuse la copie et ne touche pas au presse-papiers`() {
        val sink = copied("secret", offer(law = ContentExitLaw.ViewOnce))
        assertThat(sink).isEmpty()
        assertThat(MessageExitTransport.copy("secret", offer(law = ContentExitLaw.ViewOnce)) { }).isFalse()
    }

    @Test
    fun `une flamme refuse la copie`() {
        assertThat(copied("brule", offer(law = ContentExitLaw.timedFlame(60)))).isEmpty()
    }

    @Test
    fun `un message floute refuse la copie`() {
        assertThat(copied("flou", offer(holdsBlur = true))).isEmpty()
    }

    @Test
    fun `un message chiffre se copie une fois dechiffre mais ne se transfere pas`() {
        val encrypted = offer(isEncrypted = true)
        assertThat(copied("dechiffre", encrypted)).containsExactly("dechiffre")
        assertThat(encrypted.isForwardable).isFalse()
    }

    @Test
    fun `le partage suit la meme offre`() {
        assertThat(MessageExitTransport.mayShare(offer())).isTrue()
        assertThat(MessageExitTransport.mayShare(offer(law = ContentExitLaw.ViewOnce))).isFalse()
        assertThat(MessageExitTransport.mayShare(offer(law = ContentExitLaw.timedFlame(60)))).isFalse()
        assertThat(MessageExitTransport.mayShare(offer(holdsBlur = true))).isFalse()
    }

    @Test
    fun `un texte vide n est pas copie`() {
        assertThat(copied("", offer())).isEmpty()
    }
}
