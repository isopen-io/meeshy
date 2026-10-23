package me.meeshy.ui.component.link

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri

/** Ce qu'a donné l'ouverture d'un lien externe. */
public enum class ExternalLinkOutcome { Opened, AddressCopied, Unavailable }

/**
 * Ouvre un lien externe (page web, `mailto:`) sans jamais planter.
 *
 * Sans application pour le servir, un `mailto:` copie l'adresse dans le presse-papiers (le
 * système l'annonce depuis Android 13) ; un autre lien ne fait rien. Équivalent de l'`openURL`
 * d'iOS, qui échoue sans planter.
 */
public fun Context.openExternalLink(url: String): ExternalLinkOutcome {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    if (this !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val opened = try {
        startActivity(intent)
        true
    } catch (noHandler: ActivityNotFoundException) {
        false
    } catch (refused: SecurityException) {
        false
    }
    if (opened) return ExternalLinkOutcome.Opened
    val address = mailtoAddress(url) ?: return ExternalLinkOutcome.Unavailable
    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        ?: return ExternalLinkOutcome.Unavailable
    clipboard.setPrimaryClip(ClipData.newPlainText(address, address))
    return ExternalLinkOutcome.AddressCopied
}

internal fun mailtoAddress(url: String): String? {
    if (!url.startsWith("mailto:", ignoreCase = true)) return null
    return Uri.decode(url.substring("mailto:".length).substringBefore('?')).takeIf { it.isNotBlank() }
}
