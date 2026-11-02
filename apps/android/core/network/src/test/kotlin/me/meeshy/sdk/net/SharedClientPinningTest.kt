package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.CertificatePinPolicy
import okhttp3.OkHttpClient
import org.junit.Test
import java.util.concurrent.TimeUnit

class SharedClientPinningTest {

    private fun pinned(): OkHttpClient = HttpClientAssembler.build(
        listOf(CertificatePinnerContributor.of(CertificatePinPolicy(setOf("gate.meeshy.me"), setOf("a="), emptySet(), Long.MAX_VALUE))),
    )

    @Test
    fun `Retrofit utilise le client epingle`() {
        val client = pinned()
        val retrofit = MeeshyApi.buildRetrofit(MeeshyConfig(), client)
        assertThat(retrofit.callFactory()).isSameInstanceAs(client)
        assertThat(client.networkInterceptors.any { it is CertificatePinInterceptor }).isTrue()
    }

    @Test
    fun `le transport de la socket derive du client partage garde l'epinglage`() {
        val transport = pinned().newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
        assertThat(transport.networkInterceptors.any { it is CertificatePinInterceptor }).isTrue()
    }

    @Test
    fun `la politique de production epingle production et staging seulement`() {
        assertThat(GatewayPins.POLICY.pinnedHosts).containsExactly("gate.meeshy.me", "gate.staging.meeshy.me")
    }
}
