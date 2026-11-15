package me.meeshy.ui.component.kit

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * **L'en-tête d'un mode plein écran** (K16) : « Quitter » en capsule de verre au bord de début, l'emplacement [center] au
 * milieu du cadre, l'[accessory] juste avant la validation, et la validation en capsule blanche au bord de fin. Aucun
 * titre peint : le nom du mode ([label]) vit dans l'accessibilité et est annoncé à l'entrée.
 *
 * Atome opaque : l'hôte fournit les actions ; le cadre ne sait ni ce que Quitter défait ni ce que Valider garde. Hors des
 * capsules il laisse passer tous les touchers. Échap, le retour matériel et le geste d'échappement du lecteur d'écran
 * valent Quitter ; Ctrl ou Méta + Entrée vaut la validation.
 *
 * Quand il ne tient plus, la loi [MeeshyModeHeaderFit] réduit dans l'ordre : le centre en glyphe, la validation en coche,
 * puis les libellés à 80 % et leur troncature, Quitter en dernier. Un emplacement vide se passe à `null`. Le pas se décide
 * sans rien dupliquer pour le lecteur d'écran ; en contrepartie un [center] garni est composé une fois de plus, en sonde
 * sans sémantique, pour que sa largeur réduite soit connue : c'est une capsule, qu'il ne faut pas charger d'effets.
 *
 * Il ne se recompose pas à paramètres égaux : les actions se comparent sur leurs valeurs, jamais sur leur fermeture ; un
 * hôte qui passe `center` ou `accessory` en ligne les mémorise. Pendant iOS : `MeeshyModeHeader`.
 */
@Composable
public fun MeeshyModeHeader(
    label: String,
    exit: MeeshyModeAction,
    modifier: Modifier = Modifier,
    confirm: MeeshyModeAction? = null,
    presence: MeeshyModeChromePresence = MeeshyModeChromePresence.Shown,
    tone: MeeshyGlassTone? = null,
    headerInset: Dp = MeeshyModeChromeRecipe.headerInset.dp,
    exitOnEscape: Boolean = true,
    confirmShortcut: Boolean = true,
    center: (@Composable () -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
) {
    MeeshyModeHeaderPiece(
        label = label, exit = exit, confirm = confirm, presence = presence, tone = tone, headerInset = headerInset,
        exitOnEscape = exitOnEscape, confirmShortcut = confirmShortcut, ownsShortcuts = true,
        center = center, accessory = accessory, modifier = modifier,
    )
}

/**
 * L'en-tête et ce qu'il porte. [ownsShortcuts] : l'en-tête seul prend le retour matériel et les raccourcis ; dans le cadre
 * complet, c'est la racine du cadre qui les prend (un raccourci frappé dans la plaque doit aussi partir).
 */
@Composable
internal fun MeeshyModeHeaderPiece(
    label: String,
    exit: MeeshyModeAction,
    confirm: MeeshyModeAction?,
    presence: MeeshyModeChromePresence,
    tone: MeeshyGlassTone?,
    headerInset: Dp,
    exitOnEscape: Boolean,
    confirmShortcut: Boolean,
    ownsShortcuts: Boolean,
    center: (@Composable () -> Unit)?,
    accessory: (@Composable () -> Unit)?,
    modifier: Modifier = Modifier,
) {
    require(label.isNotEmpty()) { "MeeshyModeHeader : le nom du mode est obligatoire et non vide" }
    val actions = rememberMeeshyModeActions(exit, confirm)
    val rule = remember(confirm != null, center != null, accessory != null, presence) {
        MeeshyModeChromeRule.resolve(
            hasConfirm = confirm != null, hasCenter = center != null, hasAccessory = accessory != null,
            hasPlate = false, presence = presence,
        )
    }
    if (ownsShortcuts && rule.acceptsTouches) {
        BackHandler(enabled = exitOnEscape) { actions.performExit() }
    }
    val shortcuts = if (ownsShortcuts) {
        Modifier.meeshyModeShortcuts(actions, exitOnEscape = exitOnEscape, confirmShortcut = confirmShortcut)
    } else {
        Modifier
    }
    MeeshyModePresence(presence = presence, edge = MeeshyModeEdge.Top, modifier = modifier) {
        MeeshyModeToned(tone) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        top = (headerInset - MeeshyModeChromeRecipe.touchSlack.dp).coerceAtLeast(0.dp),
                        start = headerInset,
                        end = headerInset,
                    )
                    .then(shortcuts)
                    .semantics {
                        paneTitle = label
                        isTraversalGroup = true
                        dismiss { actions.performExit() }
                    },
            ) {
                MeeshyModeHeaderRow(
                    exit = actions.exitValues, onExit = actions.onExit,
                    confirm = actions.confirmValues, onConfirm = actions.onConfirm,
                    center = center, accessory = accessory,
                )
            }
        }
    }
}

/** Pose le ton de l'hôte quand il en donne un, sinon laisse celui du dessus. */
@Composable
internal fun MeeshyModeToned(tone: MeeshyGlassTone?, content: @Composable () -> Unit) {
    if (tone == null) content() else ProvideMeeshyGlassTone(tone, content)
}

// region Les actions et leur chemin unique

/**
 * Les actions de l'en-tête, prêtes à se déclencher : leurs VALEURS (comparables), des fermetures STABLES qui lisent
 * toujours la dernière action de l'hôte, et le chemin unique (`perform`) que partagent le toucher, le retour matériel,
 * l'échappement du lecteur d'écran et le raccourci clavier.
 */
internal class MeeshyModeActions(
    val exitValues: MeeshyModeActionValues,
    val confirmValues: MeeshyModeActionValues?,
    val onExit: () -> Unit,
    val onConfirm: () -> Unit,
    private val play: (MeeshyGlassButtonHaptic) -> Unit,
) {
    fun performExit(): Boolean = exitValues.perform(play, onExit)

    fun performConfirm(): Boolean = confirmValues?.perform(play, onConfirm) ?: false
}

@Composable
internal fun rememberMeeshyModeActions(exit: MeeshyModeAction, confirm: MeeshyModeAction?): MeeshyModeActions {
    val haptics = rememberMeeshyHaptics()
    val latestExit = rememberUpdatedState(exit.onClick)
    val latestConfirm = rememberUpdatedState(confirm?.onClick)
    val onExit: () -> Unit = remember { { latestExit.value() } }
    val onConfirm: () -> Unit = remember { { latestConfirm.value?.invoke() } }
    val play: (MeeshyGlassButtonHaptic) -> Unit = remember(haptics) { { _ -> haptics.light() } }
    val exitValues = exit.values
    val confirmValues = confirm?.values
    return remember(exitValues, confirmValues, play) { MeeshyModeActions(exitValues, confirmValues, onExit, onConfirm, play) }
}

// endregion

// region Le clavier

/** Ce qu'un raccourci clavier demande. */
internal enum class MeeshyModeShortcut {
    Exit,
    Confirm,
}

/** La table des raccourcis, pure : Échap vaut Quitter ; Ctrl ou Méta + Entrée vaut la validation. Les deux se coupent. */
internal object MeeshyModeShortcuts {
    fun resolve(
        key: Key,
        isKeyDown: Boolean,
        isCommand: Boolean,
        exitOnEscape: Boolean,
        confirmShortcut: Boolean,
        hasConfirm: Boolean,
    ): MeeshyModeShortcut? = when {
        !isKeyDown -> null
        key == Key.Escape && exitOnEscape -> MeeshyModeShortcut.Exit
        (key == Key.Enter || key == Key.NumPadEnter) && isCommand && confirmShortcut && hasConfirm -> MeeshyModeShortcut.Confirm
        else -> null
    }
}

/** Échap et Ctrl/Méta + Entrée, par le chemin unique de l'action ; la touche est mangée seulement si elle a servi. */
internal fun Modifier.meeshyModeShortcuts(
    actions: MeeshyModeActions,
    exitOnEscape: Boolean,
    confirmShortcut: Boolean,
): Modifier = onPreviewKeyEvent { event ->
    val shortcut = MeeshyModeShortcuts.resolve(
        key = event.key,
        isKeyDown = event.type == KeyEventType.KeyDown,
        isCommand = event.isCtrlPressed || event.isMetaPressed,
        exitOnEscape = exitOnEscape,
        confirmShortcut = confirmShortcut,
        hasConfirm = actions.confirmValues != null,
    )
    when (shortcut) {
        MeeshyModeShortcut.Exit -> actions.performExit().let { true }
        MeeshyModeShortcut.Confirm -> actions.performConfirm().let { true }
        null -> false
    }
}

// endregion
