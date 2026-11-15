package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ScenePostDocument
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import org.junit.Test

/**
 * #13612, #13863 — a post composed on the scene queued while its photos upload: each landed upload takes its place in the
 * media list AND in its scene of the one document the composer publishes ([ScenePostDocument]).
 */
class PostPublishMediaWriteBackScenesTest {
    private val first = "cmid_11111111-1111-1111-1111-111111111111"
    private val second = "cmid_22222222-2222-2222-2222-222222222222"

    /** A slide whose background is a photo still uploading under its provisional id, on a colour or not. */
    private fun photoScene(id: String, colour: String? = null) = StoryEffects(
        background = colour,
        mediaObjects = listOf(StoryMediaObject(id = "photo-${id.hashCode()}", postMediaId = id, mediaType = "image", isBackground = true)),
    )

    private val queued = CreatePostRequest(
        content = "deux vues",
        mediaIds = listOf(first, second),
        mediaCaption = mapOf(first to "la plage"),
        storyEffects = ScenePostDocument.effects(listOf(photoScene(first), photoScene(second)), null, ComposerFormat.POST),
    )

    private fun payload(request: CreatePostRequest) = MeeshyApi.json.encodeToString(request)

    private fun scenesOf(request: CreatePostRequest): List<String?> =
        request.storyEffects!!.canvas!!.scenes.map { scene ->
            scene.objects.firstNotNullOfOrNull { it.payload["postMediaId"] }?.toString()?.trim('"')
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
            storyEffects = ScenePostDocument.effects(listOf(photoScene(first), photoScene(second)), me.meeshy.sdk.model.MosaicLayoutMode.SINE, ComposerFormat.POST),
        )

        val grafted = PostPublishMediaWriteBack.graft(payload(withLayout), first, "64b000000000000000000001")!!

        val layout = MeeshyApi.json.decodeFromString<CreatePostRequest>(grafted).storyEffects!!.canvas!!.layout
        assertThat(layout).isEqualTo(me.meeshy.sdk.model.MosaicLayoutMode.SINE)
    }

    @Test
    fun `a single queued photo on a colour takes its real id in its one scene and keeps the colour`() {
        val single = CreatePostRequest(
            content = "une vue",
            mediaIds = listOf(first),
            storyEffects = ScenePostDocument.effects(listOf(photoScene(first, colour = "302B63")), null, ComposerFormat.POST),
        )

        val grafted = PostPublishMediaWriteBack.graft(payload(single), first, "64b000000000000000000001")!!

        val request = MeeshyApi.json.decodeFromString<CreatePostRequest>(grafted)
        assertThat(scenesOf(request)).containsExactly("64b000000000000000000001")
        assertThat(grafted).contains("302B63")
        assertThat(grafted).doesNotContain(first)
    }

    @Test
    fun `a single queued photo without colour takes its real id in its one scene`() {
        val single = CreatePostRequest(
            content = "une vue",
            mediaIds = listOf(first),
            storyEffects = ScenePostDocument.effects(listOf(photoScene(first)), null, ComposerFormat.POST),
        )

        val grafted = PostPublishMediaWriteBack.graft(payload(single), first, "64b000000000000000000001")!!

        val request = MeeshyApi.json.decodeFromString<CreatePostRequest>(grafted)
        assertThat(scenesOf(request)).containsExactly("64b000000000000000000001")
        assertThat(grafted).doesNotContain(first)
    }
}
