package me.meeshy.sdk.model

/**
 * Loi de présentation de l'avis d'arrivée « X a rejoint la conversation » — miroir de
 * `JoinNoticePresentation` (iOS). Décidable hors de Compose.
 *
 * Le nom DONNÉ au formulaire prime. Le pseudo d'un participant SANS COMPTE n'est jamais
 * affiché en @handle : `ano_…` est un identifiant technique, et la pastille « sans compte »
 * dit déjà qui il est. La décision lit [JoinNoticeMetadata.isAnonymous], jamais le préfixe —
 * un compte nommé `ano_bob` garde son @handle. Un handle identique au nom principal disparaît.
 */
data class JoinNoticePresentation(
    val primaryName: String,
    val handle: String?,
    val showsNoAccountBadge: Boolean,
    val rules: JoinNoticeMetadata.LinkRules?,
) {
    companion object {
        fun of(notice: JoinNoticeMetadata): JoinNoticePresentation {
            val primary = notice.givenName?.takeIf { it.isNotEmpty() } ?: notice.displayName
            val username = notice.username?.takeIf { it.isNotEmpty() && !notice.isAnonymous }
            return JoinNoticePresentation(
                primaryName = primary,
                handle = username?.takeIf { it != primary }?.let { "@$it" },
                showsNoAccountBadge = notice.isAnonymous,
                rules = notice.linkRules,
            )
        }
    }
}
