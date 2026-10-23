package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class UserActivationDecodingTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    private fun decode(raw: String) = json.decodeFromString(UserActivation.serializer(), raw)

    @Test
    fun `an unknown phase is null and never an invitation`() {
        val activation = decode("""{"phase":"hibernating","missing":["email"]}""")

        assertThat(activation.phase).isNull()
        assertThat(activation.invites).isFalse()
    }

    @Test
    fun `an unknown channel is dropped alone`() {
        val activation = decode("""{"phase":"invite","missing":["email","carrier-pigeon","phone"]}""")

        assertThat(activation.missing)
            .containsExactly(UserActivation.Channel.EMAIL, UserActivation.Channel.PHONE).inOrder()
        assertThat(activation.invites).isTrue()
    }

    @Test
    fun `missing is empty by default and invite with nothing missing does not invite`() {
        val activation = decode("""{"phase":"invite"}""")

        assertThat(activation.missing).isEmpty()
        assertThat(activation.invites).isFalse()
    }

    @Test
    fun `an unreadable deadline yields no days left`() {
        val activation = decode("""{"phase":"invite","deadline":"demain","missing":["email"]}""")

        assertThat(activation.daysLeft(nowEpochMillis = 0L)).isNull()
    }

    @Test
    fun `days left round up and never go negative`() {
        val activation = decode("""{"phase":"invite","deadline":"1970-01-03T00:00:00.000Z"}""")

        assertThat(activation.daysLeft(nowEpochMillis = 0L)).isEqualTo(2)
        assertThat(activation.daysLeft(nowEpochMillis = 3_600_000L)).isEqualTo(2)
        assertThat(activation.daysLeft(nowEpochMillis = 10 * 86_400_000L)).isEqualTo(0)
    }

    @Test
    fun `a non-object activation decodes to an empty activation`() {
        val user = json.decodeFromString(
            MeeshyUser.serializer(),
            """{"id":"u","username":"x","activation":"weird"}""",
        )

        assertThat(user.activation?.phase).isNull()
    }
}
