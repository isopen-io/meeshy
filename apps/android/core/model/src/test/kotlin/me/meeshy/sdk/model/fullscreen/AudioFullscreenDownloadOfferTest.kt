package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
import org.junit.Test

class AudioFullscreenDownloadOfferTest {

    @Test
    fun `un vocal ordinaire d une conversation en clair s enregistre`() {
        assertThat(AudioFullscreenDownloadOffer.offers(MessageExitOffer.Unrestricted, conversationIsEndToEnd = false)).isTrue()
    }

    @Test
    fun `une conversation chiffree de bout en bout n offre jamais l enregistrement`() {
        assertThat(AudioFullscreenDownloadOffer.offers(MessageExitOffer.Unrestricted, conversationIsEndToEnd = true)).isFalse()
    }

    @Test
    fun `une page dont la loi de sortie est inconnue n offre rien`() {
        assertThat(AudioFullscreenDownloadOffer.offers(null, conversationIsEndToEnd = false)).isFalse()
    }

    @Test
    fun `un vocal floute ou ephemere ne sort pas de Meeshy`() {
        val blurred = MessageExitOffer.Unrestricted.copy(holdsBlur = true)
        val flame = MessageExitOffer.Unrestricted.copy(law = ContentExitLaw.timedFlame(60))

        assertThat(AudioFullscreenDownloadOffer.offers(blurred, conversationIsEndToEnd = false)).isFalse()
        assertThat(AudioFullscreenDownloadOffer.offers(flame, conversationIsEndToEnd = false)).isFalse()
    }
}
