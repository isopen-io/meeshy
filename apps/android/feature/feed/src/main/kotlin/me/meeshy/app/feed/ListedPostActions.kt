package me.meeshy.app.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver

/** Ce que les gestes des cartes ajoutent à l'état d'une liste : la citation ouverte, l'issue à dire, les langues choisies. */
internal data class ListedPostCardsState(
    val quoteComposer: QuoteComposerState? = null,
    val notice: FeedNotice? = null,
    /** La langue où le lecteur a passé une carte d'un toucher de drapeau ; absente = le Prisme décide. */
    val languageOverrides: Map<String, String> = emptyMap(),
)

/**
 * **Les gestes du fil sur une liste paginée qui n'a pas d'autre écrivain** (#13244) — le délégué que partagent les favoris,
 * « À proximité », les publications d'un auteur et les résultats d'un hashtag, comme `FeedViewModel` et son
 * [FeedPostActionsDelegate] pour le fil. Aimer et enregistrer bougent au geste sur [list] et ne rendent que le post touché
 * si le serveur refuse ; un commentaire envoyé fait suivre le compteur ; supprimer retire la carte avant le réseau et la
 * remet À SA PLACE sur un refus ; signaler et épingler disent leur issue ; un drapeau touché change la langue de la carte.
 * Repartager et Citer passent par [ListedPostReposting], la même règle que le fil. Chaque issue se dit UNE fois.
 */
internal class ListedPostActions(
    private val scope: CoroutineScope,
    private val posts: PostRepository,
    private val reports: ReportRepository,
    private val list: MutableStateFlow<PostPageListState>,
    private val reader: () -> LanguageResolver.ContentLanguagePreferences?,
) : ListedPostCardActions {

    private val notices = MutableStateFlow<FeedNotice?>(null)
    private val overrides = MutableStateFlow<Map<String, String>>(emptyMap())
    private val reposting = ListedPostReposting(scope, posts, list, reader, notices)

    val state: StateFlow<ListedPostCardsState> =
        combine(reposting.quoteComposer, notices, overrides) { quote, notice, languages ->
            ListedPostCardsState(quoteComposer = quote, notice = notice, languageOverrides = languages)
        }.stateIn(scope, SharingStarted.Eagerly, ListedPostCardsState())

    override fun toggleLike(postId: String) {
        val snapshot = list.value
        val wasLiked = snapshot.posts.firstOrNull { it.id == postId }?.isLikedByMe == true
        val next = snapshot.liked(postId, liked = !wasLiked)
        if (next === snapshot) return
        list.value = next
        scope.launch {
            val sent = attempt { if (wasLiked) posts.unlike(postId) else posts.like(postId) } is NetworkResult.Success
            if (!sent) refuse(postId, snapshot, FeedNotice.LIKE_FAILED)
        }
    }

    override fun toggleBookmark(postId: String) {
        val snapshot = list.value
        val was = snapshot.posts.firstOrNull { it.id == postId }?.isBookmarkedByMe == true
        val next = snapshot.bookmarked(postId, bookmarked = !was)
        if (next === snapshot) return
        list.value = next
        scope.launch {
            val sent = attempt { if (was) posts.removeBookmark(postId) else posts.bookmark(postId) } is NetworkResult.Success
            if (!sent) refuse(postId, snapshot, FeedNotice.BOOKMARK_FAILED)
        }
    }

    override fun repost(postId: String) = reposting.repost(postId)

    override fun beginQuote(postId: String) = reposting.beginQuote(postId)

    override fun onQuoteTextChange(text: String) = reposting.onQuoteTextChange(text)

    override fun cancelQuote() = reposting.cancelQuote()

    override fun submitQuote() = reposting.submitQuote()

    /**
     * La règle du drapeau du fil ([LanguageFlagTapResolver]) : une langue que la carte porte s'affiche, la langue active
     * touchée rend la main au Prisme, une langue encore absente est demandée au serveur (la carte du profil fait de même).
     */
    override fun onFlagTap(postId: String, code: String) {
        val post = list.value.posts.firstOrNull { it.id == postId } ?: return
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = FeedPostBuilder.resolveActiveCode(post, reader() ?: EmptyContentPreferences, overrides.value[postId]),
            originalLanguage = post.originalLanguage,
            translations = post.translations.toTranslationRows(),
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate -> overrides.update { it + (postId to result.code) }
            LanguageFlagTapResolver.Result.Revert -> overrides.update { it - postId }
            is LanguageFlagTapResolver.Result.RequestTranslation ->
                scope.launch { attempt { posts.requestTranslation(postId, result.targetLanguage) } }
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    override fun pin(postId: String) {
        scope.launch {
            val pinned = attempt { posts.pinPost(postId) } is NetworkResult.Success
            if (pinned) list.update { it.pinned(postId) }
            notices.value = if (pinned) FeedNotice.PINNED else FeedNotice.PIN_FAILED
        }
    }

    override fun report(postId: String, reason: ReportReason) {
        scope.launch {
            val sent = attempt { reports.reportPost(postId, reason, details = null) } is NetworkResult.Success
            notices.value = if (sent) FeedNotice.REPORTED else FeedNotice.REPORT_FAILED
        }
    }

    override fun delete(postId: String) {
        val before = list.value
        val index = before.posts.indexOfFirst { it.id == postId }
        val removed = before.posts.getOrNull(index) ?: return
        list.update { it.removed(postId) }
        scope.launch {
            val deleted = attempt { posts.delete(postId) } is NetworkResult.Success
            if (!deleted) list.update { it.restored(removed, index) }
            notices.value = if (deleted) FeedNotice.DELETED else FeedNotice.DELETE_FAILED
        }
    }

    override fun onCommentSent(postId: String) = list.update { it.commented(postId) }

    override fun consumeNotice() {
        notices.value = null
    }

    /** Restaure le seul post touché : une page arrivée entre-temps, un autre geste posé pendant l'aller-retour restent. */
    private fun refuse(postId: String, snapshot: PostPageListState, notice: FeedNotice) {
        val original = snapshot.posts.firstOrNull { it.id == postId } ?: return
        list.update { current -> current.copy(posts = current.posts.map { if (it.id == postId) original else it }) }
        notices.value = notice
    }

    private suspend fun <T> attempt(call: suspend () -> NetworkResult<T>?): NetworkResult<T>? =
        try {
            call()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
}
