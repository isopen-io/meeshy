package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

/** #13863 R2 : la story, le post et le réel se composent sur la MÊME scène ; seule cette table varie. */
class ComposerFormatVariantTest {

    @Test
    fun `story, post and reel compose on the scene, the mood keeps its sheet`() {
        assertThat(ComposerFormat.entries.filter { ComposerFormatVariant.of(it).composesOnScene }).containsExactly(STORY, POST, REEL)
    }

    @Test
    fun `the publish button names the format it publishes`() {
        assertThat(ComposerFormatVariant.of(STORY).publishTitle(slideCount = 1)).isEqualTo(StoryPublishTitle.Single)
        assertThat(ComposerFormatVariant.of(STORY).publishTitle(slideCount = 3)).isEqualTo(StoryPublishTitle.Many(3))
        assertThat(ComposerFormatVariant.of(POST).publishTitle(slideCount = 3)).isEqualTo(StoryPublishTitle.Post)
        assertThat(ComposerFormatVariant.of(REEL).publishTitle(slideCount = 2)).isEqualTo(StoryPublishTitle.Reel)
        assertThat(ComposerFormatVariant.of(STORY).publishTitle(slideCount = 1, editing = true)).isEqualTo(StoryPublishTitle.Save)
    }

    @Test
    fun `the post text lives beside the scene for a post and a reel, a story captions its slides instead`() {
        assertThat(ComposerFormatVariant.of(POST).writesPostText).isTrue()
        assertThat(ComposerFormatVariant.of(REEL).writesPostText).isTrue()
        assertThat(ComposerFormatVariant.of(STORY).writesPostText).isFalse()
        assertThat(ComposerFormatVariant.of(STORY).captionsSlides).isTrue()
        assertThat(ComposerFormatVariant.of(POST).captionsSlides).isFalse()
        assertThat(ComposerFormatVariant.of(REEL).captionsSlides).isFalse()
    }

    @Test
    fun `only a post of two scenes or more offers the layout of its scenes`() {
        assertThat(ComposerFormatVariant.of(POST).layouts(sceneCount = 1)).isEmpty()
        assertThat(ComposerFormatVariant.of(POST).layouts(sceneCount = 2)).isEqualTo(ComposerMosaicChoice.ordered)
        assertThat(ComposerFormatVariant.of(REEL).layouts(sceneCount = 3)).isEmpty()
        assertThat(ComposerFormatVariant.of(STORY).layouts(sceneCount = 3)).isEmpty()
    }

    @Test
    fun `a story keeps its limits and publishes one story per slide, a post and a reel publish one document`() {
        assertThat(ComposerFormatVariant.of(STORY).keepsStoryLimits).isTrue()
        assertThat(ComposerFormatVariant.of(POST).keepsStoryLimits).isFalse()
        assertThat(ComposerFormatVariant.of(STORY).channel).isEqualTo(ComposerPublishChannel.SCENE)
        assertThat(ComposerFormatVariant.of(POST).channel).isEqualTo(ComposerPublishChannel.DOCUMENT)
        assertThat(ComposerFormatVariant.of(REEL).channel).isEqualTo(ComposerPublishChannel.DOCUMENT)
        assertThat(ComposerFormatVariant.of(STATUS).composesOnScene).isFalse()
    }

    @Test
    fun `the composer names the format it composes, never another one`() {
        assertThat(ComposerFormatVariant.of(STORY).noun).isEqualTo(ComposerSceneNoun.STORY)
        assertThat(ComposerFormatVariant.of(POST).noun).isEqualTo(ComposerSceneNoun.POST)
        assertThat(ComposerFormatVariant.of(REEL).noun).isEqualTo(ComposerSceneNoun.REEL)
    }

    @Test
    fun `every label that names the format is shown by story, post and reel, except the post text a story never writes`() {
        assertThat(ComposerFormatVariant.of(POST).labels).containsExactlyElementsIn(ComposerFormatLabel.entries)
        assertThat(ComposerFormatVariant.of(REEL).labels).containsExactlyElementsIn(ComposerFormatLabel.entries)
        assertThat(ComposerFormatVariant.of(STORY).labels).containsExactlyElementsIn(ComposerFormatLabel.entries - ComposerFormatLabel.POST_TEXT)
        assertThat(ComposerFormatVariant.of(STATUS).labels).isEmpty()
    }
}
