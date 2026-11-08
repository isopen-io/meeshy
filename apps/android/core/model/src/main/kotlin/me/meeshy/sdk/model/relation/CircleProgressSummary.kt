package me.meeshy.sdk.model.relation

import me.meeshy.sdk.model.FriendRequest

/**
 * Ce que la ligne d'un lien DIT de sa progression — miroir de `CircleProgressSummary` (`CirclesPresentation.swift`, #13938).
 * Le client ne décide d'aucun niveau : il lit ce que le serveur sert (`progress`, `eligibleFor`) et ce que la loi de demande
 * lui laisse proposer.
 *
 * Ordre : ce qui MANQUE d'abord (« il manque un message audio »), puis ce qu'on PEUT demander, puis où l'on en est
 * (« Semaines d'affilée : 3 sur 4 »), puis rien.
 */
public sealed interface CircleProgressSummary {

    public enum class MissingPiece {
        MESSAGE,
        REACTION,
        POST_VIEW,
        AUDIO,
        OTHER,
        ;

        public companion object {
            public fun of(wire: String): MissingPiece = when (wire) {
                "message" -> MESSAGE
                "reaction" -> REACTION
                "postView" -> POST_VIEW
                "audio" -> AUDIO
                else -> OTHER
            }
        }
    }

    public data class Missing(val pieces: List<MissingPiece>) : CircleProgressSummary
    public data class Eligible(val target: RelationLevel) : CircleProgressSummary
    public data class Weeks(val done: Int, val needed: Int) : CircleProgressSummary
    public data object Silent : CircleProgressSummary

    public companion object {
        public fun of(link: RelationLink): CircleProgressSummary {
            if (link.progress.missing.isNotEmpty()) {
                return Missing(link.progress.missing.map { MissingPiece.of(it) }.distinct())
            }
            return when (val offer = link.raiseOffer()) {
                is RelationRaiseOffer.Available -> Eligible(offer.target)
                is RelationRaiseOffer.Locked -> {
                    val needed = link.progress.needed?.takeIf { it > 0 } ?: return Silent
                    Weeks(done = minOf(link.progress.activeWeeks, needed), needed = needed)
                }
                RelationRaiseOffer.None -> Silent
            }
        }
    }
}

/** La personne d'un lien. `GET /relations` ne sert jamais un nom (RG-07) : l'écran la nomme par ses propres caches. */
public data class CirclePerson(
    val id: String,
    val name: String,
    val username: String? = null,
    val avatarUrl: String? = null,
)

/** Une section de « Mes cercles » : un niveau et ses lignes, triées par nom. */
public data class CircleSection(val level: RelationLevel, val links: List<RelationLink>)

/**
 * La mise en page PURE de « Mes cercles » — miroir de `CirclesViewModel.sections` / `visibleLinks` (iOS) : du plus proche au
 * plus lointain, Public et Communauté ne se listent pas (ce ne sont pas des liens), une section vide n'existe pas.
 */
public object CirclesLayout {

    public val DISPLAYED_LEVELS: List<RelationLevel> =
        listOf(RelationLevel.BLOOD, RelationLevel.CLOSE, RelationLevel.FRIEND, RelationLevel.ACQUAINTANCE)

    public fun visible(links: List<RelationLink>): List<RelationLink> =
        links.filter { it.effectiveLevel >= RelationLevel.ACQUAINTANCE }

    public fun sections(links: List<RelationLink>, people: Map<String, CirclePerson>): List<CircleSection> {
        val visible = visible(links)
        return DISPLAYED_LEVELS.mapNotNull { level ->
            val rows = visible
                .filter { it.effectiveLevel == level }
                .sortedBy { sortKey(it, people) }
            if (rows.isEmpty()) null else CircleSection(level, rows)
        }
    }

    /** Les demandes de montée qui concernent un lien listé, encore en attente — reçues ([incoming]) ou envoyées. */
    public fun raises(requests: List<FriendRequest>, links: List<RelationLink>, incoming: Boolean): List<FriendRequest> {
        val linked = visible(links).map { it.userId }.toSet()
        return requests.filter { request ->
            val other = if (incoming) request.senderId else request.receiverId
            request.status == "pending" && other in linked
        }
    }

    private fun sortKey(link: RelationLink, people: Map<String, CirclePerson>): String =
        (people[link.userId]?.name ?: "￿").lowercase() + link.userId
}

/**
 * Ce qu'une fiche de lien laisse régler pour CETTE personne, selon ce que le cercle ouvre (spec § 1.3, § 1.5) — miroir de
 * `CirclePersonSetting` (iOS). Le Bring est disponible par défaut dès Ami (D-3) : son réglage est un BLOCAGE. Le talkie
 * et l'écoute s'ouvrent à Proche, la position continue au Sang. Une Connaissance n'a rien à régler.
 */
public enum class CirclePersonSetting(public val opensAt: RelationLevel) {
    BLOCK_BRING(RelationLevel.FRIEND),
    TALKIE(RelationLevel.CLOSE),
    LISTENING(RelationLevel.CLOSE),
    LIVE_LOCATION(RelationLevel.BLOOD),
    ;

    /** La préférence de RÉCEPTION que ce réglage pose (livrée), `null` pour ceux qui arrivent avec leur lot. */
    public val reception: RelationReceptionSetting?
        get() = when (this) {
            BLOCK_BRING -> RelationReceptionSetting.BRING
            TALKIE -> RelationReceptionSetting.TALKIE
            LISTENING, LIVE_LOCATION -> null
        }

    public companion object {
        public fun offered(level: RelationLevel): List<CirclePersonSetting> = entries.filter { level >= it.opensAt }

        /** Les blocages de réception ouverts à ce niveau d'outils (#16643) : le Bring dès Ami, le talkie dès Proche. */
        public fun receptionAt(level: RelationLevel): List<RelationReceptionSetting> = offered(level).mapNotNull { it.reception }
    }
}
