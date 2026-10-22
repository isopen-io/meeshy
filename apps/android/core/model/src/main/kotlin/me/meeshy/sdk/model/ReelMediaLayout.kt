package me.meeshy.sdk.model

/**
 * Classification pure des médias d'un réel en la surface qui les rend — miroir de
 * `ReelMediaLayout` (ReelPlaybackRules.swift). Totale et qui préserve l'ordre ;
 * la vidéo l'emporte sur tout, les documents sont ignorés.
 */
public sealed interface ReelMediaLayout {
    public data object Empty : ReelMediaLayout
    public data class Video(val media: FeedMedia) : ReelMediaLayout
    public data class Images(val images: List<FeedMedia>) : ReelMediaLayout
    public data class AudioOnly(val audios: List<FeedMedia>) : ReelMediaLayout
    public data class ImagesWithAudio(val images: List<FeedMedia>, val audios: List<FeedMedia>) : ReelMediaLayout

    public companion object {
        public fun resolve(media: List<FeedMedia>): ReelMediaLayout {
            media.firstOrNull { it.type == FeedMediaType.VIDEO }?.let { return Video(it) }
            val images = media.filter { it.type == FeedMediaType.IMAGE }
            val audios = media.filter { it.type == FeedMediaType.AUDIO }
            return when {
                images.isEmpty() && audios.isEmpty() -> Empty
                audios.isEmpty() -> Images(images)
                images.isEmpty() -> AudioOnly(audios)
                else -> ImagesWithAudio(images, audios)
            }
        }

        /** Le média JOUÉ d'une surface de réel : vidéo, sinon audio, sinon image. */
        public fun primaryDisplayMedia(media: List<FeedMedia>): FeedMedia? =
            media.firstOrNull { it.type == FeedMediaType.VIDEO }
                ?: media.firstOrNull { it.type == FeedMediaType.AUDIO }
                ?: media.firstOrNull { it.type == FeedMediaType.IMAGE }

        /** Les médias d'un réel : ceux du post, sinon ceux du réel republié. */
        public fun displayMedia(own: List<FeedMedia>, reposted: List<FeedMedia>): List<FeedMedia> =
            if (own.isEmpty() && reposted.isNotEmpty()) reposted else own
    }
}
