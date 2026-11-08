package me.meeshy.app.stories

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.story.StoryGroupIntro
import me.meeshy.sdk.model.story.StoryGroupIntroPolicy
import me.meeshy.sdk.socket.PresenceStore

/**
 * Le porteur de l'interlude d'identité (iOS `StoryGroupIntroPresenter` + `resolveGroupIntro`) : les identités déjà
 * résolues (voisins pré-résolus pendant la lecture, ou l'identité en cours d'affichage), l'amitié et la présence
 * lues AU changement de groupe. Un contrôleur propre : il n'ajoute aucun champ à l'état du lecteur.
 */
@HiltViewModel
class StoryGroupIntroViewModel @Inject constructor(
    private val resolver: StoryGroupIntroResolver,
    private val friends: FriendshipCache,
    private val presence: PresenceStore,
    private val clock: CacheClock,
) : ViewModel() {
    private val resolved = ConcurrentHashMap<String, StoryGroupIntro>()

    /** L'identité complète si elle est déjà en main, sinon le substitut immédiat (jamais d'attente avant d'afficher). */
    fun immediate(group: StoryGroupSlides): StoryGroupIntro =
        resolved[group.userId] ?: StoryGroupIntro.placeholder(group.userId, group.authorName)

    /** L'identité du voisin SEULEMENT si elle est déjà résolue : la face de cube n'invente jamais un visage vide. */
    fun resolvedOrNull(group: StoryGroupSlides): StoryGroupIntro? = resolved[group.userId]

    suspend fun resolve(group: StoryGroupSlides): StoryGroupIntro =
        resolved[group.userId] ?: resolver.resolve(group.userId, group.authorName).also { resolved[group.userId] = it }

    /** Pré-résout les groupes voisins pas encore connus : au changement, l'interlude est complet dès sa première image. */
    suspend fun prefetch(groups: List<StoryGroupSlides>) {
        groups.filter { !resolved.containsKey(it.userId) }.forEach { resolve(it) }
    }

    /** Présence AU changement : la carte temps réel d'abord (la plus fraîche), sinon celle servie avec les stories. */
    fun presenceDetail(group: StoryGroupSlides): PresenceState? {
        val served: UserPresence? = presence.entriesNow()[group.userId] ?: group.authorPresence
        return StoryGroupIntroPolicy.presenceDetail(
            isFriend = friends.isFriend(group.userId),
            presence = served,
            nowEpochMillis = clock.nowMillis(),
        )
    }
}
