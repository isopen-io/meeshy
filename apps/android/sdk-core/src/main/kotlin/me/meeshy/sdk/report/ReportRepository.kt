package me.meeshy.sdk.report

import me.meeshy.sdk.model.report.ReportRequestBuilder
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ReportApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Files a report against a user — port of the iOS `ReportService.reportUser`.
 *
 * Deliberately an **online** action, not a durable outbox mutation like block/unblock. A report is
 * a one-shot user decision that expects an explicit confirmation ("Report sent") or an actionable
 * error; a silently-deferred report (delivered minutes later from the offline queue) would be
 * worse UX, not better. The call is session-gated so a signed-out caller can't fire a guaranteed
 * `401` — with no session it is inert (`null`), letting the ViewModel surface the right state.
 *
 * The reason→wire-token mapping, id guard and details sanitisation all live in the pure
 * [ReportRequestBuilder]; this repository just gates on the session, projects, and delivers.
 */
@Singleton
public class ReportRepository @Inject constructor(
    private val reportApi: ReportApi,
    private val sessionRepository: SessionRepository,
) {
    /**
     * Reports [userId] for [reason] with optional free-text [details].
     *
     * @return the network outcome, or `null` when the action is inert — no active session, or a
     *   blank [userId] (nothing to report). A non-`null` [NetworkResult] carries success/failure.
     */
    public suspend fun reportUser(
        userId: String,
        reason: ReportReason,
        details: String?,
    ): NetworkResult<Unit>? {
        sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        val request = ReportRequestBuilder.forUser(userId, reason, details) ?: return null
        return apiCall { reportApi.create(request) }.map { }
    }

    /**
     * Reports [messageId] for [reason] with optional free-text [details] — the message analogue of
     * [reportUser]. Same session gate and inert (`null`) semantics: a signed-out caller or a blank
     * [messageId] never fires a guaranteed-failing request.
     */
    public suspend fun reportMessage(
        messageId: String,
        reason: ReportReason,
        details: String?,
    ): NetworkResult<Unit>? {
        sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        val request = ReportRequestBuilder.forMessage(messageId, reason, details) ?: return null
        return apiCall { reportApi.create(request) }.map { }
    }
}
