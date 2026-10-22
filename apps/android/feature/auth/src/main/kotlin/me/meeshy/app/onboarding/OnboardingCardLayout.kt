package me.meeshy.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.graphicsLayer
import kotlin.math.roundToInt
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

/**
 * Les règles qui font TENIR une carte dans l'écran, sans défilement caché : l'illustration —
 * décorative — cède la place au contenu, jamais l'inverse (iOS `OnboardingCardFit`).
 */
internal object OnboardingCardFit {
    /** En deçà, une illustration réduite n'est plus lisible : on la retire plutôt que la montrer. */
    const val MINIMUM_ILLUSTRATION_SCALE: Float = 0.6f

    /** À partir de cette échelle de police, les boutons suivent le contenu dans le défilement. */
    const val ACCESSIBILITY_FONT_SCALE: Float = 1.5f

    /**
     * L'échelle de l'illustration pour la place qui reste ([room]), dans ]0, 1] — ou 0 pour la
     * retirer. Tant que la taille naturelle n'est pas mesurée (<= 0), rien ne change.
     */
    fun illustrationScale(natural: Float, room: Float): Float {
        if (natural <= 0f || room >= natural) return 1f
        val scale = room / natural
        return if (scale >= MINIMUM_ILLUSTRATION_SCALE) scale else 0f
    }

    fun isAccessibilitySize(fontScale: Float): Boolean = fontScale >= ACCESSIBILITY_FONT_SCALE
}

private val CardPadding = MeeshySpacing.lg
private val CardSpacing = MeeshySpacing.lg
private val ScrollTop = MeeshySpacing.sm
private val ScrollBottom = MeeshySpacing.lg
private val CardMaxWidth = 560.dp

internal const val ONBOARDING_CARD_TAG = "onboarding.card"

/**
 * Le gabarit commun des cartes : illustration, titre, phrase, contenu propre à la carte, puis UN
 * bouton principal et un « Plus tard » discret (iOS `OnboardingCardLayout`).
 *
 * Les boutons vivent SOUS la zone défilante, jamais par-dessus : rien de ce que la carte montre
 * ne peut passer derrière eux. Pour tenir, c'est l'illustration qui se réduit à la place qui
 * reste, puis disparaît sous [OnboardingCardFit.MINIMUM_ILLUSTRATION_SCALE]. Si le contenu
 * déborde encore, le défilement prend le relais et un fondu signale la suite. En grandes
 * polices, les boutons quittent le bas de l'écran pour suivre le contenu : épinglés, deux
 * boutons mangeraient la moitié de la hauteur.
 */
@Composable
internal fun OnboardingCardLayout(
    title: String,
    message: String,
    primary: OnboardingAction,
    modifier: Modifier = Modifier,
    secondary: OnboardingAction? = null,
    illustration: @Composable () -> Unit = {},
    content: @Composable ColumnScope.() -> Unit = {},
) {
    val density = LocalDensity.current
    val accessibilitySize = OnboardingCardFit.isAccessibilitySize(density.fontScale)
    val scrollState = rememberScrollState()
    var roomyViewport by remember { mutableIntStateOf(0) }
    var cardBody by remember { mutableIntStateOf(0) }
    var naturalIllustration by remember { mutableIntStateOf(0) }

    val illustrationScale = if (accessibilitySize || roomyViewport <= 0 || cardBody <= 0) {
        1f
    } else {
        val chrome = with(density) { (CardPadding * 2 + CardSpacing + ScrollTop + ScrollBottom).toPx() }
        OnboardingCardFit.illustrationScale(naturalIllustration.toFloat(), roomyViewport - cardBody - chrome)
    }

    Column(modifier = modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .onSizeChanged { roomyViewport = maxOf(roomyViewport, it.height) },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(start = MeeshySpacing.xl, end = MeeshySpacing.xl, top = ScrollTop, bottom = ScrollBottom),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                OnboardingCardSurface(
                    title = title,
                    message = message,
                    illustrationScale = illustrationScale,
                    onNaturalIllustration = { naturalIllustration = it },
                    onBodyHeight = { cardBody = it },
                    illustration = illustration,
                    content = content,
                )
                if (accessibilitySize) OnboardingActions(primary, secondary)
            }
            if (scrollState.canScrollForward) MoreBelowFade(Modifier.align(Alignment.BottomCenter))
        }
        if (!accessibilitySize) {
            OnboardingActions(
                primary = primary,
                secondary = secondary,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.sm),
            )
        }
    }
}

@Composable
private fun OnboardingCardSurface(
    title: String,
    message: String,
    illustrationScale: Float,
    onNaturalIllustration: (Int) -> Unit,
    onBodyHeight: (Int) -> Unit,
    illustration: @Composable () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val isDark = MeeshyTheme.isDark
    val shape = RoundedCornerShape(30.dp)
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier
            .widthIn(max = CardMaxWidth)
            .fillMaxWidth()
            .shadow(
                elevation = 16.dp,
                shape = shape,
                ambientColor = MeeshyPalette.Indigo700.copy(alpha = if (isDark) 0.45f else 0.16f),
                spotColor = MeeshyPalette.Indigo700.copy(alpha = if (isDark) 0.45f else 0.16f),
            )
            .background(if (isDark) MeeshyPalette.Indigo950.copy(alpha = 0.85f) else MeeshyPalette.White.copy(alpha = 0.92f), shape)
            .border(1.dp, MeeshyGradients.glassBorder(isDark), shape)
            .padding(CardPadding)
            .semantics { isTraversalGroup = true },
        verticalArrangement = Arrangement.spacedBy(CardSpacing),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (illustrationScale > 0f) {
            ScaledIllustration(illustrationScale, onNaturalIllustration, illustration)
        }
        Column(
            modifier = Modifier.onSizeChanged { onBodyHeight(it.height) },
            verticalArrangement = Arrangement.spacedBy(CardSpacing),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = title,
                    color = tokens.textPrimary,
                    textAlign = TextAlign.Center,
                    style = meeshyText((MeeshyFontSize.title.value + 4f).sp, FontWeight.Bold, rounded = true),
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = message,
                    color = tokens.textSecondary,
                    textAlign = TextAlign.Center,
                    style = meeshyText(MeeshyFontSize.headline),
                )
            }
            content()
        }
    }
}

/**
 * Décorative et masquée au lecteur d'écran, l'illustration plafonne sa taille de texte. Mesurée à
 * sa taille NATURELLE puis réduite d'un bloc — une réduction qui garde ses proportions, jamais
 * une coupe.
 */
@Composable
private fun ScaledIllustration(scale: Float, onNaturalHeight: (Int) -> Unit, content: @Composable () -> Unit) {
    val base = LocalDensity.current
    val capped = Density(base.density, OnboardingMotionPolicy.cappedIllustrationFontScale(base.fontScale))
    Layout(
        content = {
            Box(Modifier.onSizeChanged { onNaturalHeight(it.height) }) {
                CompositionLocalProvider(LocalDensity provides capped) { content() }
            }
        },
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics {},
    ) { measurables, constraints ->
        val placeable = measurables.first().measure(
            Constraints(maxWidth = constraints.maxWidth, maxHeight = Constraints.Infinity),
        )
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else placeable.width
        val height = (placeable.height * scale).roundToInt()
        layout(width, height) {
            placeable.placeWithLayer((width - placeable.width) / 2, 0) {
                scaleX = scale
                scaleY = scale
                transformOrigin = TransformOrigin(0.5f, 0f)
            }
        }
    }
}

@Composable
private fun OnboardingActions(primary: OnboardingAction, secondary: OnboardingAction?, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.widthIn(max = CardMaxWidth).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        OnboardingPrimaryButton(primary)
        secondary?.let { OnboardingSecondaryButton(it) }
    }
}

/** Le contenu qui continue plus bas s'efface au lieu d'être coupé net. */
@Composable
private fun MoreBelowFade(modifier: Modifier) {
    val background = MeeshyTheme.tokens.backgroundPrimary
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(28.dp)
            .background(Brush.verticalGradient(listOf(background.copy(alpha = 0f), background.copy(alpha = 0.9f))))
            .clearAndSetSemantics {},
    )
}
