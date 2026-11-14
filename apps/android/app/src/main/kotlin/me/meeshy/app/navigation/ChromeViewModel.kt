package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.InMemoryGameDevicePrefsStore
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.game.GameActsRing
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.notification.UnreadBadgeCoordinator
import me.meeshy.sdk.notification.observeNotificationSync
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

/**
 * Donnees reelles du chrome flottant (echelle + bouton avatar) : identite,
 * notifications non lues, demandes d'amitie en attente.
 *
 * [FriendshipCache] et [NotificationRepository.unreadCountStream] sont deja les
 * compteurs corrects, mais aucun des deux n'est amorce avant que l'ecran
 * correspondant ait ete ouvert au moins une fois dans la session — [warmUpIfAuthenticated]
 * les hydrate une seule fois par session authentifiee, jamais avant (pour ne
 * jamais taper l'API non authentifie depuis l'ecran de login) — et se re-arme des
 * qu'une deconnexion est observee, pour qu'un second compte, dans le MEME
 * processus, reamorce ces DEUX singletons plutot que d'en heriter les valeurs.
 *
 * [observeNotificationSync] runs from here too, unconditionally in [init] rather
 * than gated by [warmUpIfAuthenticated]: this ViewModel is app-scoped (unlike
 * `NotificationsViewModel`, torn down with its own screen), so it is the one
 * place that keeps [NotificationRepository]'s cache — and the badge above —
 * moving off-screen. `MessageSocketManager`'s notification flows are
 * `SharedFlow`s with `replay = 0`, so a collector scoped to a single screen
 * misses every event that arrives while that screen is closed.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ChromeViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val notificationRepository: NotificationRepository,
    private val friendRepository: FriendRepository,
    private val friendshipCache: FriendshipCache,
    messageSocketManager: MessageSocketManager,
    private val config: MeeshyConfig,
    private val unreadBadge: UnreadBadgeCoordinator,
    private val engagement: EngagementProgressRepository,
    private val gamePrefs: GameDevicePrefsStore = InMemoryGameDevicePrefsStore(),
) : ViewModel() {

    val currentUser: StateFlow<MeeshyUser?> = sessionRepository.currentUser

    /** The chrome avatar's loadable address — the stored key resolved against the API base. */
    fun avatarModel(user: MeeshyUser?): String? = chromeAvatarModel(user?.avatar, config.apiBaseUrl)

    /** La cloche et la pastille lisent le MEME etat du coordinateur que les widgets et le nombre d'icone. */
    val unreadNotifications: StateFlow<Int> = unreadBadge.state
        .map { it.bell }
        .stateIn(viewModelScope, SharingStarted.Eagerly, unreadBadge.state.value.bell)

    val unreadMessages: StateFlow<Int> = unreadBadge.state
        .map { it.total }
        .stateIn(viewModelScope, SharingStarted.Eagerly, unreadBadge.state.value.total)

    /** « Jeu masque » : le barreau du jeu quitte l'echelle (#17769), comme le bandeau quitte l'ecran. */
    val gameHidden: StateFlow<Boolean> = gamePrefs.prefs
        .map { it.hidden }
        .stateIn(viewModelScope, SharingStarted.Eagerly, gamePrefs.current().hidden)

    val pendingFriendRequests: StateFlow<Int> = friendshipCache.version
        .map { friendshipCache.pendingReceivedCount }
        .stateIn(viewModelScope, SharingStarted.Eagerly, friendshipCache.pendingReceivedCount)

    private val authenticated = MutableStateFlow(false)

    /**
     * L'anneau des actes du jour autour du disque du menu (#17768), lu dans le bloc `game` du cache de la progression —
     * la clé de « Ma Légende ». Cache d'abord, revalidé en silence quand il est périmé : Android n'a pas de bandeau du
     * joueur qui le tienne à jour comme sur iOS et le web. Rien avant l'authentification, rien sous « Jeu masqué ».
     */
    val actsRing: StateFlow<GameActsRing?> = combine(authenticated, gameHidden) { signedIn, hidden -> signedIn && !hidden }
        .distinctUntilChanged()
        .flatMapLatest { shown ->
            if (!shown) flowOf(null) else engagement.progress().map { GameActsRing.of(it.valueOrNull?.game, hidden = false) }
        }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private var warmedUp = false

    init {
        viewModelScope.observeNotificationSync(notificationRepository, messageSocketManager)
    }

    fun warmUpIfAuthenticated(isAuthenticated: Boolean) {
        authenticated.value = isAuthenticated
        if (!isAuthenticated) {
            warmedUp = false
            return
        }
        if (warmedUp) return
        warmedUp = true
        notificationRepository.notificationsStream(onSyncError = {}).launchIn(viewModelScope)
        viewModelScope.launch {
            friendshipCache.hydrateCoalesced(fetch = {
                friendRepository.friendshipGraph(sessionRepository.currentUserId.orEmpty()).getOrNull()
            })
        }
    }
}
