package me.meeshy.sdk.model.friend

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserUpdatedEvent

/** Un objet COMPTE porte `displayName` tel que servi : un nom effacé reste effacé. */
fun UserUpdatedEvent.repainted(user: FriendRequestUser): FriendRequestUser? {
    if (user.id != userId) return null
    val next = user.copy(
        username = if (hasNameGroup) (username ?: user.username) else user.username,
        firstName = if (hasNameGroup) firstName else user.firstName,
        lastName = if (hasNameGroup) lastName else user.lastName,
        displayName = if (hasNameGroup) displayName else user.displayName,
        avatar = avatar.applied(user.avatar),
    )
    return next.takeIf { it != user }
}

/** Repeint les deux côtés d'une demande ; `null` quand ni l'expéditeur ni le destinataire ne change. */
fun UserUpdatedEvent.repainted(request: FriendRequest): FriendRequest? {
    val sender = request.sender?.let { repainted(it) }
    val receiver = request.receiver?.let { repainted(it) }
    if (sender == null && receiver == null) return null
    return request.copy(sender = sender ?: request.sender, receiver = receiver ?: request.receiver)
}

fun UserUpdatedEvent.repainted(blocked: BlockedUser): BlockedUser? {
    if (blocked.id != userId) return null
    val next = blocked.copy(
        username = if (hasNameGroup) (username ?: blocked.username) else blocked.username,
        displayName = if (hasNameGroup) displayName else blocked.displayName,
        avatar = avatar.applied(blocked.avatar),
    )
    return next.takeIf { it != blocked }
}
