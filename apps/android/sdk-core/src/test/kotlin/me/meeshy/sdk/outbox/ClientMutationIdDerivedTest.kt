package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.UUID

/**
 * #10321 (d), miroir Android : une story rejouée depuis sa file porte la MÊME clé
 * d'idempotence — la passerelle reconnaît le rejeu et ne republie pas.
 */
class ClientMutationIdDerivedTest {

    @Test
    fun `the same item and slide yield the same key at every replay`() {
        val first = OutboxIds.storySlideCmid(queueItemId = "item-1", slideId = "slide-a")
        val replay = OutboxIds.storySlideCmid(queueItemId = "item-1", slideId = "slide-a")

        assertThat(replay).isEqualTo(first)
    }

    @Test
    fun `another slide or another item yields another key`() {
        val key = OutboxIds.storySlideCmid(queueItemId = "item-1", slideId = "slide-a")

        assertThat(OutboxIds.storySlideCmid(queueItemId = "item-1", slideId = "slide-b")).isNotEqualTo(key)
        assertThat(OutboxIds.storySlideCmid(queueItemId = "item-2", slideId = "slide-a")).isNotEqualTo(key)
    }

    @Test
    fun `a derived key matches the gateway contract`() {
        val key = OutboxIds.derivedCmid("n'importe quelle graine")

        assertThat(OutboxIds.isValidCmid(key)).isTrue()
    }

    @Test
    fun `a derived key carries the version 4 and variant bits of a uuid v4`() {
        val uuid = UUID.fromString(OutboxIds.derivedCmid("seed").removePrefix("cmid_"))

        assertThat(uuid.version()).isEqualTo(4)
        assertThat(uuid.variant()).isEqualTo(2)
    }

    @Test
    fun `a derived key is the one the iOS client derives from the same slide`() {
        assertThat(OutboxIds.storySlideCmid("item-1", "slide-a"))
            .isEqualTo("cmid_7ceb74ae-58e8-448d-9779-6fc640968a0a")
    }

    @Test
    fun `a derived key is still a cmid placeholder for the draft reconciler`() {
        assertThat(OutboxIds.isCmid(OutboxIds.derivedCmid("seed"))).isTrue()
    }
}
