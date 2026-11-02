package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackList
import me.meeshy.sdk.model.packs.PackPurchaseRequest
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.model.packs.ShopPackCatalogue
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Les packs d'apparence installés — port de `PackRoutes.installed` d'iOS pour les domaines
 * `wallpaper`, `avatar-ring`, `banner` et `banner-frame` (`GET /packs/<domaine>/installed`).
 *
 * Le sélecteur ne montre que ce que le lecteur POSSÈDE et a INSTALLÉ ; les dessins des packs
 * `builtin` sont embarqués (`AppearanceCatalog`) : le serveur ne dit que QUELS packs sont
 * installés. Chaque entrée de la liste se décode SEULE ([InstalledPackList]) : un pack illisible
 * tombe sans emporter la liste. Un ancien serveur qui ne connaît pas le domaine répond 404 —
 * lecture « aucun pack », jamais une erreur.
 *
 * Le domaine voyage en segment d'adresse : passer [AppearancePackDomain.wire] (voir l'extension
 * [installed]) plutôt qu'une chaîne écrite à la main.
 */
interface PackApi {
    @GET("packs/{domain}/installed")
    suspend fun installed(@Path("domain") domain: String): ApiResponse<InstalledPackList>

    /** La vitrine unique (`GET /packs/shop`) : les packs des `domains` (virgule), leur prix, leur possession et le solde. */
    @GET("packs/shop")
    suspend fun shop(@Query("domains") domains: String): ApiResponse<PackShopResponse>

    /**
     * Le repli d'un ancien serveur qui répond 404 sur la vitrine : la boutique d'UN domaine (`GET /packs/<domaine>`),
     * avec l'installation et, selon le serveur, le prix et la possession. Un domaine qu'il ne sert pas répond 404.
     */
    @GET("packs/{domain}")
    suspend fun catalogue(@Path("domain") domain: String): ApiResponse<ShopPackCatalogue>

    /** Installer un pack À MOI : `403 PACK_NOT_OWNED` s'il ne l'est pas, 404 s'il est inconnu. Répond le résumé du pack. */
    @PUT("packs/{domain}/{slug}/install")
    suspend fun install(@Path("domain") domain: String, @Path("slug") slug: String): ApiResponse<ShopPack>

    /** Retirer un pack installé (409 si le serveur le dit non retirable). Répond le résumé du pack. */
    @DELETE("packs/{domain}/{slug}/install")
    suspend fun uninstall(@Path("domain") domain: String, @Path("slug") slug: String): ApiResponse<ShopPack>

    /**
     * L'achat en Meeshes d'un pack payant. La dépense est idempotente par `(compte, requestId)` : rejouer le même
     * `requestId` rend le même pack sans second débit. Le prix est celui du registre, jamais celui du client.
     */
    @POST("packs/{domain}/{slug}/purchase")
    suspend fun purchase(
        @Path("domain") domain: String,
        @Path("slug") slug: String,
        @Body body: PackPurchaseRequest,
    ): ApiResponse<PackPurchaseResponse>
}

/** Les packs installés d'un domaine d'apparence. */
suspend fun PackApi.installed(domain: AppearancePackDomain): ApiResponse<InstalledPackList> = installed(domain.wire)

/** La vitrine des domaines [domains], dans l'ordre demandé. */
suspend fun PackApi.shop(domains: List<AppearancePackDomain>): ApiResponse<PackShopResponse> =
    shop(domains.joinToString(",") { it.wire })

/** L'achat d'un pack de [domain]. */
suspend fun PackApi.purchase(domain: AppearancePackDomain, slug: String, requestId: String): ApiResponse<PackPurchaseResponse> =
    purchase(domain.wire, slug, PackPurchaseRequest(requestId))

/** La boutique d'un domaine, pour la vitrine recomposée d'un ancien serveur. */
suspend fun PackApi.catalogue(domain: AppearancePackDomain): ApiResponse<ShopPackCatalogue> = catalogue(domain.wire)

/** Installer ([installed] vrai) ou retirer un pack de [domain] : PUT / DELETE de la même adresse. */
suspend fun PackApi.setInstalled(domain: AppearancePackDomain, slug: String, installed: Boolean): ApiResponse<ShopPack> =
    if (installed) install(domain.wire, slug) else uninstall(domain.wire, slug)
