package me.meeshy.sdk.outbox

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Payload of a `CREATE_CONVERSATION` outbox row (#15179, iOS `CreateConversationPayload`). The row's `targetId` is the
 * optimistic conversation's `pending_<uuid>` id, its `cmid` the idempotency key sent as `X-Client-Mutation-Id` — a replay
 * after a lost acknowledgement finds the conversation the first attempt created instead of making a second one.
 * [encryptionMode] is `null` when the screen offered no choice (the gateway then picks Server).
 */
@Serializable
public data class CreateConversationPayload(
    val type: String,
    val title: String? = null,
    val participantIds: List<String>,
    val encryptionMode: String? = null,
)

/**
 * Payload of an `UPDATE_CONVERSATION` outbox row: only the fields the user changed. A field left `null` is omitted from
 * the wire (the shared encoder drops nulls), so [OutboxCoalescer] merges queued writes key by key, the last one winning.
 */
@Serializable
public data class UpdateConversationPayload(
    val title: String? = null,
    val description: String? = null,
    val avatar: String? = null,
)

/**
 * Payload of a `SETTINGS_ACTION` outbox row (#15179, iOS `SettingsActionQueue`): any account setting that is one HTTP call.
 * [method] is `POST` | `PUT` | `PATCH`, [endpoint] a path relative to the API base, [body] the JSON sent. The row's
 * `targetId` is `OutboxSentinelTargets.settingsAction(method, endpoint)`: two writes to the same couple merge their bodies
 * key by key, two different endpoints stay in arrival order.
 */
@Serializable
public data class SettingsActionPayload(
    val method: String,
    val endpoint: String,
    val body: JsonObject = JsonObject(emptyMap()),
)
