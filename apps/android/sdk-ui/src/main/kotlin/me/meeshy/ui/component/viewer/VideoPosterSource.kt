package me.meeshy.ui.component.viewer

/**
 * The fullscreen poster mount for a video: [posterUrl] is the sharp,
 * extracted first frame (non-null only once extraction succeeded), and
 * [backdropUrl] is the blurred thumbnail shown WHILE it is still pending —
 * `null` once a sharp poster is available, since there is then nothing left
 * to cover.
 */
public data class FullscreenVideoPosterMount(
    val posterUrl: String?,
    val backdropUrl: String?,
    val isResident: Boolean,
)

/**
 * Poster plein écran d'une vidéo — port Kotlin simplifié du patron iOS
 * `VideoPosterResolver`/`VideoPosterPlan` (`VideoPosterResolver.swift`,
 * commit 4bedd04bb, #3871) et de son miroir web `resolveFullscreenVideoPoster`
 * (`apps/web/lib/images/video-poster.ts`, #3878). La vignette ne sert JAMAIS
 * de poster net : c'est un fond flou assumé tant que la première image
 * RÉELLE de la vidéo n'est pas extraite ([VideoFirstFrameExtractor],
 * `MediaMetadataRetriever`) ou pas encore résidente.
 */
public object VideoPosterSource {

    /**
     * Pure : aucune E/S. Une image extraite gagne TOUJOURS sur la vignette,
     * même si les deux sont fournies — la vignette ne doit jamais cohabiter
     * avec le poster net comme un second candidat d'affichage.
     */
    public fun resolve(
        extractedFrameUrl: String?,
        thumbnailUrl: String?,
        isExtractedResident: Boolean,
    ): FullscreenVideoPosterMount {
        if (!extractedFrameUrl.isNullOrEmpty()) {
            return FullscreenVideoPosterMount(
                posterUrl = extractedFrameUrl,
                backdropUrl = null,
                isResident = isExtractedResident,
            )
        }
        return FullscreenVideoPosterMount(posterUrl = null, backdropUrl = thumbnailUrl, isResident = false)
    }
}
