package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ConversationSettingsForm
import me.meeshy.sdk.model.MemberActionPolicy
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.knownUserRole
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/** Lifecycle of an admin settings save. */
enum class SettingsSaveStatus { Idle, Saving, Saved, Error }

data class ConversationSettingsUiState(
    val conversationId: String? = null,
    val form: ConversationSettingsForm? = null,
    val status: SettingsSaveStatus = SettingsSaveStatus.Idle,
    /** #15269 — la loi des actions accorde l'édition de la conversation à ce lecteur (jamais Global, jamais un direct). */
    val mayEdit: Boolean = false,
    /** L'accent PERSONNEL du lecteur ; `null` = « Automatique » (l'accent calculé de la conversation). */
    val appearance: ConversationAppearance = ConversationAppearance.DEFAULT,
    val catalog: AppearanceCatalog? = null,
    /** Recherche LOCALE de la section « Gestion des membres » : filtre le roster déjà chargé, sans requête. */
    val memberQuery: String = "",
    /** Le rang du lecteur dans cette conversation (repli membre) : il décide du bouton « Ajouter un membre ». */
    val viewerRole: MemberRole = MemberRole.MEMBER,
) {
    val mayAddMember: Boolean get() = MemberActionPolicy.mayAddMember(viewerRole)

    val isLoaded: Boolean get() = form != null
    val isSaving: Boolean get() = status == SettingsSaveStatus.Saving
    val hasError: Boolean get() = status == SettingsSaveStatus.Error
    val justSaved: Boolean get() = status == SettingsSaveStatus.Saved

    /** The save button is enabled only for a dirty form that is not mid-flight. */
    val canSave: Boolean get() = form?.canSave == true && !isSaving
}

/**
 * Drives the admin conversation-settings editor (feature-parity §Chat — conversation
 * moderation). Stays a thin caller over the pure [ConversationSettingsForm]: it
 * seeds the form once from the cached conversation, threads each edit through the
 * reducer, and persists the minimal patch via [ConversationRepository.updateSettings].
 *
 * SOTA over iOS: the diff-based reducer means an unchanged save is impossible, a
 * failed save keeps every edit intact for retry, and editing after a failure clears
 * the error banner automatically.
 */
@HiltViewModel
class ConversationSettingsViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val sessionRepository: SessionRepository,
    private val appearanceLoader: AppearanceCatalogLoader,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationSettingsUiState())
    val state: StateFlow<ConversationSettingsUiState> = _state.asStateFlow()

    /**
     * Bind to a conversation. Seeds the form from the first cached snapshot and
     * ignores later stream emissions so in-progress edits are never clobbered.
     * Idempotent for the same id.
     */
    fun load(conversationId: String) {
        if (_state.value.conversationId == conversationId) return
        _state.update { ConversationSettingsUiState(conversationId = conversationId, catalog = appearanceLoader.current) }
        viewModelScope.launch {
            val catalog = runCatching { appearanceLoader.catalog() }.getOrNull()
            _state.update { it.copy(catalog = catalog) }
        }
        viewModelScope.launch {
            conversationRepository.conversationStream(conversationId).collect { conversation ->
                if (conversation == null) return@collect
                val mayEdit = ConversationRowMenuCapabilities.forViewer(conversation, sessionRepository.currentUser.value).rename
                val appearance = ConversationAppearance.read(conversation.resolvedPreferences?.appearance)
                _state.update {
                    it.copy(
                        mayEdit = mayEdit,
                        form = it.form ?: ConversationSettingsForm.from(conversation),
                        appearance = appearance,
                        viewerRole = conversation.knownUserRole(sessionRepository.currentUser.value?.id) ?: MemberRole.MEMBER,
                    )
                }
            }
        }
    }

    fun setMemberQuery(query: String) = _state.update { it.copy(memberQuery = query) }

    fun setWriteRole(role: MemberRole) = editForm { it.withWriteRole(role) }

    fun setAnnouncement(enabled: Boolean) = editForm { it.withAnnouncement(enabled) }

    fun setSlowMode(seconds: Int) = editForm { it.withSlowMode(seconds) }

    fun setAutoTranslate(enabled: Boolean) = editForm { it.withAutoTranslate(enabled) }

    /**
     * Écrit l'accent personnel par la mutation optimiste des préférences (la ligne Room se repeint aussitôt :
     * liste et fil), `null` = Automatique. Sur échec, le choix précédent revient.
     */
    fun setAccent(key: String?) {
        val id = _state.value.conversationId ?: return
        val previous = _state.value.appearance
        val next = previous.withAccent(key)
        if (next == previous) return
        _state.update { it.copy(appearance = next) }
        viewModelScope.launch {
            val written = conversationRepository.setAppearanceOptimistic(id, next)
            if (!written) _state.update { if (it.appearance == next) it.copy(appearance = previous) else it }
        }
    }

    private fun editForm(transform: (ConversationSettingsForm) -> ConversationSettingsForm) {
        _state.update { current ->
            val form = current.form ?: return@update current
            // Any edit returns the lifecycle to Idle: a lingering "Saved" toast or a
            // prior "Error" banner is cleared the moment the user changes a control.
            current.copy(form = transform(form), status = SettingsSaveStatus.Idle)
        }
    }

    /**
     * Persist the minimal patch. No-op when nothing changed (a clean form yields a
     * null patch) or a save is already in flight (double-submit guard). On success
     * the baseline is re-anchored so the form is clean again; on failure every edit
     * is preserved for retry.
     */
    fun save() {
        val current = _state.value
        val id = current.conversationId ?: return
        val form = current.form ?: return
        if (current.status == SettingsSaveStatus.Saving) return
        val patch = form.toUpdate() ?: return

        _state.update { it.copy(status = SettingsSaveStatus.Saving) }
        viewModelScope.launch {
            val result = conversationRepository.updateSettings(id, patch)
            _state.update { state ->
                when (result) {
                    is NetworkResult.Success ->
                        state.copy(
                            form = (state.form ?: form).rebaselined(),
                            status = SettingsSaveStatus.Saved,
                        )
                    is NetworkResult.Failure ->
                        state.copy(status = SettingsSaveStatus.Error)
                }
            }
        }
    }
}
