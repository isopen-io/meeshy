package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.UUID

/**
 * Les identifiants d'idempotence au format EXACT de la passerelle (#11609).
 *
 * `cid_<uuid v4 minuscule>` — `packages/shared/utils/client-message-id.ts` ;
 * `cmid_<uuid minuscule>` — `services/gateway/src/middleware/clientMutationId.ts`.
 * Miroirs : `ClientMessageId.swift`, `ClientMutationId.swift`, `ClientMutationId+Derived.swift`.
 */
class ClientIdFormatTest {

    // region patterns exacts

    @Test
    fun `the cid pattern is the gateway one`() {
        assertThat(ClientIdFormat.CID_PATTERN)
            .isEqualTo("^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    }

    @Test
    fun `the cmid pattern is the gateway one`() {
        assertThat(ClientIdFormat.CMID_PATTERN)
            .isEqualTo("^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    }

    // endregion

    // region cid

    @Test
    fun `a freshly minted cid is valid`() {
        repeat(200) { assertThat(ClientIdFormat.isValidCid(ClientIdFormat.newCid())).isTrue() }
    }

    @Test
    fun `a minted cid is 40 characters`() {
        assertThat(ClientIdFormat.newCid()).hasLength(40)
    }

    @Test
    fun `an uppercase cid is refused`() {
        val upper = ClientIdFormat.newCid().uppercase().replaceFirst("CID_", "cid_")

        assertThat(ClientIdFormat.isValidCid(upper)).isFalse()
    }

    @Test
    fun `a cid whose uuid is not version 4 is refused`() {
        assertThat(ClientIdFormat.isValidCid("cid_550e8400-e29b-11d4-a716-446655440000")).isFalse()
    }

    @Test
    fun `a cid with a wrong variant is refused`() {
        assertThat(ClientIdFormat.isValidCid("cid_550e8400-e29b-41d4-c716-446655440000")).isFalse()
        assertThat(ClientIdFormat.isValidCid("cid_550e8400-e29b-41d4-a716-446655440000")).isTrue()
    }

    @Test
    fun `a cid without its prefix, with a legacy prefix or a trailing line break is refused`() {
        val uuid = UUID.randomUUID().toString()

        assertThat(ClientIdFormat.isValidCid(uuid)).isFalse()
        assertThat(ClientIdFormat.isValidCid("temp_$uuid")).isFalse()
        assertThat(ClientIdFormat.isValidCid("cid_$uuid\n")).isFalse()
        assertThat(ClientIdFormat.isValidCid(" cid_$uuid")).isFalse()
        assertThat(ClientIdFormat.isValidCid("")).isFalse()
        assertThat(ClientIdFormat.isValidCid(null)).isFalse()
    }

    @Test
    fun `a cmid is not a cid and a cid is not a cmid`() {
        assertThat(ClientIdFormat.isValidCid(ClientIdFormat.newCmid())).isFalse()
        assertThat(ClientIdFormat.isValidCmid(ClientIdFormat.newCid())).isFalse()
    }

    // endregion

    // region cmid

    @Test
    fun `a freshly minted cmid is valid`() {
        repeat(200) { assertThat(ClientIdFormat.isValidCmid(ClientIdFormat.newCmid())).isTrue() }
    }

    @Test
    fun `a minted cmid is 41 characters`() {
        assertThat(ClientIdFormat.newCmid()).hasLength(41)
    }

    @Test
    fun `a cmid does not pin the uuid version`() {
        assertThat(ClientIdFormat.isValidCmid("cmid_550e8400-e29b-11d4-a716-446655440000")).isTrue()
    }

    @Test
    fun `an uppercase cmid is refused`() {
        assertThat(ClientIdFormat.isValidCmid("cmid_550E8400-E29B-41D4-A716-446655440000")).isFalse()
    }

    @Test
    fun `a malformed cmid is refused`() {
        assertThat(ClientIdFormat.isValidCmid("cmid_1")).isFalse()
        assertThat(ClientIdFormat.isValidCmid("cmid_550e8400-e29b-41d4-a716-44665544000")).isFalse()
        assertThat(ClientIdFormat.isValidCmid("cmid_550e8400-e29b-41d4-a716-446655440000\n")).isFalse()
        assertThat(ClientIdFormat.isValidCmid("507f1f77bcf86cd799439011")).isFalse()
        assertThat(ClientIdFormat.isValidCmid(null)).isFalse()
    }

    // endregion

    // region clé dérivée

    @Test
    fun `the same seed yields the same key at every replay`() {
        val first = ClientIdFormat.storySlideCmid(queueItemId = "item-1", slideId = "slide-a")
        val replay = ClientIdFormat.storySlideCmid(queueItemId = "item-1", slideId = "slide-a")

        assertThat(replay).isEqualTo(first)
    }

    @Test
    fun `another slide or another item yields another key`() {
        val key = ClientIdFormat.storySlideCmid(queueItemId = "item-1", slideId = "slide-a")

        assertThat(ClientIdFormat.storySlideCmid(queueItemId = "item-1", slideId = "slide-b")).isNotEqualTo(key)
        assertThat(ClientIdFormat.storySlideCmid(queueItemId = "item-2", slideId = "slide-a")).isNotEqualTo(key)
    }

    @Test
    fun `a derived key matches the gateway contract`() {
        listOf("n'importe quelle graine", "", "é|日本", "x".repeat(10_000)).forEach { seed ->
            val key = ClientIdFormat.derivedCmid(seed)

            assertThat(ClientIdFormat.isValidCmid(key)).isTrue()
            assertThat(key).hasLength(41)
        }
    }

    @Test
    fun `a derived key carries the version 4 and variant bits of a uuid v4`() {
        val uuid = ClientIdFormat.derivedCmid("seed").removePrefix("cmid_")

        assertThat(uuid[14]).isEqualTo('4')
        assertThat(uuid[19]).isIn(listOf('8', '9', 'a', 'b'))
        assertThat(UUID.fromString(uuid).version()).isEqualTo(4)
        assertThat(UUID.fromString(uuid).variant()).isEqualTo(2)
    }

    @Test
    fun `a derived key is the one the iOS client derives from the same seed`() {
        assertThat(ClientIdFormat.storySlideCmid("item-1", "slide-a"))
            .isEqualTo("cmid_7ceb74ae-58e8-448d-9779-6fc640968a0a")
        assertThat(ClientIdFormat.storySlideCmid("item-1", "slide-b"))
            .isEqualTo("cmid_d3551a94-e69e-44a5-bffb-6d8df0e00447")
        assertThat(ClientIdFormat.storySlideCmid("item-2", "slide-a"))
            .isEqualTo("cmid_c04b8079-cdcb-4630-8535-96438892dab4")
        assertThat(ClientIdFormat.derivedCmid("n'importe quelle graine"))
            .isEqualTo("cmid_a9a24f38-b362-4119-94b7-e9b08f67e46f")
        assertThat(ClientIdFormat.derivedCmid("")).isEqualTo("cmid_e3b0c442-98fc-4c14-9afb-f4c8996fb924")
        assertThat(ClientIdFormat.derivedCmid("é|日本")).isEqualTo("cmid_f5887db1-d165-4e6d-aab9-f0e3a8797a67")
    }

    @Test
    fun `the story slide seed is the one iOS hashes`() {
        assertThat(ClientIdFormat.storySlideCmid("item-1", "slide-a"))
            .isEqualTo(ClientIdFormat.derivedCmid("story-slide|item-1|slide-a"))
    }

    // endregion
}
