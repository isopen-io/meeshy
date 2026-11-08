package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentEffectsTest {

    @Test
    fun `nothing posed leaves effectFlags out of the POST`() {
        assertThat(CommentEffects.wire(MessageEffects())).isNull()
    }

    @Test
    fun `blur and a permanent effect travel together`() {
        val effects = CommentEffects.toggle(CommentEffects.toggle(MessageEffects(), MessageEffectFlags.BLURRED), MessageEffectFlags.GLOW)

        assertThat(CommentEffects.wire(effects)).isEqualTo((MessageEffectFlags.BLURRED or MessageEffectFlags.GLOW).toInt())
    }

    @Test
    fun `toggling twice removes the effect`() {
        val effects = CommentEffects.toggle(CommentEffects.toggle(MessageEffects(), MessageEffectFlags.RAINBOW), MessageEffectFlags.RAINBOW)

        assertThat(CommentEffects.wire(effects)).isNull()
    }

    @Test
    fun `a comment never carries ephemeral, view once or an appearance effect`() {
        listOf(MessageEffectFlags.EPHEMERAL, MessageEffectFlags.VIEW_ONCE, MessageEffectFlags.CONFETTI).forEach { flag ->
            assertThat(CommentEffects.toggle(MessageEffects(), flag)).isEqualTo(MessageEffects())
        }
    }

    @Test
    fun `the thread renders only the comment bits it received`() {
        val received = (MessageEffectFlags.SPARKLE or MessageEffectFlags.SHAKE or MessageEffectFlags.VIEW_ONCE).toInt()

        assertThat(CommentEffects.served(received).flags).isEqualTo(MessageEffectFlags.SPARKLE)
        assertThat(CommentEffects.isBlurred(received)).isFalse()
        assertThat(CommentEffects.isBlurred(MessageEffectFlags.BLURRED.toInt())).isTrue()
        assertThat(CommentEffects.isBlurred(null)).isFalse()
    }
}
