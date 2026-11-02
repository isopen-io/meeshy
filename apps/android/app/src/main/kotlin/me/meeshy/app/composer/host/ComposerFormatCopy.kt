package me.meeshy.app.composer.host

import androidx.annotation.StringRes
import me.meeshy.app.R
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.FormatDenial
import me.meeshy.ui.icons.MeeshyIcons

/** Libellés des formats et de leurs refus — jamais un littéral : tout passe par le catalogue partagé avec iOS. */
object ComposerFormatCopy {
    @StringRes
    fun label(format: ComposerFormat): Int = when (format) {
        ComposerFormat.STORY -> R.string.composer_format_story
        ComposerFormat.POST -> R.string.composer_format_post
        ComposerFormat.REEL -> R.string.composer_format_reel
        ComposerFormat.STATUS -> R.string.composer_format_status
    }

    @StringRes
    fun reason(denial: FormatDenial): Int = when (denial) {
        FormatDenial.REEL_NEEDS_MATERIAL -> R.string.composer_format_denied_reel
        FormatDenial.MOOD_TEXT_ONLY -> R.string.composer_format_denied_mood
        FormatDenial.MOOD_EMPTY -> R.string.composer_format_denied_mood_empty
        FormatDenial.STORY_FROM_THIS_DOOR -> R.string.composer_format_denied_story
        FormatDenial.POST_UNAVAILABLE -> R.string.composer_format_denied_post
    }

    /** Ce que l'auteur VERRA, jamais le nom interne du mode (iOS `ComposerMosaicChoice.label`). */
    @StringRes
    fun layoutLabel(mode: MosaicLayoutMode): Int = when (mode) {
        MosaicLayoutMode.CAROUSEL -> R.string.composer_mosaic_carousel
        MosaicLayoutMode.REEL -> R.string.composer_mosaic_reel
        MosaicLayoutMode.HERO -> R.string.composer_mosaic_hero
        MosaicLayoutMode.WAVE -> R.string.composer_mosaic_wave
        MosaicLayoutMode.SINE -> R.string.composer_mosaic_sine
    }

    /** Le glyphe ANNONCE la géométrie du mode (iOS `ComposerMosaicChoice.symbol`). */
    fun layoutIcon(mode: MosaicLayoutMode): ImageVector = when (mode) {
        MosaicLayoutMode.CAROUSEL -> MeeshyIcons.Layers
        MosaicLayoutMode.REEL -> MeeshyIcons.Slideshow
        MosaicLayoutMode.HERO -> MeeshyIcons.VerticalSplit
        MosaicLayoutMode.WAVE -> MeeshyIcons.ChartBar
        MosaicLayoutMode.SINE -> MeeshyIcons.ChartLine
    }
}
