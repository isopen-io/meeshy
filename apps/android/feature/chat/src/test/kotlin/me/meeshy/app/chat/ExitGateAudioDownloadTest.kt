package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.fullscreen.AudioFullscreenDownloadOffer
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

/**
 * Le bouton Télécharger du plein écran audio relève du portillon de sortie (iOS `ContentExitGated`) : un contenu PROTÉGÉ n'est
 * jamais une page, donc n'a jamais de bouton ; une page ordinaire n'en a un que si la loi de sortie de son porteur laisse
 * enregistrer, et jamais dans une conversation chiffrée de bout en bout.
 */
class ExitGateAudioDownloadTest {

    private fun thread(message: BubbleContent) = listOf(message)

    private fun pageCount(message: BubbleContent, startId: String = "a") =
        ChatAudioFullscreenSources.of(startId, thread(message), "conv", "Famille")?.size ?: 0

    private val plain get() = voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"))

    @Test
    fun `une vue unique n ouvre aucune page donc aucun bouton`() {
        assertThat(pageCount(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"), isViewOnce = true))).isEqualTo(0)
    }

    @Test
    fun `un message floute n ouvre aucune page`() {
        assertThat(pageCount(plain.copy(isBlurred = true))).isEqualTo(0)
    }

    @Test
    fun `un message ephemere n ouvre aucune page`() {
        assertThat(pageCount(plain.copy(expiresAtIso = "2026-11-05T08:00:00Z"))).isEqualTo(0)
    }

    @Test
    fun `un message chiffre de bout en bout n ouvre aucune page`() {
        assertThat(pageCount(plain.copy(isEndToEndSealed = true))).isEqualTo(0)
    }

    @Test
    fun `une piece protegee n ouvre aucune page`() {
        assertThat(pageCount(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a", isProtected = true)))).isEqualTo(0)
    }

    @Test
    fun `une page ordinaire offre Telecharger quand la loi de sortie de son porteur le permet`() {
        val page = ChatAudioFullscreenSources.of("a", thread(plain), "conv", "Famille")!!.single()

        assertThat(page.exitOffer).isEqualTo(MessageExitOffer.Unrestricted)
        assertThat(AudioFullscreenDownloadOffer.offers(page.exitOffer, conversationIsEndToEnd = false)).isTrue()
    }

    @Test
    fun `un vocal cite hors de la fenetre n a pas de loi de sortie connue donc pas de bouton, echec ferme`() {
        val quoting = voiceMessage("m5", "2026-11-04T08:04:00Z").copy(replyToId = "gone", replyToSenderName = "Lina", replyToAudio = voice("x"))
        val page = ChatAudioFullscreenSources.of("x", thread(quoting), "conv", "Famille")!!.single()

        assertThat(page.exitOffer).isNull()
        assertThat(AudioFullscreenDownloadOffer.offers(page.exitOffer, conversationIsEndToEnd = false)).isFalse()
    }

    @Test
    fun `un porteur qui tient un flou n offre pas Telecharger`() {
        val held = plain.copy(exitOffer = MessageExitOffer.Unrestricted.copy(holdsBlur = true))
        val page = ChatAudioFullscreenSources.of("a", thread(held), "conv", "Famille")!!.single()

        assertThat(AudioFullscreenDownloadOffer.offers(page.exitOffer, conversationIsEndToEnd = false)).isFalse()
    }

    @Test
    fun `une conversation chiffree de bout en bout n offre jamais Telecharger`() {
        val open = plain.copy(exitOffer = MessageExitOffer.Unrestricted)
        val page = ChatAudioFullscreenSources.of("a", thread(open), "conv", "Famille")!!.single()

        assertThat(AudioFullscreenDownloadOffer.offers(page.exitOffer, conversationIsEndToEnd = true)).isFalse()
    }
}
