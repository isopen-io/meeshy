package me.meeshy.ui.modifier

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillNode
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalAutofill
import androidx.compose.ui.platform.LocalAutofillTree

/**
 * Branche un champ sur le remplissage automatique du système.
 *
 * Compose 1.7 (BOM 2024.10) n'expose l'autofill que par son API bas niveau :
 * un [AutofillNode] déclaré dans l'arbre de la fenêtre, une boîte englobante
 * tenue à jour à chaque mesure, et une demande émise quand le champ prend le
 * focus. Rien de tout cela n'est propre à Meeshy — d'où un modificateur unique
 * plutôt que la même quinzaine de lignes recopiée sous chaque champ.
 *
 * Le composant reste AGNOSTIQUE : il ne connaît que les [types] qu'on lui donne
 * et le rappel [onFill], jamais ce que le champ signifie.
 *
 * Le nœud est MÉMORISÉ, pas recréé à chaque recomposition : l'arbre d'autofill
 * est une carte indexée par nœud, et un nœud neuf à chaque passe y ajoute une
 * entrée de plus — l'idiome répandu grossit ainsi la carte à chaque frappe.
 * Mémorisé, le même nœud se réécrit sur lui-même. Son rappel est relu par
 * [rememberUpdatedState] : sans quoi le nœud, créé une seule fois, appellerait
 * éternellement la PREMIÈRE lambda et écrirait dans un état périmé.
 *
 * @param types les catégories que le système peut servir (`AutofillType.EmailAddress`,
 *   `PersonFullName`, `PhoneNumber`, `NewPassword`, …). Passer la liste la plus
 *   étroite possible : c'est elle qui décide de ce que le gestionnaire propose.
 * @param onFill reçoit la valeur choisie par l'utilisateur dans la feuille du
 *   système.
 */
@ExperimentalComposeUiApi
@Composable
public fun Modifier.autofill(
    types: List<AutofillType>,
    onFill: (String) -> Unit,
): Modifier {
    val currentOnFill by rememberUpdatedState(onFill)
    val autofill = LocalAutofill.current
    val node = remember(types) {
        AutofillNode(autofillTypes = types, onFill = { value -> currentOnFill(value) })
    }
    LocalAutofillTree.current += node

    return this
        .onGloballyPositioned { coordinates -> node.boundingBox = coordinates.boundsInWindow() }
        .onFocusChanged { focusState ->
            val service = autofill ?: return@onFocusChanged
            if (focusState.isFocused) {
                service.requestAutofillForNode(node)
            } else {
                service.cancelAutofillForNode(node)
            }
        }
}
