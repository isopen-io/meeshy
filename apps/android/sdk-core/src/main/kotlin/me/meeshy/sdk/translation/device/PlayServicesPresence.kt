package me.meeshy.sdk.translation.device

import android.content.Context
import android.content.pm.PackageManager

/** Les Play Services sont-ils installés ? Sans eux, ML Kit est ABSENT (jamais grisé ni en erreur). */
internal object PlayServicesPresence {
    private const val PACKAGE = "com.google.android.gms"

    fun isInstalled(context: Context): Boolean =
        try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(PACKAGE, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        } catch (_: RuntimeException) {
            false
        }
}
