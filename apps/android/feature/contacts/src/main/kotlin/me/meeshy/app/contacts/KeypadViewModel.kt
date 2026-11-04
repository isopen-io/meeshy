package me.meeshy.app.contacts

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.contacts.KeypadInput
import me.meeshy.sdk.model.contacts.KeypadQuery
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

enum class KeypadLoad { Idle, Loading, Loaded, Error }

/** Un résultat et la conversation directe DÉJÀ connue avec lui (cache local), `null` ⇒ le bouton d'appel ouvre le profil. */
@Immutable
data class KeypadRow(val user: UserSearchResult, val directConversationId: String?)

@Immutable
data class KeypadUiState(
    val input: String = "",
    val rows: List<KeypadRow> = emptyList(),
    val load: KeypadLoad = KeypadLoad.Idle,
)

sealed interface KeypadUiEvent {
    data class Append(val key: String) : KeypadUiEvent
    data object DeleteLast : KeypadUiEvent
    data object Clear : KeypadUiEvent
}

/**
 * L'onglet Clavier : un champ unique qui sert de pavé et de recherche (port de l'iOS `KeypadViewModel`).
 * Numéro ⇒ `GET users/phone/{chiffres}` (404 = aucun résultat, jamais une erreur) ; nom ⇒ `users/search`.
 * Anti-rebond de 300 ms ; la réponse d'une saisie périmée est ignorée.
 */
@HiltViewModel
class KeypadViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val conversationRepository: ConversationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(KeypadUiState())
    val state: StateFlow<KeypadUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    fun onEvent(event: KeypadUiEvent) {
        when (event) {
            is KeypadUiEvent.Append -> edit(KeypadInput.append(_state.value.input, event.key))
            KeypadUiEvent.DeleteLast -> edit(KeypadInput.deleteLast(_state.value.input))
            KeypadUiEvent.Clear -> edit(KeypadInput.clear())
        }
    }

    private fun edit(input: String) {
        searchJob?.cancel()
        val query = KeypadInput.classify(input)
        if (query == KeypadQuery.Idle) {
            searchJob = null
            _state.value = KeypadUiState(input = input)
            return
        }
        _state.update { it.copy(input = input) }
        searchJob = viewModelScope.launch {
            delay(DEBOUNCE_MILLIS)
            _state.update { it.copy(load = KeypadLoad.Loading) }
            try {
                resolve(input, query)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                publish(input, emptyList(), KeypadLoad.Error)
            }
        }
    }

    private suspend fun resolve(input: String, query: KeypadQuery) {
        when (query) {
            is KeypadQuery.Phone -> when (val result = userRepository.getProfileByPhone(query.digits)) {
                is NetworkResult.Success -> publish(input, listOf(result.data.toSearchResult()), KeypadLoad.Loaded)
                is NetworkResult.Failure ->
                    if (result.error.httpStatus == NOT_FOUND) publish(input, emptyList(), KeypadLoad.Loaded)
                    else publish(input, emptyList(), KeypadLoad.Error)
            }
            is KeypadQuery.Name -> when (val result = userRepository.searchUsers(query.text, limit = SEARCH_LIMIT)) {
                is NetworkResult.Success -> publish(input, result.data, KeypadLoad.Loaded)
                is NetworkResult.Failure -> publish(input, emptyList(), KeypadLoad.Error)
            }
            KeypadQuery.Idle -> Unit
        }
    }

    private suspend fun publish(input: String, users: List<UserSearchResult>, load: KeypadLoad) {
        val rows = users.map { KeypadRow(it, directConversationOf(it.id)) }
        if (_state.value.input != input) return
        _state.update { it.copy(rows = rows, load = load) }
    }

    private suspend fun directConversationOf(userId: String): String? =
        try {
            conversationRepository.cachedDirectWith(userId)?.id
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            null
        }

    private fun MeeshyUser.toSearchResult() = UserSearchResult(
        id = id,
        username = username,
        displayName = displayName,
        avatar = avatar,
        isOnline = isOnline,
        lastActiveAt = lastActiveAt,
    )

    private companion object {
        const val DEBOUNCE_MILLIS = 300L
        const val SEARCH_LIMIT = 20
        const val NOT_FOUND = 404
    }
}
