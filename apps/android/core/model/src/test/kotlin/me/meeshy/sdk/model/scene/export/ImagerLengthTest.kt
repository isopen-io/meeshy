package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
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

    @Test fun `enregistrer et partager rendent la composition entiere`() {
        assertThat(StoryExportMode.SAVE.renderedMillis(240_000)).isEqualTo(240_000)
        assertThat(StoryExportMode.SHARE.renderedMillis(240_000)).isEqualTo(240_000)
    }

    @Test fun `la carte de l atelier ne rend que le debut de la composition, son image`() {
        assertThat(StoryExportMode.CARD.renderedMillis(240_000)).isEqualTo(StoryExportMode.CARD_RENDER_MILLIS)
        assertThat(StoryExportMode.CARD.renderedMillis(1_200)).isEqualTo(1_200)
        assertThat(StoryExportMode.CARD.renderedMillis(-5)).isEqualTo(0)
    }

    @Test fun `aucune sortie ne garde la vue imager de scene`() {
        assertThat(StoryExportMode.entries.map { it.name }).containsExactly("SAVE", "SHARE", "CARD").inOrder()
    }
}
