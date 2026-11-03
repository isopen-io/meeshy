package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.conversationinfo.ConversationInfoHero

/**
 * Le héros de la fiche Conversation (iOS `ConversationInfoSheet.conversationHeader`) : projection de
 * la ligne Room de la conversation, affichée dès l'ouverture (cache d'abord) et qui suit les
 * écritures d'ailleurs (muet posé depuis l'onglet Options, bannière changée par un administrateur).
 */
@HiltViewModel
class ConversationInfoViewModel @Inject constructor(
    private val conversations: ConversationRepository,
) : ViewModel() {

    private val _hero = MutableStateFlow<ConversationInfoHero?>(null)
    val hero: StateFlow<ConversationInfoHero?> = _hero.asStateFlow()

    private var followed: String? = null
    private var following: Job? = null

    /** Suit [conversationId] ; sans effet s'il est déjà suivi. */
    fun start(conversationId: String) {
        if (followed == conversationId) return
        followed = conversationId
        following?.cancel()
        _hero.value = null
        following = viewModelScope.launch {
            conversations.conversationStream(conversationId)
                .filterNotNull()
                .catch { }
                .collect { _hero.value = ConversationInfoHero.of(it) }
        }
    }
}
