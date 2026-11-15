package me.meeshy.app.feed

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.ui.component.bubble.BubbleMediaAutoDownload

/**
 * Où mène le toucher d'un média de la carte du fil : seuls l'image et la vidéo s'ouvrent dans la galerie plein écran partagée
 * (iOS `openFullscreen`), l'audio se joue sur place et le document s'ouvre hors de l'app. L'index d'un visuel est son rang PARMI
 * les visuels du post, dans l'ordre serveur.
 */
internal object FeedCardMediaRouting {
    fun isVisual(item: FeedMediaItem): Boolean = item.type == FeedMediaType.IMAGE || item.type == FeedMediaType.VIDEO

    fun visuals(media: List<FeedMediaItem>): List<FeedMediaItem> = media.filter(::isVisual)

    /** Le rang de [media] parmi les visuels, `null` pour un audio ou un document (rien à ouvrir en plein écran). */
    fun galleryIndex(media: List<FeedMediaItem>, id: String): Int? =
        visuals(media).indexOfFirst { it.id == id }.takeIf { it >= 0 }

    /** Ce que TalkBack lit pour une page du carrousel : « Média 2 sur 5 », suivi du texte alternatif (sinon de la légende). */
    fun slideLabel(position: String, text: String?): String {
        val clean = text?.trim().orEmpty()
        return if (clean.isEmpty()) position else "$position. $clean"
    }
}

/** Ce que la vidéo de la carte dit de son téléchargement. */
internal enum class FeedVideoCellMode {
    /** La politique la télécharge seule : poster et lecture, rien d'autre. */
    AUTO,

    /** La politique la retient : le poster porte un glyphe « Télécharger la vidéo », le toucher ouvre quand même la galerie. */
    MANUAL,

    /** Hors ligne : le poster reste (vignette) mais aucune lecture ne peut partir. */
    OFFLINE,
}

/**
 * La règle d'auto-téléchargement d'une vidéo de la carte — la MÊME politique que la bulle (`BubbleMediaAutoDownload`, #14639) :
 * sous 100 Ko en ligne toujours, au-delà la préférence vidéo de « Réglages › Médias », hors ligne jamais. Sans politique fournie par
 * l'hôte, rien ne part seul.
 */
internal object FeedVideoCellPolicy {
    fun mode(policy: BubbleMediaAutoDownload?, sizeBytes: Long? = null): FeedVideoCellMode = when {
        policy == null -> FeedVideoCellMode.MANUAL
        policy.condition == NetworkCondition.OFFLINE -> FeedVideoCellMode.OFFLINE
        policy.fetches(sizeBytes, MediaKind.VIDEO) -> FeedVideoCellMode.AUTO
        else -> FeedVideoCellMode.MANUAL
    }
}
