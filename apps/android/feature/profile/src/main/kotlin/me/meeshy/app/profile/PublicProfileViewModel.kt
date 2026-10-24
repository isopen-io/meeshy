package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** L'etat de la page d'un TIERS : sa fiche, son chargement et ses statistiques. */
@Immutable
data class PublicProfileUiState(
    val user: MeeshyUser? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val stats: UserStatsPresentation? = null,
)

/**
 * La page d'un tiers, `profile/{userId}` (id ou pseudo, transmis tel quel a
 * `UserApi.getPerson`). Comportement herite de l'ancien `ProfileViewModel`, branche
 * tiers, conserve jusqu'a la feuille profil (profile-sheet-shell). Une cible qui
 * designe la session n'arrive jamais ici : la destination la route vers ma page
 * (regle unique `ProfileRoutes.profileFor`, :app).
 */
@HiltViewModel
class PublicProfileViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val statsCache: ProfileStatsCacheRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = savedStateHandle.get<String>(USER_ID_ARG).orEmpty()

    private val _state = MutableStateFlow(PublicProfileUiState())
    val state: StateFlow<PublicProfileUiState> = _state.asStateFlow()

    private var statsLoadedForId: String? = null

    init {
        if (userId.isNotBlank()) loadProfile(userId)
    }

    private fun loadProfile(id: String) {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            try {
                when (val result = userRepository.getProfile(id)) {
                    is NetworkResult.Success -> {
                        val user = result.data
                        _state.update { it.copy(isLoading = false, user = user) }
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
     * Fetches and projects the viewed user's stats exactly once per resolved id,
     * cache first. Failure-inert: the dashboard simply stays empty.
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

    companion object {
        const val USER_ID_ARG = "userId"
    }
}
