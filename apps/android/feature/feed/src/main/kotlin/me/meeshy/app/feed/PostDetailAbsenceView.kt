package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.PostAbsenceReason
import me.meeshy.ui.component.ContentFetchFailureView

/**
 * Ecrans « rien a montrer » du detail d'un post (iOS `PostDetailView+AbsenceStates`) : meme
 * silhouette pour disparu / reseau / serveur, memes phrases que le lecteur de reels. Le choix
 * vient de [PostAbsenceReason], pur et teste ; ici on ne decide rien, on rend.
 */
@Composable
internal fun PostDetailAbsenceView(
    reason: PostAbsenceReason,
    failure: ContentFetchFailure?,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    val cause = when (reason) {
        PostAbsenceReason.NETWORK_FAILED -> ContentFetchFailure.NETWORK
        PostAbsenceReason.SERVER_FAILED -> ContentFetchFailure.SERVER
        PostAbsenceReason.UNAVAILABLE -> failure?.takeIf { it.isAbsence } ?: ContentFetchFailure.NOT_FOUND
        PostAbsenceReason.PRESENT, PostAbsenceReason.STILL_LOADING -> return
    }
    ContentFetchFailureView(
        failure = cause,
        onRetry = onRetry,
        secondaryLabel = stringResource(R.string.post_detail_back),
        onSecondary = onBack,
    )
}
