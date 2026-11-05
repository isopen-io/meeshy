package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.composer.ComposerFormatLabel
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneAccessibilityPlan
import me.meeshy.sdk.model.scene.SceneAccessibilityPlan.Label
import me.meeshy.sdk.model.scene.SceneLists
import me.meeshy.sdk.model.scene.SceneObjectMenuPlan
import me.meeshy.ui.story.canvas.edit.SceneA11yAction
import me.meeshy.ui.story.canvas.edit.SceneA11yNode
import me.meeshy.ui.story.canvas.edit.SceneAccessibilityLayer

/** La scène de la slide sélectionnée telle que le plan d'accessibilité la lit. */
internal val StoryComposerUiState.accessibleSceneLists: SceneLists
    get() {
        val slide = deck.selectedSlide
        return SceneLists(
            texts = slide.elements.map { it.toTextObject("") },
            medias = slide.placedMedia.map { placed ->
                StoryMediaObject(
                    id = placed.id,
                    postMediaId = placed.mediaId,
                    mediaType = if (placedMediaIsVideo(placed.id)) "video" else "image",
                    zIndex = placed.zIndex,
                )
            },
            stickers = slide.stickers.map { it.toSticker() },
            places = slide.places,
            audios = slide.audio,
        )
    }

/**
 * Le résumé de la composition, qui nomme le format composé (story, post, réel — #16222), puis chaque objet avec ses actions personnalisées (TalkBack). Les actions sont celles
 * du plan du menu d'appui long, restreintes à ce que l'écran sait exécuter : jamais un geste annoncé sans effet.
 */
@Composable
internal fun ComposerSceneAccessibility(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    modifier: Modifier = Modifier,
) {
    val lists = remember(state.deck.selectedSlide, state.attachments) { state.accessibleSceneLists }
    val plan = remember(lists, state.selectedSlideStrokes) {
        SceneAccessibilityPlan.build(
            lists = lists,
            hasDrawing = state.selectedSlideStrokes.isNotEmpty(),
            capabilities = SceneObjectMenuPlan.Capabilities(hasEditor = true),
        )
    }
    val nodes = plan.entries.map { entry ->
        val label = entryLabel(entry.label)
        val actions = StoryElementMenu.executable(entry.kind, entry.actions)
            .filterNot { it == SceneObjectMenuPlan.Action.DUPLICATE && !state.canDuplicateKind(entry.kind) }
            .map { action ->
                SceneA11yAction(stringResource(StoryElementMenu.labelRes(action))) {
                    performAccessibilityAction(viewModel, entry.kind, entry.id, action)
                }
            }
        SceneA11yNode(entry.id, label, actions)
    }
    val summary = plan.summary?.let { s ->
        val count = if (s.count == 1) {
            stringResource(R.string.story_composer_a11y_compositionCount_one)
        } else {
            stringResource(R.string.story_composer_a11y_compositionCount_many, s.count)
        }
        val spoken = s.labels.map { entryLabel(it) }
        stringResource(ComposerFormatLabel.COMPOSITION_SUMMARY.res(state.variant.noun), count, spoken.joinToString(", "))
    }
    SceneAccessibilityLayer(summary = summary, nodes = nodes, modifier = modifier)
}

private fun StoryComposerUiState.canDuplicateKind(kind: MeeshySceneObject.Kind): Boolean = when (kind) {
    MeeshySceneObject.Kind.TEXT -> deck.selectedCanAddTextElement
    MeeshySceneObject.Kind.STICKER -> deck.selectedCanAddSticker
    else -> false
}

private fun performAccessibilityAction(
    viewModel: StoryComposerViewModel,
    kind: MeeshySceneObject.Kind,
    id: String,
    action: SceneObjectMenuPlan.Action,
) {
    val text = kind == MeeshySceneObject.Kind.TEXT
    when (action) {
        SceneObjectMenuPlan.Action.EDIT -> viewModel.onSelectTextElement(id)
        SceneObjectMenuPlan.Action.DUPLICATE -> if (text) viewModel.onDuplicateTextElement(id) else viewModel.onDuplicateSticker(id)
        SceneObjectMenuPlan.Action.DELETE -> if (text) viewModel.onRemoveTextElement(id) else viewModel.onRemoveSticker(id)
        else -> Unit
    }
}

@Composable
private fun entryLabel(label: Label): String = when (label) {
    is Label.Text -> stringResource(R.string.composer_scene_a11y_labeled, stringResource(R.string.story_canvas_a11y_textPrefix), label.content)
    Label.EmptyText -> stringResource(R.string.story_composer_text_empty)
    is Label.Media -> stringResource(
        when {
            label.background && label.video -> R.string.story_canvas_a11y_backgroundVideo
            label.background -> R.string.story_canvas_a11y_backgroundPhoto
            label.video -> R.string.story_media_video
            else -> R.string.story_media_image
        },
    )
    is Label.Sticker -> label.unicodeName?.let { stringResource(R.string.composer_scene_a11y_sticker_named, it) }
        ?: stringResource(R.string.story_canvas_a11y_sticker)
    is Label.Place -> label.name?.let { stringResource(R.string.composer_scene_a11y_place_named, it) }
        ?: stringResource(R.string.story_canvas_a11y_location)
    Label.Audio -> stringResource(R.string.story_tool_audio)
    Label.Drawing -> stringResource(R.string.story_canvas_a11y_drawing)
}
