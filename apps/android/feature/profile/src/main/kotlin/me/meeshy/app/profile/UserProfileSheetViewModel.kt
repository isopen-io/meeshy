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
import me.meeshy.sdk.model.profile.ProfileSelfRule
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.from
import me.meeshy.sdk.model.profile.repainted
import me.meeshy.sdk.profile.ProfileCacheRepository
import me.meeshy.sdk.profile.ProfileSheetLoader
import me.meeshy.sdk.session.SessionRepository
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
    val isSelf: Boolean = false,
) {
    /** « Réessayer » n'est offert qu'à une panne : un refus (bloqué par la cible) ne se rejoue pas. */
    val canRetry: Boolean get() = loadFailed && !isBlockedByTarget

    /** Gris neutre quand la cible nous bloque, sinon l'accent déjà dérivé de la fiche. */
    val accentHex: String get() = ProfileAccentRules.accentHex(isBlockedByTarget, user.accentColor)

    /** Ce que la feuille peint : un squelette sur cache vide, jamais un spinner sur un contenu peint. */
    val content: ProfileSheetContent get() = when {
        isBlockedByTarget -> ProfileSheetContent.Close
        profile != null -> ProfileSheetContent.Loaded
        isLoadingProfile -> ProfileSheetContent.Skeleton
        loadFailed -> ProfileSheetContent.Failed
        else -> ProfileSheetContent.Refused
    }
}

/** Les quatre façons dont la feuille se présente, plus sa fermeture d'elle-même. */
enum class ProfileSheetContent {
    /** Cache vide, synchronisation en cours : en-tête et onglets en squelette. */
    Skeleton,

    /** Panne sur cache vide : « Ce profil n'a pas pu se charger. » et Réessayer. */
    Failed,

    /** Refus typé de la passerelle : le même message, sans Réessayer (rejouer ne changerait rien). */
    Refused,

    /** La cible m'a bloqué (403, ou 404 sur fiche peinte) : la feuille se ferme d'elle-même. */
    Close,

    /** Un profil est peint, du cache ou du réseau. */
    Loaded,
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
    private val session: SessionRepository,
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
        val accented = if (retry) user else user.copy(accentColor = derivedAccent(user))
        if (!retry && accented == _state.value.user && loadJob?.isActive == true) return
        loadJob?.cancel()
        if (!retry) load = ProfileLoadState()
        _state.update { shown ->
            val samePerson = accented.id.isNotEmpty() && accented.id == shown.user.id
            val base = if (retry || samePerson) shown else UserProfileSheetUiState()
            base.copy(
                user = accented,
                isLoadingProfile = base.profile == null,
                loadFailed = false,
                isBlockedByTarget = false,
                isSelf = isSelf(accented),
            )
        }
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
                isSelf = isSelf(user),
            )
        }
    }

    /** La couleur du PROFIL, jamais celle de l'écran d'où la fiche s'ouvre (miroir de `profileAccent` iOS). */
    private fun derivedAccent(user: ProfileSheetUser): String =
        DynamicColorGenerator.profileAccentHex(user.userId, user.resolvedDisplayName)

    /** « C'est moi » par id OU par pseudo : la feuille n'offre alors aucune action. */
    private fun isSelf(user: ProfileSheetUser): Boolean = ProfileSelfRule.isSelf(
        sessionUserId = session.currentUserId,
        sessionUsername = session.currentUser.value?.username,
        user = user,
    )
}
