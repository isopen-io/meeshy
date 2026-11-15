package me.meeshy.sdk.model.account

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContactVerificationBadgeTest {

    @Test
    fun `une valeur absente n a pas de badge`() {
        assertThat(ContactVerificationBadge.of(value = null, verifiedAt = null)).isNull()
        assertThat(ContactVerificationBadge.of(value = "  ", verifiedAt = "2026-01-01")).isNull()
    }

    @Test
    fun `une valeur avec date de verification est verifiee`() {
        assertThat(ContactVerificationBadge.of("a@b.me", "2026-01-01T00:00:00Z"))
            .isEqualTo(ContactVerificationBadge.VERIFIED)
    }

    @Test
    fun `une valeur sans date de verification est non verifiee`() {
        assertThat(ContactVerificationBadge.of("a@b.me", null))
            .isEqualTo(ContactVerificationBadge.NOT_VERIFIED)
    }
}
