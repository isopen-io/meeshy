package me.meeshy.sdk.model.relation

/**
 * Le niveau accordé de chaque côté du lien. `GET /relations` ne sert que le niveau COMMUN ([RelationLink.effectiveLevel], le
 * plus bas des deux accords) et le mien : l'accord de l'autre se DÉDUIT, jamais s'invente. Quand j'accorde plus que le niveau
 * commun, l'autre accorde exactement le niveau commun ; quand j'accorde le niveau commun, l'autre accorde AU MOINS celui-là
 * ([theirsAtLeast]) et le serveur n'en dit pas plus.
 */
public data class RelationGrants(
    val common: RelationLevel,
    val mine: RelationLevel,
    val theirs: RelationLevel,
    val theirsAtLeast: Boolean,
) {
    public companion object {
        public fun of(link: RelationLink): RelationGrants {
            val common = minOf(link.effectiveLevel, link.grantedByMe)
            return RelationGrants(
                common = common,
                mine = link.grantedByMe,
                theirs = common,
                theirsAtLeast = link.grantedByMe == common,
            )
        }
    }
}

/** Ce qu'il manque pour monter d'un cran : mon accord, ou celui de l'autre. */
public sealed interface OurCircleMissing {
    public data class YouMustGrant(val level: RelationLevel) : OurCircleMissing

    public data class TheyMustGrant(val level: RelationLevel) : OurCircleMissing

    public data object None : OurCircleMissing
}

/**
 * « Notre cercle » : ce que le niveau commun vous ouvre, ce que le cran suivant ajouterait (verrouillé, jamais chiffré ni
 * détaillé) et ce qui manque pour y monter. Tout se lit dans la loi d'accès ([RelationOpenings]) ; aucune liste de niveaux
 * n'est écrite ici.
 */
public data class OurCircleView(
    val grants: RelationGrants,
    val open: List<RelationFeature>,
    val next: RelationLevel?,
    val locked: List<RelationFeature>,
    val missing: OurCircleMissing,
) {
    val level: RelationLevel get() = grants.common

    public companion object {
        /** Les capacités qui se racontent entre deux personnes, dans l'ordre de la planche. */
        public val FEATURES: List<RelationFeature> = listOf(
            RelationFeature.PRESENCE_ONLINE,
            RelationFeature.PRESENCE_DETAILED,
            RelationFeature.DM_DIRECT,
            RelationFeature.BRING,
            RelationFeature.TALKIE,
            RelationFeature.TOGETHER,
            RelationFeature.LOCATION_TEMPORARY,
            RelationFeature.LOCATION_LIVE,
            RelationFeature.LOCATION_HISTORY,
            RelationFeature.LOCATION_PROXIMITY,
            RelationFeature.DEVICE_BATTERY,
            RelationFeature.DEVICE_BATTERY_PULL,
            RelationFeature.DEVICE_UNREACHABLE,
        )

        public fun of(link: RelationLink): OurCircleView {
            val grants = RelationGrants.of(link)
            val level = grants.common
            val next = RelationRequestRule.rungAfter(level)
            val open = FEATURES.filter { RelationOpenings.isOpen(level, it) && RelationOpenings.opensAt(it) > RelationLevel.COMMUNITY }
            val locked = next?.let { rung -> FEATURES.filter { RelationOpenings.opensAt(it) == rung } }.orEmpty()
            return OurCircleView(grants, open, next, locked, missing(grants, next))
        }

        private fun missing(grants: RelationGrants, next: RelationLevel?): OurCircleMissing = when {
            next == null -> OurCircleMissing.None
            grants.mine >= next -> OurCircleMissing.TheyMustGrant(next)
            else -> OurCircleMissing.YouMustGrant(next)
        }
    }
}
