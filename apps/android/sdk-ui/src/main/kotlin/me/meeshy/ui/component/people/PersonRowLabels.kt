package me.meeshy.ui.component.people

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.R

/** Composition du libellé TalkBack d'une ligne de personne : nom, @identifiant, état de présence. */
public object PersonRowLabels {

    /** Les parties non vides, dans l'ordre, séparées par une virgule. */
    public fun join(vararg parts: String?): String =
        parts.mapNotNull { it?.trim()?.takeIf(String::isNotEmpty) }.joinToString(", ")

    /** « Nom, @identifiant, statut » — l'identifiant et le statut sont omis quand ils manquent. */
    public fun accessibility(name: String, handle: String?, status: String?): String =
        join(name, handle?.trim()?.removePrefix("@")?.takeIf(String::isNotEmpty)?.let { "@$it" }, status)
}

/**
 * Le texte de présence d'un état SERVI : en ligne, absent, inactif, ou [lastSeen] (« vu il y a… ») puis
 * « hors ligne » pour un état hors ligne. `null` quand rien n'est servi : le client ne fabrique rien.
 */
@Composable
public fun personPresenceText(presence: PresenceState?, lastSeen: String? = null): String? = when (presence) {
    PresenceState.ONLINE -> stringResource(R.string.presence_online)
    PresenceState.AWAY -> stringResource(R.string.presence_away)
    PresenceState.IDLE -> stringResource(R.string.presence_idle)
    PresenceState.OFFLINE -> lastSeen?.takeIf(String::isNotBlank) ?: stringResource(R.string.presence_offline)
    null -> null
}
