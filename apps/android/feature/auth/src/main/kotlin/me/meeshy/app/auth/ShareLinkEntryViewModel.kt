package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ShareLinkEntryIntent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionStore
import javax.inject.Inject

/**
 * Reads whether an account is present on this device. The app-side brain of the
 * guest-join route needs this to ask [ShareLinkEntryResolver] the right question;
 * a `fun interface` seam so the ViewModel is decoupled from the concrete
 * [me.meeshy.sdk.auth.AuthRepository] and trivially faked in tests.
 */
public fun interface ShareLinkAuthStateProviding {
    public fun isAuthenticated(): Boolean
}

/**
 * Executes the authenticated (JWT) join of a share link, returning the canonical
 * conversationId. A `fun interface` seam over
 * [me.meeshy.sdk.sharelink.ShareLinkJoinRepository.joinAuthenticated] — the
 * consumer wires it to `repository::joinAuthenticated`.
 */
public fun interface AuthenticatedShareLinkJoining {
    public suspend fun join(linkId: String): NetworkResult<String>
}

/**
 * The caller's IN-MEMORY set of conversation ids, consulted only when an account
 * is present (so a member of the target conversation opens it straight away
 * instead of being asked which identity to use). A paginated list may omit an old
 * conversation; the false "not a member" costs one extra question, never a wrong
 * entry — the account branch hits an idempotent join. A `fun interface` seam
 * bound app-side to the cached conversation list.
 */
public fun interface KnownConversationIdsProviding {
    public suspend fun current(): Set<String>
}

/**
 * The navigation decision for a share-link deep link — the single output the
 * Compose route consumes. Every branch of [ShareLinkEntryIntent] maps to exactly
 * one of these, plus the two the intent cannot express on its own: [Resolving]
 * (the resolve/join is in flight) and [Failed] (an authenticated join failed).
 */
public sealed interface ShareLinkEntryUiState {
    /** Resolving the link, or performing an authenticated join — show a spinner. */
    public data object Resolving : ShareLinkEntryUiState

    /** Present the anonymous join form ([GuestJoinScreen]). */
    public data object GuestForm : ShareLinkEntryUiState

    /**
     * Navigate straight into the conversation — already a member, joined with the
     * present account, or a resumed guest session.
     */
    public data class OpenConversation(val conversationId: String) : ShareLinkEntryUiState

    /** Ask which identity to enter with: the present account, or anonymous. */
    public data class ChooseIdentity(
        val conversationId: String,
        val conversationTitle: String?,
        val resumesGuestSession: Boolean,
    ) : ShareLinkEntryUiState

    /** The link demands an account and the device has none — steer to sign in. */
    public data object RequiresAccount : ShareLinkEntryUiState

    /** An authenticated join failed — surface the error, offer a retry. */
    public data class Failed(val message: String?) : ShareLinkEntryUiState
}

/**
 * Orchestrates the guest-join deep-link route: on entry it gathers the facts (via
 * [ShareLinkEntryResolver]), asks the pure [me.meeshy.sdk.model.ShareLinkEntryPolicy]
 * how the person should enter, and reduces the answer to a single
 * [ShareLinkEntryUiState] the Compose layer navigates on. Two intents demand a
 * network round-trip the state machine performs itself — an authenticated join
 * for [ShareLinkEntryIntent.JoinWithAccount] (and for the fallback when the link
 * cannot be resolved at all while an account is present), which is why those
 * outcomes are [ShareLinkEntryUiState.OpenConversation] or
 * [ShareLinkEntryUiState.Failed] rather than a passthrough.
 *
 * App-side, not SDK: it does I/O and consults device state. The decision itself
 * stays the SDK's. Port of the iOS `RootView.resolveShareLinkEntry` orchestration,
 * unified here for both the authenticated and unauthenticated entry (iOS routes
 * the two through separate views).
 */
@HiltViewModel
public class ShareLinkEntryViewModel @Inject constructor(
    private val resolver: ShareLinkEntryResolver,
    private val join: AuthenticatedShareLinkJoining,
    private val authState: ShareLinkAuthStateProviding,
    private val knownConversationIds: KnownConversationIdsProviding,
    private val sessionStore: AnonymousSessionStore,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val identifier: String = checkNotNull(savedStateHandle[GuestJoinViewModel.IDENTIFIER_ARG]) {
        "ShareLinkEntryViewModel requires an '${GuestJoinViewModel.IDENTIFIER_ARG}' navigation argument"
    }

    private val _state = MutableStateFlow<ShareLinkEntryUiState>(ShareLinkEntryUiState.Resolving)
    public val state: StateFlow<ShareLinkEntryUiState> = _state.asStateFlow()

    init {
        resolve()
    }

    /** Re-run the whole resolution — the retry hook behind a [ShareLinkEntryUiState.Failed]. */
    public fun resolve() {
        _state.value = ShareLinkEntryUiState.Resolving
        viewModelScope.launch {
            _state.value = decide()
        }
    }

    /**
     * The person picked their present account from a [ShareLinkEntryUiState.ChooseIdentity]
     * prompt: join silently and open the conversation (or surface the failure).
     */
    public fun chooseAccount() {
        _state.value = ShareLinkEntryUiState.Resolving
        viewModelScope.launch {
            _state.value = attemptAuthenticatedJoin()
        }
    }

    /**
     * The person picked anonymity from a [ShareLinkEntryUiState.ChooseIdentity] prompt:
     * resume the guest session already open on this link, or open the join form when
     * there is none to resume.
     */
    public fun chooseAnonymous() {
        _state.value = ShareLinkEntryUiState.Resolving
        viewModelScope.launch {
            _state.value = resumeStoredGuestSession()
        }
    }

    private suspend fun decide(): ShareLinkEntryUiState {
        val isAuthenticated = authState.isAuthenticated()
        val known = if (isAuthenticated) knownConversationIds.current() else emptySet()

        val resolution = resolver.resolve(
            identifier = identifier,
            isAuthenticated = isAuthenticated,
            knownConversationIds = known,
        ) ?: return if (isAuthenticated) attemptAuthenticatedJoin() else ShareLinkEntryUiState.GuestForm

        return when (val intent = resolution.intent) {
            is ShareLinkEntryIntent.OpenConversation ->
                ShareLinkEntryUiState.OpenConversation(intent.conversationId)

            is ShareLinkEntryIntent.JoinWithAccount -> attemptAuthenticatedJoin()

            is ShareLinkEntryIntent.ChooseIdentity -> ShareLinkEntryUiState.ChooseIdentity(
                conversationId = intent.conversationId,
                conversationTitle = resolution.conversationTitle,
                resumesGuestSession = hasStoredGuestSessionForThisLink(),
            )

            ShareLinkEntryIntent.JoinAnonymously -> ShareLinkEntryUiState.GuestForm

            ShareLinkEntryIntent.ResumeGuestSession -> resumeStoredGuestSession()

            ShareLinkEntryIntent.RequiresAccount -> ShareLinkEntryUiState.RequiresAccount
        }
    }

    private suspend fun attemptAuthenticatedJoin(): ShareLinkEntryUiState =
        when (val result = join.join(identifier)) {
            is NetworkResult.Success -> ShareLinkEntryUiState.OpenConversation(result.data)
            is NetworkResult.Failure -> ShareLinkEntryUiState.Failed(result.error.message)
        }

    private suspend fun resumeStoredGuestSession(): ShareLinkEntryUiState {
        val stored = sessionStore.load()
        val conversationId = stored?.conversationId?.trim().orEmpty()
        return if (stored != null &&
            stored.linkId.trim() == identifier.trim() &&
            conversationId.isNotEmpty()
        ) {
            ShareLinkEntryUiState.OpenConversation(conversationId)
        } else {
            ShareLinkEntryUiState.GuestForm
        }
    }

    private suspend fun hasStoredGuestSessionForThisLink(): Boolean =
        sessionStore.load()?.linkId?.trim() == identifier.trim()
}
