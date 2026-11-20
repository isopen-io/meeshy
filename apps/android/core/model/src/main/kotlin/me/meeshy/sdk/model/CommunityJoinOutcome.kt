package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Corps de `POST /communities/:id/join` (#19429) : `acceptsPending` dit à la passerelle que ce client
 * sait lire une demande en attente (202) — sans lui, une communauté qui valide chaque entrée répond 409
 * `COMMUNITY_JOIN_PENDING`. Miroir de `JoinCommunityRequest` (iOS). Sans valeur par défaut : le `Json`
 * de Retrofit n'encode pas les défauts, et un `{}` envoyé ferait retomber sur le 409.
 */
@Serializable
data class JoinCommunityRequest(val acceptsPending: Boolean) {
    companion object {
        val AcceptsPending = JoinCommunityRequest(acceptsPending = true)
    }
}

/**
 * Ce que rend la jonction (#19870, miroir `CommunityJoinOutcome` iOS) : une adhésion — la ligne écrite —
 * ou, pour une communauté qui valide chaque entrée, une DEMANDE qui ne fait encore membre de rien.
 */
@Serializable(with = CommunityJoinOutcomeSerializer::class)
sealed class CommunityJoinOutcome {
    data class Joined(val member: ApiCommunityMember) : CommunityJoinOutcome()
    data class Pending(val requestId: String) : CommunityJoinOutcome()
}

/**
 * Une rangée de membre peut porter un `status` (#19290) : c'est `requestId`, propre à la réponse 202,
 * qui désigne la demande.
 */
object CommunityJoinOutcomeSerializer : KSerializer<CommunityJoinOutcome> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("CommunityJoinOutcome")

    override fun deserialize(decoder: Decoder): CommunityJoinOutcome {
        val json = decoder as? JsonDecoder ?: throw SerializationException("CommunityJoinOutcome se lit en JSON")
        val payload = json.decodeJsonElement() as? JsonObject ?: throw SerializationException("objet attendu")
        val status = (payload["status"] as? JsonPrimitive)?.contentOrNull
        val requestId = (payload["requestId"] as? JsonPrimitive)?.contentOrNull
        if (status == ApiCommunity.PENDING_JOIN_REQUEST && requestId != null) return CommunityJoinOutcome.Pending(requestId)
        return CommunityJoinOutcome.Joined(json.json.decodeFromJsonElement(ApiCommunityMember.serializer(), payload))
    }

    override fun serialize(encoder: Encoder, value: CommunityJoinOutcome): Unit =
        throw SerializationException("CommunityJoinOutcome ne s'envoie pas")
}

/**
 * Les refus de la jonction que l'écran dit dans la langue du lecteur, lus par leur `code` machine —
 * jamais par le message du serveur (miroir `CommunityJoinRefusal` iOS).
 */
enum class CommunityJoinRefusal {
    /** 403 `COMMUNITY_JOIN_COOLDOWN` : une demande refusée il y a moins de sept jours. */
    COOLDOWN;

    companion object {
        const val COOLDOWN_CODE = "COMMUNITY_JOIN_COOLDOWN"

        fun of(code: String?): CommunityJoinRefusal? = COOLDOWN.takeIf { code == COOLDOWN_CODE }
    }
}
