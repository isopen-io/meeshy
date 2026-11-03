package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.net.api.CreateStoryRequest
import org.junit.Test

class StoryPublishRequestBuilderTest {
    private val base = CreateStoryRequest(content = "salut")

    @Test
    fun `le type suit le format cible`() {
        assertThat(StoryPublishRequestBuilder.targeting(base, ComposerFormat.STORY).type).isEqualTo("STORY")
        assertThat(StoryPublishRequestBuilder.targeting(base, ComposerFormat.REEL).type).isEqualTo("REEL")
        assertThat(StoryPublishRequestBuilder.targeting(base, ComposerFormat.POST).type).isEqualTo("POST")
    }

    @Test
    fun `alsoAsReel ne part qu'avec une story non republiee`() {
        assertThat(StoryPublishRequestBuilder.targeting(base, ComposerFormat.STORY, alsoAsReel = true).alsoAsReel).isTrue()
        assertThat(StoryPublishRequestBuilder.targeting(base, ComposerFormat.STORY).alsoAsReel).isNull()
        assertThat(StoryPublishRequestBuilder.targeting(base, ComposerFormat.POST, alsoAsReel = true).alsoAsReel).isNull()
        assertThat(StoryPublishRequestBuilder.targeting(base.copy(repostOfId = "src"), ComposerFormat.STORY, alsoAsReel = true).alsoAsReel).isNull()
    }

    @Test
    fun `les champs de la requete sont conserves`() {
        val request = base.copy(mediaAlt = mapOf("m" to "un chat"), mediaCaption = mapOf("m" to "Minou"))
        val sent = StoryPublishRequestBuilder.targeting(request, ComposerFormat.STORY, alsoAsReel = true)
        assertThat(sent.mediaAlt).containsExactly("m", "un chat")
        assertThat(sent.mediaCaption).containsExactly("m", "Minou")
        assertThat(sent.content).isEqualTo("salut")
    }
}
