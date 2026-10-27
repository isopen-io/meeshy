package me.meeshy.app.settings

import android.content.Context
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

    fun read(context: Context): String = display(
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull(),
    )
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
