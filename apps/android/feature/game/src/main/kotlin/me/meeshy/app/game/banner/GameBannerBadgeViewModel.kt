package me.meeshy.app.game.banner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.UserGameRepository
import me.meeshy.sdk.model.game.GameBannerBadge

/**
 * **Le niveau et le rang d'un autre membre, lus pour sa bannière** (miroir de `GameBannerBadge`, iOS) : le cache d'abord —
 * l'écran s'y peint avant la lecture —, la lecture servie ensuite, qui REMPLACE tout (un refus efface le badge). Rien sous
 * « Jeu masqué », rien d'un autre membre que celui demandé : passer d'un membre à un autre ne laisse pas le niveau du
 * précédent sous le nom du suivant.
 */
@HiltViewModel
class GameBannerBadgeViewModel @Inject constructor(
    private val repository: UserGameRepository,
    prefs: GameDevicePrefsStore,
) : ViewModel() {

    private val badges = MutableStateFlow<Map<String, GameBannerBadge?>>(emptyMap())
    private val loading = mutableSetOf<String>()

    private val hidden: StateFlow<Boolean> =
        prefs.prefs.map { it.hidden }.distinctUntilChanged().stateIn(viewModelScope, SharingStarted.Eagerly, prefs.current().hidden)

    /** Ce qui se peint pour [userId] : rien sous « Jeu masqué », rien tant que le serveur n'a rien servi à montrer. */
    fun observe(userId: String): Flow<GameBannerBadge?> =
        combine(badges, hidden) { read, isHidden -> GameBannerBadge.shown(read[userId], userId, isHidden) }.distinctUntilChanged()

    /** Lit le membre : le disque, puis le réseau. Une lecture déjà en cours pour lui n'est pas doublée (niveau et rang l'appellent tous deux). */
    fun ensureLoaded(userId: String) {
        if (hidden.value || !loading.add(userId)) return
        viewModelScope.launch {
            try {
                if (badges.value[userId] == null) {
                    GameBannerBadge.of(repository.cached(userId), userId)?.let { cached -> badges.update { it + (userId to cached) } }
                }
                val fresh = GameBannerBadge.of(repository.load(userId), userId)
                badges.update { it + (userId to fresh) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Une lecture qui échoue laisse ce qui est peint : jamais un badge inventé, jamais un écran vidé.
            } finally {
                loading.remove(userId)
            }
        }
    }
}
