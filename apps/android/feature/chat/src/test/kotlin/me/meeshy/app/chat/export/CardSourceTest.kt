package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.card.PostCommentCardMedia
import me.meeshy.sdk.model.card.PostCommentCardMediaAuthor
import me.meeshy.sdk.model.card.PostCommentCardMediaKind
import me.meeshy.sdk.model.card.PostCommentCardPart
import me.meeshy.sdk.model.card.PostCommentCardPlacedMedia
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
        assertThat(subject.reply).isEqualTo(
            CardPart(
                "Fil de commentaires", "Bob : Magnifique !\nCleo : Tu étais où ?", null,
                thread = listOf(CardThreadLine("Bob : Magnifique !", 0), CardThreadLine("Cleo : Tu étais où ?", 1)),
            ),
        )
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

    @Test
    fun `a comment card paints the support's visual as its hero and the comments' visuals under the reply, never a sound or a piece without a file`() {
        val awa = PostCommentCardMediaAuthor("Awa", "awa", quoted = true)
        val bob = PostCommentCardMediaAuthor("Bob", "bob", quoted = false)
        val card = thread.copy(
            media = listOf(
                PostCommentCardPlacedMedia(PostCommentCardMedia("p", PostCommentCardMediaKind.IMAGE, url = "https://cdn.test/p.jpg", width = 1080, height = 1350), awa, hero = true),
                PostCommentCardPlacedMedia(
                    PostCommentCardMedia("c", PostCommentCardMediaKind.VIDEO, url = "https://cdn.test/c.mp4", posterUrl = "https://cdn.test/c.jpg", width = 1920, height = 1080),
                    bob, hero = false,
                ),
                PostCommentCardPlacedMedia(PostCommentCardMedia("s", PostCommentCardMediaKind.AUDIO, url = "https://cdn.test/s.m4a"), bob, hero = false),
                PostCommentCardPlacedMedia(PostCommentCardMedia("x", PostCommentCardMediaKind.IMAGE), bob, hero = false),
            ),
        )

        val subject = CardSubjects.of(card)

        assertThat(subject.hero).isEqualTo(CardMedia("p", CardMediaKind.IMAGE, "https://cdn.test/p.jpg", aspect = 0.8))
        assertThat(subject.media).containsExactly(CardMedia("c", CardMediaKind.VIDEO, "https://cdn.test/c.mp4", "https://cdn.test/c.jpg", 1920.0 / 1080))
        assertThat(subject.pictured.map { it.id }).containsExactly("p", "c").inOrder()
    }

    @Test
    fun `a support without a file to paint opens no hero, its line stays the quote`() {
        val awa = PostCommentCardMediaAuthor("Awa", "awa", quoted = true)
        val card = thread.copy(media = listOf(PostCommentCardPlacedMedia(PostCommentCardMedia("p", PostCommentCardMediaKind.IMAGE), awa, hero = true)))

        val subject = CardSubjects.of(card)

        assertThat(subject.hero).isNull()
        assertThat(subject.media).isEmpty()
        assertThat(subject.quoted?.text).isEqualTo("Le coucher de soleil à Dakar")
    }

    @Test
    fun `a file served by path is reached through the gateway, and without a base it is not painted`() {
        val awa = PostCommentCardMediaAuthor("Awa", "awa", quoted = true)
        val card = thread.copy(
            media = listOf(PostCommentCardPlacedMedia(PostCommentCardMedia("p", PostCommentCardMediaKind.IMAGE, url = "/api/v1/attachments/file/p.jpg"), awa, hero = true)),
        )

        assertThat(CardSubjects.of(card, mediaBaseUrl = "https://gate.test/api/v1").hero?.url).isEqualTo("https://gate.test/api/v1/attachments/file/p.jpg")
        assertThat(CardSubjects.of(card).hero).isNull()
    }
}
