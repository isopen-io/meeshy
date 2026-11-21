package me.meeshy.ui.component.phonecall

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
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
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.phonecall.PhoneCallPersonRules
import me.meeshy.sdk.model.phonecall.PhoneCallPresentation
import me.meeshy.sdk.model.phonecall.PhoneCallState
import me.meeshy.sdk.phonecall.PhoneCallStore
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le magasin « en appel » de la session, fourni à la racine de l'app (`MainActivity`). Absent (aperçus, tests) :
 * [rememberPhoneCall] rend `null`, donc rien n'est montré — rien n'est fabriqué.
 */
val LocalPhoneCallStore = staticCompositionLocalOf<PhoneCallStore?> { null }

/**
 * L'état « en appel » de [userId], lu AU PLUS BAS niveau : seule la surface qui l'appelle se recompose. `null` hors
 * appel, TOUJOURS pour moi-même, et dès que son expiration passe — même écran ouvert (le téléphone n'a peut-être jamais
 * dit la fin). Cache d'abord.
 */
@Composable
fun rememberPhoneCall(userId: String?): PhoneCallState? {
    val store = LocalPhoneCallStore.current ?: return null
    if (!PhoneCallPersonRules.shows(userId, store.viewerId)) return null
    val flow = remember(store, userId) { store.stateOf(userId) }
    val initial = remember(store, userId) { userId?.let(store.roster.value.byUser::get) }
    val served by flow.collectAsStateWithLifecycle(initialValue = initial)
    val live by produceState(initialValue = served?.takeIf { it.isLiveAt(System.currentTimeMillis()) }, served) {
        value = served?.takeIf { it.isLiveAt(System.currentTimeMillis()) }
        val remaining = PhoneCallPresentation.visibleFor(served, System.currentTimeMillis()) ?: return@produceState
        delay(remaining)
        value = null
    }
    return live
}

/** Le glyphe « en appel » : un combiné, à la teinte primaire. */
@Composable
fun PhoneCallGlyph(modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = MaterialTheme.colorScheme.primary) {
    Icon(imageVector = MeeshyIcons.Call, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Le glyphe de l'en-tête de conversation : rien hors appel ; un libellé lu par TalkBack sinon. Jamais d'interlocuteur. */
@Composable
fun PhoneCallIndicator(userId: String?, name: String, modifier: Modifier = Modifier) {
    rememberPhoneCall(userId) ?: return
    val description = stringResource(R.string.phone_call_a11y, name)
    PhoneCallGlyph(modifier.semantics { contentDescription = description })
}
