package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.FriendRequest

/**
 * Le cercle sur le profil d'un Ami ou d'un Proche (#13940) — miroir de `ProfileCircleViewModel` (iOS) : le niveau COMMUN que
 * `GET /relations` sert à l'appelant (donc visible des deux seuls), ce qui manque pour monter, et le cran déjà demandé.
 *
 * **Rien n'est fabriqué** : sans lien servi pour cette personne, ou sous Connaissance, il n'y a pas de cercle et le profil
 * garde son badge d'avant.
 */
public data class ProfileCircle(
    val link: RelationLink,
    /** Le cran que j'ai demandé et qui attend sa réponse ; `null` sinon. */
    val pending: RelationLevel? = null,
) {
    val level: RelationLevel get() = link.effectiveLevel

    /** Le cran que l'on peut demander maintenant ; `null` s'il est verrouillé, au sommet, ou déjà demandé. */
    val offeredRaise: RelationLevel?
        get() = if (pending != null) null else (link.raiseOffer() as? RelationRaiseOffer.Available)?.target

    public companion object {
        /** Le cercle de [userId] parmi les liens servis, avec le cran que lui demande une de mes demandes en attente. */
        public fun of(userId: String, links: List<RelationLink>, sent: List<FriendRequest>): ProfileCircle? {
            val link = links.firstOrNull { it.userId == userId }?.takeIf { it.effectiveLevel >= RelationLevel.ACQUAINTANCE }
                ?: return null
            val pending = sent.firstOrNull { it.status == "pending" && it.receiverId == userId }?.requestedLevel
            return ProfileCircle(link, pending)
        }
    }
}
