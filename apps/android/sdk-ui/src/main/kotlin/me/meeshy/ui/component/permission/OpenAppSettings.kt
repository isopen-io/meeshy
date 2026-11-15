package me.meeshy.ui.component.permission

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

/**
 * L'intention qui ouvre la fiche « Informations sur l'appli » de Meeshy : c'est là que se
 * réactivent les permissions et les notifications après un refus définitif, la boîte système
 * n'étant plus affichée. Équivalent d'`UIApplication.openSettingsURLString` côté iOS.
 */
public fun appSettingsIntent(context: Context): Intent =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))

/** Ouvre les détails de l'app ; rend `false` si l'appareil n'a aucun écran pour les afficher. */
public fun Context.openAppSettings(): Boolean {
    val intent = appSettingsIntent(this)
    if (this !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        false
    }
}
