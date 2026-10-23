package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TelecomPlatformSupportTest {

    private fun supported(
        sdk: Int = 34,
        connection: Boolean = true,
        telecom: Boolean = false,
        chromeOs: Boolean = false,
    ) = TelecomSupportLaw.isSupported(sdk, connection, telecom, chromeOs)

    @Test
    fun `un telephone avec service de connexion heberge l appel dans le systeme`() {
        assertThat(supported()).isTrue()
    }

    @Test
    fun `la fonction telecom suffit`() {
        assertThat(supported(connection = false, telecom = true)).isTrue()
    }

    @Test
    fun `une tablette sans telephonie reste dans l application`() {
        assertThat(supported(connection = false, telecom = false)).isFalse()
    }

    @Test
    fun `ChromeOS reste dans l application`() {
        assertThat(supported(chromeOs = true)).isFalse()
    }

    @Test
    fun `avant l API 26 il n y a pas d interface d appel auto-geree`() {
        assertThat(supported(sdk = 25)).isFalse()
    }
}
