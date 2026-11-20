package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/** Les demandes d'entrée lues par les intendants (#19878, miroir de `community-join-requests.ts` du web). */
class CommunityJoinRequestTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun decode(raw: String) = json.decodeFromString(ApiCommunityJoinRequest.serializer(), raw)

    @Test
    fun `une demande servie se lit nom, pays et date, sans rien d autre`() {
        val request = decode(
            """{"id":"r1","userId":"u1","status":"pending","country":"SN","createdAt":"2026-11-20T10:00:00.000Z",
               "user":{"id":"u1","username":"awa","displayName":"Awa Diop","avatar":"https://x/a.png","isOnline":true,"email":"a@x"}}""",
        )

        assertThat(request.name).isEqualTo("Awa Diop")
        assertThat(request.countryCode).isEqualTo("SN")
        assertThat(request.avatar).isEqualTo("https://x/a.png")
        assertThat(request.isReadable).isTrue()
    }

    @Test
    fun `sans nom affiche, la demande se nomme par le pseudo`() {
        val request = decode("""{"id":"r1","userId":"u1","createdAt":"2026-11-20T10:00:00.000Z","user":{"username":"awa","displayName":"  "}}""")
        assertThat(request.name).isEqualTo("awa")
    }

    @Test
    fun `un pays qui n est pas un code ISO a deux lettres ne se dit pas`() {
        listOf("Dakar", "sn", "SEN", "").forEach { country ->
            val request = decode("""{"id":"r1","userId":"u1","country":"$country","createdAt":"2026-11-20T10:00:00.000Z","user":{"username":"awa"}}""")
            assertThat(request.countryCode).isNull()
        }
    }

    @Test
    fun `une demande sans identifiant ou deja tranchee n est pas lisible`() {
        assertThat(decode("""{"id":"","userId":"u1","createdAt":"x","user":{"username":"a"}}""").isReadable).isFalse()
        assertThat(decode("""{"id":"r1","userId":"","createdAt":"x","user":{"username":"a"}}""").isReadable).isFalse()
        assertThat(decode("""{"id":"r1","userId":"u1","status":"accepted","createdAt":"x","user":{"username":"a"}}""").isReadable).isFalse()
    }

    @Test
    fun `qui tranche - le createur, l admin et le moderateur, jamais le membre ni le visiteur`() {
        fun access(role: String?, createdBy: String = "owner") =
            CommunityAccess.of(ApiCommunity(id = "c1", createdBy = createdBy, currentUserRole = role), "me")

        assertThat(access(null, createdBy = "me").canDecideJoinRequests).isTrue()
        assertThat(access("admin").canDecideJoinRequests).isTrue()
        assertThat(access("moderator").canDecideJoinRequests).isTrue()
        assertThat(access("member").canDecideJoinRequests).isFalse()
        assertThat(access(null).canDecideJoinRequests).isFalse()
    }

    @Test
    fun `l annonce d une demande se lit par sa communaute seule`() {
        val event = json.decodeFromString(
            CommunityJoinRequestedEvent.serializer(),
            """{"communityId":"c1","requestId":"r1","userId":"u1","pendingCount":3,"at":"2026-11-20T10:00:00.000Z"}""",
        )
        assertThat(event.communityId).isEqualTo("c1")
        assertThat(json.decodeFromString(CommunityJoinRequestedEvent.serializer(), """{"communityId":"c1"}""").communityId).isEqualTo("c1")
    }
}
