package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ProtectionDescriptor.Badge
import me.meeshy.sdk.model.ProtectionDescriptor.ViewOnceChip
import org.junit.Test

class ProtectionDescriptorTest {

    private fun of(flags: Long = 0, hasExpiry: Boolean = false, mode: String? = null) =
        ProtectionDescriptor.of(MessageEffects(flags = flags), hasExpiry, mode)

    @Test
    fun `un message ordinaire ne porte aucune protection`() {
        assertThat(of().isEmpty).isTrue()
        assertThat(of().requiresVeil).isFalse()
    }

    @Test
    fun `vue unique non ouverte est scellee pour l affichage`() {
        val d = of(MessageEffectFlags.VIEW_ONCE)
        assertThat(d.sealedForDisplay(openedByMe = false)).isTrue()
        assertThat(d.sealedForDisplay(openedByMe = true)).isFalse()
        assertThat(of().sealedForDisplay(openedByMe = false)).isFalse()
    }

    @Test
    fun `la puce suit l etat de CE lecteur`() {
        val d = of(MessageEffectFlags.VIEW_ONCE)
        assertThat(d.viewOnceChip(false)).isEqualTo(ViewOnceChip.Sealed)
        assertThat(d.viewOnceChip(true)).isEqualTo(ViewOnceChip.Opened)
        assertThat(of().viewOnceChip(false)).isNull()
    }

    @Test
    fun `vue unique et ephemere cohabitent`() {
        val d = of(MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.EPHEMERAL)
        assertThat(d.badges).containsExactly(Badge.Ephemeral, Badge.ViewOnce).inOrder()
        assertThat(d.withoutViewOnce.badges).containsExactly(Badge.Ephemeral)
    }

    @Test
    fun `le flou voile sans etre une vue unique`() {
        val d = of(MessageEffectFlags.BLURRED)
        assertThat(d.requiresVeil).isTrue()
        assertThat(d.isViewOnce).isFalse()
    }

    @Test
    fun `une echeance servie designe l ephemere`() {
        assertThat(of(hasExpiry = true).badges).containsExactly(Badge.Ephemeral)
    }

    @Test
    fun `tout mode de chiffrement inconnu protege`() {
        assertThat(of(mode = "e2ee").isEncrypted).isTrue()
        assertThat(of(mode = "server").isEncrypted).isTrue()
        assertThat(of(mode = "weird-new-mode").isEncrypted).isTrue()
        assertThat(of(mode = "  ").isEncrypted).isFalse()
        assertThat(of(mode = null).isEncrypted).isFalse()
    }
}
