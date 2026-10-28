package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/** iOS `ComposerSlideTextRole`: in a post the text of a slide is the CAPTION of its media — `PostMedia.caption`, not `alt`, not `content`. */
class FeedComposerCaptionTest {
    private fun photo(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, 100, 100, null, null)
    private val draft = FeedComposerDraft(text = "le post").withMedia(listOf(photo("a"), photo("b")))

    @Test
    fun `a caption is written for one media and kept verbatim`() {
        val written = draft.withCaption("a", "  Au marché ")
        assertThat(written.mediaCaption).containsExactly("a", "  Au marché ")
        assertThat(written.text).isEqualTo("le post")
        assertThat(written.mediaAlt).isEmpty()
    }

    @Test
    fun `a blank caption removes the key rather than publishing an empty legend`() {
        val cleared = draft.withCaption("a", "x").withCaption("a", "   ")
        assertThat(cleared.mediaCaption).isEmpty()
    }

    @Test
    fun `a caption longer than the gateway bound is cut so the whole post is never refused`() {
        val long = draft.withCaption("a", "é".repeat(1500))
        assertThat(long.mediaCaption.getValue("a")).hasLength(1000)
    }

    @Test
    fun `removing a media takes its caption along`() {
        val after = draft.withCaption("a", "x").withCaption("b", "y").withoutMedia("a")
        assertThat(after.mediaCaption).containsExactly("b", "y")
    }

    @Test
    fun `the publish request carries the captions of the attached media, keyed by media id, as a post`() {
        val request = draft.withCaption("a", "x").withCaption("ghost", "z").withForcePlainPost(true).publishRequest()!!
        assertThat(request.type).isEqualTo(PostType.POST.name)
        assertThat(request.mediaCaption).containsExactly("a", "x")
        assertThat(request.content).isEqualTo("le post")
    }

    @Test
    fun `a reel publishes no caption because its text is the content`() {
        val reel = FeedComposerDraft(text = "t").withMedia(listOf(photo("a"), photo("b"))).withCaption("a", "x")
        assertThat(reel.postType).isEqualTo(PostType.REEL)
        assertThat(reel.publishRequest()!!.mediaCaption).isEmpty()
    }

    @Test
    fun `captions survive the durable form and an older blob without them still decodes`() {
        val withCaption = draft.withCaption("a", "x")
        assertThat(withCaption.toSnapshot(1L).toComposerDraft()).isEqualTo(withCaption)
        val old = Json { ignoreUnknownKeys = true }.decodeFromString(PostComposerDraftSnapshot.serializer(), """{"text":"t"}""")
        assertThat(old.mediaCaption).isEmpty()
    }

    @Test
    fun `clearing the document drops the captions with the media`() {
        assertThat(draft.withCaption("a", "x").cleared().mediaCaption).isEmpty()
    }
}
