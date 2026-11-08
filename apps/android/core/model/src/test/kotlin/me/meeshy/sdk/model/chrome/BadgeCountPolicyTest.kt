package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BadgeCountPolicyTest {

    @Test
    fun `la preference Badges coupee met le nombre d'icone a zero`() {
        assertThat(BadgeCountPolicy.iconCount(total = 12, badgesEnabled = false)).isEqualTo(0)
    }

    @Test
    fun `la preference Badges allumee rend le vrai total`() {
        assertThat(BadgeCountPolicy.iconCount(total = 12, badgesEnabled = true)).isEqualTo(12)
    }

    @Test
    fun `un total negatif ne sort jamais`() {
        assertThat(BadgeCountPolicy.iconCount(total = -2, badgesEnabled = true)).isEqualTo(0)
    }

    @Test
    fun `le libelle plafonne a 99+ par unreadBadgeLabel`() {
        assertThat(BadgeCountPolicy.label(100)).isEqualTo("99+")
        assertThat(BadgeCountPolicy.label(99)).isEqualTo("99")
        assertThat(BadgeCountPolicy.label(0)).isEqualTo("0")
    }
}
