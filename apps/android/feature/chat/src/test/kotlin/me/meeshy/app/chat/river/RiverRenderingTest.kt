package me.meeshy.app.chat.river

import com.google.common.truth.Truth.assertThat
import java.time.ZoneOffset
import java.util.Locale
import me.meeshy.sdk.model.reading.river.RiverGroupPosition
import me.meeshy.ui.component.StoryRingState
import org.junit.Test

class RiverRenderingTest {

    private fun render(vararg bubbles: me.meeshy.ui.component.bubble.BubbleContent): RiverRendering {
        val list = bubbles.toList()
        return RiverRenderingBuilder.build(
            geometry = RiverThreadMapping.geometry(list),
            bubbles = list,
            storyRing = { StoryRingState.None },
            zone = ZoneOffset.UTC,
            locale = Locale.FRANCE,
        )
    }

    @Test
    fun `chaque bulle de la loi a son contenu, indexe par rang et par message`() {
        val rendering = render(riverBubble("a", "alice", 0), riverBubble("b", "bob", 1))
        assertThat(rendering.contents.map { it.bubble.messageId }).containsExactly("a", "b").inOrder()
        assertThat(rendering.contentAt(1)?.bubble?.messageId).isEqualTo("b")
        assertThat(rendering.contentByMessageId["a"]?.senderDisplayName).isEqualTo("Alice")
        assertThat(rendering.contentAt(9)).isNull()
    }

    @Test
    fun `deux messages de suite d'une meme voix partagent leur contour, un avis coupe le groupe`() {
        val rendering = render(
            riverBubble("a1", "alice", 0),
            riverBubble("a2", "alice", 1),
            riverBubble("a3", "alice", 2),
            riverBubble("sys", "alice", 3, system = true),
            riverBubble("a4", "alice", 4),
        )
        val positions = rendering.contents.associate { it.bubble.messageId to it.groupPosition }
        assertThat(positions["a1"]).isEqualTo(RiverGroupPosition.HEAD)
        assertThat(positions["a2"]).isEqualTo(RiverGroupPosition.MIDDLE)
        assertThat(positions["a3"]).isEqualTo(RiverGroupPosition.TAIL)
        assertThat(positions["sys"]).isEqualTo(RiverGroupPosition.SOLO)
    }

    @Test
    fun `une citation tient sur une ligne et un avis n'a aucune identite`() {
        val rendering = render(
            riverBubble("a", "alice", 0),
            riverBubble("b", "bob", 1, replyToId = "a", replyToSenderName = "Alice", replyToText = "bonjour\n  tout   le monde"),
            riverBubble("sys", "alice", 2, system = true),
        )
        assertThat(rendering.contentByMessageId["b"]?.replyPreview)
            .isEqualTo(RiverReplyPreview("Alice", "bonjour tout le monde"))
        assertThat(rendering.contentByMessageId["a"]?.replyPreview).isNull()
        assertThat(rendering.contentByMessageId["sys"]?.identity).isNull()
        assertThat(rendering.contentByMessageId["a"]?.identity).isNotNull()
    }

    @Test
    fun `l'identite d'une voix sait de quelle conversation elle parle, pour y lire ou est le pair`() {
        val rendering = render(riverBubble("a", "alice", 0).copy(viewingConversationId = "c9"))
        assertThat(rendering.contentByMessageId["a"]?.identity?.conversationId).isEqualTo("c9")
    }

    @Test
    fun `un message chiffre ou brule ne rend jamais son texte`() {
        val rendering = render(
            riverBubble("e", "alice", 0, endToEnd = true),
            riverBubble("v", "bob", 1, viewOnce = true, viewOnceOpened = true),
            riverBubble("n", "dina", 2),
        )
        assertThat(rendering.contentByMessageId["e"]?.protection).isEqualTo(RiverProtection.END_TO_END_SEALED)
        assertThat(rendering.contentByMessageId["v"]?.protection).isEqualTo(RiverProtection.BURNED)
        assertThat(rendering.contentByMessageId["n"]?.protection).isEqualTo(RiverProtection.NONE)
    }

    @Test
    fun `un ephemere se retire a son echeance, comme dans le fil, et un message ordinaire jamais`() {
        val rendering = render(
            riverBubble("eph", "alice", 0, expiresAtIso = "2026-10-27T10:05:00.000Z"),
            riverBubble("n", "bob", 1),
        )
        val ephemeral = rendering.contentByMessageId.getValue("eph")
        val deadline = java.time.Instant.parse("2026-10-27T10:05:00Z").toEpochMilli()
        assertThat(ephemeral.expiresAtMs).isEqualTo(deadline)
        assertThat(RiverRenderingBuilder.isExpired(ephemeral, deadline - 1)).isFalse()
        assertThat(RiverRenderingBuilder.isExpired(ephemeral, deadline)).isTrue()
        assertThat(RiverRenderingBuilder.isExpired(rendering.contentByMessageId.getValue("n"), Long.MAX_VALUE)).isFalse()
    }

    @Test
    fun `l'echelle du temps est resolue une fois avec le rendu, absente quand rien ne se gradue`() {
        assertThat(render(riverBubble("a", "alice", 0), riverBubble("b", "bob", 90)).timeScale).isNotNull()
        assertThat(render(riverBubble("a", "alice", 0)).timeScale).isNull()
    }

    @Test
    fun `l'anneau de story est injecte par l'appelant, et lu pour l'identifiant de la voix`() {
        val list = listOf(riverBubble("a", "alice", 0), riverBubble("b", "bob", 1))
        val rendering = RiverRenderingBuilder.build(
            geometry = RiverThreadMapping.geometry(list),
            bubbles = list,
            storyRing = { userId -> if (userId == "alice") StoryRingState.Unread else StoryRingState.None },
            zone = ZoneOffset.UTC,
        )
        assertThat(rendering.contentByMessageId["a"]?.identity?.storyRing).isEqualTo(StoryRingState.Unread)
        assertThat(rendering.contentByMessageId["b"]?.identity?.storyRing).isEqualTo(StoryRingState.None)
    }
}
