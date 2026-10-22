package me.meeshy.app.feed

import android.content.Context
import android.media.MediaMetadataRetriever
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import coil.imageLoader
import coil.memory.MemoryCache
import coil.request.ImageRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor

/** Clé mémoire Coil de la première frame extraite d'une vidéo sans vignette. */
internal fun videoFrameCacheKey(videoUrl: String): String = "thumb:$videoUrl"

/**
 * Le préchargement réel : images et vignettes par Coil (cache disque + mémoire),
 * première frame d'une vidéo sans vignette par `MediaMetadataRetriever` posée dans
 * le cache mémoire de Coil. Le fichier audio attend le cache média : couture inerte.
 */
internal class CoilFeedMediaFetcher(private val context: Context) : FeedMediaFetcher {
    override suspend fun fetch(target: FeedPrefetchTarget) {
        when (target) {
            is FeedPrefetchTarget.Image ->
                context.imageLoader.execute(ImageRequest.Builder(context).data(target.url).build())
            is FeedPrefetchTarget.VideoFrame -> cacheVideoFrame(target.url)
            is FeedPrefetchTarget.Audio -> Unit
        }
    }

    private suspend fun cacheVideoFrame(url: String) {
        val cache = context.imageLoader.memoryCache ?: return
        val key = MemoryCache.Key(videoFrameCacheKey(url))
        if (cache[key] != null) return
        val frame = withContext(Dispatchers.IO) {
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(url, emptyMap())
                retriever.getFrameAtTime(0L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            } finally {
                retriever.release()
            }
        } ?: return
        cache[key] = MemoryCache.Value(frame)
    }
}

/** Possède le préchargeur le temps de l'écran du fil. */
@HiltViewModel
class FeedMediaPrefetchViewModel @Inject constructor(
    @ApplicationContext context: Context,
    network: NetworkConditionMonitor,
    preferences: MediaDownloadPreferencesStore,
) : ViewModel() {
    @Volatile private var posts: List<FeedPostPresentation> = emptyList()

    private val prefetcher = FeedMediaPrefetcher(
        posts = { posts },
        network = network,
        preferences = preferences,
        fetcher = CoilFeedMediaFetcher(context),
        scope = viewModelScope,
    )

    fun onPostsChanged(current: List<FeedPostPresentation>) {
        posts = current
    }

    fun onRowVisible(postId: String) = prefetcher.onRowVisible(postId)

    fun prefetchFromTop() = prefetcher.prefetchAround(0)

    override fun onCleared() = prefetcher.cancel()
}

/** Branche le défilement du fil sur le préchargeur ; ne rend rien. */
@Composable
internal fun FeedMediaPrefetchEffect(listState: LazyListState, posts: List<FeedPostPresentation>) {
    val viewModel: FeedMediaPrefetchViewModel = hiltViewModel()
    val current by rememberUpdatedState(posts)
    LaunchedEffect(posts) { viewModel.onPostsChanged(posts) }
    LaunchedEffect(posts.isNotEmpty()) { if (posts.isNotEmpty()) viewModel.prefetchFromTop() }
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index -> current.getOrNull(index)?.let { viewModel.onRowVisible(it.id) } }
    }
}
