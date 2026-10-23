package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Post kind — port of PostType (StoryModels.swift). */
@Serializable
enum class PostType {
    @SerialName("POST") POST,
    @SerialName("REEL") REEL,
    @SerialName("STORY") STORY,
    @SerialName("STATUS") STATUS,
}

/**
 * Le genre d'une publication — l'enum [PostType] ci-dessus est ordonné POST, REEL, STORY,
 * STATUS comme l'iOS (PostType.swift). Une valeur inconnue (genre ajouté côté serveur) ne
 * lève jamais : [postTypeFromWire] rend `null` et l'appelant garde la chaîne brute.
 */
val PostType.wire: String get() = name

fun postTypeFromWire(raw: String?): PostType? {
    val key = raw?.trim()?.uppercase().orEmpty()
    return PostType.entries.firstOrNull { it.name == key }
}
