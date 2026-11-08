package me.meeshy.app.push

import android.content.Context
import androidx.annotation.StringRes
import me.meeshy.app.R

/**
 * Le substitut localisé d'un message PROTÉGÉ (`notificationLocKey` : vue unique, éphémère, masqué, chiffré). Le texte
 * d'une bannière protégée est CE libellé, jamais un contenu : aucune image, transcription, vignette ni nom de fichier
 * ne l'accompagne (garde de `RichMediaEnricher`). Une clé inconnue (type neuf) rend un libellé générique protégé.
 */
object PushProtectedPlaceholder {

    @StringRes
    fun resourceFor(locKey: String): Int = when (locKey.trim()) {
        "notification.view_once_message" -> R.string.push_placeholder_view_once
        "notification.ephemeral_message" -> R.string.push_placeholder_ephemeral
        "notification.hidden_message" -> R.string.push_placeholder_hidden
        "notification.encrypted_message" -> R.string.push_placeholder_encrypted
        else -> R.string.push_placeholder_hidden
    }

    fun text(context: Context, locKey: String?): String? =
        locKey?.takeIf { it.isNotBlank() }?.let { context.getString(resourceFor(it)) }
}
