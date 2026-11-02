package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MyPermissions
import retrofit2.http.GET

/**
 * La seule adresse d'administration que l'app appelle : `GET /admin/me/permissions` (port de
 * `PermissionsService`, iOS). En S2 — lire ses propres droits n'est pas un geste d'administration,
 * et un compte ordinaire a le droit d'apprendre qu'il n'en a aucun. Le reste de `/admin` est la
 * console web (exploitation), classée ops-only par le cliquet de routes.
 */
interface AdminApi {
    @GET("admin/me/permissions")
    suspend fun myPermissions(): ApiResponse<MyPermissions>
}
