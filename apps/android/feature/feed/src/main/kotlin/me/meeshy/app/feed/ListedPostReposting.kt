package me.meeshy.app.feed

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository

/**
 * **Repartager et Citer depuis une liste paginée** qui n'a pas d'autre écrivain — les résultats d'un hashtag (#12234 ;
 * iOS `ListedPostReposter` + `PostRepostMutation`, #15934). La marque et le compte bougent au geste sur [list], la
 * cible et le format viennent de [RepostCommand] (la RACINE, au format de la carte), un refus ne rend que l'état du
 * repartage, et l'issue se dit par [notice]. « Citer » ouvre [quoteComposer] sur la racine ; rien ne part avant
 * [submitQuote]. Un second geste pendant l'envoi n'envoie rien.
 */
internal class ListedPostReposting(
    private val scope: CoroutineScope,
    private val repository: PostRepository,
    private val list: MutableStateFlow<PostPageListState>,
    /** Le Prisme du lecteur, lu au geste : l'aperçu de citation sert le texte de la carte (#16001). */
    private val reader: () -> LanguageResolver.ContentLanguagePreferences?,
    /** Le canal des issues, partagé avec les autres gestes de la liste ([ListedPostActions]) : une seule issue dite à la fois. */
    private val notices: MutableStateFlow<FeedNotice?> = MutableStateFlow(null),
) {
    private val _quoteComposer = MutableStateFlow<QuoteComposerState?>(null)
    val quoteComposer: StateFlow<QuoteComposerState?> = _quoteComposer.asStateFlow()

    val notice: StateFlow<FeedNotice?> = notices.asStateFlow()

    private val inFlight = mutableSetOf<String>()

    fun repost(postId: String) {
        val card = list.value.posts.firstOrNull { it.id == postId } ?: return
        send(postId, RepostCommand.of(postId, card.repostOf, quote = false, commentary = null, cardType = card.type))
    }

    fun beginQuote(postId: String) {
        val card = list.value.posts.firstOrNull { it.id == postId } ?: return
        _quoteComposer.value = QuoteComposerState.quoting(card, reader())
    }

    fun onQuoteTextChange(text: String) {
        _quoteComposer.update { it?.copy(text = text) }
    }

    fun cancelQuote() {
        _quoteComposer.value = null
    }

    fun submitQuote() {
        val composer = _quoteComposer.value ?: return
        _quoteComposer.value = null
        val card = list.value.posts.firstOrNull { it.id == composer.postId } ?: return
        send(card.id, RepostCommand.of(card.id, card.repostOf, quote = true, commentary = composer.text, cardType = card.type))
    }

    fun consumeNotice() {
        notices.value = null
    }

    private fun send(cardId: String, command: RepostCommand) {
        if (!inFlight.add(cardId)) return
        val before = list.value
        list.update { it.reposted(cardId) }
        scope.launch {
            val confirmed = try {
                repository.repost(
                    command.targetId,
                    targetType = command.targetType,
                    content = command.content,
                    isQuote = command.isQuote,
                ) is NetworkResult.Success
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                false
            }
            inFlight.remove(cardId)
            if (!confirmed) list.update { it.repostRefused(cardId, before) }
            notices.value = if (confirmed) FeedNotice.REPOSTED else FeedNotice.REPOST_FAILED
        }
    }
}
