package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import okhttp3.Authenticator
import okhttp3.Interceptor
import org.junit.Test

class HttpClientContributorOrderTest {

    private fun tagging(id: String, priority: Int, log: MutableList<String>? = null) =
        HttpClientContributor.of(id, priority) { builder ->
            log?.add(id)
            builder.addInterceptor(Interceptor { it.proceed(it.request()) })
        }

    @Test
    fun `l'ordre suit la priorite puis l'identifiant`() {
        val ordered = HttpClientAssembler.ordered(
            listOf(tagging("b", 20), tagging("z", 10), tagging("a", 20)),
        )
        assertThat(ordered.map { it.id }).containsExactly("z", "a", "b").inOrder()
    }

    @Test
    fun `l'ordre ne depend pas de l'ordre d'arrivee`() {
        val one = listOf(tagging("a", 5), tagging("b", 5), tagging("c", 1))
        assertThat(HttpClientAssembler.ordered(one).map { it.id })
            .isEqualTo(HttpClientAssembler.ordered(one.reversed()).map { it.id })
    }

    @Test
    fun `les contributeurs sont appliques dans l'ordre`() {
        val applied = mutableListOf<String>()
        HttpClientAssembler.build(listOf(tagging("late", 900, applied), tagging("early", 1, applied)))
        assertThat(applied).containsExactly("early", "late").inOrder()
    }

    @Test
    fun `un authenticator est contribuable`() {
        val authenticator = Authenticator { _, _ -> null }
        val client = HttpClientAssembler.build(
            listOf(HttpClientContributor.of("auth", 1) { it.authenticator(authenticator) }),
        )
        assertThat(client.authenticator).isSameInstanceAs(authenticator)
    }

    @Test
    fun `le socle s'ordonne guard puis politique puis reessai puis identite`() {
        val ids = HttpClientAssembler.ordered(
            builtInContributors(MeeshyConfig(enableLogging = true), InMemoryTokenStore(), {}, SessionRefresher(InMemoryTokenStore()) { null }),
        ).map { it.id }
        assertThat(ids).containsExactly(
            "url-guard", "endpoint-policy", "retry", "proactive-refresh", "auth", "client-capabilities",
            "device-locale", "auth-expiry", "refresh-authenticator", "slow-request", "logging",
        ).inOrder()
    }
}
