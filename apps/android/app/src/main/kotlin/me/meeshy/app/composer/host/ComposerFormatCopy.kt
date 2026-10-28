package me.meeshy.app.composer.host

import androidx.annotation.StringRes
import me.meeshy.app.R
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.FormatDenial

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
}
