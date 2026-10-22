package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Le decor de profil EQUIPE et VISIBLE des autres (#10632) — miroir de
 * `packages/shared/types/profile-decor.ts` et de `ProfileDecor.swift` : le contour
 * d'avatar, la banniere de design (le FOND) et le cadre de banniere (pose SUR la photo).
 *
 * Lecture tolerante PAR COTE : un decor illisible n'empeche jamais d'ouvrir un profil, un
 * contour illisible n'emporte pas la banniere, un cote inconnu est ignore. Un profil sans
 * `profileDecor`, ou sans `bannerFrame` (ancien serveur), se rend comme avant.
 */
enum class PackOrigin(val wire: String) {
    BUILTIN("builtin"),
    OFFICIAL("official"),
    COMMUNITY("community"),
    UNKNOWN("unknown"),
    ;

    companion object {
        /** Une origine qu'une passerelle plus recente ajouterait se lit [UNKNOWN], jamais en erreur. */
        fun from(raw: String?): PackOrigin = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

data class ProfileDecorRef(val pack: String, val item: String)

data class ServedProfileDecorItem(
    val pack: String,
    val item: String,
    val origin: PackOrigin = PackOrigin.UNKNOWN,
    /** L'adresse `<sha16>.json` du contrat ; `null` pour un `builtin` embarque. */
    val contract: String? = null,
) {
    val ref: ProfileDecorRef get() = ProfileDecorRef(pack, item)
}

enum class ProfileDecorSide(val wire: String, val packDomain: String) {
    AVATAR_RING("avatarRing", "avatar-ring"),
    BANNER("banner", "banner"),
    BANNER_FRAME("bannerFrame", "banner-frame"),
}

@Serializable(with = ServedProfileDecorSerializer::class)
data class ServedProfileDecor(
    val avatarRing: ServedProfileDecorItem? = null,
    val banner: ServedProfileDecorItem? = null,
    /** Le cadre pose SUR la photo de banniere (ou le fond), centre transparent (#10932). */
    val bannerFrame: ServedProfileDecorItem? = null,
) {
    operator fun get(side: ProfileDecorSide): ServedProfileDecorItem? = when (side) {
        ProfileDecorSide.AVATAR_RING -> avatarRing
        ProfileDecorSide.BANNER -> banner
        ProfileDecorSide.BANNER_FRAME -> bannerFrame
    }

    fun with(side: ProfileDecorSide, item: ServedProfileDecorItem?): ServedProfileDecor = when (side) {
        ProfileDecorSide.AVATAR_RING -> copy(avatarRing = item)
        ProfileDecorSide.BANNER -> copy(banner = item)
        ProfileDecorSide.BANNER_FRAME -> copy(bannerFrame = item)
    }

    companion object {
        val EMPTY = ServedProfileDecor()
    }
}

/**
 * `PUT /me/profile-decor` : champ absent = inchange, `null` = retire, objet = equipe.
 */
@Serializable(with = ProfileDecorWriteSerializer::class)
data class ProfileDecorWrite(
    val avatarRing: Change = Change.Unchanged,
    val banner: Change = Change.Unchanged,
    val bannerFrame: Change = Change.Unchanged,
) {
    sealed interface Change {
        data object Unchanged : Change
        data object Clear : Change
        data class Set(val ref: ProfileDecorRef) : Change
    }

    companion object {
        fun side(side: ProfileDecorSide, choice: ProfileDecorRef?): ProfileDecorWrite {
            val change = choice?.let(Change::Set) ?: Change.Clear
            return ProfileDecorWrite(
                avatarRing = if (side == ProfileDecorSide.AVATAR_RING) change else Change.Unchanged,
                banner = if (side == ProfileDecorSide.BANNER) change else Change.Unchanged,
                bannerFrame = if (side == ProfileDecorSide.BANNER_FRAME) change else Change.Unchanged,
            )
        }
    }
}

private fun decorItemOrNull(element: JsonElement?): ServedProfileDecorItem? {
    val obj = element as? JsonObject ?: return null
    val pack = obj["pack"].stringOrNull() ?: return null
    val item = obj["item"].stringOrNull() ?: return null
    return ServedProfileDecorItem(
        pack = pack,
        item = item,
        origin = PackOrigin.from(obj["origin"].stringOrNull()),
        contract = obj["contract"].stringOrNull(),
    )
}

internal object ServedProfileDecorSerializer : KSerializer<ServedProfileDecor> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): ServedProfileDecor {
        val input = decoder as? JsonDecoder ?: return ServedProfileDecor.EMPTY
        val obj = input.decodeJsonElement() as? JsonObject ?: return ServedProfileDecor.EMPTY
        return ServedProfileDecor(
            avatarRing = decorItemOrNull(obj[ProfileDecorSide.AVATAR_RING.wire]),
            banner = decorItemOrNull(obj[ProfileDecorSide.BANNER.wire]),
            bannerFrame = decorItemOrNull(obj[ProfileDecorSide.BANNER_FRAME.wire]),
        )
    }

    override fun serialize(encoder: Encoder, value: ServedProfileDecor) {
        val output = encoder as? JsonEncoder ?: return
        output.encodeJsonElement(
            buildJsonObject {
                ProfileDecorSide.entries.forEach { side ->
                    val item = value[side] ?: return@forEach
                    put(
                        side.wire,
                        buildJsonObject {
                            put("pack", item.pack)
                            put("item", item.item)
                            put("origin", item.origin.wire)
                            item.contract?.let { put("contract", it) }
                        },
                    )
                }
            },
        )
    }
}

internal object ProfileDecorWriteSerializer : KSerializer<ProfileDecorWrite> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor

    override fun deserialize(decoder: Decoder): ProfileDecorWrite =
        throw UnsupportedOperationException("ProfileDecorWrite is write-only")

    override fun serialize(encoder: Encoder, value: ProfileDecorWrite) {
        val output = encoder as? JsonEncoder ?: return
        output.encodeJsonElement(
            buildJsonObject {
                put(ProfileDecorSide.AVATAR_RING.wire, value.avatarRing)
                put(ProfileDecorSide.BANNER.wire, value.banner)
                put(ProfileDecorSide.BANNER_FRAME.wire, value.bannerFrame)
            },
        )
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.put(
        key: String,
        change: ProfileDecorWrite.Change,
    ) {
        when (change) {
            ProfileDecorWrite.Change.Unchanged -> Unit
            ProfileDecorWrite.Change.Clear -> put(key, JsonNull)
            is ProfileDecorWrite.Change.Set -> put(
                key,
                buildJsonObject {
                    put("pack", change.ref.pack)
                    put("item", change.ref.item)
                },
            )
        }
    }
}
