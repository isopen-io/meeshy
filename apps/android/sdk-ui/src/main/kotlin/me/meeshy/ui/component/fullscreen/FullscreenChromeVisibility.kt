package me.meeshy.ui.component.fullscreen

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.fullscreen.FullscreenChromeState
import me.meeshy.ui.R

/**
 * Vrai tant que le chrome peut recevoir un toucher. [FullscreenChromeVisibility] le passe à faux
 * dès que le chrome s'efface : les boutons du kit n'installent alors plus aucun geste, et un
 * toucher posé dessus tombe sur le média en dessous.
 */
public val LocalFullscreenChromeInteractive: ProvidableCompositionLocal<Boolean> =
    staticCompositionLocalOf { true }

private const val CHROME_FADE_MILLIS: Int = 200

/**
 * **Le chrome qui s'efface ne se touche plus ni ne se lit plus.** Il part en fondu, donc il reste
 * dans l'arbre pendant la transition — sans la garde, un toucher posé pendant ces deux dixièmes
 * actionnerait un bouton que l'utilisateur voit disparaître. Dès [visible] à faux :
 * - aucun bouton du kit n'intercepte plus un toucher (le média en dessous le reçoit) ;
 * - le chrome sort de l'arbre d'accessibilité, où TalkBack ne lirait que des boutons invisibles ;
 * - un relais d'accessibilité unique prend sa place si [onReveal] est fourni : « Afficher les
 *   commandes », activable par TalkBack, qui ramène le chrome. Il ne porte aucun geste tactile.
 *
 * Le conteneur remplit son parent : c'est la couche de chrome d'un visualiseur plein écran.
 */
@Composable
public fun FullscreenChromeVisibility(
    visible: Boolean,
    modifier: Modifier = Modifier,
    onReveal: (() -> Unit)? = null,
    revealLabel: String = stringResource(R.string.fullscreen_show_controls),
    content: @Composable BoxScope.() -> Unit,
) {
    val chromeAlpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(durationMillis = CHROME_FADE_MILLIS, easing = FastOutSlowInEasing),
        label = "fullscreenChromeAlpha",
    )
    Box(modifier) {
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = chromeAlpha }
                .then(if (visible) Modifier else Modifier.clearAndSetSemantics { }),
        ) {
            CompositionLocalProvider(LocalFullscreenChromeInteractive provides visible) {
                content()
            }
        }
        if (!visible && onReveal != null) {
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .size(FullscreenChromeDimens.tapTarget)
                    .semantics {
                        contentDescription = revealLabel
                        role = Role.Button
                        onClick(label = revealLabel) {
                            onReveal()
                            true
                        }
                    },
            )
        }
    }
}

/**
 * L'effacement automatique d'une vidéo en lecture : arme le délai de [state]
 * ([FullscreenChromeState.autoHideDelay]) et, à son terme, appelle [onAutoHide]. Rien n'est armé
 * à l'arrêt, chrome déjà effacé, ou surface ouverte. [restartKey] relance le délai (un toucher
 * sur le chrome, un glissement de la barre de progression).
 */
@Composable
public fun FullscreenChromeAutoHide(
    state: FullscreenChromeState,
    isPlaying: Boolean,
    onAutoHide: () -> Unit,
    restartKey: Any? = null,
) {
    LaunchedEffect(state, isPlaying, restartKey) {
        val wait = state.autoHideDelay(isPlaying) ?: return@LaunchedEffect
        delay(wait)
        onAutoHide()
    }
}
