package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
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
) : ViewModel() {

    private val _state = MutableStateFlow(OwnProfileUiState())
    val state: StateFlow<OwnProfileUiState> = _state.asStateFlow()

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
            OwnProfileUiEvent.StartEditing ->
                _state.update { it.copy(isEditing = true).withBuffersFrom(it.user) }
            OwnProfileUiEvent.CancelEditing ->
                _state.update { it.copy(isEditing = false).withBuffersFrom(it.user) }
            OwnProfileUiEvent.Save -> saveProfile()
            is OwnProfileUiEvent.FirstNameChanged -> _state.update { it.copy(firstName = event.value) }
            is OwnProfileUiEvent.LastNameChanged -> _state.update { it.copy(lastName = event.value) }
            is OwnProfileUiEvent.DisplayNameChanged -> _state.update { it.copy(displayName = event.value) }
            is OwnProfileUiEvent.BioChanged -> _state.update { it.copy(bio = event.value) }
            is OwnProfileUiEvent.SystemLanguageChanged -> _state.update { it.copy(systemLanguage = event.code) }
            is OwnProfileUiEvent.RegionalLanguageChanged -> _state.update { it.copy(regionalLanguage = event.code) }
            is OwnProfileUiEvent.CustomDestinationLanguageChanged ->
                _state.update { it.copy(customDestinationLanguage = event.code) }
        }
    }

    /**
     * Saves the edit optimistically (ARCHITECTURE.md §4/§5). The editor closes
     * immediately and [UserRepository.enqueueProfileEdit] re-paints the session
     * identity locally, then durably queues the `UPDATE_PROFILE` mutation — so the
     * save survives offline and process death. A non-`null` `cmid` wakes the flush
     * worker; a local enqueue failure surfaces the error and reopens the editor so
     * the user can retry.
     */
    private fun saveProfile() {
        val current = _state.value
        val request = ProfileEditRequestBuilder.build(
            firstName = current.firstName,
            lastName = current.lastName,
            displayName = current.displayName,
            bio = current.bio,
            systemLanguage = current.systemLanguage,
            regionalLanguage = current.regionalLanguage,
            customDestinationLanguage = current.customDestinationLanguage,
        )
        _state.update { it.copy(isEditing = false, isSaving = false, errorMessage = null) }
        viewModelScope.launch {
            try {
                val cmid = userRepository.enqueueProfileEdit(request)
                if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isEditing = true, errorMessage = e.message) }
            }
        }
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
