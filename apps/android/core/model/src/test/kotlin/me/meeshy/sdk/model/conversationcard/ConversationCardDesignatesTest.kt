package me.meeshy.sdk.model.conversationcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import org.junit.Test

class ConversationCardDesignatesTest {
    private fun card(conversationId: String?) =
        ConversationCardResolution.Card(ConversationCard(kind = ConversationCardKind.SHARE_LINK, conversationId = conversationId))

    @Test fun `un lien direct designe sa conversation quelle que soit la resolution`() {
        val direct = ConversationCardTarget.Direct("c1")
        assertThat(ConversationCardResolution.PrivateConversation.designates("c1", direct)).isTrue()
        assertThat(ConversationCardResolution.Unavailable.designates("c2", direct)).isFalse()
    }

    @Test fun `un lien de partage designe ce que le serveur a servi`() {
        val share = ConversationCardTarget.ShareLink("abc")
        assertThat(card("c1").designates("c1", share)).isTrue()
        assertThat(card("c2").designates("c1", share)).isFalse()
    }

    @Test fun `un lien de partage vu par un non-membre ne designe aucune conversation`() {
        assertThat(card(null).designates("c1", ConversationCardTarget.ShareLink("abc"))).isFalse()
    }

    @Test fun `un verdict 4xx autre que 403 ou 404 sur un lien direct est indisponible et un 5xx n'est pas un verdict`() {
        val direct = ConversationCardTarget.Direct("c1")
        assertThat(ConversationCardResolution.definitiveVerdict(410, direct)).isEqualTo(ConversationCardResolution.Unavailable)
        assertThat(ConversationCardResolution.definitiveVerdict(404, ConversationCardTarget.ShareLink("a"))).isEqualTo(ConversationCardResolution.Unavailable)
        assertThat(ConversationCardResolution.definitiveVerdict(500, direct)).isNull()
        assertThat(ConversationCardResolution.definitiveVerdict(null, direct)).isNull()
    }
}
