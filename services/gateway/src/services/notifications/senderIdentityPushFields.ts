/**
 * Les quatre clés `data` qui NOMMENT ou MONTRENT l'acteur sur le fil APNs/FCM :
 * nom affiché, pseudo, avatar et `imageURL` (l'avatar sert aussi de vignette).
 * La NSE iOS en fait un `INSendMessageIntent` — nom et photo sur l'écran
 * verrouillé — et le titre `'Meeshy'` de `showSenderName:false` ne masque rien
 * tant que ces clés voyagent à côté.
 *
 * Site UNIQUE de la règle : sous `showSenderName:false`, les quatre partent
 * VIDES. `senderId` reste (routage au tap, jamais affiché) et la FORME de la
 * charge ne change pas — une ancienne NSE retombe sur « Meeshy » sans avatar
 * au lieu de planter (#18910).
 */
export type PushActorIdentity = {
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
};

export type SenderIdentityPushFields = {
  readonly senderUsername: string;
  readonly senderDisplayName: string;
  readonly senderAvatar: string;
  readonly imageURL: string;
};

export function senderIdentityPushFields(params: {
  readonly actor: PushActorIdentity | undefined;
  readonly showSenderName: boolean;
}): SenderIdentityPushFields {
  const { actor, showSenderName } = params;
  if (!showSenderName) return { senderUsername: '', senderDisplayName: '', senderAvatar: '', imageURL: '' };
  return {
    senderUsername: actor?.username || '',
    senderDisplayName: actor?.displayName || '',
    senderAvatar: actor?.avatar || '',
    imageURL: actor?.avatar || '',
  };
}
