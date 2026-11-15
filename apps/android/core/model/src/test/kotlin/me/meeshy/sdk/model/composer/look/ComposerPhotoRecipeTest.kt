package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/** La recette d'une photo retouchée (#14844) : ce que « Terminé » garde à côté de l'original, et que la retouche rouvre. */
class ComposerPhotoRecipeTest {

    private fun photo() = ComposerRetouchState.opening(ComposerEditTake.Photo, renderableEffects = emptyList(), tools = emptyList())

    private val recipe = ComposerPhotoRecipe(
        look = ComposerPhotoLook(
            filter = VideoFilterPreset.Warm,
            frame = ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.SCREEN)),
        ),
        crop = NormalizedCrop(0.1f, 0.1f, 0.8f, 0.45f),
        cropPreset = ComposerCropPreset.SQUARE,
        texts = listOf(StoryTextObject(id = "t1", text = "MEESHY")),
    )

    @Test
    fun `rouvrir une recette rend le filtre, le cadre et le recadrage choisis, et Termine la rend a l identique`() {
        val reopened = photo().restoring(recipe)
        assertThat(reopened.look).isEqualTo(recipe.look)
        assertThat(reopened.crop).isEqualTo(recipe.crop)
        assertThat(reopened.cropPreset).isEqualTo(ComposerCropPreset.SQUARE)
        assertThat(reopened.delivery).isEqualTo(ComposerRetouchDelivery.RENDERED)
        assertThat(reopened.recipe(recipe.texts)).isEqualTo(recipe)
    }

    @Test
    fun `une recette rouverte ne touche ni aux outils, ni a la famille ouverte, ni a la reponse`() {
        val reopened = photo().restoring(recipe)
        assertThat(reopened.openFamily).isNull()
        assertThat(reopened.activeTools).isEmpty()
        assertThat(reopened.settled).isFalse()
        assertThat(reopened.showsTopRow).isTrue()
    }

    @Test
    fun `seuls les textes ecrits entrent dans la recette`() {
        val written = photo().recipe(listOf(StoryTextObject(id = "a", text = "  "), StoryTextObject(id = "b", text = "ok")))
        assertThat(written.texts.map { it.id }).containsExactly("b")
        assertThat(ComposerPhotoRecipe().isUntouched).isTrue()
        assertThat(written.isUntouched).isFalse()
        assertThat(recipe.copy(texts = emptyList()).isUntouched).isFalse()
    }
}
