package me.meeshy.app.capture

import android.app.Activity
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** Inscrit un rappel de capture et rend sa désinscription. */
fun interface ScreenCaptureRegistration {
    fun register(onCapture: () -> Unit): () -> Unit
}

/**
 * Détecte les captures d'écran PENDANT que l'écran est visible (`Activity.ScreenCaptureCallback`, API 34+), le rappel
 * suivant le cycle de vie : inscrit à `onStart`, retiré à `onStop`, jamais deux fois.
 *
 * Sous l'API 34 la détection est ABSENTE ([isDetectionAvailable] faux, aucun rappel posé) : l'interface ne promet donc rien
 * qu'elle ne puisse tenir — la protection reste `FLAG_SECURE`, qui rend l'image noire. [captures] émet un signal par capture.
 */
class ScreenCaptureWatcher(
    private val registration: ScreenCaptureRegistration,
    sdkInt: Int = Build.VERSION.SDK_INT,
) : DefaultLifecycleObserver {

    val isDetectionAvailable: Boolean = sdkInt >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE

    private val mutableCaptures = MutableSharedFlow<Unit>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val captures: SharedFlow<Unit> = mutableCaptures.asSharedFlow()

    private var unregister: (() -> Unit)? = null

    override fun onStart(owner: LifecycleOwner) {
        if (!isDetectionAvailable || unregister != null) return
        unregister = runCatching { registration.register { mutableCaptures.tryEmit(Unit) } }.getOrNull()
    }

    override fun onStop(owner: LifecycleOwner) {
        val release = unregister ?: return
        unregister = null
        runCatching { release() }
    }

    companion object {
        /** Le rappel de la plateforme sur [activity] ; ne s'appelle qu'à partir de l'API 34. */
        fun forActivity(activity: Activity): ScreenCaptureWatcher = ScreenCaptureWatcher(
            ScreenCaptureRegistration { onCapture ->
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@ScreenCaptureRegistration {}
                PlatformCallback.register(activity, onCapture)
            },
        )
    }
}

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
private object PlatformCallback {
    fun register(activity: Activity, onCapture: () -> Unit): () -> Unit {
        val callback = Activity.ScreenCaptureCallback { onCapture() }
        activity.registerScreenCaptureCallback(activity.mainExecutor, callback)
        return { activity.unregisterScreenCaptureCallback(callback) }
    }
}
