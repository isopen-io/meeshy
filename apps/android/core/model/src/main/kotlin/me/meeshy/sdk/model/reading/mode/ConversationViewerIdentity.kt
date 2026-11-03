package me.meeshy.sdk.model.reading.mode

/**
 * Identité du lecteur pour les lois de lecture — miroir de `ConversationViewerIdentity` (iOS). Elle PORTE
 * l'identifiant (deux invités distincts sur le même appareil ne partagent pas une préférence) et se réduit
 * vers [ReadingModeIdentity] : l'UNIQUE point de branchement invité/inscrit.
 */
public sealed interface ConversationViewerIdentity {
    public val isAnonymous: Boolean
    public val scope: ReadingModePreferenceScope

    public data class Registered(val userId: String) : ConversationViewerIdentity {
        override val isAnonymous: Boolean get() = false
        override val scope: ReadingModePreferenceScope get() = ReadingModePreferenceScope.Registered(userId)
    }

    public data class Anonymous(val participantId: String) : ConversationViewerIdentity {
        override val isAnonymous: Boolean get() = true
        override val scope: ReadingModePreferenceScope get() = ReadingModePreferenceScope.Anonymous(participantId)
    }

    public companion object {
        /**
         * Session anonyme d'abord, puis utilisateur authentifié ; ni l'un ni l'autre (déconnexion en
         * cours, démarrage à froid) = invité sans identité stable, dont la préférence ne survit pas.
         */
        public fun resolve(anonymousParticipantId: String?, registeredUserId: String?): ConversationViewerIdentity = when {
            anonymousParticipantId != null -> Anonymous(anonymousParticipantId)
            registeredUserId != null -> Registered(registeredUserId)
            else -> Anonymous("")
        }
    }
}
