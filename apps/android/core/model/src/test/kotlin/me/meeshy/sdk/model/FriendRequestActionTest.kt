package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le corps CANONIQUE de `PATCH /directory/friend-requests/{id}` : un geste = une
 * ACTION (#4162). Quatre gestes vivaient sur deux verbes et trois routes ; le corps
 * `{ "action": … }` est leur unique forme, et sa valeur doit etre exactement celle
 * que l'enum de la passerelle accepte (`accept | reject | cancel | dismiss`).
 */
class FriendRequestActionTest {

    // Le meme reglage que `MeeshyApi.json` (:core:network) pour ce qui touche ce fichier.
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Test
    fun `the four gestures carry the exact words the gateway enum accepts`() {
        assertThat(FriendRequestAction.entries.associateWith { it.wire }).containsExactly(
            FriendRequestAction.Accept, "accept",
            FriendRequestAction.Reject, "reject",
            FriendRequestAction.Cancel, "cancel",
            FriendRequestAction.Dismiss, "dismiss",
        )
    }

    @Test
    fun `an action serializes to the canonical body, one key and nothing else`() {
        assertThat(json.encodeToString(FriendRequestAction.Accept.body())).isEqualTo("""{"action":"accept"}""")
        assertThat(json.encodeToString(FriendRequestAction.Reject.body())).isEqualTo("""{"action":"reject"}""")
        assertThat(json.encodeToString(FriendRequestAction.Cancel.body())).isEqualTo("""{"action":"cancel"}""")
        assertThat(json.encodeToString(FriendRequestAction.Dismiss.body())).isEqualTo("""{"action":"dismiss"}""")
    }

    @Test
    fun `answering a received request maps the yes-or-no to accept or reject`() {
        assertThat(FriendRequestAction.responding(accepted = true)).isEqualTo(FriendRequestAction.Accept)
        assertThat(FriendRequestAction.responding(accepted = false)).isEqualTo(FriendRequestAction.Reject)
    }

    @Test
    fun `the action is never serialized under the old status key`() {
        val body = json.encodeToString(FriendRequestAction.Accept.body())

        assertThat(body).doesNotContain("status")
    }

    @Test
    fun `the legacy body still says accepted or rejected, for the fallback only`() {
        assertThat(json.encodeToString(RespondFriendRequest(status = "accepted"))).isEqualTo("""{"status":"accepted"}""")
        assertThat(json.encodeToString(RespondFriendRequest(status = "rejected"))).isEqualTo("""{"status":"rejected"}""")
    }

    @Test
    fun `a listing direction is one of three words`() {
        assertThat(FriendRequestDirection.entries.map { it.wire })
            .containsExactly("received", "sent", "any").inOrder()
    }

    @Test
    fun `the deletion receipt decodes whatever the gateway chose to include`() {
        val full = json.decodeFromString<FriendRequestActionResult>(
            """{"id":"r1","deleted":true,"message":"Friend request removed","extra":1}""",
        )
        val bare = json.decodeFromString<FriendRequestActionResult>("{}")

        assertThat(full).isEqualTo(FriendRequestActionResult(id = "r1", deleted = true, message = "Friend request removed"))
        assertThat(bare).isEqualTo(FriendRequestActionResult())
    }
}
