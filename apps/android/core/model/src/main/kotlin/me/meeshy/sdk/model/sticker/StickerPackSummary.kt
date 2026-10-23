package me.meeshy.sdk.model.sticker

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import me.meeshy.sdk.model.BUILTIN_STICKER_PACK_SLUGS
import me.meeshy.sdk.model.StickerPackInfo

/** Un sticker d'un pack installé (genre : `static`, `cinematic`, `instant`, ou un genre plus récent). */
@Serializable
data class StickerPackItemSummary(
    val key: String,
    val title: String = "",
    val emoji: String = "",
    val kind: String = "static",
    val fileUrl: String = "",
) {
    /** Les stickers fixes et cinématiques se posent ; un Instant de tiers demande le moteur de zones de texte. */
    val isSendable: Boolean get() = kind == "static" || kind == "cinematic"
}

/** Un pack installé, tel que `GET /sticker-packs/installed` le sert — tout est additif (vieille passerelle). */
@Serializable
data class StickerPackSummary(
    val slug: String,
    val name: String = "",
    val installed: Boolean = false,
    val builtin: Boolean = false,
    val removable: Boolean? = null,
    val items: List<StickerPackItemSummary> = emptyList(),
) {
    val title: String get() = name.ifBlank { slug }
    val sendableItems: List<StickerPackItemSummary> get() = items.filter { it.isSendable }

    /** Un pack intégré est inclus : le serveur refuse de le retirer. */
    val isRemovable: Boolean get() = removable ?: !(builtin || slug in BUILTIN_STICKER_PACK_SLUGS_SET)

    fun toInfo(): StickerPackInfo = StickerPackInfo(slug, title, sendableItems.size)
}

private val BUILTIN_STICKER_PACK_SLUGS_SET = BUILTIN_STICKER_PACK_SLUGS.toSet()

/** La liste des packs : chaque entrée se décode SEULE, un pack illisible tombe sans emporter la liste. */
@Serializable(with = StickerPackListSerializer::class)
data class StickerPackList(val packs: List<StickerPackSummary>)

object StickerPackListSerializer : KSerializer<StickerPackList> {
    private val entries = ListSerializer(StickerPackSummary.serializer())
    override val descriptor: SerialDescriptor = entries.descriptor

    override fun deserialize(decoder: Decoder): StickerPackList {
        val jsonDecoder = decoder as? JsonDecoder ?: return StickerPackList(entries.deserialize(decoder))
        val array = jsonDecoder.decodeJsonElement() as? JsonArray ?: return StickerPackList(emptyList())
        return StickerPackList(
            array.mapNotNull { element ->
                try {
                    jsonDecoder.json.decodeFromJsonElement(StickerPackSummary.serializer(), element)
                } catch (_: IllegalArgumentException) {
                    null
                } catch (_: IllegalStateException) {
                    null
                }
            },
        )
    }

    override fun serialize(encoder: Encoder, value: StickerPackList) {
        entries.serialize(encoder, value.packs)
    }
}
