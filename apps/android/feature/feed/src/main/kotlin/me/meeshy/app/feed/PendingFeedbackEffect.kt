package me.meeshy.app.feed

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import me.meeshy.feature.feed.R
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * Dit une fois, avec son haptique, ce que le fil retient des gestes sur une publication en attente : relance, annulation,
 * brouillon repris. Un échec secoue (erreur), le reste confirme (succès) — comme les toasts d'iOS.
 */
@Composable
internal fun PendingFeedbackEffect(unsent: UnsentPublicationsViewModel, snackbar: SnackbarHostState) {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(unsent) {
        unsent.feedback.collect { feedback ->
            if (feedback.isError) haptics.error() else haptics.success()
            snackbar.showSnackbar(message = context.getString(feedback.messageRes))
        }
    }
}

/** Le texte d'un retour de publication : hors ligne, « en cours d'envoi » devient « en attente d'envoi » (iOS `pendingOffline`). */
internal fun FeedNotice.messageRes(offline: Boolean): Int =
    if (this == FeedNotice.PUBLISH_QUEUED && offline) R.string.feed_notice_publish_queued_offline else messageRes()

/** Haptique du retour d'une publication : succès ou erreur, selon ce que le toast annonce. */
internal fun MeeshyHaptics.forNotice(notice: FeedNotice) {
    if (notice == FeedNotice.PUBLISH_FAILED) error() else if (notice == FeedNotice.PUBLISH_QUEUED || notice == FeedNotice.PUBLISHED) success()
}
