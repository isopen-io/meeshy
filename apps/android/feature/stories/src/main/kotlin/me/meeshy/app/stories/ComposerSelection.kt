package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import me.meeshy.feature.stories.R

/**
 * La sélection d'un objet de la scène ne se DESSINE pas (#14207, décision porteur du 2026-11-01) : toucher l'objet change
 * déjà le rail (ses options d'édition) et le fait passer au premier plan, aucun cadre ne s'y ajoute. Seul TalkBack
 * l'entend : l'objet sélectionné se dit sélectionné.
 */
@Composable
internal fun Modifier.sceneSelection(selected: Boolean): Modifier {
    if (!selected) return this
    val label = stringResource(R.string.composer_selection_selected)
    return semantics {
        this.selected = true
        stateDescription = label
    }
}
