package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.alpha
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.sdk.model.rootnav.SplashPhase
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.app.R
import me.meeshy.sdk.model.rootnav.RootPresentationRules
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Duree du fondu de la celebration d'arrivee (iOS : `easeInOut(duration: 0.35)`). */
internal const val ARRIVAL_CELEBRATION_FADE_MS = 350

/**
 * Etat de la celebration d'arrivee apres inscription : posee par la fin du parcours d'inscription
 * (`begin`), levee par le bouton Passer ou le toucher (`skip`). Singleton : elle doit survivre au
 * remplacement de l'ecran d'inscription par la racine connectee.
 */
@Singleton
class ArrivalCelebrationController @Inject constructor() {
    private val mutableIsShowing = MutableStateFlow(false)
    val isShowing: StateFlow<Boolean> = mutableIsShowing.asStateFlow()

    fun begin() {
        mutableIsShowing.value = true
    }

    fun skip() {
        mutableIsShowing.value = false
    }
}

@HiltViewModel
class ArrivalCelebrationViewModel @Inject constructor(
    val controller: ArrivalCelebrationController,
) : ViewModel()

/** Vrai tant que la celebration couvre l'ecran : le contenu dessous est masque a TalkBack. */
fun isContentHiddenByCelebration(isAuthenticated: Boolean, isShowing: Boolean): Boolean =
    RootPresentationRules.showsCelebration(isAuthenticated = isAuthenticated, isShowing = isShowing)

/** Masque le contenu a TalkBack tant que la celebration est presente. */
fun Modifier.hiddenFromAccessibilityWhile(hidden: Boolean): Modifier =
    if (hidden) clearAndSetSemantics {} else this

@Composable
internal fun ArrivalCelebration(
    isShowing: Boolean,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = isShowing,
        enter = fadeIn(tween(ARRIVAL_CELEBRATION_FADE_MS)),
        exit = fadeOut(tween(ARRIVAL_CELEBRATION_FADE_MS)),
        modifier = modifier,
    ) {
        val interaction = remember { MutableInteractionSource() }
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MeeshyTheme.tokens.backgroundPrimary)
                .clickable(interactionSource = interaction, indication = null, onClick = onSkip)
                .padding(horizontal = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MeeshyTheme.tokens.success,
                modifier = Modifier.size(104.dp),
            )
            Text(
                text = stringResource(R.string.arrival_celebration_title),
                color = MeeshyTheme.tokens.textPrimary,
                textAlign = TextAlign.Center,
                style = androidx.compose.material3.MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics {
                    heading()
                    liveRegion = LiveRegionMode.Polite
                },
            )
            Text(
                text = stringResource(R.string.arrival_celebration_lead),
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
                style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
            )
            TextButton(onClick = onSkip) {
                Text(stringResource(R.string.arrival_celebration_skip))
            }
        }
    }
}

/**
 * Le contenu de la racine reste monte mais a opacite 0 tant que le rideau couvre, et il est
 * masque a TalkBack sous le rideau comme sous la celebration d'arrivee.
 */
@Composable
internal fun Modifier.rootPresentationContent(): Modifier {
    val phase = rootSplashPhase()
    val authenticated by hiltViewModel<AuthViewModel>().state.collectAsStateWithLifecycle()
    val celebrating by hiltViewModel<ArrivalCelebrationViewModel>().controller.isShowing.collectAsStateWithLifecycle()
    val hidden = phase == SplashPhase.COVERING || isContentHiddenByCelebration(authenticated.isAuthenticated, celebrating)
    return alpha(RootPresentationRules.contentAlpha(phase)).hiddenFromAccessibilityWhile(hidden)
}

/** La celebration plein ecran, posee par-dessus le contenu (sous le rideau de demarrage). */
@Composable
internal fun ArrivalCelebrationHost() {
    val authenticated by hiltViewModel<AuthViewModel>().state.collectAsStateWithLifecycle()
    val controller = hiltViewModel<ArrivalCelebrationViewModel>().controller
    val showing by controller.isShowing.collectAsStateWithLifecycle()
    ArrivalCelebration(
        isShowing = RootPresentationRules.showsCelebration(authenticated.isAuthenticated, showing),
        onSkip = controller::skip,
    )
}
