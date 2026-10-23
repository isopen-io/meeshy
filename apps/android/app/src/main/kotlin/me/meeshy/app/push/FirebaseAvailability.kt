package me.meeshy.app.push

import android.content.Context
import com.google.firebase.FirebaseApp
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Garde unique de tout code FCM : sans `google-services.json` le plugin n'est pas appliqué,
 * `FirebaseApp` n'est jamais initialisée et `FirebaseMessaging.getInstance()` lèverait.
 */
object FirebaseAvailability {
    private val warned = AtomicBoolean(false)

    fun isConfigured(context: Context): Boolean {
        val configured = runCatching {
            FirebaseApp.getApps(context.applicationContext).isNotEmpty()
        }.getOrDefault(false)
        if (!configured && warned.compareAndSet(false, true)) {
            Timber.w("Firebase non configuré (google-services.json absent) : FCM désactivé")
        }
        return configured
    }
}
