package me.meeshy.app.calls

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import androidx.activity.result.contract.ActivityResultContract

/** Ce que l'utilisateur a répondu au dialogue système de capture d'écran. */
sealed interface MediaProjectionConsent {
    /** Accord : le couple (`resultCode`, `data`) est un jeton À USAGE UNIQUE (Android 14+). */
    class Granted(val resultCode: Int, val data: Intent) : MediaProjectionConsent

    /** Refus, annulation ou réponse inexploitable : aucune capture ne démarre. */
    data object Denied : MediaProjectionConsent

    companion object {
        fun fromResult(resultCode: Int, data: Intent?): MediaProjectionConsent =
            if (resultCode == Activity.RESULT_OK && data != null) Granted(resultCode, data) else Denied
    }
}

/**
 * Le dialogue système (`createScreenCaptureIntent`) en contrat de résultat d'activité :
 * `rememberLauncherForActivityResult(RequestMediaProjectionConsent()) { session.onConsent(it) }`.
 */
class RequestMediaProjectionConsent : ActivityResultContract<Unit, MediaProjectionConsent>() {

    override fun createIntent(context: Context, input: Unit): Intent =
        context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent()

    override fun parseResult(resultCode: Int, intent: Intent?): MediaProjectionConsent =
        MediaProjectionConsent.fromResult(resultCode, intent)
}
