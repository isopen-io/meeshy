package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.ClientIdentity
import org.junit.Test

class SocketAuthPayloadTest {

    private val identity = ClientIdentity(
        appVersion = "2.4.0",
        appBuild = "240",
        deviceName = "Google Pixel 8",
        osVersion = "Android 15",
        timezone = "Europe/Paris",
        localeTag = "fr-FR",
        country = "FR",
    )

    @Test
    fun `un compte inscrit annonce son jwt, sa session et l'appareil complet`() {
        val auth = SocketAuthPayload.registered("jwt", "sess", identity)

        assertThat(auth["token"]).isEqualTo("jwt")
        assertThat(auth["sessionToken"]).isEqualTo("sess")
        assertThat(auth["client"]).isEqualTo(
            mapOf(
                "appVersion" to "2.4.0",
                "appBuild" to "240",
                "platform" to "android",
                "deviceModel" to "Google Pixel 8",
                "osVersion" to "Android 15",
                "timezone" to "Europe/Paris",
                "deviceLocale" to "fr-FR",
                "deviceName" to "Google Pixel 8",
            ),
        )
    }

    @Test
    fun `un compte sans session n'annonce que son jwt`() {
        val auth = SocketAuthPayload.registered("jwt", null, null)

        assertThat(auth.keys).containsExactly("token")
    }

    @Test
    fun `un invite n'envoie que son jeton de session`() {
        assertThat(SocketAuthPayload.guest("anon")).containsExactly("sessionToken", "anon")
    }

    @Test
    fun `une locale absente n'est pas declaree`() {
        val fields = SocketAuthPayload.clientFields(identity.copy(localeTag = null))

        assertThat(fields).doesNotContainKey("deviceLocale")
    }

    @Test
    fun `la decision choisit la charge, aucune pour un renouvellement`() {
        assertThat(SocketAuthPayload.of(SocketConnectDecision.RefreshFirst("j"), identity)).isNull()
        assertThat(SocketAuthPayload.of(SocketConnectDecision.NoCredentials, identity)).isNull()
        assertThat(SocketAuthPayload.of(SocketConnectDecision.ConnectGuest("g"), identity))
            .containsExactly("sessionToken", "g")
    }
}
