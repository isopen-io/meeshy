package me.meeshy.sdk.model.profile

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ServedProfileDecor

/**
 * `profile:decor-updated` (#10632) — émis sur `user:<id>` après chaque écriture de
 * `PUT /me/profile-decor`. Miroir de `ProfileDecorUpdatedEventData` (packages/shared). Événement
 * neuf : un champ absent se lit vide, un côté illisible tombe seul (lecture tolérante de
 * [ServedProfileDecor]).
 */
@Serializable
data class ProfileDecorUpdatedEvent(
    val userId: String,
    val decor: ServedProfileDecor = ServedProfileDecor.EMPTY,
    val at: String? = null,
)
