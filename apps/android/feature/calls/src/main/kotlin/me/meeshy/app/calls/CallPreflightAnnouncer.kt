package me.meeshy.app.calls

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.feature.calls.R
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dire à l'utilisateur pourquoi un appel ne part pas (iOS `CallOutgoingDial`) : jamais un toucher qui ne fait
 * rien. Les toasts sont globaux — l'écran d'appel peut ne pas exister (micro refusé, il se referme aussitôt).
 */
interface CallPreflightAnnouncer {
    /** Un autre appel est en cours : « Un appel est déjà en cours ». */
    fun busy()

    /** Micro refusé : l'appel est annulé, le toast ouvre les Réglages de l'application. */
    fun microphoneDenied()

    companion object {
        val None: CallPreflightAnnouncer = object : CallPreflightAnnouncer {
            override fun busy() = Unit
            override fun microphoneDenied() = Unit
        }
    }
}

@Singleton
class AndroidCallPreflightAnnouncer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val toasts: FeedbackToastCenter,
) : CallPreflightAnnouncer {
    override fun busy() {
        toasts.show(context.getString(R.string.call_starter_busy), FeedbackToastKind.ERROR)
    }

    override fun microphoneDenied() {
        toasts.show(context.getString(R.string.permission_microphone_denied), FeedbackToastKind.ERROR, ::openAppSettings)
    }

    private fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallPreflightAnnouncerModule {
    @Binds
    fun bindPreflightAnnouncer(impl: AndroidCallPreflightAnnouncer): CallPreflightAnnouncer
}
