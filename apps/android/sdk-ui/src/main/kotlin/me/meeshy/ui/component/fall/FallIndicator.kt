package me.meeshy.ui.component.fall

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
import me.meeshy.sdk.fall.FallStore
import me.meeshy.sdk.model.fall.FallPersonRules
import me.meeshy.sdk.model.fall.FallState
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le magasin des chutes détectées de la session, fourni à la racine de l'app (`MainActivity`). Absent (aperçus, tests) :
 * [rememberFall] rend `null`, donc rien n'est montré — rien n'est fabriqué.
 */
val LocalFallStore = staticCompositionLocalOf<FallStore?> { null }

/**
 * La chute en cours de [userId], lue AU PLUS BAS niveau. `null` hors épisode, une fois `expiresAt` passé, et TOUJOURS
 * pour moi-même. Cache d'abord.
 */
@Composable
fun rememberFall(userId: String?): FallState? {
    val store = LocalFallStore.current ?: return null
    if (!FallPersonRules.shows(userId, store.viewerId)) return null
    val flow = remember(store, userId) { store.stateOf(userId) }
    val initial = remember(store, userId) { store.roster.value.stateOf(userId, System.currentTimeMillis()) }
    val state by flow.collectAsStateWithLifecycle(initialValue = initial)
    return state
}

/** Le glyphe « chute détectée » : un avertissement, à la teinte d'erreur. */
@Composable
fun FallGlyph(modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = MeeshyPalette.Error) {
    Icon(imageVector = MeeshyIcons.WarningFilled, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Le glyphe de l'en-tête de conversation : rien hors épisode ; un libellé lu par TalkBack sinon. */
@Composable
fun FallIndicator(userId: String?, name: String, modifier: Modifier = Modifier) {
    rememberFall(userId) ?: return
    val description = stringResource(R.string.fall_a11y, name)
    FallGlyph(modifier.semantics { contentDescription = description })
}
