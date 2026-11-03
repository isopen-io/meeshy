package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MemberCountFormatTest {

    @Test
    fun `un effectif plafonne se rend avec un plus`() {
        assertThat(formatMemberCount(199, capped = true)).isEqualTo("199+")
    }

    @Test
    fun `un effectif exact se rend sans plus meme au seuil`() {
        assertThat(formatMemberCount(199, capped = false)).isEqualTo("199")
        assertThat(formatMemberCount(12, capped = false)).isEqualTo("12")
    }

    @Test
    fun `la conversation lit son drapeau de plafond et son absence vaut exact`() {
        assertThat(ApiConversation(id = "a", serverMemberCount = 199, memberCountCapped = true).memberCountDisplay)
            .isEqualTo("199+")
        assertThat(ApiConversation(id = "a", serverMemberCount = 199).memberCountDisplay).isEqualTo("199")
    }
}
