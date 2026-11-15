package me.meeshy.sdk.report

import me.meeshy.sdk.model.report.CreateReportRequest
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
    private val signalEmitter: ReportSignalEmitter = NoOpReportSignalEmitter,
) {
    /**
     * Reports [userId] for [reason] with optional free-text [details].
     *
     * @return the network outcome, or `null` when the action is inert — no active session, or a
     *   blank [userId] (nothing to report). A non-`null` [NetworkResult] carries success/failure.
     *   A successful report of a social target also emits the negative `report_submit` signal
     *   (reason code only, never the free text); a failed one emits nothing.
     */
    public suspend fun reportUser(userId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? =
        deliver(ReportRequestBuilder.forUser(userId, reason, details), ReportedSocialKind.PROFILE)

    /**
     * Reports [messageId] for [reason] with optional free-text [details] — the message analogue of
     * [reportUser]. Same session gate and inert (`null`) semantics; a message report emits no signal.
     */
    public suspend fun reportMessage(messageId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? =
        deliver(ReportRequestBuilder.forMessage(messageId, reason, details), null)

    /** L'analogue post de [reportUser] — memes gardes de session et d'inertie. */
    public suspend fun reportPost(postId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? =
        deliver(ReportRequestBuilder.forPost(postId, reason, details), ReportedSocialKind.POST)

    /** L'analogue story de [reportUser] — memes gardes de session et d'inertie. */
    public suspend fun reportStory(storyId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? =
        deliver(ReportRequestBuilder.forStory(storyId, reason, details), ReportedSocialKind.STORY)

    /** Un commentaire de post, de reel ou de story — memes gardes que [reportUser], signal social. */
    public suspend fun reportComment(commentId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? =
        deliver(ReportRequestBuilder.forComment(commentId, reason, details), ReportedSocialKind.COMMENT)

    /** Une conversation — memes gardes que [reportUser] ; comme un message, elle n'emet aucun signal. */
    public suspend fun reportConversation(
        conversationId: String,
        reason: ReportReason,
        details: String?,
    ): NetworkResult<Unit>? =
        deliver(ReportRequestBuilder.forConversation(conversationId, reason, details), null)

    private suspend fun deliver(request: CreateReportRequest?, signalKind: ReportedSocialKind?): NetworkResult<Unit>? {
        sessionRepository.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        request ?: return null
        val result = apiCall { reportApi.create(request) }.map { }
        if (signalKind != null && result.isSuccess) {
            signalEmitter.emitReported(signalKind, request.reportedEntityId, request.reportType)
        }
        return result
    }
}
