package me.meeshy.sdk.engagement

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.KnownViewerPoints
import me.meeshy.sdk.model.PostEngagementSnapshot
import me.meeshy.sdk.model.PostViewerPoints
import me.meeshy.sdk.session.PerAccountCache

/**
 * `viewerPoints` par post, pour la marque « · ✦+N » de la carte et de la fiche (#9571, iOS `PostViewerPointsStore`).
 *
 * Deux chemins l'alimentent : les LECTURES (`ApiPost.viewerPoints`, notées par la carte qui l'affiche) et
 * les ANNONCES `engagement:post-updated`. La loi est [PostViewerPoints.kept] : l'annonce la plus récente
 * gagne — jamais une valeur plus ancienne que la plus récente connue —, une lecture s'applique et garde
 * l'instant connu. Une lecture déjà vue (re-notée par une carte qui réapparaît) ne défait pas une
 * annonce plus récente. Au-delà de [PostViewerPoints.MAX_TRACKED_POSTS] posts, le suivi repart de zéro.
 * Propre au compte connecté : vidé à la déconnexion.
 */
@Singleton
class PostViewerPointsStore @Inject constructor() : PerAccountCache {

    private data class Held(val known: Map<String, KnownViewerPoints> = emptyMap(), val lastRead: Map<String, Int> = emptyMap())

    private val held = MutableStateFlow(Held())

    /** Le nombre de posts dont une valeur est connue (le plafond se mesure ici). */
    val trackedCount: Int get() = held.value.known.size

    /** Les points à montrer pour [postId], la lecture [seed] comprise ; `null` : aucune valeur connue. */
    fun displayed(postId: String, seed: Int?): Int? = displayed(held.value, postId, seed)

    /** Le flux des points à montrer pour [postId] ; une lecture neuve gagne, une annonce roule le nombre. */
    fun displayedFlow(postId: String, seed: Int?): Flow<Int?> =
        held.map { displayed(it, postId, seed) }.distinctUntilChanged()

    fun noteRead(postId: String, viewerPoints: Int?) {
        if (postId.isEmpty() || viewerPoints == null) return
        held.update { current ->
            if (current.lastRead[postId] == viewerPoints) return@update current
            val room = makeRoom(current)
            room.copy(
                known = room.known + (postId to checkNotNull(PostViewerPoints.kept(room.known[postId], viewerPoints, null))),
                lastRead = room.lastRead + (postId to viewerPoints),
            )
        }
    }

    fun noteAnnouncement(snapshot: PostEngagementSnapshot) {
        held.update { current ->
            val next = PostViewerPoints.kept(current.known[snapshot.postId], snapshot.viewerPoints, snapshot.at)
            if (next == null || next == current.known[snapshot.postId]) return@update current
            val room = makeRoom(current)
            room.copy(known = room.known + (snapshot.postId to next))
        }
    }

    fun reset() {
        held.update { if (it.known.isEmpty() && it.lastRead.isEmpty()) it else Held() }
    }

    override suspend fun clear() = reset()

    private fun displayed(state: Held, postId: String, seed: Int?): Int? {
        if (seed != null && seed != state.lastRead[postId]) return seed
        return state.known[postId]?.viewerPoints ?: seed
    }

    private fun makeRoom(current: Held): Held =
        if (current.known.size > PostViewerPoints.MAX_TRACKED_POSTS || current.lastRead.size > PostViewerPoints.MAX_TRACKED_POSTS) Held() else current
}
