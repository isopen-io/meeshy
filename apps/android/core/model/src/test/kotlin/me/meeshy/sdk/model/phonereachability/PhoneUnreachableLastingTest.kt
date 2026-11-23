package me.meeshy.sdk.model.phonereachability

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.TalkieCopyCandidate
import me.meeshy.sdk.model.relation.TalkieCopyDestination
import me.meeshy.sdk.model.relation.TalkieHoldDelivery
import org.junit.Test

/**
 * Un téléphone injoignable qui DURE (#20241, iso `TalkieUnreachableTests.swift`) : passé cinq minutes de silence servi, le
 * talkie laisse un message vocal dans le direct et « Demander un relevé » disparaît ; sans état servi, ou au-delà du TTL
 * du contrat, rien ne change.
 */
class PhoneUnreachableLastingTest {
    private val now = 1_800_000_000_000L
    private val minute = 60_000L

    private fun silentFor(ms: Long) = PhoneReachabilityState("u", now - ms, PhoneUnreachableCause.NETWORK)

    @Test
    fun `le seuil est de cinq minutes de silence`() {
        assertThat(PhoneUnreachableLasting.MINIMUM_SILENCE_MS).isEqualTo(5 * minute)
    }

    @Test
    fun `sans etat servi rien ne dure`() {
        assertThat(PhoneUnreachableLasting.isLasting(null, now)).isFalse()
        assertThat(PhoneUnreachableLasting.remainingMs(null, now)).isNull()
    }

    @Test
    fun `un silence plus court que le seuil ne compte pas encore et dit ce qu'il reste`() {
        val state = silentFor(4 * minute)
        assertThat(PhoneUnreachableLasting.isLasting(state, now)).isFalse()
        assertThat(PhoneUnreachableLasting.remainingMs(state, now)).isEqualTo(minute)
    }

    @Test
    fun `un silence d'au moins cinq minutes compte`() {
        assertThat(PhoneUnreachableLasting.isLasting(silentFor(5 * minute), now)).isTrue()
        assertThat(PhoneUnreachableLasting.isLasting(silentFor(3 * 60 * minute), now)).isTrue()
        assertThat(PhoneUnreachableLasting.remainingMs(silentFor(5 * minute), now)).isNull()
    }

    @Test
    fun `un etat au dela du TTL du contrat ne compte plus`() {
        val expired = silentFor(PhoneReachabilityContract.STATE_TTL_MILLIS)
        assertThat(PhoneUnreachableLasting.isLasting(expired, now)).isFalse()
        assertThat(PhoneUnreachableLasting.remainingMs(expired, now)).isNull()
    }

    @Test
    fun `une horloge en retard sur l'etat ne fait rien durer`() {
        val ahead = PhoneReachabilityState("u", now + minute, PhoneUnreachableCause.UNKNOWN)
        assertThat(PhoneUnreachableLasting.isLasting(ahead, now)).isFalse()
        assertThat(PhoneUnreachableLasting.remainingMs(ahead, now)).isEqualTo(6 * minute)
    }

    @Test
    fun `le talkie laisse un message vocal seulement quand le silence dure`() {
        assertThat(TalkieHoldDelivery.resolve(null, now)).isEqualTo(TalkieHoldDelivery.LIVE)
        assertThat(TalkieHoldDelivery.resolve(silentFor(2 * minute), now)).isEqualTo(TalkieHoldDelivery.LIVE)
        assertThat(TalkieHoldDelivery.resolve(silentFor(6 * minute), now)).isEqualTo(TalkieHoldDelivery.VOICE_MESSAGE)
        assertThat(TalkieHoldDelivery.of(lasting = true)).isEqualTo(TalkieHoldDelivery.VOICE_MESSAGE)
        assertThat(TalkieHoldDelivery.of(lasting = false)).isEqualTo(TalkieHoldDelivery.LIVE)
    }

    @Test
    fun `demander un releve disparait quand le telephone est injoignable depuis plusieurs minutes`() {
        assertThat(BatteryPullOffer.offers(canPull = true, unreachable = null, nowMillis = now)).isTrue()
        assertThat(BatteryPullOffer.offers(canPull = true, unreachable = silentFor(2 * minute), nowMillis = now)).isTrue()
        assertThat(BatteryPullOffer.offers(canPull = true, unreachable = silentFor(6 * minute), nowMillis = now)).isFalse()
        assertThat(BatteryPullOffer.offers(canPull = false, unreachable = null, nowMillis = now)).isFalse()
    }

    @Test
    fun `le message vocal ne part que dans une conversation directe qui peut le porter`() {
        val candidates = listOf(
            TalkieCopyCandidate("group", "group", rankAtMs = 9),
            TalkieCopyCandidate("crypt", "direct", encryptionMode = "e2ee", rankAtMs = 8),
            TalkieCopyCandidate("direct", "direct", rankAtMs = 1),
        )
        assertThat(TalkieCopyDestination.pickDirect(candidates)).isEqualTo("direct")
        assertThat(TalkieCopyDestination.pickDirect(candidates.take(2))).isNull()
        assertThat(TalkieCopyDestination.pick(candidates)).isEqualTo("group")
    }
}
