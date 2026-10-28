package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import me.meeshy.sdk.model.composer.scene.SceneEffectChoice
import me.meeshy.sdk.model.composer.scene.SceneFrame
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** La cible tactile d'un choix de cadre : 44 dp, comme les contrôles du plateau. */
private val ChoiceTarget = 44.dp

/**
 * **Le panneau CADRE** (miroir de `ComposerFrameBand` iOS, #8414) : chaque média garde son format. L'auteur choisit
 * AJUSTER (le média entier, rien n'est rogné) ou REMPLIR (il couvre la scène), et le fond des bandes d'un média ajusté.
 * Sans légende — chaque choix a son nom ACCESSIBLE.
 */
@Composable
internal fun ComposerFramePanel(
    fitMode: String,
    backdrop: StoryBackdrop,
    onPickFitMode: (String) -> Unit,
    onPickBackdrop: (StoryBackdrop) -> Unit,
    modifier: Modifier = Modifier,
) {
    val title = stringResource(R.string.stories_scene_frame_title)
    Row(
        modifier = modifier.fillMaxWidth().semantics { contentDescription = title },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FitChoice(StoryFitMode.FIT, fitMode, MeeshyIcons.Photo, stringResource(R.string.stories_scene_frame_fit), onPickFitMode)
        FitChoice(StoryFitMode.FILL, fitMode, MeeshyIcons.PhotoFilled, stringResource(R.string.stories_scene_frame_fill), onPickFitMode)
        Box(Modifier.size(width = 1.dp, height = 28.dp).background(MeeshyTheme.tokens.hairline))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            items(StoryBackdrop.entries, key = { it.wire }) { fond ->
                BackdropChoice(
                    fond = fond,
                    chosen = backdrop == fond && fitMode == StoryFitMode.FIT,
                    onPick = { onPickBackdrop(fond) },
                )
            }
        }
    }
}

@Composable
private fun FitChoice(mode: String, current: String, icon: ImageVector, label: String, onPick: (String) -> Unit) {
    val chosen = current == mode
    Box(
        modifier = Modifier
            .size(ChoiceTarget)
            .clip(CircleShape)
            .background(if (chosen) MaterialTheme.colorScheme.primary else MeeshyTheme.tokens.controlFill)
            .selectable(selected = chosen, role = Role.RadioButton, onClick = { onPick(mode) })
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (chosen) MaterialTheme.colorScheme.onPrimary else MeeshyTheme.tokens.textPrimary,
        )
    }
}

@Composable
private fun BackdropChoice(fond: StoryBackdrop, chosen: Boolean, onPick: () -> Unit) {
    val label = backdropLabel(fond)
    val ring = if (chosen) MaterialTheme.colorScheme.primary else MeeshyTheme.tokens.hairline
    Box(
        modifier = Modifier
            .size(width = 36.dp, height = ChoiceTarget)
            .selectable(selected = chosen, role = Role.RadioButton, onClick = onPick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(backdropSwatch(fond))
                .border(BorderStroke(if (chosen) 3.dp else 1.dp, ring), CircleShape),
        )
    }
}

@Composable
private fun backdropSwatch(fond: StoryBackdrop): Brush = fond.solidHex?.let { hex ->
    Brush.linearGradient(listOf(hexColor(hex), hexColor(hex)))
} ?: Brush.linearGradient(listOf(MeeshyTheme.tokens.warning, MeeshyPalette.Indigo600))

@Composable
internal fun backdropLabel(fond: StoryBackdrop): String = stringResource(
    when (fond) {
        StoryBackdrop.BLUR -> R.string.stories_scene_frame_backdrop_blur
        StoryBackdrop.BLACK -> R.string.stories_scene_frame_backdrop_black
        StoryBackdrop.WHITE -> R.string.stories_scene_frame_backdrop_white
        StoryBackdrop.INDIGO -> R.string.stories_scene_frame_backdrop_indigo
        StoryBackdrop.SAND -> R.string.stories_scene_frame_backdrop_sand
    },
)

/**
 * **Le carrousel des effets de scène** (miroir de `ComposerSceneEffectCarousel` iOS, #8712) : l'effet ouvert dans la
 * colonne droite montre ici son carrousel, au pied du plateau, avec sa sortie EXPLICITE (un geste qu'il faut deviner
 * n'est pas un chemin). [visual] est le contenu du carrousel visuel (la grille de filtres) : cette vue ne le connaît pas.
 */
@Composable
internal fun ComposerSceneEffectCarousel(
    open: ComposerSceneEffect?,
    frame: SceneFrame,
    onClose: () -> Unit,
    onChoose: (SceneEffectChoice) -> Unit,
    visual: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val lastOpen = androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(open) }
    if (open != null) lastOpen.value = open
    AnimatedVisibility(
        visible = open != null,
        modifier = modifier,
        enter = slideInVertically { it / 2 } + fadeIn(),
        exit = slideOutVertically { it / 2 } + fadeOut(),
    ) {
        lastOpen.value?.let { shown -> EffectCarousel(shown, frame, onClose = onClose, onChoose = onChoose, visual = visual) }
    }
}

@Composable
private fun EffectCarousel(
    effect: ComposerSceneEffect,
    frame: SceneFrame,
    onClose: () -> Unit,
    onChoose: (SceneEffectChoice) -> Unit,
    visual: @Composable () -> Unit,
) {
    val region = stringResource(R.string.stories_scene_effects)
    Column(
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = region },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = effectLabel(effect),
                style = MaterialTheme.typography.titleSmall,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            IconButton(onClick = onClose, modifier = Modifier.heightIn(min = ChoiceTarget)) {
                Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.stories_scene_effect_close))
            }
        }
        when (effect) {
            ComposerSceneEffect.OPENING -> {
                TransitionRow(stringResource(R.string.stories_scene_effect_opening_row), frame.opening) {
                    onChoose(SceneEffectChoice.Opening(it))
                }
                TransitionRow(stringResource(R.string.stories_scene_effect_closing_row), frame.closing) {
                    onChoose(SceneEffectChoice.Closing(it))
                }
            }
            ComposerSceneEffect.VISUAL -> visual()
        }
    }
}

@Composable
private fun TransitionRow(title: String, selection: StoryTransitionEffect?, onSelect: (StoryTransitionEffect?) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.labelMedium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(
                    selected = selection == null,
                    onClick = { onSelect(null) },
                    label = { Text(stringResource(R.string.stories_scene_opening_none)) },
                )
            }
            items(StoryTransitionEffect.entries, key = { it.name }) { effect ->
                FilterChip(
                    selected = selection == effect,
                    onClick = { onSelect(effect) },
                    label = { Text(transitionLabel(effect)) },
                )
            }
        }
    }
}

@Composable
private fun transitionLabel(effect: StoryTransitionEffect): String = stringResource(
    when (effect) {
        StoryTransitionEffect.FADE -> R.string.stories_composer_filter_fade
        StoryTransitionEffect.ZOOM -> R.string.stories_scene_opening_zoom
        StoryTransitionEffect.SLIDE -> R.string.stories_scene_opening_slide
        StoryTransitionEffect.REVEAL -> R.string.stories_scene_opening_reveal
    },
)

@Composable
private fun effectLabel(effect: ComposerSceneEffect): String = stringResource(
    when (effect) {
        ComposerSceneEffect.OPENING -> R.string.stories_scene_effect_opening
        ComposerSceneEffect.VISUAL -> R.string.stories_scene_effect_visual
    },
)
