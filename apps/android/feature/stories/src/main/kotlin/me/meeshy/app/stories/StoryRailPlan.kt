package me.meeshy.app.stories

import me.meeshy.sdk.model.story.StoryReplyRules

/**
 * Which action buttons the story viewer's right-side rail shows for the current slide — Android mirror of the iOS
 * `StoryActionRailPlan` (#14313). The membership is decided when the slide opens, from the payload the tray served:
 * a button never appears or vanishes mid-playback.
 */
data class StoryRailPlan(
    val showsReact: Boolean,
    val showsLanguage: Boolean,
    /** « Répondre » (#13501) : la réponse privée à la story de quelqu'un d'autre, iOS `showsReply`. */
    val showsReply: Boolean = false,
    /** « Envoyer » dans Meeshy, pour tous (iOS `showsForward`). */
    val showsSend: Boolean = true,
    /** « Republier » chez autrui (iOS `showsRepost`) ; l'auteur voit « Vues » à sa place. */
    val showsRepost: Boolean = false,
    val showsViews: Boolean = false,
    /** « Composer » chez autrui (iOS `showsCompose`, #9953). */
    val showsCompose: Boolean = false,
    /** « Commentaires » dès le premier (iOS `showsComments`) ; avant, le composeur épinglé écrit le premier. */
    val showsComments: Boolean = false,
    /** « Enregistrer » : l'auteur seul enregistre sa story depuis le rail (iOS `showsExport`). */
    val showsExport: Boolean = false,
    /** « Son » : seulement quand la slide est audible — une vidéo muette ne montre rien (iOS `showsSound`). */
    val showsSound: Boolean = false,
    /** « Imager » : la baguette fait de la story une carte image, pour l'auteur comme pour le lecteur (#16334). */
    val showsImager: Boolean = true,
) {
    /** Le composeur de commentaire épinglé sous la story (iOS `composerLayer`) : chez autrui seulement. */
    val pinsCommentComposer: Boolean get() = showsReact

    companion object {
        fun resolve(
            isOwnStory: Boolean,
            hasTranslatableContent: Boolean,
            canReply: Boolean = false,
            canCompose: Boolean = false,
            commentCount: Int = 0,
            /** La loi du repartage n'offre RIEN à une story de Sang (RG-18, #13939) : pas de bouton pour un choix vide. */
            isRepublishable: Boolean = true,
            hasAudibleSound: Boolean = false,
        ): StoryRailPlan =
            StoryRailPlan(
                showsReact = !isOwnStory,
                showsLanguage = hasTranslatableContent,
                showsReply = StoryReplyRules.railOffersReply(isOwnStory, canReply),
                showsSend = true,
                showsRepost = !isOwnStory && isRepublishable,
                showsViews = isOwnStory,
                showsCompose = !isOwnStory && canCompose,
                showsComments = commentCount > 0,
                showsExport = isOwnStory,
                showsSound = hasAudibleSound,
            )
    }
}

/**
 * **Le cadre du rail** (#14394, iOS `sidebarMaxHeight`) : entre le bas de l'en-tête et le haut MESURÉ du composeur
 * épinglé, à [gapPx] de chacun. Le rail défile s'il ne tient pas ; il ne recouvre jamais le ⌄ ni la pastille de langue.
 */
data class StoryRailFrame(val topPx: Int, val bottomPx: Int) {
    companion object {
        fun of(headerBottomPx: Int, composerHeightPx: Int, composerPinned: Boolean, gapPx: Int): StoryRailFrame =
            StoryRailFrame(
                topPx = headerBottomPx + gapPx,
                bottomPx = (if (composerPinned) composerHeightPx else 0) + gapPx,
            )
    }
}

/**
 * **Le plan du rail, figé à l'entrée de la slide** (iOS `frozenRailPlan`, directive 2026-07-10 : aucun bouton ne surgit
 * en cours de lecture, seules les VALEURS des compteurs bougent). Il se relâche à trois occasions, et à ces trois seules :
 * la story change, le son devient audible (la sonde d'une vidéo conclut souvent après le gel) et la réconciliation
 * d'ouverture du compteur de commentaires conclut — jamais un commentaire envoyé ou reçu en direct.
 */
data class StoryRailFreezeInput(
    val storyId: String?,
    val live: StoryRailPlan,
    val audible: Boolean,
    /** Vrai une fois que le fil de commentaires de la story a fini son premier chargement (iOS `reconciledCountPulse`). */
    val commentsReconciled: Boolean,
)

data class StoryRailFreeze(
    val storyId: String?,
    val plan: StoryRailPlan,
    val audible: Boolean,
    val commentsReconciled: Boolean,
) {
    fun next(input: StoryRailFreezeInput): StoryRailFreeze = when {
        input.storyId != storyId -> start(input)
        !audible && input.audible -> start(input)
        !commentsReconciled && input.commentsReconciled && !plan.showsComments -> start(input)
        else -> copy(audible = audible || input.audible, commentsReconciled = commentsReconciled || input.commentsReconciled)
    }

    companion object {
        fun start(input: StoryRailFreezeInput): StoryRailFreeze =
            StoryRailFreeze(input.storyId, input.live, input.audible, input.commentsReconciled)
    }
}

/** La densité du rail (iOS `ViewThatFits(in: .vertical)`) : espacement normal, puis resserré, puis défilement vertical. */
enum class StoryRailDensity {
    NORMAL, TIGHT, SCROLL;

    companion object {
        fun choose(availablePx: Int, normalPx: Int, tightPx: Int): StoryRailDensity = when {
            normalPx <= availablePx -> NORMAL
            tightPx <= availablePx -> TIGHT
            else -> SCROLL
        }
    }
}
