package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SlideThumbEditAffordanceTest {
    @Test
    fun `a slide with a background media offers to edit it`() {
        assertThat(SlideThumbEditAffordance.editableBackgroundId("m1", hostServesEditor = true)).isEqualTo("m1")
    }

    @Test
    fun `a slide without a background offers nothing`() {
        assertThat(SlideThumbEditAffordance.editableBackgroundId(null, hostServesEditor = true)).isNull()
    }

    @Test
    fun `a blank identifier offers nothing, the editor would open on a missing object`() {
        assertThat(SlideThumbEditAffordance.editableBackgroundId("  ", hostServesEditor = true)).isNull()
        assertThat(SlideThumbEditAffordance.editableBackgroundId("", hostServesEditor = true)).isNull()
    }

    @Test
    fun `a host that serves no editor shows no entry`() {
        assertThat(SlideThumbEditAffordance.editableBackgroundId("m1", hostServesEditor = false)).isNull()
    }
}
