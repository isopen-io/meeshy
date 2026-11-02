package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.MessageLimits
import org.junit.Test

class ServerEnvironmentConsistencyTest {

    @Test
    fun `STAGING est unique et son origine est celle du serveur deploye`() {
        assertThat(ServerEnvironment.entries.count { it.label == "Staging" }).isEqualTo(1)
        assertThat(ServerEnvironment.STAGING.origin).isEqualTo("https://gate.staging.meeshy.me")
    }

    @Test
    fun `l hote choisi pilote API, socket, web et medias`() {
        val api = ServerEnvironmentResolver.apiBaseUrl(ServerEnvironment.STAGING)
        val origin = ServerEnvironmentResolver.serverOrigin(api)

        assertThat(api).isEqualTo("https://gate.staging.meeshy.me/api/v1")
        assertThat(origin).isEqualTo("https://gate.staging.meeshy.me")
        assertThat(ServerEnvironmentResolver.webOrigin(origin)).isEqualTo("https://staging.meeshy.me")
    }

    @Test
    fun `chaque environnement fixe derive la meme origine pour l API et la socket`() {
        listOf(ServerEnvironment.PRODUCTION, ServerEnvironment.STAGING, ServerEnvironment.LOCALHOST).forEach { env ->
            val api = ServerEnvironmentResolver.apiBaseUrl(env)
            assertThat(ServerEnvironmentResolver.serverOrigin(api)).isEqualTo(env.origin)
        }
    }

    @Test
    fun `la limite d un message est partagee`() {
        assertThat(MessageLimits.MAX_MESSAGE_LENGTH).isEqualTo(2000)
    }
}
