package me.meeshy.app.chat.river

import me.meeshy.app.chat.ChatVoicePlayback
import me.meeshy.app.chat.ChatMessageRowActions
import me.meeshy.app.chat.withVoice
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Les gestes des pièces d'une bulle de la Rivière : ceux de la rangée du fil (`ChatMessageRow`), par
 * les MÊMES actions d'hôte — ouvrir une image, un lieu, un fichier ou un vocal est un site unique, la
 * Rivière ne réécrit rien. L'appui long d'une pièce rend la main au menu du message.
 */
internal object RiverBubbleCallbacks {

    fun attachments(bubble: BubbleContent, rows: ChatMessageRowActions, audioPlayer: ChatVoicePlayback?): BubbleCallbacks {
        val id = bubble.messageId
        return BubbleCallbacks(
            onLongPress = { rows.onLongPress(id) },
            onImageClick = { index -> rows.onImageClick(id, index) },
            onImageLongClick = { index ->
                val attachmentId = bubble.images.getOrNull(index)?.attachmentId
                if (attachmentId == null) rows.onLongPress(id) else rows.onImageLongPress(id, attachmentId)
            },
            onLocationClick = { location -> rows.onLocationClick(id, location) },
            onFileClick = { file -> rows.onFileClick(id, file.attachmentId) },
        ).withVoice(audioPlayer, bubble)
    }
}
