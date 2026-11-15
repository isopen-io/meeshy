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
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/**
 * Ce qu'une personne de la liste des vues a fait sur UN contenu (#9727) — miroir de
 * `PostViewerEngagement` (PostViewerEngagement.swift, `publication-viewers.ts`).
 *
 * Chaque champ est ABSENT du fil quand il vaut zéro : il se décode à zéro, et [marks] ne
 * produit jamais « 0 commentaire ». Un serveur d'avant #9727 ne sert que `reaction` (la plus
 * récente) : elle devient l'unique réaction. Le favori n'y figure jamais.
 */
@Serializable(with = PostViewerEngagementSerializer::class)
public data class PostViewerEngagement(
    val reactions: List<String> = emptyList(),
    val shareCount: Int = 0,
    val repostCount: Int = 0,
    val commentCount: Int = 0,
    val replyCount: Int = 0,
) {
    /** Une marque à dessiner, dans l'ordre de la feuille. */
    public sealed interface Mark {
        public data class Reactions(val emojis: List<String>) : Mark
        public data class Comments(val count: Int) : Mark
        public data class Replies(val count: Int) : Mark
        public data class Reposts(val count: Int) : Mark
        public data class Shares(val count: Int) : Mark
    }

    /** Les marques non nulles : réactions, commentaires, réponses, republications, partages. */
    val marks: List<Mark>
        get() = buildList {
            if (reactions.isNotEmpty()) add(Mark.Reactions(reactions))
            if (commentCount > 0) add(Mark.Comments(commentCount))
            if (replyCount > 0) add(Mark.Replies(replyCount))
            if (repostCount > 0) add(Mark.Reposts(repostCount))
            if (shareCount > 0) add(Mark.Shares(shareCount))
        }

    /** La réaction la plus récente — le champ historique de la ligne. */
    val latestReaction: String? get() = reactions.lastOrNull()
}

/** Décodage tolérant champ par champ : une marque qui manque ne fait jamais tomber la liste. */
public object PostViewerEngagementSerializer : KSerializer<PostViewerEngagement> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): PostViewerEngagement {
        val obj = (decoder as? JsonDecoder)?.decodeJsonElement() as? JsonObject
            ?: return PostViewerEngagement()
        val served = (obj["reactions"] as? JsonArray)
            ?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
            ?.takeIf { it.isNotEmpty() }
        val legacy = (obj["reaction"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        return PostViewerEngagement(
            reactions = served ?: legacy?.let { listOf(it) } ?: emptyList(),
            shareCount = obj.count("shareCount"),
            repostCount = obj.count("repostCount"),
            commentCount = obj.count("commentCount"),
            replyCount = obj.count("replyCount"),
        )
    }

    override fun serialize(encoder: Encoder, value: PostViewerEngagement) {
        val json = encoder as? JsonEncoder ?: return
        json.encodeJsonElement(
            buildJsonObject {
                if (value.reactions.isNotEmpty()) {
                    put("reactions", JsonArray(value.reactions.map { JsonPrimitive(it) }))
                }
                if (value.shareCount > 0) put("shareCount", value.shareCount)
                if (value.repostCount > 0) put("repostCount", value.repostCount)
                if (value.commentCount > 0) put("commentCount", value.commentCount)
                if (value.replyCount > 0) put("replyCount", value.replyCount)
            },
        )
    }

    private fun JsonObject.count(key: String): Int {
        val primitive = (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && !it.isString }
        return (primitive?.intOrNull ?: 0).coerceAtLeast(0)
    }
}
