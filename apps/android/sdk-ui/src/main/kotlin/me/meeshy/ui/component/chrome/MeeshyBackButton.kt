package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La flèche « < » en haut à gauche de tout écran empilé (iOS : le bouton retour de la barre de
 * navigation). Cible de 48 dp, lue « Retour » par TalkBack, couleur d'accent, miroitée en RTL
 * (`MeeshyIcons.Back` est directionnel). Un écran non racine la pose dans son en-tête ; le témoin
 * `NavBackChromeTest` refuse qu'une route empilée l'oublie.
 */
@Composable
public fun MeeshyBackButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MeeshyPalette.Indigo500,
) {
    IconButton(onClick = onClick, modifier = modifier.size(BACK_TARGET_DP.dp)) {
        Icon(
            imageVector = MeeshyIcons.Back,
            contentDescription = stringResource(R.string.fullscreen_back),
            tint = tint,
        )
    }
}

private const val BACK_TARGET_DP = 48
