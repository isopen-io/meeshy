package me.meeshy.sdk.model.packs

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
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
    /** Additif : la passerelle ne le sert pas encore pour les packs ; lu s'il vient, jamais fabriqué. */
    val coverThumbHash: String? = null,
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

    /** Le chemin de la couverture à charger ; blanc ou absent = aucune, la tuile générique reste. */
    val coverPath: String? get() = coverUrl?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * Installer / retirer est offert : à moi (gratuit ou acheté) et débloqué — le serveur refuserait sinon
     * (`403 PACK_NOT_OWNED`). Un pack déjà installé se retire toujours (iOS `togglingInstall`).
     */
    val canToggleInstall: Boolean get() = !needsPurchase && (installed || !isLocked)

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

/** `GET /packs/<domaine>` : la boutique d'UN domaine (repli d'un ancien serveur sans vitrine unique), chaque pack lu SEUL. */
@Serializable(with = ShopPackCatalogueSerializer::class)
data class ShopPackCatalogue(val packs: List<ShopPack>)

object ShopPackCatalogueSerializer : KSerializer<ShopPackCatalogue> {
    private val entries = ShopPackListSerializer

    override val descriptor: SerialDescriptor = entries.descriptor

    override fun deserialize(decoder: Decoder): ShopPackCatalogue = ShopPackCatalogue(entries.deserialize(decoder))

    override fun serialize(encoder: Encoder, value: ShopPackCatalogue) {
        entries.serialize(encoder, value.packs)
    }
}

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

    /**
     * Installer ou retirer À L'INSTANT un pack à moi : seuls `installed` et `installCount` bougent, jamais la possession
     * ni le solde. `null` si le pack est inconnu du domaine ou si le geste n'est pas offert ([ShopPack.canToggleInstall]).
     */
    fun togglingInstall(domain: AppearancePackDomain, slug: String): PackShopResponse? {
        val current = packs(domain).firstOrNull { it.slug == slug }?.takeIf { it.canToggleInstall } ?: return null
        val installed = !current.installed
        val count = (current.installCount + if (installed) 1 else -1).coerceAtLeast(0)
        return replacing(domain, current.copy(installed = installed, installCount = count))
    }

    /** Le serveur a confirmé : son `installed` et son `installCount` font foi, le reste du pack reste tel que lu. */
    fun installSettled(domain: AppearancePackDomain, confirmed: ShopPack): PackShopResponse {
        val current = packs(domain).firstOrNull { it.slug == confirmed.slug } ?: return this
        return replacing(domain, current.copy(installed = confirmed.installed, installCount = confirmed.installCount))
    }

    /** Retour en arrière du SEUL pack refusé : le solde et les autres packs gardent ce que le serveur a dit entre-temps. */
    fun restoring(domain: AppearancePackDomain, pack: ShopPack): PackShopResponse = replacing(domain, pack)

    private fun replacing(domain: AppearancePackDomain, pack: ShopPack): PackShopResponse = copy(
        domains = domains.map { section ->
            if (section.domain != domain.wire) section
            else section.copy(packs = section.packs.map { if (it.slug == pack.slug) pack else it })
        },
    )

    /** Le solde que dit `game:updated` : le serveur seul le fixe, la vitrine le reprend tel quel. */
    fun withBalance(balance: Int): PackShopResponse = copy(balance = balance)

    companion object {
        /** Les domaines que la boutique Android propose, dans l'ordre des puces. */
        val OFFERED: List<AppearancePackDomain> = listOf(
            AppearancePackDomain.WALLPAPER,
            AppearancePackDomain.AVATAR_RING,
            AppearancePackDomain.BANNER,
            AppearancePackDomain.BANNER_FRAME,
        )

        /** La vitrine recomposée domaine par domaine (repli d'un ancien serveur) : aucun solde, il n'est servi que par la vitrine. */
        fun composed(sections: List<Pair<AppearancePackDomain, List<ShopPack>>>): PackShopResponse =
            PackShopResponse(domains = sections.map { (domain, packs) -> PackShopSection(domain.wire, packs) }, balance = null)

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
