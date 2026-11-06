package me.meeshy.app.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostCommentSettingsRepository
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository

/**
 * Les gestes du menu « ⋯ » d'une carte qui changent le fil — suppression, signalement, épinglage — sortis du
 * [FeedViewModel] (iOS `FeedViewModel+PostActions`). Chacun répond tout de suite et dit son issue par un
 * [FeedNotice] : la suppression retire la carte avant le réseau et la remet À SA PLACE si l'appel échoue.
 */
internal class FeedPostActionsDelegate(
    private val posts: PostRepository,
    private val reports: ReportRepository,
    private val scope: CoroutineScope,
    private val head: MutableStateFlow<FeedRealtimeHead>,
    private val notify: (FeedNotice) -> Unit,
    private val commentSettings: PostCommentSettingsRepository? = null,
) {

    /**
     * #16541 — ferme ([disabled]) ou rouvre les commentaires d'une carte : la ligne du fil bascule avant le réseau
     * ([PostCommentSettingsRepository]) et revient sur un refus, que le fil dit.
     */
    fun toggleComments(postId: String, disabled: Boolean) {
        val settings = commentSettings ?: return
        scope.launch {
            if (attempt { settings.setCommentsDisabled(postId, disabled) } !is NetworkResult.Success) notify(FeedNotice.COMMENT_SETTINGS_FAILED)
        }
    }

    /** Épingle un de SES posts ; le rafraîchissement fait remonter `isPinned`. */
    fun pin(postId: String) {
        scope.launch {
            when (attempt { posts.pinPost(postId) }) {
                is NetworkResult.Success -> {
                    notify(FeedNotice.PINNED)
                    posts.refresh()
                }
                else -> notify(FeedNotice.PIN_FAILED)
            }
        }
    }

    /** Retrait immédiat ; un refus du serveur remet la carte à son index d'origine. */
    fun delete(postId: String) {
        val before = head.value
        val index = before.posts.indexOfFirst { it.id == postId }
        val arrival = before.posts.getOrNull(index)
        head.update { FeedRealtimeReducer.remove(it, postId) }
        scope.launch {
            when (attempt { posts.delete(postId) }) {
                is NetworkResult.Success -> {
                    notify(FeedNotice.DELETED)
                    posts.refresh()
                }
                else -> {
                    head.update { FeedRealtimeReducer.restore(it, postId, arrival, index) }
                    notify(FeedNotice.DELETE_FAILED)
                }
            }
        }
    }

    /** Signale [postId] pour le motif choisi et confirme l'envoi, ou dit l'échec. */
    fun report(postId: String, reason: ReportReason) {
        scope.launch {
            val sent = attempt { reports.reportPost(postId, reason, details = null) } is NetworkResult.Success
            notify(if (sent) FeedNotice.REPORTED else FeedNotice.REPORT_FAILED)
        }
    }

    private suspend fun <T> attempt(call: suspend () -> NetworkResult<T>?): NetworkResult<T>? =
        try {
            call()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
}
