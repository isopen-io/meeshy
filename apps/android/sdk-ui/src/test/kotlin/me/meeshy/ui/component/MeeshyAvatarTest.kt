package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/** Presence dot rule (parity web/iOS): online+recent → orange, away → gray, offline → no dot. */
class MeeshyAvatarTest {

    @Test
    fun `online presence is the orange warning colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `recent presence is the orange warning colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.RECENT)).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `away presence is the neutral gray`() {
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Neutral400)
    }

    @Test
    fun `offline shows no dot`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
    }
}
