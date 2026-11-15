package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.media.MediaFate
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.publication.UnsentMedia
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import org.junit.Test

/** #14902 — une publication encore sur l'appareil se lit dans le fil comme une publication, son heure remplacée par l'horloge. */
class PendingFeedPublicationsTest {

    private val author = MeeshyUser(id = "me", username = "amina", displayName = "Amina", avatar = "https://cdn/a.jpg")

    private fun unsent(
        cmid: String = "cmid_1",
        kind: UnsentPublicationKind = UnsentPublicationKind.POST,
        status: UnsentPublicationStatus = UnsentPublicationStatus.SENDING,
        text: String? = "Bonjour",
        media: List<UnsentMedia> = emptyList(),
    ) = UnsentPublication(
        cmid = cmid,
        kind = kind,
        text = text,
        mediaCount = media.size,
        status = status,
        createdAtMillis = 1_000L,
        failureReason = null,
        media = media,
    )

    private fun cards(vararg items: UnsentPublication, offline: Boolean = false) =
        PendingFeedPublications.cards(items.toList(), author, mediaBaseUrl = "https://gate.meeshy.me/api/v1/", offline = offline)

    @Test
    fun `a post on its way reads as the author's own post, under its local id`() {
        val card = cards(unsent()).single()

        assertThat(card.post.id).isEqualTo("cmid_1")
        assertThat(card.post.isPendingSend).isTrue()
        assertThat(card.post.content).isEqualTo("Bonjour")
        assertThat(card.post.authorId).isEqualTo("me")
        assertThat(card.post.authorName).isEqualTo("Amina")
        assertThat(card.post.isAuthor).isTrue()
    }

    @Test
    fun `posts and reels are in the feed, a story stays in its tray`() {
        val shown = cards(
            unsent(cmid = "cmid_p"),
            unsent(cmid = "cmid_s", kind = UnsentPublicationKind.STORY),
            unsent(cmid = "cmid_r", kind = UnsentPublicationKind.REEL),
        )

        assertThat(shown.map { it.post.id }).containsExactly("cmid_p", "cmid_r").inOrder()
        assertThat(shown.last().post.isReel).isTrue()
    }

    @Test
    fun `a publication on its way is neither retried nor reopened by hand`() {
        val card = cards(unsent()).single()

        assertThat(card.canRetry).isFalse()
        assertThat(card.canReopen).isFalse()
    }

    @Test
    fun `a publication that gave up is retried and reopened`() {
        val card = cards(unsent(status = UnsentPublicationStatus.FAILED)).single()

        assertThat(card.canRetry).isTrue()
        assertThat(card.canReopen).isTrue()
    }

    @Test
    fun `a publication that lost a media is not retried, it would fail again`() {
        val lost = UnsentMedia("cmid_m", MediaFate.LOST, MediaUploadProgress.Idle)
        val card = cards(unsent(status = UnsentPublicationStatus.FAILED, media = listOf(lost))).single()

        assertThat(card.canRetry).isFalse()
        assertThat(card.canReopen).isTrue()
    }

    @Test
    fun `a server post is never taken for a pending one`() {
        assertThat(feedPostPresentation(id = "65f0c0ffee0000000000abcd").isPendingSend).isFalse()
    }
}
