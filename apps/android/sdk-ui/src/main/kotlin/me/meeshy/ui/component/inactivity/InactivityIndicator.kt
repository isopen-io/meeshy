package me.meeshy.ui.component.inactivity

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.inactivity.InactivityStore
import me.meeshy.sdk.model.inactivity.InactivityAlertState
import me.meeshy.sdk.model.inactivity.InactivityPersonRules
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le magasin des alertes d'inactivité de la session, fourni à la racine de l'app (`MainActivity`). Absent (aperçus,
 * tests) : [rememberInactivity] rend `null`, donc rien n'est montré — rien n'est fabriqué.
 */
val LocalInactivityStore = staticCompositionLocalOf<InactivityStore?> { null }

/**
 * L'alerte d'inactivité de [userId], lue AU PLUS BAS niveau : seule la surface qui l'appelle se recompose. `null` hors
 * alerte, et TOUJOURS pour moi-même. Cache d'abord.
 */
@Composable
fun rememberInactivity(userId: String?): InactivityAlertState? {
    val store = LocalInactivityStore.current ?: return null
    if (!InactivityPersonRules.shows(userId, store.viewerId)) return null
    val flow = remember(store, userId) { store.stateOf(userId) }
    val initial = remember(store, userId) { store.roster.value.stateOf(userId) }
    val state by flow.collectAsStateWithLifecycle(initialValue = initial)
    return state
}

/** Le glyphe « aucune activité » : un sablier, à la teinte d'avertissement. */
@Composable
fun InactivityGlyph(modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = MeeshyPalette.Warning) {
    Icon(imageVector = MeeshyIcons.Hourglass, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Le glyphe de l'en-tête de conversation : rien hors alerte ; un libellé lu par TalkBack sinon. */
@Composable
fun InactivityIndicator(userId: String?, name: String, modifier: Modifier = Modifier) {
    rememberInactivity(userId) ?: return
    val description = stringResource(R.string.inactivity_a11y, name)
    InactivityGlyph(modifier.semantics { contentDescription = description })
}
