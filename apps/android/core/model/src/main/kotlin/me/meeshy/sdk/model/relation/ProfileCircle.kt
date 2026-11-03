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
    /** Le cool-down servi par `GET /relations/:userId` (#14910) : tant qu'il court, Promouvoir est MASQUÉ. */
    val raiseBlocked: Boolean = false,
) {
    val level: RelationLevel get() = link.effectiveLevel

    /** Le cran que l'on peut demander maintenant ; `null` s'il est verrouillé, au sommet, déjà demandé ou en cool-down. */
    val offeredRaise: RelationLevel?
        get() = if (pending != null || raiseBlocked) null else (link.raiseOffer() as? RelationRaiseOffer.Available)?.target

    /**
     * Le cran que vise « Rétrograder » (#14910) : UN cran sous le niveau EFFECTIF ; [RelationLevel.PUBLIC] à Connaissance, ce
     * qui se lit « Annuler le lien ». Jamais sous Connaissance par ce bouton.
     */
    val lowering: RelationLevel? get() = lowerRung(level)

    /** L'instantané optimiste d'une rétrogradation : le cran visé, sans demande en attente ; `null` quand le lien s'annule. */
    public fun lowered(): ProfileCircle? {
        val target = lowering?.takeIf { it >= RelationLevel.ACQUAINTANCE } ?: return null
        val link = link.copy(effectiveLevel = target, grantedByMe = target, eligibleFor = null)
        return ProfileCircle(link = link, pending = null, raiseBlocked = raiseBlocked)
    }

    public companion object {
        private fun lowerRung(level: RelationLevel): RelationLevel? = when (level) {
            RelationLevel.BLOOD -> RelationLevel.CLOSE
            RelationLevel.CLOSE -> RelationLevel.FRIEND
            RelationLevel.FRIEND -> RelationLevel.ACQUAINTANCE
            RelationLevel.ACQUAINTANCE -> RelationLevel.PUBLIC
            RelationLevel.COMMUNITY, RelationLevel.PUBLIC -> null
        }

        /** Le cercle de [userId] parmi les liens servis, avec le cran que lui demande une de mes demandes en attente. */
        public fun of(userId: String, links: List<RelationLink>, sent: List<FriendRequest>): ProfileCircle? {
            val link = links.firstOrNull { it.userId == userId }?.takeIf { it.effectiveLevel >= RelationLevel.ACQUAINTANCE }
                ?: return null
            val pending = sent.firstOrNull { it.status == "pending" && it.receiverId == userId }?.requestedLevel
            return ProfileCircle(link, pending)
        }
    }
}
