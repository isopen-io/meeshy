package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent

/**
 * Repeint le profil OUVERT quand `user:updated` annonce un nouveau nom ou une nouvelle photo
 * (miroir de `UserProfileRepaint`, iOS). `null` quand l'événement vise un autre compte ou ne change
 * rien : l'appelant ne republie ni ne réécrit le cache pour une copie intacte.
 */
fun UserUpdatedEvent.repainted(user: MeeshyUser): MeeshyUser? {
    if (user.id != userId) return null
    val next = user.copy(
        username = if (hasNameGroup) username ?: user.username else user.username,
        firstName = if (hasNameGroup) firstName else user.firstName,
        lastName = if (hasNameGroup) lastName else user.lastName,
        displayName = if (hasNameGroup) displayName else user.displayName,
        avatar = avatar.applied(user.avatar),
        banner = banner.applied(user.banner),
    )
    return next.takeIf { it != user }
}
