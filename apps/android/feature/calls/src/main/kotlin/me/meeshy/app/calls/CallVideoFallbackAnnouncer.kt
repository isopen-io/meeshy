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
import me.meeshy.sdk.model.call.CallVideoFallback
import me.meeshy.ui.component.FeedbackKind
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dire à l'utilisateur que sa caméra n'a pas démarré et que l'appel continue en audio (iOS `continueAudioOnly`).
 * Jamais bloquant : un toast, et seul un accès refusé en porte un (« toucher pour ouvrir les Paramètres »).
 */
interface CallVideoFallbackAnnouncer {
    fun announce(fallback: CallVideoFallback)

    companion object {
        val None: CallVideoFallbackAnnouncer = object : CallVideoFallbackAnnouncer {
            override fun announce(fallback: CallVideoFallback) = Unit
        }
    }
}

@Singleton
class AndroidCallVideoFallbackAnnouncer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val toasts: CallToastBus,
    private val haptics: CallHaptics,
) : CallVideoFallbackAnnouncer {
    override fun announce(fallback: CallVideoFallback) {
        if (!fallback.warnsUser) return
        haptics.play(CallHapticKind.Warning)
        toasts.post(
            CallToast(
                message = context.getString(messageOf(fallback)),
                kind = FeedbackKind.Error,
                onTap = ::openAppSettings.takeIf { fallback == CallVideoFallback.CameraPermissionDenied },
            ),
        )
    }

    private fun messageOf(fallback: CallVideoFallback): Int = when (fallback) {
        CallVideoFallback.DeviceTooHot -> R.string.call_video_thermal_audio_only
        else -> R.string.call_video_permission_denied
    }

    private fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallVideoFallbackModule {
    @Binds
    fun bindAnnouncer(impl: AndroidCallVideoFallbackAnnouncer): CallVideoFallbackAnnouncer
}
