package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.serialization.TolerantSerializer

/**
 * Le participant nommé par `participant:role-updated` (miroir de `ParticipantRoleUpdatedParticipantInfo`, iOS).
 *
 * `role` est le rôle GLOBAL (`USER|ADMIN|…`), `conversationRole` le rang de conversation. Tout est facultatif :
 * le bloc entier peut valoir `null` et ne doit jamais jeter l'événement, dont `userId` et `newRole` suffisent.
 */
@Serializable
data class ParticipantRoleUpdatedParticipantInfo(
    val id: String? = null,
    val role: String? = null,
    val conversationRole: String? = null,
    val displayName: String? = null,
    val userId: String? = null,
)

internal object TolerantRoleParticipantSerializer :
    KSerializer<ParticipantRoleUpdatedParticipantInfo?> by TolerantSerializer(ParticipantRoleUpdatedParticipantInfo.serializer())

/**
 * `friend-request:cancelled` — signal temps réel PUR (aucune ligne `Notification`). Émis à la room de l'AUTRE
 * partie : [cancelledBy] désigne par construction l'interlocuteur, jamais le lecteur, que la demande ait été
 * émise ou reçue.
 */
@Serializable
data class FriendRequestCancelledEvent(
    val friendRequestId: String? = null,
    val cancelledBy: String,
)

/**
 * `friend-request:rejected` — émis à la room de l'EXPÉDITEUR d'origine : c'est donc sa demande ENVOYÉE qu'il
 * faut vider. `senderId` ne sert qu'à router l'émission côté passerelle ; il n'est jamais lu.
 */
@Serializable
data class FriendRequestRejectedEvent(
    val friendRequestId: String? = null,
    val senderId: String? = null,
    val rejecterId: String,
)
