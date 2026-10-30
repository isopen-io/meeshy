package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiPost

/**
 * La couleur de l'auteur d'un post (iOS `FeedPost.authorColor`) : UNE seule pour la carte du fil, l'aplat d'un réel et la scène du
 * lecteur de réels — ouvrir un réel ne change pas sa teinte.
 */
public fun ApiPost.authorAccentHex(): String =
    DynamicColorGenerator.colorForPost(
        authorId = author?.id?.takeIf { it.isNotBlank() } ?: author?.displayName ?: author?.username.orEmpty(),
        type = type,
        originalLanguage = originalLanguage,
    )
