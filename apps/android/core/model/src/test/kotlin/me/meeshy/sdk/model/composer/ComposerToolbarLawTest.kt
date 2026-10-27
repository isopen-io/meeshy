package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageEffectFlags
import org.junit.Test

class ComposerToolbarLawTest {
    private val eph = MessageEffectFlags.EPHEMERAL
    private val blur = MessageEffectFlags.BLURRED
    private val once = MessageEffectFlags.VIEW_ONCE

    @Test fun `l'ephemere domine la vue unique qui domine le flou`() {
        assertThat(ComposerToolbarLaw.dominant(eph or once or blur)).isEqualTo(ComposerProtection.EPHEMERAL)
        assertThat(ComposerToolbarLaw.dominant(once or blur)).isEqualTo(ComposerProtection.VIEW_ONCE)
        assertThat(ComposerToolbarLaw.dominant(blur)).isEqualTo(ComposerProtection.BLURRED)
        assertThat(ComposerToolbarLaw.dominant(0L)).isNull()
    }

    @Test fun `la teinte des icones suit protection puis marque puis commune`() {
        assertThat(ComposerToolbarLaw.iconTint(blur)).isEqualTo(ComposerIconTint.Protection(ComposerProtection.BLURRED))
        assertThat(ComposerToolbarLaw.iconTint(MessageEffectFlags.CONFETTI)).isEqualTo(ComposerIconTint.Brand)
        assertThat(ComposerToolbarLaw.iconTint(0L)).isEqualTo(ComposerIconTint.Common)
    }

    @Test fun `allumer un voile eteint l'autre`() {
        assertThat(ComposerToolbarLaw.veilToggles(once, ComposerProtection.BLURRED)).containsExactly(blur, once)
        assertThat(ComposerToolbarLaw.veilToggles(blur, ComposerProtection.VIEW_ONCE)).containsExactly(once, blur)
        assertThat(ComposerToolbarLaw.veilToggles(blur, ComposerProtection.BLURRED)).containsExactly(blur)
        assertThat(ComposerToolbarLaw.veilToggles(0L, ComposerProtection.VIEW_ONCE)).containsExactly(once)
    }

    @Test fun `l'ephemere n'est pas un voile`() {
        assertThat(ComposerToolbarLaw.veilToggles(blur, ComposerProtection.EPHEMERAL)).containsExactly(eph)
    }

    @Test fun `la touche retour envoie jusqu'a sept mots`() {
        assertThat(ComposerToolbarLaw.returnSends("un deux trois quatre cinq six sept")).isTrue()
        assertThat(ComposerToolbarLaw.returnSends("un deux trois quatre cinq six sept huit")).isFalse()
        assertThat(ComposerToolbarLaw.returnSends("")).isTrue()
        assertThat(ComposerToolbarLaw.wordCount("  a \n b  ")).isEqualTo(2)
    }

    @Test fun `la bande rapide sert les recents puis les defauts sans doublon`() {
        assertThat(ComposerToolbarLaw.quickEmojis(listOf("🔥", "🎉"))).containsExactly("🔥", "🎉", "😂", "❤️", "👍", "😮", "😢").inOrder()
        assertThat(ComposerToolbarLaw.quickEmojis(emptyList())).isEqualTo(ComposerToolbarLaw.QUICK_EMOJI_DEFAULTS)
    }
}
