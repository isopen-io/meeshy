package me.meeshy.app.stories

import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryEntryMetricsTest {

    @Test
    fun `mesures du plateau identiques a iOS`() {
        assertThat(StoryEntryMetrics.avatar).isEqualTo(88.dp)
        assertThat(StoryEntryMetrics.ring).isEqualTo(94.dp)
        assertThat(StoryEntryMetrics.labelWidth).isEqualTo(96.dp)
        assertThat(StoryEntryMetrics.height).isEqualTo(120.dp)
    }

    @Test
    fun `anneau non lu a double epaisseur du lu`() {
        assertThat(StoryEntryMetrics.ringWidthAccented.value)
            .isEqualTo(StoryEntryMetrics.ringWidthQuiet.value * 2)
    }

    @Test
    fun `la cascade couvre dix anneaux puis s'arrete`() {
        assertThat(StoryEntryMetrics.cascadeDelayMillis(0)).isEqualTo(0L)
        assertThat(StoryEntryMetrics.cascadeDelayMillis(9)).isEqualTo(450L)
        assertThat(StoryEntryMetrics.cascadeDelayMillis(10)).isNull()
        assertThat(StoryEntryMetrics.cascadeDelayMillis(-1)).isNull()
    }
}
