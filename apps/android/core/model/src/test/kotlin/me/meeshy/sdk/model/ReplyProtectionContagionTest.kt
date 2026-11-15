package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReplyProtectionContagion.Columns
import me.meeshy.sdk.model.ReplyProtectionContagion.ImposedEphemeral
import org.junit.Test

/** Rejoue les cas de `reply-protection-contagion.test.ts` (TypeScript, qui fait foi) en JVM pur. */
class ReplyProtectionContagionTest {

    private val ephemeral = MessageEffectFlags.EPHEMERAL
    private val afterRead = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ
    private val blurred = MessageEffectFlags.BLURRED
    private val viewOnce = MessageEffectFlags.VIEW_ONCE

    @Test
    fun `no quote lets the request pass, recomposed`() {
        val out = ReplyProtectionContagion.contaminate(Columns(ephemeralDuration = 60), null)
        assertThat(out).isEqualTo(Columns(effectFlags = ephemeral, isBlurred = false, ephemeralDuration = 60))
        assertThat(ReplyProtectionContagion.imposed(null).isEmpty).isTrue()
    }

    @Test
    fun `a blurred quote imposes the blur, not removable`() {
        val out = ReplyProtectionContagion.contaminate(Columns(), Columns(isBlurred = true))
        assertThat(out.isBlurred).isTrue()
        assertThat(out.effectFlags and blurred).isEqualTo(blurred)
        assertThat(ReplyProtectionContagion.imposed(Columns(effectFlags = blurred)).blurred).isTrue()
    }

    @Test
    fun `an after read quote imposes the after read flame and replaces a requested duration`() {
        val out = ReplyProtectionContagion.contaminate(Columns(ephemeralDuration = 300), Columns(effectFlags = afterRead))
        assertThat(out).isEqualTo(Columns(effectFlags = afterRead, isBlurred = false, ephemeralDuration = null))
    }

    @Test
    fun `a timed quote imposes the same duration`() {
        val out = ReplyProtectionContagion.contaminate(
            Columns(effectFlags = afterRead),
            Columns(effectFlags = ephemeral, ephemeralDuration = 30),
        )
        assertThat(out).isEqualTo(Columns(effectFlags = ephemeral, isBlurred = false, ephemeralDuration = 30))
        assertThat(ReplyProtectionContagion.imposed(Columns(effectFlags = ephemeral, ephemeralDuration = 30)).ephemeral)
            .isEqualTo(ImposedEphemeral.Duration(30))
    }

    @Test
    fun `blurred and ephemeral quote gives both to the reply`() {
        val out = ReplyProtectionContagion.contaminate(Columns(), Columns(effectFlags = afterRead or blurred, isBlurred = true))
        assertThat(out).isEqualTo(Columns(effectFlags = afterRead or blurred, isBlurred = true, ephemeralDuration = null))
    }

    @Test
    fun `view once is not transmitted but stays a free choice of the reply`() {
        assertThat(ReplyProtectionContagion.imposed(Columns(effectFlags = viewOnce)).isEmpty).isTrue()
        val out = ReplyProtectionContagion.contaminate(Columns(effectFlags = viewOnce), Columns(isBlurred = true))
        assertThat(out.effectFlags).isEqualTo(viewOnce or blurred)
    }

    @Test
    fun `a bare ephemeral bit without duration transmits nothing invented`() {
        assertThat(ReplyProtectionContagion.imposed(Columns(effectFlags = ephemeral)).ephemeral).isNull()
        assertThat(ReplyProtectionContagion.imposed(Columns(effectFlags = ephemeral, ephemeralDuration = 0)).ephemeral).isNull()
    }

    @Test
    fun `the contagion is transitive, the reply carries the bits its own reply inherits`() {
        val first = ReplyProtectionContagion.contaminate(Columns(), Columns(effectFlags = ephemeral, ephemeralDuration = 45, isBlurred = true))
        val second = ReplyProtectionContagion.contaminate(Columns(), first)
        assertThat(second).isEqualTo(first)
    }

    @Test
    fun `the imposed protection never rewrites the persisted arming of the composer`() {
        val armed = Columns(effectFlags = viewOnce)
        ReplyProtectionContagion.contaminate(armed, Columns(effectFlags = afterRead, isBlurred = true))
        assertThat(armed).isEqualTo(Columns(effectFlags = viewOnce))
    }
}
