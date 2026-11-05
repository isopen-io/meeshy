package me.meeshy.sdk.model

/**
 * Loi « vu monotone » du plateau de stories — miroir de `StoryViewModel.shouldKeepLocalViewed` et de
 * `applyViewedLedger` (iOS, `StoryViewModelRules.swift` / `StoryViewModel+Viewing.swift`).
 *
 * Une story vue localement RESTE vue même si le serveur, en retard, dit le contraire — SAUF quand son contenu a été
 * édité APRÈS la vue : le serveur a alors effacé les vues (reset d'engagement) et la story redevient légitimement non
 * vue. `contentEditedAt` est le seul horodatage fiable (`updatedAt` bouge à chaque compteur). L'AUTEUR échappe à
 * l'exception : le serveur n'enregistre jamais la vue de l'auteur sur sa propre story, son « vu » local ne cède donc
 * devant rien.
 */
public object StoryViewedLaw {

    /**
     * `true` quand la vue locale tient encore. Sans édition connue, elle tient ; une édition avec une vue SANS date
     * (cache antérieur au champ) la fait céder ; sinon elle tient tant qu'elle n'est pas antérieure à l'édition.
     */
    public fun shouldKeepLocalViewed(localViewedAtMillis: Long?, contentEditedAtMillis: Long?): Boolean {
        if (contentEditedAtMillis == null) return true
        if (localViewedAtMillis == null) return false
        return localViewedAtMillis >= contentEditedAtMillis
    }

    /**
     * Reporte le registre [viewed] (`storyId → instant de la vue`) sur des stories venues d'AILLEURS que de la
     * mémoire (cache relu, page serveur, démarrage à froid). Une story déjà vue, ou absente du registre, passe
     * telle quelle ; les propres stories de [selfId] sont toujours couvertes.
     */
    public fun reinject(posts: List<ApiPost>, viewed: Map<String, Long>, selfId: String?): List<ApiPost> {
        if (viewed.isEmpty()) return posts
        return posts.map { post ->
            val viewedAt = viewed[post.id]
            if (viewedAt == null || post.isViewedByMe == true) {
                post
            } else {
                val own = selfId != null && post.author?.id == selfId
                val keeps = own || shouldKeepLocalViewed(viewedAt, isoToEpochMillisOrNull(post.contentEditedAt))
                if (keeps) post.copy(isViewedByMe = true) else post
            }
        }
    }
}
