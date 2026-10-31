package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * #13863 § 3 : un brouillon du compositeur de post d'avant (texte, médias, son, fond, lieu, descriptions) se rouvre sur la
 * scène SANS PERTE — le texte devient le texte du post, chaque photo ou vidéo une diapo dont elle est le fond, un son la
 * pastille de la scène.
 */
class PostDraftSceneTest {
    private fun media(id: String, mime: String, durationMs: Long? = null) =
        UploadedMedia(id, "https://cdn/$id", mime, 1L, 100, 100, durationMs, null)

    private val ids = { index: Int -> "slide-$index" }

    private val old = PostComposerDraftSnapshot(
        text = "Au marché ce matin #bio",
        visibility = "FRIENDS",
        media = listOf(media("p1", "image/jpeg"), media("v1", "video/mp4", 8_000), media("a1", "audio/m4a", 4_000)),
        location = SharedPlace(latitude = 48.85, longitude = 2.35, name = "Marché d'Aligre"),
        mediaAlt = mapOf("p1" to "des tomates"),
        mediaCaption = mapOf("v1" to "le marchand"),
        background = "302B63",
        updatedAtMillis = 1_700_000_000_000L,
    )

    @Test
    fun `an old post draft reopens on the scene without losing anything`() {
        val scene = PostDraftScene.scene(old, ids)

        assertThat(scene.postText).isEqualTo("Au marché ce matin #bio")
        assertThat(scene.format).isEqualTo(ComposerFormat.REEL.name)
        assertThat(scene.visibility).isEqualTo("FRIENDS")
        assertThat(scene.slides.map { it.id }).containsExactly("slide-0", "slide-1").inOrder()
        assertThat(scene.slides.map { it.backgroundMediaId }).containsExactly("p1", "v1").inOrder()
        assertThat(scene.slides.map { it.mediaIds }).containsExactly(listOf("p1"), listOf("v1")).inOrder()
        assertThat(scene.slides.first().background).isEqualTo("302B63")
        assertThat(scene.slides.first().audio.map { it.postMediaId }).containsExactly("a1")
        assertThat(scene.slides.first().places.map { it.place.name }).containsExactly("Marché d'Aligre")
        assertThat(scene.annotations.mediaAlt).containsExactly("p1", "des tomates")
        assertThat(scene.annotations.mediaCaption).containsExactly("v1", "le marchand")
        assertThat(scene.media.map { it.id }).containsExactly("p1", "v1", "a1").inOrder()
        assertThat(scene.selectedId).isEqualTo("slide-0")
        assertThat(scene.isWorthRestoring).isTrue()
    }

    @Test
    fun `a text alone reopens as one empty scene and its post text, still worth restoring`() {
        val scene = PostDraftScene.scene(PostComposerDraftSnapshot(text = "bonjour"), ids)

        assertThat(scene.slides).hasSize(1)
        assertThat(scene.slides.single().hasContent).isFalse()
        assertThat(scene.postText).isEqualTo("bonjour")
        assertThat(scene.format).isEqualTo(ComposerFormat.POST.name)
        assertThat(scene.isWorthRestoring).isTrue()
    }

    @Test
    fun `a plain post forced by its author stays a post`() {
        val video = PostComposerDraftSnapshot(media = listOf(media("v1", "video/mp4", 8_000)), forcePlainPost = true)

        assertThat(PostDraftScene.scene(video, ids).format).isEqualTo(ComposerFormat.POST.name)
    }

    @Test
    fun `opening takes the old post draft into the scene when no scene draft waits`() {
        val opening = PostDraftScene.opening(story = null, post = old, slideId = ids)

        assertThat(opening.adoptsPostDraft).isTrue()
        assertThat(opening.snapshot?.postText).isEqualTo(old.text)
    }

    @Test
    fun `a scene draft and an old post draft both kept become one scene, nothing lost`() {
        val story = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s", text = "ma story", mediaIds = listOf("x"))),
            selectedId = "s",
            visibility = "PUBLIC",
        )

        val merged = requireNotNull(PostDraftScene.opening(story, old, ids).snapshot)

        assertThat(merged.slides.map { it.id }).containsExactly("s", "slide-0", "slide-1").inOrder()
        assertThat(merged.selectedId).isEqualTo("s")
        assertThat(merged.postText).isEqualTo(old.text)
        assertThat(merged.annotations.mediaAlt).containsExactly("p1", "des tomates")
    }

    @Test
    fun `nothing to take keeps the scene draft as it is, and an empty post draft is not one`() {
        val story = StoryComposerDraftSnapshot(slides = listOf(StoryDraftSlideSnapshot(id = "s", text = "x")), selectedId = "s")

        assertThat(PostDraftScene.opening(story, null, ids)).isEqualTo(PostDraftScene.Opening(story, adoptsPostDraft = false))
        assertThat(PostDraftScene.opening(story, PostComposerDraftSnapshot(text = " "), ids).adoptsPostDraft).isFalse()
    }

    @Test
    fun `a scene draft still awaiting its publication is never written over, the old post draft waits its turn`() {
        val awaiting = StoryComposerDraftSnapshot(
            slides = listOf(StoryDraftSlideSnapshot(id = "s", text = "partie")), selectedId = "s", awaitingPublication = listOf("cmid_1"),
        )

        assertThat(PostDraftScene.opening(awaiting, old, ids)).isEqualTo(PostDraftScene.Opening(awaiting, adoptsPostDraft = false))
    }
}
