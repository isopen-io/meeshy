package me.meeshy.ui.util

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle

/**
 * Règle pure de l'effacement du presse-papiers sensible (miroir de `ExpiringClipboard`
 * iOS : 30 s). On n'efface que si le presse-papiers porte toujours CE QUE NOUS Y AVONS
 * ÉCRIT : un contenu copié depuis par l'utilisateur n'est jamais détruit.
 */
public object SensitiveClipboardPolicy {
    public const val CLEAR_DELAY_MS: Long = 30_000L

    public fun shouldClear(written: String, current: String?): Boolean = current == written
}

/**
 * Écrit un secret (clé 2FA, codes de secours) marqué sensible — masqué de l'aperçu du
 * presse-papiers par le système (API 33+) — puis l'efface après [SensitiveClipboardPolicy.CLEAR_DELAY_MS].
 */
public class SensitiveClipboard(context: Context) {
    private val appContext = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())

    public fun write(label: String, text: String) {
        val manager = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        val clip = ClipData.newPlainText(label, text)
        clip.description.extras = PersistableBundle().apply { putBoolean(EXTRA_IS_SENSITIVE, true) }
        manager.setPrimaryClip(clip)
        handler.postDelayed({ clearIfUnchanged(manager, text) }, SensitiveClipboardPolicy.CLEAR_DELAY_MS)
    }

    private fun clearIfUnchanged(manager: ClipboardManager, written: String) {
        val current = runCatching {
            manager.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text?.toString()
        }.getOrNull()
        if (!SensitiveClipboardPolicy.shouldClear(written, current)) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            manager.clearPrimaryClip()
        } else {
            manager.setPrimaryClip(ClipData.newPlainText("", ""))
        }
    }

    private companion object {
        const val EXTRA_IS_SENSITIVE: String = "android.content.extra.IS_SENSITIVE"
    }
}
