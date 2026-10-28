package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

class FeedComposerDraftPersistenceTest {

    private val photo = UploadedMedia("m1", "https://cdn/m1.jpg", "image/jpeg", 10L, 100, 100, null, null)

    @Test
    fun `a composer draft survives its durable form unchanged`() {
        val draft = FeedComposerDraft(
            text = "bonjour",
            visibility = FeedPostVisibility.FRIENDS,
            media = listOf(photo),
            forcePlainPost = true,
            location = SharedPlace(latitude = 1.0, longitude = 2.0),
            language = "ja",
            mediaAlt = mapOf("m1" to "un chat"),
        )

        assertThat(draft.toSnapshot(nowMillis = 42L).toComposerDraft()).isEqualTo(draft)
    }

    @Test
    fun `an unknown audience or language from another build falls back to the defaults`() {
        val restored = PostComposerDraftSnapshot(text = "x", visibility = "COMMUNITY", language = null).toComposerDraft()

        assertThat(restored.visibility).isEqualTo(FeedPostVisibility.PUBLIC)
        assertThat(restored.language).isEqualTo(FeedComposerDraft().language)
    }

    @Test
    fun `a media kept on the device stands in under its upload cmid with the picked type`() {
        val item = MediaUploadItem(bytes = ByteArray(7), fileName = "clip.mp4", mimeType = "video/mp4")

        val placeholder = FeedPendingMedia.placeholder("cmid_up", item, "content://picked/1")

        assertThat(placeholder.id).isEqualTo("cmid_up")
        assertThat(placeholder.mimeType).isEqualTo("video/mp4")
        assertThat(placeholder.fileSize).isEqualTo(7L)
        assertThat(placeholder.url).isEqualTo("content://picked/1")
        assertThat(FeedComposerDraft().withMedia(listOf(placeholder)).publishRequest()?.mediaIds).containsExactly("cmid_up")
    }

    @Test
    fun `a photo kept on the device keeps its measured shape, so its scene carries the ratio iOS writes`() {
        val item = MediaUploadItem(bytes = ByteArray(7), fileName = "vue.jpg", mimeType = "image/jpeg")
        val first = FeedPendingMedia.placeholder("cmid_11111111-1111-1111-1111-111111111111", item, "content://picked/1", 1200 to 800)
        val second = FeedPendingMedia.placeholder("cmid_22222222-2222-2222-2222-222222222222", item, "content://picked/2", 900 to 1200)

        assertThat(first.width to first.height).isEqualTo(1200 to 800)
        val ratios = me.meeshy.sdk.model.composer.PostPhotoScenes.effects(listOf(first, second), "fr", null)!!
            .canvas!!.scenes.map { scene -> scene.objects.single { it.plane == "content" }.payload["aspectRatio"].toString().toDouble() }
        assertThat(ratios).containsExactly(1.5, 0.75).inOrder()
    }
}
