package me.meeshy.ui.component

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.socket.PresenceStore

/**
 * La carte de présence de la session, fournie à la racine de l'app (`MainActivity`). Absente
 * (aperçus, tests) : [rememberPresence] rend `null`, donc aucun point — rien n'est fabriqué.
 */
val LocalPresenceStore = staticCompositionLocalOf<PresenceStore?> { null }

/**
 * L'état du point de présence de [userId], lu AU PLUS BAS niveau : la surface qui l'appelle (un
 * avatar, un en-tête) est la seule à se recomposer quand l'état change — jamais la liste ou l'écran
 * qui la contient. Il se recalcule avec le temps (60 s / 3 min / 5 min) sur l'horloge partagée de
 * [PresenceStore], et n'émet qu'au franchissement d'une marche.
 *
 * La collecte suit le cycle de vie : écran en arrière-plan, plus d'abonné, l'horloge partagée
 * s'arrête — aucun réveil toutes les 15 s quand personne ne regarde.
 *
 * `null` = rien servi par la passerelle pour cet utilisateur : aucun point — toujours le cas du
 * compte courant, que le store ne sert à aucune surface.
 */
@Composable
fun rememberPresence(userId: String?): PresenceState? {
    val store = LocalPresenceStore.current ?: return null
    if (userId.isNullOrBlank()) return null
    val flow = remember(store, userId) { store.presenceOf(userId) }
    val initial = remember(store, userId) { store.currentStateOf(userId) }
    val state by flow.collectAsStateWithLifecycle(initialValue = initial)
    return state
}

/**
 * Comme [rememberPresence], avec la présence que la charge de la ligne a SERVIE ([served]) en
 * repli quand la carte vivante n'a rien pour [userId]. La visibilité reste celle du serveur : une
 * ligne qui ne porte rien (non-ami) et une carte vide donnent `null`, donc aucun point.
 */
@Composable
fun rememberPresence(userId: String?, served: UserPresence?): PresenceState? {
    val store = LocalPresenceStore.current ?: return null
    if (userId.isNullOrBlank()) return null
    val flow = remember(store, userId, served) { store.presenceOf(userId, served) }
    val initial = remember(store, userId, served) { store.currentStateOf(userId, served) }
    val state by flow.collectAsStateWithLifecycle(initialValue = initial)
    return state
}
