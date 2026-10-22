package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject

/**
 * Ce qu'un appel de profil demande EN PLUS du profil (#4161). Demander une expansion, c'est
 * decider si l'on POSE la question — jamais lever une garde : la presence reste soumise a la
 * loi de visibilite, et les compteurs intimes a celle de leur proprietaire.
 */
enum class ProfileExpansion(val wire: String) {
    /** Les compteurs — publics pour tous, intimes pour soi et l'administration. */
    STATS("stats"),

    /** `isOnline` / `lastActiveAt`, sous la loi de visibilite de presence. */
    PRESENCE("presence"),

    /** La relation du LECTEUR au sujet. */
    RELATION("relation"),
    ;

    companion object {
        /** Defaut du profil : compteurs et presence en UN aller-retour ; la relation sur demande. */
        val DEFAULT: Set<ProfileExpansion> = setOf(STATS, PRESENCE)

        /** La valeur de `?expand=`, dans l'ordre stable de declaration (meme URL, meme entree de cache). */
        fun query(expansions: Set<ProfileExpansion>): String? =
            entries.filter { it in expansions }.joinToString(",") { it.wire }.ifEmpty { null }
    }
}

/**
 * Un profil public tel que `GET /directory/people/:handle` le sert — port de `PublicProfile`
 * (`PublicProfileModels.swift`). La charge est PLATE : le profil et ses expansions sont freres.
 *
 * [relation] reste une CHAINE : un modele plus strict que le fil ferait disparaitre le profil
 * entier a la premiere valeur ajoutee cote serveur ; [relationKind] en donne la lecture typee.
 * [isSelf] absent vaut `false` : ne pas savoir n'est pas « c'est moi ».
 */
@Serializable(with = PublicProfileSerializer::class)
data class PublicProfile(
    val user: MeeshyUser,
    val stats: UserStats? = null,
    val relation: String? = null,
    val isSelf: Boolean = false,
) {
    enum class RelationKind(val wire: String) {
        NONE("none"),
        SELF("self"),
        FRIEND("friend"),
        PENDING_SENT("pending_sent"),
        PENDING_RECEIVED("pending_received"),
    }

    val relationKind: RelationKind
        get() = RelationKind.entries.firstOrNull { it.wire == relation } ?: RelationKind.NONE
}

internal object PublicProfileSerializer : KSerializer<PublicProfile> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): PublicProfile {
        val input = decoder as? JsonDecoder
            ?: throw UnsupportedOperationException("PublicProfile is JSON-only")
        val obj = input.decodeJsonElement() as? JsonObject
            ?: throw IllegalArgumentException("public profile is not an object")
        val json = input.json
        return PublicProfile(
            user = json.decodeFromJsonElement(MeeshyUser.serializer(), obj),
            stats = obj["stats"]
                ?.let { runCatching { json.decodeFromJsonElement(UserStats.serializer(), it) }.getOrNull() },
            relation = obj["relation"].stringOrNull(),
            isSelf = (obj["isSelf"] as? JsonPrimitive)?.booleanOrNull ?: false,
        )
    }

    override fun serialize(encoder: Encoder, value: PublicProfile) {
        val output = encoder as? JsonEncoder ?: return
        val json = output.json
        val user = json.encodeToJsonElement(MeeshyUser.serializer(), value.user) as JsonObject
        output.encodeJsonElement(
            buildJsonObject {
                user.forEach { (key, element) -> put(key, element) }
                value.stats?.let { put("stats", json.encodeToJsonElement(UserStats.serializer(), it)) }
                value.relation?.let { put("relation", JsonPrimitive(it)) }
                put("isSelf", JsonPrimitive(value.isSelf))
            },
        )
    }
}
