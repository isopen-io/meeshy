package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.PostReferenceDisplay

/**
 * Ce que la publication NOMME, lu au pied de la scène et déclaré à l'envoi (#13846, miroir de `ComposerSceneReferences`
 * et `ReferenceNoteRow.noted` iOS).
 *
 * Le pied ne montre que les mentions RÉFÉRENCÉES (rangée « Avec … ») et les hashtags : une mention INLINE est déjà écrite
 * dans le texte, une mention ÉPINGLÉE est sa pastille sur la scène, et une mention SILENCIEUSE ne paraît JAMAIS aux tiers —
 * la montrer dirait à l'auteur que sa publication l'annonce. [noted] est le site unique de cette exclusion.
 */
object ComposerSceneReferences {

    /** Plafond de la passerelle (`mentions.max(50)`) : au-delà, toute la story serait refusée. */
    const val MAX_MENTIONS: Int = 50

    /** Le fond plein d'une pastille de mention : la couleur de marque, ce qui la fait LIRE comme une étiquette (iOS `brandPrimaryHex`). */
    const val BADGE_BACKGROUND_HEX: String = "6366F1"

    /** Une pastille de mention posée sur une diapo : la personne qu'elle nomme. */
    data class Badge(val userId: String, val username: String)

    fun noted(mentions: List<PostMentionInput>): List<PostMentionInput> =
        mentions.filter { it.display == PostReferenceDisplay.NOTE.wire }

    /** Le pied n'existe que s'il porte quelque chose : jamais au repos, jamais pour une mention silencieuse. */
    fun isServed(hashtags: List<String>, mentions: List<PostMentionInput>): Boolean =
        hashtags.isNotEmpty() || noted(mentions).isNotEmpty()

    /** Les balises se DISENT sans leur croisillon : le mot compte, le signe est une convention d'écriture. */
    fun spoken(role: String, hashtags: List<String>): String =
        if (hashtags.isEmpty()) role else "$role : ${hashtags.joinToString(", ")}"

    /**
     * Ce qu'une diapo déclare : chaque pastille la nomme ÉPINGLÉE, une seule fois, à la place de tout autre mode ; une
     * mention épinglée dont la pastille a quitté la diapo ne se déclare plus. Le reste garde son mode, sous le plafond.
     */
    fun declaredFor(declared: List<PostMentionInput>, badges: List<Badge>): List<PostMentionInput> {
        val pinned = badges.distinctBy { it.username.lowercase() }
            .map { PostMentionInput(userId = it.userId, username = it.username, display = PostReferenceDisplay.PINNED.wire) }
        val pinnedNames = pinned.mapNotNull { it.username?.lowercase() }.toSet()
        val others = declared.filterNot { mention ->
            mention.display == null || mention.display == PostReferenceDisplay.PINNED.wire ||
                mention.username?.lowercase() in pinnedNames
        }
        return (pinned + others).take(MAX_MENTIONS)
    }
}
