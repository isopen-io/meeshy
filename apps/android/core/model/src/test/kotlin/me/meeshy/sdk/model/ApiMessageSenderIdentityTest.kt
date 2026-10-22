package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

private val wireJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    explicitNulls = false
    coerceInputValues = true
}

class ApiMessageSenderIdentityTest {

    private fun sender(payload: String) = wireJson.decodeFromString<ApiMessageSender>(payload)

    @Test
    fun `the type, not the pseudo, tells an anonymous guest`() {
        assertThat(sender("""{"id":"p1","username":"ano_xy12","type":"anonymous"}""").isAnonymous).isTrue()
        val account = sender("""{"id":"p2","username":"ano_bob","type":"user"}""")
        assertThat(account.isAnonymous).isFalse()
        assertThat(account.hasAccount).isTrue()
    }

    @Test
    fun `only user and bot prove an account, absent or unknown is a guest`() {
        assertThat(sender("""{"id":"p","type":"bot"}""").hasAccount).isTrue()
        assertThat(sender("""{"id":"p"}""").hasAccount).isFalse()
        assertThat(sender("""{"id":"p","type":"alien"}""").hasAccount).isFalse()
    }

    @Test
    fun `the name falls back through the nested user, the pseudo and the id`() {
        assertThat(sender("""{"id":"p","displayName":"Alice","username":"al"}""").name).isEqualTo("Alice")
        assertThat(sender("""{"id":"p","displayName":" ","user":{"displayName":"Nested"}}""").name).isEqualTo("Nested")
        assertThat(sender("""{"id":"p","username":"al"}""").name).isEqualTo("al")
        assertThat(sender("""{"id":"p","user":{"username":"deep"}}""").name).isEqualTo("deep")
        assertThat(sender("""{"id":"p"}""").name).isEqualTo("p")
    }

    @Test
    fun `the avatar and the user id resolve through the nested user`() {
        val s = sender("""{"id":"p","avatar":"","user":{"id":"u9","avatar":"/a.png"}}""")
        assertThat(s.resolvedAvatar).isEqualTo("/a.png")
        assertThat(s.resolvedUserId).isEqualTo("u9")
        assertThat(sender("""{"id":"p","userId":"u1","user":{"id":"u9"}}""").resolvedUserId).isEqualTo("u1")
    }
}
