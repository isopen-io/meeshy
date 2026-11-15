package me.meeshy.app.onboarding.illustrations

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.onboarding.OnboardingIllustration
import me.meeshy.app.onboarding.OnboardingIllustrationMotion
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal const val ONBOARDING_STORY_RING_TAG = "onboarding.illustration.storyRing"

private val RingSize = 140.dp

/**
 * L'anneau de story qui se remplit autour de l'avatar en 1,6 s (iOS `OnboardingStoryIllustration`).
 * Le tracé se lit dans la phase de dessin : aucune recomposition par image. Réduit, l'anneau est plein.
 */
@Composable
internal fun OnboardingStoryRingIllustration(
    name: String,
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = rememberOnboardingReduceMotion(),
) {
    val isDark = MeeshyTheme.isDark
    val ring = remember(reduceMotion) {
        Animatable(if (reduceMotion) OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.STORY_RING) else 0f)
    }
    LaunchedEffect(reduceMotion) {
        if (OnboardingIllustrationMotion.animates(OnboardingIllustration.STORY_RING, reduceMotion)) {
            kotlinx.coroutines.delay(OnboardingIllustrationMotion.STORY_RING_DELAY_MILLIS.toLong())
            ring.animateTo(1f, tween(OnboardingIllustrationMotion.STORY_RING_MILLIS, easing = FastOutSlowInEasing))
        }
    }
    val track = if (isDark) MeeshyPalette.White.copy(alpha = 0.08f) else MeeshyPalette.Indigo100
    val sweep = remember { Brush.sweepGradient(MeeshyPalette.AvatarRingGradient) }
    val badge = stringResource(R.string.onboarding_story_badge)

    Box(
        modifier = modifier.fillMaxWidth().height(170.dp).testTag(ONBOARDING_STORY_RING_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(RingSize)) {
            val stroke = 7.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawCircle(track, radius = arcSize.width / 2, style = Stroke(width = stroke))
            rotate(-90f) {
                drawArc(
                    brush = sweep,
                    startAngle = 0f,
                    sweepAngle = 360f * ring.value.coerceIn(0f, 1f),
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }
        MeeshyAvatar(name = name, context = AvatarContext.ProfileBanner)
        Box(
            Modifier
                .wrapContentSize(unbounded = true)
                .offset(x = 50.dp, y = 50.dp)
                .size(28.dp)
                .clip(CircleShape)
                .background(MeeshyPalette.Indigo500),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(20.dp))
        }
        Text(
            text = badge,
            color = MeeshyPalette.White,
            maxLines = 1,
            style = meeshyText(MeeshyFontSize.footnote, FontWeight.Bold, rounded = true),
            modifier = Modifier
                .wrapContentSize(unbounded = true)
                .offset(x = (-58).dp, y = (-52).dp)
                .clip(CircleShape)
                .background(MeeshyPalette.Warning)
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        )
    }
}
