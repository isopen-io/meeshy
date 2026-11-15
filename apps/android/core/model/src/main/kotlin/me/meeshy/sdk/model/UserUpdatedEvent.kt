package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * `user:updated` — un CONTACT a changé son profil public. Delta léger : seules les clés modifiées sont
 * présentes. Miroir de `UserUpdatedEvent` (iOS) et de `UserUpdatedEventData` (`packages/shared`).
 *
 * Les quatre composants du nom voyagent en GROUPE : dès que l'un change, les quatre sont émis, et la
 * présence de `username` reconnaît le groupe ([hasNameGroup]). [avatar] et [banner] sont tri-états :
 * clé absente = inchangé, clé nulle = photo RETIRÉE. Un champ absent n'est jamais un champ nul.
 */
@Serializable(with = UserUpdatedEventSerializer::class)
data class UserUpdatedEvent(
    val userId: String,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val username: String? = null,
    val hasNameGroup: Boolean = false,
    val avatar: OptionalMediaChange = OptionalMediaChange.Unchanged,
    val banner: OptionalMediaChange = OptionalMediaChange.Unchanged,
) {
    /** Clé absente vs clé nulle : [Unchanged] garde la copie, [Replaced] (nul compris) la remplace. */
    sealed interface OptionalMediaChange {
        data object Unchanged : OptionalMediaChange
        data class Replaced(val url: String?) : OptionalMediaChange

        /** `Unchanged` garde [current] ; `Replaced(null)` le RETIRE. */
        fun applied(to: String?): String? = when (this) {
            Unchanged -> to
            is Replaced -> url
        }
    }

    /** `displayName > « Prénom Nom » > username`, `null` hors groupe du nom. */
    val composedName: String?
        get() {
            if (!hasNameGroup) return null
            val full = listOfNotNull(firstName, lastName)
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .joinToString(" ")
            return displayName.takeUnless { it.isNullOrBlank() }
                ?: full.takeUnless { it.isEmpty() }
                ?: username
        }
}

/** Décodeur tolérant : `{ userId, changes: { … } }`, chaque clé optionnelle, `null` ≠ absent. */
public object UserUpdatedEventSerializer : KSerializer<UserUpdatedEvent> {
    override val descriptor: SerialDescriptor =
        kotlinx.serialization.json.JsonObject.serializer().descriptor

    override fun serialize(encoder: Encoder, value: UserUpdatedEvent) {
        throw UnsupportedOperationException("UserUpdatedEvent est en lecture seule")
    }

    override fun deserialize(decoder: Decoder): UserUpdatedEvent {
        val root = (decoder as JsonDecoder).decodeJsonElement() as? JsonObject
            ?: throw IllegalArgumentException("user:updated: objet attendu")
        val userId = root.string("userId")
            ?: throw IllegalArgumentException("user:updated: userId absent")
        val changes = root["changes"] as? JsonObject ?: JsonObject(emptyMap())
        return UserUpdatedEvent(
            userId = userId,
            displayName = changes.string("displayName"),
            firstName = changes.string("firstName"),
            lastName = changes.string("lastName"),
            username = changes.string("username"),
            hasNameGroup = changes.containsKey("username"),
            avatar = changes.media("avatar"),
            banner = changes.media("banner"),
        )
    }

    private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)
        ?.takeIf { it !is JsonNull && it.isString }?.contentOrNull

    private fun JsonObject.media(key: String): UserUpdatedEvent.OptionalMediaChange {
        val element: JsonElement = this[key] ?: return UserUpdatedEvent.OptionalMediaChange.Unchanged
        return UserUpdatedEvent.OptionalMediaChange.Replaced(string(key).takeIf { element !is JsonNull })
    }
}
