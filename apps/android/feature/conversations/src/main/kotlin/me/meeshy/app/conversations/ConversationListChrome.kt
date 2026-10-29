package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * La tête de la liste des conversations, dans l'ordre d'iOS (`ConversationListView`) : le rail de stories, puis les
 * filtres SOUS lui (#4069). Le rail se pose ainsi juste sous l'en-tête, dans la bande que les disques flottants laissent
 * libre au-dessus de leur zone de parcage (`FloatingButtonSafeZone.STORY_BAND`) ; posé sous les filtres, son bas passait
 * sous le disque de gauche (#13665). Liste peuplée ([railInList]), la tête est la première ligne de la liste — [content]
 * la reçoit — et défile avec elle ; squelette, erreur, filtre ou recherche sans résultat, elle se pose au même endroit,
 * au-dessus du contenu : au repos, la rangée de filtres ne saute pas sous le doigt (#13653).
 */
@Composable
internal fun ConversationListChrome(
    railInList: Boolean,
    filters: @Composable () -> Unit,
    rail: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.(head: @Composable () -> Unit) -> Unit,
) {
    val head: @Composable () -> Unit = {
        Column {
            rail()
            filters()
        }
    }
    Column(modifier = modifier) {
        if (!railInList) head()
        content(head)
    }
}
