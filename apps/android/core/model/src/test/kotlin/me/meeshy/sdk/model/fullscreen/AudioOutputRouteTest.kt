package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Sur iOS, `AirPlayRoutePicker` ouvre le sélecteur système. Android n'a pas d'AirPlay : la
 * route qui le remplace dépend de la version du système, jamais d'un réglage de l'utilisateur.
 */
class AudioOutputRouteTest {

    @Test
    fun `des l'API 34 le selecteur de sortie du systeme s'ouvre`() {
        assertThat(AudioOutputRoute.forSdk(34)).isEqualTo(AudioOutputRoute.SystemOutputSwitcher)
        assertThat(AudioOutputRoute.forSdk(35)).isEqualTo(AudioOutputRoute.SystemOutputSwitcher)
        assertThat(AudioOutputRoute.forSdk(37)).isEqualTo(AudioOutputRoute.SystemOutputSwitcher)
    }

    @Test
    fun `avant l'API 34 le bouton mene aux reglages Bluetooth, d'ou l'on choisit l'enceinte`() {
        assertThat(AudioOutputRoute.forSdk(33)).isEqualTo(AudioOutputRoute.BluetoothSettings)
        assertThat(AudioOutputRoute.forSdk(29)).isEqualTo(AudioOutputRoute.BluetoothSettings)
        assertThat(AudioOutputRoute.forSdk(26)).isEqualTo(AudioOutputRoute.BluetoothSettings)
    }

    @Test
    fun `le seuil est l'API 34 exactement`() {
        assertThat(AudioOutputRoute.SYSTEM_SWITCHER_MIN_SDK).isEqualTo(34)
    }
}
