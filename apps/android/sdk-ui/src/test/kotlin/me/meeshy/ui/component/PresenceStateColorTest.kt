package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.PresenceStyle
import me.meeshy.sdk.model.avatar.AvatarDotTone
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

class PresenceStateColorTest {

    @Test
    fun `la table des teintes et celle des couleurs disent la meme chose pour les quatre etats`() {
        PresenceState.values().forEach { state ->
            val viaTone = PresenceStyle.dotTone(state)?.let(::meeshyDotToneColor)
            assertThat(viaTone).isEqualTo(meeshyPresenceDotColor(state))
        }
    }

    @Test
    fun `les trois etats affiches ont leur couleur et hors ligne n'en a aucune`() {
        assertThat(meeshyPresenceDotColor(PresenceState.ONLINE)).isEqualTo(MeeshyPalette.Success)
        assertThat(meeshyPresenceDotColor(PresenceState.AWAY)).isEqualTo(MeeshyPalette.Warning)
        assertThat(meeshyPresenceDotColor(PresenceState.IDLE)).isEqualTo(MeeshyPalette.Neutral400)
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
    }

    @Test
    fun `ici se peint de la couleur primaire de la marque`() {
        assertThat(meeshyDotToneColor(AvatarDotTone.HERE)).isEqualTo(MeeshyPalette.Indigo500)
    }
}
