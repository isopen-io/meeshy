package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import org.junit.Test

/** Les notices du menu d'un message chiffré de bout en bout : « chiffrée de bout en bout » se lit une fois, jamais zéro (#17697). */
class EndToEndMenuNoticesTest {

    @Test
    fun `with both notices the encryption is named by the first and the signals notice drops the prefix`() {
        assertThat(endToEndMenuNotices(serverFeaturesAbsent = true, signalsRefused = true))
            .containsExactly(R.string.chat_menu_e2ee_notice, R.string.chat_menu_e2ee_signals_notice).inOrder()
    }

    @Test
    fun `a view once or gone message shows the signals notice alone, and it then says why`() {
        assertThat(endToEndMenuNotices(serverFeaturesAbsent = false, signalsRefused = true))
            .containsExactly(R.string.chat_menu_e2ee_signals_notice_alone)
    }

    @Test
    fun `the features notice alone and no notice at all stay as they were`() {
        assertThat(endToEndMenuNotices(serverFeaturesAbsent = true, signalsRefused = false)).containsExactly(R.string.chat_menu_e2ee_notice)
        assertThat(endToEndMenuNotices(serverFeaturesAbsent = false, signalsRefused = false)).isEmpty()
    }
}
