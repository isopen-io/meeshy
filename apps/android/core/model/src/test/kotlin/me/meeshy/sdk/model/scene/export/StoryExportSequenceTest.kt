package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryExportSequenceTest {
    @Test fun `trois scenes se suivent bout a bout`() {
        val plan = StoryExportSequence.plan(listOf(5_000, 3_000, 4_000))!!
        assertThat(plan.segments.map { it.startMillis }).containsExactly(0L, 5_000L, 8_000L).inOrder()
        assertThat(plan.totalMillis).isEqualTo(12_000L)
    }

    @Test fun `aucune scene donne null`() {
        assertThat(StoryExportSequence.plan(emptyList())).isNull()
    }

    @Test fun `passthrough avant reencodage`() {
        assertThat(StoryExportSequence.strategies)
            .containsExactly(StoryExportSequence.Strategy.PASSTHROUGH, StoryExportSequence.Strategy.REENCODE).inOrder()
    }

    @Test fun `fenetre de source bornee et vieillie`() {
        assertThat(StoryExportSourceWindowRule.resolve(2.0, 6.0, 10.0)).isEqualTo(StoryExportSourceWindow(2_000, 4_000))
        assertThat(StoryExportSourceWindowRule.resolve(9.9, 10.0, 10.0)).isEqualTo(StoryExportSourceWindow(0, 10_000))
        assertThat(StoryExportSourceWindowRule.resolve(null, null, 10.0)).isEqualTo(StoryExportSourceWindow(0, 10_000))
    }

    @Test fun `fond muet sans automation ne porte pas de son`() {
        assertThat(StoryExportSourceWindowRule.carriesSound(true, listOf(null, 0.0))).isFalse()
        assertThat(StoryExportSourceWindowRule.carriesSound(true, listOf(0.5))).isTrue()
        assertThat(StoryExportSourceWindowRule.carriesSound(false, emptyList())).isTrue()
    }
}
