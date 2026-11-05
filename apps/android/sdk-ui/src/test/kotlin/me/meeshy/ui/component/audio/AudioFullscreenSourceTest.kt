package me.meeshy.ui.component.audio

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.MessageTranscription
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

/** Les adaptateurs du plein écran audio : ce qu'une bulle, un post, un commentaire ou un réel deviennent en page. */
class AudioFullscreenSourceTest {

    private fun bubble(vararg audios: BubbleAudio, isViewOnce: Boolean = false, isDeleted: Boolean = false) = BubbleContent(
        messageId = "m1",
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = "Nour",
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = "2026-11-04T08:00:00Z",
        senderId = "nour",
        senderAvatarUrl = "https://cdn.meeshy.me/nour.jpg",
        senderRing = ServedProfileDecorItem(pack = "p", item = "i"),
        audios = audios.toList(),
        isViewOnce = isViewOnce,
    )

    private fun voice(id: String = "a1", url: String? = "https://cdn.meeshy.me/$id.m4a") = BubbleAudio(
        attachmentId = id,
        url = url,
        durationSeconds = 12,
        transcriptionText = "Bonjour",
        audioLanguage = "fr",
        isAudioTranslated = true,
        lastPlayPositionMs = 4_000,
    )

    @Test
    fun `une page de la conversation emporte la loi de sortie de son porteur, une page de post n en a aucune`() {
        val blurred = MessageExitOffer.Unrestricted.copy(holdsBlur = true)
        val page = AudioFullscreenSource.fromBubble(bubble(voice()).copy(exitOffer = blurred), voice(), "c1", "Famille")!!
        val post = AudioFullscreenSource.fromFeed(
            media = FeedMedia(id = "p1", type = FeedMediaType.AUDIO, url = "https://cdn.meeshy.me/p1.m4a"),
            author = ProfileSheetUser(username = "ana"),
            createdAtIso = "2026-11-04T08:00:00Z",
            carrierId = "post1",
            contextName = "Fil",
        )

        assertThat(page.exitOffer).isEqualTo(blurred)
        assertThat(post?.exitOffer).isNull()
    }

    @Test
    fun `une bulle ordinaire devient une page avec sa piste servie, son auteur et sa consommation`() {
        val source = AudioFullscreenSource.fromBubble(bubble(voice()), voice(), conversationId = "c1", contextName = "Famille")!!

        assertThat(source.id).isEqualTo("a1")
        assertThat(source.url).isEqualTo("https://cdn.meeshy.me/a1.m4a")
        assertThat(source.durationMs).isEqualTo(12_000L)
        assertThat(source.authorName).isEqualTo("Nour")
        assertThat(source.author.avatarUrl).isEqualTo("https://cdn.meeshy.me/nour.jpg")
        assertThat(source.authorRing).isEqualTo(ServedProfileDecorItem(pack = "p", item = "i"))
        assertThat(source.trackLanguage).isEqualTo("fr")
        assertThat(source.createdAtEpochMs).isEqualTo(java.time.Instant.parse("2026-11-04T08:00:00Z").toEpochMilli())
        assertThat(source.servedConsumption).isEqualTo(MeeshyMediaConsumption(lastPlayPositionMs = 4_000))
    }

    @Test
    fun `l entree de file reprend la piste, la conversation et la consommation, jamais protegee`() {
        val queued = AudioFullscreenSource.fromBubble(bubble(voice()), voice(), "c1", "Famille")!!.queuedAudio()

        assertThat(queued.attachmentId).isEqualTo("a1")
        assertThat(queued.messageId).isEqualTo("m1")
        assertThat(queued.conversationId).isEqualTo("c1")
        assertThat(queued.trackLanguage).isEqualTo("fr")
        assertThat(queued.isTranslatedTrack).isTrue()
        assertThat(queued.isProtected).isFalse()
        assertThat(queued.servedConsumption?.lastPlayPositionMs).isEqualTo(4_000)
    }

    @Test
    fun `un contenu protege, supprime ou sans adresse ne devient jamais une page`() {
        val protectedPiece = voice().copy(isProtected = true)

        assertThat(AudioFullscreenSource.fromBubble(bubble(voice(), isViewOnce = true), voice(), "c1", "F")).isNull()
        assertThat(AudioFullscreenSource.fromBubble(bubble(protectedPiece), protectedPiece, "c1", "F")).isNull()
        assertThat(AudioFullscreenSource.fromBubble(bubble(voice(), isDeleted = true), voice(), "c1", "F")).isNull()
        assertThat(AudioFullscreenSource.fromBubble(bubble(voice(url = null)), voice(url = null), "c1", "F")).isNull()
    }

    @Test
    fun `le son d un post, d un commentaire ou d un reel devient une page hors conversation`() {
        val author = ProfileSheetUser(userId = "u1", username = "nour", displayName = "Nour")
        val media = FeedMedia(
            id = "p-a1",
            type = FeedMediaType.AUDIO,
            url = "https://cdn.meeshy.me/p-a1.m4a",
            duration = 30,
            transcription = MessageTranscription(text = "Salut", language = "fr"),
        )

        val forPost = AudioFullscreenSource.fromFeed(media, author, "2026-11-04T08:00:00Z", carrierId = "post-1", contextName = "Nour")!!
        val forComment = AudioFullscreenSource.fromFeed(media, author, null, carrierId = "comment-1", contextName = "Nour")!!

        assertThat(forPost.durationMs).isEqualTo(30_000L)
        assertThat(forPost.conversationId).isEmpty()
        assertThat(forPost.carrierId).isEqualTo("post-1")
        assertThat(forPost.transcriptionText).isEqualTo("Salut")
        assertThat(forPost.trackLanguage).isEqualTo("fr")
        assertThat(forComment.carrierId).isEqualTo("comment-1")
        assertThat(forComment.createdAtEpochMs).isEqualTo(0L)
    }

    @Test
    fun `un media de post qui n est pas un son, ou sans adresse, n ouvre rien`() {
        val author = ProfileSheetUser(username = "nour")

        assertThat(AudioFullscreenSource.fromFeed(FeedMedia(id = "i", type = FeedMediaType.IMAGE, url = "u"), author, null, "p", "N")).isNull()
        assertThat(AudioFullscreenSource.fromFeed(FeedMedia(id = "a", type = FeedMediaType.AUDIO), author, null, "p", "N")).isNull()
    }
}
