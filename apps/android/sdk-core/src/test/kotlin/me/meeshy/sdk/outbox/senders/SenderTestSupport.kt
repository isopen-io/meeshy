package me.meeshy.sdk.outbox.senders

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxState

internal val senderJson: Json = MeeshyApi.json

internal fun outboxRow(
    kind: OutboxKind,
    targetId: String = "target-1",
    payload: String = "{}",
    cmid: String = "cmid-1",
    lane: String = "lane",
): OutboxEntity = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind.name,
    targetId = targetId,
    payload = payload,
    dependsOn = null,
    attempts = 0,
    state = OutboxState.PENDING.name,
    createdAt = 0L,
    updatedAt = 0L,
)

internal inline fun <reified P> encodedPayload(payload: P): String = senderJson.encodeToString(payload)

internal fun <T> accepted(data: T): ApiResponse<T> = ApiResponse(success = true, data = data)

internal fun <T> refused(): ApiResponse<T> = ApiResponse(success = false, error = "refused")
