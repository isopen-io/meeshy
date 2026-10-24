package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Ce que la passerelle sert avec une demande d'ami, lu avec la tolerance que l'iOS
 * epingle (`FriendRequestUser.profileDecor`, #10945) : un contour d'avatar equipe
 * voyage avec la personne ; absent (ancien serveur, rien d'equipe) c'est `null` ; un
 * bloc mal forme n'emporte JAMAIS la demande qui le porte.
 */
class FriendRequestWireTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(senderExtra: String): FriendRequest = json.decodeFromString(
        """{"id":"r1","senderId":"u1","receiverId":"me","status":"pending",
            "sender":{"id":"u1","username":"alice","isOnline":true$senderExtra}}""",
    )

    @Test
    fun `an equipped avatar ring rides with the person`() {
        val request = decode(""","profileDecor":{"avatarRing":{"pack":"neon","item":"pulse","origin":"builtin"}}""")

        assertThat(request.sender!!.profileDecor).isNotNull()
        assertThat(request.sender!!.profileDecor.toString()).contains("neon")
    }

    @Test
    fun `no decor served is no decor`() {
        assertThat(decode("").sender!!.profileDecor).isNull()
        assertThat(decode(""","profileDecor":null""").sender!!.profileDecor).isNull()
    }

    @Test
    fun `a malformed decor never sinks the request, the person or their other fields`() {
        listOf("\"oops\"", "42", "true", "[1,2]", "{\"avatarRing\":\"broken\"}", "{\"unknown\":{}}").forEach { malformed ->
            val request = decode(""","profileDecor":$malformed""")

            assertThat(request.id).isEqualTo("r1")
            assertThat(request.sender!!.username).isEqualTo("alice")
            assertThat(request.sender!!.isOnline).isTrue()
        }
    }

    @Test
    fun `a decor survives the cache round trip untouched`() {
        val request = decode(""","profileDecor":{"avatarRing":{"pack":"neon","item":"pulse"}}""")

        val replayed = json.decodeFromString<FriendRequest>(json.encodeToString(request))

        assertThat(replayed).isEqualTo(request)
    }

    @Test
    fun `a request cached before the field existed decodes with no decor`() {
        val old = json.decodeFromString<FriendRequest>(
            """{"id":"r1","status":"pending","sender":{"id":"u1","username":"alice"}}""",
        )

        assertThat(old.sender!!.profileDecor).isNull()
    }
}
