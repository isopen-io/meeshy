package me.meeshy.app.metrics

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.metrics.BackgroundExitCounts

/**
 * Lit les raisons de sortie du processus (`ApplicationExitInfo`, API 30+) postérieures à la dernière lecture et
 * les range en seaux par la fonction pure du modèle. Sous l'API 30, rend [BackgroundExitCounts.None].
 */
@Singleton
class ExitInfoReader @Inject constructor(@ApplicationContext private val context: Context) {
    private val prefs = context.getSharedPreferences("meeshy_metrics_exit", Context.MODE_PRIVATE)

    fun readNewExits(): BackgroundExitCounts {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return BackgroundExitCounts.None
        return runCatching {
            val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val since = prefs.getLong(KEY_LAST, 0L)
            val fresh = manager.getHistoricalProcessExitReasons(context.packageName, 0, 0)
                .filter { it.timestamp > since }
            fresh.maxOfOrNull { it.timestamp }?.let { prefs.edit().putLong(KEY_LAST, it).apply() }
            BackgroundExitCounts.fromReasons(fresh.map { it.reason })
        }.getOrDefault(BackgroundExitCounts.None)
    }

    private companion object { const val KEY_LAST = "last_timestamp" }
}
