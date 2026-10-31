package me.meeshy.sdk.model.composer.edit

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.ADJUST
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.DESCRIPTION
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.EFFECTS
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.FILTERS
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.FRAMES
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.FRAMING
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.LOOP
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool.TRIM
import org.junit.Test

/**
 * Les outils du fond média, à plat dans son rail (spec 2026-10-31, #13973, #14047), lus dans l'arbre partagé : une image offre
 * Cadrage · Filtres · Cadres · Réglages · Effets · Description, une vidéo Cadrage · Couper · Filtres · Réglages · Boucle ·
 * Description — dans l'ordre de l'arbre, chacune ouvrant ce que l'arbre dit. Recadrer, Son et Pivoter restent dans l'arbre
 * (cible commune avec iOS) sans être servis ici tant que leur effet n'est pas câblé.
 */
class ComposerBackgroundEditLevelTest {

    private val photo = ComposerBackgroundEditLevel.Media(video = false, trimmable = false, look = true)
    private val clip = ComposerBackgroundEditLevel.Media(video = true, trimmable = true, look = false)

    @Test
    fun `a background photo is framed, filtered, framed with a frame, adjusted, given effects and described, in that order`() {
        assertThat(ComposerBackgroundEditLevel.tools(photo)).containsExactly(FRAMING, FILTERS, FRAMES, ADJUST, EFFECTS, DESCRIPTION).inOrder()
    }

    @Test
    fun `a photo without the looks of the call has no Frames`() {
        assertThat(ComposerBackgroundEditLevel.tools(photo.copy(look = false))).containsExactly(FRAMING, FILTERS, ADJUST, EFFECTS, DESCRIPTION).inOrder()
    }

    @Test
    fun `a background video is framed, cut, filtered, adjusted, looped and described, without the effects of an image`() {
        assertThat(ComposerBackgroundEditLevel.tools(clip)).containsExactly(FRAMING, TRIM, FILTERS, ADJUST, LOOP, DESCRIPTION).inOrder()
    }

    @Test
    fun `a video whose length is not known yet is not cut`() {
        assertThat(ComposerBackgroundEditLevel.tools(clip.copy(trimmable = false))).doesNotContain(TRIM)
    }

    @Test
    fun `each tool opens what the tree says, the settings in a band, Loop in the rail, Description in a sheet`() {
        val opens = ComposerBackgroundTool.entries.associateWith { ComposerBackgroundEditLevel.entryOf(it).opens }
        assertThat(opens.filterValues { it == ComposerEditTree.Opens.BAND }.keys).containsExactly(FRAMING, TRIM, FILTERS, FRAMES, ADJUST, EFFECTS)
        assertThat(opens[LOOP]).isEqualTo(ComposerEditTree.Opens.TOGGLE)
        assertThat(opens[DESCRIPTION]).isEqualTo(ComposerEditTree.Opens.SHEET)
    }

    @Test
    fun `the tree keeps Crop, Sound and Rotate for both platforms, Android does not serve them yet`() {
        val tree = ComposerEditTree.shared.level(ComposerEditTree.BACKGROUND_MEDIA_EDIT)!!.entries.map { it.id }
        assertThat(tree).containsExactly(
            "framing", "crop", "trim", "filters", "frames", "adjust", "effects", "sound", "loop", "rotate", "description",
        ).inOrder()
        assertThat(ComposerBackgroundEditLevel.unserved()).containsExactly("crop", "sound", "rotate")
    }
}
