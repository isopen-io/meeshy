package me.meeshy.ui.component.chrome

import android.os.SystemClock
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.syncpill.SyncPillDotStyle
import me.meeshy.sdk.model.syncpill.SyncPillGlyph
import me.meeshy.sdk.model.syncpill.SyncPillMarquee
import me.meeshy.sdk.model.syncpill.SyncPillMetrics
import me.meeshy.sdk.model.syncpill.SyncPillPresenter
import me.meeshy.sdk.model.syncpill.SyncPillRotator
import me.meeshy.sdk.model.syncpill.SyncPillRow
import me.meeshy.sdk.model.syncpill.SyncPillTapOutcome
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** Une rangée et son libellé déjà localisé : la pastille ne résout aucune ressource, son hôte le fait. */
public data class SyncPillUiRow(val row: SyncPillRow, val label: String)

/** Les textes d'accessibilité de la pastille, localisés par l'hôte. */
public data class SyncPillTexts(
    val multiple: (count: Int, label: String) -> String,
    val retryHint: String,
    val openHint: String,
    val pause: String,
    val resume: String,
)

private const val DOT_TICK_MS = 500L
private const val IDLE_HIDE_MS = 6_000L
private const val EMPHASIS_SCALE = 1.1f
private const val EMPHASIS_RISE_MS = 220L
private const val EMPHASIS_HOLD_MS = 450L
private const val DIM_PULSE_ALPHA = 0.4f
private const val SPRING_RESPONSE = 0.3f
private const val SPRING_DAMPING = 0.85f

/**
 * La pastille globale de synchronisation (miroir d'iOS `SyncPill`) : une capsule discrète qui fait défiler, une
 * entrée à la fois, hors ligne, reconnexion, envois en cours et qui écrit.
 *
 * Elle s'efface 6 s après la dernière entrée neuve, sauf état persistant (hors ligne, échec) ; une entrée neuve la
 * rallume, et une frappe neuve l'enfle (×1,1) un instant. Toucher relance un échec, sinon va à la source, sinon avance
 * la rotation ; l'appui long de 0,5 s gèle la rotation ET le défilement (WCAG 2.2.2). Réduire les animations retire
 * la pulsation, le ressort, le gonflement et le défilement.
 */
@Composable
public fun MeeshySyncPill(
    rows: List<SyncPillUiRow>,
    texts: SyncPillTexts,
    onRetry: (String) -> Unit,
    onNavigate: (me.meeshy.sdk.model.sync.OutboxNavigationSource) -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val modelRows = rows.map { it.row }
    val ids = modelRows.map { it.id }
    val metrics = SyncPillMetrics.of(SyncPillPresenter.size(modelRows))
    val persistent = SyncPillPresenter.isPersistent(modelRows)

    var rotator by remember { mutableStateOf(SyncPillRotator()) }
    var paused by remember { mutableStateOf(false) }
    var shown by remember { mutableStateOf(false) }
    var seen by remember { mutableStateOf(emptySet<String>()) }
    var emphasisToken by remember { mutableIntStateOf(0) }
    var emphasizing by remember { mutableStateOf(false) }
    var dotPhase by remember { mutableIntStateOf(0) }

    LaunchedEffect(ids) {
        val current = ids.toSet()
        val fresh = current - seen
        seen = current
        rotator = rotator.withItemCount(ids.size)
        if (ids.isEmpty()) {
            shown = false
        } else {
            if (fresh.isNotEmpty()) shown = true
            if (SyncPillPresenter.announcesTyping(modelRows, fresh) && !reduceMotion) emphasisToken += 1
        }
    }
    LaunchedEffect(ids, persistent) {
        if (ids.isEmpty()) return@LaunchedEffect
        if (persistent) {
            shown = true
        } else {
            delay(IDLE_HIDE_MS)
            shown = false
        }
    }
    LaunchedEffect(emphasisToken) {
        if (emphasisToken == 0) return@LaunchedEffect
        emphasizing = true
        delay(EMPHASIS_RISE_MS + EMPHASIS_HOLD_MS)
        emphasizing = false
    }
    LaunchedEffect(paused) { rotator = rotator.withAutoRotation(!paused) }
    LaunchedEffect(rotator.isRunning) {
        while (rotator.isRunning) {
            delay(SyncPillRotator.INTERVAL_MS)
            rotator = rotator.tick(SystemClock.elapsedRealtime())
        }
    }
    LaunchedEffect(shown) {
        dotPhase = 0
        while (shown) {
            delay(DOT_TICK_MS)
            dotPhase += 1
        }
    }

    val current = rows.getOrNull(rotator.currentIndex.coerceIn(0, (rows.size - 1).coerceAtLeast(0)))
    val currentRows by rememberUpdatedState(rows)
    val currentIndex by rememberUpdatedState(rotator.currentIndex)

    fun advance() {
        rotator = rotator.advance(SystemClock.elapsedRealtime())
    }

    fun onTap() {
        val row = SyncPillPresenter.visibleRow(currentRows.map { it.row }, currentIndex) ?: return
        when (val outcome = row.tapOutcome) {
            is SyncPillTapOutcome.Retry -> onRetry(outcome.outboxId)
            is SyncPillTapOutcome.Navigate -> onNavigate(outcome.source)
            SyncPillTapOutcome.Advance -> advance()
        }
    }

    fun onLongPress() {
        paused = !paused
        haptics.light()
    }

    AnimatedVisibility(
        visible = shown && current != null,
        modifier = modifier,
        enter = if (reduceMotion) fadeIn(tween(150)) else fadeIn() + scaleIn(spring<Float>(dampingRatio = SPRING_DAMPING, stiffness = MeeshyMotion.stiffnessForResponse(SPRING_RESPONSE)), initialScale = 0.85f),
        exit = if (reduceMotion) fadeOut(tween(150)) else fadeOut(tween(300)) + scaleOut(targetScale = 0.85f),
    ) {
        if (current == null) return@AnimatedVisibility
        val text = if (rows.size == 1) current.label else texts.multiple(rows.size, current.label)
        val hint = when (current.row.tapOutcome) {
            is SyncPillTapOutcome.Retry -> texts.retryHint
            is SyncPillTapOutcome.Navigate -> texts.openHint
            SyncPillTapOutcome.Advance -> null
        }
        val scale by animateFloatAsState(
            targetValue = if (emphasizing && !reduceMotion) EMPHASIS_SCALE else 1f,
            animationSpec = spring(dampingRatio = 0.6f),
            label = "syncPillEmphasis",
        )
        Box(
            modifier = Modifier
                .minimumInteractiveComponentSize()
                .syncPillGestures(onTap = ::onTap, onLongPress = ::onLongPress)
                .semantics(mergeDescendants = true) {
                    contentDescription = text
                    liveRegion = LiveRegionMode.Polite
                    role = Role.Button
                    onClick(label = hint) { onTap(); true }
                    customActions = listOf(
                        CustomAccessibilityAction(if (paused) texts.resume else texts.pause) { onLongPress(); true },
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            SyncPillCapsule(
                current = current,
                counter = if (rows.size > 1) "${rotator.currentIndex.coerceIn(0, rows.lastIndex) + 1}/${rows.size}" else null,
                metrics = metrics,
                dotPhase = dotPhase,
                paused = paused,
                reduceMotion = reduceMotion,
                modifier = Modifier.graphicsLayer { scaleX = scale; scaleY = scale },
            )
        }
    }
}

@Composable
private fun SyncPillCapsule(
    current: SyncPillUiRow,
    counter: String?,
    metrics: SyncPillMetrics,
    dotPhase: Int,
    paused: Boolean,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val isDark = MeeshyTheme.isDark
    val tokens = MeeshyTheme.tokens
    val textColor = tokens.textPrimary.copy(alpha = if (isDark) 0.7f else 0.6f)
    val pulse by animateFloatAsState(
        targetValue = if (reduceMotion || dotPhase % 2 == 0) 1f else DIM_PULSE_ALPHA,
        animationSpec = if (reduceMotion) tween(0) else tween(400),
        label = "syncPillPulse",
    )
    val style = TextStyle(fontSize = metrics.labelSp.sp, fontWeight = FontWeight.Medium, color = textColor)
    Row(
        modifier = modifier
            .shadow(6.dp, RoundedCornerShape(percent = 50), clip = false)
            .background(if (isDark) tokens.backgroundTertiary else Color.White, RoundedCornerShape(percent = 50))
            .padding(horizontal = metrics.horizontalPaddingDp.dp, vertical = metrics.verticalPaddingDp.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(metrics.itemSpacingDp.dp),
    ) {
        StatusMark(current.row, metrics, Modifier.alpha(pulse))
        SyncPillLabel(
            label = current.label,
            showsDots = current.row.showsActivityDots,
            dotPhase = dotPhase,
            style = style,
            maxWidthDp = metrics.maxTextDp,
            scrolls = !reduceMotion,
            paused = paused,
        )
        if (counter != null) {
            Text(
                text = counter,
                style = TextStyle(fontSize = metrics.counterSp.sp, color = tokens.textPrimary.copy(alpha = if (isDark) 0.45f else 0.4f)),
            )
        }
    }
}

@Composable
private fun StatusMark(row: SyncPillRow, metrics: SyncPillMetrics, modifier: Modifier) {
    val icon = row.glyph.vector()
    if (icon != null) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = row.dotStyle.solid(),
            modifier = modifier.size((metrics.glyphSp + 2f).dp),
        )
        return
    }
    val fill = if (row.dotStyle == SyncPillDotStyle.BRAND) {
        Modifier.background(Brush.linearGradient(MeeshyPalette.BrandGradient), CircleShape)
    } else {
        Modifier.background(row.dotStyle.solid(), CircleShape)
    }
    Box(modifier.size(metrics.dotDp.dp).then(fill))
}

@Composable
private fun SyncPillLabel(
    label: String,
    showsDots: Boolean,
    dotPhase: Int,
    style: TextStyle,
    maxWidthDp: Float,
    scrolls: Boolean,
    paused: Boolean,
) {
    val measurer: TextMeasurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val widthDp = remember(label, style) {
        with(density) { measurer.measure(label, style, maxLines = 1, softWrap = false).size.width.toDp().value }
    }
    val marquee = scrolls && SyncPillMarquee.shouldScroll(widthDp, maxWidthDp)
    if (marquee) {
        MarqueeText(label, style, widthDp, maxWidthDp, paused)
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = label, style = style, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.wrapContentWidth())
        if (showsDots) {
            Box {
                Text(SyncPillPresenter.RESERVED_DOTS, style = style.copy(color = Color.Transparent), maxLines = 1)
                Text(SyncPillPresenter.activityDots(dotPhase), style = style, maxLines = 1, modifier = Modifier.clearAndSetSemantics { })
            }
        }
    }
}

@Composable
private fun MarqueeText(label: String, style: TextStyle, textWidthDp: Float, maxWidthDp: Float, paused: Boolean) {
    var elapsed by remember(label) { mutableDoubleStateOf(0.0) }
    LaunchedEffect(label, paused) {
        if (paused) return@LaunchedEffect
        var last = androidx.compose.runtime.withFrameNanos { it }
        while (true) {
            val now = androidx.compose.runtime.withFrameNanos { it }
            elapsed += (now - last) / 1_000_000_000.0
            last = now
        }
    }
    val density = LocalDensity.current
    val offsetPx = with(density) { SyncPillMarquee.offset(elapsed, textWidthDp, maxWidthDp).dp.roundToPx() }
    Box(Modifier.width(maxWidthDp.dp).clipToBounds()) {
        Text(
            text = label,
            style = style,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier
                .wrapContentWidth(Alignment.Start, unbounded = true)
                .graphicsLayer { translationX = offsetPx.toFloat() },
        )
    }
}

/** Toucher = un doigt levé avant 0,5 s ; appui long = 0,5 s tenu, une fois, sans toucher au relâchement. */
private fun Modifier.syncPillGestures(onTap: () -> Unit, onLongPress: () -> Unit): Modifier =
    pointerInput(Unit) {
        awaitEachGesture {
            awaitFirstDown()
            val outcome = withTimeoutOrNull(SyncPillRotator.FREEZE_PRESS_MS) {
                if (waitForUpOrCancellation() != null) Release.UP else Release.CANCEL
            }
            when (outcome) {
                Release.UP -> onTap()
                Release.CANCEL -> Unit
                null -> {
                    onLongPress()
                    waitForUpOrCancellation()
                }
            }
        }
    }

private enum class Release { UP, CANCEL }

@Composable
private fun SyncPillDotStyle.solid(): Color = when (this) {
    SyncPillDotStyle.BRAND -> MeeshyPalette.Indigo500
    SyncPillDotStyle.WARNING -> MeeshyPalette.Warning
    SyncPillDotStyle.SUCCESS -> MeeshyPalette.Success
    SyncPillDotStyle.ERROR -> MeeshyPalette.Error
}

private fun SyncPillGlyph.vector(): ImageVector? = when (this) {
    SyncPillGlyph.NONE -> null
    SyncPillGlyph.WIFI_OFF -> MeeshyIcons.WifiOff
    SyncPillGlyph.WIFI -> MeeshyIcons.Wifi
    SyncPillGlyph.MIC -> MeeshyIcons.Mic
    SyncPillGlyph.PHOTO -> MeeshyIcons.PhotoFilled
    SyncPillGlyph.PLAY -> MeeshyIcons.PlayCircleFilled
    SyncPillGlyph.ATTACH -> MeeshyIcons.AttachFile
    SyncPillGlyph.MOOD -> MeeshyIcons.EmojiFilled
}
