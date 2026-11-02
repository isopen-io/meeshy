package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerFormatLabel
import me.meeshy.sdk.model.composer.ComposerSceneNoun

/**
 * Le format que la scène compose, tel que ses libellés le nomment (#13913) : posé une fois par le compositeur, lu par la
 * toile, la feuille Son, sa bibliothèque et le socle. Une story par défaut — la route autonome du plateau n'en compose pas d'autre.
 */
internal val LocalComposerSceneNoun = compositionLocalOf { ComposerSceneNoun.STORY }

/** Le libellé [label] qui nomme le format en cours ; aucune surface du compositeur ne lit une chaîne écrite pour la story seule. */
@Composable
internal fun formatLabel(label: ComposerFormatLabel): String = stringResource(label.res(LocalComposerSceneNoun.current))

/** La chaîne de [label] pour [noun] : une par format, dans les sept langues. */
@StringRes
internal fun ComposerFormatLabel.res(noun: ComposerSceneNoun): Int = when (this) {
    ComposerFormatLabel.CANVAS -> noun.pick(
        story = R.string.stories_composer_canvas,
        post = R.string.stories_composer_canvas_post,
        reel = R.string.stories_composer_canvas_reel,
    )
    ComposerFormatLabel.SOUND_SHEET_TITLE -> noun.pick(
        story = R.string.story_sound_sheet_title,
        post = R.string.story_sound_sheet_title_post,
        reel = R.string.story_sound_sheet_title_reel,
    )
    ComposerFormatLabel.SOUND_LIBRARY_EMPTY_MINE -> noun.pick(
        story = R.string.story_sound_library_emptyMine,
        post = R.string.story_sound_library_emptyMine_post,
        reel = R.string.story_sound_library_emptyMine_reel,
    )
    ComposerFormatLabel.SOUND_EXTRACTION_CAPTION -> noun.pick(
        story = R.string.story_media_soundExtraction_caption_story,
        post = R.string.story_media_soundExtraction_caption,
        reel = R.string.story_media_soundExtraction_caption_reel,
    )
    ComposerFormatLabel.SOUND_EXTRACTION_HINT -> noun.pick(
        story = R.string.story_media_soundExtraction_a11yHint_story,
        post = R.string.story_media_soundExtraction_a11yHint,
        reel = R.string.story_media_soundExtraction_a11yHint_reel,
    )
    // Une story n'écrit pas de texte de post (ComposerFormatVariant.labels) : sa branche ne s'affiche jamais.
    ComposerFormatLabel.POST_TEXT -> noun.pick(
        story = R.string.composer_post_text,
        post = R.string.composer_post_text,
        reel = R.string.composer_post_text_reel,
    )
}

private fun ComposerSceneNoun.pick(@StringRes story: Int, @StringRes post: Int, @StringRes reel: Int): Int = when (this) {
    ComposerSceneNoun.STORY -> story
    ComposerSceneNoun.POST -> post
    ComposerSceneNoun.REEL -> reel
}
