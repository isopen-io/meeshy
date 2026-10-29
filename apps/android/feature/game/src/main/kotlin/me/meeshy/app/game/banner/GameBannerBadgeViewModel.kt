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
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket

/**
 * **Le niveau et le rang d'un autre membre, lus pour sa bannière** (miroir de `GameBannerBadge`, iOS) : le cache d'abord —
 * l'écran s'y peint avant la lecture —, la lecture servie ensuite, qui REMPLACE tout (un refus efface le badge). Rien sous
 * « Jeu masqué », rien d'un autre membre que celui demandé : passer d'un membre à un autre ne laisse pas le niveau du
 * précédent sous le nom du suivant.
 *
 * Les lectures appartiennent au COMPTE qui les a faites ([AccountFence]) : ce modèle vit au niveau de l'activité (la fiche
 * profil se pose par-dessus le `NavHost`) et survit donc à un changement de compte. Ce qu'un ami voyait (étincelles,
 * Gloire) ne se peint jamais sous le compte suivant, et une lecture partie sous l'ancien compte n'est pas posée.
 */
@HiltViewModel
class GameBannerBadgeViewModel @Inject constructor(
    private val repository: UserGameRepository,
    prefs: GameDevicePrefsStore,
    private val fence: AccountFence,
) : ViewModel() {

    private data class Reads(val ticket: AccountTicket, val badges: Map<String, GameBannerBadge?> = emptyMap())

    private val reads = MutableStateFlow(Reads(fence.ticket()))
    private val loading = mutableSetOf<Pair<AccountTicket, String>>()

    private val hidden: StateFlow<Boolean> =
        prefs.prefs.map { it.hidden }.distinctUntilChanged().stateIn(viewModelScope, SharingStarted.Eagerly, prefs.current().hidden)

    /** Ce qui se peint pour [userId] : rien sous « Jeu masqué », rien tant que le serveur n'a rien servi à montrer. */
    fun observe(userId: String): Flow<GameBannerBadge?> =
        combine(reads, hidden) { read, isHidden ->
            GameBannerBadge.shown(read.badges[userId]?.takeIf { fence.isCurrent(read.ticket) }, userId, isHidden)
        }.distinctUntilChanged()

    /** Lit le membre : le disque, puis le réseau. Une lecture déjà en cours pour lui n'est pas doublée (niveau et rang l'appellent tous deux). */
    fun ensureLoaded(userId: String) {
        if (hidden.value) return
        val ticket = fence.ticket()
        reads.update { if (it.ticket == ticket) it else Reads(ticket) }
        val request = ticket to userId
        if (!loading.add(request)) return
        viewModelScope.launch {
            try {
                if (reads.value.badges[userId] == null) {
                    GameBannerBadge.of(repository.cached(userId), userId)?.let { cached -> record(ticket, userId, cached) }
                }
                record(ticket, userId, GameBannerBadge.of(repository.load(userId), userId))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Une lecture qui échoue laisse ce qui est peint : jamais un badge inventé, jamais un écran vidé.
            } finally {
                loading.remove(request)
            }
        }
    }

    /** Pose une lecture seulement pour le compte qui l'a faite, tant qu'il est encore le compte ouvert. */
    private fun record(ticket: AccountTicket, userId: String, badge: GameBannerBadge?) {
        if (!fence.isCurrent(ticket)) return
        reads.update { if (it.ticket == ticket) it.copy(badges = it.badges + (userId to badge)) else it }
    }
}
