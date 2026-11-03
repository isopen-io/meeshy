package me.meeshy.sdk.model.media

/** Ce que la vignette d'une vidéo de bulle porte par-dessus le poster : rien, « ↓ taille », un anneau, ou « réessayer ». */
public sealed interface VideoBadge {
    public data object None : VideoBadge

    /** « ↓ 2 MB » ; [sizeLabel] est `null` quand la taille est inconnue. */
    public data class Download(val sizeLabel: String?) : VideoBadge

    /** Anneau de téléchargement, [fraction] dans [0, 1] (0 = indéterminé). */
    public data class Ring(val fraction: Double) : VideoBadge

    /** « Vidéo indisponible. Réessayer. » */
    public data object Unavailable : VideoBadge
}

/** Les états de disponibilité d'une vidéo de bulle, déduits de [MediaAvailabilityResolution] (loi unique). */
public object VideoAvailabilityRules {

    public fun badge(facts: MediaAvailabilityFacts): VideoBadge = when (val state = MediaAvailabilityResolution.resolve(facts)) {
        MediaAvailabilityState.Ready -> VideoBadge.None
        is MediaAvailabilityState.NeedsDownload -> VideoBadge.Download(state.sizeLabel)
        is MediaAvailabilityState.Downloading -> VideoBadge.Ring(state.progress)
        is MediaAvailabilityState.Failed -> VideoBadge.Unavailable
    }

    /** Un envoi local (`file:` / `content:`) : son poster est celui de l'appareil, sans badge de téléchargement. */
    public fun isLocalUri(url: String?): Boolean =
        url != null && (url.startsWith("file://") || url.startsWith("content://"))
}
