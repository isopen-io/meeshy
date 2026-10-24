package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import me.meeshy.ui.component.chrome.MeeshyBackground

/** Bottom layer of the chat screen: the app background every other host is drawn over. */
@Composable
internal fun ChatBackgroundHost(content: @Composable () -> Unit) {
    MeeshyBackground { content() }
}
