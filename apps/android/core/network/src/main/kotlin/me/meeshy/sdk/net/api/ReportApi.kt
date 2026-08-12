package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.report.CreateReportRequest
import me.meeshy.sdk.model.report.ReportAck
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Content/user reporting — port of the iOS `ReportService`.
 *
 * `POST /admin/reports` is open to any authenticated user (the gateway route guards only with
 * `fastify.authenticate`, not moderator role); the moderator-only surfaces are the report
 * listing and review endpoints, which the client never calls.
 */
interface ReportApi {
    @POST("admin/reports")
    suspend fun create(@Body body: CreateReportRequest): ApiResponse<ReportAck>
}
