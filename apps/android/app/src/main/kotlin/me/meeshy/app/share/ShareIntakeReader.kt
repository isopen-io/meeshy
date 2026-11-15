package me.meeshy.app.share

import android.content.Intent
import android.net.Uri
import me.meeshy.app.chat.IncomingShareSelection
import me.meeshy.sdk.model.share.ShareItemRepresentation

/**
 * Ce qu'un `ACTION_SEND` / `ACTION_SEND_MULTIPLE` remet à Meeshy, trié : le [text] (texte ou lien joint), les flux
 * [admitted] à copier dans l'ordre de l'expéditeur, et ce qui est écarté et DOIT être dit — [refused] (un chemin de
 * fichier, un fournisseur de Meeshy lui-même) et [overflow] (au-delà du plafond de fichiers).
 */
data class ShareIntakeBatch(
    val text: String?,
    val admitted: List<Uri>,
    val refused: Int,
    val overflow: Int,
    val declaredMime: String?,
) {
    val isEmpty: Boolean get() = text == null && admitted.isEmpty() && refused == 0 && overflow == 0
}

/**
 * **Le récepteur d'intent du partage entrant** — miroir de `ShareItemRepresentation.choose` (extension iOS) : le lien d'abord
 * quand il est le sujet (Chrome, YouTube mettent le lien d'une page à côté de sa vignette : c'est le lien qu'on partage), le
 * média sinon (une photo de Google Photos arrive en flux, jamais son chemin).
 *
 * Le flux d'une autre app est du contenu NON FIABLE : seul ce que [admits] accepte est gardé (`content://` d'une autre app),
 * jamais un `file://` (lu avec NOS droits) ni un de nos fournisseurs. Seuls les flux d'`EXTRA_STREAM` sont lus.
 */
class ShareIntakeReader(private val admits: (Uri) -> Boolean) {
    fun read(intent: Intent?): ShareIntakeBatch {
        val action = intent?.action
        if (intent == null || (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE)) return EMPTY
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        val declared = intent.type
        val linkIsTheSubject = ShareItemRepresentation.choose(listOfNotNull(declared), text) == ShareItemRepresentation.Link
        if (linkIsTheSubject) return ShareIntakeBatch(text, emptyList(), refused = 0, overflow = 0, declaredMime = declared)
        val selection = IncomingShareSelection.of(intent, admits)
        return ShareIntakeBatch(text, selection.admitted, selection.refused, selection.overflow, declared)
    }

    private companion object {
        val EMPTY = ShareIntakeBatch(null, emptyList(), 0, 0, null)
    }
}
