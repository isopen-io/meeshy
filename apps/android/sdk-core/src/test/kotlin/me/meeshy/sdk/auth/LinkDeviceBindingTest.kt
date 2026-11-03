package me.meeshy.sdk.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.security.SecureRandom

class LinkDeviceBindingTest {

    private fun randomBytes(): ByteArray = ByteArray(32).also(SecureRandom()::nextBytes)

    private fun binding(
        store: LinkDeviceSecretStore = InMemoryLinkDeviceSecretStore(),
        random: () -> ByteArray = ::randomBytes,
    ) = LinkDeviceBinding(store, random) to store

    @Test
    fun `the hash is the lowercase hex SHA-256 of the secret`() {
        assertThat(LinkDeviceBinding.hash("abc"))
            .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test
    fun `the hash of a given secret is stable`() {
        assertThat(LinkDeviceBinding.hash("same")).isEqualTo(LinkDeviceBinding.hash("same"))
        assertThat(LinkDeviceBinding.hash("same")).isNotEqualTo(LinkDeviceBinding.hash("other"))
    }

    @Test
    fun `each request draws a new random secret and the store keeps the latest`() {
        val (binding, _) = binding()

        val firstHash = binding.issueHash()
        val firstSecret = binding.presentedSecret()
        val secondHash = binding.issueHash()
        val secondSecret = binding.presentedSecret()

        assertThat(firstSecret).isNotEqualTo(secondSecret)
        assertThat(firstHash).isNotEqualTo(secondHash)
        assertThat(secondHash).isEqualTo(LinkDeviceBinding.hash(secondSecret!!))
    }

    @Test
    fun `the secret is 43 base64url characters and never travels, only its hash does`() {
        val (binding, _) = binding()

        val hash = binding.issueHash()!!
        val secret = binding.presentedSecret()!!

        assertThat(secret).matches("[A-Za-z0-9_-]{43}")
        assertThat(hash).matches("[0-9a-f]{64}")
        assertThat(hash).isNotEqualTo(secret)
    }

    @Test
    fun `the secret is forgotten once the proof is settled`() {
        val (binding, store) = binding()
        binding.issueHash()

        binding.forget()

        assertThat(binding.presentedSecret()).isNull()
        assertThat(store.load()).isNull()
    }

    @Test
    fun `a vault that cannot write sends the request unbound and keeps nothing`() {
        val (binding, store) = binding(store = InMemoryLinkDeviceSecretStore(failWrites = true))

        assertThat(binding.issueHash()).isNull()
        assertThat(store.load()).isNull()
    }

    @Test
    fun `a random source of the wrong size sends the request unbound`() {
        val (binding, store) = binding(random = { ByteArray(8) })

        assertThat(binding.issueHash()).isNull()
        assertThat(store.load()).isNull()
    }

    @Test
    fun `without a request there is no secret to present`() {
        val (binding, _) = binding()

        assertThat(binding.presentedSecret()).isNull()
    }
}
