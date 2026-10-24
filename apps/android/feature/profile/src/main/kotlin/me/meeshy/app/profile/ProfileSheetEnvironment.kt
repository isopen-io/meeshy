package me.meeshy.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.profile.ProfileCallRequest

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
 */
@Immutable
data class ProfileSheetEnvironment(
    val onOpenConversation: (conversationId: String) -> Unit = {},
    val onReport: (userId: String, username: String) -> Unit = { _, _ -> },
    val onViewPosts: (userId: String) -> Unit = {},
    val onCall: ((ProfileCallRequest) -> Unit)? = null,
    val onViewStory: ((userId: String) -> Unit)? = null,
    val postsContent: (@Composable (userId: String) -> Unit)? = null,
)
