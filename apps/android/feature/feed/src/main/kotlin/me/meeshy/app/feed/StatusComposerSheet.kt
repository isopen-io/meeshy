package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import kotlinx.coroutines.delay
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerRailPlan
import me.meeshy.sdk.model.composer.PublicationControl
import me.meeshy.sdk.model.composer.PublicationControlPlace
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.composer.ComposerPlateau
import me.meeshy.ui.component.composer.rememberHostedTextField
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.component.composer.LocalOnComposerPlateau
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The mood-status composer — the Android port of iOS `StatusComposerView`. A
 * bottom sheet with an emoji mood grid, a visibility-pill row, a 122-char text
 * field with a live counter, and a publish action. Every decision (publish gate,
 * char cap, trimmed body, emoji toggle) lives in the pure [StatusComposerDraft];
 * this Composable holds one in `remember` and stays coverage-exempt glue.
 *
 * [initialDraft] seeds the composer — a fresh [StatusComposerDraft] for a new mood,
 * or [StatusComposerDraft.republish] to republish another user's status (emoji/body/
 * attribution pre-filled). [onPublish] receives the full [StatusPublishRequest] the
 * ViewModel's `setStatus` expects, carrying any republish attribution.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusComposerSheet(
    onPublish: (StatusPublishRequest) -> Unit,
    onDismiss: () -> Unit,
    initialDraft: StatusComposerDraft = StatusComposerDraft(),
    onDraftChange: (StatusComposerDraft) -> Unit = {},
    formatSlot: (@Composable () -> Unit)? = null,
) {
    var draft by remember { mutableStateOf(initialDraft) }
    // Autosave (#13430): every change reaches the durable draft, so a closed sheet or a killed app loses nothing.
    LaunchedEffect(draft) { onDraftChange(draft) }

    if (LocalOnComposerPlateau.current) {
        MoodPlateau(draft = draft, onChange = { draft = it }, onClose = onDismiss, formatSlot = formatSlot) {
            draft.publishRequest()?.let(onPublish)
        }
    } else ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            formatSlot?.invoke()
            Header(
                canPublish = draft.canPublish,
                onClose = onDismiss,
                onPublish = { draft.publishRequest()?.let(onPublish) },
            )

            draft.viaUsername?.takeIf { draft.isRepublish }?.let { via ->
                Text(
                    text = stringResource(R.string.status_composer_republishing, via),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyPalette.Indigo400,
                )
            }

            Text(
                text = stringResource(R.string.status_composer_mood_question),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )

            EmojiGrid(
                selected = draft.selectedEmoji,
                onToggle = { emoji -> draft = draft.toggleEmoji(emoji) },
            )

            VisibilityRow(
                selected = draft.visibility,
                onSelect = { visibility -> draft = draft.withVisibility(visibility) },
            )

            TextInput(
                draft = draft,
                onTextChange = { value -> draft = draft.withText(value) },
            )
        }
    }
}

// MARK: - Plateau

/**
 * The mood ON the plateau (iOS `ComposerMoodSurface`): no scene, so no column and no socle — the cross, the format and
 * Publish share the top corridor (`headerPaintsPublish`), and the card carries the question, the emoji grid, the
 * audience ribbon (the mood's own selector, `socleZones(for: .mood)` is empty) and the sentence.
 */
@Composable
private fun MoodPlateau(
    draft: StatusComposerDraft,
    onChange: (StatusComposerDraft) -> Unit,
    onClose: () -> Unit,
    formatSlot: (@Composable () -> Unit)?,
    onPublish: () -> Unit,
) {
    var isAsking by remember { mutableStateOf(false) }
    var isPicking by remember { mutableStateOf(false) }
    val wordFocus = remember { FocusRequester() }
    var refocus by remember { mutableStateOf(0) }
    LaunchedEffect(refocus) { if (refocus > 0) { delay(WORD_REFOCUS_DELAY_MS); runCatching { wordFocus.requestFocus() } } }
    if (isAsking) BareMoodDialog(
        onAddWord = { isAsking = false; refocus++ },
        onPublishAnyway = { isAsking = false; onPublish() },
    )
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val tooLong = stringResource(R.string.status_composer_emoji_too_long)
    if (isPicking) MoodEmojiSheet(
        onPick = { picked ->
            if (StatusBarePublish.acceptsPicked(picked)) {
                onChange(draft.withPickedEmoji(picked)); isPicking = false; haptics.medium()
            } else {
                haptics.warning(); Toast.makeText(context, tooLong, Toast.LENGTH_SHORT).show()
            }
        },
        onDismiss = { isPicking = false },
    )
    ComposerPlateau(
        onDismiss = onClose,
        topCorridor = {
            ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.status_composer_close), onClose)
            formatSlot?.invoke()
            Spacer(Modifier.weight(1f))
            MeeshyPrimaryButton(
                text = stringResource(R.string.status_composer_publish),
                onClick = { when (draft.publishStep) {
                    StatusBarePublish.Step.PUBLISH -> onPublish()
                    StatusBarePublish.Step.ASK_FOR_A_WORD -> isAsking = true
                } },
                enabled = draft.canPublish,
                modifier = Modifier.width(MOOD_PUBLISH_WIDTH),
            )
        },
    ) {
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            draft.viaUsername?.takeIf { draft.isRepublish }?.let { via ->
                Text(
                    text = stringResource(R.string.status_composer_republishing, via),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyPalette.Indigo400,
                )
            }
            Text(
                text = stringResource(R.string.status_composer_mood_question),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            EmojiGrid(selected = draft.selectedEmoji, onToggle = { onChange(draft.toggleEmoji(it)) }, onMore = { isPicking = true })
            if (ComposerRailPlan.publicationControls(ComposerFormat.STATUS)[PublicationControl.AUDIENCE] == PublicationControlPlace.SURFACE) {
                VisibilityRow(selected = draft.visibility, onSelect = { onChange(draft.withVisibility(it)) })
            }
            TextInput(draft = draft, onTextChange = { onChange(draft.withText(it)) }, focusRequester = wordFocus)
        }
    }
}

private val MOOD_PUBLISH_WIDTH = 112.dp

/** The alert must have finished leaving before the field takes the keyboard back (iOS `refocusDelay`, 350 ms). */
private const val WORD_REFOCUS_DELAY_MS = 350L

/** « Publier ton humeur sans un petit mot ? » — add a word, or publish anyway (iOS `ComposerMoodPublishGate`). */
@Composable
private fun BareMoodDialog(onAddWord: () -> Unit, onPublishAnyway: () -> Unit) {
    AlertDialog(
        onDismissRequest = onAddWord,
        title = { Text(stringResource(R.string.status_composer_bare_title)) },
        confirmButton = { TextButton(onClick = onAddWord) { Text(stringResource(R.string.status_composer_bare_add)) } },
        dismissButton = { TextButton(onClick = onPublishAnyway) { Text(stringResource(R.string.status_composer_bare_publish)) } },
    )
}

/** The full emoji picker (iOS `ComposerMoodEmojiSheet`): the offered moods stand in as quick reactions. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MoodEmojiSheet(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        EmojiFullPicker(
            onSelect = onPick,
            quickReactions = StatusComposerDraft.MOOD_OPTIONS,
            title = stringResource(R.string.status_composer_emoji_more),
            modifier = Modifier.navigationBarsPadding(),
        )
    }
}

// MARK: - Header

@Composable
private fun Header(
    canPublish: Boolean,
    onClose: () -> Unit,
    onPublish: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onClose) {
            Text(
                text = stringResource(R.string.status_composer_close),
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = stringResource(R.string.status_composer_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        TextButton(onClick = onPublish, enabled = canPublish) {
            Text(
                text = stringResource(R.string.status_composer_publish),
                fontWeight = FontWeight.SemiBold,
                color = if (canPublish) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

// MARK: - Emoji grid

@Composable
private fun EmojiGrid(
    selected: String?,
    onToggle: (String) -> Unit,
    onMore: (() -> Unit)? = null,
) {
    val cells = StatusComposerDraft.MOOD_OPTIONS + listOfNotNull(StatusBarePublish.customEmoji(selected, StatusComposerDraft.MOOD_OPTIONS))
    val rows = cells.map<String, @Composable (Modifier) -> Unit> { emoji ->
        { m -> EmojiButton(emoji = emoji, selected = emoji == selected, onClick = { onToggle(emoji) }, modifier = m) }
    } + listOfNotNull<@Composable (Modifier) -> Unit>(onMore?.let { more -> { m -> MoreEmojiCell(more, m) } })
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        rows.chunked(EMOJI_COLUMNS).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                row.forEach { cell -> cell(Modifier.weight(1f)) }
                repeat(EMOJI_COLUMNS - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

/** The door to the full picker — a cell of the grid, same 56 dp (iOS `ComposerMoodMoreEmojiCell`). */
@Composable
private fun MoreEmojiCell(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.status_composer_emoji_more)
    Box(
        modifier = modifier
            .size(56.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.inputBackground)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.Emoji, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary)
        Icon(
            MeeshyIcons.AddCircleFilled, contentDescription = null, tint = MeeshyPalette.Indigo400,
            modifier = Modifier.align(Alignment.BottomEnd).padding(MeeshySpacing.xs).size(16.dp),
        )
    }
}

@Composable
private fun EmojiButton(
    emoji: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Box(
        modifier = modifier
            .size(56.dp)
            .clip(shape)
            .background(if (selected) MeeshyPalette.Indigo500.copy(alpha = 0.15f) else MeeshyTheme.tokens.inputBackground)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBorder,
                shape = shape,
            )
            .clickable(onClick = onClick)
            .semantics { contentDescription = emoji },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, style = MaterialTheme.typography.headlineSmall)
    }
}

// MARK: - Visibility

@Composable
private fun VisibilityRow(
    selected: StatusVisibility,
    onSelect: (StatusVisibility) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        StatusVisibility.entries.forEach { visibility ->
            val active = visibility == selected
            Text(
                text = visibilityLabel(visibility),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = if (active) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(if (active) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.inputBackground)
                    .clickable { onSelect(visibility) }
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun visibilityLabel(visibility: StatusVisibility): String = stringResource(
    when (visibility) {
        StatusVisibility.PUBLIC -> R.string.status_composer_visibility_public
        StatusVisibility.COMMUNITY -> R.string.status_composer_visibility_community
        StatusVisibility.FRIENDS -> R.string.status_composer_visibility_friends
        StatusVisibility.PRIVATE -> R.string.status_composer_visibility_private
    },
)

// MARK: - Text input

@Composable
private fun TextInput(
    draft: StatusComposerDraft,
    onTextChange: (String) -> Unit,
    focusRequester: FocusRequester? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        val field = rememberHostedTextField(draft.text, onTextChange)
        OutlinedTextField(
            value = field.value,
            onValueChange = field.onValueChange,
            modifier = Modifier.fillMaxWidth().then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
            placeholder = { Text(stringResource(R.string.status_composer_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        )
        if (draft.showCounter) {
            Text(
                text = stringResource(
                    R.string.status_composer_counter,
                    draft.text.length,
                    StatusComposerDraft.MAX_CHARS,
                ),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = if (draft.isNearLimit) MeeshyPalette.Error else MeeshyTheme.tokens.textMuted,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private const val EMOJI_COLUMNS = 5
