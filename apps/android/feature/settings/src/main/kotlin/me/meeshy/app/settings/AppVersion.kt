package me.meeshy.app.settings

import android.content.Context
import android.content.pm.PackageInfo
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal object AppVersion {
    const val UNKNOWN: String = "—"

    /** La version affichée vient du build installé ; une valeur absente ou blanche n'affiche jamais une version inventée. */
    fun display(versionName: String?): String = versionName?.trim()?.takeIf { it.isNotEmpty() } ?: UNKNOWN

    /** iOS « 3.0.0 (12) » : la version suivie du numéro de build quand il est connu et positif. */
    fun display(versionName: String?, buildNumber: Long?): String {
        val name = display(versionName)
        return if (name == UNKNOWN || buildNumber == null || buildNumber <= 0L) name else "$name ($buildNumber)"
    }

    @Suppress("DEPRECATION")
    private fun buildNumberOf(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

    fun read(context: Context): String {
        val info = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
        return display(info?.versionName, info?.let { buildNumberOf(it) })
    }
}

/** Lecture hors du thread principal ; le temps d'une image la rangée montre le tiret, jamais un numéro écrit en dur. */
@Composable
internal fun rememberAppVersionName(): String {
    val context = LocalContext.current.applicationContext
    val version: State<String> = produceState(initialValue = AppVersion.UNKNOWN, context) {
        value = withContext(Dispatchers.IO) { AppVersion.read(context) }
    }
    return version.value
}
