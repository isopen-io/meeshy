package me.meeshy.ui.component

import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.EmojiCatalogSnapshot

/**
 * Builds the picker's [EmojiCatalogSnapshot] (ten categories plus the folded search index)
 * on [dispatcher] — never on the caller's thread — and keeps the result: the first open
 * pays for it, every other open reads it.
 *
 * Concurrent first callers wait on one build rather than racing several.
 */
public class EmojiCatalogLoader(
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val build: () -> EmojiCatalogSnapshot = { EmojiCatalogSnapshot.build() },
) {
    @Volatile
    private var memo: EmojiCatalogSnapshot? = null
    private val gate = Mutex()

    /** The snapshot if it was already built, so a re-opened picker paints without waiting. */
    public val loaded: EmojiCatalogSnapshot?
        get() = memo

    public suspend fun load(): EmojiCatalogSnapshot {
        memo?.let { return it }
        return gate.withLock {
            memo ?: withContext(dispatcher) { build() }.also { memo = it }
        }
    }

    public companion object {
        /** The loader every picker in the process shares. */
        public val shared: EmojiCatalogLoader by lazy { EmojiCatalogLoader() }
    }
}

/**
 * The catalog for a composition: the memoized value at once when it exists, else `null`
 * until [loader] has built it off the main thread (the picker draws its frame meanwhile).
 */
@Composable
public fun rememberEmojiCatalog(loader: EmojiCatalogLoader = EmojiCatalogLoader.shared): EmojiCatalogSnapshot? =
    produceState(initialValue = loader.loaded, loader) { value = loader.load() }.value
