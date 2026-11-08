package me.meeshy.ui.component.identity

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.DeliveryTier
import org.junit.Test

class DeliveryStatusGlyphTest {

    private fun resolve(
        tier: DeliveryTier = DeliveryTier.Sent,
        isPending: Boolean = false,
        isFailed: Boolean = false,
        isOffline: Boolean = false,
        startedAt: Long? = null,
        now: Long = 0L,
    ) = IdentityDeliveryStatus.resolve(tier, isPending, isFailed, isOffline, startedAt, now)

    @Test
    fun `table statut vers glyphe`() {
        val table = IdentityDeliveryStatus.entries.associateWith { DeliveryStatusGlyph.of(it) }
        assertThat(table[IdentityDeliveryStatus.Sending]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.Clock, DeliveryTone.Secondary))
        assertThat(table[IdentityDeliveryStatus.Invisible]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.None, DeliveryTone.Secondary))
        assertThat(table[IdentityDeliveryStatus.Clock]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.Clock, DeliveryTone.SecondaryFaded))
        assertThat(table[IdentityDeliveryStatus.Slow]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.Clock, DeliveryTone.Warning))
        assertThat(table[IdentityDeliveryStatus.Sent]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.Check, DeliveryTone.Secondary))
        assertThat(table[IdentityDeliveryStatus.Delivered]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.DoubleCheck, DeliveryTone.Secondary))
        assertThat(table[IdentityDeliveryStatus.Read]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.DoubleCheckBold, DeliveryTone.Read))
        assertThat(table[IdentityDeliveryStatus.Failed]).isEqualTo(DeliveryGlyphSpec(DeliveryGlyph.ErrorCircle, DeliveryTone.Error))
    }

    @Test
    fun `un message envoye hors ligne reste en file avec l horloge`() {
        assertThat(resolve(isPending = true, isOffline = true)).isEqualTo(IdentityDeliveryStatus.Sending)
    }

    @Test
    fun `un envoi en ligne reste invisible sous 200 ms puis horloge puis lent`() {
        assertThat(resolve(isPending = true, startedAt = 1_000, now = 1_100)).isEqualTo(IdentityDeliveryStatus.Invisible)
        assertThat(resolve(isPending = true, startedAt = 1_000, now = 1_200)).isEqualTo(IdentityDeliveryStatus.Clock)
        assertThat(resolve(isPending = true, startedAt = 1_000, now = 6_000)).isEqualTo(IdentityDeliveryStatus.Slow)
    }

    @Test
    fun `un echec l emporte sur tout`() {
        assertThat(resolve(isPending = true, isFailed = true, isOffline = true)).isEqualTo(IdentityDeliveryStatus.Failed)
    }

    @Test
    fun `un message acquitte suit le palier du resolveur de livraison`() {
        assertThat(resolve(tier = DeliveryTier.Sent)).isEqualTo(IdentityDeliveryStatus.Sent)
        assertThat(resolve(tier = DeliveryTier.Delivered)).isEqualTo(IdentityDeliveryStatus.Delivered)
        assertThat(resolve(tier = DeliveryTier.Read, isOffline = true)).isEqualTo(IdentityDeliveryStatus.Read)
    }
}
