package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StoryVisibility
import org.junit.Test

/**
 * Les cinq champs que le `CreateStoryRequest` Android avait laissé dériver (#5078, #13425) :
 * `visibilityUserIds`, `mentions`, `mediaAlt`, `mediaCaption`, `allowSoundExtraction`.
 */
class StoryComposerPublicationFieldsTest {

    private fun request(draft: StoryComposerDraft) = draft.toCreateStoryRequest("fr")

    @Test
    fun `ONLY envoie sa liste, dedoublonnee`() {
        val body = request(
            StoryComposerDraft(text = "x", visibility = StoryVisibility.ONLY, visibilityUserIds = listOf("a", "b", "a")),
        )
        assertThat(body.visibility).isEqualTo("ONLY")
        assertThat(body.visibilityUserIds).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une liste restee d'un mode precedent ne part jamais sous PUBLIC`() {
        val body = request(
            StoryComposerDraft(text = "x", visibility = StoryVisibility.PUBLIC, visibilityUserIds = listOf("a")),
        )
        assertThat(body.visibilityUserIds).isNull()
    }

    @Test
    fun `ONLY sans personne n'est pas publiable`() {
        assertThat(StoryComposerDraft(text = "x", visibility = StoryVisibility.ONLY).canPublish).isFalse()
        assertThat(
            StoryComposerDraft(text = "x", visibility = StoryVisibility.ONLY, visibilityUserIds = listOf("a")).canPublish,
        ).isTrue()
    }

    @Test
    fun `les mentions partent telles quelles et une liste vide reste absente`() {
        val mention = PostMentionInput(userId = "u1", username = "ana", display = "NOTE")
        assertThat(request(StoryComposerDraft(text = "x", mentions = listOf(mention))).mentions)
            .containsExactly(mention)
        assertThat(request(StoryComposerDraft(text = "x")).mentions).isNull()
    }

    @Test
    fun `alt et legende ne partent que pour les medias du post, et ne se confondent pas`() {
        val body = request(
            StoryComposerDraft(
                text = "x",
                mediaIds = listOf("m1"),
                mediaAlt = mapOf("m1" to "un chat", "ghost" to "fantome"),
                mediaCaption = mapOf("m1" to "Mon chat"),
            ),
        )
        assertThat(body.mediaAlt).containsExactly("m1", "un chat")
        assertThat(body.mediaCaption).containsExactly("m1", "Mon chat")
        assertThat(body.content).isEqualTo("x")
    }

    @Test
    fun `sans description la carte est absente, jamais vide`() {
        val body = request(StoryComposerDraft(text = "x", mediaIds = listOf("m1")))
        assertThat(body.mediaAlt).isNull()
        assertThat(body.mediaCaption).isNull()
    }

    @Test
    fun `l'extraction du son est declaree seulement quand l'auteur l'a choisie`() {
        assertThat(request(StoryComposerDraft(text = "x")).allowSoundExtraction).isNull()
        assertThat(request(StoryComposerDraft(text = "x", allowSoundExtraction = true)).allowSoundExtraction).isTrue()
        assertThat(request(StoryComposerDraft(text = "x", allowSoundExtraction = false)).allowSoundExtraction).isFalse()
    }
}
