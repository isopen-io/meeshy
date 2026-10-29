package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile

/** Ce que devient le toucher d'une rangée de pièce du fil. */
internal sealed interface ThreadPieceOpening {
    /**
     * Une vidéo : le lecteur plein écran de Meeshy (`MeeshyVideoViewer`, avec son PiP), jamais l'application système.
     * [secure] : la pièce disparaît ou la loi de capture la retient — fenêtre exclue des captures, aucune copie en
     * cache disque, aucune fenêtre flottante.
     */
    data class Video(val url: String, val secure: Boolean) : ThreadPieceOpening

    /** Un autre fichier : le circuit du fil, téléchargement puis ouverture par `ACTION_VIEW`. */
    data object ExternalFile : ThreadPieceOpening

    /** Rien : pièce scellée, sans adresse, protégée hors vidéo, ou vue unique déjà consumée par ce lecteur. */
    data object Nothing : ThreadPieceOpening
}

/**
 * Le routage PUR du toucher d'une pièce du fil (iOS : une vidéo de bulle s'ouvre en plein écran dans l'app). Une vidéo
 * protégée (vue unique, floutée, éphémère) s'ouvre depuis SA bulle dans la couche sécurisée, comme une photo protégée
 * dans la galerie (`ConversationMediaGallery`), et plus jamais une fois que ce lecteur a consumé sa vue unique.
 */
internal object ThreadPieceOpener {
    fun of(bubble: BubbleContent, file: BubbleFile): ThreadPieceOpening {
        val url = file.url?.takeIf { it.isNotBlank() }
        if (file.isSealed || url == null || bubble.isDeleted) return ThreadPieceOpening.Nothing
        if (!file.isVideo) return if (file.isProtected) ThreadPieceOpening.Nothing else ThreadPieceOpening.ExternalFile
        if (bubble.isViewOnce && bubble.isViewOnceOpenedByMe) return ThreadPieceOpening.Nothing
        val secure = file.isProtected || bubble.isViewOnce || bubble.isBlurred || bubble.blurReveal != null ||
            bubble.exitOffer.capture.shieldsCapture()
        return ThreadPieceOpening.Video(url, secure)
    }
}
