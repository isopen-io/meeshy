package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import me.meeshy.app.chat.appearance.ConversationAppearanceHost
import me.meeshy.app.chat.appearance.ConversationBackgroundLayer
import me.meeshy.app.chat.appearance.SignatureBackground
import me.meeshy.ui.component.chrome.MeeshyBackground

/**
 * Bottom layer of the chat screen: the app background every other host is drawn over, then the conversation's
 * background — the reader's choice, or the conversation's own Signature (type, encryption, flags; static).
 */
@Composable
internal fun ChatBackgroundHost(appearance: ConversationAppearanceHost = ConversationAppearanceHost.NONE, state: ChatUiState? = null, content: @Composable () -> Unit) {
    val signature = remember(state?.isGroup, state?.encryptionMode, state?.memberCount, appearance.accentHex) {
        val accent = appearance.accentHex
        if (state == null || accent == null) null
        else SignatureBackground.of(state.isGroup, state.encryptionMode, state.memberCount, emptyList(), accent)
    }
    val shown = remember(appearance, signature) { appearance.withSignature(signature) }
    MeeshyBackground {
        ConversationBackgroundLayer(shown)
        content()
    }
}
