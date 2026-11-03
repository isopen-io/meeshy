package me.meeshy.sdk.model.story

/** Un geste du lecteur sur une story, retenu pour la session (iOS `StoryViewerParticipationMark`). */
enum class StoryViewerParticipationMark { COMMENTED, SENT, REPOSTED }

/**
 * Ce que le lecteur a déjà fait de la story affichée (iOS `StoryViewerParticipation`). Le fil sert la réaction du
 * lecteur ; ni son commentaire, ni son envoi, ni sa republication : ceux-là viennent de la mémoire de session.
 */
data class StoryViewerParticipation(
    val hasReacted: Boolean = false,
    val hasCommented: Boolean = false,
    val hasSent: Boolean = false,
    val hasReposted: Boolean = false,
) {
    companion object {
        val NONE = StoryViewerParticipation()

        fun of(marks: Set<StoryViewerParticipationMark>, hasReacted: Boolean): StoryViewerParticipation =
            StoryViewerParticipation(
                hasReacted = hasReacted,
                hasCommented = StoryViewerParticipationMark.COMMENTED in marks,
                hasSent = StoryViewerParticipationMark.SENT in marks,
                hasReposted = StoryViewerParticipationMark.REPOSTED in marks,
            )
    }
}

/** Les actions du rail qui portent un contour (iOS `StoryRailEmphasisAction`). */
enum class StoryRailEmphasisAction { SOUND, REACT, FORWARD, REPOST, COMMENTS, TRANSLATIONS }

/**
 * Le contour d'une action du rail (iOS `StoryRailContour`) : [LIVE] = l'état est ouvert (indigo400), [PARTICIPATED] = le
 * lecteur a déjà fait le geste (la couleur d'accent de l'auteur). Un geste fait l'emporte sur un état ouvert : l'anneau
 * de l'auteur dit quelque chose de durable, l'indigo seulement « en ce moment ».
 */
enum class StoryRailContour {
    NONE, LIVE, PARTICIPATED;

    /** Ce qui est ouvert ou allumé à l'instant, lu par le rail. */
    data class Live(
        val soundOn: Boolean = false,
        val reactionBarOpen: Boolean = false,
        val commentsOpen: Boolean = false,
        val languagesOpen: Boolean = false,
    )

    companion object {
        fun resolve(action: StoryRailEmphasisAction, live: Live, participation: StoryViewerParticipation): StoryRailContour =
            when (action) {
                StoryRailEmphasisAction.SOUND -> if (live.soundOn) LIVE else NONE
                StoryRailEmphasisAction.REACT -> participated(participation.hasReacted, live.reactionBarOpen)
                StoryRailEmphasisAction.FORWARD -> if (participation.hasSent) PARTICIPATED else NONE
                StoryRailEmphasisAction.REPOST -> if (participation.hasReposted) PARTICIPATED else NONE
                StoryRailEmphasisAction.COMMENTS -> participated(participation.hasCommented, live.commentsOpen)
                StoryRailEmphasisAction.TRANSLATIONS -> if (live.languagesOpen) LIVE else NONE
            }

        private fun participated(done: Boolean, isLive: Boolean): StoryRailContour =
            if (done) PARTICIPATED else if (isLive) LIVE else NONE
    }
}
