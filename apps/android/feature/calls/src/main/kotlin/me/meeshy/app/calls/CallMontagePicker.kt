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
import me.meeshy.sdk.call.frames.CallFrameRenderer
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

private val THUMB_WIDTH = 48.dp
private val THUMB_HEIGHT = 85.dp
private val THUMB_SPACING = 12.dp
private val SIDE_DIAMETER = 48.dp

/**
 * **LE CHOIX DU MODE MONTAGE** (#13690, #13732, #13733) — comme `CallMontageModeControls` d'iOS : les puces
 * (« Classiques », les ambiances mises en avant, puis « Plus d'ambiances »), le carrousel aimanté dont l'élément
 * centré est choisi et SE déclenche (deux tapes : photo ; appui long : film), chaque vignette peinte sur les
 * visages de l'appel ; puis la barre d'actions : Quitter, et « Cadre » qui garde le cadre affiché pendant l'appel
 * et le propose à l'autre. Choisir un cadre ne sert que la capture : rien ne part vers l'appel sans « Cadre ».
 */
@Composable
internal fun CallMontagePicker(
    live: CallLiveFrameController,
    capture: CallCaptureController,
    scene: CallCaptureScene,
    people: List<CallFramePerson>,
    isLiveOffered: Boolean,
    reduceMotion: Boolean,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val held by live.state.collectAsState()
    val pick by capture.pick.collectAsStateWithLifecycle()
    val captureState by capture.state.collectAsStateWithLifecycle()
    val previews by capture.previews.collectAsStateWithLifecycle()
    val count = people.size
    val chip = CallMontagePickRule.shownChip(pick, count)
    val scope = CallMontagePickRule.scope(pick, count)
    val selection = CallMontagePickRule.selection(pick, count)
    val items = CallMontagePickRule.items(pick, count)
    val hold = CallMontagePickRule.hold(pick, count, held.frameId, isLiveOffered)
    val hints = rememberCaptureHint()
    val shooter = rememberCallCaptureShooter(capture, scene, hints)
    val haptics = LocalHapticFeedback.current
    val classicNames = CallMontageStyle.entries.associateWith { stringResource(styleName(it)) }
    val nextDeclination = stringResource(R.string.call_live_frame_declination_next)
    val previousDeclination = stringResource(R.string.call_live_frame_declination_previous)
    fun stepDeclination(offset: Int): Boolean {
        val current = CallMontagePickRule.choice(pick, count) as? CallMontageChoice.Frame ?: return false
        val next = CallFrameStyleRule.neighbour(current.id, offset) ?: return false
        capture.select(CallMontageChoice.Frame(next.id))
        return true
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
            .padding(top = MeeshySpacing.md, bottom = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        MoodChips(
            chips = CallMontagePickRule.chips(pick, count),
            selected = chip,
            isEnabled = !captureState.isRecording,
            toggle = CallMontagePickRule.scopeToggle(pick, count),
            onScope = { showsAll -> capture.setScope(if (showsAll) CallFrameScope.SPOTLIGHT else CallFrameScope.ALL, count) },
        ) { tapped ->
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            capture.show(tapped, count)
        }
        key(chip, scope) {
            CallModeCarousel(
                items = items,
                selection = selection,
                title = stringResource(R.string.call_mode_montage_title),
                name = { item -> choiceName(CallMontagePickRule.declined(pick, item, count), classicNames) },
                reduceMotion = reduceMotion,
                onSelect = { item -> if (item != selection) capture.select(item) },
                nextLabel = stringResource(R.string.call_montage_next),
                previousLabel = stringResource(R.string.call_montage_previous),
                itemWidth = THUMB_WIDTH,
                itemHeight = THUMB_HEIGHT,
                spacing = THUMB_SPACING,
                hint = stringResource(R.string.call_mode_gesture_hint)
                    .takeIf { CallModeGestureRule.showsHint(hasSeenHint = hints.hasSeen, isRecording = captureState.isRecording) },
                shots = CallModeShots(captureState.isRecording, shooter.shoot, shooter.film),
                extraActions = if (CallMontageFrameRule.declinations(selection).size > 1) {
                    listOf(
                        CustomAccessibilityAction(nextDeclination) { stepDeclination(1) },
                        CustomAccessibilityAction(previousDeclination) { stepDeclination(-1) },
                    )
                } else {
                    emptyList()
                },
            ) { item, isShown ->
                MontageCell(
                    item = item,
                    posed = CallMontagePickRule.declined(pick, item, count),
                    isSelected = isShown && item == selection,
                    previews = previews,
                    people = people,
                    onDecline = { id -> capture.select(CallMontageChoice.Frame(id)) },
                )
            }
        }
        MontageActionBar(
            hold = hold,
            isRecording = captureState.isRecording,
            onQuit = onClose,
            onHold = { id ->
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                live.apply(CallLiveFrameRule.toggledHold(held.frameId, id))
            },
        )
    }
}

@Composable
private fun MontageCell(
    item: CallMontageChoice,
    posed: CallMontageChoice,
    isSelected: Boolean,
    previews: CallCapturePreviews,
    people: List<CallFramePerson>,
    onDecline: (String) -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    Box(
        Modifier
            .fillMaxSize()
            .clip(shape)
            .background(Color.White.copy(alpha = 0.08f))
            .border(if (isSelected) 2.dp else 1.dp, if (isSelected) Color.White else Color.White.copy(alpha = 0.3f), shape),
        contentAlignment = Alignment.Center,
    ) {
        when (item) {
            is CallMontageChoice.Classic -> {
                val thumbnail = previews.thumbnails[item.style]
                if (thumbnail != null) {
                    Image(thumbnail.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(styleGlyph(item.style), contentDescription = null, tint = CallPalette.InkSecondary, modifier = Modifier.size(20.dp))
                }
            }
            is CallMontageChoice.Frame -> {
                val declinations = remember(item.id) { CallFrameStyleRule.declinations(item.id) }
                val posedId = (posed as? CallMontageChoice.Frame)?.id ?: item.id
                if (isSelected && declinations.size > 1) {
                    CallFrameDeclinationPager(declinations = declinations, selected = posedId, onSelect = onDecline) { declined ->
                        FrameTile(declined, previews.frameThumbnails[declined.id], people)
                    }
                } else {
                    val design = remember(item.id) { CallMontageFrameRule.design(item.id) }
                    design?.let { FrameTile(it, previews.frameThumbnails[it.id], people) }
                }
            }
        }
    }
}

/** La vignette d'un cadre peinte sur les visages de l'appel ; en attendant, le cadre avec les initiales — jamais un spinner. */
@Composable
private fun FrameTile(design: CallFrameDesign, painted: Bitmap?, people: List<CallFramePerson>) {
    if (painted != null) {
        Image(painted.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    } else {
        FrameThumbnail(design, people)
    }
}

@Composable
private fun MoodChips(
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

@Composable
private fun MoodChip(label: String, selected: Boolean, isEnabled: Boolean, hint: String? = null, onClick: () -> Unit) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = if (selected) MeeshyPalette.Indigo950 else CallPalette.Ink.copy(alpha = if (isEnabled) 1f else 0.5f),
        modifier = Modifier
            .heightIn(min = 48.dp)
            .padding(vertical = MeeshySpacing.xs)
            .clip(CircleShape)
            .background(if (selected) Color.White else Color.White.copy(alpha = 0.16f))
            .clickable(enabled = isEnabled, role = Role.Tab, onClickLabel = hint, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .semantics { this.selected = selected },
    )
}

/** Quitter à gauche, puis « Cadre » quand le cadre affiché peut se garder pendant l'appel (iOS `CallModeActionBar`). */
@Composable
private fun MontageActionBar(hold: CallMontageHold?, isRecording: Boolean, onQuit: () -> Unit, onHold: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        CallPillButton(
            icon = MeeshyIcons.Close,
            kind = CallPillKind.Normal,
            label = stringResource(R.string.call_mode_quit),
            caption = stringResource(R.string.call_mode_quit),
            hint = stringResource(R.string.call_mode_quit_montage_hint),
            diameter = SIDE_DIAMETER,
            onClick = onQuit,
        )
        Spacer(Modifier.weight(1f))
        hold?.let { option ->
            CallPillButton(
                icon = MeeshyIcons.Wallpaper,
                kind = if (option.isOn) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(R.string.call_live_frame_label),
                caption = stringResource(R.string.call_live_frame_caption),
                hint = stringResource(R.string.call_live_frame_hold_hint),
                toggleState = option.isOn,
                diameter = SIDE_DIAMETER,
                onClick = { if (!isRecording) onHold(option.frameId) },
            )
        }
    }
}

/** La vignette d'un cadre peinte avec les initiales : ce qui tient la place tant que les visages ne sont pas peints. */
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

private fun choiceName(choice: CallMontageChoice, classicNames: Map<CallMontageStyle, String>): String = when (choice) {
    is CallMontageChoice.Classic -> classicNames[choice.style].orEmpty()
    is CallMontageChoice.Frame -> CallMontageFrameRule.frameName(choice.id).orEmpty()
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
