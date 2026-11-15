package me.meeshy.app.widget.kit

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import org.junit.Test

class WidgetPresenceTokenTest {

    @Test
    fun `each state crosses to the bitmap as the stable token iOS publishes`() {
        assertThat(WidgetPresence.token(PresenceState.ONLINE)).isEqualTo("online")
        assertThat(WidgetPresence.token(PresenceState.AWAY)).isEqualTo("away")
        assertThat(WidgetPresence.token(PresenceState.IDLE)).isEqualTo("idle")
        assertThat(WidgetPresence.token(PresenceState.OFFLINE)).isEqualTo("offline")
    }

    @Test
    fun `no state is no token`() {
        assertThat(WidgetPresence.token(null)).isNull()
    }

    @Test
    fun `a token read back gives the same state`() {
        PresenceState.values().forEach { state ->
            assertThat(WidgetPresence.parse(WidgetPresence.token(state))?.state).isEqualTo(state)
        }
    }
}
