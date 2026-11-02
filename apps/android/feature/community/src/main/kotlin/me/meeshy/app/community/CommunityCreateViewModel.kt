package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.community.CommunityAppearanceStore
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.model.CommunityCreateDraft
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

@Immutable
data class CommunityCreateUiState(
    val draft: CommunityCreateDraft = CommunityCreateDraft(),
    val memberQuery: String = "",
    val results: List<UserSearchResult> = emptyList(),
    val selected: List<UserSearchResult> = emptyList(),
    val isSearching: Boolean = false,
    val isCreating: Boolean = false,
    val errorMessage: String? = null,
) {
    /** La couleur d'accent de l'aperçu : dérivée du nom, « New » tant qu'il est vide (iOS `accentColor`). */
    val accentHex: String get() = DynamicColorGenerator.colorForName(draft.trimmedName.ifEmpty { "New" })
    val canSubmit: Boolean get() = draft.isValid && !isCreating
}

sealed interface CommunityCreateEffect {
    data class Created(val communityId: String) : CommunityCreateEffect
}

/**
 * La création d'une communauté (iOS `CommunityCreateViewModel`) : brouillon pur ([CommunityCreateDraft]),
 * recherche de membres à ajouter, puis création → ajout des membres choisis → emoji local. Le premier
 * échec d'un ajout n'annule pas la communauté (elle existe) ; seul l'échec de la création s'affiche.
 */
@HiltViewModel
class CommunityCreateViewModel @Inject constructor(
    private val repository: CommunityRepository,
    private val cache: CommunityCacheRepository,
    private val users: UserRepository,
    private val session: SessionRepository,
    private val appearanceStore: CommunityAppearanceStore,
) : ViewModel() {

    private val _state = MutableStateFlow(CommunityCreateUiState())
    val state: StateFlow<CommunityCreateUiState> = _state.asStateFlow()

    private val _effects = Channel<CommunityCreateEffect>(Channel.BUFFERED)
    val effects: Flow<CommunityCreateEffect> = _effects.receiveAsFlow()

    private var searchJob: Job? = null

    fun onName(value: String) = edit { it.withName(value) }
    fun onIdentifier(value: String) = edit { it.withIdentifier(value) }
    fun onDescription(value: String) = edit { it.copy(description = value) }
    fun onEmoji(value: String) = edit { it.withEmojiToggled(value) }
    fun onPrivate(value: Boolean) = edit { it.copy(isPrivate = value) }

    fun onMemberQuery(value: String) {
        _state.update { it.copy(memberQuery = value) }
        searchJob?.cancel()
        if (value.trim().length < MIN_QUERY) {
            _state.update { it.copy(results = emptyList(), isSearching = false) }
            return
        }
        _state.update { it.copy(isSearching = true) }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MILLIS)
            val found = (users.searchUsers(value.trim(), limit = RESULT_LIMIT) as? NetworkResult.Success)?.data.orEmpty()
            val me = session.currentUserId
            _state.update { it.copy(results = found.filter { user -> user.id != me }, isSearching = false) }
        }
    }

    fun toggleMember(user: UserSearchResult) {
        _state.update { current ->
            val already = current.selected.any { it.id == user.id }
            current.copy(
                draft = current.draft.withMemberToggled(user.id),
                selected = if (already) current.selected.filterNot { it.id == user.id } else current.selected + user,
            )
        }
    }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    fun create() {
        val current = _state.value
        if (!current.canSubmit) return
        _state.update { it.copy(isCreating = true) }
        val request = current.draft.toRequest()
        viewModelScope.launch {
            when (val created = repository.create(request.name, request.identifier, request.description, request.isPrivate)) {
                is NetworkResult.Success -> {
                    val id = created.data.id
                    current.draft.memberIds.forEach { repository.addMember(id, it) }
                    if (current.draft.emoji.isNotEmpty()) appearanceStore.setEmoji(id, current.draft.emoji)
                    cache.refreshList()
                    _state.update { it.copy(isCreating = false) }
                    _effects.send(CommunityCreateEffect.Created(id))
                }
                is NetworkResult.Failure -> _state.update { it.copy(isCreating = false, errorMessage = created.error.message) }
            }
        }
    }

    private fun edit(transform: (CommunityCreateDraft) -> CommunityCreateDraft) =
        _state.update { it.copy(draft = transform(it.draft)) }

    private companion object {
        const val MIN_QUERY = 2
        const val RESULT_LIMIT = 10
        const val SEARCH_DEBOUNCE_MILLIS = 250L
    }
}
