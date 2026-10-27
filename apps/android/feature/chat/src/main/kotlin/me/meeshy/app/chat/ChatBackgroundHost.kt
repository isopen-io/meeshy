package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import me.meeshy.app.chat.appearance.ConversationAppearanceHost
import me.meeshy.app.chat.appearance.ConversationBackgroundLayer
import me.meeshy.ui.component.chrome.MeeshyBackground

/**
 * Bottom layer of the chat screen: the app background every other host is drawn over, then the reader's personal
 * conversation background (Signature = nothing more).
 */
@Composable
internal fun ChatBackgroundHost(appearance: ConversationAppearanceHost = ConversationAppearanceHost.NONE, content: @Composable () -> Unit) {
    MeeshyBackground {
        ConversationBackgroundLayer(appearance)
        content()
    }
}
