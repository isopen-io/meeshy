package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationHeaderMetricsTest {

    @Test
    fun `les actions de l'en-tete sont des cercles de verre de 44 dp a icone de 24 dp`() {
        assertThat(ConversationHeaderMetrics.ACTION_DIAMETER_DP).isEqualTo(44)
        assertThat(ConversationHeaderMetrics.ACTION_ICON_DP).isEqualTo(24)
    }
}
