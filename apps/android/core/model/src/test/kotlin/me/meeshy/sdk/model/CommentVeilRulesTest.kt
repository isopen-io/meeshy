package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentVeilRulesTest {

    private fun effects(flag: Long) = MessageEffects(flags = flag)

    @Test
    fun `a blurred comment is veiled until revealed`() {
        assertThat(CommentVeilRules.isVeiled(effects(MessageEffectFlags.BLURRED), isRevealed = false)).isTrue()
        assertThat(CommentVeilRules.isVeiled(effects(MessageEffectFlags.BLURRED), isRevealed = true)).isFalse()
    }

    @Test
    fun `permanent effects never veil the body`() {
        listOf(MessageEffectFlags.GLOW, MessageEffectFlags.PULSE, MessageEffectFlags.RAINBOW, MessageEffectFlags.SPARKLE).forEach {
            assertThat(CommentVeilRules.isVeiled(effects(it), isRevealed = false)).isFalse()
        }
    }

    @Test
    fun `blur combined with a glow still veils`() {
        val both = effects(MessageEffectFlags.BLURRED or MessageEffectFlags.GLOW)
        assertThat(CommentVeilRules.isVeiled(both, isRevealed = false)).isTrue()
    }

    @Test
    fun `author time and actions are never protected`() {
        val blurred = effects(MessageEffectFlags.BLURRED)
        assertThat(CommentVeilRules.protectedParts(blurred, isRevealed = false)).containsExactly(CommentVeilRules.Part.BODY)
        assertThat(CommentVeilRules.protectedParts(blurred, isRevealed = true)).isEmpty()
        assertThat(CommentVeilRules.protectedParts(effects(MessageEffectFlags.GLOW), isRevealed = false)).isEmpty()
    }

    @Test
    fun `a veiled body is hidden from accessibility and not hit testable`() {
        val blurred = effects(MessageEffectFlags.BLURRED)
        assertThat(CommentVeilRules.bodyIsInteractive(blurred, isRevealed = false)).isFalse()
        assertThat(CommentVeilRules.bodyIsInteractive(blurred, isRevealed = true)).isTrue()
    }
}
