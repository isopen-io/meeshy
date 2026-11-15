package me.meeshy.ui.component.comments

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.CommentAttachmentIntake
import me.meeshy.sdk.model.MAX_POST_MEDIA

/**
 * **LA CAMÉRA DES COMMENTAIRES** (iOS `ComposerCameraDoor`, décision porteur 2026-10-09 : « il faut activer à droite la
 * caméra pour les commentaires »). La porte est celle de la barre du message — à droite de « Photos » — confiée à la
 * barre par l'environnement ([LocalCommentCameraDoor]) : l'hôte ne porte aucun état de présentation. [onOpen] prépare
 * l'hôte à être recouvert par le viseur (pause de ses lecteurs) ; la prise rejoint ensuite la zone par la MÊME entrée
 * que toute autre pièce ([CommentAttachmentIntake]), donc sous le même plafond ([limit]).
 */
@Immutable
public class CommentCameraDoor(
    public val limit: Int = MAX_POST_MEDIA,
    private val onOpen: () -> Unit,
) {
    /** La zone a de la place : sinon la porte reste fermée plutôt que d'ouvrir un viseur dont la prise serait refusée. */
    public fun isOpenable(stagedCount: Int): Boolean = stagedCount < limit || limit <= 1

    /** Ouvre le viseur ; rend faux (porte close, [onOpen] non appelé) quand la zone est pleine. */
    public fun open(stagedCount: Int): Boolean {
        if (!isOpenable(stagedCount)) return false
        onOpen()
        return true
    }
}

/** La porte confiée par l'hôte ; `null` ⇒ pas de caméra sur cette surface. */
public val LocalCommentCameraDoor = staticCompositionLocalOf<CommentCameraDoor?> { null }
