package me.meeshy.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.profile.ProfileCallRequest
import me.meeshy.sdk.model.profile.ProfileLivePresence
import me.meeshy.sdk.model.profile.ProfilePresenceLine
import me.meeshy.ui.component.StoryRingState

/**
 * Les sorties de la fiche profil, fournies par `:app` (miroir des closures que la racine iOS passe à
 * `UserProfileSheet`) : la feuille ne connaît ni la navigation ni les autres features. Chaque sortie
 * qui quitte la feuille est appelée APRÈS sa fermeture ; c'est l'hôte qui attend la fin de
 * l'animation avant de naviguer.
 *
 * - [onOpenConversation] : la conversation directe ouverte par « Envoyer un message ».
 * - [onReport] : le signalement de la personne.
 * - [onViewPosts] : le fil de ses postes, quand [postsContent] n'est pas fourni.
 * - [onCall] : un appel ; `null` = aucun bouton d'appel.
 * - [onViewStory] : sa story ; `null` = l'anneau n'ouvre rien.
 * - [postsContent] : le contenu riche de l'onglet Postes (cartes du fil), reçu avec l'id résolu.
 * - [liveSigns] : les signes en direct de la personne (présence, anneau de story, humeur), par id
 *   résolu ; `null` = le cliché REST seul, sans anneau ni humeur.
 */
@Immutable
data class ProfileSheetEnvironment(
    val onOpenConversation: (conversationId: String) -> Unit = {},
    val onReport: (userId: String, username: String) -> Unit = { _, _ -> },
    val onViewPosts: (userId: String) -> Unit = {},
    val onCall: ((ProfileCallRequest) -> Unit)? = null,
    val onViewStory: ((userId: String) -> Unit)? = null,
    val postsContent: (@Composable (userId: String) -> Unit)? = null,
    val liveSigns: ((userId: String) -> Flow<ProfileLiveSigns>)? = null,
)

/**
 * Les signes en direct d'une personne, tels que l'app les observe (miroir des paramètres
 * `presenceProvider`, `storyRingState` et `moodEmoji` de `UserProfileSheet` iOS) : la dernière
 * entrée de présence temps réel, l'anneau de sa story et son humeur. La feuille les combine avec le
 * cliché REST du profil par [ProfileLivePresence].
 */
@Immutable
data class ProfileLiveSigns(
    val livePresence: UserStatusEvent? = null,
    val storyRing: StoryRingState = StoryRingState.None,
    val moodEmoji: String? = null,
    val moodText: String? = null,
) {
    /** Le point de l'avatar : le temps réel d'abord, sinon le cliché REST ; `null` = aucun point. */
    fun presence(restIsOnline: Boolean?, restLastActiveAt: String?, nowEpochMillis: Long): PresenceState? =
        ProfileLivePresence.state(livePresence, restIsOnline, restLastActiveAt, nowEpochMillis)

    /** La ligne « il y a X » après le pseudo ; `null` = rien à dire. */
    fun presenceLine(restIsOnline: Boolean?, restLastActiveAt: String?, nowEpochMillis: Long): ProfilePresenceLine? =
        ProfileLivePresence.line(livePresence, restIsOnline, restLastActiveAt, nowEpochMillis)

    companion object {
        val NONE: ProfileLiveSigns = ProfileLiveSigns()
    }
}
