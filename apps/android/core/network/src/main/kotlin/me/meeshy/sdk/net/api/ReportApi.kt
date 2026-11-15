package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.report.CreateReportRequest
import me.meeshy.sdk.model.report.ReportAck
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Content/user reporting — port of the iOS `ReportService`.
 *
 * `POST /reports` — S2, any authenticated caller (#4155). It used to be
 * `POST /admin/reports`: the only administration route this client called, and an address
 * that lied about the privilege it needed. Any hardening of the `/admin` prefix — IP
 * allow-list, WAF, reinforced logging — would have broken reporting on all three platforms
 * without anyone connecting the two. The moderator-only surfaces (report listing and review)
 * stay under `/admin` and this client never calls them.
 *
 * The old address is still served as a thin adapter for already-installed versions.
 */
interface ReportApi {
    @POST("reports")
    suspend fun create(@Body body: CreateReportRequest): ApiResponse<ReportAck>
}
