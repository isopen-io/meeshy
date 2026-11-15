package me.meeshy.sdk.model.composer.edit

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.ADJUST
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.CROP
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.DESCRIPTION
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.EFFECTS
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.FILTERS
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.FRAMES
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.MAKE_STICKER
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.REPLACE_BACKGROUND
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.ROTATE
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.SET_AS_BACKGROUND
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.SOUND
import me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool.TRIM
import org.junit.Test

/**
 * Les outils d'un média POSÉ, à plat dans son rail (#13973, lot A-E4, #14047) : l'image Recadrer · Filtres · Cadres · Réglages · Effets · Pivoter ·
 * Décrire · Mettre en fond (ou Remplacer le fond) · Faire un sticker ; la vidéo Couper · Filtres · Réglages · Son · Pivoter ·
 * Décrire · Mettre en fond — l'ordre de l'arbre partagé, jamais de « Plan ».
 */
class ComposerPlacedMediaEditLevelTest {

    private val image = ComposerPlacedMediaEditLevel.Media(
        video = false, trimmable = false, look = true, background = ComposerPlacedBackgroundOffer.SET, sticker = true,
    )
    private val video = image.copy(video = true, trimmable = true, look = false)

    @Test
    fun `a placed image is Crop, Filters, Frames, Adjust, Effects, Rotate, Describe, Set as background and Make a sticker`() {
        assertThat(ComposerPlacedMediaEditLevel.tools(image))
            .containsExactly(CROP, FILTERS, FRAMES, ADJUST, EFFECTS, ROTATE, DESCRIPTION, SET_AS_BACKGROUND, MAKE_STICKER).inOrder()
    }

    @Test
    fun `a placed video is Trim, Filters, Adjust, Sound, Rotate, Describe and Set as background`() {
        assertThat(ComposerPlacedMediaEditLevel.tools(video))
            .containsExactly(TRIM, FILTERS, ADJUST, SOUND, ROTATE, DESCRIPTION, SET_AS_BACKGROUND).inOrder()
    }

    @Test
    fun `only one of the two background entries is served, the second once the slide has a background`() {
        assertThat(ComposerPlacedMediaEditLevel.tools(image.copy(background = ComposerPlacedBackgroundOffer.REPLACE)))
            .doesNotContain(SET_AS_BACKGROUND)
        assertThat(ComposerPlacedMediaEditLevel.tools(image.copy(background = ComposerPlacedBackgroundOffer.REPLACE))).contains(REPLACE_BACKGROUND)
        assertThat(ComposerPlacedMediaEditLevel.tools(image.copy(background = ComposerPlacedBackgroundOffer.NONE)))
            .containsNoneOf(SET_AS_BACKGROUND, REPLACE_BACKGROUND)
    }

    @Test
    fun `an entry without effect here is not offered`() {
        assertThat(ComposerPlacedMediaEditLevel.tools(image.copy(sticker = false, look = false))).containsNoneOf(MAKE_STICKER, FRAMES)
        assertThat(ComposerPlacedMediaEditLevel.tools(video.copy(trimmable = false))).doesNotContain(TRIM)
        assertThat(ComposerPlacedMediaEditLevel.tools(video.copy(sticker = true))).doesNotContain(MAKE_STICKER)
    }

    @Test
    fun `the order is the one of the shared tree, never written here`() {
        val tree = ComposerEditTree.shared
        val reversed = tree.copy(levels = tree.levels.map { if (it.id == ComposerEditTree.MEDIA_PLACED_EDIT) it.copy(entries = it.entries.reversed()) else it })
        assertThat(ComposerPlacedMediaEditLevel.tools(image, reversed))
            .containsExactly(MAKE_STICKER, SET_AS_BACKGROUND, DESCRIPTION, ROTATE, EFFECTS, ADJUST, FRAMES, FILTERS, CROP).inOrder()
    }

    @Test
    fun `every tool is an entry of the tree, the settings in a band, Rotate and the background at once, Describe in a sheet`() {
        ComposerPlacedMediaTool.entries.forEach { ComposerPlacedMediaEditLevel.entryOf(it) }
        listOf(CROP, TRIM, FILTERS, FRAMES, ADJUST, EFFECTS).forEach {
            assertThat(ComposerPlacedMediaEditLevel.entryOf(it).opens).isEqualTo(ComposerEditTree.Opens.BAND)
        }
        assertThat(ComposerPlacedMediaEditLevel.entryOf(SOUND).next).isEqualTo(ComposerEditTree.MEDIA_SOUND)
        listOf(ROTATE, SET_AS_BACKGROUND, REPLACE_BACKGROUND, MAKE_STICKER).forEach {
            assertThat(ComposerPlacedMediaEditLevel.entryOf(it).opens).isEqualTo(ComposerEditTree.Opens.ACTION)
        }
        assertThat(ComposerPlacedMediaEditLevel.entryOf(DESCRIPTION).opens).isEqualTo(ComposerEditTree.Opens.SHEET)
        assertThat(ComposerEditTree.shared.level(ComposerEditTree.MEDIA_PLACED_EDIT)!!.entries.map { it.id }).doesNotContain("plan")
    }
}
