package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Un lien brut → jeton de suivi, posé par la passerelle sur un message, un post ou un
 * commentaire — miroir de `TrackedLink` (TrackedLink.swift). Le texte n'est jamais
 * réécrit ; la redirection `<origine web>/l/<jeton>` est la destination du tap.
 */
@Serializable
public data class TrackedLink(
    val url: String,
    val token: String,
)

/** `[urlBrute: jeton]` — le dernier jeton gagne sur une URL dupliquée. */
public fun Iterable<TrackedLink>.trackedLinkMap(): Map<String, String> =
    fold(LinkedHashMap()) { acc, link -> acc.also { it[link.url] = link.token } }
