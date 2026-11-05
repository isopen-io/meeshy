package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PendingPreferenceCategoriesTest {

    @Test
    fun `the seven categories survive a round trip through the durable token`() {
        val all = PreferenceCategory.entries.toSet()

        assertThat(PendingPreferenceCategories.decode(PendingPreferenceCategories.encode(all))).isEqualTo(all)
    }

    @Test
    fun `an absent, empty or corrupt token reads as nothing pending`() {
        assertThat(PendingPreferenceCategories.decode(null)).isEmpty()
        assertThat(PendingPreferenceCategories.decode("  ")).isEmpty()
        assertThat(PendingPreferenceCategories.decode("{not json")).isEmpty()
    }

    @Test
    fun `a category name from a newer build is skipped without dropping its neighbours`() {
        val decoded = PendingPreferenceCategories.decode("""["video","hologram","audio"]""")

        assertThat(decoded).containsExactly(PreferenceCategory.VIDEO, PreferenceCategory.AUDIO)
    }
}
