package me.meeshy.app.onboarding.illustrations

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.app.onboarding.OnboardingIllustration
import me.meeshy.app.onboarding.OnboardingIllustrationMotion
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.feature.auth.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal const val ONBOARDING_GLOBE_TAG = "onboarding.illustration.globe"

/**
 * Le salon Meeshy Global : un globe et trois bulles en langues différentes (iOS
 * `OnboardingGlobalIllustration`). Il apparaît en ressort ; réduit, il est posé.
 */
@Composable
internal fun OnboardingGlobeIllustration(
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = rememberOnboardingReduceMotion(),
) {
    val appeared = remember(reduceMotion) {
        Animatable(if (reduceMotion) OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.GLOBE) else 0f)
    }
    val globeSize = scaledDp(60.sp, cap = 84.dp)
    val samples = listOf(
        "🇧🇷" to stringResource(R.string.onboarding_global_sample_1),
        "🇯🇵" to stringResource(R.string.onboarding_global_sample_2),
        "🇩🇪" to stringResource(R.string.onboarding_global_sample_3),
    )
    LaunchedEffect(reduceMotion) {
        if (OnboardingIllustrationMotion.animates(OnboardingIllustration.GLOBE, reduceMotion)) {
            appeared.animateTo(1f, OnboardingIllustrationMotion.globalAppear.toSpec())
        }
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(210.dp)
            .testTag(ONBOARDING_GLOBE_TAG)
            .graphicsLayer {
                val progress = appeared.value
                val scale = OnboardingIllustrationMotion.GLOBAL_START_SCALE + (1f - OnboardingIllustrationMotion.GLOBAL_START_SCALE) * progress
                scaleX = scale
                scaleY = scale
                alpha = progress.coerceIn(0f, 1f)
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(118.dp)
                .shadow(24.dp, CircleShape, ambientColor = MeeshyPalette.Indigo500, spotColor = MeeshyPalette.Indigo500)
                .background(MeeshyGradients.brand, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Public, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(globeSize))
        }
        SampleBubble(samples[0], Modifier.offset(x = (-60).dp, y = (-52).dp))
        SampleBubble(samples[1], Modifier.offset(x = 70.dp, y = 52.dp))
        SampleBubble(samples[2], Modifier.offset(x = (-40).dp, y = 88.dp))
    }
}

@Composable
private fun SampleBubble(sample: Pair<String, String>, modifier: Modifier) {
    val isDark = MeeshyTheme.isDark
    val border = MeeshyPalette.Indigo200.copy(alpha = if (isDark) 0.2f else 0.8f)
    Row(
        modifier = modifier
            .wrapContentSize(unbounded = true)
            .shadow(8.dp, CircleShape, ambientColor = MeeshyPalette.Indigo700, spotColor = MeeshyPalette.Indigo700)
            .clip(CircleShape)
            .background(if (isDark) MeeshyPalette.Indigo950.copy(alpha = 0.9f) else MeeshyPalette.White)
            .border(1.dp, border, CircleShape)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(sample.first, style = meeshyText(MeeshyFontSize.subhead))
        Text(
            text = sample.second,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium, rounded = true),
        )
    }
}
