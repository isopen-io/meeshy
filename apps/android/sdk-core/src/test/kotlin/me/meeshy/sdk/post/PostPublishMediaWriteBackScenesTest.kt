package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.PostPhotoScenes
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import org.junit.Test

/** #13612 — a post of photos queued while they upload: each landed upload takes its place in the media list AND in its scene. */
class PostPublishMediaWriteBackScenesTest {
    private val first = "cmid_11111111-1111-1111-1111-111111111111"
    private val second = "cmid_22222222-2222-2222-2222-222222222222"

    private fun pending(id: String) = UploadedMedia(id, "content://media/$id", "image/jpeg", 1L, null, null, null, null)

    private val queued = CreatePostRequest(
        content = "deux vues",
        mediaIds = listOf(first, second),
        mediaCaption = mapOf(first to "la plage"),
        storyEffects = PostPhotoScenes.effects(listOf(pending(first), pending(second)), "fr", null),
    )

    private fun payload(request: CreatePostRequest) = MeeshyApi.json.encodeToString(request)

    private fun scenesOf(request: CreatePostRequest): List<String?> =
        request.storyEffects!!.canvas!!.scenes.map { scene ->
            scene.objects.firstOrNull { it.plane == "content" }?.payload?.get("postMediaId")?.toString()?.trim('"')
        }

    @Test
    fun `the first upload to land takes its scene, the other scene still waits on its provisional id`() {
        val grafted = PostPublishMediaWriteBack.graft(payload(queued), first, "64b000000000000000000001")!!

        val request = MeeshyApi.json.decodeFromString<CreatePostRequest>(grafted)
        assertThat(request.mediaIds).containsExactly("64b000000000000000000001", second).inOrder()
        assertThat(scenesOf(request)).containsExactly("64b000000000000000000001", second).inOrder()
        assertThat(request.mediaCaption).containsExactly("64b000000000000000000001", "la plage")
    }

    @Test
    fun `once both landed, the document designates exactly the media of the post`() {
        val once = PostPublishMediaWriteBack.graft(payload(queued), first, "64b000000000000000000001")!!
        val twice = PostPublishMediaWriteBack.graft(once, second, "64b000000000000000000002")!!

        val request = MeeshyApi.json.decodeFromString<CreatePostRequest>(twice)
        assertThat(scenesOf(request)).isEqualTo(request.mediaIds)
        assertThat(request.storyEffects!!.canvas!!.scenes).hasSize(2)
    }

    @Test
    fun `a layout the author armed survives the write-back`() {
        val withLayout = queued.copy(
            storyEffects = PostPhotoScenes.effects(listOf(pending(first), pending(second)), "fr", me.meeshy.sdk.model.MosaicLayoutMode.SINE),
        )

        val grafted = PostPublishMediaWriteBack.graft(payload(withLayout), first, "64b000000000000000000001")!!

        val layout = MeeshyApi.json.decodeFromString<CreatePostRequest>(grafted).storyEffects!!.canvas!!.layout
        assertThat(layout).isEqualTo(me.meeshy.sdk.model.MosaicLayoutMode.SINE)
    }
}
