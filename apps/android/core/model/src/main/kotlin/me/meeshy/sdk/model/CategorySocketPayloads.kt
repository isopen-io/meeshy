package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Wire payload of `category:created` / `category:updated` — the gateway
 * `CategoryCreatedEventData` / `CategoryUpdatedEventData` (`packages/shared/types/socketio-events.ts`),
 * mirroring iOS `CategorySocketEvent` (`MessageSocketManager.swift`).
 *
 * The nested [category] decodes straight into [ApiCategory]; the gateway-only keys
 * (`userId`, `createdAt`, `updatedAt` inside the category object) are ignored by the
 * lenient socket decoder, exactly as iOS decodes into `ConversationCategory`.
 */
@Serializable
data class CategoryUpsertedSocketData(
    val userId: String,
    val category: ApiCategory,
)

/**
 * Wire payload of `category:deleted` — the gateway `CategoryDeletedEventData`,
 * mirroring iOS `CategoryDeletedSocketEvent`.
 */
@Serializable
data class CategoryDeletedSocketData(
    val userId: String,
    val categoryId: String,
)

/** A single row of a `categories:reordered` batch (id → new display rank). */
@Serializable
data class CategoryOrderUpdate(
    val categoryId: String,
    val order: Int,
)

/**
 * Wire payload of `categories:reordered` — the gateway `CategoriesReorderedEventData`,
 * mirroring iOS `CategoriesReorderedSocketEvent`.
 */
@Serializable
data class CategoriesReorderedSocketData(
    val userId: String,
    val updates: List<CategoryOrderUpdate>,
)

/**
 * Maps a `category:created` / `category:updated` payload to an [CategoryEvent.Upserted],
 * narrowing the wire row to the [CategoryOption] the catalogue reducer keeps (iOS
 * collapses `.created` / `.updated` into one upsert — see [CategoryEvent]).
 */
fun CategoryUpsertedSocketData.toEvent(): CategoryEvent = CategoryEvent.Upserted(category.toOption())

/** Maps a `category:deleted` payload to a [CategoryEvent.Deleted]. */
fun CategoryDeletedSocketData.toEvent(): CategoryEvent = CategoryEvent.Deleted(categoryId)

/**
 * Maps a `categories:reordered` payload to a [CategoryEvent.Reordered]. A repeated id
 * keeps the last order (last-writer-wins, mirroring the map the catalogue reducer
 * applies); an empty batch yields an empty, inert event.
 */
fun CategoriesReorderedSocketData.toEvent(): CategoryEvent =
    CategoryEvent.Reordered(updates.associate { it.categoryId to it.order })
