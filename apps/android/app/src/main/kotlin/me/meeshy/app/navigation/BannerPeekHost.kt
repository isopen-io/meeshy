package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.app.conversations.ConversationPeekSheet
import me.meeshy.sdk.model.NotificationBannerSwipe

/**
 * L'aperçu de conversation ouvert par la bannière (iOS `notificationPreviewConversation`) : l'état de la feuille
 * et la règle « fermer PUIS naviguer 100 ms plus tard » — naviguer dans le même instant que la fermeture jouerait
 * une course présentation/fermeture (iOS `asyncAfter(.now() + 0.1)`).
 */
@Stable
class BannerPeekState(
    private val scope: CoroutineScope,
    private val delayMillis: Long = NotificationBannerSwipe.OPEN_AFTER_CLOSE_MILLIS,
) {
    var conversationId: String? by mutableStateOf(null)
        private set

    fun show(id: String) {
        conversationId = id
    }

    fun dismiss() {
        conversationId = null
    }

    fun openFull(navigate: (String) -> Unit) {
        val id = conversationId ?: return
        conversationId = null
        scope.launch {
            delay(delayMillis)
            navigate(id)
        }
    }
}

@Composable
fun rememberBannerPeekState(): BannerPeekState {
    val scope = rememberCoroutineScope()
    return remember(scope) { BannerPeekState(scope) }
}

/** La feuille d'aperçu, montée à la racine par-dessus la navigation. */
@Composable
fun BannerPeekSheetHost(state: BannerPeekState, onOpenConversation: (String) -> Unit) {
    state.conversationId?.let { id ->
        ConversationPeekSheet(
            conversationId = id,
            onDismiss = state::dismiss,
            onOpenFullConversation = { state.openFull(onOpenConversation) },
        )
    }
}
