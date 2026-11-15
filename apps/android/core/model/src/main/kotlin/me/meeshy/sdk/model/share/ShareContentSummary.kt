package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment

/**
 * **« Ce qui part », côté loi** (V1–V3) — miroir de `ShareMessagePreview`, de l'en-tête et des cartes de
 * `ShareContentZone` (iOS). Même mot que la ligne de liste et que le web : le texte, sinon « Sticker »,
 * sinon le type de la pièce et son nombre. Pur : l'écran ne fait que projeter.
 */

enum class SharePieceKind {
    IMAGE, VIDEO, AUDIO, FILE;

    companion object {
        fun of(mimeType: String?): SharePieceKind {
            val mime = mimeType.orEmpty().lowercase()
            return when {
                mime.startsWith("image/") -> IMAGE
                mime.startsWith("video/") -> VIDEO
                mime.startsWith("audio/") -> AUDIO
                else -> FILE
            }
        }
    }
}

sealed interface ShareMessagePreview {
    data class Text(val text: String) : ShareMessagePreview
    data object Sticker : ShareMessagePreview
    data class Media(val kind: SharePieceKind, val count: Int) : ShareMessagePreview

    /** Rien à montrer : « [Média] ». */
    data object Placeholder : ShareMessagePreview
}

sealed interface ShareContentTitle {
    data object Plain : ShareContentTitle

    /** « Ce qui part · N messages sur M ». */
    data class MessagesKept(val kept: Int, val total: Int) : ShareContentTitle

    /** « Ce qui part · Pièce i sur n ». */
    data class PieceOf(val index: Int, val count: Int) : ShareContentTitle

    /** « Ce qui part · N » — les fichiers venus d'une autre app. */
    data class IncomingCount(val count: Int) : ShareContentTitle
}

data class ShareContentHeader(
    val title: ShareContentTitle,
    /** « Retirer les N derniers » — seulement pour des fichiers entrants qui dépassent. */
    val removeLastCount: Int?,
    /** « Tout le message » — seulement pour une pièce seule. */
    val offersWholeMessage: Boolean,
)

/** Une ligne de message de la zone. [withdrawn] non nul : atténuée à [WITHDRAWN_ALPHA], avec son motif. */
data class ShareMessageRow(
    val id: String,
    val senderName: String?,
    val preview: ShareMessagePreview,
    val withdrawn: ShareWithdrawReason?,
    val removable: Boolean,
    /** La première pièce, pour la vignette (jamais d'une ligne retirée du plan). */
    val thumbnail: ApiMessageAttachment?,
) {
    companion object {
        const val WITHDRAWN_ALPHA: Float = 0.4f
    }
}

/** « <motif> Les N autres messages partent. » */
data class ShareWithdrawnNote(val reason: ShareWithdrawReason, val othersLeaving: Int)

enum class ShareInfoKind { TEXT, LINK, CARD }

/** La carte d'un texte, d'un lien ou d'une carte Meeshy. [copyableLink] non nul : « Copier le lien ». */
data class ShareInfoCard(
    val kind: ShareInfoKind,
    val title: String,
    val subtitle: String?,
    val imageUrl: String?,
    val copyableLink: String?,
    val cardKind: ShareCardKind? = null,
)

object ShareContentSummary {

    fun preview(message: ApiMessage): ShareMessagePreview {
        if (message.content.isNotEmpty()) return ShareMessagePreview.Text(message.content)
        if (message.servedSticker != null) return ShareMessagePreview.Sticker
        val first = message.attachments.firstOrNull() ?: return ShareMessagePreview.Placeholder
        return ShareMessagePreview.Media(SharePieceKind.of(first.mimeType), message.attachments.size)
    }

    /** Les pièces comptées par « Pièce i sur n » : un lieu partagé n'est pas une pièce. */
    fun pieces(message: ApiMessage): List<ApiMessageAttachment> =
        message.attachments.filterNot { it.latitude != null && it.longitude != null }

    fun header(subject: ShareSubject, plan: SharePlan): ShareContentHeader {
        val title = when (subject) {
            is ShareSubject.Messages ->
                if (subject.messages.size > 1) ShareContentTitle.MessagesKept(plan.kept.size, subject.messages.size) else ShareContentTitle.Plain
            is ShareSubject.Piece -> {
                val pieces = pieces(subject.message)
                val index = pieces.indexOfFirst { it.id == subject.attachmentId }.coerceAtLeast(0) + 1
                ShareContentTitle.PieceOf(index, pieces.size)
            }
            is ShareSubject.Incoming ->
                if (subject.media.isNotEmpty()) ShareContentTitle.IncomingCount(subject.media.size) else ShareContentTitle.Plain
            else -> ShareContentTitle.Plain
        }
        val overflow = plan.limits.trimCount
        return ShareContentHeader(
            title = title,
            removeLastCount = overflow.takeIf { it > 0 && subject is ShareSubject.Incoming },
            offersWholeMessage = subject is ShareSubject.Piece,
        )
    }

    /** Les messages qui restent dans la zone, retirés exclus ; un message protégé retiré du plan y reste, atténué. */
    fun messageRows(subject: ShareSubject.Messages, removedMessageIds: Set<String>, plan: SharePlan): List<ShareMessageRow> =
        subject.messages.filter { it.id !in removedMessageIds }.map { message ->
            val withdrawn = plan.withdrawn.firstOrNull { it.id == message.id }?.reason
            ShareMessageRow(
                id = message.id,
                senderName = message.sender?.name?.takeIf { it.isNotBlank() },
                preview = preview(message),
                withdrawn = withdrawn,
                removable = plan.kept.size > 1 && withdrawn == null,
                thumbnail = message.attachments.firstOrNull().takeIf { withdrawn == null },
            )
        }

    fun withdrawnNote(plan: SharePlan): ShareWithdrawnNote? {
        val first = plan.withdrawn.firstOrNull() ?: return null
        if (plan.kept.isEmpty()) return null
        return ShareWithdrawnNote(first.reason, plan.kept.size)
    }

    /** Les cartes d'un sujet qui n'est pas un message : texte, lien, carte Meeshy, légende reçue. */
    fun infoCards(subject: ShareSubject): List<ShareInfoCard> = when (subject) {
        is ShareSubject.Messages, is ShareSubject.Piece -> emptyList()
        is ShareSubject.Text -> listOf(textCard(subject.text))
        is ShareSubject.Link -> listOf(linkCard(subject.url))
        is ShareSubject.Card -> listOf(
            ShareInfoCard(
                kind = ShareInfoKind.CARD,
                title = subject.card.title,
                subtitle = subject.card.url,
                imageUrl = subject.card.imageUrl,
                copyableLink = subject.card.url?.takeIf { it.isNotBlank() },
                cardKind = subject.card.kind,
            ),
        )
        is ShareSubject.Incoming -> when {
            subject.text.isNullOrEmpty() -> emptyList()
            subject.isLink -> listOf(linkCard(subject.text.trim()))
            else -> listOf(textCard(subject.text))
        }
    }

    private fun textCard(text: String) = ShareInfoCard(ShareInfoKind.TEXT, text, null, null, null)

    private fun linkCard(url: String) = ShareInfoCard(ShareInfoKind.LINK, hostOf(url) ?: url, url, null, url)

    private fun hostOf(url: String): String? = runCatching { java.net.URI(url).host }.getOrNull()?.takeIf { it.isNotBlank() }
}
