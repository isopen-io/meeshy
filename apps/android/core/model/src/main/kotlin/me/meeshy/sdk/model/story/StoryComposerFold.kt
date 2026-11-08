package me.meeshy.sdk.model.story

import kotlin.math.abs

/**
 * À qui appartient un glissé né SUR le composeur du lecteur de story (iOS `StoryComposerGesture`) : le composeur revendique
 * le vertical avant le réveil du lecteur ; l'horizontal reste au lecteur (on change de story depuis la bande basse).
 */
object StoryComposerGesture {
    enum class Owner { COMPOSER, STORY }

    /** Sous le seuil du lecteur, au-dessus du tremblement d'un tap. */
    const val VERTICAL_CLAIM_DP: Float = 8f

    /** Course verticale au-delà de laquelle le glissé bas replie le composeur. */
    const val FOLD_DP: Float = 40f

    fun owner(dx: Float, dy: Float): Owner {
        val ay = abs(dy)
        if (ay < VERTICAL_CLAIM_DP) return Owner.STORY
        return if (ay > abs(dx)) Owner.COMPOSER else Owner.STORY
    }

    /** Un glissé VERS LE BAS, vertical, d'au moins [FOLD_DP]. */
    fun folds(dx: Float, dy: Float): Boolean = dy >= FOLD_DP && dy > abs(dx)
}

/** Ce que montre la bande basse du lecteur : le composeur déplié, ou son seul bouton de réouverture (iOS `StoryComposerFold`). */
object StoryComposerFold {
    enum class Presentation { EXPANDED, FOLDED }

    enum class BubbleBadge { NONE, RECORDING, REPLY }

    /** Ce qu'un toucher fait au composeur : l'état de repli voulu, et si le clavier se ferme. La bulle ne rouvre jamais le clavier. */
    data class Tap(val userFolded: Boolean, val resignsKeyboard: Boolean)

    val CHEVRON_TAPPED = Tap(userFolded = true, resignsKeyboard = true)
    val BUBBLE_TAPPED = Tap(userFolded = false, resignsKeyboard = false)

    /** Hors lecteur, une réponse rouvre toujours le composeur : sa bannière vit dedans. */
    fun presentation(userFolded: Boolean, isReplying: Boolean): Presentation =
        if (userFolded && !isReplying) Presentation.FOLDED else Presentation.EXPANDED

    /** Sur la story le chevron replie TOUJOURS, réponse comprise : la plaque reste montée, bannière et brouillon attendent. */
    fun readerPresentation(userFolded: Boolean): Presentation =
        if (userFolded) Presentation.FOLDED else Presentation.EXPANDED

    fun offersFoldButton(presentation: Presentation): Boolean = presentation == Presentation.EXPANDED

    /** Seule une NOUVELLE demande de réponse rouvre un composeur replié. */
    fun unfoldsOnReply(oldReplyId: String?, newReplyId: String?): Boolean = newReplyId != null && newReplyId != oldReplyId

    /** Une prise en cours passe avant la réponse : c'est elle qu'il ne faut pas oublier sous la bulle. */
    fun bubbleBadge(isRecording: Boolean, isReplying: Boolean): BubbleBadge = when {
        isRecording -> BubbleBadge.RECORDING
        isReplying -> BubbleBadge.REPLY
        else -> BubbleBadge.NONE
    }
}
