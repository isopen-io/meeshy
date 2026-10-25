package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.profile.ProfileEditDiff
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** L'etat de MA page de profil : l'identite de la session, l'editeur et le tableau de bord. */
@Immutable
data class OwnProfileUiState(
    val user: MeeshyUser? = null,
    val isEditing: Boolean = false,
    val firstName: String = "",
    val lastName: String = "",
    val displayName: String = "",
    val bio: String = "",
    val systemLanguage: String = "",
    val regionalLanguage: String = "",
    val customDestinationLanguage: String = "",
    val errorMessage: String? = null,
    val isSaving: Boolean = false,
    val stats: UserStatsPresentation? = null,
    val timeline: StatsTimelinePresentation? = null,
    val pendingFriendRequests: Int = 0,
    val moodEmoji: String? = null,
)

/** Les intentions de MA page de profil — le puits unique [OwnProfileViewModel.onEvent]. */
sealed interface OwnProfileUiEvent {
    data object StartEditing : OwnProfileUiEvent
    data object CancelEditing : OwnProfileUiEvent
    data object Save : OwnProfileUiEvent
    data class FirstNameChanged(val value: String) : OwnProfileUiEvent
    data class LastNameChanged(val value: String) : OwnProfileUiEvent
    data class DisplayNameChanged(val value: String) : OwnProfileUiEvent
    data class BioChanged(val value: String) : OwnProfileUiEvent
    data class SystemLanguageChanged(val code: String) : OwnProfileUiEvent
    data class RegionalLanguageChanged(val code: String) : OwnProfileUiEvent
    data class CustomDestinationLanguageChanged(val code: String) : OwnProfileUiEvent
}

/** Les effets ponctuels de l'enregistrement : haptiques, toast hors ligne, message d'échec. */
sealed interface OwnProfileUiEffect {
    /** Enregistrer touché : l'écran est déjà à jour (haptique succès). */
    data object SaveSucceeded : OwnProfileUiEffect

    /** Enregistré hors ligne : la file synchronisera au retour du réseau (toast). */
    data object SavedOffline : OwnProfileUiEffect

    /** L'envoi a échoué : haptique d'erreur, et le message générique quand [showDefaultMessage]. */
    data class SaveFailed(val showDefaultMessage: Boolean) : OwnProfileUiEffect
}

/**
 * MA page de profil (parite iOS `ProfileView`, alimentee par `authManager.currentUser`) :
 * elle n'observe QUE la session — jamais un id de route, jamais `UserRepository.getProfile`.
 * La page d'un tiers vit dans [PublicProfileViewModel]. L'etat (editeur et tampons compris)
 * vit ici, donc survit a la rotation.
 */
@HiltViewModel
class OwnProfileViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val statsCache: ProfileStatsCacheRepository,
    private val workManager: WorkManager,
    private val friendshipCache: FriendshipCache,
    private val statusBarCache: StatusBarCache,
    private val networkMonitor: NetworkMonitor = InMemoryNetworkMonitor(),
) : ViewModel() {

    private val _state = MutableStateFlow(OwnProfileUiState())
    val state: StateFlow<OwnProfileUiState> = _state.asStateFlow()

    private val _effects = Channel<OwnProfileUiEffect>(Channel.BUFFERED)
    val effects: Flow<OwnProfileUiEffect> = _effects.receiveAsFlow()

    /** L'identité sur laquelle l'éditeur s'est ouvert : la référence de « ce qui a changé ». */
    private var editOrigin: MeeshyUser? = null

    /** Le cliché d'avant la PREMIÈRE édition non confirmée : la cible du retour arrière. */
    private var rollbackSnapshot: MeeshyUser? = null

    /** La dernière édition mise en file ; une plus ancienne remplacée ne confirme rien. */
    private var latestCmid: String? = null

    private var statsLoadedForId: String? = null
    private var timelineLoaded = false

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                // While the user is actively editing, only refresh the read-only
                // reference; never clobber the in-flight editor buffers with a
                // background session emission.
                _state.update { s -> if (s.isEditing) s.copy(user = user) else s.withBuffersFrom(user) }
                user?.id?.takeIf { it.isNotBlank() }?.let {
                    paintMoodFromCache(it)
                    loadStatsOnce(it)
                    loadTimelineOnce()
                }
            }
        }
        viewModelScope.launch {
            friendshipCache.version.collect {
                _state.update { s -> s.copy(pendingFriendRequests = friendshipCache.pendingReceivedCount) }
            }
        }
        refreshSilently()
    }

    /**
     * Relit mon profil a l'ouverture, en silence (iOS `refreshCurrentUserProfile`) : la session
     * republie l'identite fraiche, et un echec garde l'affiche — jamais de squelette ni d'erreur.
     */
    private fun refreshSilently() {
        viewModelScope.launch {
            try {
                sessionRepository.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Hors ligne : la page garde l'identite deja peinte.
            }
        }
    }

    /** Mon humeur, lue dans le cache des statuts deja servi — aucune requete (iOS `ProfileOwnAvatar`). */
    private fun paintMoodFromCache(userId: String) {
        val statuses = statusBarCache.load(StatusFeedMode.FRIENDS).valueOrNull.orEmpty()
        _state.update { it.copy(moodEmoji = OwnProfileMood.resolve(statuses, userId)) }
    }

    fun onEvent(event: OwnProfileUiEvent) {
        when (event) {
            OwnProfileUiEvent.StartEditing -> {
                editOrigin = _state.value.user
                _state.update { it.copy(isEditing = true, errorMessage = null).withBuffersFrom(it.user) }
            }
            OwnProfileUiEvent.CancelEditing ->
                _state.update { it.copy(isEditing = false).withBuffersFrom(it.user) }
            OwnProfileUiEvent.Save -> saveProfile()
            is OwnProfileUiEvent.FirstNameChanged -> _state.update { it.copy(firstName = event.value) }
            is OwnProfileUiEvent.LastNameChanged -> _state.update { it.copy(lastName = event.value) }
            is OwnProfileUiEvent.DisplayNameChanged -> _state.update { it.copy(displayName = event.value) }
            is OwnProfileUiEvent.BioChanged ->
                _state.update { it.copy(bio = event.value.take(ProfileEditDiff.BIO_MAX_LENGTH)) }
            is OwnProfileUiEvent.SystemLanguageChanged -> _state.update { it.copy(systemLanguage = event.code) }
            is OwnProfileUiEvent.RegionalLanguageChanged -> _state.update { it.copy(regionalLanguage = event.code) }
            is OwnProfileUiEvent.CustomDestinationLanguageChanged ->
                _state.update { it.copy(customDestinationLanguage = event.code) }
        }
    }

    /**
     * Saves the edit optimistically (ARCHITECTURE.md §4/§5; iOS `ProfileView.saveProfile`). Only the
     * fields that changed against [editOrigin] leave ([ProfileEditRequestBuilder]); the editor closes
     * at once with a success haptic and [UserRepository.enqueueProfileEdit] re-paints every surface,
     * then durably queues the `UPDATE_PROFILE` mutation. Offline, a toast says it will sync. When the
     * outbox ABANDONS the edit, the snapshot taken before it is restored and the editor reopens on
     * what the user typed, with the error said and the error haptic played.
     */
    private fun saveProfile() {
        val attempted = _state.value
        val request = ProfileEditRequestBuilder.build(
            original = editOrigin ?: attempted.user,
            firstName = attempted.firstName,
            lastName = attempted.lastName,
            displayName = attempted.displayName,
            bio = attempted.bio,
            systemLanguage = attempted.systemLanguage,
            regionalLanguage = attempted.regionalLanguage,
            customDestinationLanguage = attempted.customDestinationLanguage,
        )
        _state.update { it.copy(isEditing = false, isSaving = false, errorMessage = null) }
        _effects.trySend(OwnProfileUiEffect.SaveSucceeded)
        if (ProfileEditDiff.isEmpty(request)) return
        val snapshot = rollbackSnapshot ?: sessionRepository.currentUser.value
        rollbackSnapshot = snapshot
        val offline = !networkMonitor.isOnline.value
        viewModelScope.launch {
            val cmid = try {
                userRepository.enqueueProfileEdit(request)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                abandon(snapshot, attempted, message = e.message)
                return@launch
            }
            if (cmid == null) {
                rollbackSnapshot = null
                return@launch
            }
            latestCmid = cmid
            launch(start = CoroutineStart.UNDISPATCHED) { watchOutcome(cmid, snapshot, attempted) }
            wakeFlushWorker()
            if (offline) _effects.send(OwnProfileUiEffect.SavedOffline)
        }
    }

    private fun wakeFlushWorker() {
        try {
            workManager.enqueue(OutboxFlushWorker.buildRequest())
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // The row is durable: the next flush trigger (reconnect, start-up) delivers it.
        }
    }

    /** Waits for the outbox verdict on [cmid]; an abandon rolls back, a confirmation clears the snapshot. */
    private suspend fun watchOutcome(cmid: String, snapshot: MeeshyUser?, attempted: OwnProfileUiState) {
        val abandoned = try {
            userRepository.awaitProfileEditAbandoned(cmid)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return
        }
        when {
            abandoned -> abandon(snapshot, attempted, message = null)
            cmid == latestCmid -> {
                rollbackSnapshot = null
                latestCmid = null
            }
        }
    }

    /**
     * Rolls back to [snapshot] and reopens the editor on the [attempted] buffers so the user can fix
     * and retry. [message] is a specific error; without one the screen says the generic save error.
     */
    private fun abandon(snapshot: MeeshyUser?, attempted: OwnProfileUiState, message: String?) {
        rollbackSnapshot = null
        latestCmid = null
        snapshot?.let(sessionRepository::restoreProfileSnapshot)
        editOrigin = snapshot ?: _state.value.user
        _state.update {
            it.copy(
                isEditing = true,
                errorMessage = message,
                firstName = attempted.firstName,
                lastName = attempted.lastName,
                displayName = attempted.displayName,
                bio = attempted.bio,
                systemLanguage = attempted.systemLanguage,
                regionalLanguage = attempted.regionalLanguage,
                customDestinationLanguage = attempted.customDestinationLanguage,
            )
        }
        _effects.trySend(OwnProfileUiEffect.SaveFailed(showDefaultMessage = message == null))
    }

    /**
     * Fetches and projects my activity stats exactly once per resolved session id,
     * cache first. Stats are a secondary surface: a failure never surfaces an error
     * nor clobbers the page.
     */
    private fun loadStatsOnce(id: String) {
        if (id == statsLoadedForId) return
        statsLoadedForId = id
        viewModelScope.launch {
            try {
                statsCache.cachedStats(id)?.let { cached ->
                    _state.update { it.copy(stats = UserStatsBuilder.build(cached)) }
                }
                val result = userRepository.getUserStats(id)
                if (result is NetworkResult.Success) {
                    _state.update { it.copy(stats = UserStatsBuilder.build(result.data)) }
                    statsCache.persistStats(id, result.data)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Stats are non-critical — swallow so the page is never broken by them.
            }
        }
    }

    /**
     * Fetches and projects my 30-day activity timeline exactly once, cache first.
     * `/users/me/stats/timeline` reports only the caller's own activity — this page
     * is its only consumer. Failure-inert, like the stats.
     */
    private fun loadTimelineOnce() {
        if (timelineLoaded) return
        timelineLoaded = true
        viewModelScope.launch {
            try {
                statsCache.cachedTimeline()?.let { cached ->
                    StatsTimelineBuilder.build(cached)?.let { presentation ->
                        _state.update { it.copy(timeline = presentation) }
                    }
                }
                val result = userRepository.getUserStatsTimeline()
                if (result is NetworkResult.Success) {
                    _state.update { it.copy(timeline = StatsTimelineBuilder.build(result.data)) }
                    statsCache.persistTimeline(result.data)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // Timeline is non-critical — swallow so the page is never broken by it.
            }
        }
    }

    /**
     * Re-seeds [user] and every editor buffer from [user] — the single place the
     * buffer↔user mapping lives, so the editor always opens on the freshest
     * identity and a cancel restores it.
     */
    private fun OwnProfileUiState.withBuffersFrom(user: MeeshyUser?): OwnProfileUiState = copy(
        user = user,
        firstName = user?.firstName ?: "",
        lastName = user?.lastName ?: "",
        displayName = user?.displayName ?: "",
        bio = user?.bio ?: "",
        systemLanguage = user?.systemLanguage ?: "",
        regionalLanguage = user?.regionalLanguage ?: "",
        customDestinationLanguage = user?.customDestinationLanguage ?: "",
    )
}
