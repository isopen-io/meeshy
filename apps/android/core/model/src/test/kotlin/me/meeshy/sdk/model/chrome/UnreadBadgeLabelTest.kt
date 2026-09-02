package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UnreadBadgeLabelTest {

    @Test
    fun `zero renders as the literal "0"`() {
        assertThat(unreadBadgeLabel(0)).isEqualTo("0")
    }

    @Test
    fun `ninety-nine renders exactly "99"`() {
        assertThat(unreadBadgeLabel(99)).isEqualTo("99")
    }

    @Test
    fun `one hundred and beyond cap at "99+"`() {
        assertThat(unreadBadgeLabel(100)).isEqualTo("99+")
        assertThat(unreadBadgeLabel(4321)).isEqualTo("99+")
    }

    @Test
    fun `a negative count floors at "0"`() {
        assertThat(unreadBadgeLabel(-7)).isEqualTo("0")
    }
}
