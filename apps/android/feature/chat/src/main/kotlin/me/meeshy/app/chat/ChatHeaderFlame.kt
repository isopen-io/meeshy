package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.engagement.HeaderFlameLaw
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.format.rememberReaderLocale
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

private val FLAME_GAP = 4.dp
private val FLAME_TIP = lerp(MeeshyPalette.Warning, Color.White, 0.4f)
private val FLAME_GRADIENT = listOf(FLAME_TIP, MeeshyPalette.Warning, MeeshyPalette.Error)

/**
 * La Flamme sous l'avatar REPLIÉ de l'en-tête (#13297, iOS `HeaderFlameDecoration`) : « 🔥 4 · 120 »,
 * la série en jours puis les points du jour, tant qu'une série court. Un toucher la masque jusqu'au
 * prochain dépliement de l'en-tête ([HeaderFlameLaw]). À chaque envoi du lecteur ([sent]) elle rejoue
 * sa lueur — l'arc qui fait le tour de l'avatar, puis l'allumage — et TIENT l'ancien compte jusqu'à
 * ce que la lueur l'ait mérité.
 *
 * Rien n'est calculé ici : [snapshot] est l'instantané servi par la passerelle, relu au jour civil du
 * lecteur à l'affichage. L'animation n'est lue qu'au dessin : l'avatar ne se recompose pas.
 */
@Composable
internal fun HeaderFlameDecoration(
    snapshot: ConversationEngagementSnapshot?,
    sent: SharedFlow<Unit>,
    headerExpanded: Boolean,
    dismissed: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val today = remember(snapshot) { ConversationEngagementSnapshot.dayString(LocalDate.now()) }
    val displayed = remember(snapshot, today) { snapshot?.forDay(today) }
    val shown = displayed?.takeIf { HeaderFlameLaw.isShown(headerExpanded, dismissed, it.hasRunningStreak) }
    // La dernière flamme montrée survit à sa sortie, le temps de la transition.
    val lastShown = remember { mutableStateOf(shown) }
    if (shown != null) SideEffect { lastShown.value = shown }
    val flame = shown ?: lastShown.value

    val phase = remember { Animatable(1f) }
    var isPlaying by remember { mutableStateOf(false) }
    var heldPoints by remember { mutableStateOf<Int?>(null) }
    var replayCount by remember { mutableStateOf(0) }
    // L'effet vit aussi longtemps que [sent] : il lit la flamme et la réduction des animations de
    // l'instant de l'envoi, jamais celles de son premier lancement (la flamme arrive souvent APRÈS).
    val currentShown by rememberUpdatedState(shown)
    val currentReduceMotion by rememberUpdatedState(reduceMotion)
    LaunchedEffect(sent) {
        sent.collect {
            val showing = currentShown ?: return@collect
            heldPoints = heldPoints ?: showing.todayPoints
            replayCount += 1
            val replay = replayCount
            val duration = if (currentReduceMotion) 0.6 else HeaderFlameLaw.DURATION_SECONDS
            val releaseMs = (duration * HeaderFlameLaw.VALUE_RELEASE * 1000).toLong()
            phase.snapTo(0f)
            isPlaying = true
            launch { phase.animateTo(1f, tween((duration * 1000).toInt(), easing = LinearEasing)) }
            delay(releaseMs)
            if (replay != replayCount) return@collect
            heldPoints = null
            delay((duration * 1000).toLong() - releaseMs)
            if (replay == replayCount) isPlaying = false
        }
    }

    Box(
        modifier = modifier.drawBehind {
            if (shown == null || !isPlaying) return@drawBehind
            val progress = phase.value
            val length = if (reduceMotion) 1f else HeaderFlameLaw.glowLength(progress)
            if (length <= 0f) return@drawBehind
            val span = length * 360f
            val diameter = size.minDimension + 8.dp.toPx()
            val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
            val alpha = if (reduceMotion) kotlin.math.sin(progress.coerceIn(0f, 1f) * Math.PI.toFloat()) else HeaderFlameLaw.glowOpacity(progress)
            val start = if (reduceMotion) 0f else HeaderFlameLaw.glowHeadDegrees(progress) - span
            drawArc(
                brush = Brush.sweepGradient(
                    0f to Color.Transparent,
                    0.4f to MeeshyPalette.Warning,
                    0.75f to MeeshyPalette.Error,
                    1f to FLAME_TIP,
                    center = Offset(topLeft.x + diameter / 2f, topLeft.y + diameter / 2f),
                ),
                startAngle = start,
                sweepAngle = span,
                useCenter = false,
                topLeft = topLeft,
                size = Size(diameter, diameter),
                alpha = alpha.coerceIn(0f, 1f),
                style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
            )
        },
    ) {
        content()
        AnimatedVisibility(
            visible = shown != null,
            enter = scaleIn(spring(dampingRatio = 0.75f, stiffness = 380f), initialScale = 0.4f) + fadeIn(),
            exit = scaleOut(targetScale = 0.4f) + fadeOut(),
            // Une ancre de hauteur nulle au BAS de l'avatar : la flamme y pend par le haut, sous le
            // cercle, sans le toucher ni changer la mise en page de la bande.
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .layout { measurable, _ ->
                    val placeable = measurable.measure(Constraints())
                    layout(0, 0) { placeable.place(-placeable.width / 2, FLAME_GAP.roundToPx()) }
                },
        ) {
            if (flame != null) {
                FlameButton(
                    snapshot = flame,
                    phase = { phase.value },
                    animates = isPlaying && !reduceMotion,
                    heldPoints = heldPoints,
                    onDismiss = onDismiss,
                )
            }
        }
    }
}

@Composable
private fun FlameButton(
    snapshot: ConversationEngagementSnapshot,
    phase: () -> Float,
    animates: Boolean,
    heldPoints: Int?,
    onDismiss: () -> Unit,
) {
    val locale = rememberReaderLocale()
    val description = flameDescription(snapshot)
    val hint = stringResource(R.string.chat_header_flame_hint)
    val points = heldPoints ?: snapshot.todayPoints
    Row(
        modifier = Modifier
            .clickable(onClickLabel = hint, onClick = onDismiss)
            .clearAndSetSemantics { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        FlameGlyph(phase = phase, animates = animates)
        FlameCount(text = "${snapshot.streakDays} ·")
        AnimatedContent(
            targetState = CompactCountFormat.text(points, locale),
            transitionSpec = {
                (slideInVertically(spring(dampingRatio = 0.7f, stiffness = 380f)) { it / 2 } + fadeIn()) togetherWith
                    (slideOutVertically { -it / 2 } + fadeOut())
            },
            label = "flame-points",
        ) { text -> FlameCount(text = text) }
    }
}

/** La flamme : dégradé jaune → ambre → rouge ; à l'allumage elle grossit, vacille et s'éclaire. */
@Composable
private fun FlameGlyph(phase: () -> Float, animates: Boolean) {
    Icon(
        imageVector = MeeshyIcons.FlameFilled,
        contentDescription = null,
        tint = Color.Black,
        modifier = Modifier
            .size(16.dp)
            .graphicsLayer {
                compositingStrategy = CompositingStrategy.Offscreen
                transformOrigin = TransformOrigin(0.5f, 1f)
                if (animates) {
                    val progress = phase()
                    val scale = HeaderFlameLaw.flameScale(progress)
                    scaleX = scale
                    scaleY = scale
                    alpha = HeaderFlameLaw.flameOpacity(progress)
                }
            }
            .drawWithContent {
                drawContent()
                drawRect(Brush.verticalGradient(FLAME_GRADIENT), blendMode = BlendMode.SrcIn)
            },
    )
}

/** Un compte rouge cerclé de blanc (lisible sur n'importe quel fond), chiffres tabulaires. */
@Composable
private fun FlameCount(text: String) {
    val style = TextStyle(
        fontSize = 10.sp,
        fontWeight = FontWeight.ExtraBold,
        fontFamily = FontFamily.Default,
        fontFeatureSettings = "tnum",
    )
    Box {
        Text(text = text, style = style.copy(color = Color.White, drawStyle = Stroke(width = 4f)), maxLines = 1)
        Text(text = text, style = style.copy(color = MeeshyPalette.Error), maxLines = 1)
    }
}

/** « 4 jours · Étincelles : 120 · Aujourd'hui : 9 », ou le cumul seul sans série (iOS `accessibilityText`). */
@Composable
internal fun flameDescription(snapshot: ConversationEngagementSnapshot): String {
    val total = snapshot.totalPoints
    val locale = rememberReaderLocale()
    val totalText = remember(total, locale) { java.text.NumberFormat.getIntegerInstance(locale).format(total) }
    if (snapshot.streakDays <= 0) {
        return if (total == 1) {
            stringResource(R.string.chat_engagement_a11y_total_one, totalText)
        } else {
            stringResource(R.string.chat_engagement_a11y_total_other, totalText)
        }
    }
    val days = if (snapshot.streakDays == 1) {
        stringResource(R.string.chat_engagement_a11y_streak_days_one, snapshot.streakDays)
    } else {
        stringResource(R.string.chat_engagement_a11y_streak_days_other, snapshot.streakDays)
    }
    return stringResource(R.string.chat_engagement_a11y_streak, days, total, snapshot.todayPoints)
}
