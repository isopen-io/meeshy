package me.meeshy.ui.component.fullscreen

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.R

/** La porte de sortie d'un plein écran : une croix, ou un retour pour une navigation qu'on quitte aussi par le bord. */
public enum class FullscreenExitStyle(internal val symbol: FullscreenChromeSymbol) {
    /** Une croix : un plein écran posé sur l'écran. */
    Close(FullscreenChromeSymbol.Close),

    /** Une flèche de retour (miroitée en arabe) : une navigation qu'on quitte aussi par le bord. */
    Back(FullscreenChromeSymbol.Back),
}

/**
 * La porte de sortie — croix ou retour — au bord de DÉBUT de lecture de la barre haute (à gauche,
 * à droite en arabe), la même dans chaque visualiseur. Le libellé TalkBack vient du kit : aucun
 * visualiseur ne nomme sa croix à sa façon.
 */
@Composable
public fun FullscreenCloseButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia,
    exit: FullscreenExitStyle = FullscreenExitStyle.Close,
    hint: String? = null,
) {
    val label = when (exit) {
        FullscreenExitStyle.Close -> stringResource(R.string.fullscreen_close)
        FullscreenExitStyle.Back -> stringResource(R.string.fullscreen_back)
    }
    FullscreenChromeButton(
        icon = exit.symbol.icon,
        label = label,
        onClick = onClick,
        modifier = modifier,
        hint = hint,
        tone = tone,
    )
}
