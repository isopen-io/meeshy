package me.meeshy.sdk.model.media

/**
 * **Les contrôles d'un lecteur vidéo**, en drapeaux (iOS `MeeshyVideoPlayer.ControlSet`). Les jeux nommés sont ceux
 * d'iOS : `InlineDefault` pour le fil, `InlineMinimal` pour la bulle ; aucun jeu en ligne n'ouvre le PiP.
 */
@JvmInline
public value class VideoControlSet(public val bits: Int) {
    public val isEmpty: Boolean get() = bits == 0

    public fun contains(other: VideoControlSet): Boolean = bits and other.bits == other.bits

    public operator fun plus(other: VideoControlSet): VideoControlSet = VideoControlSet(bits or other.bits)

    public operator fun minus(other: VideoControlSet): VideoControlSet = VideoControlSet(bits and other.bits.inv())

    public companion object {
        public val None: VideoControlSet = VideoControlSet(0)
        public val PlayPause: VideoControlSet = VideoControlSet(1 shl 0)
        public val Scrubber: VideoControlSet = VideoControlSet(1 shl 1)
        public val Duration: VideoControlSet = VideoControlSet(1 shl 2)
        public val Expand: VideoControlSet = VideoControlSet(1 shl 3)
        public val Download: VideoControlSet = VideoControlSet(1 shl 4)
        public val Save: VideoControlSet = VideoControlSet(1 shl 5)
        public val Share: VideoControlSet = VideoControlSet(1 shl 6)
        public val Mute: VideoControlSet = VideoControlSet(1 shl 7)
        public val Speed: VideoControlSet = VideoControlSet(1 shl 8)
        public val Close: VideoControlSet = VideoControlSet(1 shl 9)
        public val Author: VideoControlSet = VideoControlSet(1 shl 10)
        public val Airplay: VideoControlSet = VideoControlSet(1 shl 11)
        public val Pip: VideoControlSet = VideoControlSet(1 shl 12)
        public val Loop: VideoControlSet = VideoControlSet(1 shl 13)
        public val Skip: VideoControlSet = VideoControlSet(1 shl 14)

        public val InlineDefault: VideoControlSet = PlayPause + Skip + Scrubber + Duration + Expand + Airplay + Speed
        public val InlineMinimal: VideoControlSet = Mute + PlayPause + Expand
        public val FullscreenDefault: VideoControlSet =
            PlayPause + Scrubber + Duration + Save + Share + Close + Speed + Author + Mute + Airplay + Pip + Loop
        public val FullscreenPreview: VideoControlSet = FullscreenDefault - Save - Share - Author - Loop
    }
}
