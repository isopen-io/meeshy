package me.meeshy.ui.component.fullscreen

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.onClick as onSemanticsClick

/**
 * Le geste d'un contrôle du chrome. Tant que le chrome est interactif
 * ([LocalFullscreenChromeInteractive]), un toucher bref déclenche [onClick] avec un retour
 * haptique léger ; sinon AUCUN geste n'est installé — le toucher tombe sur le média en dessous.
 *
 * [viaGesture] est pour la cellule qui porte AUSSI un geste séquencé de l'hôte (appui long puis
 * glisser) : un `clickable` consommerait le toucher et la séquence ne s'armerait jamais. Le tap
 * bref reste servi, et TalkBack aussi (action « cliquer » de la sémantique).
 */
@Composable
internal fun Modifier.fullscreenTappable(
    onClickLabel: String?,
    viaGesture: Boolean = false,
    onClick: () -> Unit,
): Modifier {
    val interactive = LocalFullscreenChromeInteractive.current
    val haptic = LocalHapticFeedback.current
    val currentOnClick by rememberUpdatedState(onClick)
    val tap = {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        currentOnClick()
    }
    return when {
        !interactive -> this
        viaGesture -> this
            .pointerInput(Unit) { detectTapGestures(onTap = { tap() }) }
            .semantics {
                role = Role.Button
                onSemanticsClick(label = onClickLabel) {
                    tap()
                    true
                }
            }

        else -> this.clickable(onClickLabel = onClickLabel, role = Role.Button) { tap() }
    }
}

/**
 * Un bouton du chrome plein écran : le disque, son geste, son libellé TalkBack. Un état [isActive]
 * (réactions ouvertes, son coupé…) se teinte de [activeTint] et s'annonce « sélectionné ». [hint]
 * est le verbe que TalkBack lit après « double-toucher pour… ».
 *
 * La cible tactile fait [FullscreenChromeDimens.tapTarget] (48 dp), le disque
 * [FullscreenChromeDimens.discDiameter] (40 dp).
 */
@Composable
public fun FullscreenChromeButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    badge: ImageVector? = null,
    tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia,
    isActive: Boolean = false,
    activeTint: Color? = null,
) {
    FullscreenChromeDisc(
        icon = icon,
        badge = badge,
        tone = tone,
        activeTint = if (isActive) activeTint else null,
        modifier = modifier
            .clip(CircleShape)
            .fullscreenTappable(onClickLabel = hint, onClick = onClick)
            .semantics {
                contentDescription = label
                if (isActive) selected = true
            },
    )
}
