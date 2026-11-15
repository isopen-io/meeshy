package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.composer.look.ComposerEditTool.CROP
import me.meeshy.sdk.model.composer.look.ComposerEditTool.SOUND
import me.meeshy.sdk.model.composer.look.ComposerEditTool.TEXT
import me.meeshy.sdk.model.composer.look.ComposerEditTool.TRIM
import me.meeshy.sdk.model.scene.SceneLookMatrix
import org.junit.Test

/** Portage des lois pures de `ComposerEditToolsTests.swift` (#9754, #12591) et de la colorimétrie (#9295). */
class ComposerEditToolsTest {

    @Test
    fun `la photo se recadre et prend du texte, la video se coupe aussi et regle son son, un son se coupe et se regle`() {
        assertThat(ComposerEditTools.offered(ComposerEditTake.Photo)).containsExactly(CROP, TEXT).inOrder()
        assertThat(ComposerEditTools.offered(ComposerEditTake.Video(hasAudio = true))).containsExactly(CROP, TEXT, TRIM, SOUND).inOrder()
        assertThat(ComposerEditTools.offered(ComposerEditTake.Video(hasAudio = false))).containsExactly(CROP, TEXT, TRIM).inOrder()
        assertThat(ComposerEditTools.offered(ComposerEditTake.Audio)).containsExactly(TRIM, SOUND).inOrder()
    }

    @Test
    fun `aucun outil n est ouvert a l entree, et la rangee haute n est la que sans element d edition`() {
        assertThat(ComposerEditTools.initial(ComposerEditTake.Photo)).isEmpty()
        assertThat(ComposerEditTools.initial(ComposerEditTake.Video(hasAudio = true))).isEmpty()
        assertThat(ComposerEditTools.showsTopRow(familyOpen = false, shownTools = emptySet())).isTrue()
        assertThat(ComposerEditTools.showsTopRow(familyOpen = true, shownTools = emptySet())).isFalse()
        assertThat(ComposerEditTools.showsTopRow(familyOpen = false, shownTools = setOf(CROP))).isFalse()
    }

    @Test
    fun `toucher un outil ne touche que lui`() {
        val active = setOf(TRIM, SOUND)
        assertThat(ComposerEditTools.toggled(active, TRIM, familyOpen = false)).containsExactly(SOUND)
        assertThat(ComposerEditTools.toggled(setOf(SOUND), TRIM, familyOpen = false)).containsExactly(SOUND, TRIM)
    }

    @Test
    fun `sous une bande ouverte, toucher un outil replie le montre au lieu de le retirer`() {
        assertThat(ComposerEditTools.isShown(TRIM, setOf(TRIM), familyOpen = true)).isFalse()
        assertThat(ComposerEditTools.toggled(setOf(TRIM), TRIM, familyOpen = true)).containsExactly(TRIM)
        assertThat(ComposerEditTools.isShown(CROP, setOf(CROP), familyOpen = true)).isTrue()
    }

    @Test
    fun `Texte et Recadrer s excluent`() {
        assertThat(ComposerEditTools.toggled(setOf(CROP), TEXT, familyOpen = false)).containsExactly(TEXT)
        assertThat(ComposerEditTools.toggled(setOf(TEXT, TRIM), CROP, familyOpen = false)).containsExactly(CROP, TRIM)
        assertThat(ComposerEditTools.panel(TEXT)).isEqualTo(ComposerEditPanel.NONE)
    }

    @Test
    fun `les panneaux s empilent des proportions a la coupe, le son se pose sur la coupe, une bande les remplace`() {
        assertThat(ComposerEditTools.panels(familyOpen = false, active = setOf(TRIM, CROP, SOUND)))
            .containsExactly(ComposerEditPanel.PRESETS, ComposerEditPanel.TRIM).inOrder()
        assertThat(ComposerEditTools.panels(familyOpen = false, active = setOf(SOUND))).containsExactly(ComposerEditPanel.SOUND)
        assertThat(ComposerEditTools.panels(familyOpen = true, active = setOf(CROP, TRIM))).containsExactly(ComposerEditPanel.BAND)
    }

    @Test
    fun `seul le recadrage cadre la scene, et ses equerres le suivent`() {
        assertThat(ComposerEditTools.framesScene(setOf(CROP), chromeShown = true)).isTrue()
        assertThat(ComposerEditTools.framesScene(setOf(CROP), chromeShown = false)).isFalse()
        assertThat(ComposerEditTools.framesScene(setOf(TRIM, SOUND), chromeShown = true)).isFalse()
        assertThat(ComposerEditTools.showsBrackets(setOf(CROP))).isTrue()
        assertThat(ComposerEditTools.showsBrackets(setOf(TEXT))).isFalse()
    }

    @Test
    fun `Naturel ne coute aucune passe, Chaud rechauffe et Vif sature`() {
        assertThat(ComposerLookColorimetry.recipe(VideoFilterPreset.Natural).isNeutral).isTrue()
        assertThat(ComposerLookColorimetry.grades(VideoFilterPreset.Natural)).isFalse()
        val warm = ComposerLookColorimetry.recipe(VideoFilterPreset.Warm)
        assertThat(warm.filterTemperatureKelvin).isGreaterThan(SceneLookMatrix.NEUTRAL_KELVIN)
        val cool = ComposerLookColorimetry.recipe(VideoFilterPreset.Cool)
        assertThat(cool.filterTemperatureKelvin).isLessThan(SceneLookMatrix.NEUTRAL_KELVIN)
        assertThat(ComposerLookColorimetry.recipe(VideoFilterPreset.Vivid).params.saturation).isGreaterThan(1f)
        assertThat(ComposerLookColorimetry.recipe(VideoFilterPreset.Muted).params.saturation).isLessThan(1f)
        VideoFilterPreset.entries.drop(1).forEach { assertThat(ComposerLookColorimetry.grades(it)).isTrue() }
    }
}
