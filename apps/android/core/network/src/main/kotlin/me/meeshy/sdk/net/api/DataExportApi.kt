package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.export.DataExportData
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * GDPR data export — port of the iOS `DataExportService` (feature-parity §L).
 *
 * `GET /api/v1/me/export` is guarded by `fastify.authenticate` (routes/me/export.ts); it returns
 * the export payload for the caller's own account. `types` is a comma-separated subset of
 * `profile,messages,contacts`; `format` is `json` or `csv`.
 */
interface DataExportApi {
    @GET("me/export")
    suspend fun export(
        @Query("format") format: String,
        @Query("types") types: String,
    ): ApiResponse<DataExportData>
}
