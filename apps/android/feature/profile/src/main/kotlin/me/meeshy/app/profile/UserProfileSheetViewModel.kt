package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.profile.ProfileAccentRules
import me.meeshy.sdk.model.profile.ProfileLoadEvent
import me.meeshy.sdk.model.profile.ProfileLoadReducer
import me.meeshy.sdk.model.profile.ProfileLoadState
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.from
import me.meeshy.sdk.model.profile.repainted
import me.meeshy.sdk.profile.ProfileCacheRepository
import me.meeshy.sdk.profile.ProfileSheetLoader
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Ce que la fiche affiche : une projection mince de [ProfileLoadState]. */
@Immutable
data class UserProfileSheetUiState(
    val user: ProfileSheetUser = ProfileSheetUser(username = ""),
    val profile: MeeshyUser? = null,
    val stats: UserStats? = null,
    val isLoadingProfile: Boolean = false,
    val isLoadingStats: Boolean = false,
    val isBlockedByTarget: Boolean = false,
    val loadFailed: Boolean = false,
) {
    /** « Réessayer » n'est offert qu'à une panne : un refus (bloqué par la cible) ne se rejoue pas. */
    val canRetry: Boolean get() = loadFailed && !isBlockedByTarget

    /** Gris neutre quand la cible nous bloque, sinon l'accent déjà dérivé de la fiche. */
    val accentHex: String get() = ProfileAccentRules.accentHex(isBlockedByTarget, user.accentColor)
}

sealed interface UserProfileSheetEvent {
    data class Open(val user: ProfileSheetUser) : UserProfileSheetEvent
    data object Retry : UserProfileSheetEvent
}

@HiltViewModel
class UserProfileSheetViewModel @Inject constructor(
    private val loader: ProfileSheetLoader,
    private val cache: ProfileCacheRepository,
    socket: MessageSocketManager,
) : ViewModel() {

    private val _state = MutableStateFlow(UserProfileSheetUiState())
    val state: StateFlow<UserProfileSheetUiState> = _state.asStateFlow()

    private var load = ProfileLoadState()
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            try {
                socket.userUpdated.collect { event ->
                    try {
                        repaint(event)
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (_: Exception) {
                        // une repeinture manquée n'ôte rien de la fiche peinte
                    }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // l'écoute s'arrête, la fiche reste lisible
            }
        }
    }

    fun onEvent(event: UserProfileSheetEvent) {
        when (event) {
            is UserProfileSheetEvent.Open -> open(event.user, retry = false)
            UserProfileSheetEvent.Retry -> if (_state.value.canRetry) open(_state.value.user, retry = true)
        }
    }

    private fun open(user: ProfileSheetUser, retry: Boolean) {
        val accented = user.copy(accentColor = user.accentColor.ifEmpty { derivedAccent(user) })
        if (!retry && accented == _state.value.user && loadJob?.isActive == true) return
        loadJob?.cancel()
        if (!retry) load = ProfileLoadState()
        _state.update { it.copy(user = accented) }
        loadJob = viewModelScope.launch {
            loader.open(accented.userId, accented.username, retry).collect { next ->
                load = next
                publish()
            }
        }
    }

    private fun repaint(event: UserUpdatedEvent) {
        val current = load.profile ?: return
        val repainted = event.repainted(current) ?: return
        load = ProfileLoadReducer.reduce(load, ProfileLoadEvent.Repainted(repainted))
        publish()
        viewModelScope.launch { cache.repaint(event) }
    }

    private fun publish() {
        _state.update { shown ->
            val profile = load.profile
            val user = if (profile != null && shown.user.userId == null) {
                ProfileSheetUser.from(profile, accentColor = shown.user.accentColor)
            } else {
                shown.user
            }
            shown.copy(
                user = user,
                profile = profile,
                stats = load.stats,
                isLoadingProfile = load.isLoadingProfile,
                isLoadingStats = load.isLoadingStats,
                isBlockedByTarget = load.isBlockedByTarget,
                loadFailed = load.profileLoadFailed,
            )
        }
    }

    private fun derivedAccent(user: ProfileSheetUser): String =
        DynamicColorGenerator.profileAccentHex(user.userId, user.username)
}
