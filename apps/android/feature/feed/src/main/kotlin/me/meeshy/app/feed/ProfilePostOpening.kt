package me.meeshy.app.feed

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * La porte d'ouverture d'un contenu touché dans l'onglet Postes (iOS `ProfilePostOpening` + `ProfilePostsOpener`) :
 * l'engagement d'ouverture part À CHAQUE toucher, sans fenêtre qui taise une réouverture ; ensuite un post ouvre
 * son détail, et un réel ferme la fiche, attend [REEL_DELAY_MS] (le lecteur vit derrière la feuille), puis
 * ouvre le lecteur de réels avec la liste des réels de la personne pour graine (haptique medium). Sans hôte de
 * réels, le réel retombe sur le détail du post.
 */
internal class ProfilePostOpening(
    private val scope: CoroutineScope,
    private val reportOpen: (postId: String) -> Unit,
    private val openPost: (postId: String) -> Unit,
    private val dismiss: () -> Unit,
    private val openReels: ((reelId: String, reelIds: List<String>) -> Unit)?,
    private val haptic: () -> Unit,
) {
    fun post(postId: String) {
        reportOpen(postId)
        openPost(postId)
    }

    fun reel(reelId: String, reelIds: List<String>) {
        reportOpen(reelId)
        val host = openReels ?: return openPost(reelId)
        dismiss()
        scope.launch {
            delay(REEL_DELAY_MS)
            haptic()
            host(reelId, reelIds)
        }
    }

    companion object {
        const val REEL_DELAY_MS: Long = 350L
    }
}
