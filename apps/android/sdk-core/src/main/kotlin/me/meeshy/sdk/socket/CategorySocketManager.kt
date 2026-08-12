package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CategoriesReorderedSocketData
import me.meeshy.sdk.model.CategoryDeletedSocketData
import me.meeshy.sdk.model.CategoryEvent
import me.meeshy.sdk.model.CategoryUpsertedSocketData
import me.meeshy.sdk.model.toEvent
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bridges the user's conversation-category Socket.IO broadcasts to a single
 * [CategoryEvent] stream — the framework-free equivalent of iOS
 * `ConversationStoreSocketBridge` routing `category:created/updated/deleted` +
 * `categories:reordered` into `UserCategoryStore.applyRemote`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Store/ConversationStoreSocketBridge.swift`).
 *
 * SOTA note: iOS exposes four separate Combine subjects that the bridge re-fans
 * back into one `applyRemote`. Android collapses the fan-in here — every broadcast
 * decodes to its wire payload, maps through the pure `toEvent()` port, and emerges
 * on one [categoryEvents] flow the catalogue owner folds with `UserCategoryCatalog.apply`.
 * A malformed payload is logged and dropped, never crashing the socket callback.
 */
@Singleton
class CategorySocketManager @Inject constructor(
    private val socketManager: SocketManager,
    private val json: Json,
) {
    private val _categoryEvents = MutableSharedFlow<CategoryEvent>(replay = 0, extraBufferCapacity = 64)

    /** The unified real-time category-change stream (created/updated/deleted/reordered). */
    val categoryEvents: SharedFlow<CategoryEvent> = _categoryEvents.asSharedFlow()

    fun attach() {
        listen<CategoryUpsertedSocketData>("category:created") { it.toEvent() }
        listen<CategoryUpsertedSocketData>("category:updated") { it.toEvent() }
        listen<CategoryDeletedSocketData>("category:deleted") { it.toEvent() }
        listen<CategoriesReorderedSocketData>("categories:reordered") { it.toEvent() }
    }

    private inline fun <reified T> listen(event: String, crossinline toEvent: (T) -> CategoryEvent) {
        socketManager.on(event) { args ->
            runCatching {
                val raw = (args.firstOrNull() as? JSONObject)?.toString() ?: return@on
                _categoryEvents.tryEmit(toEvent(json.decodeFromString<T>(raw)))
            }.onFailure { Timber.e(it, "Socket decode error [$event]: ${T::class.simpleName}") }
        }
    }
}
