package me.meeshy.sdk.model.comments

/**
 * Le repli de la barre d'un espace commentaire (iOS `CommentComposerFoldModifier`, #9122) : ⌄ par défaut, replié en une
 * icône de commentaire, brouillon et pièces gardés. Une réponse en cours rouvre la barre ; le ⌄ s'efface pendant qu'on écrit.
 */
object CommentComposerFoldState {
    enum class Presentation { EXPANDED, FOLDED }

    /** `spring(response: 0.32, dampingFraction: 0.82)` d'iOS. */
    const val SPRING_RESPONSE_SECONDS: Float = 0.32f
    const val SPRING_DAMPING: Float = 0.82f

    /** Une réponse en cours rouvre la barre : sa bannière « en réponse à » vit dedans. */
    fun presentation(userFolded: Boolean, isReplying: Boolean): Presentation =
        if (userFolded && !isReplying) Presentation.FOLDED else Presentation.EXPANDED

    /** Le ⌄ n'existe que barre dépliée, et hors saisie ou enregistrement. */
    fun offersFoldButton(presentation: Presentation, isComposing: Boolean): Boolean =
        presentation == Presentation.EXPANDED && !isComposing

    /** Une saisie qui commence sur une barre repliée la rouvre. */
    fun reopens(userFolded: Boolean, isComposing: Boolean): Boolean = userFolded && isComposing
}
