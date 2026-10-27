package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryVisibility

/**
 * Une mention est-elle SERVIE par l'audience choisie ? Miroir de `ComposerAudienceReach` (iOS).
 *
 * Ne répond que là où le client SAIT : `ONLY` / `EXCEPT` portent leur liste, `PRIVATE` ne sert
 * personne. Pour `PUBLIC`, `FRIENDS`, `COMMUNITY` le graphe est inconnu : un avertissement FAUX
 * apprend à l'auteur à ignorer l'écran, donc on se tait ([UNKNOWN]).
 */
enum class ComposerAudienceReach {
    REACHES,
    EXCLUDED,
    UNKNOWN,
    ;

    /** On ne peint un avertissement que sur une exclusion CERTAINE. */
    val warns: Boolean get() = this == EXCLUDED

    companion object {
        fun resolve(
            mentionUserId: String?,
            visibility: StoryVisibility,
            audienceUserIds: List<String>,
        ): ComposerAudienceReach = when (visibility) {
            StoryVisibility.PRIVATE -> EXCLUDED
            StoryVisibility.ONLY -> mentionUserId?.let { if (it in audienceUserIds) REACHES else EXCLUDED } ?: UNKNOWN
            StoryVisibility.EXCEPT -> mentionUserId?.let { if (it in audienceUserIds) EXCLUDED else REACHES } ?: UNKNOWN
            StoryVisibility.PUBLIC, StoryVisibility.COMMUNITY, StoryVisibility.FRIENDS -> UNKNOWN
        }
    }
}

/**
 * Ce que la ligne d'une audience DIT sous son nom. Le client ne tient un effectif que pour les
 * audiences NOMMÉES ; ailleurs il décrit la règle — « Public (0) » serait une erreur apparente.
 */
object ComposerAudienceSubtitle {
    enum class Kind { PUBLIC, COMMUNITY, FRIENDS, PRIVATE, PICK, COUNT }

    fun of(visibility: StoryVisibility, selectedCount: Int): Kind = when (visibility) {
        StoryVisibility.PUBLIC -> Kind.PUBLIC
        StoryVisibility.COMMUNITY -> Kind.COMMUNITY
        StoryVisibility.FRIENDS -> Kind.FRIENDS
        StoryVisibility.PRIVATE -> Kind.PRIVATE
        StoryVisibility.ONLY, StoryVisibility.EXCEPT -> if (selectedCount > 0) Kind.COUNT else Kind.PICK
    }
}

/**
 * Les lois de la liste « visible par » / « sauf ». Rien d'autre qu'un ami autorisé n'y entre
 * (ni bloqué, ni soi, ni un identifiant sorti d'un brouillon périmé), et elle ne part sur le
 * fil que sous `ONLY` / `EXCEPT` : une liste orpheline sous un autre mode serait une fuite de
 * ciblage que le serveur n'a pas à deviner.
 */
object ComposerAudienceSelection {
    /** Plafond de la passerelle (`visibilityUserIds.max(500)`). */
    const val MAX_USERS: Int = 500

    /** Les modes proposés, dans l'ordre de la feuille. */
    val offered: List<StoryVisibility> = listOf(
        StoryVisibility.PUBLIC,
        StoryVisibility.FRIENDS,
        StoryVisibility.COMMUNITY,
        StoryVisibility.ONLY,
        StoryVisibility.EXCEPT,
        StoryVisibility.PRIVATE,
    )

    fun sanitize(
        selected: Collection<String>,
        eligible: Set<String>,
        blocked: Set<String>,
        selfId: String?,
    ): List<String> = selected.asSequence()
        .filter { it in eligible && it !in blocked && it != selfId }
        .distinct()
        .take(MAX_USERS)
        .toList()

    /** `visibilityUserIds` du fil : la liste dédoublonnée sous `ONLY`/`EXCEPT`, `null` ailleurs. */
    fun wireUserIds(visibility: StoryVisibility, selected: List<String>): List<String>? =
        if (visibility.requiresUserSelection) selected.distinct() else null

    /** `ONLY` / `EXCEPT` sans personne sont refusés par la passerelle : le geste ne part pas. */
    fun isPublishable(visibility: StoryVisibility, selected: List<String>): Boolean =
        !visibility.requiresUserSelection || selected.isNotEmpty()
}
