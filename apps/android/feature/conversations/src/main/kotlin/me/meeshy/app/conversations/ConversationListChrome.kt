package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * La tête de la liste des conversations, dans l'ordre d'iOS (`ConversationListView`) : le rail de stories, puis les
 * filtres SOUS lui (#4069). Le rail se pose ainsi juste sous l'en-tête, dans la bande que les disques flottants laissent
 * libre au-dessus de leur zone de parcage (`FloatingButtonSafeZone.STORY_BAND`) ; posé sous les filtres, son bas passait
 * sous le disque de gauche (#13665).
 *
 * Elle est TOUJOURS la première ligne de la liste (`ConversationListBody`), dans tous les états — liste peuplée, squelette,
 * erreur, filtre ou recherche sans résultat : comme le `VStack` du `ScrollView` d'iOS, elle défile avec le contenu et ne
 * change jamais de place d'un état à l'autre (#13653, #13664). Aucune copie épinglée hors de la liste.
 */
@Composable
internal fun ConversationListHead(
    filters: @Composable () -> Unit,
    rail: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        rail()
        filters()
    }
}
