package me.meeshy.app.calls

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** Vrai quand l'appareil sait héberger un appel dans l'interface téléphonique du système. */
fun interface TelecomPlatformSupport {
    fun isSupported(): Boolean
}

/**
 * La décision, pure : une tablette sans service de connexion et ChromeOS n'ont pas d'interface
 * d'appel système. L'appel reste alors entièrement dans l'application (repli in-app).
 */
object TelecomSupportLaw {
    fun isSupported(sdkInt: Int, hasConnectionService: Boolean, hasTelecom: Boolean, isChromeOs: Boolean): Boolean =
        sdkInt >= Build.VERSION_CODES.O && !isChromeOs && (hasConnectionService || hasTelecom)
}

@Singleton
class AndroidTelecomPlatformSupport @Inject constructor(
    @ApplicationContext private val context: Context,
) : TelecomPlatformSupport {
    override fun isSupported(): Boolean {
        val pm = context.packageManager
        return TelecomSupportLaw.isSupported(
            sdkInt = Build.VERSION.SDK_INT,
            hasConnectionService = pm.hasSystemFeature(FEATURE_CONNECTION_SERVICE),
            hasTelecom = pm.hasSystemFeature(FEATURE_TELECOM),
            isChromeOs = pm.hasSystemFeature(FEATURE_CHROMEOS) || pm.hasSystemFeature(FEATURE_CHROMEOS_DEVICE),
        )
    }

    private companion object {
        const val FEATURE_CONNECTION_SERVICE = "android.software.connectionservice"
        const val FEATURE_TELECOM = "android.software.telecom"
        const val FEATURE_CHROMEOS = "org.chromium.arc"
        const val FEATURE_CHROMEOS_DEVICE = "org.chromium.arc.device_management"
    }
}
