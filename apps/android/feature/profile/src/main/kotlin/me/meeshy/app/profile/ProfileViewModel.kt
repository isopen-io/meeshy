package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

data class ProfileUiState(
    val user: MeeshyUser? = null,
    val isLoading: Boolean = false,
    val isEditing: Boolean = false,
    val displayName: String = "",
    val bio: String = "",
    val systemLanguage: String = "",
    val regionalLanguage: String = "",
    val customDestinationLanguage: String = "",
    val errorMessage: String? = null,
    val isSaving: Boolean = false,
    val stats: UserStatsPresentation? = null,
    val timeline: StatsTimelinePresentation? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val statsCache: ProfileStatsCacheRepository,
    private val workManager: WorkManager,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String? = savedStateHandle[USER_ID_ARG]

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    private var statsLoadedForId: String? = null
    private var timelineLoaded = false

    init {
        if (userId == null) {
            // Own profile — observe session
            viewModelScope.launch {
                sessionRepository.currentUser.collect { user ->
                    // While the user is actively editing, only refresh the read-only
                    // reference; never clobber the in-flight editor buffers with a
                    // background session emission.
                    _state.update { s ->
                        if (s.isEditing) s.copy(user = user) else s.withBuffersFrom(user)
                    }
                    user?.id?.takeIf { it.isNotBlank() }?.let {
                        loadStatsOnce(it)
                        loadTimelineOnce()
                    }
                }
            }
        } else {
            loadProfile(userId)
        }
    }

    fun onDisplayNameChange(value: String) = _state.update { it.copy(displayName = value) }
    fun onBioChange(value: String) = _state.update { it.copy(bio = value) }
    fun onSystemLanguageChange(code: String) = _state.update { it.copy(systemLanguage = code) }
    fun onRegionalLanguageChange(code: String) = _state.update { it.copy(regionalLanguage = code) }
    fun onCustomDestinationLanguageChange(code: String) =
        _state.update { it.copy(customDestinationLanguage = code) }

    fun startEditing() = _state.update { it.copy(isEditing = true).withBuffersFrom(it.user) }
    fun cancelEditing() = _state.update { it.copy(isEditing = false).withBuffersFrom(it.user) }

    /**
     * Saves the edit optimistically (ARCHITECTURE.md §4/§5). The editor closes
     * immediately and [UserRepository.enqueueProfileEdit] re-paints the session
     * identity locally, then durably queues the `UPDATE_PROFILE` mutation — so the
     * save survives offline and process death. A non-`null` `cmid` wakes the flush
     * worker; a local enqueue failure surfaces the error and reopens the editor so
     * the user can retry.
     */
    fun saveProfile() {
        val current = _state.value
        val request = ProfileEditRequestBuilder.build(
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

    private fun loadProfile(id: String) {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            try {
                when (val result = userRepository.getProfile(id)) {
                    is NetworkResult.Success -> {
                        val user = result.data
                        _state.update { it.copy(isLoading = false).withBuffersFrom(user) }
                        loadStatsOnce(user.id.takeIf { it.isNotBlank() } ?: id)
                    }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(isLoading = false, errorMessage = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, errorMessage = e.message) }
            }
        }
    }

    /**
     * Fetches and projects the activity stats for [id] exactly once per resolved
     * user. Stats are a secondary surface: a failure must never surface an error
     * or clobber the profile view — the dashboard simply stays empty and the next
     * resolved id can retry. Cancellation is propagated so `viewModelScope`
     * teardown stays clean.
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
                // Stats are non-critical — swallow so the profile view is never broken by them.
            }
        }
    }

    /**
     * Fetches and projects the signed-in user's 30-day activity timeline exactly
     * once. The `/users/me/stats/timeline` endpoint reports only the caller's own
     * activity, so this fires solely for the own-profile view (never for a viewed
     * user id) and, like the stats fetch, is failure-inert: a network error leaves
     * the sparkline absent rather than surfacing an error or clobbering the profile.
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
                // Timeline is non-critical — swallow so the profile view is never broken by it.
            }
        }
    }

    /**
     * Re-seeds [user] and every editor buffer from [user]. Used whenever the state
     * is not mid-edit, so the editor always opens on the freshest identity and a
     * cancel/refresh restores it — the single place the buffer↔user mapping lives.
     */
    private fun ProfileUiState.withBuffersFrom(user: MeeshyUser?): ProfileUiState = copy(
        user = user,
        displayName = user?.displayName ?: "",
        bio = user?.bio ?: "",
        systemLanguage = user?.systemLanguage ?: "",
        regionalLanguage = user?.regionalLanguage ?: "",
        customDestinationLanguage = user?.customDestinationLanguage ?: "",
    )

    companion object {
        const val USER_ID_ARG = "userId"
    }
}
