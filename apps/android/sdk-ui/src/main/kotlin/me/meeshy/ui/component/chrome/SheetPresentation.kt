package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Vrai quand l'écran est présenté en FEUILLE (iOS `.sheet`) ou en plein écran modal (`.fullScreenCover`) plutôt
 * qu'empilé (#13369). Le bouton de tête d'un écran lit ce local : une flèche « < » quand il est empilé, une croix
 * quand il est une feuille — iOS ne pose jamais de flèche sur une feuille. Statique : il ne change qu'à la
 * composition de l'hôte de la feuille, jamais au fil d'un défilement.
 */
public val LocalPresentedAsSheet: ProvidableCompositionLocal<Boolean> = staticCompositionLocalOf { false }

/** L'icône du bouton de tête : croix sur une feuille, flèche (miroitée en RTL) sur un écran empilé. */
@Composable
public fun leadingNavigationIcon(): ImageVector =
    if (LocalPresentedAsSheet.current) MeeshyIcons.Close else MeeshyIcons.Back

/** Le libellé TalkBack du bouton de tête : « Fermer » sur une feuille, [backLabel] (le « Retour » de l'écran) sinon. */
@Composable
public fun leadingNavigationLabel(backLabel: String): String =
    if (LocalPresentedAsSheet.current) stringResource(R.string.fullscreen_close) else backLabel
