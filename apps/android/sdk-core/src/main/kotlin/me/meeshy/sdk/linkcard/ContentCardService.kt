package me.meeshy.sdk.linkcard

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.link.TrackedLinkRepository
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardMemory
import me.meeshy.sdk.model.contentcard.ContentCardProjection
import me.meeshy.sdk.model.contentcard.ContentCardResolution
import me.meeshy.sdk.model.contentcard.ContentLinkCardState
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository

/**
 * **La carte VIVANTE d'un lien de contenu (#19331)** — un post, un réel, une story ou une humeur lus en direct sous
 * l'audience du lecteur (`GET /posts/:id`), au lieu de l'aperçu Open Graph. Miroir d'iOS `ContentCardService`.
 *
 * Cache d'abord ([ContentCardMemory], frais 60 s, périmé servi 24 h) : une carte connue se peint à sa première image
 * ([initial]) et se revalide en silence ([states]) ; à froid, tout post déjà connu de l'appareil (fil, détail lu,
 * disque) amorce la carte avant le réseau. Un refus (403, 404, 410) est un verdict qui se garde ; une panne n'efface
 * rien. Un lien suivi se résout une fois (`/tracking-links/:token/resolve`, sans compter de clic) et sa cible se garde :
 * un jeton ne change jamais de cible. Le texte descend le Prisme du lecteur connecté.
 */
@Singleton
class ContentCardService internal constructor(
    private val posts: PostRepository,
    private val trackedLinks: TrackedLinkRepository,
    private val session: SessionRepository,
    private val clock: CacheClock,
) : PerAccountCache {
    @Inject
    constructor(posts: PostRepository, trackedLinks: TrackedLinkRepository, session: SessionRepository) :
        this(posts, trackedLinks, session, SystemCacheClock)

    private val memory = MutableStateFlow(ContentCardMemory())

    /** Ce qu'on sait de la cible d'un lien suivi : un contenu, rien de tel (verdict), ou rien (panne). */
    private sealed interface Found {
        data class Content(val target: ContentLinkTarget.Content) : Found
        data object NotContent : Found
        data object Failed : Found
    }

    /** Ce que l'appareil sait déjà de [target], sans réseau ni attente : l'état de la première image. */
    fun initial(target: ContentLinkTarget): ContentLinkCardState {
        val content = when (target) {
            is ContentLinkTarget.Content -> target
            is ContentLinkTarget.Tracked -> when (val known = memory.value.token(target.token)) {
                is ContentCardMemory.TokenLookup.Known -> known.target ?: return ContentLinkCardState.NotContent
                ContentCardMemory.TokenLookup.Unknown -> return ContentLinkCardState.Loading
            }
        }
        val project = projection(content.type)
        val remembered = ContentLinkCardState.remembered(memory.value.lookup(content.postId, clock.nowMillis()), project, content.type)
        if (remembered != ContentLinkCardState.Loading) return remembered
        return posts.cachedPost(content.postId)?.let { ContentLinkCardState.Card(project(it)) } ?: remembered
    }

    /** L'état de la carte de [target] : ce que l'appareil sait d'abord, puis la relecture silencieuse. Froid. */
    fun states(target: ContentLinkTarget): Flow<ContentLinkCardState> = flow {
        when (val found = contentOf(target)) {
            is Found.Content -> emitCard(found.target)
            Found.NotContent -> emit(ContentLinkCardState.NotContent)
            Found.Failed -> emit(ContentLinkCardState.Failed)
        }
    }

    /** Le toucher d'une carte de lien SUIVI compte un clic, comme l'ouverture de ce lien par le routeur ; au mieux. */
    suspend fun recordOpen(target: ContentLinkTarget) {
        if (target is ContentLinkTarget.Tracked) trackedLinks.recordClick(target.token)
    }

    /** Au changement de compte : le compte B ne voit jamais un post servi sous l'audience du compte A. */
    override suspend fun clear() {
        memory.value = ContentCardMemory()
    }

    private suspend fun FlowCollector<ContentLinkCardState>.emitCard(content: ContentLinkTarget.Content) {
        val project = projection(content.type)
        val shown = when (val lookup = memory.value.lookup(content.postId, clock.nowMillis())) {
            is ContentCardMemory.Lookup.Fresh -> {
                emit(ContentLinkCardState.remembered(lookup, project, content.type))
                return
            }
            is ContentCardMemory.Lookup.Stale -> ContentLinkCardState.remembered(lookup, project, content.type)
            ContentCardMemory.Lookup.Missing ->
                posts.knownPost(content.postId)?.let { ContentLinkCardState.Card(project(it)) } ?: ContentLinkCardState.Loading
        }
        emit(shown)
        emit(revalidated(content, shown, project))
    }

    private suspend fun revalidated(
        content: ContentLinkTarget.Content,
        shown: ContentLinkCardState,
        project: (ApiPost) -> ContentCard,
    ): ContentLinkCardState {
        val resolution = when (val result = posts.getPost(content.postId)) {
            is NetworkResult.Success -> ContentCardResolution.Served(result.data)
            is NetworkResult.Failure -> ContentCardResolution.ofRefusal(result.error.httpStatus) ?: return shown.failed()
        }
        memory.update { it.storing(content.postId, resolution, clock.nowMillis()) }
        return shown.resolved(resolution, project, content.type)
    }

    private suspend fun contentOf(target: ContentLinkTarget): Found = when (target) {
        is ContentLinkTarget.Content -> Found.Content(target)
        is ContentLinkTarget.Tracked -> when (val known = memory.value.token(target.token)) {
            is ContentCardMemory.TokenLookup.Known -> known.target?.let { Found.Content(it) } ?: Found.NotContent
            ContentCardMemory.TokenLookup.Unknown -> resolveToken(target.token)
        }
    }

    private suspend fun resolveToken(token: String): Found {
        val content = when (val result = trackedLinks.resolve(token)) {
            is NetworkResult.Success -> ContentLinkTarget.ofResolved(result.data)
            is NetworkResult.Failure -> if (result.error.httpStatus in UNKNOWN_TOKEN) null else return Found.Failed
        }
        memory.update { it.storingToken(token, content) }
        return content?.let { Found.Content(it) } ?: Found.NotContent
    }

    private fun projection(linkType: PostType?): (ApiPost) -> ContentCard =
        { post -> ContentCardProjection.of(post, session.currentUser.value, linkType) }

    private companion object {
        /** Un jeton que le serveur ne connaît pas (ou plus) : ce lien ne désigne aucun contenu. */
        val UNKNOWN_TOKEN = setOf(404, 410)
    }
}
