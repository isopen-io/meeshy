package me.meeshy.sdk.model.session

/**
 * La courante en tête, puis les autres de la plus récemment active à la plus ancienne ; à
 * égalité, l'ordre du serveur (`ActiveSessionsViewModel.ordered`). Sans activité servie, la date
 * d'ouverture tient lieu d'activité.
 */
public object SessionsOrdering {

    public fun ordered(sessions: List<UserSession>): List<UserSession> =
        sessions.sortedWith(
            compareByDescending<UserSession> { it.isCurrentSession }
                .thenByDescending { it.lastActiveMillis ?: it.createdAtMillis ?: Long.MIN_VALUE },
        )
}
