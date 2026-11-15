package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UnreadBadgeTest {

    @Test
    fun `zero et negatif ne rendent rien`() {
        assertThat(UnreadBadge.isVisible(0)).isFalse()
        assertThat(UnreadBadge.isVisible(-3)).isFalse()
        assertThat(UnreadBadge.displayedText(0)).isNull()
        assertThat(UnreadBadge.displayedText(-3)).isNull()
    }

    @Test
    fun `un a quatre-vingt-dix-neuf s'affichent tels quels`() {
        assertThat(UnreadBadge.displayedText(1)).isEqualTo("1")
        assertThat(UnreadBadge.displayedText(99)).isEqualTo("99")
    }

    @Test
    fun `au-dela de quatre-vingt-dix-neuf le plafond est 99+`() {
        assertThat(UnreadBadge.displayedText(100)).isEqualTo("99+")
    }

    @Test
    fun `TalkBack lit le vrai compte et jamais le plafond`() {
        assertThat(UnreadBadge.spokenCount(250)).isEqualTo(250)
        assertThat(UnreadBadge.spokenCount(-1)).isEqualTo(0)
    }
}
