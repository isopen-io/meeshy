package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import org.junit.Test

class ImagerLengthTest {

    @Test fun `sous une minute aucun choix n est propose`() {
        assertThat(ImagerLength.choices(59_000)).isEmpty()
        assertThat(ImagerLength.choices(60_000)).isEmpty()
        assertThat(ImagerLength.choices(0)).isEmpty()
    }

    @Test fun `au dela d une minute les quatre quarts depuis le debut avec leur duree`() {
        assertThat(ImagerLength.choices(240_000)).containsExactly(
            ImagerLengthChoice(ImagerQuarter.ONE, 60_000),
            ImagerLengthChoice(ImagerQuarter.TWO, 120_000),
            ImagerLengthChoice(ImagerQuarter.THREE, 180_000),
            ImagerLengthChoice(ImagerQuarter.FOUR, 240_000),
        ).inOrder()
    }

    @Test fun `imager un contenu de quatre minutes en deux quarts rend deux minutes`() {
        assertThat(ImagerLength.renderedMillis(240_000, ImagerQuarter.TWO)).isEqualTo(120_000)
        assertThat(ImagerLength.renderedMillis(240_000, ImagerQuarter.FOUR)).isEqualTo(240_000)
    }

    @Test fun `sans choix ou sous le seuil la composition entiere est rendue`() {
        assertThat(ImagerLength.renderedMillis(240_000, null)).isEqualTo(240_000)
        assertThat(ImagerLength.renderedMillis(45_000, ImagerQuarter.ONE)).isEqualTo(45_000)
    }

    @Test fun `enregistrer et partager ne proposent jamais de choix, imager seul le fait`() {
        assertThat(StoryExportMode.SAVE.lengthChoices(240_000)).isEmpty()
        assertThat(StoryExportMode.SHARE.lengthChoices(240_000)).isEmpty()
        assertThat(StoryExportMode.IMAGER.lengthChoices(240_000)).hasSize(4)
        assertThat(StoryExportMode.IMAGER.lengthChoices(30_000)).isEmpty()
    }

    @Test fun `imager seul ouvre la vue imager, enregistrer et partager rendent sans elle`() {
        assertThat(StoryExportMode.IMAGER.opensImagerView).isTrue()
        assertThat(StoryExportMode.SAVE.opensImagerView).isFalse()
        assertThat(StoryExportMode.SHARE.opensImagerView).isFalse()
    }

    @Test fun `la vue imager d une composition courte ne propose aucun quart et rend tout`() {
        val offer = ImagerOffer.of(30_000)
        assertThat(offer.totalMillis).isEqualTo(30_000)
        assertThat(offer.choices).isEmpty()
        assertThat(offer.preselected).isNull()
        assertThat(offer.renderedMillis(ImagerDecision(SceneExportDestination.GALLERY))).isEqualTo(30_000)
    }

    @Test fun `au dela d une minute la vue imager propose les quatre quarts, le tout preselectionne`() {
        val offer = ImagerOffer.of(240_000)
        assertThat(offer.choices.map { it.quarter }).containsExactlyElementsIn(ImagerQuarter.entries).inOrder()
        assertThat(offer.preselected).isEqualTo(ImagerQuarter.FOUR)
        assertThat(offer.renderedMillis(ImagerDecision(SceneExportDestination.SHARE, ImagerQuarter.ONE))).isEqualTo(60_000)
    }
}
