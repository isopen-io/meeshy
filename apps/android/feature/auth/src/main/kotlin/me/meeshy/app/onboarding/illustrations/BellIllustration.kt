package me.meeshy.app.onboarding.illustrations

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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

internal const val ONBOARDING_BELL_TAG = "onboarding.illustration.bell"

/**
 * La cloche qui sonne une fois — secousse ressort 0,25/0,25 à 0,3 s, retour à 0,7 s — au-dessus
 * d'un aperçu de notification (iOS `OnboardingNotificationIllustration`). Réduite : posée, droite.
 */
@Composable
internal fun OnboardingBellIllustration(
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = rememberOnboardingReduceMotion(),
) {
    val ring = remember(reduceMotion) {
        Animatable(OnboardingIllustrationMotion.restingProgress(OnboardingIllustration.BELL))
    }
    val bellSize = scaledDp(72.sp, cap = 110.dp)
    LaunchedEffect(reduceMotion) {
        if (!OnboardingIllustrationMotion.animates(OnboardingIllustration.BELL, reduceMotion)) return@LaunchedEffect
        val shake = OnboardingIllustrationMotion.bellShake
        val release = OnboardingIllustrationMotion.bellRelease
        delay(shake.delayMillis.toLong())
        launch { ring.animateTo(1f, shake.toSpec()) }
        delay((release.delayMillis - shake.delayMillis).toLong())
        ring.animateTo(0f, release.toSpec())
    }
    Column(
        modifier = modifier.fillMaxWidth().testTag(ONBOARDING_BELL_TAG),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box {
            BrandIcon(
                imageVector = Icons.Filled.Notifications,
                size = bellSize,
                modifier = Modifier.graphicsLayer {
                    rotationZ = ring.value * OnboardingIllustrationMotion.BELL_SHAKE_DEGREES
                    transformOrigin = TransformOrigin(0.5f, 0f)
                },
            )
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 6.dp, y = (-4).dp)
                    .size(22.dp)
                    .background(MeeshyPalette.Error, CircleShape)
                    .border(3.dp, MeeshyPalette.White, CircleShape),
            )
        }
        NotificationPreview()
    }
}

@Composable
private fun NotificationPreview() {
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(10.dp, shape, ambientColor = MeeshyPalette.Indigo700, spotColor = MeeshyPalette.Indigo700)
            .background(MeeshyTheme.tokens.surfaceFill, shape)
            .padding(MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(32.dp).background(MeeshyGradients.brand, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Forum, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(18.dp))
        }
        Text(
            text = stringResource(R.string.onboarding_notifications_sample),
            color = MeeshyTheme.tokens.textPrimary,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
            modifier = Modifier.weight(1f),
        )
    }
}
