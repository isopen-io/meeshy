package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.card.PostCommentCardPart
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.sdk.model.card.PostCommentCardThreadLine
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

/**
 * #13922 — l'atelier « Imagine » peint un message OU la carte composée d'un commentaire : la même carte, le même moteur,
 * Enregistrer et Partager. Le message se relit vivant ; la carte d'un commentaire arrive déjà composée, dans sa langue servie.
 */
class CardSourceTest {

    private val viewer = CardViewer(id = "me", displayName = "Moi", username = "moi")

    private val thread = PostCommentCardSubject(
        quoted = PostCommentCardPart("Awa", "Le coucher de soleil à Dakar", "awa"),
        reply = PostCommentCardPart("Fil de commentaires", "Bob : Magnifique !\nCleo : Tu étais où ?", null),
        thread = listOf(PostCommentCardThreadLine("Bob : Magnifique !", 0), PostCommentCardThreadLine("Cleo : Tu étais où ?", 1)),
        sentAtMillis = 2_000L,
        quotedAtMillis = 1_000L,
        media = emptyList(),
    )

    @Test
    fun `a composed comment card is painted as composed, the support quoted and the thread block in reply`() {
        val source = ComposedCardSource("c1", CardSubjects.of(thread))
        val subject = source.subject(language = "en")

        assertThat(subject.quoted).isEqualTo(CardPart("Awa", "Le coucher de soleil à Dakar", "awa"))
        assertThat(subject.reply).isEqualTo(CardPart("Fil de commentaires", "Bob : Magnifique !\nCleo : Tu étais où ?", null))
        assertThat(subject.sentAtMillis).isEqualTo(2_000L)
        assertThat(subject.quotedAtMillis).isEqualTo(1_000L)
        assertThat(source.languages).isEmpty()
        assertThat(source.stillAllowed(nowMillis = 0L)).isTrue()
        assertThat(source.key).isEqualTo("c1")
    }

    @Test
    fun `a message is reread live, and stops imaging the moment it is deleted`() {
        fun bubble(isDeleted: Boolean) = BubbleContent(
            messageId = "507f1f77bcf86cd799439011", text = "Bonjour", isOutgoing = false, isTranslated = false,
            isShowingOriginal = false, originalText = null, languageStrip = emptyList(), senderName = "Awa",
            showSenderName = true, senderUsername = "awa", isEdited = false, isDeleted = isDeleted,
            createdAtIso = "2026-10-27T10:00:00.000Z",
        )

        assertThat(BubbleCardSource(bubble(isDeleted = false), viewer, openedAt = 0L).subject(null)?.reply?.text).isEqualTo("Bonjour")
        assertThat(BubbleCardSource(bubble(isDeleted = false), viewer, openedAt = 0L).stillAllowed(0L)).isTrue()
        assertThat(BubbleCardSource(bubble(isDeleted = true), viewer, openedAt = 0L).stillAllowed(0L)).isFalse()
    }
}
