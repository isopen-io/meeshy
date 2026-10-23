package me.meeshy.app.onboarding.illustrations

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.app.onboarding.OnboardingIllustration
import me.meeshy.app.onboarding.OnboardingIllustrationMotion
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette

internal const val ONBOARDING_TROPHY_TAG = "onboarding.illustration.trophy"

/** Le trophée du récapitulatif : il apparaît en ressort 0,55/0,55 depuis 0,6 ; réduit, il est posé (iOS `OnboardingTrophyIllustration`). */
@Composable
internal fun OnboardingTrophyIllustration(
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = rememberOnboardingReduceMotion(),
) {
    val appeared = remember(reduceMotion) {
        Animatable(
            if (reduceMotion) OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.TROPHY)
            else OnboardingIllustrationMotion.TROPHY_START_SCALE,
        )
    }
    val trophySize = scaledDp(56.sp, cap = 80.dp)
    LaunchedEffect(reduceMotion) {
        if (OnboardingIllustrationMotion.animates(OnboardingIllustration.TROPHY, reduceMotion)) {
            appeared.animateTo(1f, OnboardingIllustrationMotion.trophyAppear.toSpec())
        }
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(160.dp)
            .testTag(ONBOARDING_TROPHY_TAG)
            .graphicsLayer {
                scaleX = appeared.value
                scaleY = appeared.value
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(124.dp)
                .shadow(28.dp, CircleShape, ambientColor = MeeshyPalette.Indigo500, spotColor = MeeshyPalette.Indigo500)
                .background(MeeshyGradients.brand, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(trophySize))
        }
        Icon(
            Icons.Filled.AutoAwesome, contentDescription = null, tint = MeeshyPalette.Warning,
            modifier = Modifier.wrapContentSize(unbounded = true).offset(x = 72.dp, y = (-54).dp).size(scaledDp(34.sp, 48.dp)),
        )
        Icon(
            Icons.Filled.Star, contentDescription = null, tint = MeeshyPalette.Indigo300,
            modifier = Modifier.wrapContentSize(unbounded = true).offset(x = (-74).dp, y = 40.dp).size(scaledDp(22.sp, 32.dp)),
        )
    }
}
