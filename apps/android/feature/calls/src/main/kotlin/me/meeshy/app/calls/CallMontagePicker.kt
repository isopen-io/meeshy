package me.meeshy.app.calls

import android.graphics.Bitmap
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val THUMB_WIDTH = 72.dp
private val THUMB_HEIGHT = 128.dp

/**
 * **LE CHOIX DU MODE MONTAGE** (#13690) — comme `CallMontageModeControls` d'iOS : la puce « Classiques »
 * en tête, et son carrousel des treize montages, chacun en vignette peinte sur les images de l'appel ;
 * puis les ambiances du cadre en direct : « Aucun cadre », puis leurs cadres. Toucher un classique le
 * choisit pour la capture ; toucher un cadre l'applique tout de suite chez moi et le propose à l'autre.
 */
@Composable
internal fun CallMontagePicker(
    controller: CallLiveFrameController,
    capture: CallCaptureController,
    peerName: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by controller.state.collectAsState()
    val pick by capture.pick.collectAsState()
    val thumbnailsFlow = remember(capture) { capture.previews.map { it.thumbnails }.distinctUntilChanged() }
    val thumbnails by thumbnailsFlow.collectAsState(initial = emptyMap())
    val chips = remember { CallMontagePickRule.chips() }
    val shown = CallMontagePickRule.shownChip(pick, state.frameId)
    val people = remember(peerName, state.remoteSharedName) { controller.people(peerName, state.remoteSharedName) }
    val haptics = LocalHapticFeedback.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = MeeshyRadius.xl, topEnd = MeeshyRadius.xl))
            .background(Color.Black.copy(alpha = 0.72f))
            .padding(top = MeeshySpacing.md, bottom = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(Modifier.padding(horizontal = MeeshySpacing.lg), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(if (shown == CallMontageMoodChip.Classics) R.string.call_mode_montage_title else R.string.call_live_frame_label),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = CallPalette.Ink,
                modifier = Modifier.weight(1f),
            )
            CallPillButton(
                icon = MeeshyIcons.Close,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_panel_close),
                onClick = onClose,
                diameter = 40.dp,
            )
        }
        LazyRow(contentPadding = PaddingValues(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            items(chips) { chip -> MoodChip(chipLabel(chip), selected = chip == shown) { capture.show(chip) } }
        }
        when (shown) {
            CallMontageMoodChip.Classics -> ClassicsCarousel(
                isSelected = { CallMontagePickRule.isSelected(pick, state.frameId, CallMontageChoice.Classic(it)) },
                thumbnails = thumbnails,
            ) { style ->
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                capture.pickClassic(style)
            }
            is CallMontageMoodChip.Mood -> FramesCarousel(
                mood = shown.mood,
                chosen = state.frameId,
                isSelected = { CallMontagePickRule.isSelected(pick, state.frameId, CallMontageChoice.Frame(it)) },
                people = people,
            ) { id ->
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                capture.pickFrame()
                controller.apply(id)
            }
        }
        Text(
            when (shown) {
                CallMontageMoodChip.Classics -> stringResource(styleName(pick.lastClassic))
                is CallMontageMoodChip.Mood -> stringResource(R.string.call_live_frame_hold_hint)
            },
            style = MaterialTheme.typography.bodySmall,
            color = CallPalette.InkSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
        )
    }
}

@Composable
private fun ClassicsCarousel(
    isSelected: (CallMontageStyle) -> Boolean,
    thumbnails: Map<CallMontageStyle, Bitmap>,
    onPick: (CallMontageStyle) -> Unit,
) {
    LazyRow(contentPadding = PaddingValues(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        items(CallMontagePickRule.classics(), key = { it.raw }) { style ->
            ChoiceTile(label = stringResource(styleName(style)), selected = isSelected(style), onClick = { onPick(style) }) {
                val thumbnail = thumbnails[style]
                if (thumbnail != null) {
                    Image(thumbnail.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(styleGlyph(style), contentDescription = null, tint = CallPalette.InkSecondary, modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}

@Composable
private fun FramesCarousel(
    mood: CallFrameMood,
    chosen: String?,
    isSelected: (String) -> Boolean,
    people: List<CallFramePerson>,
    onApply: (String?) -> Unit,
) {
    val frames = remember(mood) { CallLiveFrameRule.frames(mood) }
    LazyRow(contentPadding = PaddingValues(horizontal = MeeshySpacing.lg), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        item {
            ChoiceTile(label = stringResource(R.string.call_live_frame_none), selected = chosen == null, onClick = { onApply(null) }) {}
        }
        items(frames, key = { it.id }) { design ->
            val selected = isSelected(design.id)
            val declinations = remember(design.id) { CallFrameStyleRule.declinations(design.id) }
            ChoiceTile(label = design.name, selected = selected, onClick = { onApply(design.id) }) {
                if (selected && declinations.size > 1) {
                    CallFrameDeclinationPager(
                        declinations = declinations,
                        selected = chosen ?: design.id,
                        onSelect = onApply,
                    ) { declined -> FrameThumbnail(declined, people) }
                } else {
                    FrameThumbnail(design, people)
                }
            }
        }
    }
}

@Composable
private fun MoodChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = if (selected) MeeshyPalette.Indigo950 else CallPalette.Ink,
        modifier = Modifier
            .height(40.dp)
            .clip(CircleShape)
            .background(if (selected) Color.White else Color.White.copy(alpha = 0.16f))
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics { this.selected = selected },
    )
}

@Composable
private fun ChoiceTile(label: String, selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Column(
        Modifier
            .width(THUMB_WIDTH + 8.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { this.selected = selected; contentDescription = label },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(
            Modifier
                .size(THUMB_WIDTH, THUMB_HEIGHT)
                .clip(shape)
                .background(Color.White.copy(alpha = 0.08f))
                .border(if (selected) 2.dp else 1.dp, if (selected) Color.White else Color.White.copy(alpha = 0.3f), shape),
            contentAlignment = Alignment.Center,
        ) { content() }
        Text(label, style = MaterialTheme.typography.labelSmall, color = CallPalette.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
internal fun FrameThumbnail(design: CallFrameDesign, people: List<CallFramePerson>) {
    val density = LocalDensity.current
    val w = with(density) { THUMB_WIDTH.roundToPx() }
    val h = with(density) { THUMB_HEIGHT.roundToPx() }
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(locale) { DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date()) }
    val bitmap by produceState<ImageBitmap?>(null, design.id, w, h, people, date) {
        val texts = CallFrameTexts(groupName = null, isGroup = false, date = date, accentHex = null)
        value = withContext(Dispatchers.Default) {
            CallFrameRenderer.render(design, people.map { CallFramePortrait(it.id, it.name, it.handle, it.isSelf, null) }, texts, w, h)?.asImageBitmap()
        }
    }
    bitmap?.let { Image(it, contentDescription = null, contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize()) }
}

@Composable
private fun chipLabel(chip: CallMontageMoodChip): String = when (chip) {
    CallMontageMoodChip.Classics -> stringResource(R.string.call_frames_classics)
    is CallMontageMoodChip.Mood -> stringResource(moodLabel(chip.mood))
}

/** Le nom d'un classique, celui d'iOS (`CallCaptureCopy.styleName`). */
@StringRes
internal fun styleName(style: CallMontageStyle): Int = when (style) {
    CallMontageStyle.SCREEN -> R.string.call_capture_style_screen
    CallMontageStyle.COVER -> R.string.call_capture_style_cover
    CallMontageStyle.GOLD -> R.string.call_capture_style_gold
    CallMontageStyle.REDCARPET -> R.string.call_capture_style_redcarpet
    CallMontageStyle.GRID -> R.string.call_capture_style_grid
    CallMontageStyle.STRIP -> R.string.call_capture_style_strip
    CallMontageStyle.POLAROID -> R.string.call_capture_style_polaroid
    CallMontageStyle.MAGAZINE -> R.string.call_capture_style_magazine
    CallMontageStyle.FILM -> R.string.call_capture_style_film
    CallMontageStyle.NEON -> R.string.call_capture_style_neon
    CallMontageStyle.NOIR -> R.string.call_capture_style_noir
    CallMontageStyle.COMIC -> R.string.call_capture_style_comic
    CallMontageStyle.HEART -> R.string.call_capture_style_heart
}

/** Le glyphe qui tient la place d'une vignette tant qu'elle n'est pas peinte (iOS `CallCaptureCopy.styleSymbol`) — jamais un spinner. */
private fun styleGlyph(style: CallMontageStyle): ImageVector = when (style) {
    CallMontageStyle.SCREEN -> MeeshyIcons.PictureInPicture
    CallMontageStyle.COVER -> MeeshyIcons.Article
    CallMontageStyle.GOLD -> MeeshyIcons.Premium
    CallMontageStyle.REDCARPET -> MeeshyIcons.Star
    CallMontageStyle.GRID -> MeeshyIcons.GridView
    CallMontageStyle.STRIP -> MeeshyIcons.VerticalSplit
    CallMontageStyle.POLAROID -> MeeshyIcons.Photo
    CallMontageStyle.MAGAZINE -> MeeshyIcons.Dictionary
    CallMontageStyle.FILM -> MeeshyIcons.Movie
    CallMontageStyle.NEON -> MeeshyIcons.Sparkles
    CallMontageStyle.NOIR -> MeeshyIcons.Camera
    CallMontageStyle.COMIC -> MeeshyIcons.TextBubble
    CallMontageStyle.HEART -> MeeshyIcons.Heart
}

private fun moodLabel(mood: CallFrameMood): Int = when (mood) {
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
