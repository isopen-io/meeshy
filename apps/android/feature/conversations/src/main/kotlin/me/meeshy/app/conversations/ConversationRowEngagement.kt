package me.meeshy.app.conversations

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.engagement.ConversationEngagementStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationEngagementSnapshot

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface ConversationRowEngagementEntryPoint {
    fun engagementStore(): ConversationEngagementStore
}

/**
 * « 🔥 série · N (M) » de la rangée (iOS `ConversationStreakMarkHost`) : l'instantané servi par la liste
 * (`viewerEngagement`, cache compris) concourt avec ce que le socket a poussé au magasin, le plus récent
 * gagne, ramené au jour du lecteur. `null` : rien à montrer. La rangée ne reçoit qu'un instantané immuable.
 * Hors Hilt (témoins Robolectric, aperçus), aucun magasin : la rangée se rend sans pastille au lieu de planter.
 */
@Composable
internal fun rememberRowEngagement(conversation: ApiConversation): ConversationEngagementSnapshot? {
    val context = LocalContext.current.applicationContext
    val store = remember(context) {
        runCatching {
            EntryPointAccessors.fromApplication(context, ConversationRowEngagementEntryPoint::class.java).engagementStore()
        }.getOrNull()
    }
    val held by (store?.snapshots ?: NoHeldSnapshots).collectAsState()
    return remember(conversation.id, conversation.viewerEngagement, held) {
        store?.displayed(conversation.id, conversation.viewerEngagement, held)
    }
}

private val NoHeldSnapshots: StateFlow<Map<String, ConversationEngagementSnapshot>> = MutableStateFlow(emptyMap())
