package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.auth.ServerEnvironment
import org.junit.Test

/**
 * Behavioural spec for [NetworkModule.providesMeeshyConfig]'s derivation from a
 * [ServerEnvironmentStore] — the Android equivalent of iOS
 * `MeeshyConfig.restoreEnvironment()` "at app launch" (see the function's own
 * doc comment). The URL math itself is [ServerEnvironmentResolver]'s (already
 * covered by `ServerEnvironmentTest` in `:core:model`); this spec only proves the
 * composition — trailing `/` for Retrofit, `socketUrl` derived from the SAME
 * `apiBaseUrl` read, not a second independent one.
 */
class NetworkModuleTest {

    @Test
    fun providesMeeshyConfig_defaultStore_resolvesProductionWithATrailingSlash() {
        val config = NetworkModule.providesMeeshyConfig(InMemoryServerEnvironmentStore())

        assertThat(config.apiBaseUrl).isEqualTo("https://gate.meeshy.me/api/v1/")
        assertThat(config.socketUrl).isEqualTo("https://gate.meeshy.me")
    }

    @Test
    fun providesMeeshyConfig_stagingSelected_resolvesStagingUrls() {
        val store = InMemoryServerEnvironmentStore(initialEnvironment = ServerEnvironment.STAGING)

        val config = NetworkModule.providesMeeshyConfig(store)

        assertThat(config.apiBaseUrl).isEqualTo("https://gate.staging.meeshy.me/api/v1/")
        assertThat(config.socketUrl).isEqualTo("https://gate.staging.meeshy.me")
    }

    @Test
    fun providesMeeshyConfig_customEnvironmentSelected_resolvesFromThePersistedHost() {
        val store = InMemoryServerEnvironmentStore(
            initialEnvironment = ServerEnvironment.CUSTOM,
            initialCustomHost = "gate.example.com",
        )

        val config = NetworkModule.providesMeeshyConfig(store)

        assertThat(config.apiBaseUrl).isEqualTo("https://gate.example.com/api/v1/")
        assertThat(config.socketUrl).isEqualTo("https://gate.example.com")
    }
}
