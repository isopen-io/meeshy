package me.meeshy.sdk.model.signal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BundlePublicationPolicyTest {
    private fun local(identity: String = "ik", spk: String = "spk") = SignalPreKeyBundle(
        identityKey = identity, registrationId = 1, deviceId = 1, signedPreKeyId = 2,
        signedPreKeyPublic = spk, signedPreKeySignature = "sig",
    )

    @Test
    fun `rien de publie donne publier`() {
        assertThat(BundlePublicationPolicy.decide(local(), RemoteBundleLookup.NotPublished))
            .isEqualTo(BundlePublicationDecision.PUBLISH)
    }

    @Test
    fun `une autre identityKey n'est jamais ecrasee`() {
        val remote = RemoteBundleLookup.Published("autre", "spk")
        assertThat(BundlePublicationPolicy.decide(local(), remote))
            .isEqualTo(BundlePublicationDecision.OWNED_BY_ANOTHER_DEVICE)
    }

    @Test
    fun `le meme bundle est deja a jour`() {
        assertThat(BundlePublicationPolicy.decide(local(), RemoteBundleLookup.of(local())))
            .isEqualTo(BundlePublicationDecision.ALREADY_UP_TO_DATE)
    }

    @Test
    fun `meme identite mais signed prekey differente se republie`() {
        val remote = RemoteBundleLookup.Published("ik", "ancienne")
        assertThat(BundlePublicationPolicy.decide(local(), remote)).isEqualTo(BundlePublicationDecision.PUBLISH)
    }

    @Test
    fun `route de soi refusee ne publie pas`() {
        assertThat(BundlePublicationPolicy.decide(local(), RemoteBundleLookup.SelfRouteRefused))
            .isEqualTo(BundlePublicationDecision.CANNOT_VERIFY)
    }
}

class BundlePublishRetryPolicyTest {
    private fun retry(status: Int?, code: String? = null, attempt: Int = 0) =
        BundlePublishRetryPolicy.shouldRetry(status, code, attempt)

    @Test
    fun `hors ligne et 5xx et 429 sont rejoues`() {
        assertThat(retry(null, "NETWORK")).isTrue()
        assertThat(retry(500)).isTrue()
        assertThat(retry(429)).isTrue()
        assertThat(retry(503)).isTrue()
    }

    @Test
    fun `aucun 4xx n'est rejoue`() {
        listOf(400, 401, 403, 404, 409).forEach { assertThat(retry(it)).isFalse() }
    }

    @Test
    fun `le refus E2EE_UNAVAILABLE et une reponse malformee ne sont pas rejoues`() {
        assertThat(retry(503, "E2EE_UNAVAILABLE")).isFalse()
        assertThat(retry(null, "PARSE")).isFalse()
        assertThat(retry(null, "MALFORMED_RESPONSE")).isFalse()
    }

    @Test
    fun `le nombre d'essais est borne`() {
        assertThat(retry(null, "NETWORK", attempt = BundlePublishRetryPolicy.MAX_ATTEMPTS)).isFalse()
        assertThat(retry(null, "NETWORK", attempt = BundlePublishRetryPolicy.MAX_ATTEMPTS - 1)).isTrue()
    }
}
