package me.meeshy.sdk.model.link

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import org.junit.Test

/**
 * Ce que les liens d'un message attachent sous son texte (contrat #19331 § 5.1) : le PREMIER lien de contenu reçoit la
 * carte, après la vidéo et la carte de conversation du premier lien, avant l'aperçu générique ; un message que seul
 * l'appareil lit, ou d'un auteur sans compte, n'attache rien.
 */
class MessageLinkEmbedTest {

    private val id = "66f0c0ffee0000000000c0de"
    private val post = "https://meeshy.me/post/$id"
    private val site = "https://example.org/article"

    private fun choose(
        vararg urls: String,
        exposure: MessageLinkExposure = MessageLinkExposure.OPEN,
        conversationWebOrigin: String? = "https://meeshy.me",
        showsContentCards: Boolean = true,
    ) = MessageLinkEmbed.choose(urls.toList(), exposure, conversationWebOrigin, showsContentCards)

    @Test
    fun `a message without a link attaches nothing`() {
        assertThat(choose()).isEqualTo(MessageLinkEmbed.None)
    }

    @Test
    fun `the first content link gets the card, even after another site`() {
        assertThat(choose(post)).isEqualTo(MessageLinkEmbed.ContentCard(post, ContentLinkTarget.Content(id, PostType.POST)))
        assertThat(choose(site, "https://meeshy.me/l/Ab3xYz", post))
            .isEqualTo(MessageLinkEmbed.ContentCard("https://meeshy.me/l/Ab3xYz", ContentLinkTarget.Tracked("Ab3xYz")))
    }

    @Test
    fun `the card falls back on the generic preview of its own link`() {
        assertThat(choose(site, post).previewUrl).isEqualTo(post)
    }

    @Test
    fun `a conversation card on the first link keeps its place`() {
        assertThat(choose("https://meeshy.me/chat/club", post))
            .isEqualTo(MessageLinkEmbed.ConversationCard("https://meeshy.me/chat/club", ConversationCardTarget.ShareLink("club")))
    }

    @Test
    fun `a video on the first link keeps its place`() {
        val youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

        assertThat(choose(youtube, post)).isEqualTo(MessageLinkEmbed.Preview(youtube))
    }

    @Test
    fun `without a content link, or without a host for the cards, the generic preview of the first link stays`() {
        assertThat(choose(site, "https://meeshy.me/u/amani")).isEqualTo(MessageLinkEmbed.Preview(site))
        assertThat(choose(post, showsContentCards = false)).isEqualTo(MessageLinkEmbed.Preview(post))
        assertThat(choose("https://meeshy.me/chat/club", conversationWebOrigin = null)).isEqualTo(MessageLinkEmbed.Preview("https://meeshy.me/chat/club"))
    }

    @Test
    fun `a message read only on this device, or written without an account, lets no link out`() {
        assertThat(choose(post, site, exposure = MessageLinkExposure.SEALED)).isEqualTo(MessageLinkEmbed.None)
        assertThat(choose(post, site, exposure = MessageLinkExposure.INERT)).isEqualTo(MessageLinkEmbed.None)
        assertThat(choose(post).previewUrl).isNotNull()
        assertThat(MessageLinkEmbed.None.previewUrl).isNull()
    }

    @Test
    fun `the exposure is read on the message, the missing account first`() {
        assertThat(MessageLinkExposure.of(senderHasAccount = true, readOnlyOnDevice = false)).isEqualTo(MessageLinkExposure.OPEN)
        assertThat(MessageLinkExposure.of(senderHasAccount = true, readOnlyOnDevice = true)).isEqualTo(MessageLinkExposure.SEALED)
        assertThat(MessageLinkExposure.of(senderHasAccount = false, readOnlyOnDevice = false)).isEqualTo(MessageLinkExposure.INERT)
        assertThat(MessageLinkExposure.of(senderHasAccount = false, readOnlyOnDevice = true)).isEqualTo(MessageLinkExposure.INERT)
    }
}
