package me.meeshy.app.chat.options

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.conversation.CategoryCreation
import me.meeshy.sdk.conversation.ConversationPreferenceActions
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.PreferenceWrite
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.conversationoptions.ConversationOptionsEdit
import me.meeshy.sdk.model.conversationoptions.ConversationOptionsOverlay
import me.meeshy.sdk.model.conversationoptions.ConversationOptionsPlan
import me.meeshy.sdk.model.conversationoptions.ConversationOptionsValues
import me.meeshy.sdk.model.conversationoptions.ConversationTagsEditor
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository

/** Ce qui s'est mal passé, dit avec les mots d'iOS (`conversation.options.error.*`). */
enum class ConversationOptionsError { SAVE, CREATE_CATEGORY, LEAVE, DELETE }

/** Pourquoi la fiche se referme : la conversation n'est plus à l'utilisateur, ou le pair est bloqué. */
enum class ConversationOptionsExit { LEFT, DELETED, BLOCKED }

@Immutable
data class ConversationOptionsUiState(
    val values: ConversationOptionsValues = ConversationOptionsValues(),
    val plan: ConversationOptionsPlan? = null,
    val categories: List<CategoryOption> = emptyList(),
    val knownTags: List<String> = emptyList(),
    val customNameDraft: String = "",
    val error: ConversationOptionsError? = null,
    val exit: ConversationOptionsExit? = null,
)

/**
 * Les Options de la fiche Conversation (#13777) — miroir de `ConversationOptionsViewModel` iOS. La
 * ligne Room de la conversation est la source : elle s'affiche dès l'ouverture (cache d'abord) et
 * suit les écritures d'ailleurs (liste, autre appareil). Chaque geste passe par
 * [ConversationPreferenceActions], l'écrivain que partage le menu de la liste ; il s'affiche aussitôt
 * ([ConversationOptionsOverlay]) et se défait à l'échec. Quitter et supprimer pour moi attendent la
 * passerelle (comme la liste) ; bloquer passe par [BlockActionCoordinator].
 */
@HiltViewModel
class ConversationOptionsViewModel @Inject constructor(
    private val conversations: ConversationRepository,
    private val categories: CategoryRepository,
    private val preferences: ConversationPreferenceActions,
    private val blocker: BlockActionCoordinator,
    private val blockCache: BlockCache,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationOptionsUiState())
    val state: StateFlow<ConversationOptionsUiState> = _state.asStateFlow()

    private var conversationId: String? = null
    private var stored = ConversationOptionsValues()
    private var overlay = ConversationOptionsOverlay()
    private var observing: List<Job> = emptyList()
    private var nameWrite: Job? = null
    private var nameEditing = false

    /** Ouvre sur une conversation ; sans effet si elle est déjà suivie. */
    fun start(id: String, peerUserId: String?) {
        if (conversationId == id) return
        conversationId = id
        observing.forEach { it.cancel() }
        stored = ConversationOptionsValues()
        overlay = ConversationOptionsOverlay()
        nameEditing = false
        _state.value = ConversationOptionsUiState()
        observing = listOf(
            viewModelScope.launch {
                combine(
                    conversations.conversationStream(id).filterNotNull(),
                    session.currentUser,
                    blockCache.version,
                ) { conversation, user, _ ->
                    val blocked = peerUserId?.let(blockCache::isBlocked) ?: false
                    ConversationOptionsValues.of(conversation.resolvedPreferences) to
                        ConversationOptionsPlan.of(conversation, user, peerUserId, blocked)
                }.collect { (values, plan) ->
                    stored = values
                    overlay = overlay.absorb(values)
                    publish { it.copy(plan = plan) }
                }
            },
            viewModelScope.launch {
                categories.categoriesStream().collect { list -> _state.update { it.copy(categories = list) } }
            },
            viewModelScope.launch {
                val corpus = ConversationTagsEditor.corpus(
                    conversations.cachedConversations().first().map { it.resolvedPreferences?.tags.orEmpty() },
                )
                _state.update { it.copy(knownTags = (it.knownTags + corpus).distinct().sorted()) }
            },
        )
    }

    fun setPinned(value: Boolean) = edit(ConversationOptionsEdit.Pinned(value)) { id -> preferences.setPinned(id, value) }

    fun setMuted(value: Boolean) = edit(ConversationOptionsEdit.Muted(value)) { id -> preferences.setMuted(id, value) }

    fun setMentionsOnly(value: Boolean) =
        edit(ConversationOptionsEdit.MentionsOnly(value)) { id -> preferences.setMentionsOnly(id, value) }

    fun toggleArchive() {
        val next = !displayed().isArchived
        edit(ConversationOptionsEdit.Archived(next)) { id -> preferences.setArchived(id, next) }
    }

    fun setReaction(emoji: String?) = edit(ConversationOptionsEdit.Reaction(emoji)) { id -> preferences.setReaction(id, emoji) }

    fun addTag(tag: String) = setTags(ConversationTagsEditor.add(displayed().tags, tag))

    fun removeTag(tag: String) = setTags(ConversationTagsEditor.remove(displayed().tags, tag))

    fun selectCategory(categoryId: String) {
        val current = displayed().categoryId
        edit(ConversationOptionsEdit.Category(categoryId)) { id -> preferences.assignCategory(id, current, categoryId) }
    }

    /** Retire la catégorie (iOS `CategoryPickerField`, `category.remove`) : la conversation repart hors catégorie. */
    fun removeCategory() {
        val current = displayed().categoryId ?: return
        edit(ConversationOptionsEdit.Category(null)) { id -> preferences.removeCategory(id, current) }
    }

    fun createCategory(name: String) {
        val id = conversationId ?: return
        val current = displayed().categoryId
        viewModelScope.launch {
            when (val outcome = preferences.createCategoryAndAssign(id, current, name)) {
                is CategoryCreation.Assigned -> _state.update { state ->
                    state.copy(
                        categories = if (state.categories.any { it.id == outcome.category.id }) state.categories else state.categories + outcome.category,
                        error = if (outcome.write is PreferenceWrite.Failed) ConversationOptionsError.SAVE else null,
                    )
                }
                is CategoryCreation.Failed -> _state.update { it.copy(error = ConversationOptionsError.CREATE_CATEGORY) }
                CategoryCreation.Ignored -> Unit
            }
        }
    }

    /** Le champ « Nom personnalisé » : la saisie s'affiche, l'écriture part après une pause de 500 ms (iOS). */
    fun editCustomName(text: String) {
        val id = conversationId ?: return
        nameEditing = true
        _state.update { it.copy(customNameDraft = text) }
        nameWrite?.cancel()
        nameWrite = viewModelScope.launch {
            delay(CUSTOM_NAME_DEBOUNCE_MILLIS)
            if (preferences.setCustomName(id, text) is PreferenceWrite.Failed) {
                _state.update { it.copy(error = ConversationOptionsError.SAVE) }
            }
        }
    }

    fun leave() = exitWith(ConversationOptionsExit.LEFT, ConversationOptionsError.LEAVE) { id -> conversations.leave(id) }

    fun deleteForMe() =
        exitWith(ConversationOptionsExit.DELETED, ConversationOptionsError.DELETE) { id -> conversations.deleteForMe(id) }

    fun blockPeer() {
        val peer = _state.value.plan?.blockUserId ?: return
        viewModelScope.launch {
            blocker.block(peer)
            _state.update { it.copy(exit = ConversationOptionsExit.BLOCKED) }
        }
    }

    fun dismissError() = _state.update { it.copy(error = null) }

    fun consumeExit() = _state.update { it.copy(exit = null) }

    private fun setTags(next: List<String>) = edit(ConversationOptionsEdit.Tags(next)) { id -> preferences.setTags(id, next) }

    private fun displayed(): ConversationOptionsValues = overlay.displayed(stored)

    private fun edit(edit: ConversationOptionsEdit, write: suspend (String) -> PreferenceWrite) {
        val id = conversationId ?: return
        overlay = overlay.pending(edit)
        publish { it.copy(error = null) }
        viewModelScope.launch {
            when (write(id)) {
                is PreferenceWrite.Failed -> {
                    overlay = overlay.settle(edit)
                    publish { it.copy(error = ConversationOptionsError.SAVE) }
                }
                PreferenceWrite.Unchanged -> {
                    overlay = overlay.settle(edit)
                    publish { it }
                }
                PreferenceWrite.Queued -> Unit
            }
        }
    }

    private fun exitWith(
        exit: ConversationOptionsExit,
        error: ConversationOptionsError,
        call: suspend (String) -> NetworkResult<*>,
    ) {
        val id = conversationId ?: return
        viewModelScope.launch {
            when (call(id)) {
                is NetworkResult.Success -> _state.update { it.copy(exit = exit, error = null) }
                is NetworkResult.Failure -> _state.update { it.copy(error = error) }
            }
        }
    }

    private fun publish(transform: (ConversationOptionsUiState) -> ConversationOptionsUiState) {
        val shown = displayed()
        _state.update { current ->
            transform(current).copy(
                values = shown,
                customNameDraft = if (nameEditing) current.customNameDraft else shown.customName.orEmpty(),
            )
        }
    }

    private companion object {
        const val CUSTOM_NAME_DEBOUNCE_MILLIS = 500L
    }
}
