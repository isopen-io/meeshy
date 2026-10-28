package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia

/** Un média déjà téléversé (id serveur) et sa description : ce qui voyage d'un format à l'autre, sans re-téléversement. */
data class CarriedMedia(val media: UploadedMedia, val alt: String? = null)

/**
 * Ce que la bascule demande à la surface d'ARRIVÉE : les médias à poser, ceux à retirer (déjà portés puis retirés
 * à la source), les descriptions qui suivent, l'audience, et ce qui n'a pas pu suivre ([leftBehind]).
 * [synced] est le registre d'après : les ids présents des deux côtés.
 */
data class MediaTransferPlan(
    val add: List<CarriedMedia>,
    val remove: Set<String>,
    val alts: Map<String, String>,
    val leftBehind: Int,
    val synced: Set<String>,
) {
    val isEmpty: Boolean get() = add.isEmpty() && remove.isEmpty() && alts.isEmpty()
}

/**
 * Le document est UN : à la bascule, les médias de la surface quittée deviennent ceux de la surface d'arrivée
 * (port de `documentMediaObjectIdBySource` de l'hôte iOS). La source fait foi sur ce qu'elle porte ; un média
 * porté puis retiré à la source est retiré de l'arrivée (le [ledger] s'en souvient) ; un média propre à
 * l'arrivée (jamais porté) n'est JAMAIS touché. Au-delà de la capacité, le surplus reste derrière, dit ; un
 * média encore en file hors ligne (`cmid_…`, sans id serveur) ne voyage jamais : il reste derrière, compté.
 */
object ComposerMediaTransfer {
    fun plan(
        source: List<CarriedMedia>,
        targetIds: List<String>,
        ledger: Set<String>,
        room: Int,
        sourceLeftBehind: Int = 0,
    ): MediaTransferPlan {
        val (offline, distinct) = source.distinctBy { it.media.id }
            .partition { it.media.id.startsWith(ClientIdFormat.CMID_PREFIX) }
        val sourceIds = distinct.map { it.media.id }.toSet()
        val remove = (ledger - sourceIds).intersect(targetIds.toSet())
        val kept = targetIds.filterNot { it in remove }.toSet()
        val missing = distinct.filter { it.media.id !in kept }
        val freed = room + remove.size
        val add = missing.take(freed.coerceAtLeast(0))
        val present = kept + add.map { it.media.id }
        val synced = sourceIds.intersect(present)
        val alts = distinct
            .filter { it.media.id in present && !it.alt.isNullOrBlank() }
            .associate { it.media.id to requireNotNull(it.alt) }
        return MediaTransferPlan(
            add = add,
            remove = remove,
            alts = alts,
            leftBehind = missing.size - add.size + offline.size + sourceLeftBehind,
            synced = synced,
        )
    }
}

/**
 * L'audience suit la bascule : la story sait dire toutes celles d'un post ; un post ne sait dire ni COMMUNITY, ni
 * ONLY, ni EXCEPT, et une audience qu'il ne sait pas dire n'est JAMAIS élargie en silence — elle se resserre sur
 * PRIVATE (l'auteur seul), que le sélecteur du post montre. iOS garde la même audience aux deux surfaces.
 */
object ComposerAudienceCarry {
    private val POST_WIRE = mapOf(
        StoryVisibility.PUBLIC to "PUBLIC",
        StoryVisibility.FRIENDS to "FRIENDS",
        StoryVisibility.PRIVATE to "PRIVATE",
    )

    /** La valeur d'un post pour [visibility], ou `null` : un post n'a ni COMMUNITY, ni ONLY, ni EXCEPT. */
    fun postWire(visibility: StoryVisibility): String? = POST_WIRE[visibility]

    fun fromPostWire(wire: String): StoryVisibility? = POST_WIRE.entries.firstOrNull { it.value == wire }?.key

    /** L'audience que reçoit la surface d'arrivée : la même, ou la plus étroite qu'un post sait dire. */
    fun arrival(source: StoryVisibility, toScene: Boolean): StoryVisibility =
        if (toScene || postWire(source) != null) source else StoryVisibility.PRIVATE
}
