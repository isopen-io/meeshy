package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallNegotiationRoleTest {
    private val ids = listOf("a1", "a2", "b", "zz", "665f0c0e0000000000000001", "665f0c0e0000000000000002")

    @Test
    fun `for every pair exactly one side is polite`() {
        for (x in ids) for (y in ids) {
            if (x == y) continue
            assertThat(CallNegotiationRole.isPolite(x, y)).isNotEqualTo(CallNegotiationRole.isPolite(y, x))
        }
    }

    @Test
    fun `the smallest id is the polite one`() {
        assertThat(CallNegotiationRole.isPolite("a1", "a2")).isTrue()
        assertThat(CallNegotiationRole.isPolite("a2", "a1")).isFalse()
    }

    @Test
    fun `a missing or identical identity is impolite on both sides`() {
        assertThat(CallNegotiationRole.isPolite("", "x")).isFalse()
        assertThat(CallNegotiationRole.isPolite("x", "")).isFalse()
        assertThat(CallNegotiationRole.isPolite("x", "x")).isFalse()
    }

    @Test
    fun `glare - the impolite ignores, the polite rolls back, no pending offer just answers`() {
        assertThat(CallNegotiationRole.glare(polite = false, localOfferPending = true)).isEqualTo(GlareVerdict.Ignore)
        assertThat(CallNegotiationRole.glare(polite = true, localOfferPending = true)).isEqualTo(GlareVerdict.RollbackThenAnswer)
        assertThat(CallNegotiationRole.glare(polite = true, localOfferPending = false)).isEqualTo(GlareVerdict.Answer)
        assertThat(CallNegotiationRole.glare(polite = false, localOfferPending = false)).isEqualTo(GlareVerdict.Answer)
    }
}
