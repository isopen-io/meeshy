package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.stateDescription
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryCanvasAccessibility
import me.meeshy.ui.accessibility.AccessibilityAnnouncer

/**
 * Ce que le canvas de lecture DIT et FAIT à TalkBack (iOS `StoryCanvasAccessibility` + les actions du canvas) : un seul
 * élément qui porte le contenu (position, auteur, textes du Prisme, stickers, transcription) et des actions nommées —
 * suivante, précédente, pause, plein écran, fermeture —, pour qu'aucun geste ne dépende d'un glissé ou d'un toucher
 * de zone. Les segments sont ceux que l'écran montre : [StorySlideView.text] et les objets texte sont déjà résolus par le Prisme.
 */
internal class StoryCanvasA11yActions(
    val onNext: () -> Unit,
    val onPrevious: () -> Unit,
    val onTogglePause: () -> Unit,
    val onToggleFullscreen: () -> Unit,
    val onClose: () -> Unit,
)

@Composable
internal fun Modifier.storyCanvasAccessibility(
    slide: StorySlideView,
    index: Int,
    count: Int,
    authorName: String,
    transcript: String?,
    paused: Boolean,
    fullscreen: Boolean,
    actions: StoryCanvasA11yActions,
): Modifier {
    val position = stringResource(R.string.story_viewer_a11y_position, index + 1, count)
    val by = authorName.takeIf { it.isNotBlank() }?.let { stringResource(R.string.story_viewer_a11y_author, it) }
    val spokenTranscript = transcript?.takeIf { it.isNotBlank() }?.let { stringResource(R.string.story_viewer_a11y_transcript, it.trim()) }
    val stickerNamed = R.string.composer_scene_a11y_sticker_named
    val stickerLabels = slide.stickers.mapNotNull { sticker ->
        sticker.emoji.takeIf { it.isNotBlank() }?.let { stringResource(stickerNamed, it) }
    }
    val texts = slide.textObjects.map { it.text }.ifEmpty { listOf(slide.text) }
    val label = remember(position, by, texts, stickerLabels, spokenTranscript) {
        StoryCanvasAccessibility.label(position, by, texts, stickerLabels, spokenTranscript)
    }
    val hint = stringResource(R.string.story_a11y_hint)
    val next = stringResource(R.string.stories_viewer_next)
    val previous = stringResource(R.string.stories_viewer_previous)
    val pause = stringResource(if (paused) R.string.story_a11y_resume else R.string.story_a11y_pause)
    val screen = stringResource(if (fullscreen) R.string.stories_viewer_fullscreen_exit else R.string.stories_viewer_fullscreen_enter)
    val close = stringResource(R.string.stories_viewer_close)
    return clearAndSetSemantics {
        contentDescription = label
        stateDescription = hint
        customActions = listOf(
            CustomAccessibilityAction(next) { actions.onNext(); true },
            CustomAccessibilityAction(previous) { actions.onPrevious(); true },
            CustomAccessibilityAction(pause) { actions.onTogglePause(); true },
            CustomAccessibilityAction(screen) { actions.onToggleFullscreen(); true },
            CustomAccessibilityAction(close) { actions.onClose(); true },
        )
    }
}

/** Annonce « Story 2 sur 5 » à chaque changement de slide, tant qu'un lecteur d'écran est actif (iOS `slideChanged`). */
@Composable
internal fun StorySlideChangeAnnouncement(slideKey: String?, index: Int, count: Int) {
    val announcer = AccessibilityAnnouncer.forView(LocalView.current)
    val text = stringResource(R.string.story_viewer_a11y_position, index + 1, count)
    val first = remember { booleanArrayOf(true) }
    LaunchedEffect(slideKey) {
        if (first[0]) { first[0] = false; return@LaunchedEffect }
        announcer.announce(text)
    }
}
