package me.meeshy.sdk.model.scene.export

import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.relation.RelationExportBadge

/** Ce que l'écran sait de l'auteur d'une story qu'on exporte (miroir de `StoryExportIntroContent` iOS, avant résolution des images). */
public data class StoryExportAuthorFacts(
    val userId: String,
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val bannerUrl: String?,
    val accentHex: String,
    /** Sa PROPRE story : soi est toujours visible (en ligne), et aucun logo de cercle ne se peint. */
    val isOwn: Boolean,
    /** La présence que le serveur a SERVIE pour l'auteur (déjà filtrée par la loi de visibilité) ; `null` = rien de servi. */
    val servedPresence: UserPresence?,
)

/** Le mood éphémère de l'auteur : l'emoji et, s'il y en a un, son message. */
public data class StoryExportMood(val emoji: String, val message: String?)

/**
 * **LE CONTENU OPAQUE DE L'INTRO ET DE LA CARTE D'AUTEUR D'UN EXPORT DE STORY** (#13997 ; miroir de `StoryExportIntroContent`
 * iOS, plus la présence et le logo de cercle) : tout ce que la peinture lit, rien d'autre — la peinture ne décide jamais.
 *
 *  - [presence] : PROJECTION de la présence servie, jamais fabriquée. Absente ⇒ `null` (aucun point) ; hors ligne ⇒ `null`
 *    aussi (hors ligne = pas de pastille) ; sa propre story ⇒ [PresenceState.ONLINE].
 *  - [badge] : le logo du cercle, `null` en dessous de Proche, sur le doute, et toujours sur sa propre story.
 */
public data class StoryExportIdentity(
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val bannerUrl: String?,
    val accentHex: String,
    val moodEmoji: String?,
    val moodMessage: String?,
    val presence: PresenceState?,
    val badge: String?,
) {
    public companion object {
        /** [servedRelationLevel] : le niveau effectif servi par le fournisseur de lien ; `null` quand il n'a rien rendu. */
        public fun of(
            author: StoryExportAuthorFacts,
            mood: StoryExportMood?,
            servedRelationLevel: String?,
            nowMillis: Long,
        ): StoryExportIdentity {
            val liveMood = mood?.takeIf { it.emoji.isNotBlank() }
            return StoryExportIdentity(
                displayName = author.displayName,
                username = author.username,
                avatarUrl = author.avatarUrl,
                bannerUrl = author.bannerUrl,
                accentHex = author.accentHex,
                moodEmoji = liveMood?.emoji,
                moodMessage = liveMood?.message?.takeIf { it.isNotBlank() },
                presence = visiblePresence(author, nowMillis),
                badge = RelationExportBadge.of(servedRelationLevel).takeUnless { author.isOwn },
            )
        }

        private fun visiblePresence(author: StoryExportAuthorFacts, nowMillis: Long): PresenceState? {
            if (author.isOwn) return PresenceState.ONLINE
            return author.servedPresence?.state(nowMillis)?.takeUnless { it == PresenceState.OFFLINE }
        }
    }
}
