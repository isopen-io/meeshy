package me.meeshy.app.chat.share

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.app.Activity

/**
 * **Les gestes qui sortent de Meeshy** : copier dans le presse-papiers et ouvrir la feuille de
 * partage du système (ACTION_SEND). Sans état : la zone d'actions reste un affichage.
 */
internal object ShareHostActions {
    private const val CLIP_LABEL = "Meeshy"

    /** Copie [text] ; faux si rien à copier ou si le service est absent. */
    fun copy(context: Context, text: String?): Boolean {
        if (text.isNullOrEmpty()) return false
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return false
        clipboard.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, text))
        return true
    }

    /** Le sélecteur ACTION_SEND d'un texte ou d'un lien. */
    fun textChooser(text: String): Intent {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        return Intent.createChooser(send, null)
    }

    /** Le sélecteur ACTION_SEND d'un fichier servi par un FileProvider ([uri] en content://). */
    fun fileChooser(uri: Uri, mimeType: String): Intent {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(CLIP_LABEL, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(send, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    /** Ouvre le sélecteur ; faux si rien à partager ou si aucune app ne répond. */
    fun shareOut(context: Context, text: String?): Boolean {
        if (text.isNullOrEmpty()) return false
        return start(context, textChooser(text))
    }

    private fun start(context: Context, intent: Intent): Boolean {
        if (!context.hasActivity()) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { context.startActivity(intent) }.isSuccess
    }

    private tailrec fun Context.hasActivity(): Boolean = when (this) {
        is Activity -> true
        is ContextWrapper -> baseContext.hasActivity()
        else -> false
    }
}
