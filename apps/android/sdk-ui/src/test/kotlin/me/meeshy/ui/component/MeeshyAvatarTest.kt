package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/** Parity plan §4.3: the presence dot maps online→green, away→warning, offline→no dot. */
class MeeshyAvatarTest {

    @Test
    fun `online presence is the success green`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Success)
    }

    @Test
    fun `away presence is the warning colour`() {
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Warning)
    }

    @Test
    fun `offline shows no dot`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
    }
}
