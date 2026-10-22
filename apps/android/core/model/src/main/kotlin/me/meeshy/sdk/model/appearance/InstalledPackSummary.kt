package me.meeshy.sdk.model.appearance

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Un pack d'apparence tel que `GET /packs/<domaine>/installed` le liste — la
 * projection de `PackSummary` (spec 2026-10-14 §§ 4.1, 4.4) dont le sélecteur a
 * besoin pour décider de ce qu'il propose. Tout est additif : un ancien serveur ne
 * sert ni `price` ni `owned`, et le pack se lit alors gratuit et possédé.
 */
@Serializable
data class InstalledPackSummary(
    val slug: String,
    val installed: Boolean = false,
    /** `null` = le serveur ne le dit pas (ancien serveur) : gratuit ⇒ possédé. */
    val owned: Boolean? = null,
    /** En Meeshes ; absent = gratuit. Jamais 0 : un prix nul ou négatif se lit gratuit. */
    val price: Int? = null,
    /** `false` = un pack inclus (Essentiels, Contours essentiels…) que le serveur refuse de retirer. Absent ⇒ `true`. */
    val removable: Boolean = true,
) {
    val isPaid: Boolean get() = (price ?: 0) > 0

    /** La règle unique de possession : un pack gratuit est possédé par tout compte ; un pack payant l'est quand le serveur le dit. */
    val isOwned: Boolean get() = owned ?: !isPaid
}

/**
 * Les packs installés d'un domaine : chaque entrée se décode SEULE, un pack illisible
 * tombe sans emporter la liste (`LossyDecodableArray` d'iOS).
 */
@Serializable(with = InstalledPackListSerializer::class)
data class InstalledPackList(val packs: List<InstalledPackSummary>)

object InstalledPackListSerializer : KSerializer<InstalledPackList> {
    private val entries = LossyListSerializer(InstalledPackSummary.serializer())

    override val descriptor: SerialDescriptor = entries.descriptor

    override fun deserialize(decoder: Decoder): InstalledPackList = InstalledPackList(entries.deserialize(decoder))

    override fun serialize(encoder: Encoder, value: InstalledPackList) {
        entries.serialize(encoder, value.packs)
    }
}
