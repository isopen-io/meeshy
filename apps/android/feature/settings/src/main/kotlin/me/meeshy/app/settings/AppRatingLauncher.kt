package me.meeshy.app.settings

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import com.google.android.play.core.review.ReviewManagerFactory
import com.google.android.play.core.ktx.launchReview
import com.google.android.play.core.ktx.requestReview
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.support.SupportPresentationBuilder
import me.meeshy.ui.component.link.openExternalLink

/**
 * « Noter l'app » : l'avis intégré de Google Play ; sans services Play (ou si le flux est refusé), la
 * fiche Play Store s'ouvre à la place. Toute la décision de repli vit ici, l'écran ne fait qu'appeler.
 */
internal object AppRatingLauncher {

    suspend fun rate(context: Context, applicationId: String) {
        if (requestInAppReview(context)) return
        context.openExternalLink(SupportPresentationBuilder.playListingUrl(applicationId))
    }

    private suspend fun requestInAppReview(context: Context): Boolean {
        val activity = context.findActivity() ?: return false
        return try {
            val manager = ReviewManagerFactory.create(activity)
            manager.launchReview(activity, manager.requestReview())
            true
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (unavailable: Exception) {
            false
        }
    }

    private tailrec fun Context.findActivity(): Activity? = when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
}
