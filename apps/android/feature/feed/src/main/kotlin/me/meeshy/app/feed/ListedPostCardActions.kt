package me.meeshy.app.feed

import me.meeshy.sdk.model.report.ReportReason

/**
 * **Ce qu'une liste de publications fait des gestes de ses cartes** — le contrat qu'un hôte de [ListedPostCard] remplit
 * EN ENTIER (#13244). Les favoris, « À proximité », les publications d'un auteur et les résultats d'un hashtag montent la
 * carte du fil (iOS `FeedPostCard` + `FeedPostActionsBar`) : chaque bouton qu'elle affiche trouve ici son effet, et un
 * modèle qui n'en sait pas un ne compile pas — jamais un bouton qui ne fait rien.
 */
interface ListedPostCardActions {
    fun toggleLike(postId: String)

    fun toggleBookmark(postId: String)

    fun repost(postId: String)

    fun beginQuote(postId: String)

    /** Un drapeau de langue touché sur la carte : le texte passe dans cette langue, ou revient au Prisme, comme dans le fil. */
    fun onFlagTap(postId: String, code: String)

    fun onQuoteTextChange(text: String)

    fun cancelQuote()

    fun submitQuote()

    fun pin(postId: String)

    fun report(postId: String, reason: ReportReason)

    fun delete(postId: String)

    /** Un commentaire est parti depuis la feuille des commentaires : le compteur de la carte le suit. */
    fun onCommentSent(postId: String)

    fun consumeNotice()
}
