package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.MentionedUser
import me.meeshy.sdk.model.MessageSenderIdentity
import me.meeshy.sdk.model.MessageSourceKind
import org.junit.Test

class BubbleContentBuilderSenderTest {

    private object Prefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun message(
        sender: ApiMessageSender? = null,
        senderId: String? = "p1",
        source: String? = null,
        mentions: List<MentionedUser>? = null,
    ) = ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = senderId,
        content = "salut",
        messageSource = source,
        sender = sender,
        mentionedUsers = mentions,
    )

    private fun build(message: ApiMessage, session: MessageSenderIdentity.Session? = null) =
        BubbleContentBuilder.build(
            message = message,
            currentUserId = "me",
            preferences = Prefs,
            showSenderName = true,
            sessionIdentity = session,
        )

    private fun guest(username: String = "ano_x", type: String? = "anonymous") =
        ApiMessageSender(id = "p1", username = username, displayName = "Invité", type = type)

    private fun strings() = BubbleAccessibilityStrings(
        unknownSender = "inconnu", deleted = "supprimé", replyToAuthor = "%s", replyToExcerpt = "%1\$s %2\$s",
        replyToYou = "vous", images = "%d", videos = "%d", audios = "%d", location = "lieu", file = "%s",
        contactCard = "%s", contactCardAccount = "%s", viewOnceSealed = "v", viewOnce = "v", blurred = "f",
        edited = "e", pinned = "p", ephemeral = "é", reactions = "%s",
        delivery = BubbleDeliveryA11yStrings("a", "b", "c", "d", "e", "f", "g"),
        anonymousSender = "sans compte",
        sources = BubbleSourceA11yStrings(system = "système", agent = "agent"),
    )

    @Test
    fun `un invite de type anonymous porte le glyphe fantome`() {
        val content = build(message(guest()))
        assertThat(content.senderIsAnonymous).isTrue()
        assertThat(content.senderHasAccount).isFalse()
    }

    @Test
    fun `un inscrit au pseudo ano_ garde son avatar`() {
        val content = build(message(guest(username = "ano_bob", type = "user")))
        assertThat(content.senderIsAnonymous).isFalse()
        assertThat(content.senderHasAccount).isTrue()
    }

    @Test
    fun `mon echo allege reprend l'identite de ma session`() {
        val content = build(
            message(sender = null, senderId = "me"),
            session = MessageSenderIdentity.Session("Moi", "moi"),
        )
        assertThat(content.senderName).isEqualTo("Moi")
        assertThat(content.senderUsername).isEqualTo("moi")
    }

    @Test
    fun `la source est classee et hasAccount se deduit de la source`() {
        val content = build(message(sender = null, source = "agent"))
        assertThat(content.sourceKind).isEqualTo(MessageSourceKind.Agent)
        assertThat(content.senderHasAccount).isTrue()
    }

    @Test
    fun `les noms servis des mentions voyagent avec la bulle`() {
        val content = build(message(mentions = listOf(MentionedUser("u2", "ivan", "Ivan Petrov"))))
        assertThat(content.servedMentionNames).containsExactly("ivan", "Ivan Petrov")
    }

    @Test
    fun `l'etiquette parlee annonce l'expediteur, son statut anonyme et la source`() {
        val label = MessageBubbleAccessibilityLabel.compose(
            build(message(guest(), source = "agent")),
            strings(),
            Locale.FRANCE,
        )
        assertThat(label).startsWith("Invité, sans compte, agent")
    }

    @Test
    fun `un inscrit user ne dit ni sans compte ni source`() {
        val label = MessageBubbleAccessibilityLabel.compose(
            build(message(guest(type = "user"))),
            strings(),
            Locale.FRANCE,
        )
        assertThat(label).doesNotContain("sans compte")
    }
}
