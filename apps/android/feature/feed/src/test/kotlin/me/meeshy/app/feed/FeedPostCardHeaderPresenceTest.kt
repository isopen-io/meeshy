package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/** #14827 — l'avatar de l'en-tête suit la loi de présence : vert, orange, gris affiché ; hors ligne, aucun point. */
class FeedPostCardHeaderPresenceTest {

    @Test
    fun `presence states map to the dot of the law`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Success)
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Warning)
        assertThat(meeshyPresenceDotColor(PresenceState.IDLE)).isEqualTo(MeeshyPalette.Neutral400)
    }

    @Test
    fun `offline and unknown presence draw no dot`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
        assertThat(meeshyPresenceDotColor(null)).isNull()
    }
}
