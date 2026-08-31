package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'en-tête de la liste de conversations — titre et actions sur UNE rangée (#4600).**
 *
 * ## Ce qu'il remplace, et pourquoi
 *
 * Un `LargeTopAppBar` Material 3, dont la hauteur repliée est de 152 dp : une
 * petite barre de 64 dp qui ne porte QUE les actions (à droite), puis la zone de
 * grand titre en dessous. À gauche de cette petite barre, rien — et ce rien
 * n'est pas réglable, c'est la hauteur du composant.
 *
 * Mesuré sur `meeshy_pixel8_api36` (1080 × 2400) : barre système jusqu'à ~100 px,
 * première pixel de l'app à **356 px**, titre « Meeshy Chats » à **528 px** — soit
 * 22 % de la hauteur d'écran, contre ~11 % sur iOS. Retour porteur : « le titre
 * est au milieu de l'écran au lieu d'être en haut, en bas de la barre système ».
 *
 * iOS n'a pas ce vide parce qu'il pose le titre et les actions sur la MÊME
 * rangée. C'est ce que fait cet en-tête, et c'est aussi ce qui le rend
 * `statusBarsPadding()`-able : sous `enableEdgeToEdge()`, `y = 0` est le haut de
 * l'ÉCRAN, et chaque destination porte ses propres insets — le contrat que le
 * Scaffold racine énonce dans son commentaire.
 *
 * ## Pourquoi un fichier à lui
 *
 * `ConversationListScreen.kt` porte 1723 lignes, 57 % au-dessus du budget
 * 800–1100 (directive 2026-08-28). Ajouter à un fichier hors budget est
 * interdit : on extrait d'abord. Ici l'extraction et le correctif sont le même
 * geste — l'en-tête est une responsabilité, pas une tranche.
 */
@Composable
internal fun ConversationListHeader(
    canUnlockAll: Boolean,
    hasMasterPin: Boolean,
    canChangeMasterPin: Boolean,
    canRemoveMasterPin: Boolean,
    onUnlockAll: () -> Unit,
    onChangeMasterPin: () -> Unit,
    onRemoveMasterPin: () -> Unit,
    onContacts: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(start = MeeshySpacing.md, end = MeeshySpacing.xs, top = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = stringResource(R.string.conversations_title),
            style = MaterialTheme.typography.displayMedium,
            color = MeeshyPalette.Indigo500,
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            // Une affordance « tout déverrouiller » ne paraît que si au moins une
            // conversation est verrouillée (parité iOS Réglages) — la barre reste
            // silencieuse dans le cas courant.
            if (canUnlockAll) {
                IconButton(onClick = onUnlockAll) {
                    Icon(
                        Icons.Filled.LockOpen,
                        contentDescription = stringResource(R.string.conversations_unlock_all),
                        tint = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
            // Gestion du code maître (parité iOS Réglages → changer / retirer).
            // Ne paraît qu'une fois un code maître posé ; « Retirer » se cache en
            // plus tant qu'une conversation est verrouillée.
            if (hasMasterPin) {
                LockSecurityMenu(
                    canChange = canChangeMasterPin,
                    canRemove = canRemoveMasterPin,
                    onChange = onChangeMasterPin,
                    onRemove = onRemoveMasterPin,
                )
            }
            // Parité iOS : la recherche vit dans la barre du bas et la déconnexion
            // dans les Réglages (section Danger) — le haut ne garde que Contacts.
            IconButton(onClick = onContacts) {
                Icon(
                    Icons.Filled.People,
                    contentDescription = stringResource(R.string.conversations_contacts),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
    }
}
