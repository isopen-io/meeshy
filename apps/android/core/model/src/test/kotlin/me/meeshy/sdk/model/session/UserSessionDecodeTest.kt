package me.meeshy.sdk.model.session

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class UserSessionDecodeTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun decode(text: String): UserSessionsPayload = json.decodeFromString(text)

    @Test
    fun `une charge complete se decode champ par champ`() {
        val payload = decode(
            """{"sessions":[{"id":"s1","deviceName":"Pixel de Sam","ipAddress":"203.0.113.4",
            "lastActivityAt":"2026-10-01T10:00:00.000Z","createdAt":"2026-09-01T08:00:00.000Z",
            "isCurrentSession":true,"deviceType":"mobile","deviceVendor":"Google","deviceModel":"Pixel 8",
            "osName":"Android","osVersion":"15","browserName":"Chrome","browserVersion":"129.0.1",
            "isMobile":true,"appVersion":"1.2.0","appBuild":"1874","platform":"android-shell",
            "loginMethod":"magic_link","country":"FR","city":"Lyon","location":"Lyon, FR",
            "timezone":"Europe/Paris","isTrusted":true}],"totalCount":1,
            "geolocation":{"provider":"DB-IP","text":"IP Geolocation by DB-IP","url":"https://db-ip.com",
            "license":"CC-BY-4.0","approximate":true}}""",
        )
        val s = payload.sessions.single()
        assertThat(s.id).isEqualTo("s1")
        assertThat(s.isCurrentSession).isTrue()
        assertThat(s.appBuild).isEqualTo("1874")
        assertThat(s.timezone).isEqualTo("Europe/Paris")
        assertThat(s.isTrusted).isTrue()
        assertThat(s.lastActiveMillis).isEqualTo(1_790_848_800_000L)
        assertThat(payload.totalCount).isEqualTo(1)
    }

    @Test
    fun `une charge minimale se decode avec des champs absents`() {
        val s = decode("""{"sessions":[{"id":"old"}]}""").sessions.single()
        assertThat(s.id).isEqualTo("old")
        assertThat(s.isCurrentSession).isFalse()
        assertThat(s.deviceName).isNull()
        assertThat(s.createdAtMillis).isNull()
        assertThat(s.loginMethod).isNull()
    }

    @Test
    fun `les cles inconnues sont ignorees`() {
        val payload = decode("""{"sessions":[{"id":"s","futur":{"a":1}}],"inconnue":3}""")
        assertThat(payload.sessions.single().id).isEqualTo("s")
    }

    @Test
    fun `sans geolocation le repli est l attribution DB-IP`() {
        val payload = decode("""{"sessions":[]}""")
        assertThat(payload.geolocation).isNull()
        assertThat(payload.attribution).isEqualTo(GeolocationAttribution.DB_IP)
        assertThat(payload.attribution.approximate).isTrue()
    }

    @Test
    fun `l attribution servie l emporte sur le repli`() {
        val payload = decode("""{"sessions":[],"geolocation":{"text":"Autre"}}""")
        assertThat(payload.attribution.text).isEqualTo("Autre")
    }
}
