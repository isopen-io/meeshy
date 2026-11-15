package me.meeshy.sdk.model.card

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostCardImagingTest {

    private val author = PostCommentCardAuthor(id = "awa", displayName = "Awa Diop", username = "awa")
    private val photo = PostCommentCardMedia("p1", PostCommentCardMediaKind.IMAGE, url = "/u/p1.jpg")
    private val video = PostCommentCardMedia("v1", PostCommentCardMediaKind.VIDEO, url = "/u/v1.mp4", posterUrl = "/u/v1.jpg")
    private val voice = PostCommentCardMedia("a1", PostCommentCardMediaKind.AUDIO, url = "/u/a1.m4a")

    private fun post(
        text: String = "",
        type: String? = "POST",
        media: List<PostCommentCardMedia> = emptyList(),
        visibility: String? = "PUBLIC",
    ) = PostCommentCardPost(type = type, visibility = visibility, createdAtMillis = 1_800_000_000_000L, author = author, text = text, media = media)

    private fun card(post: PostCommentCardPost, ephemeral: Boolean = false) = PostCardImaging.cardOf(post, ephemeral)

    @Test
    fun `a text post becomes a card that carries its served text signed by its author`() {
        val subject = requireNotNull(card(post(text = "  Bonjour Dakar  ")))

        assertThat(subject.quoted).isNull()
        assertThat(subject.reply).isEqualTo(PostCommentCardPart(author = "Awa Diop", text = "Bonjour Dakar", handle = "awa"))
        assertThat(subject.thread).isEmpty()
        assertThat(subject.sentAtMillis).isEqualTo(1_800_000_000_000L)
        assertThat(subject.media).isEmpty()
    }

    @Test
    fun `a photo post lays its photo on the card under its author`() {
        val subject = requireNotNull(card(post(text = "Coucher de soleil", media = listOf(photo))))

        assertThat(subject.media.map { it.media }).containsExactly(photo)
        assertThat(subject.media.single().author).isEqualTo(PostCommentCardMediaAuthor("Awa Diop", "awa", quoted = false))
    }

    @Test
    fun `a post of several photos keeps at most four, in order`() {
        val photos = (1..6).map { PostCommentCardMedia("p$it", PostCommentCardMediaKind.IMAGE) }

        val subject = requireNotNull(card(post(media = photos)))

        assertThat(subject.media.map { it.media.id }).containsExactly("p1", "p2", "p3", "p4").inOrder()
    }

    @Test
    fun `a video post and a simple reel image their video`() {
        assertThat(card(post(media = listOf(video)))?.media?.map { it.media }).containsExactly(video)
        assertThat(card(post(type = "REEL", media = listOf(video)))?.media?.map { it.media }).containsExactly(video)
    }

    @Test
    fun `a post without text names its media by their symbol`() {
        assertThat(card(post(media = listOf(voice)))?.reply?.text).isEqualTo("🎤")
        assertThat(card(post(media = listOf(photo, video)))?.reply?.text).isEqualTo("📷 🎬")
    }

    @Test
    fun `a voice post images its sound`() {
        assertThat(card(post(text = "Écoutez", media = listOf(voice)))?.media?.map { it.media }).containsExactly(voice)
    }

    @Test
    fun `an ephemeral post, a story or a status images nothing`() {
        assertThat(card(post(text = "Bientôt parti"), ephemeral = true)).isNull()
        assertThat(card(post(text = "Story", type = "STORY", media = listOf(photo)))).isNull()
        assertThat(card(post(text = "Statut", type = "status"))).isNull()
    }

    @Test
    fun `a post with nothing to show images nothing`() {
        assertThat(card(post(text = "   "))).isNull()
    }

    @Test
    fun `an author without a name signs with the handle, then with Meeshy`() {
        val handleOnly = post(text = "x").copy(author = PostCommentCardAuthor(id = "u", username = "@kofi"))
        val anonymous = post(text = "x").copy(author = PostCommentCardAuthor(id = "u"))

        assertThat(card(handleOnly)?.reply).isEqualTo(PostCommentCardPart("@kofi", "x", "kofi"))
        assertThat(card(anonymous)?.reply).isEqualTo(PostCommentCardPart("Meeshy", "x", null))
    }

    @Test
    fun `a composed work becomes a card of its served text, its render to come as the media`() {
        val subject = PostCardImaging.sceneCardOf(author, "  Bonjour  ", createdAtMillis = 42L)

        assertThat(subject.reply).isEqualTo(PostCommentCardPart("Awa Diop", "Bonjour", "awa"))
        assertThat(subject.quoted).isNull()
        assertThat(subject.media).isEmpty()
        assertThat(subject.sentAtMillis).isEqualTo(42L)
    }

    @Test
    fun `a composed work without text still images, its render carries it`() {
        assertThat(PostCardImaging.sceneCardOf(author, "", createdAtMillis = 0L).reply.text).isEmpty()
    }
}
