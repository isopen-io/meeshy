package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryExportBrandingPlanTest {
    @Test fun `intro tient 1,2 s puis fond 0,5 s`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = false)
        assertThat(plan.storyStartMillis).isEqualTo(1_200L)
        assertThat(plan.introFade).isEqualTo(StoryExportTimeRange(1_200, 500))
    }

    @Test fun `sans intro la story demarre a zero`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = false, hasAuthorOutro = false)
        assertThat(plan.storyStartMillis).isEqualTo(0L)
        assertThat(plan.introFade.durationMillis).isEqualTo(0L)
    }

    @Test fun `carte de fin 2 s chevauche la story de 1,5 s`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = false)
        assertThat(plan.outroDurationMillis).isEqualTo(2_000L)
        assertThat(plan.outroStartMillis(10_000)).isEqualTo(1_200 + 10_000 - 1_500L)
        assertThat(plan.totalMillis(10_000)).isEqualTo(1_200 + 10_000 - 1_500 + 2_000L)
    }

    @Test fun `story courte ne passe pas sous la fin du fondu d'entree`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = false)
        assertThat(plan.outroStartMillis(300)).isEqualTo(1_700L)
    }

    @Test fun `fermeture d'auteur logo 1,5 s puis identite 2 s`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = false, hasAuthorOutro = true)
        assertThat(plan.outroDurationMillis).isEqualTo(3_500L)
        assertThat(plan.outroJingleOffsetMillis).isEqualTo(1_500L)
        assertThat(StoryExportBrandingPlan.AUTHOR_IDENTITY_FADE_IN_MILLIS).isEqualTo(400L)
        assertThat(StoryExportBrandingPlan.AUTHOR_WATERMARK_OPACITY).isEqualTo(0.22)
    }

    @Test fun `filigrane alterne de coin toutes les 12 s`() {
        assertThat(StoryExportWatermarkPlan.corner(0.0)).isEqualTo(StoryExportWatermarkCorner.BOTTOM_RIGHT)
        assertThat(StoryExportWatermarkPlan.corner(11.9)).isEqualTo(StoryExportWatermarkCorner.BOTTOM_RIGHT)
        assertThat(StoryExportWatermarkPlan.corner(12.0)).isEqualTo(StoryExportWatermarkCorner.TOP_LEFT)
        assertThat(StoryExportWatermarkPlan.corner(24.0)).isEqualTo(StoryExportWatermarkCorner.BOTTOM_RIGHT)
    }

    @Test fun `filigrane fond 0,4 s a chaque bascule a l'opacite 0,22`() {
        assertThat(StoryExportWatermarkPlan.alpha(0.0)).isEqualTo(0.0)
        assertThat(StoryExportWatermarkPlan.alpha(0.2)).isWithin(1e-9).of(0.11)
        assertThat(StoryExportWatermarkPlan.alpha(6.0)).isWithin(1e-9).of(0.22)
        assertThat(StoryExportWatermarkPlan.alpha(11.8)).isWithin(1e-9).of(0.11)
        assertThat(StoryExportWatermarkPlan.alpha(12.0)).isEqualTo(0.0)
    }
}
