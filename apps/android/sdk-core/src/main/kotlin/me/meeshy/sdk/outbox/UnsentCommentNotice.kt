package me.meeshy.sdk.outbox

/**
 * Prévient l'auteur qu'un commentaire tapé dans une bannière n'est jamais parti (#13693) : la ligne de la file est épuisée
 * (refus définitif du serveur, ou essais dépensés). Le SDK garde le texte ([me.meeshy.sdk.post.UnsentCommentStore]) puis appelle
 * ce port ; l'app l'implémente par une notification locale (comme iOS `notifyUnsentComment`). [ownerId] est le compte
 * auteur de la ligne : une implémentation qui n'est pas connectée sous lui ne le dit à personne.
 */
public fun interface UnsentCommentNotice {
    public suspend fun commentNotSent(ownerId: String?, postId: String, text: String)
}
