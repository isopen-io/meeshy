package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SectionFoldedUnreadTest {

    @Test
    fun `repliee somme les non-lus sans plafond`() {
        assertThat(SectionFoldedUnread.count(listOf(5, 200, 7), isExpanded = false)).isEqualTo(212)
    }

    @Test
    fun `les negatifs sont ignores`() {
        assertThat(SectionFoldedUnread.count(listOf(-3, 4), isExpanded = false)).isEqualTo(4)
    }

    @Test
    fun `depliee vaut zero`() {
        assertThat(SectionFoldedUnread.count(listOf(5, 6), isExpanded = true)).isEqualTo(0)
    }

    @Test
    fun `section vide vaut zero`() {
        assertThat(SectionFoldedUnread.count(emptyList(), isExpanded = false)).isEqualTo(0)
    }
}
