// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run android-endpoints:generate
//
// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}
// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.

package me.meeshy.sdk.net.routes

public object ApiRoutesConversations {
    public const val BY_CONVERSATION_ID_ACTIVE_CALL: String = "conversations/{conversationId}/active-call"
    public const val BY_CONVERSATION_ID_ATTACHMENTS: String = "conversations/{conversationId}/attachments"
    public const val BY_CONVERSATION_ID_CLEAR_HISTORY: String = "conversations/{conversationId}/clear-history"
    public const val BY_CONVERSATION_ID_ENCRYPTION: String = "conversations/{conversationId}/encryption"
    public const val BY_CONVERSATION_ID_ENCRYPTION_STATUS: String = "conversations/{conversationId}/encryption-status"
    public const val BY_CONVERSATION_ID_LINKS: String = "conversations/{conversationId}/links"
    public const val BY_CONVERSATION_ID_MARK_AS_READ: String = "conversations/{conversationId}/mark-as-read"
    public const val BY_CONVERSATION_ID_MARK_AS_RECEIVED: String = "conversations/{conversationId}/mark-as-received"
    public const val BY_CONVERSATION_ID_MESSAGES_BY_MESSAGE_ID_DELIVERY_RECEIPT: String = "conversations/{conversationId}/messages/{messageId}/delivery-receipt"
    public const val BY_CONVERSATION_ID_READ_STATUSES: String = "conversations/{conversationId}/read-statuses"
    public const val BY_CONVERSATION_ID_RECEIPTS: String = "conversations/{conversationId}/receipts"
    public const val BY_CONVERSATION_ID_RESTORE_FOR_ME: String = "conversations/{conversationId}/restore-for-me"
    public const val BY_ID: String = "conversations/{id}"
    public const val BY_ID_ANALYSIS: String = "conversations/{id}/analysis"
    public const val BY_ID_CARD: String = "conversations/{id}/card"
    public const val BY_ID_DELETE_FOR_ME: String = "conversations/{id}/delete-for-me"
    public const val BY_ID_ENGAGEMENT: String = "conversations/{id}/engagement"
    public const val BY_ID_INVITE: String = "conversations/{id}/invite"
    public const val BY_ID_LEAVE: String = "conversations/{id}/leave"
    public const val BY_ID_MARK_READ: String = "conversations/{id}/mark-read"
    public const val BY_ID_MARK_UNREAD: String = "conversations/{id}/mark-unread"
    public const val BY_ID_MESSAGES: String = "conversations/{id}/messages"
    public const val BY_ID_MESSAGES_AFTER_READ_CONSUME: String = "conversations/{id}/messages/after-read/consume"
    public const val BY_ID_MESSAGES_BY_MESSAGE_ID: String = "conversations/{id}/messages/{messageId}"
    public const val BY_ID_MESSAGES_BY_MESSAGE_ID_CONSUME: String = "conversations/{id}/messages/{messageId}/consume"
    public const val BY_ID_MESSAGES_BY_MESSAGE_ID_PIN: String = "conversations/{id}/messages/{messageId}/pin"
    public const val BY_ID_MESSAGES_CAPTURE: String = "conversations/{id}/messages/capture"
    public const val BY_ID_MESSAGES_SEARCH: String = "conversations/{id}/messages/search"
    public const val BY_ID_NEW_LINK: String = "conversations/{id}/new-link"
    public const val BY_ID_PARTICIPANTS: String = "conversations/{id}/participants"
    public const val BY_ID_PARTICIPANTS_BY_PARTICIPANT_ID_PROFILE: String = "conversations/{id}/participants/{participantId}/profile"
    public const val BY_ID_PARTICIPANTS_BY_PARTICIPANT_ID_RIGHTS: String = "conversations/{id}/participants/{participantId}/rights"
    public const val BY_ID_PARTICIPANTS_BY_PARTICIPANT_KEY: String = "conversations/{id}/participants/{participantKey}"
    public const val BY_ID_PARTICIPANTS_BY_USER_ID: String = "conversations/{id}/participants/{userId}"
    public const val BY_ID_PARTICIPANTS_BY_USER_ID_BAN: String = "conversations/{id}/participants/{userId}/ban"
    public const val BY_ID_PARTICIPANTS_BY_USER_ID_ROLE: String = "conversations/{id}/participants/{userId}/role"
    public const val BY_ID_PARTICIPANTS_BY_USER_ID_UNBAN: String = "conversations/{id}/participants/{userId}/unban"
    public const val BY_ID_PINNED_MESSAGES: String = "conversations/{id}/pinned-messages"
    public const val BY_ID_REACTIONS: String = "conversations/{id}/reactions"
    public const val BY_ID_SHARED_TRANSLATIONS: String = "conversations/{id}/shared-translations"
    public const val BY_ID_STATS: String = "conversations/{id}/stats"
    public const val BY_ID_STATUS: String = "conversations/{id}/status"
    public const val BY_ID_THREADS_BY_MESSAGE_ID: String = "conversations/{id}/threads/{messageId}"
    public const val CHECK_IDENTIFIER_BY_IDENTIFIER: String = "conversations/check-identifier/{identifier}"
    public const val JOIN_BY_LINK_ID: String = "conversations/join/{linkId}"
    public const val ROOT: String = "conversations"
    public const val SEARCH: String = "conversations/search"
}
