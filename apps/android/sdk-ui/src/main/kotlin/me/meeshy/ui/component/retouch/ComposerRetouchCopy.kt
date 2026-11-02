package me.meeshy.ui.component.retouch

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.ComposerLookFamily
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons

/** Les mots de la retouche (#9351) — les clés d'iOS (`ComposerCaptureCopy`, `CallEffectsCopy`, `CallCaptureCopy`). */
internal object ComposerRetouchCopy {

    @StringRes
    fun family(family: ComposerLookFamily): Int = when (family) {
        ComposerLookFamily.FILTERS -> R.string.retouch_family_filters
        ComposerLookFamily.EFFECTS -> R.string.retouch_family_effects
        ComposerLookFamily.FRAMES -> R.string.retouch_family_frames
    }

    fun familyIcon(family: ComposerLookFamily): ImageVector = when (family) {
        ComposerLookFamily.FILTERS -> MeeshyIcons.PhotoFilter
        ComposerLookFamily.EFFECTS -> MeeshyIcons.MagicWand
        ComposerLookFamily.FRAMES -> MeeshyIcons.Wallpaper
    }

    @StringRes
    fun filter(preset: VideoFilterPreset): Int = when (preset) {
        VideoFilterPreset.Natural -> R.string.retouch_no_filter
        VideoFilterPreset.Warm -> R.string.retouch_filter_warm
        VideoFilterPreset.Cool -> R.string.retouch_filter_cool
        VideoFilterPreset.Vivid -> R.string.retouch_filter_vivid
        VideoFilterPreset.Muted -> R.string.retouch_filter_muted
    }

    @StringRes
    fun style(style: CallMontageStyle): Int = when (style) {
        CallMontageStyle.SCREEN -> R.string.retouch_style_screen
        CallMontageStyle.COVER -> R.string.retouch_style_cover
        CallMontageStyle.GOLD -> R.string.retouch_style_gold
        CallMontageStyle.REDCARPET -> R.string.retouch_style_redcarpet
        CallMontageStyle.GRID -> R.string.retouch_style_grid
        CallMontageStyle.STRIP -> R.string.retouch_style_strip
        CallMontageStyle.POLAROID -> R.string.retouch_style_polaroid
        CallMontageStyle.MAGAZINE -> R.string.retouch_style_magazine
        CallMontageStyle.FILM -> R.string.retouch_style_film
        CallMontageStyle.NEON -> R.string.retouch_style_neon
        CallMontageStyle.NOIR -> R.string.retouch_style_noir
        CallMontageStyle.COMIC -> R.string.retouch_style_comic
        CallMontageStyle.HEART -> R.string.retouch_style_heart
    }

    @StringRes
    fun effect(effect: CallFaceEffect): Int = when (effect) {
        CallFaceEffect.NONE -> R.string.retouch_effect_none
        CallFaceEffect.SMOOTHING -> R.string.retouch_effect_smoothing
        CallFaceEffect.TOAD -> R.string.retouch_effect_toad
        CallFaceEffect.ANGEL -> R.string.retouch_effect_angel
        CallFaceEffect.DEMON -> R.string.retouch_effect_demon
        CallFaceEffect.VOLCANO -> R.string.retouch_effect_volcano
    }

    /** Le nom d'une case : le filtre, l'effet (`call.effects.face.*`), le classique ou le nom du cadre. */
    @Composable
    fun itemName(item: ComposerLookStripItem): String = when (item) {
        is ComposerLookStripItem.Filter -> stringResource(filter(item.preset))
        is ComposerLookStripItem.Effect -> stringResource(effect(item.effect))
        is ComposerLookStripItem.Frame -> frameName(item.frame)
    }

    @Composable
    private fun frameName(frame: ComposerPhotoFrame): String = when (frame) {
        ComposerPhotoFrame.None -> stringResource(R.string.retouch_no_frame)
        is ComposerPhotoFrame.Montage -> when (val choice = frame.choice) {
            is CallMontageChoice.Classic -> stringResource(style(choice.style))
            is CallMontageChoice.Frame -> CallMontageFrameRule.design(choice.id)?.name.orEmpty()
        }
    }
}
