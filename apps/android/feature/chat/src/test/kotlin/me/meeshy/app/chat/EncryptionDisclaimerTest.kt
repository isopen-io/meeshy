package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EncryptionDisclaimerTest {

    @Test
    fun `an encrypted conversation at the start of history with data shows the notice`() {
        assertThat(
            EncryptionDisclaimer.shouldShow(
                encryptionMode = "e2ee",
                hasOlderMessages = false,
                isLoadingInitial = false,
            ),
        ).isTrue()
    }

    @Test
    fun `a null encryption mode never shows the notice`() {
        assertThat(
            EncryptionDisclaimer.shouldShow(
                encryptionMode = null,
                hasOlderMessages = false,
                isLoadingInitial = false,
            ),
        ).isFalse()
    }

    @Test
    fun `a blank encryption mode never shows the notice`() {
        assertThat(
            EncryptionDisclaimer.shouldShow(
                encryptionMode = "   ",
                hasOlderMessages = false,
                isLoadingInitial = false,
            ),
        ).isFalse()
    }

    @Test
    fun `older messages still above hide the notice`() {
        assertThat(
            EncryptionDisclaimer.shouldShow(
                encryptionMode = "e2ee",
                hasOlderMessages = true,
                isLoadingInitial = false,
            ),
        ).isFalse()
    }

    @Test
    fun `the initial load hides the notice`() {
        assertThat(
            EncryptionDisclaimer.shouldShow(
                encryptionMode = "e2ee",
                hasOlderMessages = false,
                isLoadingInitial = true,
            ),
        ).isFalse()
    }

    @Test
    fun `the ui state surfaces the notice when encrypted, loaded and at the top of history`() {
        val state = ChatUiState(encryptionMode = "e2ee", hasMoreOlder = false, showSkeleton = false)
        assertThat(state.showEncryptionDisclaimer).isTrue()
    }

    @Test
    fun `the ui state hides the notice while the skeleton is up`() {
        val state = ChatUiState(encryptionMode = "e2ee", hasMoreOlder = false, showSkeleton = true)
        assertThat(state.showEncryptionDisclaimer).isFalse()
    }

    @Test
    fun `the ui state hides the notice while older history remains`() {
        val state = ChatUiState(encryptionMode = "e2ee", hasMoreOlder = true, showSkeleton = false)
        assertThat(state.showEncryptionDisclaimer).isFalse()
    }
}
