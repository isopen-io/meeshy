package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * L'etat d'activation du compte courant (#8239, loi serveur #8238), servi dans la
 * charge de soi : `activation: { phase, deadline, missing }`. Port de `UserActivation`
 * (`packages/MeeshySDK/.../Auth/UserActivation.swift`).
 *
 * - `quiet` : J0-J7, rien n'est demande ;
 * - `invite` : J7-J28, l'app invite a prouver l'adresse et a ajouter un numero ;
 * - `blocked` : apres J28, la connexion mene a l'ecran du code ;
 * - `done` : adresse prouvee — le numero peut encore manquer.
 *
 * Le decodage est TOLERANT : une phase inconnue rend `phase == null` (jamais
 * d'invitation fabriquee) et un canal inconnu est ecarte seul. Une forme nouvelle cote
 * passerelle ne fait donc jamais tomber le decodage de l'utilisateur entier.
 */
@Serializable(with = UserActivationSerializer::class)
data class UserActivation(
    val phase: Phase?,
    val deadline: String?,
    val missing: List<Channel> = emptyList(),
) {
    enum class Phase(val wire: String) {
        QUIET("quiet"),
        INVITE("invite"),
        BLOCKED("blocked"),
        DONE("done"),
        ;

        companion object {
            fun from(raw: String?): Phase? = entries.firstOrNull { it.wire == raw }
        }
    }

    enum class Channel(val wire: String) {
        EMAIL("email"),
        PHONE("phone"),
        ;

        companion object {
            fun from(raw: String?): Channel? = entries.firstOrNull { it.wire == raw }
        }
    }

    /** Une invitation n'a de sens qu'en phase `invite` ET s'il reste quelque chose a demander. */
    val invites: Boolean get() = phase == Phase.INVITE && missing.isNotEmpty()

    /**
     * Les jours restants avant le blocage, arrondis au jour superieur et jamais negatifs ;
     * `null` sans echeance lisible.
     */
    fun daysLeft(nowEpochMillis: Long): Int? {
        val at = WireDate.epochMillis(deadline) ?: return null
        val remaining = at - nowEpochMillis
        val days = Math.floorDiv(remaining + DAY_MILLIS - 1, DAY_MILLIS)
        return days.coerceAtLeast(0).toInt()
    }
}

private const val DAY_MILLIS = 86_400_000L

internal object UserActivationSerializer : KSerializer<UserActivation> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): UserActivation {
        val input = decoder as? JsonDecoder ?: return UserActivation(phase = null, deadline = null)
        val obj = input.decodeJsonElement() as? JsonObject
            ?: return UserActivation(phase = null, deadline = null)
        val missing = (obj["missing"] as? JsonArray).orEmpty()
            .mapNotNull { UserActivation.Channel.from(it.stringOrNull()) }
        return UserActivation(
            phase = UserActivation.Phase.from(obj["phase"].stringOrNull()),
            deadline = obj["deadline"].stringOrNull(),
            missing = missing,
        )
    }

    override fun serialize(encoder: Encoder, value: UserActivation) {
        val output = encoder as? JsonEncoder ?: return
        output.encodeJsonElement(
            buildJsonObject {
                value.phase?.let { put("phase", it.wire) }
                value.deadline?.let { put("deadline", it) }
                put("missing", JsonArray(value.missing.map { JsonPrimitive(it.wire) }))
            },
        )
    }
}

internal fun JsonElement?.stringOrNull(): String? =
    (this as? JsonPrimitive)?.takeIf { it.isString }?.content
