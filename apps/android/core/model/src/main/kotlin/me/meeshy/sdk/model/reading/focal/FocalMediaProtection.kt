package me.meeshy.sdk.model.reading.focal

sealed interface FocalMediaProtectionState {
    data object None : FocalMediaProtectionState
    data class Blurred(val isViewOnce: Boolean) : FocalMediaProtectionState
}

sealed interface FocalCellTap {
    data object Reveal : FocalCellTap
    data class OpenFullscreen(val reblurs: Boolean) : FocalCellTap
}

/** Ce que la pièce déclare d'elle-même, en primitifs (miroir des champs de `MessageAttachment`). */
data class FocalProtectedMedia(
    val isBlurred: Boolean,
    val isViewOnce: Boolean,
    val viewOnceCount: Int = 0,
    val opensFullscreen: Boolean = true,
)

/** Flou / vue unique par case de la grille — miroir de `FocalMediaProtection` (iOS). */
object FocalMediaProtection {

    fun state(
        media: FocalProtectedMedia,
        isRevealed: Boolean,
        messageRevealed: Boolean = false,
    ): FocalMediaProtectionState {
        if (isRevealed || !(media.isBlurred || media.isViewOnce)) return FocalMediaProtectionState.None
        if (messageRevealed && !media.isViewOnce) return FocalMediaProtectionState.None
        return FocalMediaProtectionState.Blurred(isViewOnce = media.isViewOnce)
    }

    fun tap(media: FocalProtectedMedia, isRevealed: Boolean, messageRevealed: Boolean): FocalCellTap {
        if (state(media, isRevealed, messageRevealed) !is FocalMediaProtectionState.Blurred) {
            return FocalCellTap.OpenFullscreen(
                reblurs = isRevealed && media.isBlurred && !media.isViewOnce,
            )
        }
        val opensFullscreenDirectly = media.isViewOnce && media.opensFullscreen
        val revealsInPlace = !opensFullscreenDirectly && media.isBlurred
        return if (revealsInPlace) FocalCellTap.Reveal else FocalCellTap.OpenFullscreen(reblurs = false)
    }

    fun showsViewOnceBadge(media: FocalProtectedMedia): Boolean =
        media.isViewOnce && media.viewOnceCount > 0
}
