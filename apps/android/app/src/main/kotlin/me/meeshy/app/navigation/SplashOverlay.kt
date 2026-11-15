package me.meeshy.app.navigation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.BuildConfig
import me.meeshy.app.R
import me.meeshy.sdk.model.rootnav.RootSplashTiming
import me.meeshy.sdk.model.rootnav.SplashPhase
import me.meeshy.ui.component.chrome.MeeshySplashScreen

/** La phase courante du rideau ; `GONE` quand aucun rideau n'est fourni (hors racine). */
@Composable
internal fun rootSplashPhase(): SplashPhase {
    val gate = LocalRootSplashGate.current ?: return SplashPhase.GONE
    val phase by gate.phase.collectAsStateWithLifecycle()
    return phase
}

/**
 * Branded splash, en trois temps (parite iOS `RootScene`) : COVERING (opaque, il avale les touches
 * et TalkBack), REVEALING (fondu de [RootSplashTiming.REVEAL_MS]), GONE (il quitte l'arbre). Le
 * contenu de la racine reste monte dessous a opacite 0 : il se prepare pendant que le rideau couvre.
 */
@Composable
internal fun SplashOverlay() {
    val phase = rootSplashPhase()
    val alpha by animateFloatAsState(
        targetValue = if (phase == SplashPhase.COVERING) 1f else 0f,
        animationSpec = tween(durationMillis = RootSplashTiming.REVEAL_MS.toInt()),
        label = "splashAlpha",
    )
    if (phase == SplashPhase.GONE) return
    val interaction = remember { MutableInteractionSource() }
    MeeshySplashScreen(
        tagline = stringResource(R.string.splash_tagline),
        versionLabel = stringResource(
            R.string.splash_version_label,
            BuildConfig.VERSION_NAME,
            BuildConfig.VERSION_CODE.toString(),
        ),
        credit = stringResource(R.string.brand_signature_credit),
        modifier = Modifier
            .fillMaxSize()
            .alpha(alpha)
            .clickable(interactionSource = interaction, indication = null, onClick = {})
            .then(if (phase == SplashPhase.COVERING) Modifier else Modifier.clearAndSetSemantics {}),
    )
}
