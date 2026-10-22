package me.meeshy.app.onboarding

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.readReduceMotion
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val ONBOARDING_OVERLAY_TAG = "onboarding.overlay"

/** Ce que le calque lit du parcours : la carte courante, les points, la progression, le gain. */
@Immutable
internal data class OnboardingOverlayState(
    val cardKey: Any,
    val sessionPoints: Int,
    val isRecap: Boolean,
    val stepPosition: Int,
    val stepCount: Int,
    val reward: OnboardingReward? = null,
)

private val BarMaxWidth = 640.dp

/**
 * Le parcours à l'écran : la pastille de points, « Tout passer », la barre de progression, puis
 * la carte courante (iOS `OnboardingOverlay`).
 *
 * Un CALQUE modal, pas une destination : le contenu dessous est retiré de l'arbre
 * d'accessibilité par l'hôte ([hiddenBehindOnboarding]), les touches ne le traversent pas, et
 * le calque porte son titre de volet. La carte courante entre par la droite (la gauche en RTL)
 * avec fondu et sort par le côté opposé (ressort 0,5 / 0,86) ; sous « Réduire les animations », fondu
 * seul. Les tailles de police sont plafonnées à l'équivalent d'`accessibility2`.
 */
@Composable
internal fun OnboardingOverlay(
    state: OnboardingOverlayState,
    onSkipAll: () -> Unit,
    modifier: Modifier = Modifier,
    reduceMotion: Boolean = rememberOnboardingReduceMotion(),
    announce: (String) -> Unit = rememberOnboardingAnnouncer(),
    onSuccessHaptic: () -> Unit = rememberOnboardingSuccessHaptic(),
    card: @Composable (cardKey: Any) -> Unit,
) {
    val isDark = MeeshyTheme.isDark
    val base = LocalDensity.current
    val capped = Density(base.density, OnboardingMotionPolicy.cappedFontScale(base.fontScale))
    val title = stringResource(R.string.onboarding_overlay_title)
    val direction = LocalLayoutDirection.current
    CompositionLocalProvider(LocalDensity provides capped) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .testTag(ONBOARDING_OVERLAY_TAG)
                .semantics {
                    paneTitle = title
                    isTraversalGroup = true
                }
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            OnboardingBackdrop(isDark)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                OnboardingTopBar(
                    showChrome = !state.isRecap,
                    progressPosition = state.stepPosition,
                    progressCount = state.stepCount,
                    onSkipAll = onSkipAll,
                    isDark = isDark,
                    modifier = Modifier
                        .widthIn(max = BarMaxWidth)
                        .padding(start = MeeshySpacing.xl, end = MeeshySpacing.xl, top = MeeshySpacing.sm),
                    pointsChip = {
                        OnboardingPointsCelebration(
                            points = state.sessionPoints,
                            reward = state.reward,
                            reduceMotion = reduceMotion,
                            announce = announce,
                            onSuccessHaptic = onSuccessHaptic,
                        )
                    },
                )
                Box(Modifier.weight(1f).fillMaxSize().padding(top = MeeshySpacing.md)) {
                    AnimatedContent(
                        targetState = state.cardKey,
                        transitionSpec = { cardTransition(reduceMotion, direction) },
                        label = "onboarding-card",
                    ) { key -> card(key) }
                }
            }
        }
    }
}

private fun cardTransition(reduceMotion: Boolean, direction: LayoutDirection): ContentTransform =
    when (OnboardingMotionPolicy.cardTransition(reduceMotion)) {
        OnboardingCardTransition.FADE ->
            fadeIn(tween(220)) togetherWith fadeOut(tween(220))
        OnboardingCardTransition.SLIDE_AND_FADE -> {
            val sign = if (direction == LayoutDirection.Rtl) -1 else 1
            val stiffness = MeeshyMotion.stiffnessForResponse(OnboardingMotionPolicy.CARD_SPRING_RESPONSE)
            val damping = OnboardingMotionPolicy.CARD_SPRING_DAMPING
            val enter = slideInHorizontally(spring(damping, stiffness)) { it * sign } + fadeIn(tween(220))
            val exit = slideOutHorizontally(spring(damping, stiffness)) { -it * sign } + fadeOut(tween(220))
            enter togetherWith exit
        }
    }

/** « Réduire les animations » : le réglage Meeshy fourni, sinon l'échelle d'animation du système. */
@Composable
internal fun rememberOnboardingReduceMotion(): Boolean {
    val context = LocalContext.current
    val provided = LocalReduceMotion.current
    return provided || remember(context) { readReduceMotion(context) }
}

/**
 * À poser sur le contenu de la racine pendant que le calque est présenté : TalkBack ne peut plus
 * y aller. Le trait modal à lui seul n'isole rien.
 */
internal fun Modifier.hiddenBehindOnboarding(isPresented: Boolean): Modifier =
    if (isPresented) clearAndSetSemantics {} else this
