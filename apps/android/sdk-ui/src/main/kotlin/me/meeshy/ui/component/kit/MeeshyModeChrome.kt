package me.meeshy.ui.component.kit

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * **Le cadre d'un mode plein écran** (K16) : l'en-tête (Quitter · centre · accessoire · Valider) en haut, UNE plaque de
 * verre basse pour les réglages de l'outil, et rien d'autre. Il se pose EN SURIMPRESSION du contenu de l'hôte, dans le
 * cadre que l'hôte lui donne (la scène sur téléphone) ; le contenu reste manipulable derrière : hors des capsules et de
 * la plaque, tous les touchers passent.
 *
 * - Loi 13 : pas de validation sans [confirm], pas de centre ni d'accessoire sans emplacement garni (`null`), pas de
 *   plaque (ni verre, ni bande vide) sans [plate], jamais de titre peint, jamais de légende sous un bouton.
 * - [presence] `Stowed` (on filme) : ni en-tête ni plaque, aucun toucher reçu.
 * - Le bas de la plaque suit la zone sûre (`max(zone sûre + 12, 28)`), jamais le clavier : [safeBottom] vaut la barre de
 *   navigation du système ; un hôte qui a déjà inséré son cadre passe `0.dp`.
 * - Sur grand écran l'hôte pose [MeeshyModeHeader] et [MeeshyModePlate] séparément (I3).
 *
 * Atome opaque : ni composer, ni appel, ni singleton nommé Meeshy. Ce que Quitter défait et ce que Valider garde, la
 * confirmation d'abandon et le ton du verre sont à l'hôte. Pendant iOS : `MeeshyModeChrome`.
 */
@Composable
public fun MeeshyModeChrome(
    label: String,
    exit: MeeshyModeAction,
    modifier: Modifier = Modifier,
    confirm: MeeshyModeAction? = null,
    presence: MeeshyModeChromePresence = MeeshyModeChromePresence.Shown,
    tone: MeeshyGlassTone? = null,
    headerInset: Dp = MeeshyModeChromeRecipe.headerInset.dp,
    plateLabel: String? = null,
    plateMaxWidth: Dp? = null,
    plateScrollLocked: Boolean = false,
    plateContentKey: Any? = null,
    plateWindowHeight: Dp? = null,
    safeBottom: Dp? = null,
    exitOnEscape: Boolean = true,
    confirmShortcut: Boolean = true,
    center: (@Composable () -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
    plate: (@Composable ColumnScope.() -> Unit)? = null,
) {
    require(label.isNotEmpty()) { "MeeshyModeChrome : le nom du mode est obligatoire et non vide" }
    require(plate == null || !plateLabel.isNullOrEmpty()) { "MeeshyModeChrome : plateLabel est obligatoire dès qu'il y a une plaque" }
    val actions = rememberMeeshyModeActions(exit, confirm)
    val density = LocalDensity.current
    val bottomInset = safeBottom ?: with(density) { WindowInsets.navigationBars.getBottom(density).toDp() }
    BackHandler(enabled = exitOnEscape && !presence.isStowed) { actions.performExit() }

    Box(
        modifier = modifier
            .fillMaxSize()
            .meeshyModeShortcuts(actions, exitOnEscape = exitOnEscape, confirmShortcut = confirmShortcut),
    ) {
        MeeshyModeHeaderPiece(
            label = label, exit = exit, confirm = confirm, presence = presence, tone = tone, headerInset = headerInset,
            exitOnEscape = exitOnEscape, confirmShortcut = confirmShortcut, ownsShortcuts = false,
            center = center, accessory = accessory, modifier = Modifier.align(Alignment.TopCenter),
        )
        if (plate != null && plateLabel != null) {
            MeeshyModePlate(
                label = plateLabel,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(
                        start = MeeshyModeChromeRecipe.plateEdge.dp,
                        end = MeeshyModeChromeRecipe.plateEdge.dp,
                        bottom = MeeshyModePlateMetrics.bottomMargin(bottomInset.value).dp,
                    ),
                maxWidth = plateMaxWidth,
                scrollLocked = plateScrollLocked,
                presence = presence,
                tone = tone,
                contentKey = plateContentKey,
                windowHeight = plateWindowHeight,
                content = plate,
            )
        }
    }
}
