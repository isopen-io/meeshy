package me.meeshy.app.onboarding.illustrations

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.app.onboarding.OnboardingIllustrationMotion
import me.meeshy.app.onboarding.PrismLayout
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.LanguageData
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal const val ONBOARDING_PRISM_TAG = "onboarding.illustration.prism"

private val OrbitFlags = listOf(
    Triple("🇯🇵", 74, 74),
    Triple("🇧🇷", -74, 74),
    Triple("🇩🇪", -74, -74),
    Triple("🇸🇳", 74, -74),
)

/**
 * Une bulle « Hola, ¿qué tal? » qui se retourne, au fil des secondes ou au toucher, et devient sa
 * traduction (iOS `OnboardingPrismIllustration`). Sous animations réduites : l'original, une
 * flèche, la traduction — empilés, immobiles.
 */
@Composable
internal fun OnboardingPrismIllustration(
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = rememberOnboardingReduceMotion(),
) {
    val interfaceLanguage = LocalConfiguration.current.locales[0].language
    val originalLanguage = OnboardingIllustrationMotion.prismOriginalLanguage(interfaceLanguage)
    val originalText = OnboardingIllustrationMotion.prismOriginalText(originalLanguage)
    val translatedText = stringResource(R.string.onboarding_languages_demo_translated)
    val layout = OnboardingIllustrationMotion.prismLayout(reduceMotion)

    Box(modifier.size(210.dp).testTag(ONBOARDING_PRISM_TAG), contentAlignment = Alignment.Center) {
        PrismOrbit()
        when (layout) {
            PrismLayout.STACKED -> Column(
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                PrismBubble(originalText, originalLanguage, translated = false, modifier = Modifier.alpha(0.9f).scale(0.9f))
                Icon(Icons.Filled.ArrowDownward, contentDescription = null, tint = MeeshyPalette.Indigo400)
                PrismBubble(translatedText, interfaceLanguage, translated = true)
            }
            PrismLayout.FLIPPING -> FlippingBubble(originalText, originalLanguage, translatedText, interfaceLanguage)
        }
    }
}

@Composable
private fun FlippingBubble(originalText: String, originalLanguage: String, translatedText: String, translatedLanguage: String) {
    val flip = remember { Animatable(0f) }
    var flipped by remember { mutableStateOf(false) }
    val spring = remember { OnboardingIllustrationMotion.prismFlip.toSpec() }
    val cameraDistance = 12f * LocalDensity.current.density

    LaunchedEffect(flipped) { flip.animateTo(if (flipped) 1f else 0f, spring) }
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(OnboardingIllustrationMotion.PRISM_FLIP_INTERVAL_MILLIS)
            flipped = !flipped
        }
    }
    Box(
        modifier = Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { flipped = !flipped }
            .graphicsLayer {
                rotationY = flip.value * 180f
                this.cameraDistance = cameraDistance
            },
    ) {
        PrismBubble(
            originalText, originalLanguage, translated = false,
            modifier = Modifier.graphicsLayer { alpha = if (flip.value < 0.5f) 1f else 0f },
        )
        PrismBubble(
            translatedText, translatedLanguage, translated = true,
            modifier = Modifier.graphicsLayer {
                rotationY = 180f
                alpha = if (flip.value >= 0.5f) 1f else 0f
            },
        )
    }
}

@Composable
private fun PrismOrbit() {
    val isDark = MeeshyTheme.isDark
    val dash = PathEffect.dashPathEffect(floatArrayOf(12f, 18f))
    val orbitColor = MeeshyPalette.Indigo300.copy(alpha = if (isDark) 0.25f else 0.4f)
    Canvas(Modifier.size(210.dp)) {
        drawCircle(orbitColor, style = Stroke(width = 1.dp.toPx(), pathEffect = dash))
    }
    OrbitFlags.forEach { (flag, x, y) ->
        Text(
            text = flag,
            style = meeshyText(MeeshyFontSize.title),
            modifier = Modifier
                .wrapContentSize(unbounded = true)
                .offset(x.dp, y.dp)
                .shadow(6.dp, CircleShape, ambientColor = MeeshyPalette.Indigo700, spotColor = MeeshyPalette.Indigo700)
                .background(if (isDark) MeeshyPalette.Indigo950 else MeeshyPalette.White, CircleShape)
                .padding(MeeshySpacing.xsPlus),
        )
    }
}

@Composable
private fun PrismBubble(text: String, language: String, translated: Boolean, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(24.dp)
    val flag = LanguageData.info(language)?.flag.orEmpty()
    val fill = when {
        translated -> null
        isDark -> MeeshyPalette.White.copy(alpha = 0.08f)
        else -> MeeshyPalette.White
    }
    Row(
        modifier = modifier
            .shadow(12.dp, shape, ambientColor = MeeshyPalette.Indigo700, spotColor = MeeshyPalette.Indigo700)
            .then(if (fill == null) Modifier.background(MeeshyGradients.brand, shape) else Modifier.background(fill, shape))
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(flag, style = meeshyText(MeeshyFontSize.headline))
        Text(
            text = text,
            color = if (translated) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary,
            style = meeshyText(MeeshyFontSize.headline, FontWeight.SemiBold, rounded = true),
        )
        if (translated) {
            Icon(Icons.Filled.Translate, contentDescription = null, tint = MeeshyPalette.White.copy(alpha = 0.85f))
        }
    }
}
