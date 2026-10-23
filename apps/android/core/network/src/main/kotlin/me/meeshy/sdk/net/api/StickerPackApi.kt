package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.sticker.StickerPackList
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.net.routes.ApiRoutesStickerPacks
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * Les packs de stickers installés et leur (dés)installation — miroir de `StickerPacksEndpoint` d'iOS
 * (`/sticker-packs/installed`, `PUT|DELETE /sticker-packs/{slug}/install`).
 */
interface StickerPackApi {
    @GET(ApiRoutesStickerPacks.INSTALLED)
    suspend fun installed(): ApiResponse<StickerPackList>

    @PUT(ApiRoutesStickerPacks.BY_SLUG_INSTALL)
    suspend fun install(@Path("slug") slug: String): ApiResponse<StickerPackSummary>

    @DELETE(ApiRoutesStickerPacks.BY_SLUG_INSTALL)
    suspend fun uninstall(@Path("slug") slug: String): ApiResponse<StickerPackSummary>
}
