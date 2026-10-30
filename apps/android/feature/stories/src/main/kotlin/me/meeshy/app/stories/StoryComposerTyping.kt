package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Surface as TypingSurface
import me.meeshy.sdk.model.composer.ComposerLimitNotice
import me.meeshy.ui.component.composer.rememberHostedTextField
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'état de frappe du compositeur (#13835), quand il y en a un : le texte posé qu'on écrit (sa barre de style, ses choix),
 * ou la légende ouverte par « ⋯ » (son champ collé au clavier, avec OK). Clavier OU choix : [TypingSurface] vit le temps
 * d'une écriture, et chaque bascule range ou rend le clavier sans retirer le focus du champ en place, son seul écrivain.
 */
@Composable
internal fun rememberStoryTyping(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    morePanel: StoryMorePanel?,
    onMorePanel: (StoryMorePanel?) -> Unit,
    keyboard: TypingKeyboard?,
): StoryTypingSlot? {
    val edited = state.selectedTextElement?.takeIf { state.isEditingTextElement && !state.isDrawingActive }
    val caption = morePanel == StoryMorePanel.CAPTION && edited == null && !state.isDrawingActive
    var surface by remember(edited?.id, caption) { mutableStateOf(ComposerKeyboardOrOptions.initial) }
    val controller = LocalSoftwareKeyboardController.current
    return when {
        edited != null -> StoryTypingSlot(
            surface = surface,
            bar = {
                ComposerKeyboardStyleBar(
                    surface = surface,
                    onOption = { option ->
                        surface = ComposerKeyboardOrOptions.iconTapped(surface, option)
                        if (surface is TypingSurface.Showing) controller?.hide() else controller?.show()
                    },
                    onDone = viewModel::onDeselectTextElement,
                )
            },
            options = { option -> ComposerTypingOptions(option, edited, viewModel) },
            onKeyboardRaised = { surface = ComposerKeyboardOrOptions.keyboardRaised(surface) },
            keyboard = keyboard,
        )
        caption -> StoryTypingSlot(
            surface = TypingSurface.Keyboard,
            bar = { CaptionTypingBar(state, viewModel, onDone = { onMorePanel(null) }) },
            options = {},
            onKeyboardRaised = {},
            keyboard = keyboard,
        )
        else -> null
    }
}

/**
 * La légende de la diapo, collée au clavier : le champ et OK, aucun compteur ni plafond (#13838). À la limite, et
 * seulement là, un mot bref lu poliment par TalkBack, et une vibration au geste qui l'atteint. Le clavier monte dès que la
 * fenêtre a rendu le focus (le menu « ⋯ » qui l'ouvre vient de se fermer) : avant, le système le refuserait.
 */
@Composable
private fun CaptionTypingBar(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    val caption = rememberHostedTextField(state.editorText, viewModel::onTextChange)
    val used = state.editorText.length
    val notice = ComposerLimitNotice.visibleAt(used, StoryComposerDraft.MAX_CHARS)
    val label = stringResource(R.string.stories_composer_text_caption)
    val focus = remember { FocusRequester() }
    val controller = LocalSoftwareKeyboardController.current
    LimitReachedHaptic(used, StoryComposerDraft.MAX_CHARS)
    Column(Modifier.fillMaxWidth()) {
        notice?.let { kind ->
            Text(
                text = stringResource(kind.captionRes()),
                style = MaterialTheme.typography.bodySmall,
                color = if (kind == ComposerLimitNotice.Kind.EXCEEDED) MaterialTheme.colorScheme.error else Color.White,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xxs)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        TypingBarFrame(onDone) {
            Box(Modifier.weight(1f).padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xs)) {
                if (caption.value.text.isEmpty()) {
                    Text(
                        text = stringResource(R.string.stories_composer_placeholder),
                        color = Color.White.copy(alpha = 0.6f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                BasicTextField(
                    value = caption.value,
                    onValueChange = caption.onValueChange,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
                    cursorBrush = SolidColor(Color.White),
                    maxLines = CAPTION_MAX_LINES,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 24.dp)
                        .focusRequester(focus)
                        .semantics { contentDescription = label },
                )
            }
        }
    }
    val windowFocused = LocalWindowInfo.current.isWindowFocused
    LaunchedEffect(windowFocused) {
        if (!windowFocused) return@LaunchedEffect
        focus.requestFocus()
        controller?.show()
    }
}

private const val CAPTION_MAX_LINES = 4

private fun ComposerLimitNotice.Kind.captionRes(): Int = when (this) {
    ComposerLimitNotice.Kind.REACHED -> R.string.composer_caption_limit_reached
    ComposerLimitNotice.Kind.EXCEEDED -> R.string.composer_caption_too_long
}
