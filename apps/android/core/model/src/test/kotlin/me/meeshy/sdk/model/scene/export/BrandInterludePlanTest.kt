package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class BrandInterludePlanTest {

    private val story = 10_000L

    @Test
    fun `avec identite l'ordre est interlude, scene puis carte de fin`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = true)
        val segments = BrandInterludePlan.segments(plan, story)
        assertThat(segments.map { it.kind }).containsExactly(
            BrandSegmentKind.INTERLUDE, BrandSegmentKind.STORY, BrandSegmentKind.OUTRO,
        ).inOrder()
        assertThat(segments[0].range).isEqualTo(StoryExportTimeRange(0, 1_700))
        assertThat(segments[1].range).isEqualTo(StoryExportTimeRange(1_200, 10_000))
        assertThat(segments[2].range).isEqualTo(StoryExportTimeRange(9_700, 3_500))
        assertThat(BrandInterludePlan.totalMillis(plan, story)).isEqualTo(13_200)
    }

    @Test
    fun `sans identite pas d'interlude mais la carte de fin est toujours due`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = false, hasAuthorOutro = false)
        val segments = BrandInterludePlan.segments(plan, story)
        assertThat(segments.map { it.kind }).containsExactly(BrandSegmentKind.STORY, BrandSegmentKind.OUTRO).inOrder()
        assertThat(segments[1].range).isEqualTo(StoryExportTimeRange(8_500, 2_000))
    }

    @Test
    fun `la carte de fin ne commence jamais avant la fin de l'interlude`() {
        val plan = StoryExportBrandingPlan.make(hasIntro = true, hasAuthorOutro = false)
        val outro = BrandInterludePlan.segments(plan, 100L).last()
        assertThat(outro.range.startMillis).isAtLeast(plan.introFade.endMillis)
    }
}
