package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/**
 * Central presence dot rule 1/3/5 (parity web/iOS): online -> green (Success),
 * away -> orange (Warning), idle -> grey DISPLAYED (Neutral400),
 * offline / no data -> no dot (null).
 */
class MeeshyAvatarTest {

    @Test
    fun `online presence is the green success colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Success)
    }

    @Test
    fun `away presence is the orange warning colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `idle presence is the grey neutral colour (displayed)`() {
        assertThat(meeshyPresenceDotColor(PresenceState.IDLE)).isEqualTo(MeeshyPalette.Neutral400)
    }

    @Test
    fun `offline presence shows no dot`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
    }

    @Test
    fun `missing presence data shows no dot`() {
        assertThat(meeshyPresenceDotColor(null)).isNull()
    }
}
