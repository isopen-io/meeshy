package me.meeshy.sdk.model.packs

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.LossyListSerializer

/**
 * La vitrine unique des packs — miroir de `ShopPack` / `PackShopResponse` d'iOS (`PackShopModels.swift`) pour les quatre
 * domaines d'apparence que la boutique Android propose. Tout est additif : un ancien serveur ne sert ni `price` ni
 * `owned`, et le pack se lit alors gratuit et possédé.
 *
 * **Le serveur est le seul à dire ce qu'on possède et ce qu'on a.** Rien ici ne calcule un solde ni ne devine une
 * possession : la lecture est reprise telle qu'elle est servie.
 */
@Serializable
data class ShopPack(
    val slug: String,
    val name: String? = null,
    val description: String? = null,
    val author: String? = null,
    val builtin: Boolean = false,
    val coverUrl: String? = null,
    val installed: Boolean = false,
    val installCount: Int = 0,
    /** En Meeshes ; absent = gratuit. Jamais 0 : un prix nul ou négatif se lit gratuit ([meeshes]). */
    val price: Int? = null,
    /** `null` = le serveur ne le dit pas (ancien serveur) : gratuit ⇒ possédé. */
    val owned: Boolean? = null,
    val removable: Boolean = true,
    /** `{ en: { name, description } }` — lu langue par langue, une langue illisible tombe seule. */
    val names: JsonObject? = null,
    /** Ce qui reste à débloquer ; seul le verdict `met` du serveur est lu ici. */
    val requirementPreview: JsonElement? = null,
) {
    /** Le prix en Meeshes, `null` pour un pack gratuit. */
    val meeshes: Int? get() = price?.takeIf { it > 0 }

    /** Un pack à GAGNER (il porte un aperçu) n'est jamais possédé d'office parce qu'il est sans prix. */
    val isOwned: Boolean get() = owned ?: (meeshes == null && requirementPreview == null)

    /** Le serveur dit que le pack n'est pas encore débloqué : ni « Acheter » ni « Installer », il refuserait. */
    val isLocked: Boolean get() = requirementMet == false

    /** Payant et pas encore à moi. */
    val needsPurchase: Boolean get() = meeshes != null && !isOwned

    /** Le geste « Acheter » est offert : payant, pas à moi, et débloqué. */
    val canBuy: Boolean get() = needsPurchase && !isLocked

    private val requirementMet: Boolean?
        get() = ((requirementPreview as? JsonObject)?.get("met") as? JsonPrimitive)?.booleanOrNull

    /** Le nom dans la langue du lecteur, sinon celui que sert la passerelle, sinon le slug. */
    fun localizedName(language: String): String = localized(language, "name") ?: name ?: slug

    fun localizedDescription(language: String): String = localized(language, "description") ?: description.orEmpty()

    private fun localized(language: String, field: String): String? =
        ((names?.get(packLanguage(language)) as? JsonObject)?.get(field) as? JsonPrimitive)
            ?.contentOrNull?.takeIf { it.isNotBlank() }

    companion object {
        /** `pt-BR` ⇒ `pt` : les packs nomment leurs langues par leur code court. */
        fun packLanguage(language: String): String =
            language.lowercase().split('-', '_').firstOrNull()?.takeIf { it.isNotEmpty() } ?: "fr"
    }
}

object ShopPackListSerializer : LossyListSerializer<ShopPack>(ShopPack.serializer())

/** Les packs d'UN domaine dans la réponse de `GET /packs/shop`. */
@Serializable
data class PackShopSection(
    val domain: String,
    @Serializable(with = ShopPackListSerializer::class) val packs: List<ShopPack> = emptyList(),
)

object PackShopSectionListSerializer : LossyListSerializer<PackShopSection>(PackShopSection.serializer())

/** `GET /packs/shop` : les domaines servis, dans l'ordre du serveur, et le solde de Meeshes. */
@Serializable
data class PackShopResponse(
    @Serializable(with = PackShopSectionListSerializer::class) val domains: List<PackShopSection> = emptyList(),
    val balance: Int? = null,
) {
    /** **Domaine absent = vitrine vide** : jamais une erreur, jamais le pack d'un autre. */
    fun packs(domain: AppearancePackDomain): List<ShopPack> =
        domains.firstOrNull { it.domain == domain.wire }?.packs.orEmpty()

    /**
     * La réponse d'un achat confirmé reprise dans la vitrine : le résumé et le solde SERVIS font foi. Un solde que la
     * réponse ne porte pas laisse celui de la vitrine, que le prochain rafraîchissement relit.
     */
    fun applying(domain: AppearancePackDomain, purchase: PackPurchaseResponse): PackShopResponse = copy(
        domains = domains.map { section ->
            if (section.domain != domain.wire) section
            else section.copy(packs = section.packs.map { if (it.slug == purchase.pack.slug) purchase.pack else it })
        },
        balance = purchase.balance ?: balance,
    )

    companion object {
        /** Les domaines que la boutique Android propose, dans l'ordre des puces. */
        val OFFERED: List<AppearancePackDomain> = listOf(
            AppearancePackDomain.WALLPAPER,
            AppearancePackDomain.AVATAR_RING,
            AppearancePackDomain.BANNER,
            AppearancePackDomain.BANNER_FRAME,
        )

        /** Le domaine d'un lien (`?domain=`), ou le premier offert pour l'absent, le blanc et l'inconnu. */
        fun domainOf(wire: String?): AppearancePackDomain =
            OFFERED.firstOrNull { it.wire == wire?.trim()?.lowercase() } ?: OFFERED.first()
    }
}

@Serializable
data class PackPurchaseRequest(val requestId: String)

/** `{ pack (owned, installed), balance }` — la réponse d'un achat, rejouée à l'identique par un rejeu du même `requestId`. */
@Serializable
data class PackPurchaseResponse(val pack: ShopPack, val balance: Int? = null)
