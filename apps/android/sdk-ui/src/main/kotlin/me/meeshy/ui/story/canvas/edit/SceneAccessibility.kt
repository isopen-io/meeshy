package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Une action personnalisée de TalkBack, déjà libellée : la même liste que le menu d'appui long. */
public data class SceneA11yAction(val label: String, val perform: () -> Unit)

/** Un objet tel que TalkBack le lit : son libellé servi, et ses actions. */
public data class SceneA11yNode(val id: String, val label: String, val actions: List<SceneA11yAction>)

/** L'objet lu comme un seul nœud fusionné, avec ses actions personnalisées. */
public fun Modifier.sceneObjectSemantics(label: String, actions: List<SceneA11yAction>): Modifier =
    semantics(mergeDescendants = true) {
        contentDescription = label
        customActions = actions.map { action -> CustomAccessibilityAction(action.label) { action.perform(); true } }
    }

/**
 * La couche d'accessibilité de la scène : le résumé (« N objets : … ») puis chaque objet, en nœuds invisibles
 * de 48 dp qui ne captent aucun toucher. [summary] est `null` sur une slide vide : pas de résumé fantôme.
 */
@Composable
public fun SceneAccessibilityLayer(
    summary: String?,
    nodes: List<SceneA11yNode>,
    modifier: Modifier = Modifier,
) {
    if (summary == null && nodes.isEmpty()) return
    Column(modifier) {
        summary?.let { text ->
            Box(Modifier.size(48.dp).semantics { contentDescription = text })
        }
        nodes.forEach { node ->
            Box(Modifier.size(48.dp).sceneObjectSemantics(node.label, node.actions))
        }
    }
}
