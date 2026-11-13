package me.meeshy.app.calls

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameThumbnailCache
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.model.call.CallButtonRole
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import me.meeshy.sdk.model.call.montage.CallMontageHold
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageScopeToggle
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

@Composable
internal fun MoodChips(
    chips: List<CallMontageMoodChip>,
    selected: CallMontageMoodChip,
    isEnabled: Boolean,
    toggle: CallMontageScopeToggle?,
    onScope: (Boolean) -> Unit,
    onSelect: (CallMontageMoodChip) -> Unit,
) {
    val list = rememberLazyListState()
    val index = chips.indexOf(selected)
    LaunchedEffect(index) { if (index >= 0) list.animateScrollToItem(index) }
    LazyRow(
        state = list,
        modifier = Modifier.callScrollEdgeFade(list, horizontal = true),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        userScrollEnabled = isEnabled,
    ) {
        items(chips) { chip ->
            MoodChip(chipLabel(chip), selected = chip == selected, isEnabled = isEnabled) { if (chip != selected) onSelect(chip) }
        }
        toggle?.let { scope ->
            item {
                val label = stringResource(if (scope.showsAll) R.string.call_frames_less else R.string.call_frames_more)
                val hint = stringResource(if (scope.showsAll) R.string.call_frames_less_hint else R.string.call_frames_more_hint)
                MoodChip(label, selected = false, isEnabled = isEnabled, hint = hint) { onScope(scope.showsAll) }
            }
        }
    }
}

/** #17323 — une puce d'ambiance est un verre de bouton (iOS `callChipGlass`) ; la sélectionnée garde son blanc plein. */
@Composable
internal fun MoodChip(label: String, selected: Boolean, isEnabled: Boolean, hint: String? = null, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    CallGlassButtonSurface(
        role = if (selected) CallButtonRole.Active else CallButtonRole.Neutral,
        shape = CircleShape,
        isPressed = pressed,
        modifier = Modifier
            .heightIn(min = 48.dp)
            .padding(vertical = MeeshySpacing.xs)
            .clickable(enabled = isEnabled, interactionSource = source, indication = null, role = Role.Tab, onClickLabel = hint, onClick = onClick)
            .semantics { this.selected = selected },
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) MeeshyPalette.Indigo950 else CallPalette.Ink.copy(alpha = if (isEnabled) 1f else 0.5f),
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        )
    }
}

@Composable
internal fun chipLabel(chip: CallMontageMoodChip): String = when (chip) {
    CallMontageMoodChip.Classics -> stringResource(R.string.call_frames_classics)
    is CallMontageMoodChip.Mood -> stringResource(moodLabel(chip.mood))
}

internal fun moodLabel(mood: CallFrameMood): Int = when (mood) {
    CallFrameMood.CORPORATE -> R.string.call_frames_mood_corporate
    CallFrameMood.DECONNECTE -> R.string.call_frames_mood_deconnecte
    CallFrameMood.DISTINGUE -> R.string.call_frames_mood_distingue
    CallFrameMood.ELEGANT -> R.string.call_frames_mood_elegant
    CallFrameMood.FANTASTIQUE -> R.string.call_frames_mood_fantastique
    CallFrameMood.FEERIQUE -> R.string.call_frames_mood_feerique
    CallFrameMood.FUTURISTE -> R.string.call_frames_mood_futuriste
    CallFrameMood.GLAUQUE -> R.string.call_frames_mood_glauque
    CallFrameMood.HORS_NORME -> R.string.call_frames_mood_hors_norme
    CallFrameMood.JOVIAL -> R.string.call_frames_mood_jovial
    CallFrameMood.MORBIDE -> R.string.call_frames_mood_morbide
    CallFrameMood.SIGNATURE -> R.string.call_frames_mood_signature
}

