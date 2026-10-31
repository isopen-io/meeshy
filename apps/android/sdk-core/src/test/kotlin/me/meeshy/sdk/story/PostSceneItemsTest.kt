package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.net.MeeshyApi
import org.junit.Test
import java.io.File

/** #13863 R7 — un post à scène se lit scène par scène, chacune avec ses seules pièces ; un post sans scène n'en a pas. */
class PostSceneItemsTest {
    /** Les documents que l'iOS publie, partagés par les deux plateformes (`packages/shared/fixtures/canvas-v3`). */
    private fun fixtureText(name: String): String =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/fixtures/canvas-v3/$name.json") }
            .firstOrNull { it.isFile }?.readText()
            ?: throw AssertionError("Fixture partagée introuvable : canvas-v3/$name.json")

    private fun served(storyEffects: String?, media: String = "[]", extra: String = ""): ApiPost =
        MeeshyApi.json.decodeFromString(
            ApiPost.serializer(),
            """{ "id": "p1", "type": "POST", "content": "le texte", "media": $media${storyEffects?.let { ", \"storyEffects\": $it" }.orEmpty()}$extra }""",
        )

    private val twoPhotos = """[
        { "id": "64b000000000000000000001", "fileUrl": "https://cdn/1.jpg", "mimeType": "image/jpeg" },
        { "id": "64b000000000000000000002", "fileUrl": "https://cdn/2.jpg", "mimeType": "image/jpeg" }
    ]"""

    @Test
    fun `the two photos iOS published read as two scenes, each with its own photo only`() {
        val scenes = requireNotNull(served(fixtureText("post-photo-scenes-2"), twoPhotos).sceneItems())

        assertThat(scenes.items.map { it.id }).containsExactly("p1#scene-0", "p1#scene-1").inOrder()
        assertThat(scenes.items.map { item -> item.media.map { it.id } })
            .containsExactly(listOf("64b000000000000000000001"), listOf("64b000000000000000000002")).inOrder()
        assertThat(scenes.items.all { it.content == "le texte" }).isTrue()
        assertThat(scenes.layout).isEqualTo(MosaicLayoutMode.CAROUSEL)
    }

    @Test
    fun `a scene of one keeps the identity of its post`() {
        val scenes = requireNotNull(served(fixtureText("v1-legacy-rich.v3")).sceneItems())

        assertThat(scenes.items.single().id).isEqualTo("p1")
        assertThat(scenes.items.single().storyEffects?.stickerObjects.orEmpty()).isNotEmpty()
    }

    @Test
    fun `a text post, a colour post and a repost have no scene of their own`() {
        assertThat(served(null).sceneItems()).isNull()
        assertThat(served("""{ "background": "302B63" }""").sceneItems()).isNull()
        assertThat(served(fixtureText("v1-legacy-rich.v3"), extra = """, "repostOf": { "id": "src", "type": "STORY" }""").sceneItems()).isNull()
    }
}
