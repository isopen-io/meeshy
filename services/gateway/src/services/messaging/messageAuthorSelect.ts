/**
 * Le compte de l'AUTEUR d'un message neuf, tel que `message:new` le sert
 * (`socketio/messageNewPayload.ts`, `buildSenderPayload`).
 *
 * `equippedAvatarRing` (#10713) n'est jamais servi brut : `buildSenderPayload`
 * le résout au registre en `profileDecor.avatarRing`, la forme de `/me`. Il
 * voyage dans la jointure que la création fait déjà : aucune lecture de plus.
 */
export const MESSAGE_AUTHOR_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  firstName: true,
  lastName: true,
  avatar: true,
  equippedAvatarRing: true,
} as const;
