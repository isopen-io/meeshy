package me.meeshy.ui.component.auth

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.auth.AuthActionButtonState
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

internal const val AUTH_ACTION_SPINNER_TAG: String = "auth.action.spinner"

private const val PRESSED_SCALE = 0.92f

/**
 * L'action principale d'un écran d'accès — « Se connecter », « Recevoir le lien »,
 * « Enregistrer le mot de passe » (iOS `AuthActionButton` + `LoginView.loginButton`).
 *
 * Pleine largeur de SA colonne : c'est la colonne qui se borne ([me.meeshy.ui.theme.formColumnWidth]),
 * le bouton la suit. Le dégradé de marque ne change jamais de teinte.
 *
 * - **Bloqué par son hôte** ([enabled] faux : formulaire incomplet) : il SE VOIT bloqué —
 *   opacité 0,6, animée — et ignore le toucher ; TalkBack l'annonce « désactivé ».
 * - **Envoi en cours** ([isLoading]) : un indicateur remplace le libellé, mais le lecteur
 *   d'écran GARDE le libellé — un bouton qui ne s'annonce plus que « en cours » ne dit plus
 *   ce qu'il fait. Le toucher est ignoré : un envoi ne part pas deux fois.
 * - **Au toucher** : le bouton rebondit (ressort à 0,92) et le téléphone vibre d'un tic
 *   léger, le temps que le réseau réponde.
 *
 * La logique des états est dans [AuthActionButtonState] (`:core:model`), prouvée sans écran.
 */
@Composable
public fun AuthActionButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
) {
    val state = AuthActionButtonState.resolve(enabled = enabled, loading = isLoading)
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && state.acceptsTaps) PRESSED_SCALE else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "authActionScale",
    )
    val alpha by animateFloatAsState(
        targetValue = state.restingAlpha,
        animationSpec = MeeshyMotion.standardSpring(),
        label = "authActionAlpha",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyGradients.brand)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = state.acceptsTaps,
                role = Role.Button,
            ) {
                haptic.lightTap()
                onClick()
            }
            .semantics { contentDescription = title },
        contentAlignment = Alignment.Center,
    ) {
        if (state.showsSpinner) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp).testTag(AUTH_ACTION_SPINNER_TAG),
                strokeWidth = 2.dp,
                color = MeeshyPalette.White,
            )
        } else {
            Text(
                text = title,
                color = MeeshyPalette.White,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.titleMedium,
            )
        }
    }
}
