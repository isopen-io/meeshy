package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * La tête de la liste des conversations (#13653) : les filtres, épinglés, puis le rail de stories À LA MÊME PLACE quel
 * que soit l'état. Liste peuplée ([railInList]), le rail est sa première ligne et défile avec elle ; squelette, erreur,
 * filtre ou recherche sans résultat, il se pose juste sous les filtres. Un filtre qui vide la liste ne fait donc
 * jamais sauter la rangée de filtres sous le doigt.
 */
@Composable
internal fun ConversationListChrome(
    railInList: Boolean,
    filters: @Composable () -> Unit,
    rail: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier = modifier) {
        filters()
        if (!railInList) rail()
        content()
    }
}
