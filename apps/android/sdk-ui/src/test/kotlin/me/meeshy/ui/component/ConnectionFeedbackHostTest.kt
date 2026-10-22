package me.meeshy.ui.component

import android.os.Build
import android.view.HapticFeedbackConstants
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.friend.ConnectionHaptic
import org.junit.Test

class ConnectionFeedbackHostTest {

    @Test
    fun `every feedback has a message`() {
        ConnectionFeedback.entries.forEach { assertThat(it.messageRes()).isNotEqualTo(0) }
    }

    @Test
    fun `modern devices use the confirm and reject haptics`() {
        assertThat(hapticConstantFor(ConnectionHaptic.Success, Build.VERSION_CODES.R))
            .isEqualTo(HapticFeedbackConstants.CONFIRM)
        assertThat(hapticConstantFor(ConnectionHaptic.Error, Build.VERSION_CODES.R))
            .isEqualTo(HapticFeedbackConstants.REJECT)
    }

    @Test
    fun `older devices fall back to universally available haptics`() {
        assertThat(hapticConstantFor(ConnectionHaptic.Success, Build.VERSION_CODES.O))
            .isEqualTo(HapticFeedbackConstants.CONTEXT_CLICK)
        assertThat(hapticConstantFor(ConnectionHaptic.Error, Build.VERSION_CODES.O))
            .isEqualTo(HapticFeedbackConstants.LONG_PRESS)
    }
}
