package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/**
 * Central presence dot rule (parity web/iOS): online+recent -> green (Success),
 * away -> orange (Warning), offline -> gray (Neutral400), no data (null) -> no dot.
 */
class MeeshyAvatarTest {

    @Test
    fun `online presence is the green success colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Success)
    }

    @Test
    fun `recent presence is the green success colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.RECENT)).isEqualTo(MeeshyPalette.Success)
    }

    @Test
    fun `away presence is the orange warning colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `offline presence is the neutral gray`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isEqualTo(MeeshyPalette.Neutral400)
    }

    @Test
    fun `missing presence data shows no dot`() {
        assertThat(meeshyPresenceDotColor(null)).isNull()
    }
}
