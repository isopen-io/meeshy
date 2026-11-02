package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ClientIdentityHeadersTest {

    private fun identity(
        capabilities: List<ClientCapability> = emptyList(),
        country: String? = "FR",
    ) = ClientIdentity(
        appVersion = "2.1.0",
        appBuild = "42",
        deviceName = "Samsung Galaxy S23 Ultra",
        osVersion = "14",
        timezone = "Europe/Paris",
        localeTag = "fr-FR",
        country = country,
        capabilities = capabilities,
    )

    private val headers get() = ClientIdentityHeaders.build(identity())

    @Test
    fun `chaque en-tete d identite est porte`() {
        assertThat(headers).containsEntry("X-Meeshy-Version", "2.1.0")
        assertThat(headers).containsEntry("X-Meeshy-Build", "42")
        assertThat(headers).containsEntry("X-Meeshy-Platform", "android")
        assertThat(headers).containsEntry("X-Meeshy-Device", "Samsung Galaxy S23 Ultra")
        assertThat(headers).containsEntry("X-Meeshy-OS", "14")
        assertThat(headers).containsEntry("X-Meeshy-Timezone", "Europe/Paris")
        assertThat(headers).containsEntry("X-Meeshy-Locale", "fr-FR")
        assertThat(headers).containsEntry("X-Meeshy-Country", "FR")
    }

    @Test
    fun `la porte de version porte sa paire distincte`() {
        assertThat(headers).containsEntry("X-App-Version", "2.1.0")
        assertThat(headers).containsEntry("X-App-Platform", "android")
    }

    @Test
    fun `sans region aucun pays n est annonce`() {
        assertThat(ClientIdentityHeaders.build(identity(country = null))).doesNotContainKey("X-Meeshy-Country")
        assertThat(ClientIdentityHeaders.build(identity(country = ""))).doesNotContainKey("X-Meeshy-Country")
    }

    @Test
    fun `sans capacite lisible l en-tete de capacites est absent`() {
        assertThat(headers).doesNotContainKey("X-Meeshy-Capabilities")
    }

    @Test
    fun `les capacites declarees se joignent par des virgules`() {
        val built = ClientIdentityHeaders.build(
            identity(listOf(ClientCapability.ONBOARDING_AGE, ClientCapability.LINK_DEVICE_BINDING)),
        )
        assertThat(built).containsEntry("X-Meeshy-Capabilities", "onboarding-age,link-device-binding")
    }

    @Test
    fun `ce binaire ne declare encore aucune capacite dont l ecran manque`() {
        assertThat(ClientCapabilities.declared).isEmpty()
        assertThat(ClientCapabilities.headerValue()).isNull()
    }
}
