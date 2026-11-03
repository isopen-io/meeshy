package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle

/** Une rangée de l'onglet Conversations : un instantané immuable, jamais la conversation brute. */
@Immutable
data class SharedConversationRow(
    val id: String,
    val title: String,
    val avatarUrl: String?,
    /** L'accent déterministe de la conversation (`ApiConversation.accentHex`), passé en paramètre à la rangée. */
    val accentHex: String,
)

/** Les conversations en commun avec [userId] ; vide tant que rien n'est arrivé, et après un échec. */
@Immutable
data class ProfileSharedConversationsState(
    val userId: String? = null,
    val rows: List<SharedConversationRow> = emptyList(),
)

/**
 * L'onglet Conversations d'une fiche (miroir de `effectiveConversations` iOS) : les conversations que je
 * partage avec la personne, chargées UNE fois la fiche ouverte, sans jamais retenir le profil. Un échec est
 * silencieux et garde la liste précédente ; la liste d'une AUTRE personne n'est jamais montrée.
 */
@HiltViewModel
class ProfileSharedConversationsViewModel @Inject constructor(
    private val conversations: ConversationRepository,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileSharedConversationsState())
    val state: StateFlow<ProfileSharedConversationsState> = _state.asStateFlow()

    private var loadJob: Job? = null
    private var loadedFor: String? = null
    private var loadSucceeded = false

    /**
     * Charge les conversations en commun avec [userId] ; sans effet si elles sont déjà chargées ou en route,
     * sauf [force] (relecture silencieuse : la liste affichée reste en place tant que la réponse n'est pas là).
     */
    fun load(userId: String, force: Boolean = false) {
        if (userId.isBlank()) return
        if (!force && loadedFor == userId && (loadJob?.isActive == true || loadSucceeded)) return
        if (_state.value.userId != userId) _state.value = ProfileSharedConversationsState(userId = userId)
        loadedFor = userId
        loadSucceeded = false
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val result = try {
                conversations.listSharedWith(userId)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            if (result is NetworkResult.Success) {
                loadSucceeded = true
                val readerId = session.currentUserId
                val rows = result.data.map { it.toRow(readerId) }
                _state.update { if (it.userId == userId) it.copy(rows = rows) else it }
            }
        }
    }

    private fun ApiConversation.toRow(readerId: String?) = SharedConversationRow(
        id = id,
        title = displayTitle(readerId),
        avatarUrl = avatar?.takeIf { it.isNotBlank() } ?: interlocutor(readerId)?.participant?.avatar?.takeIf { it.isNotBlank() },
        accentHex = accentHex(),
    )
}

/** Ce que l'onglet peint, décidé hors de Compose (miroir des branches de `conversationsTab` iOS). */
sealed interface ProfileConversationsView {
    /** Aucune conversation : icône bulles (ou interdit), pilule Message si on peut écrire, puis le texte. */
    data class Empty(val interactionsDisabled: Boolean, val showsMessagePill: Boolean) : ProfileConversationsView

    /** Des conversations : le bouton Message pleine largeur en tête (estompé et inerte si désactivé), puis les rangées. */
    data class Listing(val interactionsDisabled: Boolean, val showsMessageButton: Boolean) : ProfileConversationsView

    companion object {
        /** [canMessage] : ni moi, ni un visiteur anonyme, ni une personne bloquée dont la fiche n'offre pas le message. */
        fun of(hasRows: Boolean, interactionsDisabled: Boolean, canMessage: Boolean): ProfileConversationsView =
            if (hasRows) {
                Listing(interactionsDisabled, showsMessageButton = canMessage)
            } else {
                Empty(interactionsDisabled, showsMessagePill = canMessage && !interactionsDisabled)
            }
    }
}
