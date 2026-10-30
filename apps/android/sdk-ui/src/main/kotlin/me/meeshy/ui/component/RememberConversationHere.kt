package me.meeshy.ui.component

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.presence.ConversationViewers
import me.meeshy.sdk.model.presence.toAvatarHere

/**
 * Qui a l'écran de quelle conversation ouvert (`viewing:*`), fourni à la racine de l'app. Absent
 * (aperçus, tests) : [rememberConversationHere] rend « absent », donc aucun point — rien n'est fabriqué.
 */
val LocalConversationViewers = staticCompositionLocalOf<StateFlow<ConversationViewers>?> { null }

/**
 * Ce que l'avatar de [userId] dit dans [conversationId] (miroir de `PresenceManager.here(userId:conversationId:)`
 * iOS) : absent, ici, actif. Lu AU PLUS BAS niveau et n'émet qu'au changement DE CETTE valeur : la
 * surface qui l'appelle est la seule à se recomposer, jamais la liste ou l'écran qui la contient.
 */
@Composable
fun rememberConversationHere(userId: String?, conversationId: String?): ConversationHere {
    val viewers = LocalConversationViewers.current ?: return ConversationHere.ABSENT
    if (userId.isNullOrBlank() || conversationId.isNullOrBlank()) return ConversationHere.ABSENT
    val flow = remember(viewers, userId, conversationId) {
        viewers.map { it.here(userId, conversationId).toAvatarHere() }.distinctUntilChanged()
    }
    val state by flow.collectAsStateWithLifecycle(initialValue = viewers.value.here(userId, conversationId).toAvatarHere())
    return state
}
