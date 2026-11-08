package me.meeshy.sdk.net.api

import me.meeshy.sdk.net.routes.ApiRoutesPackAssets
import okhttp3.ResponseBody
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Streaming

/**
 * Les fichiers d'un pack, adressés par leur contenu (`GET /pack-assets/<src>`, route publique). Le corps est lu en flux :
 * l'appelant le borne à la taille déclarée par la référence et vérifie l'empreinte. [file] doit être une référence
 * adressée par contenu (`PackAssetRef.of`) — jamais un chemin fourni par un tiers.
 */
interface PackAssetsApi {
    @Streaming
    @GET(ApiRoutesPackAssets.BY_FILE)
    suspend fun file(@Path("file") file: String): ResponseBody
}
