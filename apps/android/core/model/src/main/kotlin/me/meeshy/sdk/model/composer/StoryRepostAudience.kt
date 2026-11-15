package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryVisibility

/**
 * **La loi d'audience d'un REPARTAGE** : la même audience, ou une plus étroite, JAMAIS une plus large. Miroir de
 * `allowedRepostVisibilities` (`packages/shared/utils/repost-audience.ts`) et de `StoryRepostAudience.swift` (#13939) —
 * le serveur l'applique (403 `REPOST_AUDIENCE_WIDENING`) ; ici elle ne fait que plafonner le sélecteur et retirer le
 * bouton d'un choix vide.
 *
 * Les audiences ne forment pas un ordre total (`COMMUNITY` et `FRIENDS` sont incomparables) : depuis `PUBLIC` tout, depuis
 * `PRIVATE` lui-même, depuis une autre audience elle-même et `PRIVATE`. Les cercles se rétrécissent vers un cercle plus
 * étroit (RG-18) : Proches ⊆ Connaissances, Sang ⊆ Proches, et Proches ⊆ Amis — mais `FRIENDS` n'est PAS sous
 * `ACQUAINTANCES` (il admet aussi les contacts de message direct). Un contenu `BLOOD` ne se repartage JAMAIS, pas même en
 * privé. Une audience absente ou inconnue se lit la plus restreinte, jamais le `PUBLIC` par défaut du serveur.
 */
object StoryRepostAudience {

    private val NARROWER_CIRCLES: Map<StoryVisibility, List<StoryVisibility>> = mapOf(
        StoryVisibility.ACQUAINTANCES to listOf(StoryVisibility.ACQUAINTANCES, StoryVisibility.CLOSE, StoryVisibility.BLOOD),
        StoryVisibility.FRIENDS to listOf(StoryVisibility.FRIENDS, StoryVisibility.CLOSE, StoryVisibility.BLOOD),
        StoryVisibility.CLOSE to listOf(StoryVisibility.CLOSE, StoryVisibility.BLOOD),
    )

    /** Les audiences qu'un republieur peut choisir, l'original étant donné ; vide : rien ne se repartage. */
    fun allowed(original: StoryVisibility): List<StoryVisibility> = when (original) {
        StoryVisibility.PUBLIC -> StoryVisibility.entries
        StoryVisibility.PRIVATE -> listOf(StoryVisibility.PRIVATE)
        StoryVisibility.BLOOD -> emptyList()
        else -> NARROWER_CIRCLES[original]?.plus(StoryVisibility.PRIVATE) ?: listOf(original, StoryVisibility.PRIVATE)
    }

    /** La même loi, lue sur la valeur SERVIE : absente ou inconnue, elle vaut la plus restreinte. */
    fun allowed(rawVisibility: String?): List<StoryVisibility> =
        allowed(rawVisibility?.let { StoryVisibility.fromWire(it) } ?: StoryVisibility.PRIVATE)

    /** La loi n'offre RIEN à un contenu de Sang (RG-18) : pas de bouton pour un choix vide. */
    fun isRepublishable(rawVisibility: String?): Boolean = allowed(rawVisibility).isNotEmpty()
}
