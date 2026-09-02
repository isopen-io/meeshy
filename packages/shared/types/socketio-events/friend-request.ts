/**
 * Le domaine FRIEND-REQUEST : demande émise, acceptée, refusée, annulée.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Payload de `FRIEND_REQUEST_CANCELLED` — émis à l'user-room de l'AUTRE
 * partie (pas l'auteur de l'action) lors d'un `DELETE /friend-requests/:id`.
 */
export interface FriendRequestCancelledEventData {
  readonly friendRequestId: string;
  readonly cancelledBy: string; // userId de qui a déclenché la suppression
}

/**
 * Payload de `FRIEND_REQUEST_NEW` — émis à l'user-room du DESTINATAIRE
 * lors d'un `POST /friend-requests`.
 */
export interface FriendRequestNewEventData {
  readonly friendRequestId: string;
  readonly senderId: string;
  readonly receiverId: string;
}

/**
 * Payload de `FRIEND_REQUEST_ACCEPTED` — émis à l'user-room de l'EXPÉDITEUR
 * original lors d'un `PATCH /friend-requests/:id` avec `status=accepted`.
 */
export interface FriendRequestAcceptedEventData {
  readonly friendRequestId: string;
  readonly accepterId: string;
  readonly conversationId?: string;
}

/**
 * Payload de `FRIEND_REQUEST_REJECTED` — émis à l'user-room de l'EXPÉDITEUR
 * original lors d'un `PATCH /friend-requests/:id` avec `status=rejected`.
 */
export interface FriendRequestRejectedEventData {
  readonly friendRequestId: string;
  readonly rejecterId: string;
}
