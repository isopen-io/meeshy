package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import me.meeshy.sdk.model.piece.PieceBadge
import me.meeshy.sdk.model.piece.PieceTransfer

/**
 * **Où en sont les pièces-fichiers du fil** (#13492) : celle qui se télécharge MAINTENANT (l'hôte n'en suit qu'une à la
 * fois) et celles reçues pendant cette session. L'hôte le fournit à tout le fil ; chaque rangée en tire son badge par
 * la loi pure [PieceBadge] — la rangée ne pose aucune question à un contrôleur.
 */
@Immutable
public data class BubbleFileTransfers(
    val activeAttachmentId: String? = null,
    val active: PieceTransfer? = null,
    val readyAttachmentIds: Set<String> = emptySet(),
) {
    internal fun badgeOf(file: BubbleFile): PieceBadge = PieceBadge.of(
        isSealed = file.isSealed,
        hasUrl = !file.url.isNullOrBlank(),
        isOnDevice = file.isOnDevice,
        transfer = active.takeIf { activeAttachmentId == file.attachmentId },
        isReady = file.attachmentId in readyAttachmentIds,
        sizeBytes = file.sizeBytes,
    )

    public companion object {
        public val None: BubbleFileTransfers = BubbleFileTransfers()
    }
}

public val LocalBubbleFileTransfers = compositionLocalOf { BubbleFileTransfers.None }
