package me.meeshy.sdk.link

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.ConversationFilter

/**
 * Le filtre que la liste doit prendre à son prochain affichage (raccourci « Non lues », lien
 * `meeshy://conversations/unread`). Une demande à usage unique : [consume] la rend UNE fois, puis l'efface.
 */
@Singleton
class ConversationListEntryRequests @Inject constructor() {
    private val pending = MutableStateFlow<ConversationFilter?>(null)

    /** Lu par une liste déjà visible qui doit réagir à une pose. */
    val requested: StateFlow<ConversationFilter?> = pending.asStateFlow()

    fun request(filter: ConversationFilter) {
        pending.value = filter
    }

    fun consume(): ConversationFilter? {
        val filter = pending.value ?: return null
        pending.value = null
        return filter
    }
}
