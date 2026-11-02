package me.meeshy.ui.component.permission

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionSurface
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La feuille qui explique AVANT que la boîte système n'apparaisse : le texte d'usage de la
 * permission (celui de l'iOS), « Continuer » pour passer à la demande système, « Pas
 * maintenant » pour y renoncer. Rien ne s'affiche si l'accès est déjà accordé.
 *
 * Le choix ne part qu'une fois la feuille sortie de l'écran (#14077) : retirée d'un coup, sa fenêtre laissait la fin du
 * geste à la surface du dessous (la toile du compositeur sélectionnait son fond). Un second toucher pendant la sortie
 * ne rejoue pas le choix.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun PermissionRationaleSheet(
    nature: PermissionNature,
    onContinue: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
) {
    val copy = MediaPermissionMessages.copy(nature, PermissionSurface.RATIONALE)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val continueChosen by rememberUpdatedState(onContinue)
    val dismissChosen by rememberUpdatedState(onDismiss)
    var leaving by remember { mutableStateOf(false) }
    fun leaveThen(choice: () -> Unit) {
        if (leaving) return
        leaving = true
        scope.launch { sheetState.hide() }.invokeOnCompletion { cause -> if (cause == null) choice() else leaving = false }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        PermissionPanel(
            nature = nature,
            title = stringResource(copy.title),
            body = stringResource(copy.body),
            primaryLabel = stringResource(copy.action),
            onPrimary = { leaveThen { continueChosen() } },
            secondaryLabel = stringResource(R.string.media_permission_not_now),
            onSecondary = { leaveThen { dismissChosen() } },
            accent = accent,
        )
    }
}
