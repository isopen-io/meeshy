package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** A friend request — port of FriendRequest (FriendModels.swift). */
@Serializable
data class FriendRequest(
    val id: String,
    val senderId: String = "",
    val receiverId: String = "",
    val message: String? = null,
    val status: String = "",
    val sender: FriendRequestUser? = null,
    val receiver: FriendRequestUser? = null,
    val respondedAt: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/**
 * A user attached to a friend request — port of FriendRequestUser (FriendModels.swift).
 *
 * [profileDecor] is the avatar ring / banner / frame the person equipped, served WITH
 * the request (iOS `ServedProfileDecor`, #10945). It is carried as the raw
 * [JsonElement] on purpose: the typed decor model belongs to the profile-decor lot,
 * and the contract here is only the tolerance iOS pins — absent (old gateway, nothing
 * equipped) is `null`, and a malformed block can never sink the request that carries
 * it. Any JSON shape decodes; whoever renders the ring reads it defensively.
 */
@Serializable
data class FriendRequestUser(
    val id: String,
    val username: String = "",
    val firstName: String? = null,
    val lastName: String? = null,
    val displayName: String? = null,
    val avatar: String? = null,
    val isOnline: Boolean? = null,
    val lastActiveAt: String? = null,
    val profileDecor: JsonElement? = null,
)

@Serializable
data class SendFriendRequest(
    val receiverId: String,
    val message: String? = null,
)

/**
 * The OLD body `{ status }` the three legacy aliases still serve. It only says two of
 * the four gestures; the canonical route carries an action ([FriendRequestActionBody]).
 * Kept for the backward-compatible fallback while installed gateways drain.
 */
@Serializable
data class RespondFriendRequest(
    val status: String,
)

/**
 * The four gestures of `PATCH /directory/friend-requests/{id}` — one verb, one body
 * (port of the iOS `FriendRequestAction`, #4162). `accept` / `reject` belong to the
 * RECEIVER, `cancel` to the SENDER, `dismiss` to either party; the last two delete
 * the row. [wire] is the exact value the gateway's enum expects.
 */
enum class FriendRequestAction(val wire: String) {
    Accept("accept"),
    Reject("reject"),
    Cancel("cancel"),
    Dismiss("dismiss"),
    ;

    /** The canonical request body for this gesture. */
    fun body(): FriendRequestActionBody = FriendRequestActionBody(action = wire)

    companion object {
        /** The answer to a RECEIVED request: accept it or refuse it. */
        fun responding(accepted: Boolean): FriendRequestAction = if (accepted) Accept else Reject
    }
}

/** The body of `PATCH /directory/friend-requests/{id}`: `{ "action": "accept" }`. */
@Serializable
data class FriendRequestActionBody(
    val action: String,
)

/**
 * What `cancel` / `dismiss` answer: the row is GONE, there is no request left to
 * decode. Every field is optional so a server success can never turn into a client
 * failure by being stricter than the gateway (the deletion shipped `{ id, deleted,
 * message }`, port of the iOS `FriendRequestActionResult`).
 */
@Serializable
data class FriendRequestActionResult(
    val id: String? = null,
    val deleted: Boolean? = null,
    val message: String? = null,
)

/**
 * Which side of a request a listing reads (port of the iOS `FriendRequestDirection`).
 * [Received] and [Sent] return one side; [Any] returns both, whoever initiated — the
 * only way to see an accepted relation where the current user was the RECEIVER.
 */
enum class FriendRequestDirection(val wire: String) {
    Received("received"),
    Sent("sent"),
    Any("any"),
}

/**
 * One page of a cursor-read friend-request listing. [nextCursor] is `null` on the last
 * page; [hasMore] is the gateway's own verdict (a missing verdict reads as "no more",
 * never as "ask again" — re-asking a cursor that never advances would loop).
 */
data class FriendRequestPage(
    val requests: List<FriendRequest>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

@Serializable
data class EmailInvitationRequest(
    val email: String,
)

@Serializable
data class EmailInvitationResponse(
    val email: String = "",
    val sentAt: String? = null,
)
