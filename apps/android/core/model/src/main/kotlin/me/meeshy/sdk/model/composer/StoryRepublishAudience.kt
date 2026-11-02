package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryVisibility

/**
 * L'audience qu'on REDEMANDE avant de republier une story depuis « Mes stories » / l'archive.
 * Miroir de la porte iOS (`StoryRepublishComposer` : la republication part de l'audience de sa
 * source, jamais plus large) et de la loi d'audience du composeur.
 *
 * Quatre lois, toutes pures :
 * - la proposition est l'audience PRÉCÉDENTE ; une valeur absente ou périmée décroît vers
 *   [StoryVisibility.PRIVATE] (iOS : `visibility ?? private`), jamais vers PUBLIC — l'audience ne
 *   s'élargit pas en silence ;
 * - la liste nommée ne survit que sous `ONLY` / `EXCEPT`, soi exclu, et sans bloqué sous `ONLY` ;
 * - un choix `ONLY` / `EXCEPT` vide ne part pas ([isPublishable]) ;
 * - le serveur n'est écrit que si l'audience CHANGE ([change]) ; la liste part alors TOUJOURS
 *   (vide s'il le faut) pour qu'aucune ancienne liste ne reste orpheline.
 */
object StoryRepublishAudience {

    data class Choice(val visibility: StoryVisibility, val userIds: List<String> = emptyList())

    sealed interface Change {
        data object None : Change
        data class Apply(val visibility: StoryVisibility, val userIds: List<String>) : Change
    }

    fun proposal(rawVisibility: String?, userIds: List<String>?, selfId: String?, blocked: Set<String>): Choice {
        val visibility = parse(rawVisibility) ?: StoryVisibility.PRIVATE
        return Choice(visibility, reachable(userIds.orEmpty(), visibility, selfId, blocked))
    }

    /** Changer de mode garde la liste (ONLY ↔ EXCEPT) mais la vide hors de ces deux modes. */
    fun choose(current: Choice, candidate: StoryVisibility, selfId: String?, blocked: Set<String>): Choice =
        Choice(candidate, reachable(current.userIds, candidate, selfId, blocked))

    fun withUserIds(current: Choice, ids: List<String>, selfId: String?, blocked: Set<String>): Choice =
        Choice(current.visibility, reachable(ids, current.visibility, selfId, blocked))

    fun reachable(ids: List<String>, visibility: StoryVisibility, selfId: String?, blocked: Set<String>): List<String> {
        if (!visibility.requiresUserSelection) return emptyList()
        return ids.asSequence()
            .filter { it != selfId && (visibility != StoryVisibility.ONLY || it !in blocked) }
            .distinct()
            .take(ComposerAudienceSelection.MAX_USERS)
            .toList()
    }

    fun isPublishable(choice: Choice): Boolean =
        ComposerAudienceSelection.isPublishable(choice.visibility, choice.userIds)

    /**
     * Se mesure contre les valeurs BRUTES du serveur, jamais contre la proposition nettoyée : une
     * valeur inconnue, ou une liste que le nettoyage a changée (soi, bloqués, orpheline), doit être
     * ÉCRITE — sinon la story repart avec l'audience effective du serveur, plus large que celle que
     * l'auteur a vue et confirmée.
     */
    fun change(rawVisibility: String?, rawUserIds: List<String>?, chosen: Choice): Change {
        val known = parse(rawVisibility)
        val same = known == chosen.visibility && rawUserIds.orEmpty().toSet() == chosen.userIds.toSet() &&
            rawUserIds.orEmpty().size == rawUserIds.orEmpty().toSet().size
        return if (same) Change.None else Change.Apply(chosen.visibility, chosen.userIds)
    }

    private fun parse(raw: String?): StoryVisibility? =
        raw?.let { value -> StoryVisibility.entries.firstOrNull { it.wire == value.uppercase() } }
}
