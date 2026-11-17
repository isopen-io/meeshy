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
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.network.NetworkMonitor
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
    val isOffline: Boolean = false,
) {
    /** Hors ligne sur une fiche peinte : la capsule dit que c'est la dernière version gardée, rien ne se vide. */
    val showsOfflineCapsule: Boolean get() = isOffline && profile != null && !isBlockedByTarget

    /** « Réessayer » n'est offert qu'à une panne : un refus (bloqué par la cible) ne se rejoue pas. */
    val canRetry: Boolean get() = loadFailed && !isBlockedByTarget

    /** Gris neutre quand la cible nous bloque, sinon l'accent déjà dérivé de la fiche. */
    val accentHex: String get() = ProfileAccentRules.accentHex(isBlockedByTarget, user.accentColor)

    /**
     * Ce que la feuille peint : un squelette sur cache vide, jamais un spinner sur un contenu peint. Un profil
     * introuvable, privé ou qui nous a bloqués se confondent en « Personne ici » : rien ne dit pourquoi.
     */
    val content: ProfileSheetContent get() = when {
        isBlockedByTarget -> ProfileSheetContent.Nobody
        profile != null -> ProfileSheetContent.Loaded
        isLoadingProfile -> ProfileSheetContent.Skeleton
        loadFailed -> ProfileSheetContent.Failed
        else -> ProfileSheetContent.Nobody
    }
}

/** Les façons dont la feuille se présente. */
enum class ProfileSheetContent {
    /** Cache vide, synchronisation en cours : en-tête et onglets en squelette. */
    Skeleton,

    /** Panne sur cache vide : « Impossible d'ouvrir cette fiche » et Réessayer. */
    Failed,

    /** « Personne ici » : introuvable, privé ou bloqué par la cible, sans le dire, avec Retour. */
    Nobody,

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
    private val networkMonitor: NetworkMonitor = InMemoryNetworkMonitor(),
) : ViewModel() {

    private val _state = MutableStateFlow(UserProfileSheetUiState(isOffline = !networkMonitor.isOnline.value))
    val state: StateFlow<UserProfileSheetUiState> = _state.asStateFlow()

    private var load = ProfileLoadState()
    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            networkMonitor.isOnline.collect { online -> _state.update { it.copy(isOffline = !online) } }
        }
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
            val base = if (retry || samePerson) shown else UserProfileSheetUiState(isOffline = shown.isOffline)
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
