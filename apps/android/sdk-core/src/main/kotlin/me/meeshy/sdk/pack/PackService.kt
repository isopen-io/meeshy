package me.meeshy.sdk.pack

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.appearance.decodeLossyList
import me.meeshy.sdk.model.pack.InstallablePack
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.packs.PackPurchaseRequest
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.net.api.PackRawApi
import me.meeshy.sdk.net.api.StickerPackRawApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Pourquoi un geste sur un pack n'a pas abouti ; [httpStatus] et [code] disent ce que la passerelle a répondu. */
class PackServiceException(
    val kind: Kind,
    val httpStatus: Int? = null,
    val code: String? = null,
) : Exception("pack service: $kind ($httpStatus $code)") {
    enum class Kind {
        /** Le domaine n'est pas routable par ce client (`UNKNOWN`). */
        UNROUTABLE_DOMAIN,

        /** Aucun prix possible dans ce domaine : pas d'adresse d'achat. */
        NOT_PURCHASABLE,

        /** Le réseau n'a pas répondu (aucun statut HTTP). */
        OFFLINE,

        /** La passerelle a répondu non. */
        REJECTED,

        /** La réponse n'a pas la forme attendue. */
        UNREADABLE,
    }
}

/** Les appels d'un domaine, sans modèle : le contrat que [PackService] décode. Le domaine choisit l'adresse. */
interface PackTransport {
    suspend fun catalogue(domain: PackDomain): NetworkResult<JsonElement>
    suspend fun installed(domain: PackDomain): NetworkResult<JsonElement>
    suspend fun detail(domain: PackDomain, slug: String): NetworkResult<JsonElement>
    suspend fun setInstalled(domain: PackDomain, slug: String, installed: Boolean): NetworkResult<JsonElement>
    suspend fun purchase(domain: PackDomain, slug: String, requestId: String): NetworkResult<PackPurchaseResponse>
}

/**
 * Le transport réel : `/sticker-packs` pour les stickers (contrat INCHANGÉ à l'octet), `/packs/<domaine>` pour les
 * autres. Un domaine inconnu n'arrive jamais ici ([PackService] le refuse avant).
 */
@Singleton
class RoutedPackTransport @Inject constructor(
    private val packs: PackRawApi,
    private val stickers: StickerPackRawApi,
    private val purchases: PackApi,
) : PackTransport {
    override suspend fun catalogue(domain: PackDomain) =
        apiCall { if (domain == PackDomain.STICKER) stickers.catalogue() else packs.catalogue(domain.segment()) }

    override suspend fun installed(domain: PackDomain) =
        apiCall { if (domain == PackDomain.STICKER) stickers.installed() else packs.installed(domain.segment()) }

    override suspend fun detail(domain: PackDomain, slug: String) =
        apiCall { if (domain == PackDomain.STICKER) stickers.detail(slug) else packs.detail(domain.segment(), slug) }

    override suspend fun setInstalled(domain: PackDomain, slug: String, installed: Boolean) = apiCall {
        when {
            domain == PackDomain.STICKER -> if (installed) stickers.install(slug) else stickers.uninstall(slug)
            installed -> packs.install(domain.segment(), slug)
            else -> packs.uninstall(domain.segment(), slug)
        }
    }

    override suspend fun purchase(domain: PackDomain, slug: String, requestId: String) =
        apiCall { purchases.purchase(domain.segment(), slug, PackPurchaseRequest(requestId)) }

    private fun PackDomain.segment(): String = checkNotNull(wire) { "domaine non routable" }
}

/**
 * **Le service d'un domaine** — le même code pour les stickers et les packs d'apparence (miroir de `PackService<Pack>`
 * d'iOS). Service bas niveau : il parle à la route, il ne décide de rien ; le cache, la bascule optimiste et son
 * retour en arrière vivent dans [PackStore]. Chaque liste se décode PAR ITEM : un pack illisible ou d'un domaine futur
 * tombe seul, la boutique reste.
 */
class PackService<P : InstallablePack<P>>(
    val domain: PackDomain,
    private val serializer: KSerializer<P>,
    private val transport: PackTransport,
    private val json: Json = LENIENT,
) {
    suspend fun catalogue(): List<P> {
        routable()
        return list(transport.catalogue(domain))
    }

    suspend fun installed(): List<P> {
        routable()
        return list(transport.installed(domain))
    }

    suspend fun detail(slug: String): P {
        routable()
        return one(transport.detail(domain, slug))
    }

    /** Installer (`PUT`) ou retirer (`DELETE`) un pack ; rend son résumé à jour. Rejouable : le serveur est idempotent. */
    suspend fun setInstalled(installed: Boolean, slug: String): P {
        routable()
        return one(transport.setInstalled(domain, slug, installed))
    }

    /**
     * Acheter un pack. [requestId] naît AU GESTE chez l'appelant et se réutilise pour tout nouvel essai : le serveur ne
     * débite qu'une fois. Le client n'envoie jamais de prix. Un refus lève [PackServiceException.Kind.REJECTED] avec le
     * statut et le code structurés.
     */
    suspend fun purchase(slug: String, requestId: String): PackPurchaseResponse {
        routable()
        if (!domain.isPurchasable) throw PackServiceException(PackServiceException.Kind.NOT_PURCHASABLE)
        return unwrap(transport.purchase(domain, slug, requestId))
    }

    private fun routable() {
        if (!domain.isRoutable) throw PackServiceException(PackServiceException.Kind.UNROUTABLE_DOMAIN)
    }

    private fun list(result: NetworkResult<JsonElement>): List<P> =
        json.decodeLossyList(unwrap(result), serializer)

    private fun one(result: NetworkResult<JsonElement>): P =
        try {
            json.decodeFromJsonElement(serializer, unwrap(result))
        } catch (_: IllegalArgumentException) {
            throw PackServiceException(PackServiceException.Kind.UNREADABLE)
        }

    private fun <T> unwrap(result: NetworkResult<T>): T = when (result) {
        is NetworkResult.Success -> result.data
        is NetworkResult.Failure -> throw result.error.toException()
    }

    private fun ApiError.toException() = PackServiceException(
        kind = if (httpStatus == null) PackServiceException.Kind.OFFLINE else PackServiceException.Kind.REJECTED,
        httpStatus = httpStatus,
        code = code,
    )

    companion object {
        /** Un champ inconnu d'une passerelle plus récente se tolère. */
        val LENIENT: Json = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }
    }
}
