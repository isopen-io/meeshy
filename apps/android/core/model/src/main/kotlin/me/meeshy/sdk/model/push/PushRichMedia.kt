package me.meeshy.sdk.model.push

/**
 * Ce que la bannière d'un message peut montrer de son média — miroir de `NSEEnrichmentRequest` /
 * `NotificationDetailPolicy` (iOS). Une SEULE décision, prise sur la charge : image décodable,
 * vignette d'une vidéo (jamais le fichier), vocal (libellé + durée), ou rien. Un message qui
 * déclare une protection ([PushPayload.mediaMayTravel]) n'obtient AUCUNE image, vignette ni piste.
 */
public sealed interface PushRichMedia {

    public data object None : PushRichMedia

    public data class Picture(val url: String, val mimeType: String) : PushRichMedia

    public data class VideoThumbnail(val url: String, val mimeType: String) : PushRichMedia

    public data class Voice(val durationMs: Long?) : PushRichMedia

    public companion object {
        private val DECODABLE_IMAGES = setOf(
            "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
        )

        public fun of(payload: PushPayload): PushRichMedia {
            if (!payload.mediaMayTravel) return None
            val mime = payload.attachmentMimeType?.substringBefore(';')?.trim()?.lowercase()
            val url = (payload.attachmentUrl ?: payload.firstAttachmentUrl)?.takeIf { it.isNotBlank() }
            return when {
                mime == null || mime.isEmpty() -> thumbnailPicture(payload)
                mime.startsWith("audio/") -> if (url != null) Voice(payload.attachmentDurationMs?.takeIf { it > 0 }) else None
                mime.startsWith("video/") -> videoThumbnail(payload)
                mime in DECODABLE_IMAGES -> picture(url, mime, payload.attachmentFileSize)
                else -> None
            }
        }

        /** `m:ss` (ou `h:mm:ss`) ; `null` quand la durée est absente ou nulle. */
        public fun formatDuration(durationMs: Long?): String? {
            if (durationMs == null || durationMs <= 0) return null
            val total = durationMs / 1_000
            val hours = total / 3_600
            val minutes = total % 3_600 / 60
            val seconds = total % 60
            return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
        }

        private fun picture(url: String?, mime: String, size: Long?): PushRichMedia =
            if (url != null && PushAttachmentPolicy.mayAttach(mime, size)) Picture(url, mime) else None

        private fun thumbnailPicture(payload: PushPayload): PushRichMedia {
            val thumb = payload.thumbnailUrl?.takeIf { it.isNotBlank() } ?: return None
            val mime = thumbnailMime(thumb)
            return if (mime in DECODABLE_IMAGES) Picture(thumb, mime) else None
        }

        private fun videoThumbnail(payload: PushPayload): PushRichMedia {
            val thumb = payload.thumbnailUrl?.takeIf { it.isNotBlank() } ?: return None
            val mime = thumbnailMime(thumb)
            return if (mime in DECODABLE_IMAGES) VideoThumbnail(thumb, mime) else None
        }

        private fun thumbnailMime(url: String): String =
            when (url.substringBefore('?').substringAfterLast('.', "").lowercase()) {
                "png" -> "image/png"
                "webp" -> "image/webp"
                "heic" -> "image/heic"
                "avif" -> "image/avif"
                else -> "image/jpeg"
            }
    }
}

/** Le temps réseau accordé à la photo de l'expéditeur, sans priver l'image du message. */
public object PushMediaBudget {
    public const val AVATAR_MAX_MILLIS: Long = 2_500L
    public const val MIN_USEFUL_MILLIS: Long = 300L

    public fun avatarMillis(remainingMillis: Long, pictureWanted: Boolean): Long {
        if (remainingMillis <= 0) return 0
        val share = if (pictureWanted) remainingMillis / 3 else remainingMillis
        val granted = minOf(AVATAR_MAX_MILLIS, share)
        return if (granted < MIN_USEFUL_MILLIS) 0 else granted
    }
}
