package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryVisibility

/**
 * La liste encore valable pour [visibility]. Sous ONLY, un compte bloqué depuis (et soi) n'est
 * plus un destinataire. Sous EXCEPT, la liste EXCLUT : retirer un bloqué en ferait de nouveau
 * un destinataire, donc seul soi en sort — une exclusion existante ne se perd jamais.
 */
internal fun reachableAudience(ids: List<String>, visibility: StoryVisibility, selfId: String?, blocked: Set<String>): List<String> {
    if (visibility != StoryVisibility.ONLY) return ids.filter { it != selfId }
    return ids.filter { it != selfId && it !in blocked }
}

/** L'état prêt à publier : l'audience et les mentions débarrassées de soi et des comptes bloqués depuis. */
internal fun StoryComposerUiState.withAudiencePurged(selfId: String?, blocked: Set<String>): StoryComposerUiState {
    val purged = draft.copy(
        visibilityUserIds = reachableAudience(draft.visibilityUserIds, draft.visibility, selfId, blocked),
        mentions = draft.mentions.filterNot { mention -> mention.userId?.let { it in blocked } == true },
    )
    return if (purged == draft) this else copy(draft = purged)
}
