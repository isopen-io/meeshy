package me.meeshy.sdk.model

/**
 * Le genre d'une publication — l'enum [PostType] (Story.kt) est ordonné POST, REEL, STORY,
 * STATUS comme l'iOS (PostType.swift). Une valeur inconnue (genre ajouté côté serveur) ne
 * lève jamais : [postTypeFromWire] rend `null` et l'appelant garde la chaîne brute.
 */
val PostType.wire: String get() = name

fun postTypeFromWire(raw: String?): PostType? {
    val key = raw?.trim()?.uppercase().orEmpty()
    return PostType.entries.firstOrNull { it.name == key }
}
