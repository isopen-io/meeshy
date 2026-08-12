package me.meeshy.sdk.export

import me.meeshy.sdk.model.export.DataExportData
import me.meeshy.sdk.model.export.DataExportRequestBuilder
import me.meeshy.sdk.model.export.DataExportSelection
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.DataExportApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Requests a GDPR data export for the signed-in user — port of the iOS `DataExportService`.
 *
 * Deliberately an **online** action, not a durable outbox mutation: an export is a one-shot user
 * request that expects the payload back now (to save/share), and the gateway builds it on demand
 * from a live DB read — there is nothing to defer. The call is session-gated so a signed-out caller
 * can't fire a guaranteed `401`; with no active session it is inert (`null`), letting the ViewModel
 * surface the right state.
 *
 * The scope→query projection (always-on `profile`, `types` order, `format` token) lives in the pure
 * [DataExportRequestBuilder]; this repository just gates on the session, projects, and delivers.
 */
@Singleton
public class DataExportRepository @Inject constructor(
    private val dataExportApi: DataExportApi,
    private val sessionRepository: SessionRepository,
) {
    /**
     * Exports the caller's data for the chosen [selection].
     *
     * @return the network outcome, or `null` when inert — no active session. A non-`null`
     *   [NetworkResult] carries the parsed [DataExportData] on success or the failure.
     */
    public suspend fun export(selection: DataExportSelection): NetworkResult<DataExportData>? {
        sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        val query = DataExportRequestBuilder.build(selection)
        return apiCall { dataExportApi.export(format = query.format, types = query.types) }
    }
}
