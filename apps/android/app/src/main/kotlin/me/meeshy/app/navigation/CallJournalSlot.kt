package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import me.meeshy.app.calls.CallJournalUnderBubble
import me.meeshy.ui.component.focal.CallJournalSlot

/**
 * Le journal d'après l'appel que la bulle d'appel du fil déplie (R1.11) : `:sdk-ui` dessine la bascule, `:feature:calls`
 * porte le journal, et `:app` les relie pour la conversation [conversationId] sans qu'aucun des deux dépende de l'autre.
 */
@Composable
internal fun rememberCallJournalSlot(conversationId: String): CallJournalSlot =
    remember(conversationId) {
        val slot: CallJournalSlot = { request -> CallJournalUnderBubble(conversationId, request) }
        slot
    }
