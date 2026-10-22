package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.InstalledPackList
import retrofit2.http.GET
import retrofit2.http.Path

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
}

/** Les packs installés d'un domaine d'apparence. */
suspend fun PackApi.installed(domain: AppearancePackDomain): ApiResponse<InstalledPackList> = installed(domain.wire)
