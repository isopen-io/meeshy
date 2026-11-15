package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationSearchCommunitiesBandLawTest {
    @Test
    fun `la bande suit le focus`() {
        assertThat(ConversationSearchCommunitiesBandLaw.isShown(afterFocusChangeTo = true)).isTrue()
        assertThat(ConversationSearchCommunitiesBandLaw.isShown(afterFocusChangeTo = false)).isFalse()
    }

    @Test
    fun `la bande exige des communautes et une requete vide`() {
        assertThat(ConversationSearchCommunitiesBandLaw.drawsBand(2, queryIsEmpty = true)).isTrue()
        assertThat(ConversationSearchCommunitiesBandLaw.drawsBand(0, queryIsEmpty = true)).isFalse()
        assertThat(ConversationSearchCommunitiesBandLaw.drawsBand(2, queryIsEmpty = false)).isFalse()
    }
}
