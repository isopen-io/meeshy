package me.meeshy.app.conversations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ShareLinkEligibility
import me.meeshy.sdk.model.UserRole
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Backs [ShareLinkPickerScreen] — the conversation picker that launches the
 * existing share-link creation flow. Reads the same cache-first,
 * stale-while-revalidate stream every other list surface reads
 * ([ConversationRepository.conversationsStream], never the network-blind
 * [ConversationRepository.cachedConversations]) so a cold cache shows a
 * loading state instead of a false "no conversation to share" empty state,
 * and combines it with the live [SessionRepository.currentUser] — a session
 * resolved after this flow's first emission still re-evaluates eligibility
 * instead of being read once, opportunistically, inside a `.map`. The
 * eligibility rule itself is what [me.meeshy.sdk.model.ShareLinkEligibilityTest]
 * locks down.
 */
@HiltViewModel
class ShareLinkPickerViewModel @Inject constructor(
    private val repository: ConversationRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val syncErrorMessage = MutableStateFlow<String?>(null)

    val state: StateFlow<ShareLinkPickerUiState> =
        combine(
            repository.conversationsStream(onSyncError = { syncErrorMessage.value = it.message }),
            sessionRepository.currentUser,
            syncErrorMessage,
        ) { result, user, errorMessage ->
            val conversations = result.valueOrNull
            ShareLinkPickerUiState(
                isLoading = conversations == null,
                eligibleConversations = conversations?.let {
                    ShareLinkEligibility.eligibleConversations(
                        conversations = it,
                        currentUserId = user?.id,
                        platformRole = user?.resolvedRole ?: UserRole.USER,
                    )
                } ?: emptyList(),
                currentUserId = user?.id,
                errorMessage = errorMessage,
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ShareLinkPickerUiState())

    /** Retries a failed background revalidation (empty-with-error state's CTA). */
    fun retry() {
        syncErrorMessage.value = null
        viewModelScope.launch {
            runCatching { repository.refresh() }
                .onFailure { syncErrorMessage.value = it.message }
        }
    }
}

data class ShareLinkPickerUiState(
    val isLoading: Boolean = true,
    val eligibleConversations: List<ApiConversation> = emptyList(),
    val currentUserId: String? = null,
    val errorMessage: String? = null,
)
