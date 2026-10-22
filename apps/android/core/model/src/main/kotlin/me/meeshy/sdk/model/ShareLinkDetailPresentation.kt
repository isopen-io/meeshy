package me.meeshy.sdk.model

/**
 * Pure projection of a [MyShareLink] into everything the per-link detail surface
 * renders — a faithful port of the iOS `ShareLinkDetailView` computed properties.
 * Framework-free so every branch is JVM-testable and the screen stays a thin
 * renderer. Reuses the shared [displayName] / [joinUrl] / [isExpired] SSOTs rather
 * than re-deriving them; the extra fields (identifier label, use counters, parsed
 * timestamps) are the detail-only additions over the list row.
 */
public data class ShareLinkDetailPresentation(
    val displayName: String,
    val joinUrl: String,
    val identifierLabel: String,
    val isActive: Boolean,
    val conversationTitle: String?,
    val usesLabel: String,
    val maxUsesLabel: String,
    val hasUsageLimit: Boolean,
    val isExhausted: Boolean,
    val isExpired: Boolean,
    val createdAtMillis: Long?,
    val expiresAtMillis: Long?,
    val address: String = "",
    val displayAddress: String = "",
    val groupName: String = displayName,
    val groupAvatarUrl: String? = null,
) {
    public companion object {
        /** The glyph iOS shows for an uncapped link (`maxUses == nil`). */
        private const val INFINITY_GLYPH = "∞"

        /**
         * L'adresse canonique `/chat/<linkId>` que la fiche montre, copie et partage (#7795) :
         * jamais le slug `identifier`, qui a déjà servi une adresse que personne ne pouvait ouvrir.
         */
        public fun address(webOrigin: String, linkId: String): String = "${webOrigin.trimEnd('/')}/chat/$linkId"

        /** La forme lisible, sans schéma : `meeshy.me/chat/mshy_…`. */
        public fun displayAddress(webOrigin: String, linkId: String): String =
            address(webOrigin, linkId).substringAfter("://")

        public fun from(
            link: MyShareLink,
            webOrigin: String,
            nowMillis: Long,
        ): ShareLinkDetailPresentation {
            val cap = link.maxUses
            return ShareLinkDetailPresentation(
                displayName = link.displayName,
                joinUrl = link.joinUrl(webOrigin),
                identifierLabel = link.identifier?.takeIf { it.isNotBlank() } ?: link.linkId,
                isActive = link.isActive,
                conversationTitle = link.conversationTitle?.takeIf { it.isNotBlank() },
                usesLabel = link.currentUses.toString(),
                maxUsesLabel = cap?.toString() ?: INFINITY_GLYPH,
                hasUsageLimit = cap != null,
                isExhausted = cap != null && link.currentUses >= cap,
                isExpired = link.isExpired(nowMillis),
                createdAtMillis = isoToEpochMillisOrNull(link.createdAt),
                expiresAtMillis = isoToEpochMillisOrNull(link.expiresAt),
                address = address(webOrigin, link.linkId),
                displayAddress = displayAddress(webOrigin, link.linkId),
                groupName = link.conversation?.title?.takeIf { it.isNotBlank() }
                    ?: link.conversationTitle?.takeIf { it.isNotBlank() }
                    ?: link.displayName,
                groupAvatarUrl = link.conversation?.avatar?.takeIf { it.isNotBlank() },
            )
        }
    }
}
