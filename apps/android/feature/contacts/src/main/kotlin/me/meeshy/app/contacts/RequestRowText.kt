package me.meeshy.app.contacts

import me.meeshy.sdk.model.FriendRequest

/**
 * The personal note a sender attached to a request, or `null` when there is none — the row
 * then states the intent instead (« Souhaite entrer en contact avec vous »), as on iOS.
 */
internal fun FriendRequest.personalMessage(): String? = message?.trim()?.takeIf { it.isNotEmpty() }
