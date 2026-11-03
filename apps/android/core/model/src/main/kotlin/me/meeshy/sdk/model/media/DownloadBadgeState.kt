package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.mediacache.MediaCacheKey

/**
 * **Les trois états du badge de téléchargement d'une image** (miroir de `DownloadBadgeView`, iOS) : flèche, anneau de
 * progression avec pourcentage et « x/y », absent une fois en cache. Une loi pure : la vue la projette.
 */
public sealed interface DownloadBadgeState {
    public data object Hidden : DownloadBadgeState

    public data class Idle(val sizeBytes: Long) : DownloadBadgeState

    public data class Downloading(val percent: Int, val downloadedBytes: Long, val totalBytes: Long) : DownloadBadgeState

    public companion object {
        /**
         * Jamais de badge pour : une vidéo dont la tuile porte son lecteur (le bouton du lecteur est son seul composant
         * de téléchargement), un média optimiste ou local (`file://`, message en cours d'envoi), un média déjà sur
         * l'appareil (règle synchrone [DownloadPresence]), un média arrivé par une autre voie ([landed]).
         * Les types sans cache typé (document, localisation) n'en ont pas non plus.
         */
        public fun of(
            kind: AttachmentKind,
            fileUrl: String,
            isOptimistic: Boolean,
            isOnDevice: Boolean,
            landed: Boolean,
            progress: DownloadProgress?,
            expectedSizeBytes: Long,
            tileHostsVideoPlayer: Boolean = true,
        ): DownloadBadgeState {
            val badgeable = kind == AttachmentKind.IMAGE || (kind == AttachmentKind.VIDEO && !tileHostsVideoPlayer)
            if (!badgeable || fileUrl.isEmpty() || fileUrl.startsWith(FILE_SCHEME) || isOptimistic || isOnDevice || landed) return Hidden
            if (progress != null) {
                val total = progress.totalBytes.takeIf { it > 0 } ?: expectedSizeBytes
                val percent = if (total > 0) (progress.downloadedBytes * 100 / total).toInt().coerceIn(0, 100) else 0
                return Downloading(percent, progress.downloadedBytes, total.coerceAtLeast(0))
            }
            return Idle(expectedSizeBytes.coerceAtLeast(0))
        }

        internal const val FILE_SCHEME: String = "file://"
    }
}

/**
 * **« Ce média est-il déjà sur l'appareil ? » — UNE règle synchrone** (miroir de `AttachmentDownloadCenter.isOnDevice`,
 * iOS) : un `stat` sous la clé exacte du cache typé, sans saut d'exécuteur. Un `file://` existant compte ; sinon la clé
 * est l'URL résolue. Les surfaces la lisent au premier rendu pour ne jamais dessiner « ↓ » sur un média présent.
 */
public object DownloadPresence {
    public fun isOnDevice(
        url: String,
        inTypedStore: (cacheKey: String) -> Boolean,
        fileExists: (path: String) -> Boolean,
    ): Boolean {
        if (url.isEmpty()) return false
        if (url.startsWith(DownloadBadgeState.FILE_SCHEME)) return fileExists(url.removePrefix(DownloadBadgeState.FILE_SCHEME))
        return inTypedStore(MediaCacheKey.of(url))
    }

    /** Une image est sur l'appareil dès qu'UNE de ses formes l'est : l'original, la variante affichée ou une déclarée. */
    public fun isImageOnDevice(
        originalUrl: String,
        displayedUrl: String?,
        variantUrls: List<String>,
        inTypedStore: (cacheKey: String) -> Boolean,
        fileExists: (path: String) -> Boolean,
    ): Boolean = (listOf(originalUrl, displayedUrl.orEmpty()) + variantUrls)
        .filter { it.isNotEmpty() }
        .any { isOnDevice(it, inTypedStore, fileExists) }
}
