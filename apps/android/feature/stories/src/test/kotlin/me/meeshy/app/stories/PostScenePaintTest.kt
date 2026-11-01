package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ScenePostDocument
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.story.sceneItems
import org.junit.Test

/**
 * #13863 R7 — ce que le fil peint d'un post à scène est ce que le player peint d'une story : le post publié depuis la scène
 * (texte, sticker, image posée, photo de fond) se relit avec tous ses calques, et le post de deux photos de l'iOS peint chaque
 * scène avec SA photo.
 */
class PostScenePaintTest {
    private val photo = "64b000000000000000000001"
    private val placed = "64b000000000000000000002"

    private val media = """[
        { "id": "$photo", "fileUrl": "https://cdn.meeshy.me/1.jpg", "mimeType": "image/jpeg" },
        { "id": "$placed", "fileUrl": "https://cdn.meeshy.me/2.jpg", "mimeType": "image/jpeg" }
    ]"""

    private fun served(storyEffects: String): ApiPost = MeeshyApi.json.decodeFromString(
        ApiPost.serializer(),
        """{ "id": "p1", "type": "POST", "content": "le texte", "media": $media, "storyEffects": $storyEffects }""",
    )

    /** Ce que le compositeur écrit dans la charge du post, tel que le serveur le rend. */
    private fun written(effects: StoryEffects?): String =
        MeeshyApi.json.parseToJsonElement(MeeshyApi.json.encodeToString(CreatePostRequest.serializer(), CreatePostRequest(storyEffects = effects)))
            .jsonObject.getValue("storyEffects").toString()

    private fun fixture(name: String): String =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/fixtures/canvas-v3/$name.json") }
            .firstOrNull { it.isFile }?.readText()
            ?: throw AssertionError("Fixture partagée introuvable : canvas-v3/$name.json")

    private fun paint(post: ApiPost): List<StorySlideView> =
        requireNotNull(post.sceneItems()).items.map { StorySlideProjector(null).project(it, "6366F1", NoContentPreferences) }

    @Test
    fun `a post published from the scene paints its text, its sticker, its placed image and its photo`() {
        val scene = StoryEffects(
            mediaObjects = listOf(
                StoryMediaObject(id = "bg", postMediaId = photo, mediaType = "image", isBackground = true),
                StoryMediaObject(id = "pose", postMediaId = placed, mediaType = "image", x = 0.3, y = 0.7, scale = 0.5),
            ),
            textObjects = listOf(StoryTextObject(id = "t1", text = "salut", x = 0.5, y = 0.2)),
            stickerObjects = listOf(StorySticker(id = "k1", emoji = "🔥", x = 0.4, y = 0.6)),
        )

        val slide = paint(served(written(ScenePostDocument.effects(listOf(scene), null, ComposerFormat.POST)))).single()

        assertThat(slide.textObjects.map { it.text }).containsExactly("salut")
        assertThat(slide.stickers.map { it.emoji }).containsExactly("🔥")
        assertThat(slide.foregroundMedia.map { it.url }).containsExactly("https://cdn.meeshy.me/2.jpg")
        assertThat(slide.imageUrl).isEqualTo("https://cdn.meeshy.me/1.jpg")
    }

    @Test
    fun `the two photos the iOS composer published paint as two scenes, each its own photo`() {
        val slides = paint(served(fixture("post-photo-scenes-2")))

        assertThat(slides.map { it.imageUrl?.substringAfterLast('/') })
            .containsExactly("64b000000000000000000001.jpg", "64b000000000000000000002.jpg").inOrder()
    }
}
