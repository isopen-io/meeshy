package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CategoriesReorderedSocketData
import me.meeshy.sdk.model.CategoryDeletedSocketData
import me.meeshy.sdk.model.CategoryEvent
import me.meeshy.sdk.model.CategoryUpsertedSocketData
import me.meeshy.sdk.model.toEvent
import kotlinx.serialization.serializer
import kotlinx.coroutines.Dispatchers
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
    private val router: SocketEventRouter,
) {
    internal constructor(
        socketManager: SocketManager,
        json: Json,
    ) : this(
        socketManager, json,
        SocketEventRouter(SocketEventRegistrar { event, callback -> socketManager.on(event, callback) }, Dispatchers.Default),
    )

    private val _categoryEvents = SocketInboundRoute.subject<CategoryEvent>()

    /** The unified real-time category-change stream (created/updated/deleted/reordered). */
    val categoryEvents: SharedFlow<CategoryEvent> = _categoryEvents.asSharedFlow()

    fun attach() {
        router.install(
            listOf(
                upsert(SocketEventNames.CATEGORY_CREATED),
                upsert(SocketEventNames.CATEGORY_UPDATED),
                SocketInboundRoute.decoding<CategoryDeletedSocketData>(SocketEventNames.CATEGORY_DELETED, json, serializer()) {
                    _categoryEvents.tryEmit(it.toEvent())
                },
                SocketInboundRoute.decoding<CategoriesReorderedSocketData>(SocketEventNames.CATEGORIES_REORDERED, json, serializer()) {
                    _categoryEvents.tryEmit(it.toEvent())
                },
            ),
        )
    }

    private fun upsert(event: String): SocketInboundRoute =
        SocketInboundRoute.decoding<CategoryUpsertedSocketData>(event, json, serializer()) {
            _categoryEvents.tryEmit(it.toEvent())
        }
}
